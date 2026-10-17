import Link from "next/link";
import { PRIVACY_POINTS } from "@/lib/content";
import { Card, PageTitle } from "@/components/ui";

export default function PrivacySecurity() {
  return (
    <>
      <PageTitle sub="Plain-English answers about how your information is handled.">Privacy &amp; Security</PageTitle>
      <div className="space-y-4">
        <Card><ul className="space-y-3">{PRIVACY_POINTS.map((p) => <li key={p.title}><strong>{p.title}.</strong> {p.body}</li>)}</ul></Card>
        <Card><p>Read the full <Link className="underline" href="/privacy">Privacy Policy</Link> and <Link className="underline" href="/terms">Terms of Service</Link>, or manage your data in <Link className="underline" href="/settings">Account Settings</Link>.</p></Card>
      </div>
    </>
  );
}
