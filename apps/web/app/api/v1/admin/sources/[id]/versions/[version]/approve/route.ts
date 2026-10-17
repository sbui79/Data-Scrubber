import { adminApproveVersion } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx, params }) => adminApproveVersion(deps, session, params.id!, Number(params.version), ctx));
