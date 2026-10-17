import { describe, expect, it } from "vitest";
import { chainEvent, redactMetadata, verifyChain, type AuditInput } from "../src";

const base = (n: number): AuditInput => ({
  actorUserId: "u1", targetUserId: "u1", eventType: "REQUEST_STATUS_CHANGED",
  entityType: "RemovalRequest", entityId: `r${n}`,
  metadata: { fromStatus: "DRAFT_READY", toStatus: "SUBMITTED_BY_USER" },
  createdAt: `2026-01-0${n}T00:00:00.000Z`,
});

describe("redactMetadata", () => {
  it("drops non-allowlisted keys such as names, emails and URLs", () => {
    const out = redactMetadata({ toStatus: "COMPLETED", email: "a@b.test", listingUrl: "https://x.test/p", notes: "free text" });
    expect(out).toEqual({ toStatus: "COMPLETED" });
  });
  it("truncates long strings and ignores nested objects", () => {
    const out = redactMetadata({ reason: "x".repeat(500), count: { nested: 1 } });
    expect((out.reason as string).length).toBe(64);
    expect(out.count).toBeUndefined();
  });
});

describe("hash chain", () => {
  const build = () => {
    const a = chainEvent(null, base(1));
    const b = chainEvent(a.hash, base(2));
    const c = chainEvent(b.hash, base(3));
    return [a, b, c];
  };
  it("verifies an intact chain", () => expect(verifyChain(build())).toBe(-1));
  it("detects a modified event", () => {
    const chain = build();
    chain[1]!.eventType = "SOMETHING_ELSE";
    expect(verifyChain(chain)).toBe(1);
  });
  it("detects a removed event", () => {
    const chain = build();
    chain.splice(1, 1);
    expect(verifyChain(chain)).toBe(1);
  });
  it("redacts before hashing", () => {
    const e = chainEvent(null, { ...base(1), metadata: { toStatus: "COMPLETED", email: "a@b.test" } });
    expect(e.metadata).toEqual({ toStatus: "COMPLETED" });
    expect(verifyChain([e])).toBe(-1);
  });
});
