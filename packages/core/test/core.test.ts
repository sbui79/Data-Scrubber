import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { MockKms } from "@privatepath/crypto";
import { verifyChain } from "@privatepath/audit";
import { createPrisma } from "@privatepath/db";
import {
  AppError, authenticate, completeSignup, createProfile, getProfile, toErrorResponse, updateProfile,
  type Deps, type Session,
} from "../src";

const db = createPrisma(process.env.TEST_DATABASE_URL ?? "postgresql://stevenbui@localhost:5432/privatepath_test");
const deps: Deps = { db, kms: new MockKms(randomBytes(32)), hashPepper: "test-pepper-0123456789" };

const alice: Session = { authProviderId: "mock_alice", email: "alice@example.test" };
const bob: Session = { authProviderId: "mock_bob", email: "bob@example.test" };
const consents = { displayName: "Demo A", acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true };
const profile = { legalFirstName: "Alexandra", legalLastName: "Demoperson", currentState: "CA", phoneNumbers: ["555-010-0199"] };

beforeEach(async () => {
  // TRUNCATE does not fire the row-level append-only trigger, so tests can reset state.
  await db.$executeRawUnsafe(
    'TRUNCATE "User","AuditEvent","ConsentRecord","UserKey","UserProfile" RESTART IDENTITY CASCADE',
  );
});
afterAll(() => db.$disconnect());

describe("authenticate", () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
  it("rejects missing credentials with 401", () => {
    expect(() => authenticate(h({}), "mock")).toThrow(AppError);
    try { authenticate(h({}), "mock"); } catch (e) { expect((e as AppError).status).toBe(401); }
  });
  it("never honors mock headers in clerk mode", () => {
    expect(() => authenticate(h({ "x-mock-auth-id": "a", "x-mock-email": "a@b.test" }), "clerk")).toThrow(AppError);
  });
});

describe("signup and consent", () => {
  it("requires every consent", async () => {
    await expect(completeSignup(deps, alice, { ...consents, authorizeOwnData: false })).rejects.toThrow();
    expect(await db.user.count()).toBe(0);
  });
  it("records versioned consents, hashed ip/ua, and a valid audit chain", async () => {
    await completeSignup(deps, alice, consents, { ip: "203.0.113.9", userAgent: "TestAgent/1" });
    const rows = await db.consentRecord.findMany();
    expect(rows.map((r) => r.consentType).sort()).toEqual(["AUTHORIZE_OWN_DATA_PROCESSING", "PRIVACY_POLICY", "TERMS"]);
    expect(rows.every((r) => r.policyVersion && r.ipAddressHashed && r.ipAddressHashed !== "203.0.113.9")).toBe(true);
    const events = await db.auditEvent.findMany({ orderBy: { seq: "asc" } });
    expect(events).toHaveLength(3);
    const chain = events.map((e) => ({
      actorUserId: e.actorUserId, targetUserId: e.targetUserId, eventType: e.eventType, entityType: e.entityType,
      entityId: e.entityId, metadata: e.metadataRedactedJson as Record<string, unknown>,
      createdAt: e.createdAt.toISOString(), prevHash: e.prevHash, hash: e.hash,
    }));
    expect(verifyChain(chain)).toBe(-1);
  });
  it("does not record marketing consent unless given separately", async () => {
    const u = await completeSignup(deps, alice, consents);
    expect((await db.user.findUnique({ where: { id: u.id } }))?.marketingConsentAt).toBeNull();
  });
  it("rejects a second signup for the same identity", async () => {
    await completeSignup(deps, alice, consents);
    await expect(completeSignup(deps, alice, consents)).rejects.toMatchObject({ status: 409 });
  });
  it("keeps the audit log chained under concurrent signups", async () => {
    await Promise.all([completeSignup(deps, alice, consents), completeSignup(deps, bob, consents)]);
    const events = await db.auditEvent.findMany({ orderBy: { seq: "asc" } });
    expect(events).toHaveLength(6);
    expect(events.slice(1).every((e, i) => e.prevHash === events[i]!.hash)).toBe(true);
  });
});

describe("profile", () => {
  it("requires onboarding first", async () => {
    await expect(createProfile(deps, alice, profile)).rejects.toMatchObject({ status: 403 });
  });
  it("round-trips for the owner and stores no plaintext", async () => {
    await completeSignup(deps, alice, consents);
    const p = await createProfile(deps, alice, profile);
    expect(p.legalFirstName).toBe("Alexandra");
    expect(p.phoneNumbers).toEqual(["555-010-0199"]);
    const raw = JSON.stringify(await db.userProfile.findFirst());
    for (const secret of ["Alexandra", "Demoperson", "555-010-0199"]) expect(raw).not.toContain(secret);
  });
  it("isolates users: each only ever reads their own profile", async () => {
    await completeSignup(deps, alice, consents);
    await completeSignup(deps, bob, { ...consents, displayName: "Demo B" });
    await createProfile(deps, alice, profile);
    await expect(getProfile(deps, bob)).rejects.toMatchObject({ status: 404 });
    await createProfile(deps, bob, { legalFirstName: "Robert", legalLastName: "Sample" });
    expect((await getProfile(deps, alice)).legalFirstName).toBe("Alexandra");
    expect((await getProfile(deps, bob)).legalFirstName).toBe("Robert");
  });
  it("cannot decrypt ciphertext copied from another user's row", async () => {
    await completeSignup(deps, alice, consents);
    await completeSignup(deps, bob, { ...consents, displayName: "Demo B" });
    await createProfile(deps, alice, profile);
    await createProfile(deps, bob, { legalFirstName: "Robert", legalLastName: "Sample" });
    const a = await db.userProfile.findFirstOrThrow({ where: { user: { authProviderId: alice.authProviderId } } });
    await db.userProfile.updateMany({
      where: { user: { authProviderId: bob.authProviderId } },
      data: { encryptedLegalFirstName: a.encryptedLegalFirstName },
    });
    await expect(getProfile(deps, bob)).rejects.toThrow();
  });
  it("updates fields, clears with null, and audits field names only", async () => {
    await completeSignup(deps, alice, consents);
    await createProfile(deps, alice, profile);
    const p = await updateProfile(deps, alice, { currentCity: "Sampleville", phoneNumbers: null });
    expect(p.currentCity).toBe("Sampleville");
    expect(p.phoneNumbers).toEqual([]);
    const ev = await db.auditEvent.findFirstOrThrow({ where: { eventType: "PROFILE_UPDATED" } });
    expect(ev.metadataRedactedJson).toEqual({ fieldNames: ["currentCity", "phoneNumbers"] });
    expect(JSON.stringify(ev.metadataRedactedJson)).not.toContain("Sampleville");
  });
  it("validates input and reports field names, not values, in errors", async () => {
    await completeSignup(deps, alice, consents);
    let err: unknown;
    try { await createProfile(deps, alice, { ...profile, emailAddresses: ["not-an-email-secret"] }); } catch (e) { err = e; }
    const res = toErrorResponse(err);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("emailAddresses");
    expect(JSON.stringify(res.body)).not.toContain("not-an-email-secret");
  });
});
