import Link from "next/link";

export default function Home() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Take control of your own public data.</h1>
      <p className="mt-4 text-lg">
        We help individuals discover, control, and remove their own publicly available personal data.
      </p>
      <section aria-labelledby="not-people-search" className="mt-8 rounded-lg border border-teal-700/30 bg-white p-5">
        <h2 id="not-people-search" className="font-semibold">Not a people search service</h2>
        <p className="mt-2">
          PrivatePath works only for the account holder&rsquo;s own information. You cannot look up, locate, or
          research another person here. This is a privacy-management service, not a private-investigation service.
        </p>
      </section>
      <p className="mt-6 text-sm">
        Removal is never guaranteed: each site has its own policies and legal exceptions. You review, approve, and
        submit every request yourself, and you can delete your account and data at any time.
      </p>
      <Link href="/dashboard" className="mt-8 inline-block rounded bg-teal-800 px-5 py-3 font-medium text-white">
        Open demo dashboard
      </Link>
    </main>
  );
}
