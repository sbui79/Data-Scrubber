import { getSource } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session, params }) => getSource(deps, session, params.id!));
