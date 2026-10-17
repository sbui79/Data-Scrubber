# iOS integration guide

All business logic lives in the shared backend (`/api/v1`, see `docs/api.md`). A SwiftUI app is a second client, not a second implementation.

## Authentication
- Use the identity provider's native SDK (Clerk iOS) for sign-up, sign-in, email verification, passkeys and MFA. Send the resulting session token as `Authorization: Bearer <token>` on every request.
- Call `POST /auth/signup` once after first sign-in to record consents (the three required acknowledgements must be shown natively and sent as `true`).
- **Token storage:** Keychain only (`kSecClassGenericPassword`, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, no iCloud sync). Never `UserDefaults`, never logs. Clear on sign-out and on account deletion.
- Optionally gate app launch with `LocalAuthentication` (Face ID) before showing personal screens.
- `AUTH_MODE=mock` headers are for local backend development only and must never ship in a build.

## Screen mapping
| Web area | SwiftUI screen | Endpoints |
|---|---|---|
| Dashboard | `DashboardView` (progress ring labeled "Estimated", next action) | `GET /dashboard` |
| My Profile | `ProfileView` / `ProfileEditView` | `/profile` |
| Exposure Assessment / Source Directory | `SourceListView`, `SourceDetailView`, `ListingReviewSheet` | `/sources`, `/listing-reviews` |
| Removal Requests | `RequestListView`, `RequestDetailView` (step flow: confirm, choose data, review, approve, submit yourself, record) | `/removal-requests...` |
| Evidence | `PhotosPicker` / document picker -> multipart upload | `/removal-requests/{id}/evidence` |
| California Privacy Center | `CaliforniaView` (opens official links in `SFSafariViewController`) | `/california-drop-info` |
| Reminders | `RemindersView` | `/reminders`, `/notifications` |
| Help / Safety | `HelpView`, `SafetyView` (works signed out) | `/support-cases`, `/safety-resources` |
| Settings | `SettingsView` (export, delete) | `/data-export`, `/account-delete` |

## Rules the client must respect
- Copy/share the draft only after approval; the server enforces this (`draft-export` returns 403 otherwise). Send the `draftHash` you displayed when approving.
- Open official opt-out pages and DROP in `SFSafariViewController`, so the user completes them directly. Do not scrape, auto-fill, or script third-party pages, and never collect government or third-party credentials.
- Present the progress score as an estimate and never imply guaranteed removal.
- Exports: save the JSON via `ShareLink`/`fileExporter` rather than writing it to a shared location. Evidence downloads are attachments.
- Handle `429` by honoring `Retry-After`; handle `409 draft_changed` by reloading the draft.

## Push notifications (planned)
1. Add a `DeviceToken` model and `POST /devices` / `DELETE /devices/{id}` (not built yet).
2. Register for APNs after the user opts in; send the token to the API.
3. `processDueReminders` gains an APNs channel next to IN_APP/EMAIL. Payloads stay generic ("You have a reminder"), with no source names or personal data, and open the Reminders screen.
4. Remove tokens on sign-out and account deletion.

## Types
Generate Swift models from the API contract. An OpenAPI document is not generated yet (planned from the Zod schemas in `packages/core`); until then `docs/api.md` is the contract.
