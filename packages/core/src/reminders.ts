import { z } from "zod";
import type { Prisma } from "@privatepath/db";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { requireUser } from "./users";
import { moveStatus } from "./requests";

const DAY = 86_400_000;
const MAX_ACTIVE = 50;
const FOLLOWUP_DAYS: Record<string, number> = { FOLLOWUP_7: 7, FOLLOWUP_14: 14, FOLLOWUP_30: 30, FOLLOWUP_60: 60, FOLLOWUP_90: 90 };
const RECHECK_DAYS: Record<string, number> = { RECHECK_6M: 182, RECHECK_12M: 365 };

export const CreateReminderInput = z.object({
  type: z.enum(["FOLLOWUP_7", "FOLLOWUP_14", "FOLLOWUP_30", "FOLLOWUP_60", "FOLLOWUP_90", "RECHECK_6M", "RECHECK_12M", "CUSTOM", "CALIFORNIA_DROP"]),
  removalRequestId: z.string().min(1).max(100).optional(),
  scheduledFor: z.coerce.date().optional(),
  channel: z.enum(["IN_APP", "EMAIL"]).default("IN_APP"),
});
export const UpdateReminderInput = z.object({
  scheduledFor: z.coerce.date().optional(),
  status: z.enum(["SCHEDULED", "MUTED"]).optional(),
  channel: z.enum(["IN_APP", "EMAIL"]).optional(),
}).refine((v) => Object.keys(v).length > 0, "nothing to update");

const present = (r: { id: string; type: string; removalRequestId: string | null; scheduledFor: Date; status: string; channel: string; sentAt: Date | null }) =>
  ({ id: r.id, type: r.type, removalRequestId: r.removalRequestId, scheduledFor: r.scheduledFor, status: r.status, channel: r.channel, sentAt: r.sentAt });

const future = (d: Date, now = new Date()) => {
  if (d.getTime() <= now.getTime()) throw new AppError(400, "reminder_in_past", "That date has already passed. Please choose a later date.");
  if (d.getTime() > now.getTime() + 2 * 365 * DAY) throw new AppError(400, "invalid_input", "Please choose a date within the next two years.");
};

export async function createReminder(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const input = CreateReminderInput.parse(raw);
  const user = await requireUser(deps, session);
  const now = new Date();
  const request = input.removalRequestId
    ? await deps.db.removalRequest.findFirst({ where: { id: input.removalRequestId, userId: user.id } })
    : null;
  if (input.removalRequestId && !request) throw new AppError(404, "request_not_found", "Request not found.");

  let scheduledFor: Date;
  if (input.type in FOLLOWUP_DAYS) {
    if (!request) throw new AppError(400, "invalid_input", "Follow-up reminders belong to a removal request.");
    if (!request.userSubmittedAt) throw new AppError(409, "not_submitted", "Record that you submitted this request first.");
    if (input.scheduledFor) throw new AppError(400, "invalid_input", "Follow-up reminders use a fixed number of days.");
    scheduledFor = new Date(request.userSubmittedAt.getTime() + FOLLOWUP_DAYS[input.type]! * DAY);
  } else if (input.type in RECHECK_DAYS) {
    if (input.scheduledFor) throw new AppError(400, "invalid_input", "Re-check reminders use a fixed interval.");
    scheduledFor = new Date((request?.completedAt ?? now).getTime() + RECHECK_DAYS[input.type]! * DAY);
  } else {
    if (!input.scheduledFor) throw new AppError(400, "invalid_input", "Please choose a date.");
    scheduledFor = input.scheduledFor;
  }
  future(scheduledFor, now);

  const active = await deps.db.reminder.count({ where: { userId: user.id, status: { in: ["SCHEDULED", "MUTED"] } } });
  if (active >= MAX_ACTIVE) throw new AppError(409, "too_many_reminders", "You've reached the reminder limit. Delete some to add more.");
  if (await deps.db.reminder.findFirst({ where: { userId: user.id, removalRequestId: request?.id ?? null, type: input.type, status: { in: ["SCHEDULED", "MUTED"] } } })) {
    throw new AppError(409, "reminder_exists", "You already have this reminder.");
  }
  return deps.db.$transaction(async (tx) => {
    const r = await tx.reminder.create({ data: { userId: user.id, removalRequestId: request?.id ?? null, type: input.type, channel: input.channel, scheduledFor } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REMINDER_CREATED", entityType: "Reminder", entityId: r.id, metadata: { reason: input.type } });
    return present(r);
  });
}

export async function listReminders(deps: Deps, session: Session) {
  const user = await requireUser(deps, session);
  const rows = await deps.db.reminder.findMany({ where: { userId: user.id, status: { in: ["SCHEDULED", "MUTED", "SENT"] } }, orderBy: { scheduledFor: "asc" } });
  return rows.map(present);
}

export async function updateReminder(deps: Deps, session: Session, id: string, raw: unknown, ctx: RequestContext = {}) {
  const patch = UpdateReminderInput.parse(raw);
  const user = await requireUser(deps, session);
  const r = await deps.db.reminder.findFirst({ where: { id, userId: user.id } });
  if (!r) throw new AppError(404, "reminder_not_found", "Reminder not found.");
  if (!["SCHEDULED", "MUTED"].includes(r.status)) throw new AppError(409, "reminder_closed", "This reminder has already been sent.");
  if (patch.scheduledFor) future(patch.scheduledFor);
  return deps.db.$transaction(async (tx) => {
    const res = await tx.reminder.updateMany({ where: { id, userId: user.id, status: r.status }, data: {
      ...(patch.scheduledFor ? { scheduledFor: patch.scheduledFor } : {}), ...(patch.status ? { status: patch.status } : {}), ...(patch.channel ? { channel: patch.channel } : {}) } });
    if (res.count !== 1) throw new AppError(409, "conflict", "This reminder changed in the meantime. Please reload.");
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REMINDER_UPDATED", entityType: "Reminder", entityId: id, metadata: { fieldNames: Object.keys(patch) } });
    return present(await tx.reminder.findUniqueOrThrow({ where: { id } }));
  });
}

export async function deleteReminder(deps: Deps, session: Session, id: string, ctx: RequestContext = {}) {
  const user = await requireUser(deps, session);
  await deps.db.$transaction(async (tx) => {
    const res = await tx.reminder.deleteMany({ where: { id, userId: user.id } });
    if (res.count !== 1) throw new AppError(404, "reminder_not_found", "Reminder not found.");
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "REMINDER_DELETED", entityType: "Reminder", entityId: id, metadata: {} });
  });
  return { deleted: true };
}

// ---- Notifications ----

export async function listNotifications(deps: Deps, session: Session) {
  const user = await requireUser(deps, session);
  const rows = await deps.db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((n) => ({ id: n.id, title: n.title, body: n.body, read: n.readAt !== null, createdAt: n.createdAt }));
}

export async function markNotificationRead(deps: Deps, session: Session, id: string) {
  const user = await requireUser(deps, session);
  const res = await deps.db.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  if (res.count === 0 && !(await deps.db.notification.findFirst({ where: { id, userId: user.id } }))) throw new AppError(404, "notification_not_found", "Notification not found.");
  return { read: true };
}

// ---- Delivery (system job; called by a scheduler, never by a user request) ----

const STUCK_AFTER_MS = 15 * 60_000;

/**
 * Delivers due reminders. Safe to run concurrently: each reminder is claimed atomically, and a crash
 * mid-delivery is recovered after 15 minutes. Messages are generic and carry no personal data.
 */
export async function processDueReminders(deps: Deps, now = new Date(), limit = 100) {
  await deps.db.reminder.updateMany({ where: { status: "SENDING", sentAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } }, data: { status: "SCHEDULED", sentAt: null } });
  const due = await deps.db.reminder.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" }, take: limit,
    include: { user: { select: { id: true, email: true } }, request: { select: { id: true, status: true } } } });
  let sent = 0, failed = 0;
  for (const r of due) {
    const claim = await deps.db.reminder.updateMany({ where: { id: r.id, status: "SCHEDULED" }, data: { status: "SENDING", sentAt: now } });
    if (claim.count !== 1) continue;
    try {
      if (r.channel === "EMAIL" && deps.email) {
        await deps.email.send({
          to: r.user.email, subject: "A reminder from PrivatePath",
          text: `You have a reminder waiting in PrivatePath.\n\nSign in to review it: ${deps.appUrl ?? ""}/reminders\n\n` +
            `You're receiving this because you set a reminder in your account. You can change or delete reminders at any time.\n` +
            `PrivatePath — [postal address placeholder: required for commercial email; counsel to confirm]`,
        });
      }
      await deps.db.$transaction(async (tx) => {
        await tx.reminder.update({ where: { id: r.id }, data: { status: "SENT", sentAt: now } });
        await tx.notification.create({ data: { userId: r.userId, title: "Reminder",
          body: r.type.startsWith("RECHECK") ? "It's time for a periodic re-check of your listings." : r.type === "CALIFORNIA_DROP" ? "Time to check the status of your California DROP request on the official site."
            : "A follow-up on one of your removal requests is due." } });
        if (r.type in FOLLOWUP_DAYS && r.request && ["SUBMITTED_BY_USER", "IN_PROGRESS", "VERIFICATION_REQUESTED"].includes(r.request.status)) {
          await moveStatus(tx, deps, {}, r.userId, r.request, "FOLLOW_UP_DUE", {}, null);
        }
        if (r.type in RECHECK_DAYS) { // recurring
          await tx.reminder.create({ data: { userId: r.userId, removalRequestId: r.removalRequestId, type: r.type, channel: r.channel,
            scheduledFor: new Date(now.getTime() + RECHECK_DAYS[r.type]! * DAY) } });
        }
        await writeAudit(tx, deps, {}, { actorUserId: null, targetUserId: r.userId, eventType: "REMINDER_SENT", entityType: "Reminder", entityId: r.id, metadata: { reason: r.type } });
      });
      sent++;
    } catch {
      failed++;
      await deps.db.reminder.updateMany({ where: { id: r.id, status: "SENDING" }, data: { status: "SCHEDULED", sentAt: null } });
    }
  }
  return { sent, failed };
}
