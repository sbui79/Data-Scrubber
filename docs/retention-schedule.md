# Retention and deletion schedule (DRAFT for counsel review)

| Data | Kept while | On user deletion | Notes |
|---|---|---|---|
| Profile, listing reviews, removal requests, drafts, notes, references | Account active | Deleted immediately | Encrypted per field |
| Evidence files | Until the user deletes them or the account | Stored objects deleted first; if that fails nothing is deleted and the user can retry | Encrypted before storage |
| Per-user encryption key | Account active | Deleted with the account | Ciphertext left in backups becomes unreadable |
| Reminders, notifications, California checklist, support cases | Account active | Deleted immediately | |
| Break-glass access grants for the user | | Deleted | |
| Consent records | Account active | Deleted with the account | **Open question for counsel:** whether proof of consent must be retained, and for how long |
| Audit events | Retained | Kept, containing opaque ids and allowlisted metadata only (no names, emails, URLs, notes) | Pseudonymous hashed IP / user-agent values remain. **Open:** a purge job needs a privileged database function because the table is append-only; the period must be set by counsel |
| Database backups | Provider-defined window | Age out; deleted users' data is unreadable once the key is gone | Document the provider's window |
| Identity-provider account (Clerk) | | **Not yet deleted automatically**; must be wired up | Required before launch |
| Logs / error reports | Short | | Must contain no personal data (enforced by redaction + tests) |

No system can guarantee deletion from every third-party site or from the wider internet. This schedule covers only data PrivatePath holds.
