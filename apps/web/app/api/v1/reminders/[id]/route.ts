import { deleteReminder, updateReminder } from "@privatepath/core";
import { handle } from "@/lib/server";

export const PATCH = handle(async ({ deps, session, ctx, body, params }) => updateReminder(deps, session, params.id!, await body(), ctx));
export const DELETE = handle(async ({ deps, session, ctx, params }) => deleteReminder(deps, session, params.id!, ctx));
