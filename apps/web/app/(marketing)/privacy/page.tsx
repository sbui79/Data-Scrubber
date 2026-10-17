export const metadata = { title: "Privacy Policy — PrivatePath" };
export default function Privacy() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><strong>Draft for attorney review.</strong> This outline is not final legal text. Version 2026-10-draft-1.</p>
      <div className="mt-6 space-y-4 text-stone-700">
        <section><h2 className="font-semibold text-stone-900">What we collect</h2><p>Only what you give us: account details, the optional profile items you choose to enter, your listing checks, requests, notes, reminders, and files you upload. We do not collect government IDs.</p></section>
        <section><h2 className="font-semibold text-stone-900">What we do not do</h2><p>We do not collect information about you from third-party sources, sell or share your information, build a searchable directory of people, send your personal data to AI providers, or use it to train AI models.</p></section>
        <section><h2 className="font-semibold text-stone-900">How we protect it</h2><p>Sensitive fields and files are encrypted at rest with a separate key for each account, and connections use TLS. Access by staff is limited, redacted by default, and logged.</p></section>
        <section><h2 className="font-semibold text-stone-900">Your choices</h2><p>You can view, correct, export and delete your information in Account Settings. Marketing email requires separate opt-in. Reminder emails are transactional and contain no personal details.</p></section>
        <section><h2 className="font-semibold text-stone-900">Retention</h2><p>When you delete your account we delete your profile, requests, notes, reminders, files and encryption key. We keep security audit records that contain identifiers but no personal content. <em>Exact periods to be set by counsel.</em></p></section>
        <section><h2 className="font-semibold text-stone-900">California and other state rights</h2><p><em>To be drafted by counsel (notice at collection, rights requests, contact details).</em></p></section>
      </div>
    </>
  );
}
