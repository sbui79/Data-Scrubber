# Pre-production security checklist

Status key: [x] done and tested · [~] partly done · [ ] not done

## Identity and access
- [ ] Clerk JWT verification wired into `authenticate` (`AUTH_MODE=clerk`); mock mode impossible in production [x config refuses]
- [ ] MFA required for admin/staff (code enforces via `session.mfa`; needs the Clerk claim mapped)
- [ ] Passkeys / MFA for regular users (feature flag exists, off)
- [x] Role checks on all admin/staff routes; four-eyes for catalog and access grants
- [x] Ownership enforced inside every user-data query (isolation tests)
- [ ] Origin/CSRF check if cookie sessions are used

## Data protection
- [x] Field-level AES-256-GCM, AAD-bound; per-user keys wrapped by KMS
- [ ] Managed KMS (AWS KMS/GCP KMS) replacing `MockKms`; key rotation runbook
- [ ] Postgres and object storage encryption at rest enabled at the provider; TLS enforced
- [ ] Production storage adapter (S3/R2) with SSE and private buckets
- [x] No personal data in audit metadata, errors or server logs (tests + manual checks)
- [ ] Error-tracking `beforeSend` scrubbing configured if Sentry is added
- [ ] Backups: encrypted, retention documented, restore tested

## Application
- [x] Input validation (Zod) on every endpoint; body size cap
- [x] Security headers (CSP, HSTS, frame, nosniff, referrer, permissions)
- [x] Rate limiting [~ in-memory]
- [ ] Bot protection on signup/support
- [x] Upload hardening
- [ ] Dependency audit (`pnpm audit`) and Renovate/Dependabot; secret scanning in CI
- [ ] Remove `console.error` class-name logging or route to structured logger

## Operations
- [ ] Structured logging with redaction, metrics, alerting
- [ ] Scheduler calling `/internal/process-reminders`; `CRON_SECRET` set
- [ ] Real email adapter; sender identity, postal address and unsubscribe handling (counsel)
- [ ] Clerk account deletion on `/account-delete`
- [ ] Audit log purge job and retention period approved by counsel
- [ ] Incident response plan; breach-notification contacts

## Product / legal
- [ ] Attorney review of every item in `docs/compliance-review.md`
- [ ] Real source catalog reviewed by compliance before activating any non-demo source
- [ ] Terms, Privacy Policy, refund/cancellation text finalized
- [ ] Accessibility audit (WCAG 2.2 AA) with assistive technology
