import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";
import { getServerDeps } from "@/lib/server";
import { SignupForm } from "@/components/signup-form";
import { Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const session = await currentSession();
  if (!session) redirect(getServerDeps().authMode === "mock" ? "/dev-login" : "/");
  const user = await getServerDeps().deps.db.user.findUnique({ where: { authProviderId: session.authProviderId } });
  if (user) redirect("/dashboard");
  return (
    <main id="main" className="mx-auto max-w-xl p-6">
      <PageTitle sub="PrivatePath helps you manage and remove your own public data. It is not a people-search or investigation service.">Welcome</PageTitle>
      <Card><SignupForm /></Card>
    </main>
  );
}
