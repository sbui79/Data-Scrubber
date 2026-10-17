import { markSubmitted } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, body, params }) => markSubmitted(deps, session, params.id!, await body(), ctx));
