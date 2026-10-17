import { updateListingReview } from "@privatepath/core";
import { handle } from "@/lib/server";

export const PATCH = handle(async ({ deps, session, ctx, body, params }) => updateListingReview(deps, session, params.id!, await body(), ctx));
