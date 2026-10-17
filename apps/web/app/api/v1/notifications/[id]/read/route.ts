import { markNotificationRead } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, params }) => markNotificationRead(deps, session, params.id!));
