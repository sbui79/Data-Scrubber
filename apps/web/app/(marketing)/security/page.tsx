import { PRIVACY_POINTS } from "@/lib/content";
export const metadata = { title: "Privacy & security — PrivatePath" };
export default function Security() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Privacy &amp; security</h1>
      <ul className="mt-6 space-y-4">{PRIVACY_POINTS.map((p) => <li key={p.title} className="rounded-xl border border-stone-200 bg-white p-4"><h2 className="font-semibold">{p.title}</h2><p className="mt-1 text-stone-700">{p.body}</p></li>)}</ul>
      <p className="mt-6 text-sm text-stone-600">We design for data minimization, access controls and retention limits. Support staff see redacted information by default, and every administrative access to personal content is logged.</p>
    </>
  );
}
