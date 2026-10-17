# API reference (v1)

Base path `/api/v1`. JSON in, JSON out, `Cache-Control: no-store`. This is the contract the web app and the future iOS app share; all business rules live behind it.

**Auth.** Every endpoint except `/health`, `/safety-resources` and `/internal/*` requires an authenticated session. Production: a Clerk-issued bearer token (verification is not wired up yet; see `docs/security-checklist.md`). Local development only (`AUTH_MODE=mock`): `x-mock-auth-id` and `x-mock-email` headers. The server refuses to start in production with mock auth enabled.

**Errors.** `{ "error": { "code": "...", "message": "...", "fields"?: ["path"] } }`. `fields` lists field paths only, never submitted values. Messages never contain user data.

| Status | Meaning |
|---|---|
| 400 `invalid_input` and friends | Validation failed |
| 401 `unauthenticated` | No/invalid session |
| 403 `forbidden`, `not_onboarded`, `approval_required`, `mfa_required`, `grant_required` | Not allowed right now |
| 404 | Missing **or not yours** (indistinguishable by design) |
| 409 | State conflict (`invalid_transition`, `draft_changed`, `already_onboarded`, ...) |
| 413/415 | File too large / unsupported type |
| 429 `rate_limited` | Slow down; honor `Retry-After` |
| 501/503 | Storage unavailable |

**Rate limits.** Per address and per user. Reads 180/min, writes 60/min, sensitive actions (signup, export, deletion, support cases, uploads, access grants) 10/min.

## Account and profile
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | Completes onboarding for the authenticated identity. Body: `displayName`, and `acceptTerms`, `acceptPrivacy`, `authorizeOwnData` (all must be `true`), optional `marketingConsent`. Records versioned consents and audit events. |
| POST / GET / PATCH | `/profile` | Name required; aliases, age range, city/state, previous locations, emails, phones optional. Encrypted at rest. PATCH accepts `null` to clear optional fields. |
| POST | `/data-export` | Downloads all of the caller's data as JSON. |
| POST | `/account-delete` | Body `{"confirm":"DELETE"}`. Permanent. |

## Sources and listing reviews
| Method | Path | Notes |
|---|---|---|
| GET | `/sources`, `/sources/{id}` | Reviewed (published) sources only. Demo entries carry a `notice`. |
| POST / GET | `/listing-reviews` | `sourceId`, `status` (`FOUND`/`NOT_FOUND`/`NOT_SURE`), optional `listingUrl` + `confirmOwnership: true` (only with `FOUND`), `notes`. The URL must be https on the source's own domain. The server never fetches it. |
| PATCH | `/listing-reviews/{id}` | Same fields, optional. Leaving `FOUND` clears the stored link. |

## Removal requests
| Method | Path | Notes |
|---|---|---|
| POST / GET | `/removal-requests` | Create (`sourceId`, `requestType`, optional `listingReviewId`) / list (`?status=`). |
| GET / PATCH | `/removal-requests/{id}` | PATCH: `status` (user-settable statuses only), `notes`, `confirmationReference`, `listingUrl`+`confirmOwnership`, `followUpAt`, `expectedResponseAt`. Changing the link discards the draft and approval. |
| POST | `/removal-requests/{id}/draft` | Body: `confirmOwnData: true`, optional `dataCategories`, `includeFullName`, `includeEmail`, `phoneIndex` (only the last 4 digits are used). Returns the draft and its `draftHash`. Revokes any earlier approval. |
| POST | `/removal-requests/{id}/approve` | Body: `confirmOwnData: true`, `draftHash` (must match the content the user saw). |
| POST | `/removal-requests/{id}/draft-export` | Returns copy-ready text. **403 `approval_required` until approved.** Audited. |
| POST | `/removal-requests/{id}/mark-submitted` | The user records that **they** submitted it: `method` (`web_form`/`email`/`mail`), optional `submittedAt`, `expectedResponseDays`. Requires prior approval. Creates a default 30-day in-app follow-up. |
| POST | `/removal-requests/{id}/evidence` | `multipart/form-data`, field `file`. PNG/JPEG/WebP/PDF, <= 5 MB, <= 10 per request. |
| GET / DELETE | `/removal-requests/{id}/evidence/{evidenceId}` | Download (attachment, sandboxed) / delete (removes the stored object). |

Statuses: `NOT_STARTED`, `LISTING_NOT_FOUND`, `LISTING_FOUND`, `DRAFT_READY`, `AWAITING_USER_ACTION`, `SUBMITTED_BY_USER`, `VERIFICATION_REQUESTED`, `IN_PROGRESS`, `COMPLETED`, `DENIED_UNAVAILABLE`, `FOLLOW_UP_DUE`, `ARCHIVED`. `DRAFT_READY`, `AWAITING_USER_ACTION`, and `SUBMITTED_BY_USER` are reachable only via draft / approve / mark-submitted.

## Reminders, notifications, dashboard, California
| Method | Path | Notes |
|---|---|---|
| POST / GET | `/reminders` | `type`: `FOLLOWUP_7/14/30/60/90` (needs a submitted request), `RECHECK_6M/12M` (recurring), `CUSTOM`, `CALIFORNIA_DROP` (need `scheduledFor`); `channel`: `IN_APP`/`EMAIL`. Max 50 active. |
| PATCH / DELETE | `/reminders/{id}` | Mute (`status: MUTED`), unmute, reschedule, change channel / delete. |
| GET | `/notifications`, POST `/notifications/{id}/read` | In-app notifications. |
| GET | `/dashboard` | Counts, **estimated** progress (never a guarantee), next action, items needing attention, upcoming follow-ups, recent completions. |
| GET | `/california-drop-info` | Educational content, official links, the caller's self-reported checklist. |
| PATCH | `/california-drop-info/progress` | `{ step: 1-5, done: boolean }`. Records the user's own progress only. PrivatePath never submits DROP requests. |

## Support and safety
| Method | Path | Notes |
|---|---|---|
| POST / GET | `/support-cases` | Rejects messages that look like ID or card numbers. `SAFETY_CONCERN` cases return emergency resources. |
| GET | `/safety-resources` | Public. |

## Staff and admin (MFA required in production)
| Method | Path | Role |
|---|---|---|
| GET | `/staff/support-cases` | support+: redacted queue (no message, no user identity) |
| PATCH | `/staff/support-cases/{id}/status` | support+ |
| GET | `/staff/support-cases/{id}/message` | support+ **with an approved, unexpired grant for that case**; audited |
| POST | `/admin/access-grants`, `/admin/access-grants/{id}/revoke` | compliance admin; approver must differ from the grantee; max 60 minutes |
| GET / POST | `/admin/sources` | compliance/system admin: list all / propose new |
| POST | `/admin/sources/{id}/versions` | propose a change (never edits the live entry) |
| POST | `/admin/sources/{id}/versions/{n}/approve` | compliance admin, different from the proposer |

## Internal
`POST /internal/process-reminders` delivers due reminders. Requires `Authorization: Bearer $CRON_SECRET`; disabled (404) when `CRON_SECRET` is unset. Call it from your scheduler every few minutes.
