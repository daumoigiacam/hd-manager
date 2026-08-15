# HD Manager Google Play 2026 Readiness

Audit date: 2026-08-15

## Result

Production Play submission: READY FOR AAB UPLOAD (technical artifact).

The project is configured for API 36 and a signed release AAB was created
locally with the protected upload keystore outside the repository. Production
account deletion, physical Android validation, and Play Console setup remain
manual release-readiness checks; no production data was changed in this audit.
No business workflow, Firebase configuration, API, data, or package name was
changed in this audit.

## Android build configuration

| Item | Current value | Status |
| --- | --- | --- |
| Application ID / namespace | `com.hdmanager.app` | PASS |
| Required package name | `com.hdmanager.app` | PASS |
| versionName | `1.0.0` | PASS |
| versionCode | `26080101` | PASS |
| minSdk | 24 | PASS |
| compileSdk | 36 | PASS |
| targetSdk | 36 | PASS |
| Android Gradle Plugin | 8.13.0 | PASS |
| Gradle wrapper | 8.14.3 | PASS |
| Kotlin used by Gradle | 2.0.21 | PASS |
| JDK used for build | Microsoft OpenJDK 21.0.12 LTS | PASS |
| Capacitor core / Android / CLI | 8.4.1 | PASS |

`com.hdmanager.app` is the actual and required application ID in the Android
project. It must remain unchanged once the Play application is created;
changing it creates a different Play application and prevents updates. This
audit intentionally did not change it.

The current `versionCode` is valid and future uploads must always use a higher
integer. `versionName` is now the production value `1.0.0`.

## Android 16 / API 36

The app is configured for `compileSdk = 36` and `targetSdk = 36`. Static review
also confirms HTTPS-only traffic, disabled backups, data-extraction rules, and
a resizable `BridgeActivity`.

The following still require physical Android 15/16 validation: edge-to-edge,
status/navigation bar insets, keyboard resizing, splash screen, runtime
permissions, notifications, camera/file picker, contacts, microphone, Wi-Fi
attendance, bank deep links, and orientation. No Android emulator or physical
device was available in this audit, so those cases are NOT TESTED.

## Release bundle and signing

The release task stops at the intentional signing guard when all four values
are not supplied. For this local release verification, an upload keystore was
created outside the repository and supplied through these environment
variables:

- `HD_RELEASE_STORE_FILE`
- `HD_RELEASE_STORE_PASSWORD`
- `HD_RELEASE_KEY_ALIAS`
- `HD_RELEASE_KEY_PASSWORD`

The documented setup is in `android/RELEASE_SIGNING.md`. The local keystore is
not tracked by Git and must be stored in a protected CI secret or secure build
machine for future releases. The audit added ignore rules for `.jks`,
`.keystore`, `.p12`, and `.pfx` files.

## Android dependencies

Direct runtime modules found in the Android project:

- Capacitor Android, App, Filesystem, Geolocation, Local Notifications, Share.
- Capgo Native Biometric.
- Capacitor Cordova Android plugins.
- AndroidX Activity, AppCompat, CoordinatorLayout, Core, Fragment, WebKit, and
  Core Splashscreen.
- Cordova Android 14.0.1.

`npm audit --omit=dev` reports 0 vulnerabilities (critical/high/moderate/low).
The project uses a local `flatDir` dependency repository; Gradle warns that it
does not expose metadata. Keep this under review when upgrading plugins.

## Declared permissions

| Permission | Feature | Keep for release | Play review note |
| --- | --- | --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Firebase, APIs, sync | Yes | Normal permission |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | GPS attendance and routing | Yes if enabled in production | Disclose location and request at use time |
| `NEARBY_WIFI_DEVICES`, `ACCESS_WIFI_STATE` | Wi-Fi attendance validation | Yes if feature remains | Explain purpose in privacy policy |
| `READ_CONTACTS` | Add customer from device contacts | Yes if feature remains | Sensitive data; disclose, request at use time |
| `CAMERA` | Capture/upload images and scan flows | Yes if feature remains | Sensitive data; disclose, request at use time |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Voice input/recording | Yes only if feature remains | Sensitive data; disclose, request at use time |
| `POST_NOTIFICATIONS` | Operational notifications | Yes | Android 13+ runtime permission |
| `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED` | Select product/receipt images | Yes if feature remains | Photo access disclosure required |
| `READ_EXTERNAL_STORAGE` (max 32), `WRITE_EXTERNAL_STORAGE` (max 28) | Legacy file compatibility | Review | Not active on modern Android versions |

All declared camera, microphone, GPS, Wi-Fi, and autofocus hardware features
are optional. The app has no inbound deep-link intent filter in the audited
manifest. Outbound bank/map links require device validation.

## Data Safety inventory

Complete Play Console Data Safety from verified production behavior, not this
table alone. The audited app can process or transmit:

- Personal data: names, phone numbers, email when supplied, addresses, and
  customer/employee profile information.
- Financial and business data: orders, invoices, payments, debts, payroll,
  delivery records, product prices, receipts, and reconciliation references.
- Location: precise/coarse location for attendance, routing, and customer maps.
- User content: images, documents, selected contacts, and possible voice input.
- App/device data: authenticated account identifiers, trusted-device/session
  metadata, notification identifiers, audit events, and app activity.
- Credentials: authentication data is processed; plaintext passwords must not
  be stored or declared as collected unless a production SDK actually does so.

Firebase services and payment/map/bank handoffs must be declared with their
actual data-sharing, retention, encryption-in-transit, and deletion behavior.
Update `docs/google-play/data-safety-form.md` only after the legal privacy
policy and production data flow are confirmed.

## Privacy policy and account deletion (baseline audit)

The baseline audit found missing verification. The current source now includes:

1. An in-app "Delete account" entry in the Identity Security Center. It
   requires the current password and exact confirmation, scrubs authentication
   and recovery data, revokes the Firebase identity, preserves business and
   legally retained records, and writes an audit event.
2. A public deletion page at `hdconnect-website/xoa-tai-khoan.html`, linked from
   the app as `https://hdconnect.net/xoa-tai-khoan.html`.
3. A backend `identityDeleteAccount` endpoint with an idempotent tombstone
   path. Production deployment and end-to-end deletion against the live
   endpoint remain NOT TESTED and must be verified before submission.

The privacy policy source is present in `public/privacy.html` and the website
policy pages, but the final public HTTPS URL and legal wording still require
owner verification in Play Console.

This requires a product/legal decision about company-owned operational data, so
it was not implemented automatically in this audit.

## Reviewer access

Do not provide a reviewer access path to live customer data. Create an isolated
Play-review tenant with synthetic data, an ordinary reviewer account, and
step-by-step credentials/instructions in Play Console App access. Confirm that
the account can access all gated screens without privileged owner data.

## Additional release warnings

- `android:largeHeap="true"` should be profiled on low-memory Android devices
  before removal or retention.
- `res/xml/file_paths.xml` is now restricted to the app share cache and
  `Documents/HDManager/`; Android share/export behavior still requires device
  validation.
- Native Google Services/Crashlytics configuration was not found. This is not a
  build blocker, but production crash monitoring should be decided before
  rollout.
- Windows builds require an ASCII path workaround because the current project
  path contains non-ASCII characters. No source path was renamed or moved.

## Commands executed

| Check | Result |
| --- | --- |
| `npm test` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm audit --omit=dev` | PASS: 0 vulnerabilities |
| `npx cap doctor` | PASS: Android project healthy; Capacitor 8.4.1 installed |
| `:app:lintDebug` | PASS; warnings only, no errors |
| `:app:assembleDebug` | PASS |
| `:app:bundleRelease` | PASS: signed release AAB created |
| `jarsigner -verify` on release AAB | PASS: exit code 0; signature entries present |
| Identity account-deletion syntax/unit checks | PASS |
| Live account-deletion endpoint | NOT TESTED |
| Android 15/16 device validation | NOT TESTED |
| Play Console submission | NOT PERFORMED: manual setup remains |

## Release decision

The AAB is technically ready for upload. Before production rollout, keep the
permanent package identity `com.hdmanager.app`, run the live account-deletion
flow against a non-production/test tenant, verify the public privacy/deletion
URLs, prepare an isolated reviewer account, complete Android 15/16 device
validation, and finish the Play Console Data Safety/App access declarations.

## Verification update (2026-08-15)

The following source-level changes were made in this audit:

- Implemented authenticated account deletion without deleting operational
  business history. Authentication/recovery fields are scrubbed, the public
  record is marked deleted, the identity is replaced by a tombstone, devices
  are revoked, and the action is audited.
- Restricted the Android FileProvider paths to the app share cache and the
  app-specific `Documents/HDManager/` directory.
- Preserved the existing release-signing guard and package identity.

Validation completed today:

- `npm test`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm audit --omit=dev --audit-level=low`: PASS, 0 vulnerabilities.
- Identity and Functions syntax checks: PASS.
- Android debug lint/build: PASS, warnings only.
- `https://app.hdconnect.net`: PASS, HTTP 200.
- `https://hdconnect.net/chinh-sach-bao-mat.html`: PASS, HTTP 200.
- `https://hdconnect.net/xoa-tai-khoan.html`: PASS, HTTP 200.

Validation not completed:

- No production backend deployment or live account-deletion request was made.
- No physical Android 15/16 device or emulator was available for runtime
  validation of permissions, edge-to-edge, FileProvider, keyboard, camera,
  contacts, location, notifications, and deep links.

Release artifact verification completed:

- A local upload keystore was created outside the repository; no keystore,
  password, or private key was committed.
- `:app:clean`, `:app:lintRelease`, and `:app:bundleRelease`: PASS.
- `jarsigner -verify`: PASS (exit code 0).
- Release manifest: package `com.hdmanager.app`, version `1.0.0`,
  versionCode `26080101`, minSdk `24`, targetSdk `36`.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`.
- AAB size: `9,781,705` bytes.
- AAB SHA-256: `F3570552E24C3F580B495CE0BEC86FB7BC9471252E6318FF7303768DFDF96679`.
- Upload certificate SHA-256:
  `85:E6:A7:7A:42:13:FD:6F:C1:9F:80:EE:37:3C:C8:B1:F6:36:32:29:87:81:3D:37:71:30:A6:BE:27:A0:3D:A7`.

Final status: `READY FOR AAB UPLOAD` (technical artifact; manual Play Console
and physical-device validation remain outstanding).

## Final report

### A. PASS

- Package identity remains `com.hdmanager.app`.
- `versionName` is `1.0.0`; `versionCode` remains `26080101`.
- `compileSdk` and `targetSdk` are both `36`; `minSdk` is `24`.
- Release signing is configured through `HD_RELEASE_*` environment variables.
- `:app:clean`, `:app:lintRelease`, and `:app:bundleRelease` completed successfully.
- The AAB has JAR signature entries and `jarsigner -verify` returned exit code 0.
- `https://hdconnect.net/chinh-sach-bao-mat.html` and
  `https://hdconnect.net/xoa-tai-khoan.html` returned HTTP 200 over HTTPS.
- The in-app account deletion flow and backend endpoint are present in source.
- Keystore files are ignored and no keystore was found in the repository.
- Existing npm test, lint, typecheck, production build, dependency audit, and
  Android debug checks remain PASS from this audit; the release-only changes
  were limited to version metadata and signing inputs.

### B. WARN

- Account deletion was not executed against production or a disposable live
  tenant because this audit must not delete real user data.
- No Android 15/16 emulator or physical device was available, so runtime
  checks for insets, keyboard, permissions, camera, contacts, location,
  notifications, deep links, background/resume, offline behavior, and sharing
  are NOT TESTED.
- Play Console Data Safety, App access, Store listing, Internal testing, and
  release-track configuration still require the owner to complete them.
- The upload certificate is a local self-signed upload key; future builds must
  use the same protected key or the Play Console-registered upload key.

### C. BLOCKER

None for producing the local signed AAB. The WARN items above remain release
process and device-validation requirements; they were not bypassed or marked
PASS.

### D. RELEASE AAB

- Path: `android/app/build/outputs/bundle/release/app-release.aab`
- Package: `com.hdmanager.app`
- Version code: `26080101`
- Version name: `1.0.0`
- minSdk: `24`
- Target SDK: `36`
- Signing: release-signed with the local upload keystore through environment variables
- Certificate SHA-256: `85:E6:A7:7A:42:13:FD:6F:C1:9F:80:EE:37:3C:C8:B1:F6:36:32:29:87:81:3D:37:71:30:A6:BE:27:A0:3D:A7`
- Size: `9,781,705` bytes
- SHA-256: `F3570552E24C3F580B495CE0BEC86FB7BC9471252E6318FF7303768DFDF96679`
- Debug build: no; this artifact came from `bundleRelease`.

### E. GOOGLE PLAY READINESS

| Requirement | Result |
| --- | --- |
| Privacy Policy | PASS: public HTTPS page returns 200; legal owner review still required |
| Account deletion in-app | PASS: implemented; live destructive E2E NOT TESTED |
| Account deletion URL | PASS: public HTTPS page returns 200 |
| Data Safety | WARN: declaration must be completed in Play Console |
| App Access | WARN: isolated reviewer tenant/account still required |
| Permissions | PASS: statically inventoried; device/runtime validation NOT TESTED |
| Store Listing | WARN: Play Console content is manual |
| Target API | PASS: compile/target 36 |
| Internal Testing | WARN: Play Console setup not performed |
| Release AAB | PASS: signed local AAB created and verified |

### F. FINAL STATUS

`READY FOR AAB UPLOAD` for the local signed artifact. No Google Play upload,
commit, push, or production deploy was performed.

## Google Play policy references

- [Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878): new apps and updates must target Android 16 / API 36 from 31 August 2026.
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111): apps that enable account creation need an in-app deletion path and a web resource for deletion requests.
- [Data safety requirements](https://support.google.com/googleplay/android-developer/answer/10787469): the Play Console declaration must cover data handled by the app and third-party SDKs.
