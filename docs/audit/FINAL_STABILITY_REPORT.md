# HD Manager stability evidence

Date: 2026-09-27 (Asia/Saigon)
Verdict: **BLOCKED for full-app stability acceptance**.

## Crash and freeze

- The cloud-mode web production build and debug APK completed. The APK opened to login on the Android 36 emulator; no HD Manager process crash was observed during the short smoke.
- Login display is not evidence that authenticated modules never crash or freeze. No long-running low-end Android soak, 30-50 navigation cycles or real-world device matrix was completed.
- Logcat showed Chromium WebView cache creation warnings on this emulator. `/data` had 7.5 GB free (21% used), so disk pressure was not demonstrated. Reproduce on clean/physical devices before calling this an app defect.

## Memory leak and rendering

- `src/App.jsx` has a bounded foreground listener planner and an effect cleanup owner for active subscriptions/timers. Planner and resilience unit tests passed.
- No repeated-navigation heap/PSS series, retained-object profile or React render-count trace exists. Leak-free status is **NOT VERIFIED**. One Android PSS/RSS sample is in the performance report.

## Race condition and duplicate submission

- Frontend functional suites and Platform Jest tests passed, including existing order/payment/warehouse/payroll contracts. Firebase tenant/rule tests passed in the emulator.
- Double click, concurrent sessions, offline-submit/reconnect and UI/API/DB reconciliation were **NOT RUN** against a disposable authenticated environment. Zero duplicate transactions cannot be asserted from the local smoke.

## Network failure and recovery

- Existing `firestore-resilience` and `fetch-timeout` automated tests passed as part of `npm test`.
- Fast/slow/4G, API 500/429, network loss/reconnect, background/foreground with pending writes and bounded retry behavior were **NOT VERIFIED** on an authenticated Android session. No production error-rate sample was available.

## Data integrity, tenant isolation and RBAC

- Firestore emulator results: tenant isolation 14 PASS, payroll rules 19 PASS, customer messaging rules 6 PASS, employee-customer messaging rules 8 PASS, identity recovery PASS. Expected `PERMISSION_DENIED` messages occurred during negative security tests.
- HD Platform: Prisma schema validation, typecheck, build, platform tests and 130 Jest suites / 466 tests PASS. Those do not prove production Firebase-to-UI correctness or live PostgreSQL/Redis behavior.
- No real Company A/B search/cache/export cross-session test, payment/debt/inventory UI-to-API-to-database comparison or disposable Platform integration stack was run. Tenant and financial correctness remain gated for final acceptance.

## Error handling and recovery

- Local Chrome production-preview login-shell sample had no page or request failures in that short observation. It did not include logged-in modules.
- No production console, unhandled rejection, Firebase provider, VPS or physical-device log corpus was available for classification. Critical production error count is **UNKNOWN**, not zero.

## Required stability acceptance

Run authenticated disposable-account journeys for all critical modules, cross-tenant negative tests including cache/local storage, concurrent save/double-submit, offline recovery, long-use memory and low-end Android testing. Capture UI values together with Firebase/API/database values and retain exact failure logs. Do not mark `FINAL PASS` until each master-task gate has evidence.
