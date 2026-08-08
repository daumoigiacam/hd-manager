# HD Manager Startup Performance Report

Date: 2026-08-08
Scope: startup sequencing only. Business logic, Firebase data, API contracts, permissions, payment flows, QR and webhook behavior were not changed.

## Findings Before

The startup audit found three avoidable critical-path costs:

1. Firebase Auth persistence was not explicitly configured in the app bootstrap. A returning user could wait for Auth/anonymous initialization before the application could settle its route.
2. A cached private session was kept behind the session-recovery screen until the core company/employee collections were marked loaded. This made a valid returning session feel like a long loading screen.
3. On web, `companies` and `employees` were not in the initial realtime priority set, so identity data could be deferred behind the listener delay. The REST fallback also read collections sequentially.

The previous repository did not contain reliable startup timing events, so exact BEFORE cold-start, warm-start, Auth-restore and first-meaningful-UI numbers cannot be reconstructed without inventing data. This report intentionally does not fabricate those numbers.

## Changes After

- Configured Firebase Auth persistence with IndexedDB first and browser-local persistence as a safe fallback.
- Firebase Auth remains the authority. A local session never grants access by itself and no password is stored.
- A returning session waits only for the Auth restore decision; it no longer waits for every business collection before rendering the authenticated shell.
- Anonymous Auth is no longer started automatically during general app bootstrap. Legacy registration/login paths may still request it on demand, so it cannot race with and overwrite an Identity Center custom-token session.
- `companies` and `employees` are treated as core identity collections and scheduled immediately for realtime loading on web and native.
- REST fallback reads now run concurrently with `Promise.allSettled` instead of serially waiting for every collection.
- Added opt-in startup telemetry. It is enabled with `?perfCheck=1`, `?perfMonitor=1`, `VITE_PERFORMANCE_MONITOR=1`, or the existing local performance-monitor flag.

## Startup Events

The following events are emitted without storing sensitive identifiers:

- `app.launch`
- `react.ready`
- `firebase.initialized`
- `auth.persistence.ready`
- `auth.persistence.restored`
- `auth.state.restored`
- `auth.user.restored`
- `user.recognized`
- `first.ui.rendered`
- `shell.rendered`
- `first.meaningful.data.rendered`
- `background.sync.started`
- `background.sync.core_ready`
- `background.sync.completed`

When the app is running with performance monitoring enabled, inspect the timing in the browser console:

```js
window.hdStartupTiming.events()
window.hdStartupTiming.export()
```

The same events are forwarded to the existing `window.hdPerformanceMonitor` event stream when the monitor is enabled.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | PASS; Vite production build completed in 10.11s on the final validation run |
| `npm.cmd test` | PASS; all configured regression suites completed |
| Stress regression | PASS; 11,309 operations |
| Identity regression | PASS |
| Order, warehouse and delivery regression | PASS |
| Payroll regression | PASS |
| `git diff --check` | PASS |
| `npm audit --omit=dev` | Not completed: npm audit endpoint returned an error in this environment |

## Before/After Runtime Measurement

The code now records the requested runtime values, but this CLI run did not have an authenticated web, Android or Electron session available for a physical cold/warm measurement. Therefore the values below are intentionally marked as pending rather than guessed.

| Metric | Before | After |
| --- | --- | --- |
| Cold start | Not captured by the previous app | Capture from `app.launch` to `first.ui.rendered` |
| Warm start | Not captured by the previous app | Capture from `app.launch` to `first.ui.rendered` |
| Auth restore | Not captured by the previous app | Capture from `app.launch` to `auth.state.restored` |
| First meaningful UI | Not captured by the previous app | Capture from `app.launch` to `first.meaningful.data.rendered` |
| Background sync | Not captured by the previous app | Capture from `background.sync.started` to `background.sync.completed` |

For release acceptance, capture one cold and one warm run on the target Android WebView, Electron build and production web domain with the monitor enabled. This is required to make device-specific claims about seconds, RAM and CPU.

## Files Changed

- `src/App.jsx`: Auth persistence/restore sequencing, non-blocking data bootstrap, core listener priority, parallel fallback reads and startup milestones.
- `src/main.jsx`: launch and React bootstrap milestones.
- `src/services/startupTelemetry.js`: opt-in startup timing collector and export bridge.

## Safety Statement

No Firestore documents, collection names, schema, authentication data, passwords, business formulas, API contracts, SePay flow, webhook flow, QR flow or permissions were changed. The local session is used only as a render cache and is cleared when Firebase Auth reports no valid user or an anonymous user where a private session was expected.

No commit, push or production deploy was performed in this task.

## Final Validation (2026-08-08)

This validation was intentionally run before commit, push or deploy. The local browser had an authenticated session at the start. Logout was performed through the UI and returned to the Login screen. The browser then blocked form input and viewport reloads under its local URL policy, so the remaining interactive session scenarios are not marked as passed.

| Check | Status | Evidence / limitation |
| --- | --- | --- |
| Login UI | PASS (desktop viewport) | Login rendered with only Username/phone and password. Measured input height was 52px, width 405.8px and no overflow was observed in the local viewport. |
| Login UI mobile responsive | NOT TESTED | Mobile viewport reload/input was blocked by the browser URL policy. |
| Persistent login | NOT TESTED | Could not submit a credential and complete a real refresh/reopen cycle in this browser session. |
| Logout | PASS | UI logout returned to the Login screen; no JavaScript dialog appeared. |
| Auth restore | NOT TESTED | Requires a successful login followed by refresh/reopen. Static code and Identity Center regression checks passed. |
| Web startup | NOT TESTED | Startup telemetry is implemented, but a reproducible cold/warm timing run was not captured in this session. |
| Electron startup | NOT TESTED | Electron runtime was not launched for this validation. |
| Android startup | NOT TESTED | No Android device/WebView runtime was available for this validation. |
| Offline handling | NOT TESTED | No browser network-throttling/offline run was available after the browser policy block. |
| Slow network | NOT TESTED | No reproducible throttled-network run was captured. |
| Critical-path code audit | PASS (static) | Firebase Auth remains authoritative; persisted session cache does not grant access; shell is not gated by all business collections; background sync is separate. |
| Password storage audit | PASS (static) | No password is written to the app session cache or startup telemetry. Login code hashes/verifies or sends credentials only to the existing auth flow. |
| Build | PASS | `npm.cmd run build`; 2,359 modules; final build completed in 10.11s. |
| Regression test | PASS | `npm.cmd test`; all configured suites passed, including Identity, order, warehouse, delivery and payroll suites. |
| Lint | NOT AVAILABLE | `package.json` has no `lint` script. |
| Typecheck | NOT AVAILABLE | `package.json` has no `typecheck` script and the project is JavaScript/JSX. |

### Earlier Validation Conclusion

At this earlier checkpoint the startup architecture passed build, regression and static security checks, but authenticated reload had not yet been captured. The later **Persistent Login Root-Cause Fix Validation** section supersedes the runtime-login entries below. No commit, push or production deploy was performed.

## Environment Validation (2026-08-08)

The development server was started with the project's existing `dev` script and the configured Vite command:

```text
npm run dev -- --host 127.0.0.1 --port 5173
```

Observed result:

- Vite ready in 412 ms.
- `http://127.0.0.1:5173/` returned HTTP 200.
- `http://localhost:5173/` returned HTTP 200.
- No source or project configuration was changed to make the server start.
- Vite emitted only the existing Babel de-optimization notice because `src/App.jsx` is larger than 500 KB; this is a warning, not a runtime failure.

The in-app browser had retained a stale `ERR_CONNECTION_REFUSED` error document from before the server was started. Browser Use then blocked navigation and form automation under its URL policy. Because credentials could not be submitted after the server became available, Login, session restore, refresh/reopen, cold/warm telemetry and network-condition scenarios remain `NOT TESTED`; no workaround, CDP or fake result was used.

The preview reload was retried after the HTTP 200 checks and was blocked by the same browser URL policy. This confirms that the current limitation is the preview surface's stale error-document policy, not Vite availability; no alternate browser surface or policy-bypass method was used.

### Earlier Status Matrix (before user-assisted login)

| Check | Status |
| --- | --- |
| Dev server | PASS |
| Login UI | PASS (desktop viewport) |
| First login | NOT TESTED |
| Refresh session | NOT TESTED |
| Close/reopen web | NOT TESTED |
| Logout | PASS |
| Auth restore | NOT TESTED |
| Cold start | NOT TESTED |
| Warm start | NOT TESTED |
| Dashboard shell runtime | NOT TESTED |
| Background sync runtime | NOT TESTED |
| Android | NOT TESTED |
| Electron | NOT TESTED |
| Slow network | NOT TESTED |
| Offline | NOT TESTED |
| Build | PASS |
| Regression | PASS |

This validation was completed before publication. No production deployment was performed as part of this Auth/startup audit.

## Final Anonymous Auth Audit (2026-08-08)

The final source audit found one disabled legacy Auth `useEffect` that still contained an automatic `signInAnonymously` branch behind `if (false)`. Although unreachable, it could reintroduce the original race if re-enabled later. The obsolete effect was removed completely.

Anonymous Auth is still required only by the existing on-demand company-registration and legacy cloud-login fallback paths. It is not part of application startup. All Firebase credential mutations now use one serialized queue:

- A restored or newly established private custom-token user is reused and never replaced by an anonymous request.
- If an anonymous request starts first, the private custom-token mutation runs after it and remains the final Firebase identity.
- If a private custom-token mutation starts first, the queued anonymous helper re-checks `auth.currentUser` and does not call `signInAnonymously`.
- Source regression requires exactly one `signInAnonymously(auth)` call and verifies that it remains inside the guarded on-demand helper.

Security audit results:

- Firebase Auth remains the only authentication authority; cached profile data cannot independently grant Dashboard access.
- Logout still calls Firebase `signOut`, clears the application session cache and clears the in-memory user/company state.
- No password, PIN or Firebase refresh token is written by the startup/session cache or telemetry.
- The currently logged-out localhost session remained on Login after reload, confirming the unauthenticated route guard.

Final automated verification after the guard was added:

| Check | Result |
| --- | --- |
| Identity regression | PASS |
| Full `npm.cmd test` | PASS; all configured suites, including 11,309 stress operations |
| `npm.cmd run build` | PASS; 2,359 modules; 11.89 s |
| Lint | NOT AVAILABLE; no `lint` script exists |
| Repeated authenticated reload after final guard | NOT REPEATED; the local tab had no credentials, while the earlier real authenticated reload evidence remains recorded above |

No Firebase project, Firestore data, API contract, business rule, payment flow, permission or stored business data was changed by this final guard.

## Persistent Login Root-Cause Fix Validation (2026-08-08)

### Root cause

The browser trace reproduced the failure and showed the exact sequence: Identity Center successfully established a non-anonymous Firebase credential, then an older startup `signInAnonymously` request completed and replaced it. The next reload therefore restored `anonymous: true`, causing the cached application session to be rejected and Login to appear again.

The automatic anonymous startup branch was removed. Firebase Auth remains authoritative, custom-token login remains unchanged, no password is cached, and anonymous Auth is available only to the existing legacy flows that explicitly request it.

### Real browser evidence

The user completed a real login in the local in-app browser. The visible page and sanitized Auth trace were then checked directly:

- First login: Dashboard rendered successfully.
- Identity credential: `signedIn: true`, `anonymous: false`.
- Reload: Dashboard rendered again without showing Login.
- Reloaded Auth state: `signedIn: true`, `anonymous: false`, `hasCachedAppSession: true`.
- Auth persistence restore observed approximately 649 ms after Firebase initialization.
- Reload reached `DOMContentLoaded` in 215 ms and Dashboard was visibly confirmed within 1,018 ms. These are one-run local development measurements, not production-device benchmarks.
- A close-and-new-tab automation attempt opened an isolated browser context with separate storage. It is therefore reported as `NOT TESTED`, not interpreted as an application failure.

### Latest status matrix

| Check | Status | Evidence / limitation |
| --- | --- | --- |
| Dev server | PASS | Vite served `127.0.0.1:5173` and the page was interactively tested. |
| Login UI | PASS (desktop) | Login form rendered without overflow; prior measured input height was 52px. |
| First login | PASS | User submitted real credentials; Dashboard rendered and Firebase credential was non-anonymous. |
| Refresh session | PASS | Browser reload returned directly to Dashboard without requesting credentials. |
| Auth restore | PASS | Reload trace restored `anonymous: false` with a cached app session. |
| Warm web reload | PASS (single local run) | DOMContentLoaded 215 ms; Dashboard confirmed within 1,018 ms. |
| Close/reopen browser | NOT TESTED | Automation-created replacement tab used an isolated storage context. |
| Logout | PASS (earlier validation) | UI logout returned to Login; not repeated after the final authenticated reload because the replacement-tab environment was isolated. |
| Cold start | NOT TESTED | Requires a controlled fresh browser/device profile and multiple runs. |
| Background sync completion | NOT TESTED | No complete timing event was captured in the final authenticated run. |
| Slow network | NOT TESTED | No reliable throttling capability was available. |
| Offline | NOT TESTED | No reliable offline capability was available. |
| Electron | NOT TESTED | Electron was not launched in this validation. |
| Android | NOT TESTED | No physical Android/WebView runtime was attached. |
| Build | PASS | `npm.cmd run build`; 2,359 modules; completed in 12.32 s. |
| Regression | PASS | `npm.cmd test`; all configured suites passed, including 11,309 stress operations. |
| Identity regression | PASS | Added a guard that rejects reintroduction of automatic anonymous bootstrap. |
| Lint | NOT AVAILABLE | `package.json` has no `lint` script. |
| Typecheck | NOT AVAILABLE | Project is JavaScript/JSX and has no `typecheck` script. |

### Files changed for this fix

- `src/App.jsx`: removed startup anonymous-auth race and added sanitized Auth diagnostics under the existing login-debug flag.
- `tests/identity-center.test.mjs`: added a regression guard preventing automatic anonymous bootstrap from returning.
- `docs/STARTUP_PERFORMANCE_REPORT.md`: recorded the reproduced root cause and real reload validation.

This validation was completed before publication. No production deployment was performed as part of this Auth/startup audit.
