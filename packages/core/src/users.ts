import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateDek, hmacHash } from "@privatepath/crypto";
import type { Deps, RequestContext } from "./deps";
import { PRIVACY_VERSION, TERMS_VERSION } from "./deps";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import type { Session } from "./auth";

export const SignupInput = z.object({
  displayName: z.string().trim().min(1).max(40),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  authorizeOwnData: z.literal(true),
  marketingConsent: z.boolean().default(false),
});

/** Completes onboarding for an already-authenticated identity: user, key, consents, audit. */
export async function completeSignup(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const input = SignupInput.parse(raw);
  const existing = await deps.db.user.findUnique({ where: { authProviderId: session.authProviderId } });
  if (existing) throw new AppError(409, "already_onboarded", "This account is already set up.");

  const dek = generateDek();
  const { wrapped, keyId } = await deps.kms.wrap(dek);
  const now = new Date();
  const ipH = ctx.ip ? hmacHash(ctx.ip, deps.hashPepper) : null;
  const uaH = ctx.userAgent ? hmacHash(ctx.userAgent, deps.hashPepper) : null;

  return deps.db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: session.email, displayName: input.displayName, authProviderId: session.authProviderId,
        termsVersionAccepted: TERMS_VERSION, privacyPolicyVersionAccepted: PRIVACY_VERSION,
        marketingConsentAt: input.marketingConsent ? now : null,
        key: { create: { wrappedDek: wrapped, kmsKeyId: keyId } },
      },
    });
    const consents = [
      { consentType: "TERMS", policyVersion: TERMS_VERSION },
      { consentType: "PRIVACY_POLICY", policyVersion: PRIVACY_VERSION },
      { consentType: "AUTHORIZE_OWN_DATA_PROCESSING", policyVersion: PRIVACY_VERSION },
      ...(input.marketingConsent ? [{ consentType: "MARKETING", policyVersion: PRIVACY_VERSION }] : []),
    ];
    for (const c of consents) {
      await tx.consentRecord.create({
        data: { userId: user.id, ...c, grantedAt: now, ipAddressHashed: ipH, userAgentHashed: uaH },
      });
      await writeAudit(tx, deps, ctx, {
        actorUserId: user.id, targetUserId: user.id, eventType: "CONSENT_GRANTED",
        entityType: "ConsentRecord", entityId: user.id,
        metadata: { consentType: c.consentType, policyVersion: c.policyVersion },
      });
    }
    return { id: user.id, displayName: user.displayName };
  });
}

export async function requireUser(deps: Deps, session: Session) {
  const user = await deps.db.user.findUnique({ where: { authProviderId: session.authProviderId } });
  if (!user || user.deletedAt) throw new AppError(403, "not_onboarded", "Please finish setting up your account.");
  return user;
}

export async function getUserDek(deps: Deps, userId: string): Promise<Buffer> {
  const key = await deps.db.userKey.findUnique({ where: { userId } });
  if (!key) throw new AppError(409, "key_unavailable", "Your data is unavailable.");
  return deps.kms.unwrap(Buffer.from(key.wrappedDek), key.kmsKeyId);
}

export { randomUUID };
