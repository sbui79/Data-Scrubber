# Threat model (STRIDE-oriented, MVP)

**Assets:** profile PII (names, locations, emails, phones), listing URLs, request drafts and notes, evidence files, support messages, per-user keys, audit log, source catalog integrity.

**Misuse threat (product-level):** someone tries to use the service to find or profile *another* person. Mitigations: there is no search or lookup anywhere; the profile is the caller's own and used only to fill their own templates; the server never contacts broker sites or user-supplied URLs; the source catalog contains only admin-reviewed sites; sensitive attestation (`confirmOwnData`, `confirmOwnership`) is required and audited; no admin can search users by attribute.

| # | Threat | Mitigation | Verified by |
|---|---|---|---|
| S1 | Request as another user | Auth on every route; mock auth refused in production | `config` tests; authenticate tests |
| S2 | Forged admin/staff action | Role checks; MFA required in production; four-eyes on sources and access grants | `catalog`, `account` tests |
| T1 | Ciphertext swapped between rows/users | AES-GCM with AAD bound to table/column/row | `crypto`, `core` tests |
| T2 | Audit log tampering | DB trigger blocks UPDATE/DELETE; hash chain with `verifyChain` | migration check; `audit` tests |
| T3 | Approving a draft different from what was shown | Approval requires the SHA-256 of the exact draft | `requests` tests |
| T4 | Skipping the approval gate | State machine; copy/export and mark-submitted refuse without approval | `state`, `requests` tests |
| R1 | Admin denies an action | Audit events for admin actions, grants, sensitive views | `catalog`, `account` tests |
| I1 | IDOR (reading/changing others' records) | Ownership inside every query; 404 for foreign ids | per-feature isolation tests |
| I2 | PII in logs/errors/audit | Allowlist audit redaction; error responses name fields only; generic 500s; log-leak checks | `audit`, `core` tests; manual curl checks |
| I3 | Support/admin over-access | Redacted queue; message content only via approved, <=60-minute, case-bound, audited grant | `account` tests |
| I4 | Malicious/oversized upload; stored XSS via files | Type allowlist with magic bytes, size/count limits, encrypted storage, attachment + `nosniff` + sandbox CSP on download | `requests` tests; header checks |
| I5 | SSRF via listing URLs | Server never fetches them; https + approved-domain validation | `urls` tests |
| D1 | Request flooding / abuse | Per-IP and per-user rate limits; body size cap | adapters test; manual flood check |
| D2 | Duplicate/lost reminders | Atomic claim, retry, stuck-claim recovery | `reminders` tests |
| E1 | Privilege escalation via direct status writes | Guarded statuses reachable only via dedicated actions | `state`, `requests` tests |
| E2 | Self-approval of catalog changes | Service rule + DB CHECK constraint | `catalog` tests; migration check |

## Known gaps (not yet mitigated)
- The Clerk sign-in UI is not built; mock auth is development-only. Token verification and the MFA claim are implemented and tested with locally generated keys, not yet against a live Clerk instance.
- Rate limiting is in-memory per instance; use a shared store when running more than one instance. `x-forwarded-for` is trusted as-is; configure the proxy.
- KMS is a local mock; production needs a managed KMS and key rotation procedure.
- Bot protection (e.g. Turnstile) on signup and support forms.
- Audit-log retention purge and Clerk-account deletion are unimplemented.
- No dependency/vulnerability scanning in CI yet.
