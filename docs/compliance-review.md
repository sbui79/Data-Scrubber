# Compliance Review Checklist (for privacy attorney)

Status: DRAFT — nothing here is legal advice. Every item requires counsel sign-off before production launch.

| Area | Claim / assumption | Needs review |
|---|---|---|
| Positioning | "Not a data broker / not a people-search service" | Confirm no registration duty under California Delete Act or other state broker laws |
| Authorization | User-authorized self-service opt-outs; user submits manually | Whether any agent/authorized-agent rules apply |
| CCPA/CPRA | Access, deletion, correction, opt-out UX | Notice at collection, retention disclosures, sensitive PI handling |
| DROP | Educational link only; no submission or credential handling | Accuracy of DROP description and eligibility wording |
| Email | Reminder emails transactional; marketing needs separate consent | CAN-SPAM, unsubscribe, sender identity |
| Retention | Deletion purges/anonymizes; audit tombstones kept | Retention periods, legal-hold carve-outs |
| Support | Never request government ID by email | Safety-concern language, emergency resources |
| Billing | Refund/cancellation placeholders | Consumer protection, auto-renewal laws |
| Source catalog | Demo sources only; no accuracy claims | Wording for real sources before publishing |
| Terms/Privacy | Placeholder pages | Full drafting |
| Accessibility | WCAG 2.2 AA target | Audit |

## Additional items added during build
| Area | Claim / assumption | Needs review |
|---|---|---|
| California DROP content | Summary, checklist and links on `privacy.ca.gov/drop/` and `consumer.drop.privacy.ca.gov`, last checked 2026-10-17 | Accuracy, eligibility wording, how timelines are described (the app deliberately gives no dates) |
| Consent | Three required acknowledgements recorded with policy version, timestamp, hashed IP / user agent | Wording of the "authorize processing of my own data" statement; version scheme; whether proof of consent must survive account deletion |
| Draft templates | Neutral wording ("removal or suppression", "opt-out", "deletion"); personal details only if the user opts in | Whether to cite statutes; wording per request type |
| Reminder email | Treated as transactional; postal-address placeholder in footer | CAN-SPAM classification, sender identity, whether unsubscribe is required for transactional reminders |
| Safety resources | 911, National Domestic Violence Hotline, SPARC link | Accuracy, international coverage, domain-expert review |
| Support policy | Never ask for government ID; blocks ID/card-like numbers in messages | Wording |
| Data export / deletion | Immediate hard delete; audit events retained with opaque ids | Retention periods, consent-record retention, backup window (`docs/retention-schedule.md`) |
| "Not a data broker" | Service holds only data the user enters about themselves | Whether any state registration or definition could still apply |
