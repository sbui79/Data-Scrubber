import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { MemoryStorage } from "@privatepath/adapters";
import { verifyChain } from "@privatepath/audit";
import { MockKms } from "@privatepath/crypto";
import { createPrisma } from "@privatepath/db";
import {
  adminApproveVersion, adminCreateSource, approveRequest, completeSignup, createListingReview, createProfile, createReminder, createRequest,
  createSupportCase, deleteAccount, exportData, generateDraft, getDashboard, grantBreakGlass, listMySupportCases, markSubmitted, patchRequest,
  revokeBreakGlass, SAFETY_RESOURCES, setCaliforniaStep, staffListCases, staffReadCaseMessage, staffSetCaseStatus, toErrorResponse,
  uploadEvidence, type Deps, type Session,
} from "../src";

const db = createPrisma(process.env.TEST_DATABASE_URL ?? "postgresql://stevenbui@localhost:5432/privatepath_test");
const storage = new MemoryStorage();
const deps: Deps = { db, kms: new MockKms(randomBytes(32)), hashPepper: "test-pepper-0123456789", storage };
const mk = (n: string): Session => ({ authProviderId: `mock_${n}`, email: `${n}@example.test` });
const [adminA, adminB, support, alice, bob] = ["adminA", "adminB", "support", "alice", "bob"].map(mk) as Session[] as [Session, Session, Session, Session, Session];
const consents = (n: string) => ({ displayName: n, acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(32)]);
const statusOf = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return toErrorResponse(e).status; } };
const idOf = async (s: Session) => (await db.user.findFirstOrThrow({ where: { authProviderId: s.authProviderId } })).id;

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User","AuditEvent","Source","AdminAccessGrant" RESTART IDENTITY CASCADE');
  storage.objects.clear();
  for (const s of [adminA, adminB, support, alice, bob]) await completeSignup(deps, s, consents(s.authProviderId));
  await db.user.updateMany({ where: { authProviderId: { in: ["mock_adminA", "mock_adminB"] } }, data: { role: "COMPLIANCE_ADMIN" } });
  await db.user.updateMany({ where: { authProviderId: "mock_support" }, data: { role: "SUPPORT" } });
});
afterAll(() => db.$disconnect());

async function populate(s: Session, tag: string) {
  const src = await adminCreateSource(deps, adminA, { name: `Example ${tag}`, domain: `example-${tag}.test`, category: "c", officialOptOutUrl: `https://example-${tag}.test/o`,
    instructionsMarkdown: "x", verificationMethod: "v", difficulty: 1, sourceStatus: "AVAILABLE", lastReviewedAt: "2026-10-01" });
  await adminApproveVersion(deps, adminB, src.id, 1);
  await createProfile(deps, s, { legalFirstName: `First${tag}`, legalLastName: `Last${tag}`, phoneNumbers: ["555-010-0100"] });
  const lr = await createListingReview(deps, s, { sourceId: src.id, status: "FOUND", listingUrl: `https://example-${tag}.test/p/1`, confirmOwnership: true, notes: `note-${tag}` });
  const r = await createRequest(deps, s, { sourceId: src.id, requestType: "DELETION", listingReviewId: lr.id });
  const d = await generateDraft(deps, s, r.id, { confirmOwnData: true });
  await approveRequest(deps, s, r.id, { confirmOwnData: true, draftHash: d.draftHash });
  await markSubmitted(deps, s, r.id, { method: "web_form" });
  await patchRequest(deps, s, r.id, { notes: `req-note-${tag}`, confirmationReference: `REF-${tag}` });
  await uploadEvidence(deps, s, r.id, { filename: `proof-${tag}.png`, contentType: "image/png", bytes: PNG });
  await createReminder(deps, s, { type: "CUSTOM", scheduledFor: new Date(Date.now() + 5 * 86_400_000) });
  await setCaliforniaStep(deps, s, { step: 2, done: true });
  await createSupportCase(deps, s, { category: "OTHER", subject: `help-${tag}`, message: `message-${tag}` });
  return r.id;
}

describe("data export", () => {
  it("returns the caller's decrypted data and nothing from other users", async () => {
    await populate(alice, "alice");
    await populate(bob, "bob");
    const out = await exportData(deps, alice);
    const json = JSON.stringify(out);
    for (const mine of ["Firstalice", "Lastalice", "555-010-0100", "note-alice", "req-note-alice", "REF-alice", "proof-alice.png", "message-alice", "example-alice.test/p/1"]) expect(json).toContain(mine);
    for (const theirs of ["bob", "Firstbob", "REF-bob", "proof-bob", "message-bob"]) expect(json).not.toContain(theirs);
    expect(out.consents.map((c) => c.type).sort()).toEqual(["AUTHORIZE_OWN_DATA_PROCESSING", "PRIVACY_POLICY", "TERMS"]);
    expect(out.californiaChecklist).toEqual([2]);
    expect(out.removalRequests[0]!.history.length).toBeGreaterThan(3);
    expect(await db.auditEvent.count({ where: { eventType: "DATA_EXPORTED" } })).toBe(1);
  });
});

describe("account deletion", () => {
  it("requires the exact confirmation word", async () => {
    expect(await statusOf(deleteAccount(deps, alice, {}))).toBe(400);
    expect(await statusOf(deleteAccount(deps, alice, { confirm: "yes" }))).toBe(400);
    expect(await db.user.count({ where: { authProviderId: "mock_alice" } })).toBe(1);
  });
  it("removes every row and stored file for the user, and only that user", async () => {
    await populate(alice, "alice");
    await populate(bob, "bob");
    const aliceId = await idOf(alice);
    expect(storage.objects.size).toBe(2);
    await deleteAccount(deps, alice, { confirm: "DELETE" });

    const tables = ["userProfile", "userKey", "consentRecord", "listingReview", "removalRequest", "evidenceFile", "reminder", "notification", "supportCase", "californiaProgress"] as const;
    for (const t of tables) expect(await (db[t] as any).count({ where: { userId: aliceId } }), t).toBe(0);
    expect(await db.requestStatusHistory.count({ where: { request: { userId: aliceId } } })).toBe(0);
    expect(await db.user.findUnique({ where: { id: aliceId } })).toBeNull();
    expect(storage.objects.size).toBe(1); // bob's file only
    // bob is untouched
    expect((await exportData(deps, bob)).profile).toMatchObject({ legalFirstName: "Firstbob" });
  });
  it("makes the account unusable afterwards, and the same identity can sign up fresh", async () => {
    await populate(alice, "alice");
    await deleteAccount(deps, alice, { confirm: "DELETE" });
    expect(await statusOf(getDashboard(deps, alice))).toBe(403);
    await completeSignup(deps, alice, consents("again"));
    expect((await getDashboard(deps, alice)).stats.sourcesReviewed).toBe(0);
  });
  it("keeps audit events with opaque ids only, ends with ACCOUNT_DELETED, and the chain stays valid", async () => {
    await populate(alice, "alice");
    await deleteAccount(deps, alice, { confirm: "DELETE" });
    const events = await db.auditEvent.findMany({ orderBy: { seq: "asc" } });
    expect(events.some((e) => e.eventType === "ACCOUNT_DELETED")).toBe(true);
    const all = JSON.stringify(events.map((e) => e.metadataRedactedJson));
    expect(all).not.toMatch(/alice|REF-|proof|message-|example-alice/);
    const chain = events.map((e) => ({ actorUserId: e.actorUserId, targetUserId: e.targetUserId, eventType: e.eventType, entityType: e.entityType, entityId: e.entityId,
      metadata: e.metadataRedactedJson as Record<string, unknown>, createdAt: e.createdAt.toISOString(), prevHash: e.prevHash, hash: e.hash }));
    expect(verifyChain(chain)).toBe(-1);
  });
  it("aborts without deleting anything if stored files can't be removed", async () => {
    await populate(alice, "alice");
    const failing: Deps = { ...deps, storage: { ...storage, put: storage.put.bind(storage), get: storage.get.bind(storage), delete: async () => { throw new Error("down"); } } };
    expect(await statusOf(deleteAccount(failing, alice, { confirm: "DELETE" }))).toBe(503);
    expect(await db.user.count({ where: { authProviderId: "mock_alice" } })).toBe(1);
    await deleteAccount(deps, alice, { confirm: "DELETE" }); // retry works
  });
  it("is not gated by anything beyond authentication and the confirmation", async () => {
    await deleteAccount(deps, bob, { confirm: "DELETE" });
    expect(await db.user.count({ where: { authProviderId: "mock_bob" } })).toBe(0);
  });
});

describe("support", () => {
  it("rejects messages containing ID or card numbers and states the policy", async () => {
    for (const message of ["my ssn is 123-45-6789", "card 4111 1111 1111 1111 please", "id 123456789"]) {
      const err = await createSupportCase(deps, alice, { category: "OTHER", subject: "help", message }).then(() => null, (e) => e);
      expect(err.code).toBe("sensitive_data");
      expect(err.message).toMatch(/never ask you to send a government ID/i);
    }
  });
  it("stores messages encrypted and returns safety resources for safety concerns", async () => {
    const c = await createSupportCase(deps, alice, { category: "SAFETY_CONCERN", subject: "urgent", message: "I am being followed" });
    expect((c as any).safety.message).toMatch(/911/);
    expect(JSON.stringify(await db.supportCase.findMany())).not.toContain("being followed");
    expect((await listMySupportCases(deps, alice))[0]!.message).toBe("I am being followed");
    expect(await listMySupportCases(deps, bob)).toEqual([]);
    expect(SAFETY_RESOURCES.needsReview).toBe(true);
  });
  it("staff see a redacted queue: no message, no user identity", async () => {
    await createSupportCase(deps, alice, { category: "ACCOUNT", subject: "login problem", message: "secret details" });
    const q = await staffListCases(deps, support);
    expect(q).toHaveLength(1);
    expect(Object.keys(q[0]!).sort()).toEqual(["category", "createdAt", "id", "status", "subject"]);
    expect(await statusOf(staffListCases(deps, alice))).toBe(403);
    await staffSetCaseStatus(deps, support, q[0]!.id, "RESOLVED");
    expect((await staffListCases(deps, support))[0]!.status).toBe("RESOLVED");
  });
  it("message content requires an approved, time-limited, audited grant from a different admin", async () => {
    const c = await createSupportCase(deps, alice, { category: "ACCOUNT", subject: "help", message: "private detail" });
    const supportId = await idOf(support), adminAId = await idOf(adminA);
    const caseId = (await staffListCases(deps, support))[0]!.id;
    expect(await statusOf(staffReadCaseMessage(deps, support, caseId))).toBe(403);
    expect(await statusOf(grantBreakGlass(deps, support, { adminUserId: supportId, supportCaseId: caseId, purpose: "investigating a login problem" }))).toBe(403);
    expect(await statusOf(grantBreakGlass(deps, adminA, { adminUserId: adminAId, supportCaseId: caseId, purpose: "investigating a login problem" }))).toBe(403); // self-approval
    expect(await statusOf(grantBreakGlass(deps, adminB, { adminUserId: supportId, supportCaseId: caseId, purpose: "short" }))).toBe(400);
    const g = await grantBreakGlass(deps, adminB, { adminUserId: supportId, supportCaseId: caseId, purpose: "investigating a login problem", minutes: 30 });
    expect(await staffReadCaseMessage(deps, support, caseId)).toMatchObject({ message: "private detail" });
    const view = await db.auditEvent.findFirstOrThrow({ where: { eventType: "SENSITIVE_DATA_VIEWED" } });
    expect(view.actorUserId).toBe(supportId);
    expect(view.targetUserId).toBe(await idOf(alice));
    expect(JSON.stringify(view.metadataRedactedJson)).not.toContain("private detail");
    await revokeBreakGlass(deps, adminB, g.id);
    expect(await statusOf(staffReadCaseMessage(deps, support, caseId))).toBe(403);
    expect(c.id).toBe(caseId);
  });
  it("an expired grant gives no access, and a grant is bound to its one case", async () => {
    await createSupportCase(deps, alice, { category: "ACCOUNT", subject: "one", message: "m1" });
    await createSupportCase(deps, bob, { category: "ACCOUNT", subject: "two", message: "m2" });
    const supportId = await idOf(support);
    const [c1, c2] = (await staffListCases(deps, support)).map((c) => c.id);
    const g = await grantBreakGlass(deps, adminB, { adminUserId: supportId, supportCaseId: c1!, purpose: "investigating a login problem" });
    expect(await statusOf(staffReadCaseMessage(deps, support, c2!))).toBe(403);
    await db.adminAccessGrant.update({ where: { id: g.id }, data: { grantedAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() - 1000) } });
    expect(await statusOf(staffReadCaseMessage(deps, support, c1!))).toBe(403);
  });
  it("requires MFA for staff actions when enforced", async () => {
    expect(await statusOf(staffListCases({ ...deps, requireAdminMfa: true }, support))).toBe(403);
    expect(await statusOf(staffListCases({ ...deps, requireAdminMfa: true }, { ...support, mfa: true }))).toBe(200);
  });
});
