import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decryptField, encryptField, fieldAad } from "@privatepath/crypto";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { getUserDek, requireUser } from "./users";
import { validateListingUrl } from "./urls";

const Status = z.enum(["FOUND", "NOT_FOUND", "NOT_SURE"]);

export const CreateListingReview = z.object({
  sourceId: z.string().min(1).max(100),
  status: Status,
  listingUrl: z.string().max(2048).optional(),
  /** The user attests the listing is their own. Required whenever a URL is supplied. */
  confirmOwnership: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});
export const UpdateListingReview = CreateListingReview.omit({ sourceId: true }).partial();

const enc = (dek: Buffer, col: string, id: string, v: string) =>
  new Uint8Array(encryptField(dek, v, fieldAad("ListingReview", col, id)));
const dec = (dek: Buffer, col: string, id: string, b: Uint8Array | null) =>
  b ? decryptField(dek, Buffer.from(b), fieldAad("ListingReview", col, id)) : null;

async function view(deps: Deps, userId: string, row: { id: string; sourceId: string; status: string; encryptedListingUrl: Uint8Array | null;
  notesEncrypted: Uint8Array | null; userConfirmedOwnershipAt: Date | null; updatedAt: Date }) {
  const dek = await getUserDek(deps, userId);
  return { id: row.id, sourceId: row.sourceId, status: row.status,
    listingUrl: dec(dek, "encryptedListingUrl", row.id, row.encryptedListingUrl),
    notes: dec(dek, "notesEncrypted", row.id, row.notesEncrypted),
    ownershipConfirmedAt: row.userConfirmedOwnershipAt, updatedAt: row.updatedAt };
}

async function publishedSource(deps: Deps, id: string) {
  const s = await deps.db.source.findFirst({ where: { id, publishedAt: { not: null } } });
  if (!s) throw new AppError(404, "source_not_found", "Source not found.");
  return s;
}

function checkUrlRules(status: string, url: string | undefined, confirmed: boolean | undefined) {
  if (url === undefined) return;
  if (status !== "FOUND") throw new AppError(400, "invalid_input", "A listing link can only be added when you found your listing.");
  if (confirmed !== true) throw new AppError(400, "ownership_required", "Please confirm this listing is your own information.");
}

export async function createListingReview(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const input = CreateListingReview.parse(raw);
  const user = await requireUser(deps, session);
  const source = await publishedSource(deps, input.sourceId);
  if (await deps.db.listingReview.findUnique({ where: { userId_sourceId: { userId: user.id, sourceId: source.id } } })) {
    throw new AppError(409, "review_exists", "You already reviewed this source. Update it instead.");
  }
  checkUrlRules(input.status, input.listingUrl, input.confirmOwnership);
  const url = input.listingUrl === undefined ? undefined : validateListingUrl(input.listingUrl, source.domain);
  const dek = await getUserDek(deps, user.id);
  const id = randomUUID();
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.listingReview.create({ data: {
      id, userId: user.id, sourceId: source.id, status: input.status,
      encryptedListingUrl: url ? enc(dek, "encryptedListingUrl", id, url) : null,
      notesEncrypted: input.notes ? enc(dek, "notesEncrypted", id, input.notes) : null,
      userConfirmedOwnershipAt: url ? new Date() : null,
    } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "LISTING_REVIEW_SAVED",
      entityType: "ListingReview", entityId: id, metadata: { sourceId: source.id, toStatus: input.status } });
    return r;
  });
  return view(deps, user.id, row);
}

export async function updateListingReview(deps: Deps, session: Session, id: string, raw: unknown, ctx: RequestContext = {}) {
  const patch = UpdateListingReview.parse(raw);
  const user = await requireUser(deps, session);
  // Ownership check is part of the query: another user's id is indistinguishable from a missing one.
  const row = await deps.db.listingReview.findFirst({ where: { id, userId: user.id }, include: { source: true } });
  if (!row) throw new AppError(404, "review_not_found", "Review not found.");
  const status = patch.status ?? row.status;
  checkUrlRules(status, patch.listingUrl, patch.confirmOwnership);
  const url = patch.listingUrl === undefined ? undefined : validateListingUrl(patch.listingUrl, row.source.domain);
  const dek = await getUserDek(deps, user.id);
  const updated = await deps.db.$transaction(async (tx) => {
    const r = await tx.listingReview.update({ where: { id }, data: {
      status,
      // Leaving "found" clears any stored link and ownership attestation.
      ...(status !== "FOUND" ? { encryptedListingUrl: null, userConfirmedOwnershipAt: null } : {}),
      ...(url !== undefined ? { encryptedListingUrl: enc(dek, "encryptedListingUrl", id, url), userConfirmedOwnershipAt: new Date() } : {}),
      ...(patch.notes !== undefined ? { notesEncrypted: patch.notes ? enc(dek, "notesEncrypted", id, patch.notes) : null } : {}),
    } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "LISTING_REVIEW_SAVED",
      entityType: "ListingReview", entityId: id, metadata: { sourceId: row.sourceId, toStatus: status } });
    return r;
  });
  return view(deps, user.id, updated);
}

export async function listMyListingReviews(deps: Deps, session: Session) {
  const user = await requireUser(deps, session);
  const rows = await deps.db.listingReview.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
  return Promise.all(rows.map((r) => view(deps, user.id, r)));
}
