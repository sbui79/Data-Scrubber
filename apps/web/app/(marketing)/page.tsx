import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight">Take control of your own public data.</h1>
      <p className="mt-4 text-lg text-stone-700">We help individuals discover, control, and remove their own publicly available personal data, one calm step at a time.</p>
      <section aria-labelledby="not-people-search" className="mt-8 rounded-xl border border-teal-700/30 bg-white p-5">
        <h2 id="not-people-search" className="font-semibold">Not a people search service</h2>
        <p className="mt-2">PrivatePath works only for the account holder&rsquo;s own information. You can&rsquo;t look up, locate, or research another person here. This is a privacy-management service, not a private-investigation service.</p>
      </section>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {[["Check", "Work through a curated list of sites and note where your own listing appears."], ["Request", "Generate a clear request, review it, and approve it yourself."], ["Track", "Keep every request, reminder and result in one place."]].map(([t, b]) => (
          <li key={t} className="rounded-xl border border-stone-200 bg-white p-4"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-stone-700">{b}</p></li>))}
      </ul>
      <p className="mt-6 text-sm text-stone-600">Each site has its own policies and legal exceptions, so removal is never guaranteed. You review, approve and submit every request yourself, and you can delete your account and data at any time.</p>
      <Link href="/dashboard" className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-teal-800 px-5 py-2 font-medium text-white">Get started</Link>
    </>
  );
}
