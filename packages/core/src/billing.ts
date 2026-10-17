import { z } from "zod";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { requireUser } from "./users";

/** Placeholder plans. Prices are intentionally unset. Refund/cancellation text needs counsel. */
export const PLANS = [
  { id: "FREE", name: "Free assessment", kind: "free", price: "Free", features: ["Guided exposure assessment", "Source directory", "Dashboard and reminders"] },
  { id: "CLEANUP_ONE_TIME", name: "One-time privacy cleanup package", kind: "one_time", price: "Price to be announced", features: ["Everything in Free", "Guided request preparation for all available sources", "Proof storage"] },
  { id: "MONITORING_MONTHLY", name: "Monthly monitoring", kind: "subscription", price: "Price to be announced", features: ["Everything in the cleanup package", "Periodic re-check reminders", "Priority support"] },
] as const;

export const BILLING_POLICY = {
  alwaysFree: "Exporting your data and deleting your account are always free and never require a paid plan.",
  cancellation: "Placeholder: cancellation terms to be written and reviewed by counsel.",
  refunds: "Placeholder: refund policy to be written and reviewed by counsel.",
  noGuarantee: "No plan guarantees removal from any site.",
} as const;

export const CheckoutInput = z.object({ plan: z.enum(["CLEANUP_ONE_TIME", "MONITORING_MONTHLY"]) });

export function listPlans(mockBilling: boolean) {
  return { mode: mockBilling ? "mock" : "disabled", notice: mockBilling ? "Mock billing: no payment is taken." : "Billing isn't enabled yet.", plans: PLANS, policy: BILLING_POLICY };
}

const present = (s: { id: string; plan: string; status: string; startedAt: Date; cancelledAt: Date | null }) =>
  ({ id: s.id, plan: s.plan, status: s.status, startedAt: s.startedAt, cancelledAt: s.cancelledAt });

export async function getBilling(deps: Deps, session: Session) {
  const user = await requireUser(deps, session);
  const subs = await deps.db.subscription.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" } });
  return { ...listPlans(!!deps.mockBilling), current: subs.filter((s) => s.status === "ACTIVE").map(present), history: subs.map(present) };
}

/** Mock checkout: records an ACTIVE plan, takes no payment. Refused unless mock billing is on (never in production). */
export async function mockCheckout(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const { plan } = CheckoutInput.parse(raw);
  const user = await requireUser(deps, session);
  if (!deps.mockBilling) throw new AppError(501, "billing_disabled", "Billing isn't available yet.");
  if (await deps.db.subscription.findFirst({ where: { userId: user.id, plan, status: "ACTIVE" } })) throw new AppError(409, "already_active", "You already have this plan.");
  return deps.db.$transaction(async (tx) => {
    const s = await tx.subscription.create({ data: { userId: user.id, plan, status: "ACTIVE", mockReference: `mock_${crypto.randomUUID()}` } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "BILLING_MOCK_CHECKOUT", entityType: "Subscription", entityId: s.id, metadata: { reason: plan } });
    return present(s);
  });
}

export async function cancelSubscription(deps: Deps, session: Session, id: string, ctx: RequestContext = {}) {
  const user = await requireUser(deps, session);
  return deps.db.$transaction(async (tx) => {
    const res = await tx.subscription.updateMany({ where: { id, userId: user.id, status: "ACTIVE" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    if (res.count !== 1) throw new AppError(404, "subscription_not_found", "Subscription not found.");
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "BILLING_CANCELLED", entityType: "Subscription", entityId: id, metadata: {} });
    return present(await tx.subscription.findUniqueOrThrow({ where: { id } }));
  });
}

// ---- Marketing consent (separate from required consents; revocable any time) ----

export const MarketingInput = z.object({ optIn: z.boolean() });

export async function setMarketingConsent(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const { optIn } = MarketingInput.parse(raw);
  const user = await requireUser(deps, session);
  const active = await deps.db.consentRecord.findFirst({ where: { userId: user.id, consentType: "MARKETING", revokedAt: null } });
  await deps.db.$transaction(async (tx) => {
    const now = new Date();
    if (optIn && !active) {
      await tx.consentRecord.create({ data: { userId: user.id, consentType: "MARKETING", policyVersion: user.privacyPolicyVersionAccepted ?? "unknown", grantedAt: now } });
      await tx.user.update({ where: { id: user.id }, data: { marketingConsentAt: now } });
      await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "CONSENT_GRANTED", entityType: "ConsentRecord", entityId: user.id, metadata: { consentType: "MARKETING" } });
    } else if (!optIn && active) {
      await tx.consentRecord.update({ where: { id: active.id }, data: { revokedAt: now } });
      await tx.user.update({ where: { id: user.id }, data: { marketingConsentAt: null } });
      await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "CONSENT_REVOKED", entityType: "ConsentRecord", entityId: user.id, metadata: { consentType: "MARKETING" } });
    }
  });
  return { marketing: optIn };
}
