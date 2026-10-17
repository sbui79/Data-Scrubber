import Link from "next/link";

const LINKS = [["How it works", "/how-it-works"], ["Pricing", "/pricing"], ["FAQ", "/faq"], ["Security", "/security"], ["Contact", "/contact"]] as const;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">PrivatePath</Link>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {LINKS.map(([l, h]) => <Link key={h} href={h} className="rounded px-1 py-1 hover:underline">{l}</Link>)}
            <Link href="/dashboard" className="rounded-lg bg-teal-800 px-3 py-2 font-medium text-white">Sign in</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">{children}</main>
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 text-sm text-stone-600">
          <p><strong>PrivatePath is a privacy-management service, not a private-investigation or people-search service.</strong> It works only for the account holder&rsquo;s own information. Removal is never guaranteed.</p>
          <p className="flex flex-wrap gap-x-4"><Link className="underline" href="/terms">Terms</Link><Link className="underline" href="/privacy">Privacy Policy</Link><Link className="underline" href="/safety">Safety resources</Link><Link className="underline" href="/contact">Contact</Link></p>
        </div>
      </footer>
    </>
  );
}
