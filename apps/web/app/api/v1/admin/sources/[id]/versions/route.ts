import { adminProposeUpdate } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, body, params }) => adminProposeUpdate(deps, session, params.id!, await body(), ctx), 201);
