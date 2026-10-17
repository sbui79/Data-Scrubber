import { exportDraft } from "@privatepath/core";
import { handle } from "@/lib/server";

/** Returns copy-ready text; refused until the user has approved this exact draft. */
export const POST = handle(async ({ deps, session, ctx, params }) => exportDraft(deps, session, params.id!, ctx));
