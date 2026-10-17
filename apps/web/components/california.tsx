"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, btn } from "./ui";

export function CaliforniaChecklist({ steps, done }: { steps: { step: number; title: string; detail: string }[]; done: number[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<number[]>(done);
  async function toggle(step: number, on: boolean) {
    const prev = checked;
    setChecked(on ? [...new Set([...prev, step])] : prev.filter((s) => s !== step)); // update immediately
    setBusy(true); setMsg(null);
    const r = await api("/california-drop-info/progress", "PATCH", { step, done: on }); setBusy(false);
    if (r.ok) router.refresh(); else { setChecked(prev); setMsg({ kind: "error", text: r.error.message }); }
  }
  async function remind() {
    setBusy(true); setMsg(null);
    const d = new Date(Date.now() + 30 * 86_400_000); d.setHours(9, 0, 0, 0);
    const r = await api("/reminders", "POST", { type: "CALIFORNIA_DROP", scheduledFor: d.toISOString() }); setBusy(false);
    setMsg(r.ok ? { kind: "success", text: "We'll remind you in 30 days to check on the official site." } : { kind: "error", text: r.error.message });
  }
  return (
    <div>
      <ol className="space-y-3">{steps.map((s) => (
        <li key={s.step}><label className="flex gap-3"><input type="checkbox" className="mt-1 size-5" checked={checked.includes(s.step)} onChange={(e) => toggle(s.step, e.target.checked)} />
          <span><span className="font-medium">{s.step}. {s.title}</span><span className="block text-sm text-stone-600">{s.detail}</span></span></label></li>))}</ol>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button className={btn.secondary} onClick={remind} disabled={busy}>Remind me in 30 days</button></div>
      <div aria-live="polite" className="mt-3">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>
    </div>
  );
}
