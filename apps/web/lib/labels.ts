export const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started", LISTING_NOT_FOUND: "Listing not found", LISTING_FOUND: "Listing found", DRAFT_READY: "Draft ready",
  AWAITING_USER_ACTION: "Awaiting your action", SUBMITTED_BY_USER: "Submitted by you", VERIFICATION_REQUESTED: "Verification requested",
  IN_PROGRESS: "In progress", COMPLETED: "Removed / completed", DENIED_UNAVAILABLE: "Denied / unavailable", FOLLOW_UP_DUE: "Follow-up due", ARCHIVED: "Archived",
};
export const TYPE_LABEL: Record<string, string> = {
  OPT_OUT: "Opt-out", DELETION: "Deletion", CORRECTION: "Correction", SUPPRESSION: "Suppression", FOLLOW_UP: "Follow-up",
};
export const REMINDER_LABEL: Record<string, string> = {
  FOLLOWUP_7: "Follow up in 7 days", FOLLOWUP_14: "Follow up in 14 days", FOLLOWUP_30: "Follow up in 30 days", FOLLOWUP_60: "Follow up in 60 days",
  FOLLOWUP_90: "Follow up in 90 days", RECHECK_6M: "Re-check every 6 months", RECHECK_12M: "Re-check every 12 months", CUSTOM: "Custom reminder", CALIFORNIA_DROP: "Check California DROP status",
};
export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";
