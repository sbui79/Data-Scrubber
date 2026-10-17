import { cancelSubscription } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, params }) => cancelSubscription(deps, session, params.id!, ctx));
