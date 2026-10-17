import { z } from "zod";
import { decryptField, fieldAad } from "@privatepath/crypto";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { getUserDek, requireUser } from "./users";
import { getProfile } from "./profile";
import { listMyListingReviews } from "./listings";
import { getRequest } from "./requests";
import { listMySupportCases } from "./support";

/** A copy of everything stored about the caller, decrypted. Evidence files are listed; each downloads separately. */
export async function exportData(deps: Deps, session: Session, ctx: RequestContext = {}) {
  const user = await requireUser(deps, session);
  const dek = await getUserDek(deps, user.id);
  const [profile, listingReviews, requestRows, consents, reminders, notifications, california, supportCases, activity] = await Promise.all([
    getProfile(deps, session).catch(() => null),
    listMyListingReviews(deps, session),
    deps.db.removalRequest.findMany({ where: { userId: user.id }, select: { id: true }, orderBy: { createdAt: "asc" } }),
    deps.db.consentRecord.findMany({ where: { userId: user.id }, orderBy: { grantedAt: "asc" } }),
    deps.db.reminder.findMany({ where: { userId: user.id }, orderBy: { scheduledFor: "asc" } }),
    deps.db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    deps.db.californiaProgress.findUnique({ where: { userId: user.id } }),
    listMySupportCases(deps, session),
    deps.db.auditEvent.findMany({ where: { targetUserId: user.id }, orderBy: { seq: "asc" } }),
  ]);
  const removalRequests = [];
  for (const r of requestRows) {
    const full = await getRequest(deps, session, r.id);
    const files = await deps.db.evidenceFile.findMany({ where: { removalRequestId: r.id, userId: user.id, deletedAt: null } });
    removalRequests.push({ ...full, evidence: files.map((f) => ({ id: f.id, contentType: f.contentType, sizeBytes: f.sizeBytes, uploadedAt: f.uploadedAt,
      filename: decryptField(dek, Buffer.from(f.originalFilenameEncrypted), fieldAad("EvidenceFile", "originalFilenameEncrypted", f.id)) })) });
  }
  await deps.db.$transaction((tx) => writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "DATA_EXPORTED", entityType: "User", entityId: user.id, metadata: { format: "json" } }));
  return {
    exportedAt: new Date().toISOString(),
    notice: "This is a copy of the data PrivatePath stores about your account. Evidence files are listed here and can be downloaded individually.",
    account: { email: user.email, nickname: user.displayName, createdAt: user.createdAt, marketingConsentAt: user.marketingConsentAt,
      termsVersionAccepted: user.termsVersionAccepted, privacyPolicyVersionAccepted: user.privacyPolicyVersionAccepted },
    profile, consents: consents.map((c) => ({ type: c.consentType, policyVersion: c.policyVersion, grantedAt: c.grantedAt, revokedAt: c.revokedAt })),
    listingReviews, removalRequests,
    reminders: reminders.map((r) => ({ type: r.type, scheduledFor: r.scheduledFor, status: r.status, channel: r.channel, sentAt: r.sentAt })),
    notifications: notifications.map((n) => ({ title: n.title, body: n.body, createdAt: n.createdAt, readAt: n.readAt })),
    californiaChecklist: california?.completedSteps ?? [], supportCases,
    activityLog: activity.map((a) => ({ at: a.createdAt, event: a.eventType, entityType: a.entityType, details: a.metadataRedactedJson })),
  };
}

export const DeleteInput = z.object({ confirm: z.literal("DELETE") });

/**
 * Permanently deletes the account and all of its data. Stored files are removed first (if that fails, nothing is
 * deleted and the user can retry). Deleting the user's key row makes any remaining ciphertext, such as in
 * backups, unreadable. Audit events are retained with opaque ids only (no personal data), per the retention schedule.
 */
export async function deleteAccount(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  DeleteInput.parse(raw);
  const user = await requireUser(deps, session);
  const files = await deps.db.evidenceFile.findMany({ where: { userId: user.id, deletedAt: null } });
  if (files.length) {
    if (!deps.storage) throw new AppError(503, "storage_unavailable", "We couldn't remove your files right now. Please try again shortly.");
    const dek = await getUserDek(deps, user.id);
    try {
      for (const f of files) {
        const key = decryptField(dek, Buffer.from(f.encryptedStorageKey), fieldAad("EvidenceFile", "encryptedStorageKey", f.id));
        await deps.storage.delete(key);
      }
    } catch {
      throw new AppError(503, "storage_unavailable", "We couldn't remove your files right now. Please try again shortly.");
    }
  }
  await deps.db.$transaction(async (tx) => {
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "ACCOUNT_DELETED", entityType: "User", entityId: user.id, metadata: { count: files.length } });
    await tx.adminAccessGrant.deleteMany({ where: { targetUserId: user.id } });
    await tx.user.delete({ where: { id: user.id } }); // cascades to every table holding the user's data, including the key
  });
  return { deleted: true };
}
