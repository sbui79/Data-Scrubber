"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, Badge, btn, Card, inputCls } from "./ui";
import { fmtDate, REMINDER_LABEL } from "@/lib/labels";

interface Rem { id: string; type: string; removalRequestId: string | null; scheduledFor: string; status: string; channel: string }
interface Note { id: string; title: string; body: string; read: boolean; createdAt: string }

export function ReminderManager({ reminders, notifications, submitted }: { reminders: Rem[]; notifications: Note[]; submitted: { id: string; name: string }[] }) {
  const router = useRouter();
  const [type, setType] = useState("FOLLOWUP_14");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const needsRequest = type.startsWith("FOLLOWUP");
  const needsDate = type === "CUSTOM" || type === "CALIFORNIA_DROP";

  async function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fn(); setBusy(false);
    if (r.ok) { setMsg({ kind: "success", text: ok }); router.refresh(); } else setMsg({ kind: "error", text: r.error?.message ?? "Something went wrong." });
  }
  const dateIso = (d: string) => new Date(`${d}T09:00:00`).toISOString();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>
      <Card title="Notifications">
        {notifications.length === 0 ? <p className="text-stone-600">No notifications yet.</p> : (
          <ul className="space-y-2">{notifications.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={n.read ? "text-stone-600" : "font-medium"}>{n.body} <span className="text-sm text-stone-500">({fmtDate(n.createdAt)})</span></span>
              {!n.read && <button className={btn.secondary} onClick={() => act(() => api(`/notifications/${n.id}/read`, "POST"), "Marked as read.")}>Mark read</button>}
            </li>))}</ul>)}
      </Card>
      <Card title="Your reminders">
        {reminders.length === 0 ? <p className="text-stone-600">No reminders yet. Add one below.</p> : (
          <ul className="space-y-3">{reminders.map((r) => (
            <li key={r.id} className="rounded-lg border border-stone-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{REMINDER_LABEL[r.type] ?? r.type}</span>
                <span className="flex gap-2"><Badge tone={r.status === "MUTED" ? "neutral" : r.status === "SENT" ? "good" : "attention"}>{r.status === "SCHEDULED" ? "Scheduled" : r.status === "MUTED" ? "Muted" : "Sent"}</Badge><Badge>{r.channel === "EMAIL" ? "Email" : "In-app"}</Badge></span>
              </div>
              <p className="text-sm text-stone-600">{r.status === "SENT" ? "Sent" : "Due"} {fmtDate(r.scheduledFor)}</p>
              {r.status !== "SENT" && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <button className={btn.secondary} disabled={busy} onClick={() => act(() => api(`/reminders/${r.id}`, "PATCH", { status: r.status === "MUTED" ? "SCHEDULED" : "MUTED" }), r.status === "MUTED" ? "Unmuted." : "Muted.")}>{r.status === "MUTED" ? "Unmute" : "Mute"}</button>
                  <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const d = String(new FormData(e.currentTarget).get("d") ?? ""); if (d) act(() => api(`/reminders/${r.id}`, "PATCH", { scheduledFor: dateIso(d) }), "Rescheduled."); }}>
                    <label className="text-sm">New date<input name="d" type="date" min={tomorrow} required className={inputCls} /></label><button className={btn.secondary} disabled={busy}>Reschedule</button>
                  </form>
                  <button className={btn.secondary} disabled={busy} onClick={() => act(() => api(`/reminders/${r.id}`, "DELETE"), "Reminder deleted.")}>Delete</button>
                </div>)}
            </li>))}</ul>)}
      </Card>
      <Card title="Add a reminder">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const d = String(f.get("d") ?? "");
          act(() => api("/reminders", "POST", { type, channel: f.get("channel"), ...(needsRequest ? { removalRequestId: f.get("req") } : {}), ...(needsDate ? { scheduledFor: dateIso(d) } : {}) }), "Reminder added."); }}>
          <label className="block">Reminder<select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>{Object.entries(REMINDER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {needsRequest && (submitted.length === 0 ? <Alert kind="info">Follow-up reminders attach to a request you&rsquo;ve submitted. Record a submission first.</Alert>
            : <label className="block">Which request?<select name="req" required className={inputCls}>{submitted.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>)}
          {needsDate && <label className="block">Date<input name="d" type="date" min={tomorrow} required className={inputCls} /></label>}
          <label className="block">How should we remind you?<select name="channel" defaultValue="IN_APP" className={inputCls}><option value="IN_APP">In the app</option><option value="EMAIL">By email (also in the app)</option></select></label>
          <p className="text-sm text-stone-600">Reminder emails never include your personal details and are not marketing. You can change or delete reminders anytime.</p>
          <button className={btn.primary} disabled={busy || (needsRequest && submitted.length === 0)}>Add reminder</button>
        </form>
      </Card>
    </div>
  );
}
