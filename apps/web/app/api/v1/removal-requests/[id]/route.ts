import { getRequest, patchRequest } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session, params }) => getRequest(deps, session, params.id!));
export const PATCH = handle(async ({ deps, session, ctx, body, params }) => patchRequest(deps, session, params.id!, await body(), ctx));
