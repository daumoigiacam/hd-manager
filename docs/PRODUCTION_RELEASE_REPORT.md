# HD Manager Production Release Report

Date: 2026-07-29
Source deployment commit: `8ca9ddd` (the documentation commit that follows is a report-only update)
Branch: `main`

## Executive Status

The repository is clean, the production build and local test gates pass, and the latest GitHub Actions deployment run passed. The website deployment was verified in CI by comparing the deployed `index.html` SHA-256 with the build produced from the pushed commit.

This is **not a full certification of every requested condition**: no physical-device benchmark was supplied, the synthetic large-scale performance test still reports bottlenecks, the APK is unsigned because no release keystore was configured, and live SePay money-transfer verification was not performed in this session.

## 1. Files Changed In Release Preparation

- `.github/workflows/deploy.yml`: Functions syntax check, functional/performance/KPI gates, artifact upload, VPS release symlink deployment and deployed-index hash verification.
- `.gitignore`: generated test results, local scratch files, logs and the nested `hd-connect-platform` repository are ignored.
- `functions/index.js`: QR fingerprinting based only on payment-affecting fields; successful QR creation overwrites the cache without clearing the previous valid value first.
- `src/App.jsx`: current Sprint application changes, including share warmup/cache flow, payment QR alignment, authentication, delivery, map, payroll, notification and responsive behavior already present in the working tree.
- `src/index.css`: current responsive, login, desktop layout and shared UI styling.
- `docs/SHARE_PERFORMANCE.md`: non-blocking QR/share flow and measurements.
- `docs/PRODUCTION_RELEASE_REPORT.md`: this release report.
- Removed tracked scratch/log files: `.codex_tmp_warehouse_tail.txt`, `.codex_tmp_warehouse_view.txt`, `.static-server.err`, `_order_block_excerpt.txt`.

Generated `dist/`, `test-results/`, Android build outputs, dependency folders and the nested `hd-connect-platform/` repository were not committed. No Firestore data or production business records were deleted or migrated.

## 2. Functionality And Business-Safety Review

- Login, account routing and password-enabled login/create flows remain in source.
- Customer, product, order, warehouse, delivery report, debt, payroll, attendance, personnel, driver, map and notification modules remain present.
- SePay QR generation, QR reuse, share warmup and payment-field-only cache invalidation remain present.
- SePay webhook and reconciliation contracts were not structurally changed by release preparation.
- Firestore structure, authentication configuration, roles and application data were not changed.
- Desktop navigation and responsive mobile layout changes remain in the release source.
- This session verified build/tests/HTTP production serving; it did not perform a live interactive login, order creation, QR scan or bank transfer.

## 3. Bugs And Repository Checks

- Fixed CI portability: `test:all` no longer calls Windows-only `npm.cmd` on Ubuntu runners.
- Fixed deployment target: releases are written under `/var/www/hd-manager/releases/<commit>` and activated through `/var/www/hd-manager/current`, matching the Nginx root.
- Added a CI guard that compares the deployed production `index.html` hash with the build from the pushed commit.
- No merge conflict markers found.
- No temporary project files found in the audited scope.
- No TODO/FIXME found in tracked application source/workflow files; matches in Git sample hooks and this report are outside application scope.
- ESLint and TypeScript are not configured: no `lint` or `typecheck` script exists and no TypeScript source is present. These checks are reported as NOT CONFIGURED, not falsely marked PASS.

## 4. Local Test And Performance Results

| Check | Result | Observed |
|---|---|---:|
| `npm install --no-audit --no-fund` | PASS | Dependencies current |
| Functions install | PASS with warning | Local Node 25; Functions declares Node 22 |
| `node --check functions/index.js` | PASS | No syntax error |
| `npm run test:all` | PASS | 11,309 stress operations |
| `npm run test:performance` | PASS with warning | 4 bottlenecks; 7/8 synthetic scale points flagged |
| `npm run test:stress:big` | PASS with warning | Peak RSS 227 MB; estimated FPS 9.9; crash NO |
| `npm run test:kpi` | PASS with warning | Physical-device KPI log absent and optional |
| `npm run build` | PASS with warning | Vite build 44.64 s; CSS minifier warning remains |
| Memory leak simulation | PASS | 0 |
| Crash local simulation | PASS | 0 |
| Event-loop freeze KPI | PASS | 23.17 ms, target <= 50 ms |
| API normal KPI | PASS | 85 ms, target <= 500 ms |
| Screen-open KPI | PASS | 10.66 ms, target <= 2,000 ms |
| Cold-start architecture KPI | PASS | 350 ms, target <= 2,500 ms |

Vite warning: `Expected identifier but found "-"` at generated CSS input (`-: •|,;`). It does not fail the build, but should be removed in a separate UI-safe cleanup before claiming a zero-warning release.

## 5. GitHub Actions

Latest verified run: [30395300625](https://github.com/daumoigiacam/hd-manager/actions/runs/30395300625)
Conclusion: **PASS**

The run passed checkout, Node.js 22 setup, `npm ci`, Functions syntax, functional tests, performance/stress/KPI gates, production build, artifact upload, VPS deployment and production hash verification.

## 6. Production Website

Target: [https://app.hdconnect.net](https://app.hdconnect.net)
HTTP check: **PASS** (`200`, title `HD Manager`)
Deployment identity: **PASS** in GitHub Actions; deployed `index.html` hash matched the CI build from commit `8ca9ddd`.

The public check confirms serving and release identity. It does not replace a live authenticated smoke test of every business workflow.

## 7. Android Release APK

Build: **PASS** using Vite build, Capacitor sync and Gradle `assembleRelease`.
Gradle workaround: the wrapper was invoked from `android` with a relative classpath because the Windows workspace path contains Unicode characters.
Unsigned artifact:

`D:\quản lý bán hàng 1\release\HD-Manager-release-8ca9ddd-20260729-unsigned.apk`

Size: `5,117,571` bytes
SHA-256: `D8BB1BE758F56BB798DF024E684082FEAA8353A70529FD576F8815187ACAEB0D`
Signing check: **FAIL / NOT SIGNED** (`jar is unsigned`).

The APK is not ready for a production store release until the existing production keystore and signing variables are supplied. A new keystore was intentionally not generated because it could break update compatibility with installed releases.

## 8. Remaining Risks And Required Follow-up

- Configure the existing Android release keystore (`HD_RELEASE_STORE_FILE`, `HD_RELEASE_STORE_PASSWORD`, `HD_RELEASE_KEY_ALIAS`, `HD_RELEASE_KEY_PASSWORD`) and rebuild/sign the APK.
- Run Android 10-16 tests on representative physical devices; validate ANR, crash, RAM, FPS and WebView stability.
- Resolve the CSS minifier warning without changing UI behavior.
- Address the synthetic performance bottlenecks before claiming the requested 60 FPS at large scale.
- Perform a live SePay transfer and verify QR scan, webhook receipt, reconciliation, notification and debt update end-to-end.
- Configure/run ESLint and TypeScript checks if those quality gates are required by the release policy.

Because the items above are still open, the release is **not reported as fully PASS** for the entire user-requested checklist.
