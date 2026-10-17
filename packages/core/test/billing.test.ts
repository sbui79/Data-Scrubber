import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { MockKms } from "@privatepath/crypto";
import { createPrisma } from "@privatepath/db";
import {
  BILLING_POLICY, cancelSubscription, completeSignup, deleteAccount, exportData, getBilling, listPlans, mockCheckout, setMarketingConsent,
  toErrorResponse, type Deps, type Session,
} from "../src";

const db = createPrisma(process.env.TEST_DATABASE_URL ?? "postgresql://stevenbui@localhost:5432/privatepath_test");
const deps: Deps = { db, kms: new MockKms(randomBytes(32)), hashPepper: "test-pepper-0123456789", mockBilling: true };
const off: Deps = { ...deps, mockBilling: false };
const mk = (n: string): Session => ({ authProviderId: `mock_${n}`, email: `${n}@example.test` });
const [alice, bob] = [mk("alice"), mk("bob")];
const consents = (n: string) => ({ displayName: n, acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true });
const statusOf = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return toErrorResponse(e).status; } };

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User","AuditEvent" RESTART IDENTITY CASCADE');
  for (const s of [alice, bob]) await completeSignup(deps, s, consents(s.authProviderId));
});
afterAll(() => db.$disconnect());

describe("mock billing", () => {
  it("lists placeholder plans with no prices and says deletion/export are always free", () => {
    const p = listPlans(true);
    expect(p.plans.map((x) => x.id)).toEqual(["FREE", "CLEANUP_ONE_TIME", "MONITORING_MONTHLY"]);
    expect(p.plans.filter((x) => x.id !== "FREE").every((x) => /to be announced/i.test(x.price))).toBe(true);
    expect(BILLING_POLICY.alwaysFree).toMatch(/deleting your account.*always free/i);
    expect(listPlans(false).mode).toBe("disabled");
  });
  it("checkout records a plan with no payment; duplicates and disabled billing are refused", async () => {
    const s = await mockCheckout(deps, alice, { plan: "MONITORING_MONTHLY" });
    expect(s).toMatchObject({ plan: "MONITORING_MONTHLY", status: "ACTIVE" });
    expect(await statusOf(mockCheckout(deps, alice, { plan: "MONITORING_MONTHLY" }))).toBe(409);
    expect(await statusOf(mockCheckout(off, bob, { plan: "CLEANUP_ONE_TIME" }))).toBe(501);
    expect(await statusOf(mockCheckout(deps, bob, { plan: "FREE" }))).toBe(400);
    expect((await getBilling(deps, alice)).current).toHaveLength(1);
    expect((await getBilling(deps, bob)).current).toHaveLength(0);
  });
  it("only the owner can cancel", async () => {
    const s = await mockCheckout(deps, alice, { plan: "MONITORING_MONTHLY" });
    expect(await statusOf(cancelSubscription(deps, bob, s.id))).toBe(404);
    expect((await cancelSubscription(deps, alice, s.id)).status).toBe("CANCELLED");
    expect(await statusOf(cancelSubscription(deps, alice, s.id))).toBe(404);
  });
  it("export and deletion work with no plan, and with an active one (never gated)", async () => {
    expect((await exportData(deps, bob)).account.email).toBe("bob@example.test");
    await mockCheckout(deps, alice, { plan: "MONITORING_MONTHLY" });
    expect((await exportData(deps, alice)).subscriptions).toHaveLength(1);
    await deleteAccount(deps, alice, { confirm: "DELETE" });
    expect(await db.subscription.count()).toBe(0);
    await deleteAccount(deps, bob, { confirm: "DELETE" });
  });
});

describe("marketing consent", () => {
  it("is off by default, can be granted and revoked, and is recorded each time", async () => {
    const get = () => db.user.findFirstOrThrow({ where: { authProviderId: "mock_alice" } });
    expect((await get()).marketingConsentAt).toBeNull();
    await setMarketingConsent(deps, alice, { optIn: true });
    expect((await get()).marketingConsentAt).toBeTruthy();
    await setMarketingConsent(deps, alice, { optIn: true }); // idempotent
    expect(await db.consentRecord.count({ where: { consentType: "MARKETING" } })).toBe(1);
    await setMarketingConsent(deps, alice, { optIn: false });
    expect((await get()).marketingConsentAt).toBeNull();
    expect((await db.consentRecord.findFirstOrThrow({ where: { consentType: "MARKETING" } })).revokedAt).toBeTruthy();
    const types = (await db.auditEvent.findMany({ orderBy: { seq: "asc" } })).map((e) => e.eventType).filter((t) => t.startsWith("CONSENT_") && t !== "CONSENT_GRANTED" || t === "CONSENT_REVOKED");
    expect(types).toContain("CONSENT_REVOKED");
  });
});
