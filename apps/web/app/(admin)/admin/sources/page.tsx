import { adminListSources } from "@privatepath/core";
import { requireStaff } from "@/lib/session";
import { AdminSources } from "@/components/admin";
import { PageTitle } from "@/components/ui";
import { notFound } from "next/navigation";

export default async function AdminSourcesPage() {
  const { deps, session, user } = await requireStaff();
  if (user.role === "SUPPORT") notFound();
  const sources = await adminListSources(deps, session);
  return (
    <>
      <PageTitle sub="New sources and material changes need approval from a second compliance reviewer before users see them.">Source catalog</PageTitle>
      <AdminSources sources={JSON.parse(JSON.stringify(sources))} canApprove={user.role === "COMPLIANCE_ADMIN"} />
    </>
  );
}
