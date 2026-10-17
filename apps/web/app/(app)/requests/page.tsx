import Link from "next/link";
import { listRequests } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { Badge, btn, Card, PageTitle } from "@/components/ui";
import { fmtDate, STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";

const ATTENTION = ["DRAFT_READY", "AWAITING_USER_ACTION", "VERIFICATION_REQUESTED", "FOLLOW_UP_DUE"];

export default async function Requests() {
  const { deps, session } = await requireOnboarded();
  const rows = await listRequests(deps, session);
  return (
    <>
      <PageTitle sub="Track each request from start to finish. You submit every request yourself.">Removal Requests</PageTitle>
      {rows.length === 0 ? (
        <Card><p>You haven&rsquo;t started any requests yet.</p><p className="mt-1 text-stone-600">Requests begin from a source page once you&rsquo;ve checked for your listing.</p>
          <Link href="/sources" className={`${btn.primary} mt-4`}>Browse the Source Directory</Link></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Your removal requests</caption>
            <thead className="bg-stone-50"><tr><th scope="col" className="p-3">Source</th><th scope="col" className="p-3">Type</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Follow-up</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-t">
                <th scope="row" className="p-3 font-medium"><Link className="underline" href={`/requests/${r.id}`}>{r.sourceName}</Link></th>
                <td className="p-3">{TYPE_LABEL[r.requestType]}</td>
                <td className="p-3"><Badge tone={ATTENTION.includes(r.status) ? "attention" : r.status === "COMPLETED" ? "good" : "neutral"}>{STATUS_LABEL[r.status]}</Badge></td>
                <td className="p-3">{fmtDate(r.followUpAt)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
