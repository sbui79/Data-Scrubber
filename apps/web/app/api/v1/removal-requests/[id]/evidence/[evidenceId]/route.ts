import { deleteEvidence, downloadEvidence } from "@privatepath/core";
import { handle } from "@/lib/server";

export const GET = handle(async ({ deps, session, ctx, params }) => {
  const f = await downloadEvidence(deps, session, params.id!, params.evidenceId!, ctx);
  // Always an attachment, never rendered inline, and sandboxed even if opened directly.
  return new Response(new Uint8Array(f.bytes), { headers: {
    "Content-Type": f.contentType,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "no-store",
  } });
});
export const DELETE = handle(async ({ deps, session, ctx, params }) => deleteEvidence(deps, session, params.id!, params.evidenceId!, ctx));
