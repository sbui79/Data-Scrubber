import { revokeBreakGlass } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, params }) => revokeBreakGlass(deps, session, params.id!, ctx));
