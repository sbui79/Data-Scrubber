"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, btn, inputCls } from "./ui";

export function ListingReviewForm({ sourceId, domain, existing }: { sourceId: string; domain: string; existing: { id: string; status: string; listingUrl: string | null } | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(existing?.status ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const url = String(f.get("url") ?? "").trim();
    const body: Record<string, unknown> = { status };
    if (status === "FOUND" && url) { body.listingUrl = url; body.confirmOwnership = f.get("own") === "on"; }
    setBusy(true); setMsg(null);
    const res = existing ? await api(`/listing-reviews/${existing.id}`, "PATCH", body) : await api("/listing-reviews", "POST", { sourceId, ...body });
    setBusy(false);
    if (res.ok) { setMsg({ kind: "success", text: "Saved." }); router.refresh(); } else setMsg({ kind: "error", text: res.error.message });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="font-medium">Did you find your own listing on this site?</legend>
        <p className="text-sm text-stone-600">Check the site yourself. PrivatePath doesn&rsquo;t search for you.</p>
        <div className="mt-2 space-y-2">
          {[["FOUND", "I found my listing"], ["NOT_FOUND", "I did not find my listing"], ["NOT_SURE", "I am not sure"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-3"><input type="radio" name="status" value={v} checked={status === v} onChange={() => setStatus(v!)} required className="size-5" />{l}</label>
          ))}
        </div>
      </fieldset>
      {status === "FOUND" && (
        <div className="space-y-3 rounded-lg bg-stone-50 p-3">
          <label className="block">Link to your listing (optional)
            <span className="block text-sm text-stone-600">Must be an https address on <strong>{domain}</strong>. We never open it.</span>
            <input name="url" type="url" defaultValue={existing?.listingUrl ?? ""} className={inputCls} />
          </label>
          <label className="flex gap-3"><input type="checkbox" name="own" className="mt-1 size-5" /><span>This listing is about <strong>me</strong> (required if you add a link).</span></label>
        </div>
      )}
      <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>
      <button className={btn.secondary} disabled={busy || !status}>{busy ? "Saving…" : existing ? "Update" : "Save"}</button>
    </form>
  );
}

const TYPES = [["OPT_OUT", "Opt-out"], ["SUPPRESSION", "Suppression"], ["DELETION", "Deletion"], ["CORRECTION", "Correction"]];

export function StartRequest({ sourceId, listingReviewId }: { sourceId: string; listingReviewId?: string }) {
  const router = useRouter();
  const [type, setType] = useState("OPT_OUT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    const res = await api<{ id: string }>("/removal-requests", "POST", { sourceId, requestType: type, listingReviewId });
    setBusy(false);
    if (res.ok) router.push(`/requests/${res.data.id}`); else setError(res.error.message);
  }
  return (
    <div className="space-y-3">
      <label className="block">Request type
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      {error && <Alert kind="error">{error}</Alert>}
      <button onClick={go} className={btn.primary} disabled={busy}>{busy ? "Starting…" : "Start a removal request"}</button>
    </div>
  );
}
