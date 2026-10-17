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
