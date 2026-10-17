import { staffListCases } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session }) => staffListCases(deps, session));
