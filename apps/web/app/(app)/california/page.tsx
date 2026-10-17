import { getCaliforniaInfo } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { CaliforniaChecklist } from "@/components/california";
import { Alert, Card, PageTitle } from "@/components/ui";

export default async function California() {
  const { deps, session } = await requireOnboarded();
  const info = await getCaliforniaInfo(deps, session);
  return (
    <>
      <PageTitle sub={info.summary}>California Privacy Center</PageTitle>
      <div className="space-y-4">
        <Alert kind="note">{info.externalProcessNotice}</Alert>
        <Card title="Official links">
          <ul className="space-y-2">{info.officialLinks.map((l) => (
            <li key={l.url}><a className="underline" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a> <span className="text-sm text-stone-500">(opens a government site in a new tab)</span></li>))}</ul>
        </Card>
        <Card title="Your checklist"><p className="mb-3 text-sm text-stone-600">You do these steps on the official site. Ticking them here only tracks your own progress.</p>
          <CaliforniaChecklist steps={info.checklist.map((c) => ({ ...c }))} done={info.completedSteps} /></Card>
        <Card title="Good to know"><ul className="list-inside list-disc space-y-1">{info.limits.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-3 text-xs text-stone-500">Last reviewed {info.lastReviewed}. Draft content pending legal review.</p></Card>
      </div>
    </>
  );
}
