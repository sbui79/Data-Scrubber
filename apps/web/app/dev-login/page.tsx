import { notFound } from "next/navigation";
import { getServerDeps } from "@/lib/server";
import { Alert, btn, Card, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DevLogin() {
  if (getServerDeps().authMode !== "mock") notFound();
  return (
    <main id="main" className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">Development sign-in</h1>
      <Alert kind="note">Local development only. Real sign-in (email, passkeys, MFA) comes from the identity provider and isn&rsquo;t connected yet. Use fictional identities only.</Alert>
      <Card className="mt-4">
        <form action="/api/dev/login" method="post" className="space-y-3">
          <label className="block">Identity id
            <input name="id" required pattern="[A-Za-z0-9_-]+" defaultValue="mock_demo-user" className={inputCls} />
          </label>
          <label className="block">Email
            <input name="email" type="email" defaultValue="demo@example.test" className={inputCls} />
          </label>
          <button className={btn.primary}>Sign in</button>
        </form>
        <p className="mt-4 text-sm text-stone-600">Seeded identities: <code>mock_demo-user</code>, <code>mock_seed-admin-a</code>, <code>mock_seed-admin-b</code> (run <code>pnpm seed</code>).</p>
      </Card>
    </main>
  );
}
