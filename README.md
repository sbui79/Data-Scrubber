# PrivatePath (working name)

A privacy-first tool that helps a person discover, track, and request removal of **their own** publicly
available personal data. It is not a people-search, background-check, or skip-tracing product. It never looks
up other people, never scrapes or automates third-party sites, and never submits requests on the user's behalf.
The user reviews, approves, and submits every request themselves. Removal is never guaranteed.

> **Status: working MVP for local development.** Real authentication, production storage/email/KMS adapters and
> all legal/compliance text are still to do (see "Not done yet"). Legal content is draft and needs
> privacy-attorney review before any production use: `docs/compliance-review.md`.

## Quick start

Prerequisites: Node 20+, pnpm, PostgreSQL 16 running locally (or `docker compose up -d`).

```bash
pnpm install

# database (creates dev and test databases and applies the migrations in order)
for db in privatepath_dev privatepath_test; do
  createdb -h localhost $db
  for m in 0001_init 0002_audit_seq 0003_california_progress; do
    psql -h localhost -d $db -v ON_ERROR_STOP=1 -q -f packages/db/prisma/migrations/$m/migration.sql
  done
done
pnpm --filter @privatepath/db generate

# configuration (git-ignored)
cp .env.example .env
#   DATABASE_URL        postgresql://<your-user>@localhost:5432/privatepath_dev
#   MOCK_KMS_MASTER_KEY openssl rand -base64 32      (local development only)
#   HASH_PEPPER         any random string of 16+ characters
#   AUTH_MODE           mock                          (local development only)
#   CRON_SECRET         optional, 32+ chars, enables the reminder-delivery endpoint
ln -sf ../../.env apps/web/.env.local                 # lets the web app read the root .env

pnpm seed                                             # 10 fictional demo sources, demo user, two demo admins
pnpm --filter @privatepath/web dev                    # http://localhost:3000
```

Use `dev`, not `start`: production mode deliberately refuses mock auth and the mock KMS key.

If your Postgres user isn't `stevenbui`, update the connection strings in `packages/core/test/*.test.ts` defaults
(or set `TEST_DATABASE_URL`), `playwright.config.ts`, and `apps/web/e2e/global-setup.ts`.

## Using the app

1. **Sign in.** Open http://localhost:3000 and click *Sign in* (or go to `/dev-login`). Development sign-in takes
   any fictional identity id. Try `mock_demo-user` after seeding, or invent a new one.
2. **Onboard.** A new identity is sent to the welcome page: pick a nickname and tick the three required
   acknowledgements (terms, privacy policy, and "this is my own information"). Marketing email is a separate,
   unticked option. The consent is recorded with its policy version.
3. **My Profile.** Only your name is required; everything else is optional and each field explains why it is asked.
4. **Source Directory / Exposure Assessment.** Browse the reviewed sources (demo entries are labeled *Example*).
   Open one, read its policy, visit the site yourself, then record *I found my listing / did not / not sure*.
   You may add the exact link to your own listing; it must be an https address on that source's domain, and you
   must confirm the listing is about you. PrivatePath never opens it.
5. **Start a removal request** from a source page, then follow the guided steps on the request page:
   confirm your listing, choose what to include (email and phone digits are left out unless you tick them),
   review the exact text, tick the confirmation and **Approve**. Only then can you **Copy** or **Download** it.
6. **Submit it yourself** on the source's official opt-out page (link provided), then click *I submitted this
   request*. Add a confirmation reference, private notes, and optional proof (PNG, JPEG, WebP or PDF up to 5 MB),
   and update the status as the site responds.
7. **Reminders.** Submitting creates a default 30-day in-app follow-up. Add 7/14/30/60/90-day follow-ups,
   6- or 12-month re-checks, or custom reminders; mute, reschedule or delete any of them.
8. **California Privacy Center.** A checklist for the state's official DROP platform. You complete it on the
   government site; ticking steps here only tracks your own progress.
9. **Help.** FAQs and a support form. Messages that look like ID or card numbers are refused. A *safety concern*
   category shows emergency resources; public resources are at `/safety`.
10. **Account Settings.** *Export my data* downloads everything as JSON. *Delete my account* (type DELETE)
    permanently removes your data and uploaded files. Neither is ever paywalled.

### Admin and support (API only for now)

There is no admin UI yet. With seeded identities `mock_seed-admin-a` / `mock_seed-admin-b` you can use the admin
API (see `docs/api.md`): one admin proposes a source or change, a *different* compliance admin approves it. Support
staff see a redacted case queue; reading a message needs a time-limited grant approved by another admin.

```bash
U=localhost:3000/api/v1
A=(-H "x-mock-auth-id: mock_seed-admin-a" -H "x-mock-email: a@example.test" -H "content-type: application/json")
B=(-H "x-mock-auth-id: mock_seed-admin-b" -H "x-mock-email: b@example.test")
curl "${A[@]}" $U/admin/sources                                          # list all sources
curl "${A[@]}" -d '{"difficulty":5}' $U/admin/sources/<id>/versions      # propose a change (live entry untouched)
curl -X POST "${A[@]}" $U/admin/sources/<id>/versions/2/approve          # refused: proposer can't approve
curl -X POST "${B[@]}" $U/admin/sources/<id>/versions/2/approve          # approved by a second reviewer
```

### Reminder delivery

Reminders are delivered by calling a protected endpoint from a scheduler (cron, Inngest, etc.):

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/v1/internal/process-reminders
```

## Tests and checks

```bash
pnpm test         # 142 unit + integration tests (needs the privatepath_test database)
pnpm typecheck    # TypeScript
pnpm e2e          # Playwright end-to-end journey + axe accessibility scans (resets the TEST database, never dev)
pnpm --filter @privatepath/web build
```

First time only: `pnpm exec playwright install chromium`.

Integration tests empty the test database between tests; never point `TEST_DATABASE_URL` at data you care about.

## What is built

| Area | State |
|---|---|
| Marketing site (home, how it works, pricing placeholders, FAQ, security, terms/privacy drafts, contact, safety) | Done |
| Signup, versioned consent records, onboarding | Done (sign-in itself is a dev stub) |
| Encrypted profile (AES-256-GCM, per-user keys, AAD-bound) | Done |
| Source catalog with four-eyes approval and versioning; demo sources | Done (API only, no admin UI) |
| Listing reviews, strict URL validation | Done |
| Removal requests: guarded state machine, templates, hash-checked approval gate, evidence | Done |
| Reminders, notifications, delivery job, re-check recurrence | Done (email via mock adapter) |
| Dashboard with *estimated* progress and next action | Done |
| California DROP education + self-tracked checklist | Done |
| Data export, account deletion (files + key destroyed) | Done |
| Support, safety resources, redacted staff queue, audited break-glass | Done (staff UI missing) |
| Rate limiting, security headers, CSRF origin check, audit hash chain | Done (rate limiter is in-memory) |
| Docs: API, threat model, retention, security checklist, iOS guide, compliance review | Done |

## Not done yet

- **Real authentication** (Clerk: email verification, passwordless, OAuth, passkeys/MFA). Today's sign-in is a
  development stub and is refused in production.
- Production adapters: managed KMS, S3/R2 storage, real email provider, shared rate-limit store.
- Admin/support web UI; billing (Stripe test mode); push notifications; OpenAPI generation.
- Clerk-account deletion on account delete; audit-log retention purge.
- Attorney review of all legal and compliance content; real source catalog review.
- Full production checklist: `docs/security-checklist.md`.

## Layout

```
apps/web/             Next.js app: marketing site, app screens, /api/v1 routes, Playwright tests
packages/core         domain services (all business rules)
packages/crypto       field/file encryption, key wrapping, keyed hashing
packages/audit        audit redaction and hash chain
packages/adapters     storage, email, rate-limit adapters (memory/local implementations)
packages/config       environment validation
packages/db           Prisma schema and SQL migrations
scripts/seed.mts      fictional demo data
docs/                 PRD, architecture, API, threat model, retention, security checklist, iOS guide, compliance review
```

## Troubleshooting

- **`type "Role" already exists`:** that migration was already applied; skip it.
- **`User was denied access on the database`:** put your Postgres username in the connection URL.
- **Server errors on every request:** read the terminal running `next dev`; configuration problems name the missing
  variable. Confirm `apps/web/.env.local` exists (the symlink step).
- **Changed `schema.prisma`:** add a numbered SQL migration, apply it to both databases, and re-run `pnpm --filter @privatepath/db generate`.
