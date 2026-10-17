import { FAQ } from "@/lib/content";
export const metadata = { title: "FAQ — PrivatePath" };
export default function Faq() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Frequently asked questions</h1>
      <div className="mt-6 divide-y rounded-xl border border-stone-200 bg-white px-4">{FAQ.map((f) => (<details key={f.q} className="py-3"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-2 text-stone-700">{f.a}</p></details>))}</div>
    </>
  );
}
