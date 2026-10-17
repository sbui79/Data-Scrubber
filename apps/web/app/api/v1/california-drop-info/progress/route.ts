import { setCaliforniaStep } from "@privatepath/core";
import { handle } from "@/lib/server";

export const PATCH = handle(async ({ deps, session, ctx, body }) => setCaliforniaStep(deps, session, await body(), ctx));
