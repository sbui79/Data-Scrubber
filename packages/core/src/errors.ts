import { ZodError } from "zod";

/** Errors safe to show to clients. Messages must never contain user data. */
export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function toErrorResponse(err: unknown): { status: number; body: { error: { code: string; message: string; fields?: string[] } } } {
  if (err instanceof AppError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  if (err instanceof ZodError) {
    // Field paths only, never submitted values.
    const fields = [...new Set(err.issues.map((i) => i.path.join(".") || "(body)"))];
    return { status: 400, body: { error: { code: "invalid_input", message: "Some fields are invalid.", fields } } };
  }
  return { status: 500, body: { error: { code: "internal", message: "Something went wrong. Please try again." } } };
}
