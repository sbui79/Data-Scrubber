import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { decryptField, encryptField, fieldAad } from "@privatepath/crypto";
import type { Prisma, RequestStatus } from "@privatepath/db";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { getUserDek, requireUser } from "./users";
import { canTransition, DRAFTABLE, USER_SETTABLE } from "./state";
import { buildDraft, DATA_CATEGORIES, last4, type DataCategory } from "./templates";
import { validateListingUrl } from "./urls";
import { getProfile } from "./profile";

const TABLE = "RemovalRequest";
const sealStr = (dek: Buffer, col: string, id: string, v: string) =>
  new Uint8Array(encryptField(dek, v, fieldAad(TABLE, col, id)));
const openStr = (dek: Buffer, col: string, id: string, b: Uint8Array | null) =>
  b ? decryptField(dek, Buffer.from(b), fieldAad(TABLE, col, id)) : null;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const DAY = 86_400_000;

const RequestType = z.enum(["OPT_OUT", "DELETION", "CORRECTION", "SUPPRESSION", "FOLLOW_UP"]);
const Categories = z.array(z.enum(Object.keys(DATA_CATEGORIES) as [DataCategory, ...DataCategory[]])).max(8);

export const CreateRequestInput = z.object({
  sourceId: z.string().min(1).max(100),
  requestType: RequestType,
  listingReviewId: z.string().min(1).max(100).optional(),
});
export const PatchRequestInput = z.object({
  status: z.enum(USER_SETTABLE as [RequestStatus, ...RequestStatus[]]).optional(),
  notes: z.string().max(5000).nullable().optional(),
  confirmationReference: z.string().max(200).nullable().optional(),
  listingUrl: z.string().max(2048).optional(),
  confirmOwnership: z.boolean().optional(),
  followUpAt: z.coerce.date().nullable().optional(),
  expectedResponseAt: z.coerce.date().nullable().optional(),
});
export const DraftInput = z.object({
  confirmOwnData: z.literal(true),
  dataCategories: Categories.default([]),
  includeFullName: z.boolean().default(true),
  includeEmail: z.boolean().default(false),
  /** Index into the profile's phone list; only the last 4 digits are ever used. */
  phoneIndex: z.number().int().min(0).max(4).optional(),
});
export const ApproveInput = z.object({ confirmOwnData: z.literal(true), draftHash: z.string().length(64) });
export const SubmitInput = z.object({
  method: z.enum(["web_form", "email", "mail"]),
  submittedAt: z.coerce.date().optional(),
  expectedResponseDays: z.number().int().min(1).max(120).default(30),
});

type ReqRow = Prisma.RemovalRequestGetPayload<{ include: { source: true; history: true; evidence: true } }>;

function view(dek: Buffer, r: ReqRow) {
  const draftJson = openStr(dek, "encryptedDraftContent", r.id, r.encryptedDraftContent);
  const draft = draftJson ? (JSON.parse(draftJson) as { subject: string; body: string }) : null;
  return {
    id: r.id, sourceId: r.sourceId, sourceName: r.source.name, requestType: r.requestType, status: r.status,
    listingUrl: openStr(dek, "encryptedListingUrl", r.id, r.encryptedListingUrl),
    notes: openStr(dek, "encryptedNotes", r.id, r.encryptedNotes),
    confirmationReference: openStr(dek, "encryptedConfirmationReference", r.id, r.encryptedConfirmationReference),
    draft, draftHash: draftJson ? sha(draftJson) : null, approved: r.userApprovedAt !== null,
    userApprovedAt: r.userApprovedAt, userSubmittedAt: r.userSubmittedAt, expectedResponseAt: r.expectedResponseAt,
    followUpAt: r.followUpAt, completedAt: r.completedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
    history: [...r.history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt })),
    evidence: r.evidence.filter((e) => !e.deletedAt).map((e) => ({ id: e.id, contentType: e.contentType, sizeBytes: e.sizeBytes, uploadedAt: e.uploadedAt })),
  };
}

const INCLUDE = { source: true, history: true, evidence: true } as const;

async function load(deps: Deps, userId: string, id: string): Promise<ReqRow> {
  // Ownership is part of the query: another user's id is indistinguishable from a missing one.
  const r = await deps.db.removalRequest.findFirst({ where: { id, userId }, include: INCLUDE });
  if (!r) throw new AppError(404, "request_not_found", "Request not found.");
  return r;
}

async function reload(deps: Deps, userId: string, id: string) {
  return view(await getUserDek(deps, userId), await load(deps, userId, id));
}

/** Atomically moves a request to a new status (guarded on the current one), recording history and audit. */
async function moveStatus(tx: Prisma.TransactionClient, deps: Deps, ctx: RequestContext, userId: string, r: { id: string; status: RequestStatus },
  to: RequestStatus, data: Prisma.RemovalRequestUncheckedUpdateManyInput = {}) {
  if (r.status !== to && !canTransition(r.status, to)) throw new AppError(409, "invalid_transition", "That change isn't possible from the current status.");
  const res = await tx.removalRequest.updateMany({ where: { id: r.id, userId, status: r.status }, data: { ...data, status: to } });
  if (res.count !== 1) throw new AppError(409, "conflict", "This request changed in the meantime. Please reload and try again.");
  if (r.status !== to) {
    await tx.requestStatusHistory.create({ data: { requestId: r.id, fromStatus: r.status, toStatus: to } });
    await writeAudit(tx, deps, ctx, { actorUserId: userId, targetUserId: userId, eventType: "REQUEST_STATUS_CHANGED",
      entityType: TABLE, entityId: r.id, metadata: { fromStatus: r.status, toStatus: to } });
  }
}

export async function createRequest(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const input = CreateRequestInput.parse(raw);
  const user = await requireUser(deps, session);
  const source = await deps.db.source.findFirst({ where: { id: input.sourceId, publishedAt: { not: null }, sourceStatus: { not: "PENDING_REVIEW" } } });
  if (!source) throw new AppError(404, "source_not_found", "Source not found.");
  const dek = await getUserDek(deps, user.id);
  const id = randomUUID();
  let listingUrl: string | null = null;
  let status: RequestStatus = "NOT_STARTED";
  let listingReviewId: string | null = null;
  if (input.listingReviewId) {
    const lr = await deps.db.listingReview.findFirst({ where: { id: input.listingReviewId, userId: user.id, sourceId: source.id } });
    if (!lr) throw new AppError(404, "review_not_found", "Review not found.");
    listingReviewId = lr.id;
    if (lr.status === "FOUND") {
      status = "LISTING_FOUND";
      if (lr.encryptedListingUrl && lr.userConfirmedOwnershipAt) {
        listingUrl = decryptField(dek, Buffer.from(lr.encryptedListingUrl), fieldAad("ListingReview", "encryptedListingUrl", lr.id));
      }
    } else if (lr.status === "NOT_FOUND") status = "LISTING_NOT_FOUND";
  }
  await deps.db.$transaction(async (tx) => {
    await tx.removalRequest.create({ data: {
      id, userId: user.id, sourceId: source.id, listingReviewId, requestType: input.requestType, status,
      encryptedListingUrl: listingUrl ? sealStr(dek, "encryptedListingUrl", id, listingUrl) : null,
    } });
    await tx.requestStatusHistory.create({ data: { requestId: id, fromStatus: null, toStatus: status } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REQUEST_CREATED",
      entityType: TABLE, entityId: id, metadata: { sourceId: source.id, requestType: input.requestType, toStatus: status } });
  });
  return reload(deps, user.id, id);
}

export async function listRequests(deps: Deps, session: Session, status?: string) {
  const user = await requireUser(deps, session);
  const where: Prisma.RemovalRequestWhereInput = { userId: user.id };
  if (status) where.status = z.nativeEnum((await import("@privatepath/db")).RequestStatus).parse(status);
  const rows = await deps.db.removalRequest.findMany({ where, orderBy: { updatedAt: "desc" }, include: { source: true } });
  return rows.map((r) => ({ id: r.id, sourceId: r.sourceId, sourceName: r.source.name, requestType: r.requestType, status: r.status,
    followUpAt: r.followUpAt, updatedAt: r.updatedAt }));
}

export async function getRequest(deps: Deps, session: Session, id: string) {
  const user = await requireUser(deps, session);
  return reload(deps, user.id, id);
}

export async function patchRequest(deps: Deps, session: Session, id: string, raw: unknown, ctx: RequestContext = {}) {
  const p = PatchRequestInput.parse(raw);
  const user = await requireUser(deps, session);
  const r = await load(deps, user.id, id);
  const dek = await getUserDek(deps, user.id);
  const data: Prisma.RemovalRequestUncheckedUpdateManyInput = {};
  const fields: string[] = [];
  let target: RequestStatus = r.status;

  if (p.listingUrl !== undefined) {
    if (p.confirmOwnership !== true) throw new AppError(400, "ownership_required", "Please confirm this listing is your own information.");
    if (["SUBMITTED_BY_USER", "VERIFICATION_REQUESTED", "IN_PROGRESS", "FOLLOW_UP_DUE", "COMPLETED", "ARCHIVED"].includes(r.status)) {
      throw new AppError(409, "invalid_transition", "The listing link can't be changed after submission.");
    }
    const url = validateListingUrl(p.listingUrl, r.source.domain);
    data.encryptedListingUrl = sealStr(dek, "encryptedListingUrl", id, url);
    fields.push("listingUrl");
    // The draft contains the old link, so it and its approval are discarded.
    if (r.encryptedDraftContent) { data.encryptedDraftContent = null; data.userApprovedAt = null; }
    if (r.status === "DRAFT_READY" || r.status === "AWAITING_USER_ACTION") target = "LISTING_FOUND";
    if ((r.status === "NOT_STARTED" || r.status === "LISTING_NOT_FOUND") && !p.status) target = "LISTING_FOUND";
  }
  if (p.status && p.status !== r.status) target = p.status;
  if (target === "LISTING_FOUND" && (r.status === "DRAFT_READY" || r.status === "AWAITING_USER_ACTION")) {
    data.encryptedDraftContent = null; data.userApprovedAt = null;
  }
  if (target === "COMPLETED") data.completedAt = new Date();
  if (target === "LISTING_FOUND" && r.status === "COMPLETED") data.completedAt = null;
  if (p.notes !== undefined) { data.encryptedNotes = p.notes ? sealStr(dek, "encryptedNotes", id, p.notes) : null; fields.push("notes"); }
  if (p.confirmationReference !== undefined) {
    data.encryptedConfirmationReference = p.confirmationReference ? sealStr(dek, "encryptedConfirmationReference", id, p.confirmationReference) : null;
    fields.push("confirmationReference");
  }
  if (p.followUpAt !== undefined) { data.followUpAt = p.followUpAt; fields.push("followUpAt"); }
  if (p.expectedResponseAt !== undefined) { data.expectedResponseAt = p.expectedResponseAt; fields.push("expectedResponseAt"); }

  await deps.db.$transaction(async (tx) => {
    await moveStatus(tx, deps, ctx, user.id, r, target, data);
    if (fields.length) {
      await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REQUEST_UPDATED",
        entityType: TABLE, entityId: id, metadata: { fieldNames: fields } });
    }
  });
  return reload(deps, user.id, id);
}

export async function generateDraft(deps: Deps, session: Session, id: string, raw: unknown, ctx: RequestContext = {}) {
  const input = DraftInput.parse(raw);
  const user = await requireUser(deps, session);
  const r = await load(deps, user.id, id);
  if (!DRAFTABLE.includes(r.status)) throw new AppError(409, "invalid_transition", "A draft can't be created from the current status.");
  const dek = await getUserDek(deps, user.id);
  const profile = await getProfile(deps, session).catch(() => null);
  if (input.includeFullName && !profile) throw new AppError(409, "profile_required", "Please complete your profile first.");
  const phone = input.phoneIndex === undefined ? undefined : (profile?.phoneNumbers as string[] | undefined)?.[input.phoneIndex];
  if (input.phoneIndex !== undefined && !phone) throw new AppError(400, "invalid_input", "That phone number isn't in your profile.");
  const draft = buildDraft({
    requestType: r.requestType, dataCategories: input.dataCategories,
    fullName: input.includeFullName && profile ? `${profile.legalFirstName} ${profile.legalLastName}` : undefined,
    email: input.includeEmail ? user.email : undefined,
    phoneLast4: phone ? last4(phone) : undefined,
    listingUrl: openStr(dek, "encryptedListingUrl", id, r.encryptedListingUrl),
  });
  await deps.db.$transaction(async (tx) => {
    // Any (re)generation clears prior approval: the user must approve the exact new content.
    await moveStatus(tx, deps, ctx, user.id, r, "DRAFT_READY", { encryptedDraftContent: sealStr(dek, "encryptedDraftContent", id, JSON.stringify(draft)), userApprovedAt: null });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REQUEST_DRAFT_GENERATED",
      entityType: TABLE, entityId: id, metadata: { requestType: r.requestType } });
  });
  return reload(deps, user.id, id);
}

export async function approveRequest(deps: Deps, session: Session, id: string, raw: unknown, ctx: RequestContext = {}) {
  const input = ApproveInput.parse(raw);
  const user = await requireUser(deps, session);
  const r = await load(deps, user.id, id);
  const dek = await getUserDek(deps, user.id);
  const json = openStr(dek, "encryptedDraftContent", id, r.encryptedDraftContent);
  if (r.status !== "DRAFT_READY" || !json) throw new AppError(409, "invalid_transition", "There is no draft waiting for approval.");
  // The user approves exactly the content they were shown.
  if (sha(json) !== input.draftHash) throw new AppError(409, "draft_changed", "The draft changed. Please review the latest version.");
  await deps.db.$transaction(async (tx) => {
    await moveStatus(tx, deps, ctx, user.id, r, "AWAITING_USER_ACTION", { userApprovedAt: new Date() });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REQUEST_APPROVED", entityType: TABLE, entityId: id, metadata: {} });
  });
  return reload(deps, user.id, id);
}

/** The only way to get copy/download-ready content; refused until the user has approved it. */
export async function exportDraft(deps: Deps, session: Session, id: string, ctx: RequestContext = {}) {
  const user = await requireUser(deps, session);
  const r = await load(deps, user.id, id);
  const dek = await getUserDek(deps, user.id);
  const json = openStr(dek, "encryptedDraftContent", id, r.encryptedDraftContent);
  // Approval is cleared whenever the draft changes, so approved + present means the user saw this exact content.
  if (!json || !r.userApprovedAt) {
    throw new AppError(403, "approval_required", "Please review and approve the request before copying or downloading it.");
  }
  await deps.db.$transaction((tx) => writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id,
    eventType: "REQUEST_DRAFT_EXPORTED", entityType: TABLE, entityId: id, metadata: {} }));
  return JSON.parse(json) as { subject: string; body: string };
}

export async function markSubmitted(deps: Deps, session: Session, id: string, raw: unknown, ctx: RequestContext = {}) {
  const input = SubmitInput.parse(raw);
  const user = await requireUser(deps, session);
  const r = await load(deps, user.id, id);
  if (r.status !== "AWAITING_USER_ACTION" || !r.userApprovedAt) throw new AppError(409, "approval_required", "Please approve the request before recording that you submitted it.");
  const now = new Date();
  const submittedAt = input.submittedAt ?? now;
  if (submittedAt.getTime() > now.getTime() + 5 * 60_000) throw new AppError(400, "invalid_input", "The submission date can't be in the future.");
  if (submittedAt.getTime() < now.getTime() - 366 * DAY) throw new AppError(400, "invalid_input", "That submission date is too far in the past.");
  const expectedResponseAt = new Date(submittedAt.getTime() + input.expectedResponseDays * DAY);
  await deps.db.$transaction(async (tx) => {
    await moveStatus(tx, deps, ctx, user.id, r, "SUBMITTED_BY_USER", { userSubmittedAt: submittedAt, expectedResponseAt, followUpAt: expectedResponseAt });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REQUEST_SUBMISSION_RECORDED",
      entityType: TABLE, entityId: id, metadata: { format: input.method } });
  });
  return reload(deps, user.id, id);
}
