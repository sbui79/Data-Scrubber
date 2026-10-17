"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, btn, inputCls } from "./ui";

export function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/v1/data-export", { method: "POST" });
      if (!res.ok) { setError((await res.json().catch(() => null))?.error?.message ?? "Export failed. Please try again."); return; }
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement("a"), { href: url, download: "privatepath-export.json" }).click();
      URL.revokeObjectURL(url);
    } catch { setError("We couldn't reach the server. Please try again."); } finally { setBusy(false); }
  }
  return <div><button className={btn.secondary} onClick={go} disabled={busy}>{busy ? "Preparing…" : "Export my data"}</button>{error && <div className="mt-2"><Alert kind="error">{error}</Alert></div>}</div>;
}

export function DeleteAccount() {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setError(null);
    const r = await api("/account-delete", "POST", { confirm: "DELETE" }); setBusy(false);
    if (r.ok) { await fetch("/api/dev/logout", { method: "POST" }).catch(() => {}); router.push("/"); router.refresh(); } else setError(r.error.message);
  }
  return (
    <div>
      <button className={btn.danger} onClick={() => { setText(""); setError(null); dlg.current?.showModal(); }}>Delete my account</button>
      <dialog ref={dlg} aria-labelledby="del-title" className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl p-5 backdrop:bg-black/40">
        <h2 id="del-title" className="text-lg font-semibold">Delete your account?</h2>
        <p className="mt-2 text-sm">This permanently deletes your profile, requests, notes, reminders and uploaded files. It can&rsquo;t be undone. It doesn&rsquo;t remove anything from other websites. Consider exporting your data first.</p>
        <label className="mt-4 block text-sm">Type <strong>DELETE</strong> to confirm<input value={text} onChange={(e) => setText(e.target.value)} className={inputCls} autoComplete="off" /></label>
        {error && <div className="mt-3"><Alert kind="error">{error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2"><button className={btn.secondary} onClick={() => dlg.current?.close()}>Cancel</button><button className={btn.danger} disabled={text !== "DELETE" || busy} onClick={confirm}>{busy ? "Deleting…" : "Permanently delete"}</button></div>
      </dialog>
    </div>
  );
}

export function MarketingToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  async function change(next: boolean) {
    const prev = on; setOn(next); setError(null);
    const r = await api("/account/marketing", "PATCH", { optIn: next });
    if (r.ok) router.refresh(); else { setOn(prev); setError(r.error.message); }
  }
  return (
    <div>
      <label className="flex gap-3"><input type="checkbox" className="mt-1 size-5" checked={on} onChange={(e) => change(e.target.checked)} />
        <span>Send me occasional product news. Reminder emails you set up are separate and don&rsquo;t depend on this.</span></label>
      {error && <div className="mt-2"><Alert kind="error">{error}</Alert></div>}
    </div>
  );
}

interface Plan { id: string; name: string; price: string; kind: string }
interface Sub { id: string; plan: string; status: string }
export function BillingCard({ mode, plans, current, policy }: { mode: string; plans: Plan[]; current: Sub[]; policy: { alwaysFree: string; cancellation: string; refunds: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, ok: string) {
    setBusy(true); setMsg(null); const r = await fn(); setBusy(false);
    if (r.ok) { setMsg({ kind: "success", text: ok }); router.refresh(); } else setMsg({ kind: "error", text: r.error?.message ?? "Something went wrong." });
  }
  const active = new Map(current.map((c) => [c.plan, c]));
  return (
    <div className="space-y-3">
      <Alert kind="note">{mode === "mock" ? "Mock billing for development: no payment is taken." : "Billing isn't enabled yet."}</Alert>
      <ul className="space-y-2">{plans.map((p) => {
        const a = active.get(p.id);
        return (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 p-3">
            <span><strong>{p.name}</strong><span className="block text-sm text-stone-600">{p.price}</span></span>
            {p.id === "FREE" ? <span className="text-sm">{current.length === 0 ? "Your current plan" : "Always available"}</span>
              : a ? <span className="flex items-center gap-2 text-sm">Active{p.kind === "subscription" && <button className={btn.secondary} disabled={busy} onClick={() => run(() => api(`/billing/subscriptions/${a.id}/cancel`, "POST"), "Cancelled.")}>Cancel</button>}</span>
              : mode === "mock" ? <button className={btn.secondary} disabled={busy} onClick={() => run(() => api("/billing/checkout", "POST", { plan: p.id }), "Plan added (mock).")}>Choose (mock)</button> : null}
          </li>);
      })}</ul>
      <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>
      <p className="text-sm text-stone-600">{policy.alwaysFree} {policy.cancellation} {policy.refunds}</p>
    </div>
  );
}
