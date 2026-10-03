# Cleanup Regression Report

## Baseline And Changes

Baseline `4db424a3e511bc2a24162245e7423478da9f89c8`. Import-binding-only runtime cleanup, with a cross-platform CSS assertion correction. No executable AST or module-load order changes in nine affected source files. Package manifests, locks, Firebase configuration/Functions, schemas, security, pricing, inventory, debt and payment logic are unchanged.

## Tests

- npm test: 665 node-runner PASS, 1 SKIP, 0 FAIL; additional custom suites PASS. Core subset remains 436 PASS + 1 SKIP. Subset counts overlap and must not be summed.
- Additional cleanup AST parity: 9 PASS, 0 FAIL. These prove unchanged expressions, handlers, exports and import evaluation order against the pinned baseline.
- lint, explicit audit/parity tooling lint, typecheck: PASS. Repository typecheck scope remains its existing payroll tsconfig; this is not whole-app type proof.
- Initial test failure: machine-line-ending-dependent CSS hash. CSS was unchanged. Fixed by canonical comparison to pinned baseline, not weakening business assertions. Focused test and complete npm test rerun passed.
- Local logs: test-results/safe-cleanup/npm-test-final.log, parity.log, lint-final.log, typecheck.log, build-final.log.

## Critical Flows

78 browser samples, zero failures/errors. Desktop Chrome production-profiling preview, mobile viewport, CPU3x, fixed date 2026-10-02, 240-second parent timeout. No production requests or records were created.

Fixture: 600 products, 364 customers, 1,800 orders, 900 payments, 4,503 requests, 4,303 dispatches. Core open/search/create-save/input/pagination behavior uses the existing harness. Preview save acceptance is not Firebase server ACK acceptance.

Authentication/session/permissions, notifications, customers/products, expenses/payment/ledger, inventory, retry/offline/realtime behavior are covered by existing unit/source-contract suites plus unchanged runtime AST/config. No new real-account login/payment/production-write test was performed. These limitations must not be presented as real Firebase or physical-device certification.

| Flow / action (mean ms) | Baseline | Cleanup |
| --- | ---: | ---: |
| Order Requests open | 486.10 | 486.14 |
| Order Requests save | 470.82 | 480.02 |
| Orders open | 201.16 | 184.56 |
| Orders broad search result ready | 413.67 | 451.20 |
| Dispatch open | 463.02 | 510.28 |
| Dispatch quantity input | 31.12 | 25.22 |
| Dispatch weight input | 11.87 | 12.00 |
| Dispatch preview save | 533.23 | 528.00 |
| Delivery Reports open | 255.42 | 215.52 |

Single-run latency variation is not causal evidence. A second bounded pair reused immutable before/after bundles, sequentially, for Orders and Dispatch only (180-second timeout each). Both completed 58 samples with zero failures/errors. Mean dispatch open was 404.18 -> 401.10 ms (p95 509.10 -> 488.60); Orders open 214.88 -> 178.86 ms; broad search 374.67 -> 382.80 ms; dispatch save 601.63 -> 488.50 ms. The initial dispatch-open slowdown did not reproduce. No consistent material slowdown attributable to cleanup was found; unchanged executable AST strengthens this conclusion. This does not establish device/network performance or statistical equivalence on every workload.

Paired variation retained rather than hidden: customer-search result-ready mean 120.98 -> 144.12 ms, p95 227.00 -> 203.40 ms; product input-paint mean 49.84 -> 72.48 ms, p95 89.60 -> 94.80 ms. No extra optimization or benchmark threshold change was made. Evidence: test-results/full-interaction/cleanup-paired-before and cleanup-paired-after.

## Build And Android

Production web build and Firebase bundle verifier PASS: cloud mode, hd-manager-c5839, no HD Platform runtime markers.

Android assembleRelease PASS using the checked-in Gradle wrapper through Java (avoids Windows batch non-ASCII path issue). Existing signing environment was loaded without logging secrets. No native configuration was edited.

- APK: `release/HD-Manager-1.0.5-safe-cleanup-20261003.apk`, non-empty.
- Package: `com.hdmanager.app`; version `1.0.5`; versionCode `26100202`; min SDK 24; target SDK 36.
- APK v2 signature verified; existing certificate SHA256 `d5c0d0187e27d7909b9024e83287c7a2d3823252dd66a5617351a737261ccb35`.
- No application-debuggable flag. Embedded build ID `safe-cleanup-4db424a3` matches this candidate build.
- APK SHA256 `429C4215D537CE79645A4527E459D61A0A8C5CDC6383CA33C312673E869B75D6`.
- Physical-device installation not performed; no device was available in the preceding release check. This task verifies release packaging/signing, not physical-device UX.

## Final Status

CLEANUP FINAL: PASS for the admitted import-binding cleanup and regression scope above. B candidates remain intentionally unmodified, not certified dead. Real Firebase production interaction and physical-device certification are not claimed. No push and no production deployment.

FINAL_COMMIT: the cleanup commit containing this report (resolved via git log -1 on codex/safe-cleanup-20261003; recorded in the final response). FINAL_TEST_RESULT/FINAL_BUILD_RESULT: PASS. FINAL_FILE_COUNT: 898 after staging six reports, audit script and parity test; source file count remains 196. FINAL_SOURCE_SIZE: 5,925,269 LF-normalized bytes, down 225. REMOVED_FILES/DEPENDENCIES/ASSETS: 0/0/0. Source lines removed: net 1, with 16 old lines replaced by 15.
