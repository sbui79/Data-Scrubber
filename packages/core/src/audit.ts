import { chainEvent } from "@privatepath/audit";
import { hmacHash } from "@privatepath/crypto";
import type { Prisma } from "@privatepath/db";
import type { Deps, RequestContext } from "./deps";

const AUDIT_LOCK_KEY = 727001;

export interface AuditEntry {
  actorUserId: string | null;
  targetUserId: string | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

/** Appends one hash-chained audit event inside the caller's transaction. */
export async function writeAudit(tx: Prisma.TransactionClient, deps: Deps, ctx: RequestContext, e: AuditEntry) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
  const last = await tx.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
  const createdAt = new Date();
  const ev = chainEvent(last?.hash ?? null, {
    actorUserId: e.actorUserId, targetUserId: e.targetUserId, eventType: e.eventType,
    entityType: e.entityType, entityId: e.entityId, metadata: e.metadata ?? {},
    createdAt: createdAt.toISOString(),
  });
  await tx.auditEvent.create({
    data: {
      actorUserId: ev.actorUserId, targetUserId: ev.targetUserId, eventType: ev.eventType,
      entityType: ev.entityType, entityId: ev.entityId,
      metadataRedactedJson: ev.metadata as Prisma.InputJsonValue,
      prevHash: ev.prevHash, hash: ev.hash, createdAt,
      ipAddressHashed: ctx.ip ? hmacHash(ctx.ip, deps.hashPepper) : null,
      userAgentHashed: ctx.userAgent ? hmacHash(ctx.userAgent, deps.hashPepper) : null,
    },
  });
}
