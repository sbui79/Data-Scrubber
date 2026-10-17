import { SAFETY_RESOURCES, SUPPORT_POLICY } from "@privatepath/core";
export const metadata = { title: "Safety resources — PrivatePath" };
export default function Safety() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Safety resources</h1>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 font-medium">{SAFETY_RESOURCES.message}</p>
      <ul className="mt-6 space-y-2">{SAFETY_RESOURCES.resources.map((r) => (
        <li key={r.name} className="rounded-xl border border-stone-200 bg-white p-3"><strong>{r.name}</strong>{"contact" in r && r.contact ? <> — {r.contact}</> : null}{"url" in r && r.url ? <> — <a className="underline" href={r.url} target="_blank" rel="noopener noreferrer">website</a></> : null}</li>))}</ul>
      <p className="mt-4 text-sm text-stone-600">{SAFETY_RESOURCES.note}</p>
      <p className="mt-4 text-sm">If you&rsquo;re worried about harassment or stalking involving your public information, you can file a &ldquo;safety concern&rdquo; from the Help page after signing in. {SUPPORT_POLICY}</p>
    </>
  );
}
