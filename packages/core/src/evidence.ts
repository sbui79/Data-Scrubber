import { randomUUID } from "node:crypto";
import { decryptBytes, decryptField, encryptBytes, encryptField, fieldAad } from "@privatepath/crypto";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { getUserDek, requireUser } from "./users";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;

/** Content types allowed as proof, with a magic-byte check so the declared type must match the content. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  "image/jpeg": (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "application/pdf": (b) => b.subarray(0, 4).toString("latin1") === "%PDF",
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

const aad = (col: string, id: string) => fieldAad("EvidenceFile", col, id);
const requireStorage = (deps: Deps) => {
  if (!deps.storage) throw new AppError(501, "storage_unavailable", "File storage isn't available.");
  return deps.storage;
};
// Intentionally strips control characters from user-supplied filenames.
// eslint-disable-next-line no-control-regex
const cleanName = (n: string) => n.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").slice(0, 120) || "evidence";

async function ownedRequest(deps: Deps, userId: string, requestId: string) {
  const r = await deps.db.removalRequest.findFirst({ where: { id: requestId, userId }, select: { id: true } });
  if (!r) throw new AppError(404, "request_not_found", "Request not found.");
}

export async function uploadEvidence(deps: Deps, session: Session, requestId: string,
  file: { filename: string; contentType: string; bytes: Buffer }, ctx: RequestContext = {}) {
  const storage = requireStorage(deps);
  const user = await requireUser(deps, session);
  await ownedRequest(deps, user.id, requestId);
  const sig = SIGNATURES[file.contentType];
  if (!sig) throw new AppError(415, "unsupported_type", "Please upload a PNG, JPEG, WebP image or a PDF.");
  if (file.bytes.length === 0 || file.bytes.length > MAX_BYTES) throw new AppError(413, "file_too_large", "Files must be under 5 MB.");
  if (!sig(file.bytes)) throw new AppError(415, "unsupported_type", "The file doesn't match its declared type.");
  if ((await deps.db.evidenceFile.count({ where: { removalRequestId: requestId, userId: user.id, deletedAt: null } })) >= MAX_FILES) {
    throw new AppError(409, "too_many_files", "You've reached the file limit for this request.");
  }
  const dek = await getUserDek(deps, user.id);
  const id = randomUUID();
  const storageKey = randomUUID();
  await storage.put(storageKey, encryptBytes(dek, file.bytes, aad("content", id)));
  try {
    await deps.db.$transaction(async (tx) => {
      await tx.evidenceFile.create({ data: {
        id, userId: user.id, removalRequestId: requestId, contentType: file.contentType, sizeBytes: file.bytes.length,
        encryptedStorageKey: new Uint8Array(encryptField(dek, storageKey, aad("encryptedStorageKey", id))),
        originalFilenameEncrypted: new Uint8Array(encryptField(dek, cleanName(file.filename), aad("originalFilenameEncrypted", id))),
      } });
      await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "EVIDENCE_UPLOADED",
        entityType: "EvidenceFile", entityId: id, metadata: { format: file.contentType } });
    });
  } catch (e) {
    await storage.delete(storageKey); // don't leave orphaned ciphertext
    throw e;
  }
  return { id, contentType: file.contentType, sizeBytes: file.bytes.length };
}

async function ownedFile(deps: Deps, userId: string, requestId: string, evidenceId: string) {
  const f = await deps.db.evidenceFile.findFirst({ where: { id: evidenceId, removalRequestId: requestId, userId, deletedAt: null } });
  if (!f) throw new AppError(404, "evidence_not_found", "File not found.");
  return f;
}

export async function downloadEvidence(deps: Deps, session: Session, requestId: string, evidenceId: string, ctx: RequestContext = {}) {
  const storage = requireStorage(deps);
  const user = await requireUser(deps, session);
  const f = await ownedFile(deps, user.id, requestId, evidenceId);
  const dek = await getUserDek(deps, user.id);
  const key = decryptField(dek, Buffer.from(f.encryptedStorageKey), aad("encryptedStorageKey", f.id));
  const bytes = decryptBytes(dek, await storage.get(key), aad("content", f.id));
  await deps.db.$transaction((tx) => writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id,
    eventType: "EVIDENCE_DOWNLOADED", entityType: "EvidenceFile", entityId: f.id, metadata: {} }));
  return { filename: decryptField(dek, Buffer.from(f.originalFilenameEncrypted), aad("originalFilenameEncrypted", f.id)), contentType: f.contentType, bytes };
}

export async function deleteEvidence(deps: Deps, session: Session, requestId: string, evidenceId: string, ctx: RequestContext = {}) {
  const storage = requireStorage(deps);
  const user = await requireUser(deps, session);
  const f = await ownedFile(deps, user.id, requestId, evidenceId);
  const dek = await getUserDek(deps, user.id);
  const key = decryptField(dek, Buffer.from(f.encryptedStorageKey), aad("encryptedStorageKey", f.id));
  await storage.delete(key);
  await deps.db.$transaction(async (tx) => {
    // Keep the row for the audit trail but erase everything identifying.
    await tx.evidenceFile.update({ where: { id: f.id }, data: { deletedAt: new Date(), encryptedStorageKey: new Uint8Array(0), originalFilenameEncrypted: new Uint8Array(0) } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "EVIDENCE_DELETED",
      entityType: "EvidenceFile", entityId: f.id, metadata: {} });
  });
  return { deleted: true };
}
