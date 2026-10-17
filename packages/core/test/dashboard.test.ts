import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { MockKms } from "@privatepath/crypto";
import { createPrisma } from "@privatepath/db";
import {
  adminApproveVersion, adminCreateSource, approveRequest, CALIFORNIA_INFO, completeSignup, createListingReview, createProfile,
  createRequest, estimateProgress, generateDraft, getCaliforniaInfo, getDashboard, markSubmitted, patchRequest, setCaliforniaStep,
  toErrorResponse, type Deps, type Session,
} from "../src";

describe("estimateProgress", () => {
  it("is null (no claim) when there is nothing to measure", () => {
    expect(estimateProgress([]).percent).toBeNull();
    expect(estimateProgress(["ARCHIVED", "LISTING_NOT_FOUND"]).percent).toBeNull();
  });
  it("always labels itself an estimate and averages weights", () => {
    expect(estimateProgress(["COMPLETED"])).toEqual({ percent: 100, label: "Estimated" });
    expect(estimateProgress(["COMPLETED", "NOT_STARTED"]).percent).toBe(50);
    expect(estimateProgress(["SUBMITTED_BY_USER", "SUBMITTED_BY_USER"]).percent).toBe(50);
  });
  it("does not credit denied requests", () => {
    expect(estimateProgress(["COMPLETED", "DENIED_UNAVAILABLE"]).percent).toBe(50);
  });
});

describe("california content", () => {
  it("links only to official state domains and states the external-process limits", () => {
    for (const l of CALIFORNIA_INFO.officialLinks) expect(new URL(l.url).hostname).toMatch(/(^|\.)ca\.gov$/);
    expect(CALIFORNIA_INFO.externalProcessNotice).toMatch(/never asks for your state or government login/i);
    expect(CALIFORNIA_INFO.checklist).toHaveLength(5);
    expect(CALIFORNIA_INFO.needsLegalReview).toBe(true);
  });
});

const db = createPrisma(process.env.TEST_DATABASE_URL ?? "postgresql://stevenbui@localhost:5432/privatepath_test");
const deps: Deps = { db, kms: new MockKms(randomBytes(32)), hashPepper: "test-pepper-0123456789" };
const mk = (n: string): Session => ({ authProviderId: `mock_${n}`, email: `${n}@example.test` });
const [adminA, adminB, alice, bob] = ["adminA", "adminB", "alice", "bob"].map(mk) as [Session, Session, Session, Session];
const consents = (n: string) => ({ displayName: n, acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true });
const src = (n: number) => ({ name: `Example Broker ${n}`, domain: `example-broker-${n}.test`, category: "c", officialOptOutUrl: `https://example-broker-${n}.test/o`,
  instructionsMarkdown: "x", verificationMethod: "v", difficulty: 1, sourceStatus: "AVAILABLE", lastReviewedAt: "2026-10-01" });

let ids: string[];
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User","AuditEvent","Source" RESTART IDENTITY CASCADE');
  for (const s of [adminA, adminB, alice, bob]) await completeSignup(deps, s, consents(s.authProviderId));
  await db.user.updateMany({ where: { authProviderId: { in: ["mock_adminA", "mock_adminB"] } }, data: { role: "COMPLIANCE_ADMIN" } });
  ids = [];
  for (const n of [1, 2, 3]) { const s = await adminCreateSource(deps, adminA, src(n)); await adminApproveVersion(deps, adminB, s.id, 1); ids.push(s.id); }
});
afterAll(() => db.$disconnect());

describe("dashboard", () => {
  it("guides a brand-new user step by step and makes no progress claim", async () => {
    let d = await getDashboard(deps, alice);
    expect(d.nextAction.code).toBe("complete_profile");
    expect(d.progress).toMatchObject({ percent: null, label: "Estimated" });
    await createProfile(deps, alice, { legalFirstName: "A", legalLastName: "B" });
    d = await getDashboard(deps, alice);
    expect(d.nextAction.code).toBe("review_sources");
  });
  it("tracks counts and the next action through the workflow", async () => {
    await createProfile(deps, alice, { legalFirstName: "Alexandra", legalLastName: "Demoperson" });
    await createListingReview(deps, alice, { sourceId: ids[0]!, status: "NOT_FOUND" });
    const lr = await createListingReview(deps, alice, { sourceId: ids[1]!, status: "FOUND" });
    let d = await getDashboard(deps, alice);
    expect(d.stats).toMatchObject({ sourcesReviewed: 2, listingsFound: 1, requestsDrafted: 0 });
    expect(d.nextAction.code).toBe("start_request");

    const r = await createRequest(deps, alice, { sourceId: ids[1]!, requestType: "OPT_OUT", listingReviewId: lr.id });
    d = await getDashboard(deps, alice);
    expect(d.nextAction.code).toBe("draft");
    const dr = await generateDraft(deps, alice, r.id, { confirmOwnData: true });
    d = await getDashboard(deps, alice);
    expect(d.nextAction.code).toBe("approve");
    expect(d.needingAttention).toEqual([{ id: r.id, sourceName: "Example Broker 2", status: "DRAFT_READY" }]);
    await approveRequest(deps, alice, r.id, { confirmOwnData: true, draftHash: dr.draftHash });
    expect((await getDashboard(deps, alice)).nextAction.code).toBe("submit");
    await markSubmitted(deps, alice, r.id, { method: "web_form" });
    d = await getDashboard(deps, alice);
    expect(d.stats).toMatchObject({ requestsDrafted: 1, requestsSubmitted: 1, confirmedRemovals: 0 });
    expect(d.progress.percent).toBe(50);
    expect(d.upcomingFollowUps).toMatchObject([{ type: "FOLLOWUP_30", removalRequestId: r.id }]); // the default follow-up
    await patchRequest(deps, alice, r.id, { status: "COMPLETED" });
    d = await getDashboard(deps, alice);
    expect(d.stats.confirmedRemovals).toBe(1);
    expect(d.progress.percent).toBe(100);
    expect(d.recentCompleted).toHaveLength(1);
  });
  it("counts a submitted request past its follow-up date as due", async () => {
    await createProfile(deps, alice, { legalFirstName: "A", legalLastName: "B" });
    const r = await createRequest(deps, alice, { sourceId: ids[0]!, requestType: "OPT_OUT" });
    await patchRequest(deps, alice, r.id, { status: "LISTING_FOUND" });
    const dr = await generateDraft(deps, alice, r.id, { confirmOwnData: true });
    await approveRequest(deps, alice, r.id, { confirmOwnData: true, draftHash: dr.draftHash });
    await markSubmitted(deps, alice, r.id, { method: "email", submittedAt: new Date(Date.now() - 40 * 86_400_000) });
    expect((await getDashboard(deps, alice)).stats.followUpsDue).toBe(1);
  });
  it("only ever reflects the caller's own data", async () => {
    await createProfile(deps, alice, { legalFirstName: "A", legalLastName: "B" });
    await createListingReview(deps, alice, { sourceId: ids[0]!, status: "FOUND" });
    const d = await getDashboard(deps, bob);
    expect(d.stats).toMatchObject({ sourcesReviewed: 0, listingsFound: 0 });
  });
});

describe("california progress", () => {
  it("records and clears self-reported steps; rejects unknown steps", async () => {
    await setCaliforniaStep(deps, alice, { step: 1, done: true });
    const info = await setCaliforniaStep(deps, alice, { step: 3, done: true });
    expect(info.completedSteps).toEqual([1, 3]);
    expect((await setCaliforniaStep(deps, alice, { step: 1, done: false })).completedSteps).toEqual([3]);
    const bad = await setCaliforniaStep(deps, alice, { step: 9, done: true }).then(() => null, (e) => e);
    expect(toErrorResponse(bad).status).toBe(400);
    expect((await getCaliforniaInfo(deps, bob)).completedSteps).toEqual([]);
  });
});
