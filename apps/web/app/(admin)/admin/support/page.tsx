import { listStaff, staffListCases } from "@privatepath/core";
import { requireStaff } from "@/lib/session";
import { AdminSupport } from "@/components/admin";
import { PageTitle } from "@/components/ui";

export default async function AdminSupportPage() {
  const { deps, session, user } = await requireStaff();
  const [cases, staff] = await Promise.all([staffListCases(deps, session), user.role === "COMPLIANCE_ADMIN" ? listStaff(deps, session) : Promise.resolve([])]);
  return (
    <>
      <PageTitle sub="The queue shows only the category and subject. Reading a message needs separately approved, time-limited, logged access.">Support cases</PageTitle>
      <AdminSupport cases={JSON.parse(JSON.stringify(cases))} staff={staff} canGrant={user.role === "COMPLIANCE_ADMIN"} />
    </>
  );
}
