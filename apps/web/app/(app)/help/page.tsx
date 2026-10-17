import Link from "next/link";
import { SupportForm } from "@/components/support-form";
import { Card, PageTitle } from "@/components/ui";
import { FAQ } from "@/lib/content";

export default function Help() {
  return (
    <>
      <PageTitle sub="Guides, answers and a way to reach us. If you're in danger, contact local emergency services first.">Help</PageTitle>
      <div className="space-y-4">
        <Card title="Safety first"><p>If you or someone else is in immediate danger, call your local emergency number (911 in the US). For harassment or stalking concerns, choose &ldquo;A safety concern&rdquo; below, or see our <Link className="underline" href="/safety">safety resources</Link>.</p></Card>
        <Card title="Common questions">
          <div className="divide-y">{FAQ.map((f) => (<details key={f.q} className="py-2"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-2 text-stone-700">{f.a}</p></details>))}</div>
        </Card>
        <Card title="Contact support"><SupportForm /></Card>
      </div>
    </>
  );
}
