"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, Badge, btn, Card, inputCls } from "./ui";

type Msg = { kind: "error" | "success"; text: string } | null;
function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fn(); setBusy(false);
    if (r.ok) { setMsg({ kind: "success", text: ok }); router.refresh(); } else setMsg({ kind: "error", text: r.error?.message ?? "Something went wrong." });
  }
  return { busy, msg, act };
}
const Live = ({ msg }: { msg: Msg }) => <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>;

interface Pending { version: number; proposedByYou: boolean; snapshot: { name: string; category: string; officialOptOutUrl: string; instructionsMarkdown: string; verificationMethod: string; difficulty: number; sourceStatus: string } }
export interface AdminSource { id: string; name: string; domain: string; category: string; status: string; version: number; published: boolean; difficulty: number; pending: Pending[] }

export function AdminSources({ sources, canApprove }: { sources: AdminSource[]; canApprove: boolean }) {
  const { busy, msg, act } = useAct();
  return (
    <div className="space-y-4">
      <Live msg={msg} />
      <Card title="Propose a new source">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget;
          act(async () => { const r = await api("/admin/sources", "POST", { name: f.get("name"), domain: f.get("domain"), category: f.get("category"), officialOptOutUrl: f.get("url"),
            instructionsMarkdown: f.get("instr"), verificationMethod: f.get("ver"), difficulty: Number(f.get("diff")), sourceStatus: f.get("status"), lastReviewedAt: new Date().toISOString() }); if (r.ok) form.reset(); return r; },
            "Proposed. A second compliance reviewer must approve it before it appears to users."); }}>
          <label>Name<input name="name" required className={inputCls} /></label>
          <label>Domain (e.g. example.test)<input name="domain" required pattern="[a-z0-9.-]+\.[a-z]{2,}" className={inputCls} /></label>
          <label>Category<input name="category" required className={inputCls} /></label>
          <label>Official opt-out URL (https, on the domain)<input name="url" type="url" required className={inputCls} /></label>
          <label>Verification method<input name="ver" required className={inputCls} /></label>
          <label>Difficulty (1-5)<input name="diff" type="number" min={1} max={5} defaultValue={2} required className={inputCls} /></label>
          <label>Status when approved<select name="status" className={inputCls}><option value="AVAILABLE">Available</option><option value="MANUAL_ONLY">Manual only</option><option value="UNAVAILABLE">Unavailable</option></select></label>
          <label className="sm:col-span-2">Instructions (plain text)<textarea name="instr" required rows={3} className={inputCls} /></label>
          <div className="sm:col-span-2"><button className={btn.primary} disabled={busy}>Propose source</button></div>
        </form>
      </Card>
      {sources.map((s) => (
        <Card key={s.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="font-semibold">{s.name}</h2><p className="text-sm text-stone-600">{s.domain} · {s.category} · live version {s.published ? s.version : "none yet"}</p></div>
            <Badge tone={s.published ? "good" : "attention"}>{s.published ? s.status.replaceAll("_", " ").toLowerCase() : "pending first review"}</Badge>
          </div>
          {s.pending.map((p) => (
            <div key={p.version} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Version {p.version} awaiting a second reviewer {p.proposedByYou && "(proposed by you)"}</p>
              <p className="mt-1">Status {p.snapshot.sourceStatus.toLowerCase()} · difficulty {p.snapshot.difficulty} · {p.snapshot.verificationMethod}</p>
              <p className="mt-1 whitespace-pre-wrap">{p.snapshot.instructionsMarkdown}</p>
              <button className={`${btn.primary} mt-2`} disabled={busy || !canApprove || p.proposedByYou} onClick={() => act(() => api(`/admin/sources/${s.id}/versions/${p.version}/approve`, "POST"), "Approved and published.")}>
                {p.proposedByYou ? "Needs a different reviewer" : "Approve and publish"}</button>
            </div>))}
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
            act(() => api(`/admin/sources/${s.id}/versions`, "POST", { instructionsMarkdown: f.get("instr"), difficulty: Number(f.get("diff")), lastReviewedAt: new Date().toISOString() }), "Change proposed for review."); }}>
            <label className="min-w-0 flex-1">Propose new instructions<input name="instr" required className={inputCls} /></label>
            <label className="w-24">Difficulty<input name="diff" type="number" min={1} max={5} defaultValue={s.difficulty} className={inputCls} /></label>
            <button className={btn.secondary} disabled={busy}>Propose change</button>
          </form>
        </Card>))}
    </div>
  );
}

export interface CaseRow { id: string; category: string; subject: string; status: string; createdAt: string }
export interface StaffRow { id: string; nickname: string; role: string }

export function AdminSupport({ cases, staff, canGrant }: { cases: CaseRow[]; staff: StaffRow[]; canGrant: boolean }) {
  const { busy, msg, act } = useAct();
  const [opened, setOpened] = useState<{ id: string; text: string } | null>(null);
  async function view(id: string) {
    setOpened(null);
    await act(async () => { const r = await api<{ message: string }>(`/staff/support-cases/${id}/message`); if (r.ok) setOpened({ id, text: r.data.message }); return r; }, "Opened. This view has been logged.");
  }
  return (
    <div className="space-y-4">
      <Live msg={msg} />
      {opened && <Card title="Message (access logged)"><p className="whitespace-pre-wrap">{opened.text}</p><button className={`${btn.secondary} mt-3`} onClick={() => setOpened(null)}>Close</button></Card>}
      {cases.length === 0 ? <Card><p className="text-stone-600">No support cases.</p></Card> : cases.map((c) => (
        <Card key={c.id}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{c.subject}</h2><p className="text-sm text-stone-600">{c.category.replaceAll("_", " ").toLowerCase()} · case {c.id.slice(0, 8)}</p></div>
            <Badge tone={c.category === "SAFETY_CONCERN" ? "attention" : "neutral"}>{c.status.replace("_", " ").toLowerCase()}</Badge></div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label>Status<select defaultValue={c.status} className={inputCls} onChange={(e) => act(() => api(`/staff/support-cases/${c.id}/status`, "PATCH", { status: e.target.value }), "Status updated.")}>
              <option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label>
            <button className={btn.secondary} disabled={busy} onClick={() => view(c.id)}>View message (needs approved access)</button>
          </div>
          {canGrant && staff.length > 0 && (
            <form className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[1fr_2fr_auto]" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
              act(() => api("/admin/access-grants", "POST", { adminUserId: f.get("who"), supportCaseId: c.id, purpose: f.get("why"), minutes: Number(f.get("min")) }), "Time-limited access granted.") }}>
              <label>Grant access to<select name="who" required className={inputCls}>{staff.map((s) => <option key={s.id} value={s.id}>{s.nickname} ({s.role.toLowerCase()})</option>)}</select></label>
              <label>Purpose (required, logged)<input name="why" required minLength={10} className={inputCls} /></label>
              <label>Minutes<input name="min" type="number" min={5} max={60} defaultValue={30} className={`${inputCls} w-24`} /></label>
              <div className="sm:col-span-3"><button className={btn.secondary} disabled={busy}>Approve time-limited access</button></div>
            </form>)}
        </Card>))}
    </div>
  );
}
