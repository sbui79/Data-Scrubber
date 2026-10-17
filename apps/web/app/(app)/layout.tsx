import Link from "next/link";

const NAV = [
  ["Dashboard", "/dashboard"], ["My Profile", "/profile"], ["Exposure Assessment", "/assessment"],
  ["Source Directory", "/sources"], ["Removal Requests", "/requests"],
  ["California Privacy Center", "/california"], ["Reminders", "/reminders"],
  ["Privacy & Security", "/privacy-security"], ["Help", "/help"], ["Account Settings", "/settings"],
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:flex">
      <nav aria-label="Main" className="border-b bg-white p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <p className="mb-3 font-semibold">PrivatePath</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 md:block md:space-y-1">
          {NAV.map(([label, href]) => (
            <li key={href}><Link className="block rounded px-2 py-1 hover:bg-stone-100" href={href}>{label}</Link></li>
          ))}
        </ul>
      </nav>
      <div id="main" className="flex-1 p-6">{children}</div>
    </div>
  );
}
