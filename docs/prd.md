# PrivatePath — Product Requirements (MVP)

> Working name. All legal/compliance content is a draft pending privacy-attorney review.

**Positioning:** We help individuals discover, control, and remove their own publicly available personal data.

This is a privacy-management service, not a private-investigation service. It is **not** a people-search, skip-tracing, background-check, or surveillance product, and it is not a data broker.

## Hard boundaries
No feature may search for, locate, identify, track, or reveal information about another person; accept another person's name/phone/address/email as a lookup; scrape or automate third-party sites; solve CAPTCHAs; auto-submit government requests (incl. California DROP); sell/share user data; or build any directory or identity graph. No raw personal data goes to LLM providers; no user data is used for model training.

## Users
1. Privacy-conscious individual (primary).
2. Professional (same flow; support sees redacted data only).
3. Family privacy manager — **not supported in MVP**; policy page + feature-flagged placeholder.

## Core loop
Onboard + consent -> minimal self profile -> guided exposure assessment against admin-curated source catalog -> user confirms ownership of own listing -> generate template -> user reviews and explicitly approves -> user submits themselves -> record outcome -> reminders (7/14/30/60/90d, 6/12-month re-check).

## Honest-claims rules
- No removal guarantee; sites have independent policies and legal exceptions.
- Progress score is labeled "Estimated".
- Users can revoke consent, export, and delete at any time; deletion is never paywalled.
- Seed sources are demo examples on fictional `.test` domains; no claim of current instructions.

## Success metrics (aggregate only)
Onboarding completion; sources reviewed/user; requests reaching "Submitted by user"; confirmed removals; reminder->action rate.

## Non-goals (MVP)
Automated submission, monitoring/scanning, third-party accounts, government-ID collection, native iOS app, real payments.

## Defaults chosen for open questions
pnpm monorepo; Clerk auth; Inngest jobs; Resend email; S3-compatible storage; Stripe test mode; AES-256-GCM envelope encryption; Postgres 16; Vitest + Playwright; mocks for all external adapters locally.
