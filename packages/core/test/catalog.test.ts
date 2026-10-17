import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { MockKms } from "@privatepath/crypto";
import { createPrisma } from "@privatepath/db";
import {
  adminApproveVersion, adminCreateSource, adminListSources, adminProposeUpdate, completeSignup,
  createListingReview, getSource, listMyListingReviews, listSources, updateListingReview,
  type Deps, type Session,
} from "../src";

const db = createPrisma(process.env.TEST_DATABASE_URL ?? "postgresql://stevenbui@localhost:5432/privatepath_test");
const deps: Deps = { db, kms: new MockKms(randomBytes(32)), hashPepper: "test-pepper-0123456789" };
const mk = (n: string): Session => ({ authProviderId: `mock_${n}`, email: `${n}@example.test` });
const [adminA, adminB, alice, bob, plain] = ["adminA", "adminB", "alice", "bob", "plain"].map(mk) as [Session, Session, Session, Session, Session];
const consents = (n: string) => ({ displayName: n, acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true });
const src = (over = {}) => ({
  name: "Example Broker One", domain: "example-broker-one.test", category: "People search",
  officialOptOutUrl: "https://example-broker-one.test/optout", instructionsMarkdown: "Demo only.",
  verificationMethod: "Email confirmation", difficulty: 2, sourceStatus: "AVAILABLE", lastReviewedAt: "2026-10-01", ...over,
});

async function publish(over = {}) {
  const s = await adminCreateSource(deps, adminA, src(over));
  await adminApproveVersion(deps, adminB, s.id, 1);
  return s.id;
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User","AuditEvent","Source" RESTART IDENTITY CASCADE');
  for (const s of [adminA, adminB, alice, bob, plain]) await completeSignup(deps, s, consents(s.authProviderId));
  await db.user.updateMany({ where: { authProviderId: { in: ["mock_adminA", "mock_adminB"] } }, data: { role: "COMPLIANCE_ADMIN" } });
});
afterAll(() => db.$disconnect());

describe("source catalog workflow", () => {
  it("non-admins cannot create or list admin data", async () => {
    await expect(adminCreateSource(deps, plain, src())).rejects.toMatchObject({ status: 403 });
    await expect(adminListSources(deps, plain)).rejects.toMatchObject({ status: 403 });
  });
  it("requires MFA for admins when enforced", async () => {
    await expect(adminCreateSource({ ...deps, requireAdminMfa: true }, adminA, src())).rejects.toMatchObject({ code: "mfa_required" });
    await expect(adminCreateSource({ ...deps, requireAdminMfa: true }, { ...adminA, mfa: true }, src())).resolves.toBeTruthy();
  });
  it("a pending source is invisible to users", async () => {
    const s = await adminCreateSource(deps, adminA, src());
    expect(await listSources(deps, alice)).toEqual([]);
    await expect(getSource(deps, alice, s.id)).rejects.toMatchObject({ status: 404 });
  });
  it("the creator cannot approve their own source", async () => {
    const s = await adminCreateSource(deps, adminA, src());
    await expect(adminApproveVersion(deps, adminA, s.id, 1)).rejects.toMatchObject({ code: "second_reviewer_required" });
  });
  it("only compliance admins approve", async () => {
    const s = await adminCreateSource(deps, adminA, src());
    await db.user.updateMany({ where: { authProviderId: "mock_adminB" }, data: { role: "SYSTEM_ADMIN" } });
    await expect(adminApproveVersion(deps, adminB, s.id, 1)).rejects.toMatchObject({ status: 403 });
  });
  it("an approved source becomes visible and labeled as a demo example", async () => {
    const id = await publish();
    const list = await listSources(deps, alice);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, isDemo: true, status: "AVAILABLE", version: 1 });
    expect(list[0]!.notice).toMatch(/not verified as current/i);
  });
  it("rejects an opt-out URL on a different domain", async () => {
    await expect(adminCreateSource(deps, adminA, src({ officialOptOutUrl: "https://evil.test/optout" }))).rejects.toMatchObject({ code: "invalid_official_url" });
  });
  it("a proposed change stays hidden until a different reviewer approves it", async () => {
    const id = await publish();
    const p = await adminProposeUpdate(deps, adminB, id, { instructionsMarkdown: "Changed.", difficulty: 4 });
    expect(p.version).toBe(2);
    expect((await getSource(deps, alice, id)).instructionsMarkdown).toBe("Demo only.");
    await expect(adminApproveVersion(deps, adminB, id, 2)).rejects.toMatchObject({ code: "second_reviewer_required" });
    await adminApproveVersion(deps, adminA, id, 2);
    expect(await getSource(deps, alice, id)).toMatchObject({ instructionsMarkdown: "Changed.", difficulty: 4, version: 2 });
    expect(await db.sourceVersion.count({ where: { sourceId: id } })).toBe(2);
  });
  it("cannot approve the same version twice", async () => {
    const id = await publish();
    await expect(adminApproveVersion(deps, adminA, id, 1)).rejects.toMatchObject({ code: "already_approved" });
  });
  it("audits each step without personal data", async () => {
    await publish();
    const types = (await db.auditEvent.findMany({ orderBy: { seq: "asc" } })).map((e) => e.eventType).filter((t) => t.startsWith("SOURCE"));
    expect(types).toEqual(["SOURCE_PROPOSED", "SOURCE_APPROVED"]);
  });
});

describe("listing reviews", () => {
  it("records found / not found / not sure without any URL", async () => {
    const id = await publish();
    const r = await createListingReview(deps, alice, { sourceId: id, status: "NOT_FOUND" });
    expect(r).toMatchObject({ status: "NOT_FOUND", listingUrl: null });
  });
  it("cannot review an unpublished source", async () => {
    const s = await adminCreateSource(deps, adminA, src());
    await expect(createListingReview(deps, alice, { sourceId: s.id, status: "NOT_FOUND" })).rejects.toMatchObject({ status: 404 });
  });
  it("requires ownership confirmation to store a URL", async () => {
    const id = await publish();
    const url = "https://example-broker-one.test/p/abc";
    await expect(createListingReview(deps, alice, { sourceId: id, status: "FOUND", listingUrl: url })).rejects.toMatchObject({ code: "ownership_required" });
    await expect(createListingReview(deps, alice, { sourceId: id, status: "NOT_SURE", listingUrl: url, confirmOwnership: true })).rejects.toMatchObject({ status: 400 });
  });
  it("rejects URLs outside the source's domain", async () => {
    const id = await publish();
    await expect(createListingReview(deps, alice, { sourceId: id, status: "FOUND", listingUrl: "https://evil.test/p/1", confirmOwnership: true }))
      .rejects.toMatchObject({ code: "invalid_listing_url" });
  });
  it("stores the URL and notes encrypted, and returns them only to the owner", async () => {
    const id = await publish();
    const url = "https://example-broker-one.test/p/abc";
    const r = await createListingReview(deps, alice, { sourceId: id, status: "FOUND", listingUrl: url, confirmOwnership: true, notes: "my old address shows" });
    expect(r.listingUrl).toBe(url);
    expect(r.ownershipConfirmedAt).toBeTruthy();
    const raw = JSON.stringify(await db.listingReview.findMany());
    expect(raw).not.toContain("p/abc");
    expect(raw).not.toContain("old address");
    expect(await listMyListingReviews(deps, bob)).toEqual([]);
  });
  it("one review per source; another user cannot read or modify it", async () => {
    const id = await publish();
    const r = await createListingReview(deps, alice, { sourceId: id, status: "NOT_SURE" });
    await expect(createListingReview(deps, alice, { sourceId: id, status: "NOT_SURE" })).rejects.toMatchObject({ status: 409 });
    await expect(updateListingReview(deps, bob, r.id, { status: "NOT_FOUND" })).rejects.toMatchObject({ status: 404 });
    expect((await listMyListingReviews(deps, alice))[0]!.status).toBe("NOT_SURE");
  });
  it("changing away from FOUND clears the stored link and attestation", async () => {
    const id = await publish();
    const r = await createListingReview(deps, alice, { sourceId: id, status: "FOUND", listingUrl: "https://example-broker-one.test/p/1", confirmOwnership: true });
    const u = await updateListingReview(deps, alice, r.id, { status: "NOT_FOUND" });
    expect(u).toMatchObject({ listingUrl: null, ownershipConfirmedAt: null });
  });
  it("audit metadata contains ids and status only", async () => {
    const id = await publish();
    await createListingReview(deps, alice, { sourceId: id, status: "FOUND", listingUrl: "https://example-broker-one.test/p/1", confirmOwnership: true, notes: "n" });
    const ev = await db.auditEvent.findFirstOrThrow({ where: { eventType: "LISTING_REVIEW_SAVED" } });
    expect(ev.metadataRedactedJson).toEqual({ sourceId: id, toStatus: "FOUND" });
  });
});
