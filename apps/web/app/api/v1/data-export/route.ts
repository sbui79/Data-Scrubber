import { exportData } from "@privatepath/core";
import { handle } from "@/lib/server";

export const POST = handle(async ({ deps, session, ctx }) => {
  const data = await exportData(deps, session, ctx);
  return new Response(JSON.stringify(data, null, 2), { headers: {
    "Content-Type": "application/json",
    "Content-Disposition": 'attachment; filename="privatepath-export.json"',
    "Cache-Control": "no-store",
  } });
});
