import { AppError, uploadEvidence } from "@privatepath/core";
import { handle, strict } from "@/lib/server";

const LIMIT = 6 * 1024 * 1024; // slightly above the 5 MB file limit to allow multipart overhead

export const POST = handle(async ({ deps, session, ctx, params, req }) => {
  if (Number(req.headers.get("content-length") ?? 0) > LIMIT) throw new AppError(413, "file_too_large", "Files must be under 5 MB.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError(400, "invalid_input", "Please choose a file to upload.");
  return uploadEvidence(deps, session, params.id!, { filename: file.name, contentType: file.type, bytes: Buffer.from(await file.arrayBuffer()) }, ctx);
}, 201, strict("evidence-upload"));
