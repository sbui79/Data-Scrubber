import Link from "next/link";
import { listMyListingReviews, listSources } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { ConcernChecklist } from "@/components/assessment";
import { Alert, btn, Card, PageTitle } from "@/components/ui";

export default async function Assessment() {
  const { deps, session } = await requireOnboarded();
  const [sources, reviews] = await Promise.all([listSources(deps, session), listMyListingReviews(deps, session)]);
  const done = new Set(reviews.map((r) => r.sourceId));
  const todo = sources.filter((s) => !done.has(s.id));
  const found = reviews.filter((r) => r.status === "FOUND").length;
  return (
    <>
      <PageTitle sub="A guided self-check. Findings come from your own review of each approved source, not from a search.">Exposure Assessment</PageTitle>
      <div className="space-y-4">
        <Alert kind="note">PrivatePath doesn&rsquo;t search the web for you or look anyone up. You visit each site yourself and tell us what you found.</Alert>
        <Card><ConcernChecklist /></Card>
        <Card title="Your progress">
          <p>You&rsquo;ve reviewed <strong>{reviews.length}</strong> of <strong>{sources.length}</strong> sources and found your listing on <strong>{found}</strong>.</p>
          {todo.length > 0 ? (
            <><p className="mt-3 text-sm text-stone-600">Still to check:</p>
              <ul className="mt-1 list-inside list-disc">{todo.slice(0, 8).map((s) => <li key={s.id}><Link className="underline" href={`/sources/${s.id}`}>{s.name}</Link></li>)}</ul>
              {todo.length > 8 && <p className="mt-1 text-sm text-stone-600">…and {todo.length - 8} more in the directory.</p>}</>
          ) : sources.length > 0 ? <p className="mt-3">You&rsquo;ve reviewed every source in the directory. Set a re-check reminder to look again later.</p> : null}
          <Link href="/sources" className={`${btn.primary} mt-4`}>Open the Source Directory</Link>
        </Card>
      </div>
    </>
  );
}
