import { staffSetCaseStatus } from "@privatepath/core";
import { handle } from "@/lib/server";

export const PATCH = handle(async ({ deps, session, ctx, body, params }) => {
  const b = (await body()) as { status?: unknown } | undefined;
  return staffSetCaseStatus(deps, session, params.id!, b?.status, ctx);
});
