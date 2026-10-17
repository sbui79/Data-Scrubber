import { MOCK_COOKIE } from "@/lib/server";

export async function POST() {
  const res = new Response(null, { status: 303, headers: { Location: "/" } });
  res.headers.append("Set-Cookie", `${MOCK_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
