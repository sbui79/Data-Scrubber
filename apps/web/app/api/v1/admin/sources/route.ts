import { adminCreateSource, adminListSources } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session }) => adminListSources(deps, session));
export const POST = handle(async ({ deps, session, ctx, body }) => adminCreateSource(deps, session, await body(), ctx), 201);
