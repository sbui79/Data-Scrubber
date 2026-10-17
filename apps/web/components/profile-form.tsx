"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, btn, inputCls } from "./ui";

export interface ProfileValues {
  legalFirstName: string; legalLastName: string; aliases: string[]; birthYearOrAgeRange: string | null; currentCity: string | null;
  currentState: string | null; previousLocations: string[]; emailAddresses: string[]; phoneNumbers: string[];
}
const lines = (s: FormDataEntryValue | null) => String(s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

function Field({ id, label, why, children }: { id: string; label: string; why: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="font-medium">{label}</label>
      <p id={`${id}-why`} className="text-sm text-stone-600">{why}</p>
      {children}
    </div>
  );
}

export function ProfileForm({ initial }: { initial: ProfileValues | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const opt = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v || (initial ? null : undefined); };
    const list = (k: string) => { const v = lines(f.get(k)); return v.length ? v : (initial ? null : undefined); };
    const body = {
      legalFirstName: String(f.get("first") ?? "").trim(), legalLastName: String(f.get("last") ?? "").trim(),
      aliases: list("aliases"), birthYearOrAgeRange: opt("age"), currentCity: opt("city"), currentState: opt("state"),
      previousLocations: list("prev"), emailAddresses: list("emails"), phoneNumbers: list("phones"),
    };
    setBusy(true); setMsg(null);
    const res = await api("/profile", initial ? "PATCH" : "POST", body);
    setBusy(false);
    if (res.ok) { setMsg({ kind: "success", text: "Saved." }); router.refresh(); }
    else setMsg({ kind: "error", text: res.error.fields?.length ? `Please check: ${res.error.fields.join(", ")}.` : res.error.message });
  }

  const v = initial;
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="first" label="Legal first name" why="Used to fill in your own requests."><input id="first" name="first" required maxLength={80} defaultValue={v?.legalFirstName} aria-describedby="first-why" className={inputCls} /></Field>
        <Field id="last" label="Legal last name" why="Used to fill in your own requests."><input id="last" name="last" required maxLength={80} defaultValue={v?.legalLastName} aria-describedby="last-why" className={inputCls} /></Field>
      </div>
      <Field id="aliases" label="Other names (optional)" why="Previous or alternate names, one per line, so you can recognize your own listings.">
        <textarea id="aliases" name="aliases" rows={2} defaultValue={v?.aliases.join("\n")} aria-describedby="aliases-why" className={inputCls} /></Field>
      <Field id="age" label="Birth year or age range (optional)" why="Only to help you tell your listing from someone else's. Leave blank if you prefer.">
        <input id="age" name="age" maxLength={20} defaultValue={v?.birthYearOrAgeRange ?? ""} aria-describedby="age-why" className={inputCls} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="city" label="Current city (optional)" why="Helps you match listings. We never ask for your full street address."><input id="city" name="city" defaultValue={v?.currentCity ?? ""} aria-describedby="city-why" className={inputCls} /></Field>
        <Field id="state" label="Current state (optional)" why="Also used to show the California module if relevant."><input id="state" name="state" defaultValue={v?.currentState ?? ""} aria-describedby="state-why" className={inputCls} /></Field>
      </div>
      <Field id="prev" label="Previous cities or states (optional)" why="One per line. Old addresses are a common thing people want removed.">
        <textarea id="prev" name="prev" rows={2} defaultValue={v?.previousLocations.join("\n")} aria-describedby="prev-why" className={inputCls} /></Field>
      <Field id="emails" label="Email addresses you want to check (optional)" why="One per line. Only used if you choose to include one in a request.">
        <textarea id="emails" name="emails" rows={2} defaultValue={v?.emailAddresses.join("\n")} aria-describedby="emails-why" className={inputCls} /></Field>
      <Field id="phones" label="Phone numbers you want to check (optional)" why="One per line. Requests include at most the last 4 digits, and only if you choose.">
        <textarea id="phones" name="phones" rows={2} defaultValue={v?.phoneNumbers.join("\n")} aria-describedby="phones-why" className={inputCls} /></Field>
      <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>
      <button className={btn.primary} disabled={busy}>{busy ? "Saving…" : v ? "Save changes" : "Save profile"}</button>
    </form>
  );
}
