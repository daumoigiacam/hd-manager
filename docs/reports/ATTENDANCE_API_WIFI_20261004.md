# Attendance API and company WiFi follow-up

## Deployment

Deployed only functions:identityAttendance to hd-manager-c5839, us-central1.
Firebase confirmed successful creation. CLI then exited 1 because it could not
configure an Artifact Registry cleanup policy in asia-southeast1. No cleanup
policy, production rules, other endpoints, or business records were changed.

POST {} to the endpoint returned HTTP 401 with an invalid-session message.
This proves reachability and anonymous rejection, not successful employee attendance.
No artificial attendance records were written to production.

## Company WiFi

User reports tapping the button produces no visible response. Code inspection
found the button disabled by cached permission state, preventing its native
permission-request path. The button now permits an Android owner/admin to request
permission on tap. The handler updates permission state, rejects denial, reads
current SSID/BSSID, and awaits the existing server-acknowledged settings write.
Native error details are retained. Missing permission/callback no longer silently
returns. Duplicate-save prevention remains. No polling, scans, or app-wide
background work was added. Web remains unable to read actual WiFi.

Without the affected APK log this is not a confirmed exclusive root cause.
Real device configuration and reload remain to be verified by the user.

## Tests

- 31 manual attendance / WiFi / automatic attendance tests passed.
- Local Firestore emulator: owner/admin configuration allowed, employee and
  cross-tenant writes denied; three concurrent attendance requests produce one
  record and one audit log.
- Five handler tests: success, denied permission, native error, failed server
  save, duplicate click passed.
- WiFi UI QA: 360, 390, 430 and 1440 px passed; external writes blocked.
- Lint, payroll-scoped typecheck and production build passed.

## Limitations

Existing identity and attendance rollout limitations in
BIOMETRIC_LOGIN_ATTENDANCE_20261004.md are not all resolved by publishing one API.
Production authenticated attendance, physical WiFi configuration and latency
were not measured. No universal zero-lag claim is made. Frontend WiFi changes
require a new client build; installed APKs do not acquire them automatically.
