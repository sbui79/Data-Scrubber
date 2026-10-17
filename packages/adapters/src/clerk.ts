import { verifyToken } from "@clerk/backend";

export interface ClerkVerifyOptions {
  /** PEM public key for networkless verification (Clerk Dashboard > API keys > JWKS public key). */
  jwtKey?: string;
  /** Alternative: verify against Clerk's JWKS endpoint using the secret key. */
  secretKey?: string;
  /** Allowed `azp` origins (your app URLs). Strongly recommended. */
  authorizedParties?: string[];
}

export interface VerifiedIdentity {
  subject: string;
  /** From a custom session-token claim `email` (Clerk Dashboard > Sessions > Customize session token). */
  email?: string;
  /** True when the session reports a verified second factor. */
  mfa: boolean;
}

/** Verifies a Clerk session JWT (signature, expiry, not-before, authorized party). Throws on any problem. */
export async function verifyClerkToken(token: string, opts: ClerkVerifyOptions): Promise<VerifiedIdentity> {
  const p = await verifyToken(token, { jwtKey: opts.jwtKey, secretKey: opts.secretKey, authorizedParties: opts.authorizedParties });
  const email = typeof (p as Record<string, unknown>).email === "string" ? ((p as Record<string, unknown>).email as string) : undefined;
  // `fva` = [minutes since first factor, minutes since second factor]; -1 means the factor isn't verified. (Clerk marks this claim experimental.)
  const fva = (p as { fva?: unknown }).fva;
  const mfa = Array.isArray(fva) && typeof fva[1] === "number" && fva[1] >= 0;
  return { subject: p.sub, email, mfa };
}
