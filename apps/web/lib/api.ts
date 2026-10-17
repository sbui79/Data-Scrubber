"use client";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; fields?: string[] } };

/** Calls the shared REST API from the browser (same-origin; the session cookie authenticates). */
export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method, headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, error: json?.error ?? { code: "unknown", message: "Something went wrong. Please try again." } };
  } catch {
    return { ok: false, error: { code: "network", message: "We couldn't reach the server. Check your connection and try again." } };
  }
}
