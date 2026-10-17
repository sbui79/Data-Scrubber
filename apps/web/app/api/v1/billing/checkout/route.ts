import { mockCheckout } from "@privatepath/core";
import { handle, strict } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, body }) => mockCheckout(deps, session, await body(), ctx), 201, strict("billing"));
