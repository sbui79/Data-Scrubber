import { staffReadCaseMessage } from "@privatepath/core";
import { handle } from "@/lib/server";

/** Requires an approved, time-limited access grant for this case. Every read is audited. */
export const GET = handle(async ({ deps, session, ctx, params }) => staffReadCaseMessage(deps, session, params.id!, ctx));
