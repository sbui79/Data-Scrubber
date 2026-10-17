import { createHash } from "node:crypto";

export interface AuditInput {
  actorUserId: string | null;
  targetUserId: string | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string; // ISO
}

export interface ChainedAuditEvent extends AuditInput {
  prevHash: string | null;
  hash: string;
}

/**
 * Allowlist redaction: only these keys survive, and only as short scalars.
 * Anything else (names, emails, urls, free text) is dropped, never masked-in-place.
 */
const ALLOWED_KEYS = new Set([
  "fromStatus", "toStatus", "policyVersion", "consentType", "sourceId", "requestType",
  "role", "reason", "fieldNames", "count", "expiresAt", "supportCaseId", "format",
]);

export function redactMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 64);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v.slice(0, 20).map((s) => s.slice(0, 64));
  }
  return out;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeHash(prevHash: string | null, e: AuditInput): string {
  return createHash("sha256").update(`${prevHash ?? ""}|${canonical(e)}`).digest("hex");
}

export function chainEvent(prevHash: string | null, input: AuditInput): ChainedAuditEvent {
  const event = { ...input, metadata: redactMetadata(input.metadata) };
  return { ...event, prevHash, hash: computeHash(prevHash, event) };
}

/** Returns the index of the first broken link, or -1 if the chain is intact. */
export function verifyChain(events: ChainedAuditEvent[]): number {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const { prevHash, hash, ...rest } = events[i]!;
    if (prevHash !== prev || computeHash(prevHash, rest) !== hash) return i;
    prev = hash;
  }
  return -1;
}
