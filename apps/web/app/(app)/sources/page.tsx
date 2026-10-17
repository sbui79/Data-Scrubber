import Link from "next/link";
import { listMyListingReviews, listSources } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { Alert, Badge, Card, inputCls, PageTitle, btn } from "@/components/ui";

const REVIEW = { FOUND: "You found a listing", NOT_FOUND: "Not found", NOT_SURE: "Not sure" } as const;

export default async function Sources({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { deps, session } = await requireOnboarded();
  const [all, reviews] = await Promise.all([listSources(deps, session), listMyListingReviews(deps, session)]);
  const byId = new Map(reviews.map((r) => [r.sourceId, r]));
  const needle = q?.trim().toLowerCase();
  const sources = needle ? all.filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(needle)) : all;
  return (
    <>
      <PageTitle sub="Sites reviewed by our team that offer a way to remove your own listing. You check each site yourself.">Source Directory</PageTitle>
      <div className="mb-4"><Alert kind="note">Entries marked <strong>Example</strong> are demonstration data, not real services, and their instructions aren&rsquo;t verified as current.</Alert></div>
      <form role="search" className="mb-4 flex gap-2"><label className="flex-1"><span className="sr-only">Filter sources by site name or category</span>
        <input name="q" defaultValue={q} placeholder="Filter by site name or category" className={inputCls.replace("mt-1 ", "")} /></label><button className={btn.secondary}>Filter</button></form>
      {sources.length === 0 ? <Card><p>No sources match. {all.length === 0 ? "The directory is empty until reviewed sources are published." : <Link className="underline" href="/sources">Clear filter</Link>}</p></Card> : (
        <ul className="space-y-3">
          {sources.map((s) => {
            const r = byId.get(s.id);
            return (
              <li key={s.id}><Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold"><Link className="underline" href={`/sources/${s.id}`}>{s.name}</Link></h2>
                    <p className="text-sm text-stone-600">{s.category} · {s.domain} · Difficulty {s.difficulty}/5</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.isDemo && <Badge>Example</Badge>}
                    <Badge tone={s.status === "AVAILABLE" ? "good" : "neutral"}>{s.status === "AVAILABLE" ? "Opt-out available" : s.status === "MANUAL_ONLY" ? "Manual process" : "No opt-out"}</Badge>
                    {r && <Badge tone={r.status === "FOUND" ? "attention" : "neutral"}>{REVIEW[r.status as keyof typeof REVIEW]}</Badge>}
                  </div>
                </div>
              </Card></li>
            );
          })}
        </ul>
      )}
    </>
  );
}
