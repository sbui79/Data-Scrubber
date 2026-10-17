import { requireOnboarded } from "@/lib/session";
import { DeleteAccount, ExportButton } from "@/components/settings";
import { Card, PageTitle } from "@/components/ui";
import { fmtDate } from "@/lib/labels";

export default async function Settings() {
  const { user } = await requireOnboarded();
  return (
    <>
      <PageTitle sub="You control your data. Export or delete it at any time, free of charge.">Account Settings</PageTitle>
      <div className="space-y-4">
        <Card title="Account">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-medium">Nickname</dt><dd>{user.displayName}</dd></div>
            <div><dt className="font-medium">Email</dt><dd>{user.email}</dd></div>
            <div><dt className="font-medium">Terms accepted</dt><dd>Version {user.termsVersionAccepted}</dd></div>
            <div><dt className="font-medium">Marketing emails</dt><dd>{user.marketingConsentAt ? `Opted in ${fmtDate(user.marketingConsentAt)}` : "Not opted in"}</dd></div>
          </dl>
        </Card>
        <Card title="Export my data"><p className="mb-3 text-sm text-stone-600">Download a copy of everything we store about you as a JSON file.</p><ExportButton /></Card>
        <Card title="Delete my account"><p className="mb-3 text-sm text-stone-600">Permanently removes your data and uploaded files. This never requires a paid plan.</p><DeleteAccount /></Card>
      </div>
    </>
  );
}
