import { completeSignup } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, body }) => completeSignup(deps, session, await body(), ctx), 201);
