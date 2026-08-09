# Code Cleanup Final Report

Audit date: 2026-08-09
Baseline checkpoint: `e123fba chore(cleanup): audit checkpoint before cleanup`
Policy: `SAFE > CLEAN`; only category-A candidates were removed.
Deployment status: local commits only; nothing was pushed or deployed by this audit.

## Executive result

The cleanup removed repository archives, generated reports, local debug artifacts, one-off helper servers, and a small set of declarations whose removal was proven by static dependency checks and regression tests. No business component, route, API, Firebase Function, production dependency, Firebase configuration, authentication flow, payment flow, or persistent data structure was removed.

The source cleanup itself passed lint, typecheck, regression tests, production build, Firestore Rules emulator tests, Android debug/release compilation, and an iOS JavaScript export. Strict final acceptance remains **CONDITIONAL / NO-GO** because native iOS compilation, signed Android release installation, physical-device performance, and a fresh clean-console browser run were not available or not fully verified in this Windows environment.

## Classification outcome

| Class | Result |
| --- | --- |
| A - Definitely dead | Removed in small, independently committed batches |
| B - Probably dead | Retained and listed in `docs/CODE_CLEANUP_REVIEW_REQUIRED.md` |
| C - Possibly used dynamically | Retained: routes, deep links, Firebase handlers, webhooks, environment-driven and native paths |
| D - Required | Retained: production code, preview mocks behind explicit aliases, build/native tooling, tests, operational error logging |

The final strict `no-unused-vars` audit contains 312 retained findings: 311 category-B findings and one intentional category-D omission binding. There are no remaining unused import declarations in that scan.

## Removed items

### Batch 1 - Recovery archives

- Removed `source-archives/` (25 obsolete backup/corrupted source snapshots).
- Removed `code.txt` and two obsolete recovery/deployment ZIP files.
- Replaced the obsolete mock-backend README content with current project information.

### Batch 2 - Generated output

- Untracked 55 historical `test-results/` artifacts; current tests regenerate them.
- Removed generated Expo iOS test output and its Expo Go QR image.

### Batch 3 - Local debug artifacts

- Removed 10 root-level browser/debug screenshots.
- Removed four unreferenced one-off local servers and the one-page `sanity-web` fixture.
- Removed accidental zero-byte shell artifacts, a local export stamp, and an obsolete APK `.idsig` sidecar.
- Updated `.gitignore` with narrow rules for these generated/local artifacts.

### Batch 4 - Proven unused declarations

- Removed 3 unused imports.
- Removed 4 unused helper functions.
- Removed 5 unused constants/derived values and 3 unused bindings/parameters.
- Removed one 80-line unreachable duplicate implementation after an unconditional return.
- Total source reduction in this batch: 141 lines.

No component, route, API, Cloud Function, dependency, CSS selector, production asset, feature flag, environment variable, or migration compatibility path was removed.

## Required cleanup metrics

| Metric | Result |
| --- | ---: |
| Total tracked files scanned | 368 |
| Total files removed | 105 |
| Tracked bytes removed | 79,883,296 bytes |
| Components removed | 0 |
| Functions/helpers removed | 4 |
| Routes removed | 0 |
| APIs/Cloud Functions removed | 0 |
| Dependencies removed | 0 |
| Image assets removed | 11 generated/debug PNG files |
| Debug/local helper files removed | 18 |
| Duplicate implementations removed | 1 |
| Unused imports removed | 3 |
| Current tracked files before final report | 264 |

`Debug/local helper files` includes 10 screenshots, four one-off server scripts, one sanity HTML fixture, and three local/accidental marker files. Generated archives, test reports, Expo output, and recovery source snapshots are reported separately.

## Bundle comparison

| Artifact | Before | After | Difference |
| --- | ---: | ---: | ---: |
| JavaScript | 4,410,663 B | 4,410,637 B | -26 B |
| CSS | 1,300,740 B | 1,300,740 B | 0 B |
| Fonts | 323,564 B | 323,564 B | 0 B |
| HTML | 9,160 B | 9,160 B | 0 B |
| Total `dist` | 6,044,127 B | 6,044,101 B | -26 B |
| Direct dependencies | 35 | 35 | 0 |

The main bundle remains about 2,249.17 kB (586.27 kB gzip). Most removed bytes were repository-only archives and generated reports, so a material runtime bundle reduction was neither expected nor claimed.

## Performance comparison

### Synthetic architecture report

- Before: 1 warning, 7 failed scale points.
- After: 1 warning, 7 failed scale points.
- No measurable cleanup regression; known list/query architecture bottlenecks remain.

### Big synthetic stress run

| Metric | Before | After |
| --- | ---: | ---: |
| Total duration | 346.38 ms | 315.30 ms |
| Peak RSS | 237,572,096 B | 237,518,848 B |
| Heap after GC | 4,321,432 B | 4,320,856 B |
| Event-loop max delay | 29.25 ms | 21.58 ms |
| Estimated FPS | 7.22 | 7.89 |
| Worst frame | 138.59 ms | 126.78 ms |
| Memory leak | No | No |

These are synthetic run-to-run observations, not proof that cleanup caused an improvement. The low estimated FPS remains a performance warning.

### Startup and device measurements

- Prior local development observation: Firebase auth restore about 649 ms; dashboard confirmation about 1,018 ms.
- Comparable post-cleanup cold start, warm start, first UI, time-to-interactive, search, navigation, API, and physical-device memory measurements: **NOT TESTED**.
- The prior startup values are retained only as context and are not presented as a before/after benchmark.

## Quality gates

| Gate | Result | Notes |
| --- | --- | --- |
| `npm install` | PASS | Root and Functions installs completed |
| Lint | PASS | `npm run lint` |
| Typecheck | PASS | `npm run typecheck` |
| Unit/integration/regression | PASS | `npm test`; all suites passed |
| Functions tests | PASS | `npm run test:functions` |
| Design-system tests | PASS | `npm run test:design-system` |
| KPI test | PASS WITH WARNING | Physical-device performance log was unavailable |
| Firestore Rules emulator | PASS | 19/19 payroll Rules cases via Java 21 and ASCII-path junction |
| Production web build | PASS | 2,366 modules transformed in 10.36 s |
| Browser visual smoke | PASS | Authenticated order screen rendered; no white screen |
| Fresh browser console smoke | NOT VERIFIED | Existing tab contained historical HMR logs; clean reload automation was blocked |
| Synthetic performance | WARN | No leak/crash, but scale and FPS bottlenecks remain |
| Android sync | PASS | Capacitor sync completed |
| Android debug build | PASS | V2-signed with Android debug certificate |
| Android release compile | PASS | Output is unsigned; production signing not configured in environment |
| Android device install/runtime | NOT TESTED | No physical/emulated device validation |
| iOS JavaScript export | PASS | Expo iOS bundle exported |
| Native iOS/IPA build | NOT TESTED | Windows environment has no Xcode/signing |

The Firestore Rules command initially failed because Java could not read the Unicode workspace path. Running the same repository through the existing ASCII junction succeeded; the test expectation was corrected from 17 to the actual 19 passing cases.

## Security and configuration audit

- Production dependency audit (`npm audit --omit=dev`): 0 vulnerabilities.
- Functions dependency audit: 0 vulnerabilities.
- Full root audit: 29 development-toolchain advisories (9 high, 19 moderate, 1 low, 0 critical).
- Most advisories are transitive through `eas-cli` and Firebase tooling. The automated npm recommendation includes a breaking `eas-cli` downgrade, so no mass fix or version change was applied during cleanup.
- Secret scan found no committed private key, service-account JSON, or client secret.
- `.env.local` remains untracked; tracked environment examples are retained and all declared Vite variables have repository references.
- Production output did not contain preview seed identifiers. Preview mocks remain required only by explicit `VITE_DATA_MODE=preview` aliases.
- No `debugger` statement was found. Operational `console.warn` and `console.error` calls were retained.
- The one-time default first-login password belongs to the existing forced-password-change identity flow; it was not treated as mock data or removed.

## Review required

The complete symbol-level register is in `docs/CODE_CLEANUP_REVIEW_REQUIRED.md`. High-risk retained areas include:

- Six legacy view implementations in the monolithic dynamic screen graph.
- Strict unused-variable candidates whose initializers may preserve listeners, migrations, fallback behavior, or string-based dispatch.
- `playwright-core`, which may support browser validation outside package scripts.
- Assets referenced through manifests, CSS URLs, Capacitor, Electron, or runtime strings.
- Firebase HTTP/callable/scheduled/trigger functions and all webhook handlers.
- Firestore Rules/indexes, history compatibility, environment variables, native configuration, deep links, and explicit performance/login debug instrumentation.

## Remaining risks

1. `src/App.jsx` remains a very large monolithic file; broad static deletion is unsafe without screen-level runtime coverage.
2. Synthetic performance tests still identify large-list/query bottlenecks and low estimated FPS.
3. A production-signed Android APK/AAB was not produced or installed; the release APK is unsigned.
4. Native iOS compilation/signing and physical-device testing were unavailable.
5. A fresh browser console session was not verified after cleanup.
6. The local Node runtime is v25 while Cloud Functions declare Node 22 and CI uses Node 24; runtime alignment should be handled in a separate DevOps change.
7. Android compilation reports deprecated Capacitor/local-notification APIs and obsolete Java 8 source/target settings; these require a separate compatibility upgrade.
8. Development-toolchain advisories should be addressed in a dedicated, version-controlled dependency-upgrade sprint.

## Final acceptance

- Cleanup safety and repository hygiene: **PASS**.
- Business regression/build/security of production dependencies: **PASS**.
- Performance non-regression claim: **CONDITIONAL** (synthetic tests show no observed regression, but physical measurements are missing and existing warnings remain).
- Full XL.25 acceptance: **NO-GO** until signed Android runtime testing, native iOS testing, physical-device performance, and fresh browser-console validation are completed.

No uncertain code was deleted merely to reduce line count. All remaining uncertain candidates are explicitly marked `REVIEW REQUIRED`.
