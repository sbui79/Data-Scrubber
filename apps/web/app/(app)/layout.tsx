import Link from "next/link";
import { requireOnboarded } from "@/lib/session";

export const dynamic = "force-dynamic";

const NAV = [
  ["Dashboard", "/dashboard"], ["My Profile", "/profile"], ["Exposure Assessment", "/assessment"],
  ["Source Directory", "/sources"], ["Removal Requests", "/requests"],
  ["California Privacy Center", "/california"], ["Reminders", "/reminders"],
  ["Privacy & Security", "/privacy-security"], ["Help", "/help"], ["Account Settings", "/settings"],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, deps } = await requireOnboarded();
  const unread = await deps.db.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <div className="md:flex">
      <nav aria-label="Main" className="border-b bg-white p-4 md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <p className="font-semibold">PrivatePath</p>
        <p className="mb-3 text-sm text-stone-600">Signed in as {user.displayName}{unread > 0 && <> · <Link className="underline" href="/reminders">{unread} new</Link></>}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 md:block md:space-y-1">
          {NAV.map(([label, href]) => (
            <li key={href}><Link className="block rounded px-2 py-1.5 hover:bg-stone-100" href={href}>{label}</Link></li>
          ))}
        </ul>
        <form action="/api/dev/logout" method="post" className="mt-4"><button className="rounded px-2 py-1.5 text-sm underline">Sign out</button></form>
        <p className="mt-6 text-xs text-stone-500">Privacy management for your own information. Not an investigation service. Removal is never guaranteed.</p>
      </nav>
      <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 md:max-w-4xl">{children}</main>
    </div>
  );
}
