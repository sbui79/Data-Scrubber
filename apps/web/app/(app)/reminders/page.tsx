import { listNotifications, listReminders } from "@privatepath/core";
import { requireOnboarded } from "@/lib/session";
import { ReminderManager } from "@/components/reminders";
import { PageTitle } from "@/components/ui";

export default async function Reminders() {
  const { deps, session, user } = await requireOnboarded();
  const [reminders, notifications, submitted] = await Promise.all([
    listReminders(deps, session), listNotifications(deps, session),
    deps.db.removalRequest.findMany({ where: { userId: user.id, userSubmittedAt: { not: null }, status: { not: "ARCHIVED" } }, include: { source: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageTitle sub="Gentle nudges to follow up and to re-check later. Mute, reschedule or delete any of them.">Reminders</PageTitle>
      <ReminderManager reminders={JSON.parse(JSON.stringify(reminders))} notifications={JSON.parse(JSON.stringify(notifications))} submitted={submitted.map((r) => ({ id: r.id, name: r.source.name }))} />
    </>
  );
}
