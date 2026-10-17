"use client";
import { useEffect, useState } from "react";

const CONCERNS = [["name", "My name"], ["old_addresses", "Old addresses"], ["phone", "My phone number"], ["email", "My email address"],
  ["relatives", "Names of relatives"], ["profile_links", "Links to my public profiles"], ["property", "Property references"], ["other", "Something else"]];
const KEY = "pp-concerns";

/** Kept only in this browser. It helps the user focus; nothing is sent or stored on the server. */
export function ConcernChecklist() {
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { try { setSel(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ } }, []);
  const toggle = (k: string) => setSel((cur) => {
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  return (
    <fieldset>
      <legend className="font-medium">What would you like to reduce online?</legend>
      <p className="text-sm text-stone-600">Choose any that apply. This stays in your browser and just helps you focus.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {CONCERNS.map(([k, l]) => <label key={k} className="flex items-center gap-3"><input type="checkbox" className="size-5" checked={sel.includes(k!)} onChange={() => toggle(k!)} />{l}</label>)}
      </div>
    </fieldset>
  );
}
