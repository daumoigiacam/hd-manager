# HD Manager final app audit

Date: 2026-09-27 (Asia/Saigon)
Verdict: **BLOCKED for final production acceptance**. This is a completed evidence inventory and partial regression audit, not a claim that every production flow has passed.

## Executive summary

- The requested Home change is implemented: `Nhan dinh & goi y` appears immediately below the four KPI totals. The duplicate section was removed from the detailed overview. The mobile visual regression passed at 320, 360, 375, 390, 414, 430 and 768 px; desktop smoke passed at 1280 px.
- Frontend functional tests, lint, payroll TypeScript check and Vite production build passed. Firestore security-rule emulator tests passed. The separate HD Platform build, typecheck, schema validation and 466 Jest tests passed.
- Final end-to-end acceptance is not established. No authenticated production session, production Firebase metrics, VPS access, production database metrics, or low-end physical Android device was available for this audit. A debug APK was installed on an Android 36 emulator and the login screen rendered, but business flows could not be exercised there.
- The master task's assumed production chain through HD Platform and PostgreSQL is not the deployed app's current source of truth. The `main` deployment workflow builds `VITE_DATA_MODE=cloud`; `vite.config.js` maps that mode to Firebase Auth/Firestore/Functions. HD Platform/PostgreSQL is a separate staging/API track. This audit did not change that architecture.

## Scope and architecture

| Surface | Inspected evidence | Current conclusion |
| --- | --- | --- |
| React/Vite/Capacitor/Electron | `package.json`, `vite.config.js`, `src/App.jsx`, `android/`, `electron/` | One large React application with Firebase cloud runtime in the deployed mode; Android is a Capacitor WebView. |
| Identity and business data | `src/config/firebase-only-runtime.js`, `src/App.jsx`, Firebase rules/tests | Firebase is the deployed frontend path. Firestore is tenant-filtered in the inspected realtime queries. |
| HD Platform and PostgreSQL | `hd-connect-platform/package.json`, Prisma schema, platform tests, staging release contract | Separately buildable and tested; not the `main` frontend deployment's production data path. |
| Release | `.github/workflows/deploy.yml` | `main` builds a cloud/Firebase bundle and uploads frontend `dist` to a VPS; this workflow does not deploy the Platform API. |
| Monitoring | `src/services/startupTelemetry.js`, `src/services/performanceMonitor.js` | Opt-in client diagnostics exist; no authenticated production trace was captured. |

## Modules audited

The frontend `npm test` script exercised its registered functional suites for identity, customers, products, orders, warehouse/inventory, debt, finance, delivery, payroll, messaging, search, navigation, security and Firebase resilience. The Firestore emulator separately exercised tenant isolation, payroll, identity recovery and customer messaging rules. Platform Jest covered 130 suites / 466 tests. This is **automated contract coverage**, not a live UI/API/database acceptance pass for every module. Authenticated flows, cross-module calculations, camera/files, real network recovery and low-end device behavior remain unverified.

## Findings and root causes

### F-01: Main JavaScript remains a large startup candidate (P2 investigation)

- Impact: possible parse/execute cost on weak Android devices; no user-visible slowdown was proven.
- Reproduction/evidence: `npm run build` produced a 2,603,331-byte main JS chunk (690.57 kB gzip). `src/App.jsx` is about 4.5 million characters; the inspected route boundary uses `React.lazy` for Identity Security Center but not the bulk of business modules.
- Root cause: the application is still organized around a very large statically imported root module.
- Fix: **deferred**. Route splitting must follow a production/mobile startup trace and preserve current module/data contracts.
- Validation, before/after: no valid authenticated pre/post performance measurement. Build and login-shell checks pass; speed improvement is **not claimed**.

### F-02: Firestore listener/read volume may grow with tenant size (P2 investigation)

- Impact: possible excess reads, initial transfer and memory at large tenant sizes; no production count or latency was captured.
- Evidence: `getTenantCollectionSources` in `src/App.jsx` tenant-filters most collections but generally does not limit them; messages and customer notifications have explicit caps. The foreground listener planner bounds active subscriptions and cleanup exists.
- Root cause: collection-wide tenant queries on a large monolithic in-memory data path, despite bounded active listener count.
- Fix: **deferred** pending Firestore read counts, payload sizes, tenant data distribution and UI list profiling. Do not truncate finance/inventory data to make a benchmark pass.
- Validation, before/after: not measured.

### F-03: Sổ nợ layout test had a stale source-string assertion (test-only, resolved)

- Impact: blocked the full frontend suite despite the runtime header already hiding global search for both debt and finance.
- Reproduction: first `npm test` failed in `tests/debt-overview-layout.test.mjs` because one header branch added `activeTab !== 'finance'` between two tokens matched literally by the test.
- Root cause: exact text matching instead of an assertion tolerant of the extra finance guard.
- Fix: allow the optional finance guard while still requiring both debt-header branches.
- Validation: second `npm test` passed. Runtime behavior was not changed by this test fix.

### F-04: Windows Unicode workspace disrupted Java/Gradle tooling (environment, resolved for local run)

- Impact: Firebase emulator and initial Gradle invocation failed to locate files/classes under `D:\quan ly ban hang 1`'s non-ASCII path.
- Root cause: the Java subprocess path handling on this machine, not an application code failure.
- Fix: temporarily map the workspace to `Z:` for test/build execution. The first Android asset-compression attempt also failed transiently; an isolated task rerun and then `assembleDebug` succeeded without changing source.
- Validation: Firestore rule suites and debug APK build passed. The temporary mapping is removed after this audit.

### F-05: Android emulator WebView cache warnings (environment observation, unresolved)

- Impact: unknown. The installed app rendered its login screen and no app crash was observed.
- Evidence: filtered logcat contained Chromium `Simple Cache Backend ... inaccessible right after creation` and `Unable to create cache`; emulator `/data` was only 21% used.
- Root cause: not established; could be emulator/WebView cache state. Do not attribute it to HD Manager without reproduction on a physical device.
- Fix and validation: pending physical-device or clean-emulator comparison.

## Fixes and regression

- UI: moved the existing insight section from the detailed overview to Home under the four totals. No KPI or business calculation was modified.
- Test: repaired the Sổ nợ source assertion noted above.
- Passed: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, visual Home checks, Firebase bundle verification in cloud mode, five Firestore emulator suites, Platform typecheck/build/schema/Jest/platform tests.
- No optimization was made to startup, API, database, cache or query behavior because the required real baseline/root cause is not available. Synthetic tests are documented separately and are not proof of production speed.

## Remaining blockers

| Blocker | Evidence | Impact | Required action |
| --- | --- | --- | --- |
| Authenticated production journey unavailable | Local production build and APK display the login screen only; no audit account/session was used. | Cannot validate module navigation, data correctness, duplicate submit, auth recovery, real Firebase errors or mobile Home after login. | Provide a disposable audit tenant/account and approved production-like environment; capture UI, Firebase and data-layer traces. |
| Production infrastructure and data metrics unavailable | Deployment script runs on VPS, but no VPS/Firestore metrics, server configuration or database session were available locally. | Cannot prove latency, Nginx headers, CPU/RAM/disk, query plans, cache or queue behavior. | Obtain read-only deployment/monitoring access and database query evidence for the actual active runtime. |
| Low-end/mobile and weak-network matrix incomplete | One Android 36 emulator login smoke only; no physical older/mid-range handset, 4G/offline/reconnect authenticated flows. | Cannot meet the mandatory mobile/network acceptance gate. | Run the prescribed device/network matrix with real accounts and instrument startup, frames, memory and retries. |
| Platform database e2e not run against a disposable seeded stack | Unit tests/schema/build pass; integration tests require seeded PostgreSQL/Redis and may write data. | Platform API/data integrity cannot be declared live PASS. | Run disposable-stack e2e and compare UI/API/DB values before any Platform cutover claim. |

No commit or push was requested in this turn. The worktree already contained other in-progress changes, which were preserved.
