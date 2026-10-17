import { adminMetrics } from "@privatepath/core";
import { requireStaff } from "@/lib/session";
import { Card, PageTitle } from "@/components/ui";

export default async function AdminHome() {
  const { deps, session } = await requireStaff();
  const m = await adminMetrics(deps, session);
  const tile = (label: string, v: string) => <div className="rounded-lg bg-stone-50 p-3"><dd className="text-2xl font-semibold">{v}</dd><dt className="text-sm text-stone-600">{label}</dt></div>;
  return (
    <>
      <PageTitle sub={m.note}>Overview</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Accounts"><dl className="grid grid-cols-2 gap-2">{tile("Total", m.accounts.total)}{tile("Joined, last 30 days", m.accounts.joinedLast30Days)}</dl></Card>
        <Card title="Open support cases"><dl>{tile("Not yet resolved", m.openSupportCases)}</dl></Card>
        <Card title="Requests by status"><dl className="grid grid-cols-2 gap-2">{Object.entries(m.requestsByStatus).map(([k, v]) => <div key={k}>{tile(k.replaceAll("_", " ").toLowerCase(), v)}</div>)}</dl>
          {Object.keys(m.requestsByStatus).length === 0 && <p className="text-stone-600">No requests yet.</p>}</Card>
        <Card title="Source catalog"><dl className="grid grid-cols-2 gap-2">{Object.entries(m.sourcesByStatus).map(([k, v]) => <div key={k}>{tile(k.replaceAll("_", " ").toLowerCase(), String(v))}</div>)}</dl></Card>
      </div>
    </>
  );
}
