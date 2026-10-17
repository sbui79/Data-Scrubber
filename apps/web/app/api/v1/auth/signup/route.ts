import { completeSignup } from "@privatepath/core";
import { handle, strict } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, body }) => completeSignup(deps, session, await body(), ctx), 201, strict("signup"));
