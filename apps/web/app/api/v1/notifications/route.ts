import { listNotifications } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session }) => listNotifications(deps, session));
