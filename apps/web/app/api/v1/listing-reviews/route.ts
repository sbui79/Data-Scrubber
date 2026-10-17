import { createListingReview, listMyListingReviews } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session }) => listMyListingReviews(deps, session));
export const POST = handle(async ({ deps, session, ctx, body }) => createListingReview(deps, session, await body(), ctx), 201);
