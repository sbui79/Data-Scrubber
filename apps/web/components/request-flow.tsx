"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Alert, Badge, btn, Card, inputCls } from "./ui";
import { fmtDate, STATUS_LABEL } from "@/lib/labels";

export interface FlowProps {
  req: {
    id: string; requestType: string; status: string; listingUrl: string | null; notes: string | null; confirmationReference: string | null;
    draft: { subject: string; body: string } | null; draftHash: string | null; approved: boolean;
    userSubmittedAt: string | null; expectedResponseAt: string | null;
    history: { from: string | null; to: string; at: string }[];
    evidence: { id: string; contentType: string; sizeBytes: number; uploadedAt: string }[];
  };
  source: { name: string; domain: string; officialOptOutUrl: string; isDemo: boolean };
  nextStatuses: string[];
  phones: { index: number; last4: string }[];
}

const STEPS = ["Review policy", "Confirm your listing", "Choose data", "Review request", "Submit yourself", "Record result"];
const stepOf = (s: string) => ({ NOT_STARTED: 1, LISTING_NOT_FOUND: 1, LISTING_FOUND: 2, DRAFT_READY: 3, AWAITING_USER_ACTION: 4 } as Record<string, number>)[s] ?? 5;
const CATS = [["name", "My name"], ["old_addresses", "Current and previous addresses"], ["phone", "My phone number"], ["email", "My email address"],
  ["relatives", "Relatives associated with my record"], ["profile_links", "Links to my public profiles"], ["property", "Property records"], ["other", "Other personal details"]];

export function RequestFlow({ req, source, nextStatuses, phones }: FlowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, okText?: string) {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) { setConfirmed(false); if (okText) setMsg({ kind: "success", text: okText }); router.refresh(); } else setMsg({ kind: "error", text: res.error?.message ?? "Something went wrong." });
  }
  const patch = (body: unknown, ok?: string) => run(() => api(`/removal-requests/${req.id}`, "PATCH", body), ok);
  const step = stepOf(req.status);
  const archived = req.status === "ARCHIVED";

  async function copyDraft() {
    setBusy(true); setMsg(null);
    const res = await api<{ subject: string; body: string }>(`/removal-requests/${req.id}/draft-export`, "POST");
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error.message });
    try { await navigator.clipboard.writeText(`Subject: ${res.data.subject}\n\n${res.data.body}`); setMsg({ kind: "success", text: "Copied to your clipboard." }); }
    catch { setMsg({ kind: "error", text: "Couldn't access the clipboard. Use Download instead." }); }
  }
  async function downloadDraft() {
    setBusy(true); setMsg(null);
    const res = await api<{ subject: string; body: string }>(`/removal-requests/${req.id}/draft-export`, "POST");
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: res.error.message });
    const url = URL.createObjectURL(new Blob([`Subject: ${res.data.subject}\n\n${res.data.body}`], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "removal-request.txt" });
    a.click(); URL.revokeObjectURL(url);
  }
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ kind: "error", text: "Choose a file first." });
    const fd = new FormData(); fd.set("file", file);
    await run(async () => {
      const r = await fetch(`/api/v1/removal-requests/${req.id}/evidence`, { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      return r.ok ? { ok: true } : { ok: false, error: j?.error };
    }, "File added.");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Progress through this request">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i + 1 === step ? "step" : undefined}
            className={`rounded-full px-3 py-1 ${i + 1 === step ? "bg-teal-800 text-white" : i + 1 < step ? "bg-teal-100 text-teal-900" : "bg-stone-100 text-stone-600"}`}>{i + 1}. {s}</li>
        ))}
      </ol>
      <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>

      {(req.status === "NOT_STARTED" || req.status === "LISTING_NOT_FOUND") && (
        <Card title="Confirm your listing">
          <p>Visit <strong>{source.name}</strong> yourself and look for your own listing. <Link className="underline" href="/sources">Read the source&rsquo;s policy</Link> first if you haven&rsquo;t.</p>
          <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const url = String(f.get("url") ?? "").trim();
            patch(url ? { status: "LISTING_FOUND", listingUrl: url, confirmOwnership: f.get("own") === "on" } : { status: "LISTING_FOUND" }); }}>
            <label className="block">Link to your listing (optional)<span className="block text-sm text-stone-600">An https address on {source.domain}. We never open it.</span><input name="url" type="url" className={inputCls} /></label>
            <label className="flex gap-3"><input type="checkbox" name="own" className="mt-1 size-5" /><span>This listing is about <strong>me</strong> (required if you add a link).</span></label>
            <div className="flex flex-wrap gap-2"><button className={btn.primary} disabled={busy}>I found my listing</button>
              {req.status === "NOT_STARTED" && <button type="button" className={btn.secondary} disabled={busy} onClick={() => patch({ status: "LISTING_NOT_FOUND" })}>I did not find it</button>}</div>
          </form>
        </Card>
      )}

      {["LISTING_FOUND", "DENIED_UNAVAILABLE"].includes(req.status) && (
        <Card title={req.status === "DENIED_UNAVAILABLE" ? "Try again with a new request" : "Choose what to include"}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
            const phone = f.get("phone"); run(() => api(`/removal-requests/${req.id}/draft`, "POST", {
              confirmOwnData: f.get("own") === "on", dataCategories: f.getAll("cat"), includeFullName: true, includeEmail: f.get("email") === "on",
              phoneIndex: phone === "" || phone === null ? undefined : Number(phone) })); }}>
            <fieldset><legend className="font-medium">What would you like addressed?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{CATS.map(([v, l]) => <label key={v} className="flex items-center gap-3"><input type="checkbox" name="cat" value={v} className="size-5" />{l}</label>)}</div></fieldset>
            <fieldset><legend className="font-medium">Contact details to include (your choice)</legend>
              <p className="text-sm text-stone-600">Your name is included so the site can identify you. Everything else is left out unless you choose it.</p>
              <label className="mt-2 flex items-center gap-3"><input type="checkbox" name="email" className="size-5" />Include my account email address</label>
              {phones.length > 0 && <label className="mt-2 block">Include the last 4 digits of a phone number
                <select name="phone" defaultValue="" className={inputCls}><option value="">Don&rsquo;t include a phone number</option>{phones.map((p) => <option key={p.index} value={p.index}>Ending in {p.last4}</option>)}</select></label>}
            </fieldset>
            <label className="flex gap-3"><input type="checkbox" name="own" required className="mt-1 size-5" /><span>I confirm this request is about <strong>my own</strong> information.</span></label>
            <button className={btn.primary} disabled={busy}>{busy ? "Preparing…" : "Prepare my request"}</button>
          </form>
        </Card>
      )}

      {req.status === "DRAFT_READY" && req.draft && (
        <Card title="Review your request">
          <p className="text-sm text-stone-600">This is exactly what will be available to copy once you approve it. Nothing is sent anywhere.</p>
          <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm"><p className="font-medium">Subject: {req.draft.subject}</p><pre className="mt-2 whitespace-pre-wrap font-sans">{req.draft.body}</pre></div>
          <label className="mt-4 flex gap-3"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-5" /><span>I have reviewed this request, it&rsquo;s about my own information, and I approve it.</span></label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btn.primary} disabled={busy || !confirmed} onClick={() => run(() => api(`/removal-requests/${req.id}/approve`, "POST", { confirmOwnData: true, draftHash: req.draftHash }))}>Approve this request</button>
            <button className={btn.secondary} disabled={busy} onClick={() => patch({ status: "LISTING_FOUND" })}>Change my choices</button>
          </div>
        </Card>
      )}

      {req.status === "AWAITING_USER_ACTION" && req.draft && (
        <>
          <Card title="Your approved request">
            <div className="rounded-lg bg-stone-50 p-3 text-sm"><p className="font-medium">Subject: {req.draft.subject}</p><pre className="mt-2 whitespace-pre-wrap font-sans">{req.draft.body}</pre></div>
            <div className="mt-3 flex flex-wrap gap-2"><button className={btn.secondary} onClick={copyDraft} disabled={busy}>Copy text</button><button className={btn.secondary} onClick={downloadDraft} disabled={busy}>Download text</button></div>
          </Card>
          <Card title="Submit it yourself">
            <p>Open <a className="underline" href={source.officialOptOutUrl} target="_blank" rel="noopener noreferrer">{source.name}&rsquo;s official opt-out page</a> and follow its steps. You&rsquo;ll complete any verification or CAPTCHA there. PrivatePath never submits anything on your behalf.</p>
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const d = String(f.get("date") ?? "");
              run(() => api(`/removal-requests/${req.id}/mark-submitted`, "POST", { method: f.get("method"), ...(d ? { submittedAt: new Date(`${d}T12:00:00Z`).toISOString() } : {}), expectedResponseDays: Number(f.get("days")) })); }}>
              <p className="font-medium">When you&rsquo;ve submitted it, record that here:</p>
              <label className="block">How did you submit it?<select name="method" className={inputCls}><option value="web_form">Website form</option><option value="email">Email</option><option value="mail">Postal mail</option></select></label>
              <label className="block">Date submitted (leave blank for today)<input name="date" type="date" max={new Date().toISOString().slice(0, 10)} className={inputCls} /></label>
              <label className="block">When do you expect a response?<select name="days" defaultValue="30" className={inputCls}><option value="14">In about 2 weeks</option><option value="30">In about 30 days</option><option value="45">In about 45 days</option><option value="60">In about 60 days</option></select></label>
              <button className={btn.primary} disabled={busy}>I submitted this request</button>
            </form>
          </Card>
        </>
      )}

      {step === 5 && !archived && (
        <Card title="Track the outcome">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="font-medium">Submitted</dt><dd>{fmtDate(req.userSubmittedAt)}</dd></div>
            <div><dt className="font-medium">Expected response</dt><dd>{fmtDate(req.expectedResponseAt)}</dd></div>
            <div><dt className="font-medium">Status</dt><dd><Badge>{STATUS_LABEL[req.status]}</Badge></dd></div>
          </dl>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const s = String(f.get("status") ?? "");
            patch({ ...(s ? { status: s } : {}), confirmationReference: String(f.get("ref") ?? "").trim() || null, notes: String(f.get("notes") ?? "").trim() || null }, "Saved."); }}>
            {nextStatuses.length > 0 && <label className="block">Update status<select name="status" defaultValue="" className={inputCls}><option value="">Keep as {STATUS_LABEL[req.status]}</option>{nextStatuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>}
            <label className="block">Confirmation number or reference (optional)<input name="ref" maxLength={200} defaultValue={req.confirmationReference ?? ""} className={inputCls} /></label>
            <label className="block">Private notes (optional)<textarea name="notes" rows={3} maxLength={5000} defaultValue={req.notes ?? ""} className={inputCls} /></label>
            <button className={btn.primary} disabled={busy}>Save</button>
          </form>
          <p className="mt-4 text-sm"><Link className="underline" href="/reminders">Set or change follow-up reminders</Link></p>
        </Card>
      )}

      {step >= 2 && (
        <Card title="Proof (optional)">
          <p className="text-sm text-stone-600">Add a screenshot or PDF of a confirmation. Files are encrypted, private to you, and you can delete them any time. Don&rsquo;t upload government IDs.</p>
          {req.evidence.length > 0 && <ul className="mt-3 space-y-2">{req.evidence.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <a className="underline" href={`/api/v1/removal-requests/${req.id}/evidence/${ev.id}`}>{ev.contentType.replace("application/", "").replace("image/", "").toUpperCase()} · {Math.max(1, Math.round(ev.sizeBytes / 1024))} KB · {fmtDate(ev.uploadedAt)}</a>
              <button className={btn.secondary} disabled={busy} onClick={() => run(() => api(`/removal-requests/${req.id}/evidence/${ev.id}`, "DELETE"), "File deleted.")}>Delete</button></li>))}</ul>}
          <form onSubmit={upload} className="mt-3 flex flex-wrap items-end gap-2">
            <label>Choose a file (PNG, JPEG, WebP or PDF, up to 5 MB)<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className={inputCls} /></label>
            <button className={btn.secondary} disabled={busy}>Upload</button>
          </form>
        </Card>
      )}

      {req.history.length > 0 && (
        <Card title="History">
          <ol className="space-y-1 text-sm">{req.history.map((h, i) => <li key={i}>{fmtDate(h.at)} — {STATUS_LABEL[h.to]}</li>)}</ol>
        </Card>
      )}

      {!archived && req.status !== "AWAITING_USER_ACTION" && (
        <p className="text-sm"><button className="underline" disabled={busy} onClick={() => patch({ status: "ARCHIVED" })}>Archive this request</button></p>
      )}
    </div>
  );
}
