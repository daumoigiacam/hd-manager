# Code Cleanup Audit

Audit date: 2026-08-09
Checkpoint: `e123fba chore(cleanup): audit checkpoint before cleanup`
Policy: delete only category A. Preserve categories B, C, and D until runtime use is proven.

## Baseline

| Metric | Before cleanup |
| --- | ---: |
| Tracked files | 368 |
| Direct dependencies | 35 |
| JavaScript bundle | 4,410,663 bytes |
| CSS bundle | 1,300,740 bytes |
| Fonts | 323,564 bytes |
| HTML | 9,160 bytes |
| Total `dist` | 6,044,127 bytes |
| Last measured Firebase auth restore | about 649 ms |
| Last measured dashboard confirmation | about 1,018 ms |

The startup timings are a prior single local development measurement, not a new physical-device benchmark. Cold start, warm start, memory, Android, and iOS measurements remain unverified until the final validation stage.

## Classification

### A - Definitely dead

The following items have no package script, import, dynamic import, route, build configuration, workflow, deployment configuration, native reference, or textual runtime reference. They are generated snapshots, historical reports, recovery copies, or one-off local debug tools.

| Candidate | Evidence | Planned action |
| --- | --- | --- |
| `source-archives/` (25 files, 71,549,926 bytes) | Archived/corrupted/backup source snapshots; no runtime references | Remove from repository |
| Committed `test-results/` (55 files, 218,650 bytes) | Test suites generate current reports; directory is already ignored; KPI gate reads newly generated output | Remove historical tracked output |
| Ten root debug screenshots | No source, docs, workflow, or build references | Remove |
| `temp-restore.zip`, `hdconnect-website-upload.zip` | Generated recovery/deployment archives; no consumers | Remove |
| `ios-expo/dist-ios-test/`, `ios-expo/expo-go-qr.png` | Generated test bundle/QR; no source or EAS references | Remove |
| `sanity-web/`, `serve-sanity-5190.mjs` | One-off local sanity page/server; no script or workflow references | Remove |
| `serve-dist-5174.mjs`, `serve-dist-5180.mjs` | Port-only duplicates of required `serve-dist.mjs`; no callers | Remove |
| `serve-apk-stable.mjs` | One-off server for an ignored local artifact directory; no callers | Remove |
| `code.txt` | Superseded initial source dump; only referenced by obsolete README | Remove after README correction |
| Empty accidental files `!declared.includes(x))`, `$null` | Zero-byte shell artifacts; no references | Remove |
| `.last_export_stamp.txt` | Local export marker; no consumers | Remove |
| Old APK `.idsig` sidecar | Detached local installer metadata; not part of Android build/signing | Remove |

### B - Probably dead, review required

These candidates are not deleted automatically because removing them would create disproportionate regression risk.

| Candidate | Why suspected | Why retained |
| --- | --- | --- |
| `AttendanceViewLegacy`, `SettingsViewLegacy`, `FinanceViewLegacy`, `CustomerCRMViewLegacy`, `SalaryViewLegacy`, `DebtManagementViewLegacy` in `src/App.jsx` | Static lexical scan found no direct render references | The monolithic app contains dynamic view selection and legacy data compatibility; component-sized deletion needs dedicated UI regression coverage |
| Numerous unused local helpers/constants reported by strict `no-unused-vars` | Ad-hoc strict scan reported 326 findings | Some initializers may register listeners, preserve migrations, or support string/dynamic dispatch; each requires local proof |
| `playwright-core` dev dependency | No direct repository import found in initial dependency scan | May be used by external/local browser validation tooling; removal does not materially affect production bundle |
| Unreferenced-looking assets under native/public folders | Static imports may not expose manifest, CSS URL, Capacitor, Electron, or platform use | Keep until native and browser asset manifests are exhaustively mapped |

### C - Possibly used dynamically

Do not delete without external integration evidence.

- Firebase callable/HTTP/scheduled/trigger functions and webhook handlers.
- Firestore rules, indexes, migration compatibility, and payroll history compatibility paths.
- URL/deep-link/navigation names selected by strings, notifications, or permissions.
- Environment variables and deployment URLs used by Vite, Firebase, GitHub Actions, VPS, Capacitor, Electron, SePay, maps, or external services.
- Runtime debug instrumentation gated by development mode or explicit `perfCheck`/`loginDebug` parameters.

### D - Required

- `src/mocks/firebase-*.js` and preview seed data: required by explicit `VITE_DATA_MODE=preview` aliases. Production cloud builds do not silently use them.
- `@capacitor/android`: native platform package required by Capacitor tooling even without a JavaScript import.
- `autoprefixer`, `postcss`, and `tailwindcss`: required by PostCSS/Tailwind configuration and styles.
- `eas-cli`: required by `ios:eas:preview`.
- `serve-dist.mjs`: used by `npm run serve:dist`.
- Operational `console.warn`/`console.error` calls: error reporting rather than sensitive debug output.
- Current test suites, source modules, Firebase configuration, native projects, CI workflows, and deployment scripts.

## Static findings

- No `debugger` statement was found.
- Production mocks are isolated behind explicit Vite preview aliases.
- The old README contained sample phone numbers and an obsolete mock-backend description; it will be replaced before cleanup.
- The default lint scope does not enforce unused declarations across the entire monolithic `src/App.jsx`. A strict audit-only run found 326 findings; these are not equivalent to 326 safe deletions.
- Dependency scan suggestions are contextual false positives except for `playwright-core`, which remains review-required.

## Safe delete protocol

1. Record evidence and category here.
2. Remove a small category-A batch.
3. Run typecheck, lint, unit/regression tests, and production build.
4. Stop and restore only the failing batch if a regression appears.
5. Commit each successful batch separately.
6. Do not push or deploy as part of this audit unless separately requested.

## Review-required register

The final cleanup report must list every retained B/C candidate, checks performed, and deletion risk. The acceptance result must remain conditional if Android/iOS or physical-device performance cannot be executed in the available environment.
