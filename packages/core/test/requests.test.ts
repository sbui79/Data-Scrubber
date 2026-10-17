import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { MemoryStorage } from "@privatepath/adapters";
import { MockKms } from "@privatepath/crypto";
import { createPrisma } from "@privatepath/db";
import {
  adminApproveVersion, adminCreateSource, approveRequest, completeSignup, createListingReview, createProfile,
  createRequest, deleteEvidence, downloadEvidence, exportDraft, generateDraft, getRequest, listRequests,
  markSubmitted, patchRequest, toErrorResponse, uploadEvidence, type Deps, type Session,
} from "../src";

const db = createPrisma(process.env.TEST_DATABASE_URL ?? "postgresql://stevenbui@localhost:5432/privatepath_test");
const storage = new MemoryStorage();
const deps: Deps = { db, kms: new MockKms(randomBytes(32)), hashPepper: "test-pepper-0123456789", storage };
const mk = (n: string): Session => ({ authProviderId: `mock_${n}`, email: `${n}@example.test` });
const [adminA, adminB, alice, bob] = ["adminA", "adminB", "alice", "bob"].map(mk) as [Session, Session, Session, Session];
const consents = (n: string) => ({ displayName: n, acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true });
const DOMAIN = "example-broker-one.test";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(64)]);

let sourceId: string;
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User","AuditEvent","Source" RESTART IDENTITY CASCADE');
  storage.objects.clear();
  for (const s of [adminA, adminB, alice, bob]) await completeSignup(deps, s, consents(s.authProviderId));
  await db.user.updateMany({ where: { authProviderId: { in: ["mock_adminA", "mock_adminB"] } }, data: { role: "COMPLIANCE_ADMIN" } });
  const s = await adminCreateSource(deps, adminA, { name: "Example Broker One", domain: DOMAIN, category: "People search",
    officialOptOutUrl: `https://${DOMAIN}/optout`, instructionsMarkdown: "Demo.", verificationMethod: "Email", difficulty: 2,
    sourceStatus: "AVAILABLE", lastReviewedAt: "2026-10-01" });
  await adminApproveVersion(deps, adminB, s.id, 1);
  sourceId = s.id;
  await createProfile(deps, alice, { legalFirstName: "Alexandra", legalLastName: "Demoperson", phoneNumbers: ["(555) 010-0199"] });
});
afterAll(() => db.$disconnect());

/** HTTP status the API would return for a failing call (covers both AppError and Zod validation). */
const statusOf = async (p: Promise<unknown>) => toErrorResponse(await p.then(() => null, (e) => e)).status;

const URL1 = `https://${DOMAIN}/p/abc`;
async function foundRequest() {
  const lr = await createListingReview(deps, alice, { sourceId, status: "FOUND", listingUrl: URL1, confirmOwnership: true });
  return createRequest(deps, alice, { sourceId, requestType: "SUPPRESSION", listingReviewId: lr.id });
}
async function approved() {
  const r = await foundRequest();
  const d = await generateDraft(deps, alice, r.id, { confirmOwnData: true });
  return approveRequest(deps, alice, r.id, { confirmOwnData: true, draftHash: d.draftHash });
}

describe("creating requests", () => {
  it("starts NOT_STARTED, or LISTING_FOUND with the confirmed link carried over", async () => {
    expect((await createRequest(deps, alice, { sourceId, requestType: "OPT_OUT" })).status).toBe("NOT_STARTED");
    const r = await foundRequest();
    expect(r).toMatchObject({ status: "LISTING_FOUND", listingUrl: URL1 });
  });
  it("cannot be created for an unpublished source or someone else's review", async () => {
    const pending = await adminCreateSource(deps, adminA, { name: "P", domain: "pending-one.test", category: "c", officialOptOutUrl: "https://pending-one.test/o",
      instructionsMarkdown: "x", verificationMethod: "v", difficulty: 1, sourceStatus: "AVAILABLE", lastReviewedAt: "2026-10-01" });
    await expect(createRequest(deps, alice, { sourceId: pending.id, requestType: "OPT_OUT" })).rejects.toMatchObject({ status: 404 });
    const lr = await createListingReview(deps, alice, { sourceId, status: "NOT_SURE" });
    await expect(createRequest(deps, bob, { sourceId, requestType: "OPT_OUT", listingReviewId: lr.id })).rejects.toMatchObject({ status: 404 });
  });
  it("encrypts link, notes and reference at rest", async () => {
    const r = await foundRequest();
    await patchRequest(deps, alice, r.id, { notes: "called them Tuesday", confirmationReference: "REF-998877" });
    const raw = JSON.stringify(await db.removalRequest.findMany());
    for (const secret of ["p/abc", "called them", "REF-998877"]) expect(raw).not.toContain(secret);
  });
});

describe("approval gate", () => {
  it("generates a draft that omits email and phone unless opted in", async () => {
    const r = await foundRequest();
    const d = await generateDraft(deps, alice, r.id, { confirmOwnData: true, dataCategories: ["old_addresses"] });
    expect(d.status).toBe("DRAFT_READY");
    expect(d.draft!.body).toContain("Alexandra Demoperson");
    expect(d.draft!.body).toContain(URL1);
    expect(d.draft!.body).not.toMatch(/@example|0199/);
    expect(d.approved).toBe(false);
  });
  it("requires the ownership confirmation to draft", async () => {
    const r = await foundRequest();
    expect(await statusOf(generateDraft(deps, alice, r.id, {}))).toBe(400);
  });
  it("includes only the last 4 phone digits when chosen", async () => {
    const r = await foundRequest();
    const d = await generateDraft(deps, alice, r.id, { confirmOwnData: true, phoneIndex: 0, includeEmail: true });
    expect(d.draft!.body).toContain("Phone ending in 0199");
    expect(d.draft!.body).not.toContain("555");
    expect(d.draft!.body).toContain("alice@example.test");
  });
  it("blocks copy/download and submission before approval", async () => {
    const r = await foundRequest();
    const d = await generateDraft(deps, alice, r.id, { confirmOwnData: true });
    await expect(exportDraft(deps, alice, r.id)).rejects.toMatchObject({ code: "approval_required" });
    await expect(markSubmitted(deps, alice, r.id, { method: "web_form" })).rejects.toMatchObject({ code: "approval_required" });
    await expect(patchRequest(deps, alice, r.id, { status: "COMPLETED" })).rejects.toMatchObject({ code: "invalid_transition" });
    expect(d.status).toBe("DRAFT_READY");
  });
  it("approves only the exact content shown (hash must match)", async () => {
    const r = await foundRequest();
    const d = await generateDraft(deps, alice, r.id, { confirmOwnData: true });
    await expect(approveRequest(deps, alice, r.id, { confirmOwnData: true, draftHash: "0".repeat(64) })).rejects.toMatchObject({ code: "draft_changed" });
    expect(await statusOf(approveRequest(deps, alice, r.id, { confirmOwnData: false, draftHash: d.draftHash }))).toBe(400);
    const a = await approveRequest(deps, alice, r.id, { confirmOwnData: true, draftHash: d.draftHash });
    expect(a).toMatchObject({ status: "AWAITING_USER_ACTION", approved: true });
    const out = await exportDraft(deps, alice, r.id);
    expect(out.subject).toBe("Request to Remove My Personal Information");
    expect(await db.auditEvent.count({ where: { eventType: "REQUEST_DRAFT_EXPORTED" } })).toBe(1);
  });
  it("regenerating the draft revokes approval", async () => {
    const a = await approved();
    const d = await generateDraft(deps, alice, a.id, { confirmOwnData: true, includeEmail: true });
    expect(d).toMatchObject({ status: "DRAFT_READY", approved: false });
    await expect(exportDraft(deps, alice, a.id)).rejects.toMatchObject({ code: "approval_required" });
  });
  it("changing the listing link discards the draft and approval", async () => {
    const a = await approved();
    const p = await patchRequest(deps, alice, a.id, { listingUrl: `https://${DOMAIN}/p/other`, confirmOwnership: true });
    expect(p).toMatchObject({ status: "LISTING_FOUND", draft: null, approved: false });
  });
  it("validates replacement links against the source domain", async () => {
    const r = await foundRequest();
    await expect(patchRequest(deps, alice, r.id, { listingUrl: "https://evil.test/p", confirmOwnership: true })).rejects.toMatchObject({ code: "invalid_listing_url" });
    await expect(patchRequest(deps, alice, r.id, { listingUrl: URL1 })).rejects.toMatchObject({ code: "ownership_required" });
  });
});

describe("submission and tracking", () => {
  it("records submission, sets expected response and follow-up dates", async () => {
    const a = await approved();
    const s = await markSubmitted(deps, alice, a.id, { method: "web_form", expectedResponseDays: 30 });
    expect(s.status).toBe("SUBMITTED_BY_USER");
    const days = (s.expectedResponseAt!.getTime() - s.userSubmittedAt!.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(s.followUpAt).toEqual(s.expectedResponseAt);
  });
  it("rejects future and implausibly old submission dates", async () => {
    const a = await approved();
    expect(await statusOf(markSubmitted(deps, alice, a.id, { method: "email", submittedAt: new Date(Date.now() + 86_400_000) }))).toBe(400);
    await expect(markSubmitted(deps, alice, a.id, { method: "email", submittedAt: new Date(Date.now() - 400 * 86_400_000) })).rejects.toMatchObject({ status: 400 });
  });
  it("cannot be submitted twice", async () => {
    const a = await approved();
    await markSubmitted(deps, alice, a.id, { method: "mail" });
    await expect(markSubmitted(deps, alice, a.id, { method: "mail" })).rejects.toMatchObject({ code: "approval_required" });
  });
  it("walks to completion with history, completedAt and a clean audit trail", async () => {
    const a = await approved();
    await markSubmitted(deps, alice, a.id, { method: "web_form" });
    await patchRequest(deps, alice, a.id, { status: "IN_PROGRESS" });
    const done = await patchRequest(deps, alice, a.id, { status: "COMPLETED", confirmationReference: "REF-1" });
    expect(done.completedAt).toBeTruthy();
    expect(done.confirmationReference).toBe("REF-1");
    expect(done.history.map((h) => h.to)).toEqual(["LISTING_FOUND", "DRAFT_READY", "AWAITING_USER_ACTION", "SUBMITTED_BY_USER", "IN_PROGRESS", "COMPLETED"]);
    const events = await db.auditEvent.findMany({ where: { eventType: "REQUEST_STATUS_CHANGED" } });
    expect(events).toHaveLength(5);
    expect(JSON.stringify(events.map((e) => e.metadataRedactedJson))).not.toMatch(/REF-1|abc|Alexandra/);
  });
  it("rejects invalid transitions and guarded statuses set directly", async () => {
    const r = await foundRequest();
    expect(await statusOf(patchRequest(deps, alice, r.id, { status: "SUBMITTED_BY_USER" as never }))).toBe(400);
    expect(await statusOf(patchRequest(deps, alice, r.id, { status: "AWAITING_USER_ACTION" as never }))).toBe(400);
    await expect(patchRequest(deps, alice, r.id, { status: "COMPLETED" })).rejects.toMatchObject({ code: "invalid_transition" });
  });
  it("ARCHIVED is terminal", async () => {
    const r = await foundRequest();
    await patchRequest(deps, alice, r.id, { status: "ARCHIVED" });
    await expect(patchRequest(deps, alice, r.id, { status: "LISTING_FOUND" })).rejects.toMatchObject({ code: "invalid_transition" });
  });
  it("lists only the caller's requests and filters by status", async () => {
    await foundRequest();
    await createRequest(deps, alice, { sourceId, requestType: "OPT_OUT" });
    expect(await listRequests(deps, alice)).toHaveLength(2);
    expect(await listRequests(deps, alice, "NOT_STARTED")).toHaveLength(1);
    expect(await listRequests(deps, bob)).toEqual([]);
    await expect(listRequests(deps, alice, "BOGUS")).rejects.toThrow();
  });
});

describe("isolation", () => {
  it("another user cannot read, change, draft, approve, export or upload to a request", async () => {
    const a = await approved();
    const nf = { status: 404 };
    await expect(getRequest(deps, bob, a.id)).rejects.toMatchObject(nf);
    await expect(patchRequest(deps, bob, a.id, { notes: "x" })).rejects.toMatchObject(nf);
    await expect(generateDraft(deps, bob, a.id, { confirmOwnData: true, includeFullName: false })).rejects.toMatchObject(nf);
    await expect(approveRequest(deps, bob, a.id, { confirmOwnData: true, draftHash: a.draftHash })).rejects.toMatchObject(nf);
    await expect(exportDraft(deps, bob, a.id)).rejects.toMatchObject(nf);
    await expect(markSubmitted(deps, bob, a.id, { method: "mail" })).rejects.toMatchObject(nf);
    await expect(uploadEvidence(deps, bob, a.id, { filename: "x.png", contentType: "image/png", bytes: PNG })).rejects.toMatchObject(nf);
  });
});

describe("evidence", () => {
  it("stores files encrypted, returns them to the owner, and audits download", async () => {
    const r = await foundRequest();
    const ev = await uploadEvidence(deps, alice, r.id, { filename: "C:\\fakepath\\receipt.png", contentType: "image/png", bytes: PNG });
    expect([...storage.objects.values()].every((o) => !o.includes(PNG.subarray(4, 20)))).toBe(true);
    const got = await downloadEvidence(deps, alice, r.id, ev.id);
    expect(got.filename).toBe("receipt.png");
    expect(got.bytes.equals(PNG)).toBe(true);
    expect((await getRequest(deps, alice, r.id)).evidence).toHaveLength(1);
    expect(JSON.stringify(await db.evidenceFile.findMany())).not.toContain("receipt");
    expect(await db.auditEvent.count({ where: { eventType: "EVIDENCE_DOWNLOADED" } })).toBe(1);
  });
  it("rejects wrong types, mismatched content, empty and oversized files", async () => {
    const r = await foundRequest();
    const up = (contentType: string, bytes: Buffer) => uploadEvidence(deps, alice, r.id, { filename: "f", contentType, bytes });
    await expect(up("text/html", Buffer.from("<script>"))).rejects.toMatchObject({ status: 415 });
    await expect(up("image/png", Buffer.from("<script>alert(1)</script>"))).rejects.toMatchObject({ status: 415 });
    await expect(up("image/png", Buffer.alloc(0))).rejects.toMatchObject({ status: 413 });
    await expect(up("application/pdf", Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(5 * 1024 * 1024)]))).rejects.toMatchObject({ status: 413 });
  });
  it("another user cannot download or delete a file", async () => {
    const r = await foundRequest();
    const ev = await uploadEvidence(deps, alice, r.id, { filename: "a.png", contentType: "image/png", bytes: PNG });
    await expect(downloadEvidence(deps, bob, r.id, ev.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteEvidence(deps, bob, r.id, ev.id)).rejects.toMatchObject({ status: 404 });
  });
  it("deleting removes the stored object and scrubs identifying columns", async () => {
    const r = await foundRequest();
    const ev = await uploadEvidence(deps, alice, r.id, { filename: "a.png", contentType: "image/png", bytes: PNG });
    await deleteEvidence(deps, alice, r.id, ev.id);
    expect(storage.objects.size).toBe(0);
    await expect(downloadEvidence(deps, alice, r.id, ev.id)).rejects.toMatchObject({ status: 404 });
    const row = await db.evidenceFile.findFirstOrThrow();
    expect(row.deletedAt).toBeTruthy();
    expect(row.encryptedStorageKey.length).toBe(0);
    expect((await getRequest(deps, alice, r.id)).evidence).toEqual([]);
  });
  it("enforces a per-request file limit", async () => {
    const r = await foundRequest();
    for (let i = 0; i < 10; i++) await uploadEvidence(deps, alice, r.id, { filename: `${i}.png`, contentType: "image/png", bytes: PNG });
    await expect(uploadEvidence(deps, alice, r.id, { filename: "x.png", contentType: "image/png", bytes: PNG })).rejects.toMatchObject({ code: "too_many_files" });
  });
});
