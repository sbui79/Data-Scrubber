import { createRequest, listRequests } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session, req }) => listRequests(deps, session, new URL(req.url).searchParams.get("status") ?? undefined));
export const POST = handle(async ({ deps, session, ctx, body }) => createRequest(deps, session, await body(), ctx), 201);
