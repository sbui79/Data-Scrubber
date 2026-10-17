import { createProfile, getProfile, updateProfile } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session }) => getProfile(deps, session));
export const POST = handle(async ({ deps, session, ctx, body }) => createProfile(deps, session, await body(), ctx), 201);
export const PATCH = handle(async ({ deps, session, ctx, body }) => updateProfile(deps, session, await body(), ctx));
