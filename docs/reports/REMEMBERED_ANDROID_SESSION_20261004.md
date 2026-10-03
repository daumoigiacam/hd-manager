# Remembered Android session candidate

User requested one biometric confirmation, then direct access on subsequent opens,
with biometric sign-in after explicit logout and biometric password recovery.

## Implementation

- Android starts in memory-only Auth unless a remembered UID marker exists.
- Successful biometric login/enrollment switches Firebase Auth to native encrypted
  persistence using the existing Android Keystore-backed plugin. No password or
  biometric template is stored. The separate biometric device credential retains
  its protected-read requirement.
- Only the UID marker is in localStorage. Serialized Firebase session tokens are
  in native encrypted storage, not WebView localStorage/IndexedDB.
- Restoring a matching authenticated remembered session no longer requests a
  biometric prompt on foreground. Explicit logout clears the restore marker
  synchronously before Firebase removes the persisted session.
- Password sign-in on an enrolled Android device requires biometric confirmation
  before remembering it. New enrollment no longer has a skip-and-enter button.
- Native password recovery without PIN reads only the selected account's protected
  credential once and submits to the existing server recovery endpoint. Cancellation
  and unknown-account attempts do not fall back to an unprotected credential.
- No polling, extra data listener, or server-deployment change.

## Evidence and limitations

Identity suite: 13 tests passed. Includes real browser Firebase SDK using a local
test HTTP endpoint: login, switch persistence, app destruction/recreation restores
the correct user, explicit logout prevents restoration. Native storage is mocked
in this test; Android Keystore behavior still requires physical device verification.
Recovery cancellation and wrong-account tests passed. Lint, payroll-scoped
typecheck and web build passed.

This is remembered sign-in, not an app lock: someone holding an unlocked phone can
use the remembered account. Firebase token refresh and existing account validation
still apply; remote revocation is not guaranteed instantaneous while offline.
Cold startup can still wait for account/data validation and rendering. No measured
instant-start claim is made. No production recovery write was performed.

On 2026-10-04 the user reported that their device tests all passed after installing
the candidate APK on their S25 Ultra. This is user-reported verification, not an
instrumented device measurement or proof of a production rollout. No numeric
startup latency was collected.
