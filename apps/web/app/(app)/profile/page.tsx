import { getProfile } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { ProfileForm, type ProfileValues } from "@/components/profile-form";
import { Alert, Card, PageTitle } from "@/components/ui";

export default async function Profile() {
  const { deps, session } = await requireOnboarded();
  const profile = await getProfile(deps, session).catch(() => null);
  return (
    <>
      <PageTitle sub="Only your own information. Everything here is encrypted and used only to prepare your own requests.">My Profile</PageTitle>
      {!profile && <div className="mb-4"><Alert kind="info">Start with your name. Everything else is optional, and each item explains why it&rsquo;s asked.</Alert></div>}
      <Card><ProfileForm initial={profile as ProfileValues | null} /></Card>
    </>
  );
}
