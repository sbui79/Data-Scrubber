import "server-only";
import { loadEnv } from "@privatepath/config";
import { MockKms } from "@privatepath/crypto";
import { authenticate, toErrorResponse, type Deps, type RequestContext, type Session } from "@privatepath/core";
import { createPrisma } from "@privatepath/db";

const MAX_BODY_BYTES = 32_000;

let cached: { deps: Deps; authMode: "mock" | "clerk" } | undefined;

function getDeps() {
  if (cached) return cached;
  const env = loadEnv();
  if (!env.MOCK_KMS_MASTER_KEY) throw new Error("Invalid environment: MOCK_KMS_MASTER_KEY");
  cached = {
    authMode: env.AUTH_MODE,
    deps: {
      db: createPrisma(env.DATABASE_URL),
      kms: new MockKms(Buffer.from(env.MOCK_KMS_MASTER_KEY, "base64")),
      hashPepper: env.HASH_PEPPER,
      requireAdminMfa: env.NODE_ENV === "production",
    },
  };
  return cached;
}

/** Wraps a handler: authenticates, builds context, limits body size, maps errors without leaking data. */
export function handle(fn: (a: { deps: Deps; session: Session; ctx: RequestContext; body: () => Promise<unknown>; params: Record<string, string> }) => Promise<unknown>, successStatus = 200) {
  return async (req: Request, route: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const { deps, authMode } = getDeps();
      const session = authenticate(req.headers, authMode);
      const ctx: RequestContext = {
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: req.headers.get("user-agent") ?? undefined,
      };
      const body = async () => {
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) throw Object.assign(new Error("too large"), { tooLarge: true });
        try { return JSON.parse(text); } catch { return undefined; }
      };
      const params = (await route.params) ?? {};
      const result = await fn({ deps, session, ctx, body, params });
      return Response.json(result, { status: successStatus, headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      // Log the error class only; never the message or payload, which could contain personal data.
      if (status === 500) console.error("request failed:", err instanceof Error ? err.name : "unknown");
      return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    }
  };
}
