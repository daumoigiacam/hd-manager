# HD Manager final acceptance gate

Date: 2026-09-27 (Asia/Saigon)
**FINAL = BLOCKED.** No confirmed P0/P1 defect was reproduced in the tested slice, but absence of evidence is not a PASS. The mandatory authenticated, data-layer, network, memory and low-end Android gates remain open.

## Issue priority

| Priority | Confirmed count | Open item |
| --- | ---: | --- |
| P0 | 0 in tested scope | Production-wide P0 status unknown without live journeys and telemetry. |
| P1 | 0 confirmed | Startup/API/render/memory targets not measured across production users and weak devices. |
| P2 | 2 investigation candidates | Large main JS; potentially unbounded tenant Firestore reads. Neither has a measured user impact yet. |
| P3/environment | 1 unresolved observation | Emulator WebView cache warnings without app crash. |

## Mandatory gates

| Gate | Result | Evidence / missing proof |
| --- | --- | --- |
| Startup | BLOCKED | Emulator Activity launch measured; first usable UI/Dashboard Ready and physical low-end result missing. |
| Navigation | BLOCKED | Home visual and navigation unit checks pass; authenticated route timings missing. |
| Rendering | BLOCKED | Responsive Home geometry passes; FPS/long-task/React profiler missing. |
| API and database | BLOCKED | Platform unit/build/schema pass; production Firebase and staging live API/DB timings missing. |
| Cache | BLOCKED | Static/test coverage only; hit/staleness/tenant-cache trace missing. |
| Memory | BLOCKED | Single emulator sample, no repeated-use curve. |
| Mobile | BLOCKED | Android 36 login smoke passes; business flows and older physical Android missing. |
| Network resilience | BLOCKED | Unit tests pass; authenticated slow/offline/reconnect matrix missing. |
| Authentication | BLOCKED | Login UI renders; real login, OTP, Google, reset and session restore not run. |
| Tenant isolation and RBAC | BLOCKED | Emulator rules pass; production cross-tenant/cache and authenticated UI/API checks missing. |
| Data integrity | BLOCKED | Contracts pass; UI/Firebase/API/DB reconciliation missing. |
| Error handling | BLOCKED | Short login smoke has no page failure; production logs missing. |
| Production build | PASS (local artifact) | `npm run build`; cloud-mode Firebase bundle verifier PASS. Deployment and cache headers not verified. |
| Regression | PARTIAL PASS | Frontend `npm test`, Home visual, Firestore rule suites and Platform Jest pass; full e2e/device matrix not complete. |

## Reproducible evidence and commands

| Command / check | Result |
| --- | --- |
| `npm test` | PASS after fixing stale Sổ nợ test assertion. |
| `npm run lint`, `npm run typecheck`, `npm run build` | PASS. Typecheck script covers payroll TS config, not every JSX module. |
| `node tests/visual/business-report.visual.mjs` against local preview fixture | PASS at 320/360/375/390/414/430/768/1280 px. Fixture is not production data. |
| `npm run test:performance`, `npm run test:stress:big`, `npm run test:kpi` | Scripts exit 0; results are static/simulated, **not** production/mobile KPI PASS. |
| `npm run test:firestore-tenant-rules` | PASS, 14 cases, Firebase emulator. |
| `npm run test:firestore-payroll-rules` | PASS, 19 cases, Firebase emulator. |
| `npm run test:identity:firestore` | PASS, Firebase emulator. |
| `npm run test:firestore-customer-messaging-rules` | PASS, 6 cases, Firebase emulator. |
| `npm run test:firestore-employee-customer-messaging-rules` | PASS, 8 cases, Firebase emulator. |
| `npm --prefix hd-connect-platform run typecheck` | PASS. |
| `npm --prefix hd-connect-platform run platform:test` | PASS, 5 tests. |
| `npm --prefix hd-connect-platform test -- --runInBand` | PASS, 130 suites / 466 tests. |
| `npm --prefix hd-connect-platform run build` and `run db:validate` | PASS. |
| Android `assembleDebug`, `adb install -r`, `adb shell am start -W` | PASS after temporary ASCII drive mapping; login screen visible on Android 36 emulator. |
| Platform database e2e / VPS host metrics / physical Android | NOT RUN; safe disposable DB or approved host/device access unavailable. |

## Build artifact and Git state

- Vite artifact: `dist/`, build ID `2026.8.1-rc1-1790442651874` (`dist/version.json`). The local bundle is not a deployed build.
- Android debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 19,694,124 bytes. Debug-only; not a signed release or AAB.
- Commit: **not created**. Initial HEAD was `affc3439` on `main`; the worktree already had unrelated in-progress changes. No commit/push was requested for this turn.
- The source audit used `.github/workflows/deploy.yml`, which builds `VITE_DATA_MODE=cloud` and verifies the Firebase production bundle. Staging HD Platform checks must not be reported as production Firebase end-to-end proof.

## Blocker resolution checklist

1. Use an approved disposable audit tenant and accounts spanning owner, employee and customer roles; record real Firebase request and UI/data traces.
2. Get read-only VPS/hosting/Firebase telemetry and, for the separate Platform staging path, a disposable seeded PostgreSQL/Redis stack. Verify resource pressure, query plans and cache headers.
3. Run high-, mid- and low-end Android plus slow/offline/reconnect, repeated navigation, double-submit and memory tests with no financial data risk.
4. Compare measured before/after figures for any actual performance fix and rerun the complete regression matrix. Only then re-evaluate the 16 mandatory gates.
