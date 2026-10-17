import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError, getSource, listMyListingReviews } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { ListingReviewForm, StartRequest } from "@/components/source-actions";
import { Alert, Badge, Card, PageTitle } from "@/components/ui";
import { fmtDate } from "@/lib/labels";

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deps, session } = await requireOnboarded();
  const source = await getSource(deps, session, id).catch((e) => { if (e instanceof AppError && e.status === 404) return null; throw e; });
  if (!source) notFound();
  const review = (await listMyListingReviews(deps, session)).find((r) => r.sourceId === id) ?? null;
  const blocked = source.status === "UNAVAILABLE";
  return (
    <>
      <p className="mb-2 text-sm"><Link className="underline" href="/sources">&larr; Source Directory</Link></p>
      <PageTitle sub={`${source.category} · ${source.domain}`}>{source.name}</PageTitle>
      {source.notice && <div className="mb-4"><Alert kind="note">{source.notice}</Alert></div>}
      <div className="space-y-4">
        <Card title="1. Review the source's policy">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-medium">Verification</dt><dd>{source.verificationMethod}</dd></div>
            <div><dt className="font-medium">Difficulty</dt><dd>{source.difficulty} of 5</dd></div>
            <div><dt className="font-medium">Last reviewed</dt><dd>{fmtDate(source.lastReviewedAt)}</dd></div>
            <div><dt className="font-medium">Status</dt><dd><Badge tone={blocked ? "neutral" : "good"}>{source.status === "MANUAL_ONLY" ? "Manual process" : blocked ? "No opt-out process" : "Opt-out available"}</Badge></dd></div>
          </dl>
          <div className="mt-3 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm">{source.instructionsMarkdown}</div>
          <p className="mt-3 text-sm">Official opt-out page: <a className="underline" href={source.officialOptOutUrl} target="_blank" rel="noopener noreferrer">{source.officialOptOutUrl}</a> (opens the site&rsquo;s own page; you complete it yourself)</p>
        </Card>
        <Card title="2. Check for your own listing">
          <ListingReviewForm sourceId={id} domain={source.domain} existing={review ? { id: review.id, status: review.status, listingUrl: review.listingUrl } : null} />
        </Card>
        <Card title="3. Request removal">
          {blocked ? <p>This source has no opt-out process we know of, so there&rsquo;s nothing to request here.</p>
            : review?.status === "FOUND" || review?.status === "NOT_SURE" ? <StartRequest sourceId={id} listingReviewId={review.id} />
            : <p className="text-stone-600">Save your listing check above first. You can start a request once you&rsquo;ve marked that you found a listing, or if you&rsquo;re not sure.</p>}
        </Card>
      </div>
    </>
  );
}
