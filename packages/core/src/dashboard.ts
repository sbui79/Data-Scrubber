import type { RequestStatus } from "@privatepath/db";
import type { Deps } from "./deps";
import type { Session } from "./auth";
import { requireUser } from "./users";

/**
 * Rough progress weights. This is an ESTIMATE of the user's own workflow progress, not a measure of what
 * is actually visible online, and never a guarantee. Closed-without-removal (denied) counts as zero.
 */
const WEIGHT: Record<RequestStatus, number | null> = {
  NOT_STARTED: 0, LISTING_NOT_FOUND: null, LISTING_FOUND: 0, DRAFT_READY: 0.15, AWAITING_USER_ACTION: 0.3,
  SUBMITTED_BY_USER: 0.5, VERIFICATION_REQUESTED: 0.6, IN_PROGRESS: 0.6, FOLLOW_UP_DUE: 0.6,
  COMPLETED: 1, DENIED_UNAVAILABLE: 0, ARCHIVED: null, // null = not counted
};

export function estimateProgress(statuses: RequestStatus[]) {
  const counted = statuses.filter((s) => WEIGHT[s] !== null);
  if (counted.length === 0) return { percent: null as number | null, label: "Estimated" as const };
  const total = counted.reduce((sum, s) => sum + WEIGHT[s]!, 0);
  return { percent: Math.round((total / counted.length) * 100), label: "Estimated" as const };
}

const ATTENTION: RequestStatus[] = ["DRAFT_READY", "AWAITING_USER_ACTION", "VERIFICATION_REQUESTED", "FOLLOW_UP_DUE"];

export interface NextAction { code: string; message: string; href: string }

export async function getDashboard(deps: Deps, session: Session, now = new Date()) {
  const user = await requireUser(deps, session);
  const uid = user.id;
  const [profile, reviews, requests, reminders, unread] = await Promise.all([
    deps.db.userProfile.findUnique({ where: { userId: uid }, select: { id: true } }),
    deps.db.listingReview.findMany({ where: { userId: uid }, select: { status: true } }),
    deps.db.removalRequest.findMany({ where: { userId: uid }, include: { source: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
    deps.db.reminder.findMany({ where: { userId: uid, status: "SCHEDULED", scheduledFor: { gt: now, lte: new Date(now.getTime() + 30 * 86_400_000) } }, orderBy: { scheduledFor: "asc" }, take: 10 }),
    deps.db.notification.count({ where: { userId: uid, readAt: null } }),
  ]);

  const needing = requests.filter((r) => ATTENTION.includes(r.status));
  const stats = {
    sourcesReviewed: reviews.length,
    listingsFound: reviews.filter((r) => r.status === "FOUND").length,
    requestsDrafted: requests.filter((r) => r.encryptedDraftContent !== null || r.userSubmittedAt !== null).length,
    requestsSubmitted: requests.filter((r) => r.userSubmittedAt !== null).length,
    confirmedRemovals: requests.filter((r) => r.status === "COMPLETED").length,
    followUpsDue: requests.filter((r) => r.status === "FOLLOW_UP_DUE" || (r.followUpAt && r.followUpAt <= now && ["SUBMITTED_BY_USER", "IN_PROGRESS", "VERIFICATION_REQUESTED"].includes(r.status))).length,
  };

  let nextAction: NextAction;
  const find = (s: RequestStatus) => requests.find((r) => r.status === s);
  if (!profile) nextAction = { code: "complete_profile", message: "Add your name so we can prepare requests for you.", href: "/profile" };
  else if (find("FOLLOW_UP_DUE")) nextAction = { code: "follow_up", message: `Check on your request to ${find("FOLLOW_UP_DUE")!.source.name}.`, href: `/requests/${find("FOLLOW_UP_DUE")!.id}` };
  else if (find("AWAITING_USER_ACTION")) nextAction = { code: "submit", message: `Submit your approved request to ${find("AWAITING_USER_ACTION")!.source.name} on their website.`, href: `/requests/${find("AWAITING_USER_ACTION")!.id}` };
  else if (find("DRAFT_READY")) nextAction = { code: "approve", message: `Review and approve your draft for ${find("DRAFT_READY")!.source.name}.`, href: `/requests/${find("DRAFT_READY")!.id}` };
  else if (find("LISTING_FOUND")) nextAction = { code: "draft", message: `Prepare a request for ${find("LISTING_FOUND")!.source.name}.`, href: `/requests/${find("LISTING_FOUND")!.id}` };
  else if (stats.listingsFound > stats.requestsDrafted) nextAction = { code: "start_request", message: "Start a removal request for a listing you found.", href: "/requests" };
  else nextAction = { code: "review_sources", message: stats.sourcesReviewed === 0 ? "Review the source directory to see where your information may appear." : "Review more sources.", href: "/sources" };

  return {
    stats,
    progress: { ...estimateProgress(requests.map((r) => r.status)),
      disclaimer: "An estimate of your own progress through the steps. It does not measure what is visible online, and removal is never guaranteed." },
    nextAction,
    needingAttention: needing.slice(0, 10).map((r) => ({ id: r.id, sourceName: r.source.name, status: r.status })),
    upcomingFollowUps: reminders.map((r) => ({ id: r.id, type: r.type, scheduledFor: r.scheduledFor, removalRequestId: r.removalRequestId })),
    recentCompleted: requests.filter((r) => r.status === "COMPLETED").slice(0, 5).map((r) => ({ id: r.id, sourceName: r.source.name, completedAt: r.completedAt })),
    unreadNotifications: unread,
  };
}
