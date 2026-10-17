import { createReminder, listReminders } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session }) => listReminders(deps, session));
export const POST = handle(async ({ deps, session, ctx, body }) => createReminder(deps, session, await body(), ctx), 201);
