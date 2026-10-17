import { timingSafeEqual } from "node:crypto";
import { processDueReminders } from "@privatepath/core";
import { getServerDeps } from "@/lib/server";

/** Called by a scheduler (not by users). Disabled unless CRON_SECRET is set. */
export async function POST(req: Request) {
  try {
    const { deps, cronSecret } = getServerDeps();
    if (!cronSecret) return Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
    const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
    const want = Buffer.from(cronSecret);
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      return Response.json({ error: { code: "unauthenticated", message: "Unauthorized." } }, { status: 401 });
    }
    return Response.json(await processDueReminders(deps), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
  }
}
