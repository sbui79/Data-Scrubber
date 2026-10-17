export const metadata = { title: "Pricing — PrivatePath" };
const PLANS = [
  ["Free assessment", "Free", ["Guided exposure assessment", "Source directory", "Dashboard and reminders"]],
  ["One-time cleanup package", "Price to be announced", ["Everything in Free", "Guided request preparation for all available sources", "Proof storage"]],
  ["Monthly monitoring", "Price to be announced", ["Everything in the cleanup package", "Periodic re-check reminders", "Priority support"]],
] as const;
export default function Pricing() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Pricing</h1>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">These plans are placeholders. Billing isn&rsquo;t enabled yet and no payment is collected.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">{PLANS.map(([n, p, f]) => (
        <section key={n} className="rounded-xl border border-stone-200 bg-white p-4"><h2 className="font-semibold">{n}</h2><p className="mt-1 text-lg">{p}</p><ul className="mt-3 list-inside list-disc text-sm text-stone-700">{f.map((x) => <li key={x}>{x}</li>)}</ul></section>))}</div>
      <ul className="mt-8 space-y-2 text-sm text-stone-700">
        <li><strong>Deleting your account or exporting your data is always free</strong> and never requires a paid plan.</li>
        <li>Cancellation and refund policy: <em>placeholder, to be written and reviewed by counsel.</em></li>
        <li>No plan guarantees removal. Each site decides independently.</li>
      </ul>
    </>
  );
}
