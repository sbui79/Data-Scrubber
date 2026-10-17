import { createSupportCase, listMySupportCases } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session }) => listMySupportCases(deps, session));
export const POST = handle(async ({ deps, session, ctx, body }) => createSupportCase(deps, session, await body(), ctx), 201);
