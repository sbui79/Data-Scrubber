import { AppError } from "./errors";

export interface Session {
  authProviderId: string;
  email: string;
  /** True when the identity provider reports a completed MFA challenge. */
  mfa?: boolean;
}

/**
 * Resolves the caller. Mock mode (local dev/tests only) trusts x-mock-* headers;
 * config validation forbids it in production. Clerk mode will verify the JWT.
 */
export function authenticate(headers: { get(name: string): string | null }, mode: "mock" | "clerk"): Session {
  if (mode === "mock") {
    const id = headers.get("x-mock-auth-id");
    const email = headers.get("x-mock-email");
    if (id && email) return { authProviderId: id, email };
  }
  throw new AppError(401, "unauthenticated", "Please sign in to continue.");
}
