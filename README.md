# PrivatePath (working name)

A privacy-first tool that helps a person discover, track, and request removal of **their own** publicly
available personal data. It is not a people-search, background-check, or skip-tracing product. It never
looks up other people, never scrapes or automates third-party sites, and never submits requests on the
user's behalf. The user reviews, approves, and submits every request themselves. Removal is never guaranteed.

> **Status: early development.** Legal and compliance content is draft and needs privacy-attorney review
> before any production use. See `docs/compliance-review.md`.

## What works today

| Area | State |
|---|---|
| Marketing home page, app shell and navigation | Works. Most nav links (profile, sources, ...) point to pages not built yet and show 404. |
| `GET /api/v1/health` | Works. |
| Security headers (CSP, HSTS, etc.) | Works. |
| Database schema and migrations | Applied and checked by hand against local Postgres 16 (the audit-log trigger and the four-eyes constraint reject bad writes). |
| `packages/crypto` (field encryption), `packages/audit` (hash chain), `packages/config` | Done, 16 unit tests passing. |
| `packages/core` (signup/consent, encrypted profile, audit writer) | Done, 13 integration tests against real Postgres. |
| API: signup, profile, source catalog (`/sources`), listing reviews (`/listing-reviews`) | Works with mock auth headers (see below). No UI for these yet. No rate limiting yet. |
| Admin API: create / propose change / approve source (`/admin/sources...`) | Works. A different compliance admin must approve every new source or change; MFA is enforced in production. |
| Listing URL validation | Done: https only, approved source domain or subdomain only, no credentials or ports, never fetched by the server. |
| Demo data (`pnpm seed`) | 10 fictional sources on `.test` domains, a demo user, and two demo admins. |
| Real login (Clerk), onboarding screens, source/admin screens, removal-request workflow, reminders, export/delete | Not built yet. |

So there is no end-to-end user journey yet. The steps below get a development environment running and let
you exercise the parts that exist.

## Prerequisites

- Node.js 20 or newer (developed on Node 26)
- pnpm (developed on 12.x)
- PostgreSQL 16 running locally (Homebrew: `brew install postgresql@16 && brew services start postgresql@16`),
  or Docker (`docker compose up -d` starts Postgres with user/password/database all `privatepath`)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create a local database and apply migrations in order
createdb -h localhost privatepath_dev
for m in 0001_init 0002_audit_seq; do
  psql -h localhost -d privatepath_dev -v ON_ERROR_STOP=1 -f packages/db/prisma/migrations/$m/migration.sql
done

# 3. Generate the Prisma client
pnpm --filter @privatepath/db generate

# 4. Configure environment
cp .env.example .env
#   Fill in locally:
#     DATABASE_URL        e.g. postgresql://localhost/privatepath_dev   (add user:password@ if yours needs it)
#     MOCK_KMS_MASTER_KEY output of: openssl rand -base64 32            (local development only)
#     HASH_PEPPER         any random string of 16+ characters
#     AUTH_MODE           mock (local development only)

# 5. Let the web app read the root .env (git-ignored symlink)
ln -sf ../../.env apps/web/.env.local
```

Never commit `.env`. It is git-ignored. The mock KMS key is for local development only; the config loader
refuses to start in production if it is set.

## Running

```bash
pnpm --filter @privatepath/web dev     # http://localhost:3000 (use dev, not start: production mode refuses mock auth and the mock KMS key by design)
pnpm --filter @privatepath/web build   # production build check
```

Pages you can open now:

- `/` home page, including the "not a people search service" statement
- `/dashboard` placeholder dashboard (no sign-in yet)
- `/api/v1/health` returns `{"status":"ok"}`

Trying the API with mock auth (local development only):

```bash
H=(-H "x-mock-auth-id: demo1" -H "x-mock-email: demo@example.test" -H "content-type: application/json")
curl "${H[@]}" -d '{"displayName":"Demo","acceptTerms":true,"acceptPrivacy":true,"authorizeOwnData":true}' localhost:3000/api/v1/auth/signup
curl "${H[@]}" -d '{"legalFirstName":"Sam","legalLastName":"Sample"}' localhost:3000/api/v1/profile
curl "${H[@]}" localhost:3000/api/v1/profile
curl "${H[@]}" -X PATCH -d '{"currentCity":"Sampleville"}' localhost:3000/api/v1/profile
```

With seed data (`pnpm seed`), the mock identities are `mock_demo-user`, `mock_seed-admin-a` and `mock_seed-admin-b` (send them as `x-mock-auth-id`; any `x-mock-email` value is accepted):

```bash
U=localhost:3000/api/v1; D=(-H "x-mock-auth-id: mock_demo-user" -H "x-mock-email: demo@example.test" -H "content-type: application/json")
curl "${D[@]}" $U/sources                                    # reviewed demo sources only
curl "${D[@]}" -d '{"sourceId":"<id>","status":"FOUND","listingUrl":"https://<source-domain>/p/1","confirmOwnership":true}' $U/listing-reviews
# Admin: propose a change as admin A, approve as admin B (admin A approving their own change is refused)
curl -H "x-mock-auth-id: mock_seed-admin-a" -H "x-mock-email: a@example.test" -H "content-type: application/json" -d '{"difficulty":5}' $U/admin/sources/<id>/versions
curl -X POST -H "x-mock-auth-id: mock_seed-admin-b" -H "x-mock-email: b@example.test" $U/admin/sources/<id>/versions/2/approve
```

Use fictional data only. Profile values are stored encrypted; audit events record field names, never values.

## Tests and checks

```bash
pnpm test                    # unit tests (crypto, audit, config)
pnpm exec tsc -p tsconfig.json   # type check
```

`pnpm test` also runs the `packages/core` integration tests, which need a separate database (they empty it between tests, so never point them at dev data; the default is `postgresql://stevenbui@localhost:5432/privatepath_test`, override with `TEST_DATABASE_URL`):

```bash
createdb -h localhost privatepath_test
for m in 0001_init 0002_audit_seq; do
  psql -h localhost -d privatepath_test -v ON_ERROR_STOP=1 -f packages/db/prisma/migrations/$m/migration.sql
done
```

## How the finished product is meant to be used

This is the intended flow for the MVP. Most steps are not implemented yet.

1. **Sign up** and accept the terms, privacy policy, and a statement authorizing processing of your own data.
2. **Create your profile.** Only your name is required. Aliases, age range, city/state, previous locations, and
   emails or phone numbers to check are optional, and each is explained. Every sensitive field is encrypted.
3. **Run the exposure assessment.** Choose which kinds of data concern you, then go through the source
   directory and mark each source "I found my listing", "I did not find it", or "I'm not sure". You search the
   source's own site yourself; PrivatePath does not search for you.
4. **Create a removal request** for a source: review its policy, confirm the listing is yours, choose what to
   remove, review the generated text, and approve it. Copying or downloading is blocked until you approve.
5. **Submit it yourself** through the source's official opt-out page or by email.
6. **Record the outcome**: date, confirmation reference, and optional proof. Set follow-up reminders at
   7, 14, 30, 60, or 90 days, and a 6- or 12-month re-check.
7. **California residents** can follow the checklist for the official state DROP platform. You complete it
   directly on the government site; PrivatePath never submits it or handles your government login.
8. **Export or delete** your data at any time from Account Settings. Deletion is never behind a paywall.

## Safety rules built into the design

- No endpoint searches by name, phone, email, or address.
- The server never makes requests to third-party broker sites or to user-submitted URLs.
- Support staff see redacted values only. Admins cannot search users by personal attributes; account access
  needs a support case and a time-limited, audited grant.
- Logs, audit metadata, and error responses never contain personal data (audit metadata uses an allowlist).
- Demo sources use fictional `.test` domains and make no claim to be current or accurate.

## Layout

```
apps/web/             Next.js app (marketing site, app shell, /api/v1 routes)
packages/core         domain services (signup/consent, profile, audit writer)
packages/crypto       AES-256-GCM field encryption, key wrapping, keyed hashing
packages/audit        audit redaction and hash chain
packages/config       environment validation
packages/db           Prisma schema and migrations
docs/                 PRD, architecture, compliance review
```

## Troubleshooting

- **`createdb` or `psql` asks for a password or fails to connect:** add credentials to `DATABASE_URL` and the
  commands (`psql postgresql://user:pass@localhost/privatepath_dev`), or check Postgres is running with `pg_isready`.
- **`type "Role" already exists`:** that migration was already applied to this database. Skip it.
- **pnpm says it ignored build scripts:** expected; nothing here depends on them.
- **Changed `schema.prisma`:** add a new numbered migration SQL file and re-run `pnpm --filter @privatepath/db generate`.
