import { deleteAccount } from "@privatepath/core";
import { handle, strict } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, body }) => deleteAccount(deps, session, await body(), ctx), 200, strict("account-delete"));
