import type { RequestStatus } from "@privatepath/db";

/** Allowed status transitions for a removal request. ARCHIVED is terminal. */
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  NOT_STARTED: ["LISTING_FOUND", "LISTING_NOT_FOUND", "ARCHIVED"],
  LISTING_NOT_FOUND: ["LISTING_FOUND", "ARCHIVED"],
  LISTING_FOUND: ["DRAFT_READY", "LISTING_NOT_FOUND", "ARCHIVED"],
  DRAFT_READY: ["AWAITING_USER_ACTION", "LISTING_FOUND", "ARCHIVED"],
  AWAITING_USER_ACTION: ["SUBMITTED_BY_USER", "DRAFT_READY", "LISTING_FOUND", "ARCHIVED"],
  SUBMITTED_BY_USER: ["VERIFICATION_REQUESTED", "IN_PROGRESS", "COMPLETED", "DENIED_UNAVAILABLE", "FOLLOW_UP_DUE", "ARCHIVED"],
  VERIFICATION_REQUESTED: ["IN_PROGRESS", "COMPLETED", "DENIED_UNAVAILABLE", "FOLLOW_UP_DUE", "ARCHIVED"],
  IN_PROGRESS: ["VERIFICATION_REQUESTED", "COMPLETED", "DENIED_UNAVAILABLE", "FOLLOW_UP_DUE", "ARCHIVED"],
  FOLLOW_UP_DUE: ["VERIFICATION_REQUESTED", "IN_PROGRESS", "COMPLETED", "DENIED_UNAVAILABLE", "ARCHIVED"],
  COMPLETED: ["LISTING_FOUND", "ARCHIVED"],
  DENIED_UNAVAILABLE: ["LISTING_FOUND", "DRAFT_READY", "ARCHIVED"],
  ARCHIVED: [],
};

export const canTransition = (from: RequestStatus, to: RequestStatus) => TRANSITIONS[from].includes(to);

/**
 * Statuses a user may set directly. The rest are reachable only through the dedicated action that
 * enforces its own rules: DRAFT_READY (generate draft), AWAITING_USER_ACTION (approve),
 * SUBMITTED_BY_USER (mark submitted), NOT_STARTED (initial only).
 */
export const USER_SETTABLE: RequestStatus[] = [
  "LISTING_FOUND", "LISTING_NOT_FOUND", "VERIFICATION_REQUESTED", "IN_PROGRESS",
  "COMPLETED", "DENIED_UNAVAILABLE", "FOLLOW_UP_DUE", "ARCHIVED",
];

/** Statuses from which a draft may be (re)generated. */
export const DRAFTABLE: RequestStatus[] = ["LISTING_FOUND", "DRAFT_READY", "AWAITING_USER_ACTION", "DENIED_UNAVAILABLE"];
