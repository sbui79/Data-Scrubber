import { getServerDeps, MOCK_COOKIE } from "@/lib/server";

/** Development sign-in. 404 unless AUTH_MODE=mock (which production forbids). */
export async function POST(req: Request) {
  if (getServerDeps().authMode !== "mock") return new Response("Not found", { status: 404 });
  const form = await req.formData();
  const id = String(form.get("id") ?? "").trim().slice(0, 80);
  const email = String(form.get("email") ?? "").trim().slice(0, 120) || `${id}@example.test`;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return new Response("Invalid id", { status: 400 });
  const res = new Response(null, { status: 303, headers: { Location: "/dashboard" } });
  res.headers.append("Set-Cookie", `${MOCK_COOKIE}=${encodeURIComponent(`${id}|${email}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  return res;
}
