import Link from "next/link";
import { getDashboard } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { Alert, Badge, btn, Card, PageTitle, ProgressRing } from "@/components/ui";
import { fmtDate, REMINDER_LABEL, STATUS_LABEL } from "@/lib/labels";

export default async function Dashboard() {
  const { deps, session } = await requireOnboarded();
  const d = await getDashboard(deps, session);
  const stat = (label: string, n: number) => (
    <div className="rounded-lg bg-stone-50 p-3"><dd className="text-2xl font-semibold">{n}</dd><dt className="text-sm text-stone-600">{label}</dt></div>
  );
  return (
    <>
      <PageTitle sub="A calm overview of where you are. You stay in control of every step.">Dashboard</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Your cleanup progress">
          <ProgressRing percent={d.progress.percent} />
          <p className="mt-3 text-sm text-stone-600">{d.progress.percent === null ? "Once you start a request, an estimate appears here. " : ""}{d.progress.disclaimer}</p>
        </Card>
        <Card title="Next step">
          <p>{d.nextAction.message}</p>
          <Link href={d.nextAction.href} className={`${btn.primary} mt-4`}>Continue</Link>
        </Card>
        <Card title="Requests needing attention">
          {d.needingAttention.length === 0 ? <p className="text-stone-600">Nothing needs your attention right now.</p> : (
            <ul className="space-y-2">{d.needingAttention.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <Link className="underline" href={`/requests/${r.id}`}>{r.sourceName}</Link><Badge tone="attention">{STATUS_LABEL[r.status]}</Badge>
              </li>))}</ul>)}
        </Card>
        <Card title="Upcoming follow-ups">
          {d.upcomingFollowUps.length === 0 ? <p className="text-stone-600">No reminders in the next 30 days. <Link className="underline" href="/reminders">Manage reminders</Link></p> : (
            <ul className="space-y-2">{d.upcomingFollowUps.map((r) => (
              <li key={r.id} className="flex justify-between gap-2"><span>{REMINDER_LABEL[r.type] ?? r.type}</span><span className="text-stone-600">{fmtDate(r.scheduledFor)}</span></li>))}</ul>)}
        </Card>
        <Card title="Recently completed">
          {d.recentCompleted.length === 0 ? <p className="text-stone-600">Completed requests will appear here.</p> : (
            <ul className="space-y-2">{d.recentCompleted.map((r) => (
              <li key={r.id} className="flex justify-between gap-2"><Link className="underline" href={`/requests/${r.id}`}>{r.sourceName}</Link><span className="text-stone-600">{fmtDate(r.completedAt)}</span></li>))}</ul>)}
        </Card>
        <Card title="At a glance">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stat("Sources reviewed", d.stats.sourcesReviewed)}{stat("Listings you found", d.stats.listingsFound)}{stat("Requests drafted", d.stats.requestsDrafted)}
            {stat("Submitted by you", d.stats.requestsSubmitted)}{stat("Confirmed removals", d.stats.confirmedRemovals)}{stat("Follow-ups due", d.stats.followUpsDue)}
          </dl>
        </Card>
      </div>
      <div className="mt-4"><Alert kind="note">Sites have their own policies and legal exceptions, so removal isn&rsquo;t guaranteed. You review, approve and submit every request yourself.</Alert></div>
    </>
  );
}
