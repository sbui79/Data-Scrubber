import { z } from "zod";
import { decryptField, encryptField, fieldAad } from "@privatepath/crypto";
import type { Role } from "@privatepath/db";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { getUserDek, requireRole, requireUser } from "./users";

/** Shown on the safety page and returned with every safety-concern case. FLAGGED for attorney/domain-expert review. */
export const SAFETY_RESOURCES = {
  message:
    "If you or someone else is in immediate danger, contact your local emergency number (911 in the United States) right away. PrivatePath support is not an emergency service and cannot respond to emergencies.",
  resources: [
    { name: "Emergency services (US)", contact: "911" },
    { name: "National Domestic Violence Hotline (US)", contact: "1-800-799-7233", url: "https://www.thehotline.org" },
    { name: "Stalking Prevention, Awareness, and Resource Center", url: "https://www.stalkingawareness.org" },
  ],
  note: "Outside the United States, please contact your local emergency number or a local support organization.",
  needsReview: true,
} as const;

export const SUPPORT_POLICY =
  "PrivatePath will never ask you to send a government ID, Social Security number, or password by email or in a support message. Please don't include them.";

const CATEGORIES = ["ACCOUNT", "BILLING", "SOURCE_ISSUE", "PRIVACY_REQUEST", "SAFETY_CONCERN", "OTHER"] as const;
const STAFF: Role[] = ["SUPPORT", "COMPLIANCE_ADMIN", "SYSTEM_ADMIN"];
const SENSITIVE_ID = /\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b|\b(?:\d[ -]?){13,19}\b/;

export const SupportCaseInput = z.object({
  category: z.enum(CATEGORIES),
  subject: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
});

const aad = (id: string) => fieldAad("SupportCase", "messageEncrypted", id);

export async function createSupportCase(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const input = SupportCaseInput.parse(raw);
  if (SENSITIVE_ID.test(input.subject) || SENSITIVE_ID.test(input.message)) {
    throw new AppError(400, "sensitive_data", `It looks like your message includes an ID or card number. ${SUPPORT_POLICY}`);
  }
  const user = await requireUser(deps, session);
  const dek = await getUserDek(deps, user.id);
  const id = crypto.randomUUID();
  await deps.db.$transaction(async (tx) => {
    await tx.supportCase.create({ data: { id, userId: user.id, status: "OPEN", category: input.category, subject: input.subject,
      messageEncrypted: new Uint8Array(encryptField(dek, input.message, aad(id))) } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "SUPPORT_CASE_CREATED", entityType: "SupportCase", entityId: id, metadata: { reason: input.category } });
  });
  return { id, status: "OPEN", category: input.category, ...(input.category === "SAFETY_CONCERN" ? { safety: SAFETY_RESOURCES } : {}), policy: SUPPORT_POLICY };
}

export async function listMySupportCases(deps: Deps, session: Session) {
  const user = await requireUser(deps, session);
  const dek = await getUserDek(deps, user.id);
  const rows = await deps.db.supportCase.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return rows.map((c) => ({ id: c.id, category: c.category, subject: c.subject, status: c.status, createdAt: c.createdAt,
    message: decryptField(dek, Buffer.from(c.messageEncrypted), aad(c.id)) }));
}

// ---- Staff: redacted by default; message content only through an audited, time-limited grant ----

export async function staffListCases(deps: Deps, session: Session) {
  await requireRole(deps, session, STAFF);
  const rows = await deps.db.supportCase.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  // No user identity, no message: just what is needed to triage.
  return rows.map((c) => ({ id: c.id, category: c.category, subject: c.subject, status: c.status, createdAt: c.createdAt }));
}

export async function staffSetCaseStatus(deps: Deps, session: Session, caseId: string, status: unknown, ctx: RequestContext = {}) {
  const staff = await requireRole(deps, session, STAFF);
  const s = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).parse(status);
  const c = await deps.db.supportCase.findUnique({ where: { id: caseId } });
  if (!c) throw new AppError(404, "case_not_found", "Case not found.");
  await deps.db.$transaction(async (tx) => {
    await tx.supportCase.update({ where: { id: caseId }, data: { status: s } });
    await writeAudit(tx, deps, ctx, { actorUserId: staff.id, targetUserId: c.userId, eventType: "SUPPORT_CASE_STATUS_CHANGED", entityType: "SupportCase", entityId: caseId, metadata: { toStatus: s } });
  });
  return { id: caseId, status: s };
}

export const GrantInput = z.object({
  adminUserId: z.string().min(1).max(100), supportCaseId: z.string().min(1).max(100),
  purpose: z.string().trim().min(10).max(300), minutes: z.number().int().min(5).max(60).default(30),
});

/** A compliance admin approves ANOTHER staff member's time-limited read access to one case's content. */
export async function grantBreakGlass(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const input = GrantInput.parse(raw);
  const approver = await requireRole(deps, session, ["COMPLIANCE_ADMIN"]);
  if (input.adminUserId === approver.id) throw new AppError(403, "second_approver_required", "A different compliance admin must approve access.");
  const [grantee, c] = await Promise.all([
    deps.db.user.findUnique({ where: { id: input.adminUserId } }),
    deps.db.supportCase.findUnique({ where: { id: input.supportCaseId } }),
  ]);
  if (!grantee || !STAFF.includes(grantee.role)) throw new AppError(400, "invalid_input", "That person isn't a staff member.");
  if (!c) throw new AppError(404, "case_not_found", "Case not found.");
  const expiresAt = new Date(Date.now() + input.minutes * 60_000);
  return deps.db.$transaction(async (tx) => {
    const g = await tx.adminAccessGrant.create({ data: { adminUserId: grantee.id, targetUserId: c.userId, supportCaseId: c.id,
      purpose: input.purpose, approvedByAdminId: approver.id, expiresAt } });
    await writeAudit(tx, deps, ctx, { actorUserId: approver.id, targetUserId: c.userId, eventType: "ADMIN_ACCESS_GRANTED", entityType: "AdminAccessGrant", entityId: g.id,
      metadata: { supportCaseId: c.id, expiresAt: expiresAt.toISOString() } });
    return { id: g.id, expiresAt };
  });
}

export async function revokeBreakGlass(deps: Deps, session: Session, grantId: string, ctx: RequestContext = {}) {
  const admin = await requireRole(deps, session, ["COMPLIANCE_ADMIN", "SYSTEM_ADMIN"]);
  const g = await deps.db.adminAccessGrant.findUnique({ where: { id: grantId } });
  if (!g) throw new AppError(404, "grant_not_found", "Grant not found.");
  await deps.db.$transaction(async (tx) => {
    await tx.adminAccessGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
    await writeAudit(tx, deps, ctx, { actorUserId: admin.id, targetUserId: g.targetUserId, eventType: "ADMIN_ACCESS_REVOKED", entityType: "AdminAccessGrant", entityId: grantId, metadata: { supportCaseId: g.supportCaseId } });
  });
  return { revoked: true };
}

export async function staffReadCaseMessage(deps: Deps, session: Session, caseId: string, ctx: RequestContext = {}) {
  const staff = await requireRole(deps, session, STAFF);
  const now = new Date();
  const grant = await deps.db.adminAccessGrant.findFirst({ where: { adminUserId: staff.id, supportCaseId: caseId, revokedAt: null, expiresAt: { gt: now } } });
  const c = await deps.db.supportCase.findUnique({ where: { id: caseId } });
  // Same answer whether the case is missing or access isn't granted.
  if (!grant || !c || grant.targetUserId !== c.userId) throw new AppError(403, "grant_required", "Viewing this requires approved, time-limited access.");
  const dek = await getUserDek(deps, c.userId);
  const message = decryptField(dek, Buffer.from(c.messageEncrypted), aad(c.id));
  await deps.db.$transaction((tx) => writeAudit(tx, deps, ctx, { actorUserId: staff.id, targetUserId: c.userId, eventType: "SENSITIVE_DATA_VIEWED",
    entityType: "SupportCase", entityId: c.id, metadata: { supportCaseId: c.id } }));
  return { id: c.id, category: c.category, subject: c.subject, message };
}
