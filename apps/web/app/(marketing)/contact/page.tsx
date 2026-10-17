import Link from "next/link";
export const metadata = { title: "Contact — PrivatePath" };
export default function Contact() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Contact &amp; support</h1>
      <div className="mt-6 space-y-4">
        <section className="rounded-xl border border-stone-200 bg-white p-4"><h2 className="font-semibold">Signed-in customers</h2><p className="mt-1 text-stone-700">Use the secure form on the <Link className="underline" href="/help">Help page</Link>. Messages are encrypted, and our staff see only a redacted summary unless access is separately approved and logged.</p></section>
        <section className="rounded-xl border border-stone-200 bg-white p-4"><h2 className="font-semibold">Please never send us</h2><p className="mt-1 text-stone-700">A government ID, Social Security number, payment card number or password. We will never ask for them by email or message.</p></section>
        <section className="rounded-xl border border-teal-700/30 bg-white p-4"><h2 className="font-semibold">Safety concerns</h2><p className="mt-1 text-stone-700">If you are in immediate danger, contact emergency services. See our <Link className="underline" href="/safety">safety resources</Link>.</p></section>
        <p className="text-sm text-stone-600">General contact email and mailing address: <em>placeholder, to be added before launch.</em></p>
      </div>
    </>
  );
}
