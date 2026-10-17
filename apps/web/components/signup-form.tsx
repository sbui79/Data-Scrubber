"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, btn, inputCls } from "./ui";

export function SignupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    const res = await api("/auth/signup", "POST", {
      displayName: String(f.get("displayName") ?? ""),
      acceptTerms: f.get("terms") === "on", acceptPrivacy: f.get("privacy") === "on", authorizeOwnData: f.get("own") === "on",
      marketingConsent: f.get("marketing") === "on",
    });
    setBusy(false);
    if (res.ok) { router.push("/profile"); router.refresh(); } else setError(res.error.message);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="displayName" className="font-medium">Profile nickname</label>
        <p id="nick-help" className="text-sm text-stone-600">A name shown only to you inside the app. It doesn&rsquo;t need to be your real name.</p>
        <input id="displayName" name="displayName" required maxLength={40} aria-describedby="nick-help" className={inputCls} />
      </div>
      <fieldset className="space-y-3">
        <legend className="font-medium">Required acknowledgements</legend>
        <label className="flex gap-3"><input type="checkbox" name="terms" required className="mt-1 size-5" />
          <span>I agree to the <a className="underline" href="/terms" target="_blank" rel="noopener">Terms of Service</a>.</span></label>
        <label className="flex gap-3"><input type="checkbox" name="privacy" required className="mt-1 size-5" />
          <span>I have read the <a className="underline" href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
        <label className="flex gap-3"><input type="checkbox" name="own" required className="mt-1 size-5" />
          <span>I authorize PrivatePath to process <strong>my own</strong> personal information to help me manage and request removal of my own public data. I will not use this service for anyone else&rsquo;s information.</span></label>
      </fieldset>
      <fieldset>
        <legend className="font-medium">Optional</legend>
        <label className="mt-2 flex gap-3"><input type="checkbox" name="marketing" className="mt-1 size-5" />
          <span>Send me occasional product news. (Reminders you set up are separate and don&rsquo;t need this.)</span></label>
      </fieldset>
      {error && <Alert kind="error">{error}</Alert>}
      <button className={btn.primary} disabled={busy}>{busy ? "Saving…" : "Create my account"}</button>
    </form>
  );
}
