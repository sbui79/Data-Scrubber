import { deleteAccount } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, body }) => deleteAccount(deps, session, await body(), ctx));
