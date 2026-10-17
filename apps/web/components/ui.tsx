import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 max-w-2xl text-stone-600">{sub}</p>}
    </header>
  );
}

const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50";
export const btn = {
  primary: `${BTN} bg-teal-800 text-white hover:bg-teal-900`,
  secondary: `${BTN} border border-stone-300 bg-white text-stone-900 hover:bg-stone-50`,
  danger: `${BTN} bg-red-700 text-white hover:bg-red-800`,
};

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "note"; children: ReactNode }) {
  const styles = { info: "border-sky-200 bg-sky-50", error: "border-red-200 bg-red-50", success: "border-green-200 bg-green-50", note: "border-amber-200 bg-amber-50" }[kind];
  return <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${styles}`}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "attention" }) {
  const t = { neutral: "bg-stone-100 text-stone-800", good: "bg-green-100 text-green-900", attention: "bg-amber-100 text-amber-900" }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function ProgressRing({ percent }: { percent: number | null }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <figure className="flex items-center gap-4" aria-label={percent === null ? "No estimate yet" : `Estimated progress ${percent} percent`}>
      <svg width="130" height="130" viewBox="0 0 130 130" aria-hidden="true">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e7e5e4" strokeWidth="12" />
        {percent !== null && <circle cx="65" cy="65" r={r} fill="none" stroke="#115e59" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} transform="rotate(-90 65 65)" />}
        <text x="65" y="72" textAnchor="middle" fontSize="26" fontWeight="600" fill="#1f2933">{percent === null ? "—" : `${percent}%`}</text>
      </svg>
      <figcaption className="text-sm"><strong className="block text-base">Estimated</strong>Not a guarantee of removal.</figcaption>
    </figure>
  );
}

export const inputCls = "mt-1 block w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2";
