# Biometric Login and Attendance Implementation Review

## Status

Release preparation follow-up: the user requested committing all changes, publishing the website and building APK/AAB/EXE. Publication is pending a decision on resolving the documented blockers versus keeping incomplete flows inactive. The full npm run test:all suite passed after adding an early invalid-session guard to handleLeave; the final test group reported 446 passed, one skipped. This does not remove the release blockers below.

Local implementation and verification are PARTIAL. Do not deploy this change set as a completed implementation of Notes_261004_004510.docx. No commit, push, production deployment, production data write, or package installation was performed in this task.

Base: main, 989b4471b818e4e2c97e983d55990e7932e589c6. The working tree was initially clean.

## Implemented

- Existing Android Capacitor biometric service is reused. No face images, fingerprint templates or plaintext passwords are added to storage.
- A new native device must use password login before enrollment. Account-wide biometric settings no longer silently enroll another installation.
- Enrollment checks strong biometric availability, asks the OS for verification, stores an opaque device credential with BIOMETRY_CURRENT_SET, then confirms enrollment with the server.
- Login uses a protected credential read and server validation, with single-flight protection against duplicate prompts. Cancellation does not submit login. Network errors do not fabricate success.
- Disable deletes local protected credentials, including when the disable request cannot reach the server. Server rejection/revocation clears local enrollment. Explicit logout suppresses automatic login for that session; forgetting a device removes its credential.
- Device credentials carry a password credential version and 90-day expiry on new enrollment. Password change invalidates older versions and revokes Firebase refresh tokens. Password change and biometric enrollment must be separate operations.
- Native Firebase Auth persistence is now memory-only. Browser persistence is unchanged. Old native app-session cache cannot authorize a login.
- Security settings show one biometric switch and a trusted-device registration action. Generic Android labels no longer say Face ID. Web Passkeys remain a separate existing path.
- Enrollment UI is lazy-loaded. Security-data refresh depends on account scope rather than object identity. No biometric polling interval or new app-wide listener is added.
- A new identityAttendance endpoint handles manual self check-in, check-out and leave. It validates authenticated identity, trusted-device secret, tenant, role, shift, WiFi/GPS policy and locked payroll in a transaction. The server supplies the timestamp and deduplicates submissions.
- Self-attendance UI uses the returned record instead of manufacturing a phone-clock timestamp. Existing management corrections remain a separate permission-controlled path.
- Rules deny ordinary employee direct attendance writes and modification of protected attendance/role settings. Existing employee auto-WiFi opt-in remains available.

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| Node targeted tests | 47 PASS | Identity, passkeys, native credential mock lifecycle, manual/auto attendance, roster and work roles; per-test timeout 20 seconds |
| Firestore rules | PASS | Local emulator only; employee write/escalation denial and owner WiFi configuration |
| Firestore concurrent attendance | PASS | Three actual emulator transactions produce one attendance record and one audit log |
| Browser login/home | 4 PASS | Missing employee profile, sales, driver, production; no page errors; correct personal home from first render |
| Lint | PASS | Repository lint plus explicit identity component/service and attendance backend lint |
| Typecheck | PASS | Existing tsconfig.payroll.json scope, not a full application type proof |
| Production web build | PASS | 10.05 seconds; enrollment chunk 1.73 kB, 0.94 kB gzip |
| Dependency inspection | PASS locally | Capacitor core 8.4.1, native biometric 8.6.2, Firebase 12.16.0; dependencies unchanged |
| npm vulnerability audit | PASS | After explicit user consent to send dependency metadata, npm audit --omit=dev reported zero vulnerabilities for both root app and functions; no packages changed |
| Physical device | NOT RUN | adb devices -l returned no devices |

The first browser run exposed a temporal-dead-zone error from calling a platform helper during module initialization. It was fixed by using the imported Capacitor API directly. The repeated browser run passed all four scenarios. Failure diagnostics were retained in the test.

## Performance Evidence

Targeted navigation preview, CPU throttled 3x, scale 5: 600 customers, 3000 orders, 1500 payments, 12 employee fixtures plus the preview administrator, one explicit product. This is isolated synthetic preview data; network requests outside the preview are blocked. It does not measure real Firebase latency or native biometric latency.

| Navigation | Observed duration |
| --- | --- |
| Home | 27-79 ms |
| Order Requests | 82 ms |
| Dispatch | 78 ms |
| Orders | 180 ms |
| Debt to Home | 31-36 ms |

Runner deadline: 180 seconds. This is an after-change smoke measurement, not a paired before/after experiment and not proof of zero lag on all devices. OS prompt and server response latency must still be measured on hardware. Identity HTTP requests have a 30-second deadline; existing UI attendance deadlines remain bounded.

## Incomplete Requirements and Release Blockers

1. iOS is an Expo WebView application, not Capacitor. It has no native biometric/SecureStore bridge. iOS Keychain enrollment, installation binding, strict trusted-origin bridge security and a native iOS build remain unimplemented. A browser Passkey is not represented as completion of this requirement.
2. The legacy attendanceAutoWifiCheckIn endpoint still authenticates the employee session and validates WiFi/shift/server time, but does not yet require the new device-secret proof. It now refuses auto attendance when biometric confirmation is mandatory. A separate limited-scope attendance device credential is needed to support unattended WiFi without exposing a biometric login credential or showing repeated prompts. Do not regard the new manual route as securing every attendance path.
3. Mandatory biometric attendance currently relies on access to an OS-protected credential. It is not cryptographic per-request biometric attestation; a compromised client that already possesses the secret is outside that guarantee. SSID/BSSID/GPS are client-reported and not independent proof of physical presence.
4. Full Cloud Functions enrollment/password-revocation integration has not been exercised against deployed Firebase. The emulator attendance integration uses real Firestore transactions, but an injected test device verifier, not Firebase Auth or phone hardware.
5. Hardware cases (sensor failure/lockout, changing enrolled fingerprints, real reinstall/clear-data, background/foreground behavior and native Keychain/Keystore behavior) remain unverified. Local lifecycle mocks cover cancellation, missing enrollment, offline failure, server rejection, logout suppression, disable and installation-binding loss.
6. Native memory-only Auth prevents new Firebase sessions from being persistently stored by this code. A secure migration/removal audit of refresh tokens left on disk by older APKs is still required before release. Do not claim those old on-disk values have been erased.
7. Attendance shift/timezone and GPS logic needs broader parity review against historical/overnight/manual corrections before production rollout. Primary and secondary role tests passed, but this is not an exhaustive business-rule migration proof.

## Rollout and Data Changes

No production changes were made. New device records add credentialVersion and expiresAtIso. Identity records increment credentialVersion on password change. Manual attendance writes audit records to identity_audit_logs. No bulk data migration was run.

The new frontend manual attendance route requires identityAttendance plus updated identityCompleteSetup/identityBiometricLogin server code. Publishing this frontend alone would produce missing-endpoint errors. Publishing the new rules alone would break old APK direct attendance writes. Resolve the blockers and coordinate Functions, clients and rules with a tested rollback plan; do not deploy these independently.

Legacy local biometric profiles without installation binding require password login and re-enrollment. Registering a new trusted device without biometric remains possible through security settings. This does not constitute administrator approval of a device beyond the existing authenticated-user enrollment policy.

## Changed Files

Production: src/App.jsx; src/services/identityCenter.js; src/features/identity/BiometricEnrollment.jsx; src/features/identity/IdentitySecurityCenter.jsx; src/features/identity/PasskeySettings.jsx; functions/identityCenter.js; functions/index.js; functions/attendanceManual.js; functions/attendanceWifi.js; firestore.rules.

Verification/configuration: eslint.config.js; src/mocks/firebase-auth.js; src/mocks/identity-center-vps.js; tests/identity-center.test.mjs; tests/biometric-lifecycle.test.mjs; tests/attendance-manual.test.cjs; tests/attendance-manual-firestore.integration.mjs; tests/company-wifi-rules.test.mjs; tests/run-company-wifi-rules.mjs; tests/visual/login-home-role.visual.mjs; this report.
