# Deployment guide

PrivatePath is one Next.js app (UI + `/api/v1`) plus a PostgreSQL database. It is driven entirely by environment variables and ships as a Docker image.

## Build and run
```bash
docker build -t privatepath .
docker run -p 3000:3000 --env-file prod.env privatepath      # node apps/web/server.js, non-root user
```
Works on any container host (Railway, Render, Fly.io, ECS/Cloud Run) with a managed Postgres 16. Terminate TLS at the platform.

## Required environment
| Variable | Notes |
|---|---|
| `NODE_ENV=production` | Set by the image. Turns on admin MFA enforcement and refuses development settings |
| `DATABASE_URL` | Managed Postgres with encryption at rest and automated backups |
| `HASH_PEPPER` | 16+ random chars; keep stable (used to HMAC IP / user-agent) |
| `AUTH_MODE=clerk` | **The server refuses `mock` in production.** The API verifies Clerk session tokens (see "Clerk setup") |
| `CLERK_JWT_KEY` or `CLERK_SECRET_KEY` | PEM public key (networkless, preferred; `\n` escapes allowed) or secret key |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated app origins allowed in the token `azp` claim. Required in production |
| `APP_URL` | Public base URL (used in email links) |
| `CRON_SECRET` | 32+ chars. Enables `POST /api/v1/internal/process-reminders` |
| `MOCK_KMS_MASTER_KEY` | **Must NOT be set in production** (the server refuses). A managed-KMS adapter is required first |

## Database migrations
Apply the SQL files in `packages/db/prisma/migrations/*/migration.sql` in order (`psql -v ON_ERROR_STOP=1 -f ...`), or use `prisma migrate deploy`. They include the audit-log trigger and the CHECK constraints; do not skip them. Run migrations with an owner role; run the app with a role that can read/write tables but cannot `ALTER`/`DROP` or disable triggers.

## Scheduler
Call the reminder job every few minutes:
```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/v1/internal/process-reminders"
```
(any cron service, Inngest, or the platform's scheduler). It is safe to run concurrently.

## Clerk setup
1. Create a Clerk application; enable email verification, passkeys and MFA as desired.
2. **Customize the session token** (Dashboard > Sessions) to include the user's email, e.g. `{"email": "{{user.primary_email_address}}"}`. Tokens without an `email` claim are rejected.
3. Set the env vars above. The API accepts `Authorization: Bearer <session token>` (iOS and other clients) or the `__session` cookie (web, with a same-origin check on writes).
4. Admin/staff actions require `session.mfa`, taken from the token's `fva` claim (second factor verified). Clerk marks that claim experimental; re-check it when upgrading.
5. Still to do for the web app: add `@clerk/nextjs` (`ClerkProvider`, sign-in/up pages) and remove the `/dev-login` and `/api/dev/*` routes. The backend side is done and tested.

## Before launch (blockers)
These are not done; the app must not take real users until they are:
1. **Authentication UI:** token verification is done (see "Clerk setup"); add the Clerk sign-in/up UI to the web app and delete the dev-login routes.
2. **KMS:** replace `MockKms` with an AWS/GCP KMS adapter implementing `KmsAdapter` (`wrap`/`unwrap`); document key rotation.
3. **Storage:** implement `StorageAdapter` for S3/R2 (private bucket, SSE); until then uploads return 501.
4. **Email:** implement `EmailAdapter` (Resend/Postmark); add sender identity and postal address.
5. **Rate limiting:** swap `MemoryRateLimiter` for a shared store if running more than one instance, and configure the proxy so `x-forwarded-for` is trustworthy.
6. **Account deletion:** also delete the Clerk user; add the audit-retention purge.
7. Attorney review of all legal/compliance text, and the rest of `docs/security-checklist.md`.

## Health and operations
- `GET /api/v1/health` for load balancer checks.
- Logs must never contain personal data; keep it that way when adding a logger or error tracker (scrub in `beforeSend`).
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and a dependency audit.
