"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, btn, inputCls } from "./ui";

interface Safety { message: string; resources: { name: string; contact?: string; url?: string }[]; note: string }

export function SupportForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [safety, setSafety] = useState<Safety | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setMsg(null); setSafety(null);
    const r = await api<{ safety?: Safety }>("/support-cases", "POST", { category: f.get("category"), subject: f.get("subject"), message: f.get("message") });
    setBusy(false);
    if (r.ok) { setMsg({ kind: "success", text: "Thanks. We've received your message." }); setSafety(r.data.safety ?? null); form.reset(); } else setMsg({ kind: "error", text: r.error.message });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Alert kind="note">We will never ask you to send a government ID, Social Security number or password. Please don&rsquo;t include them in your message.</Alert>
      <label className="block">What is this about?
        <select name="category" className={inputCls} defaultValue="OTHER">
          <option value="ACCOUNT">My account</option><option value="BILLING">Billing</option><option value="SOURCE_ISSUE">A source or its instructions</option>
          <option value="PRIVACY_REQUEST">A privacy question</option><option value="SAFETY_CONCERN">A safety concern (harassment, stalking, urgent risk)</option><option value="OTHER">Something else</option>
        </select></label>
      <label className="block">Subject<input name="subject" required maxLength={120} className={inputCls} /></label>
      <label className="block">Message<textarea name="message" required rows={5} maxLength={5000} className={inputCls} /></label>
      <div aria-live="polite" className="space-y-2">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {safety && <Alert kind="note"><strong>{safety.message}</strong><ul className="mt-2 list-inside list-disc">{safety.resources.map((r) => <li key={r.name}>{r.name}{r.contact ? `: ${r.contact}` : ""}{r.url && <> (<a className="underline" href={r.url} target="_blank" rel="noopener noreferrer">website</a>)</>}</li>)}</ul><p className="mt-2">{safety.note}</p></Alert>}
      </div>
      <button className={btn.primary} disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
    </form>
  );
}
