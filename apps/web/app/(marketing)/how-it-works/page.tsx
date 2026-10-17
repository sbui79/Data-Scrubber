export const metadata = { title: "How it works — PrivatePath" };
const STEPS = [
  ["Create your account", "Accept the terms and confirm that you're using PrivatePath for your own information only."],
  ["Add a minimal profile", "Your name is the only required item. Other details are optional and each one explains why it's asked."],
  ["Check the source directory", "Visit each reviewed site yourself and tell us whether you found your own listing. We never search for you."],
  ["Prepare a request", "Choose what to include. Personal details like email or phone digits are left out unless you pick them."],
  ["Review and approve", "Read the exact text. It can't be copied or marked as sent until you approve it."],
  ["Submit it yourself", "Use the site's official opt-out page or email. We never submit anything for you or handle logins."],
  ["Record the result and set reminders", "Add a reference number or proof, and choose follow-up and re-check reminders."],
];
export default function HowItWorks() {
  return (
    <>
      <h1 className="text-3xl font-semibold">How it works</h1>
      <ol className="mt-6 space-y-4">{STEPS.map(([t, b], i) => <li key={t} className="flex gap-4"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-800 text-white">{i + 1}</span><div><h2 className="font-semibold">{t}</h2><p className="text-stone-700">{b}</p></div></li>)}</ol>
      <p className="mt-8 rounded-lg bg-stone-100 p-4 text-sm">California residents also get a guided checklist for the state&rsquo;s official DROP platform. You complete that directly on the government site; we never submit it for you.</p>
    </>
  );
}
