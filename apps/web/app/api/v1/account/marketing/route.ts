import { setMarketingConsent } from "@privatepath/core";
import { handle } from "@/lib/server";

export const PATCH = handle(async ({ deps, session, ctx, body }) => setMarketingConsent(deps, session, await body(), ctx));
