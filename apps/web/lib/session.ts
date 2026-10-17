import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "@privatepath/core";
import { getServerDeps, MOCK_COOKIE, parseMockCookie } from "./server";

/** Signed-in session for server-rendered pages. Until Clerk is wired up this is the dev-login cookie (mock mode only). */
export async function currentSession(): Promise<Session | null> {
  const { authMode } = getServerDeps();
  if (authMode !== "mock") return null;
  const jar = await cookies();
  const v = jar.get(MOCK_COOKIE)?.value;
  return parseMockCookie(v ? `${MOCK_COOKIE}=${v}` : null);
}

/** For pages inside the app shell: must be signed in AND onboarded. */
export async function requireOnboarded() {
  const { deps } = getServerDeps();
  const session = await currentSession();
  if (!session) redirect("/dev-login");
  const user = await deps.db.user.findUnique({ where: { authProviderId: session.authProviderId } });
  if (!user || user.deletedAt) redirect("/onboarding");
  return { deps, session, user };
}

/** For the staff area. Non-staff get a plain 404 so the area isn't advertised. */
export async function requireStaff() {
  const ctx = await requireOnboarded();
  if (!["SUPPORT", "COMPLIANCE_ADMIN", "SYSTEM_ADMIN"].includes(ctx.user.role)) notFound();
  return ctx;
}
