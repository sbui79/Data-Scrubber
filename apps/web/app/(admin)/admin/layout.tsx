import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireStaff();
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <nav aria-label="Staff" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <strong>PrivatePath staff</strong>
          <Link className="underline" href="/admin">Overview</Link>
          <Link className="underline" href="/admin/sources">Sources</Link>
          <Link className="underline" href="/admin/support">Support</Link>
          <Link className="underline" href="/dashboard">My account</Link>
        </nav>
        <span className="text-sm text-stone-600">{user.displayName} · {user.role.replace("_", " ").toLowerCase()}</span>
      </header>
      <div className="mb-4"><Alert kind="note">Staff area. Your actions are recorded in the audit log. Customer information is redacted unless access is separately approved.</Alert></div>
      <main id="main">{children}</main>
    </div>
  );
}
