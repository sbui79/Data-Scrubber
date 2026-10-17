import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError, canTransition, getProfile, getRequest, getSource, last4, USER_SETTABLE } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { RequestFlow } from "@/components/request-flow";
import { Badge, PageTitle } from "@/components/ui";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { deps, session } = await requireOnboarded();
  const req = await getRequest(deps, session, id).catch((e) => { if (e instanceof AppError && e.status === 404) return null; throw e; });
  if (!req) notFound();
  const [source, profile] = await Promise.all([getSource(deps, session, req.sourceId), getProfile(deps, session).catch(() => null)]);
  const nextStatuses = USER_SETTABLE.filter((s) => canTransition(req.status, s) && s !== "ARCHIVED" && s !== "LISTING_FOUND" && s !== "LISTING_NOT_FOUND");
  // Only the last 4 digits of any phone number ever reach the browser.
  const phones = ((profile?.phoneNumbers as string[] | undefined) ?? []).slice(0, 5).map((p, index) => ({ index, last4: last4(p) }));
  const j = JSON.parse(JSON.stringify(req));
  return (
    <>
      <p className="mb-2 text-sm"><Link className="underline" href="/requests">&larr; Removal Requests</Link></p>
      <PageTitle sub={<>{TYPE_LABEL[req.requestType]} request · <Badge>{STATUS_LABEL[req.status]}</Badge></>}>{req.sourceName}</PageTitle>
      <RequestFlow req={j} source={{ name: source.name, domain: source.domain, officialOptOutUrl: source.officialOptOutUrl, isDemo: source.isDemo }} nextStatuses={nextStatuses} phones={phones} />
    </>
  );
}
