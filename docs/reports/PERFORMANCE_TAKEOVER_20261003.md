# Performance Takeover - 2026-10-03

## Current Git State

TAKEOVER: PASS for a tested, preserved local working state and bounded audit harness. This is NOT full performance acceptance, production acceptance or release approval.

- Branch: `codex/final-22-module-audit-20261002`.
- HEAD: `5f162f5ce85fd4dc746382f13a6a4170e4a29775` (unchanged).
- Tracking branch was one commit behind local HEAD. No commit, push or deployment in this takeover.
- Required initial commands completed: status, branch, log -10, diff --stat, diff --name-only.
- Initial tree: 24 modified tracked files, 2,015 insertions / 354 deletions, plus untracked files listed below. All changes unstaged; no deleted files.
- Final tree: 24 modified tracked files and 72 untracked files, intentionally dirty, all unstaged. Existing changes are not lost. Takeover adds `docs/reports/PERFORMANCE_TAKEOVER_20261003.md`, a supervisor helper and its tests; it also edits the audit entry point and ESLint coverage.
- No reset, clean, checkout, forced push, migration, production write or Firebase configuration change.

## Pre-existing Changes

Phase 0 records the baseline dirty state at the same HEAD: `scripts/audit-interactions.mjs` and `tests/visual/interaction-action-cases.mjs` had seven insertions/four deletions before the performance phases. Preserve those harness changes. These three files also predated Phase 0:

```
docs/reports/FULL_APP_PERFORMANCE_105_2026_10_02.md
scripts/analyze-audit-source-profiles.mjs
scripts/report-full-app-105-audit.mjs
```

Existing commits include 5f162f5c, c17bec70, d4262219, 768a196e, f136e619, 2f355798, 5cd87112, 284aeab8, 1327b074 and 488ca740. They were not made by this takeover. Interrupted performance work is uncommitted, not a new commit. There is no complete start-of-eight-hours patch snapshot, so exact per-hunk ownership within that interval cannot be reconstructed honestly. Phase reports distinguish earlier Phase 1/2A work from later candidates; timestamps alone are not proof of authorship.

## Changes From Interrupted Task

Inherited candidates include normalization/derived-record caches, stock indexes, snapshot identity reuse, REST scan pagination, scheduling/input guards, prepared search indexes, preview serialization and expanded test/report infrastructure. The current candidate contains the v12 per-call empty closed-key Set optimization. No runtime source was changed during this takeover.

Evidence reviewed: Phase 0, Phase 1 main-thread and regression reports, removed-work register, Phase 2 deferred register, inherited PASS register, Phase 2A storage/report/regression evidence, master read-scope/measurement protocol, final refactor status and hot-path/background/storage/calculation inventories. Earlier broad runs are historical evidence, not new acceptance tests.

## GOOD Changes

Classification A means keep on the evidence available, not a guarantee for every production record. Each inherited runtime file is accounted for below. Immutable-record cache contracts remain important.

| File | Class | Reason |
| --- | --- | --- |
| src/App.jsx | A, with B performance limitations | Focused calculation parity, shortage aliases, closed/reopened keys, lookup and stock tests pass. No takeover rewrite. Measured three opening regressions do not recur. Save/end-to-end production performance remains unproven. |
| src/design-system/foundation.css | A | Product/customer floating controls reserve footer space; functional obstruction fix, not claimed speedup. |
| src/mocks/firebase-firestore.js | A | Preview-only serializer integration; persistence/recovery tests pass, not cloud optimization. |
| src/mocks/preview-store-serializer.js | A | Preserves single legacy envelope and duplicate-write verification; identity cache assumes replaced collections. |
| src/services/cooperativeTaskQueue.js | A | Bounded cooperative scheduling and input guards; scheduling tests pass. |
| src/services/customerProductBilling.js | A | Bounded primitive text normalization cache; billing normalization parity passes, no amount formula change. |
| src/services/productPricingUnits.js | A | Same normalization formula with bounded text cache; unit parity passes. |
| src/services/realtimeListenerPlanner.js | A | Workspace listener scope, required sources retained; targeted coverage passes. |
| src/services/renderOptimization.js | A | Identity-based dependency support with focused parity tests. |
| src/services/searchEngine.js | A, with B latency limitation | Indexed candidate selection keeps ranking verification; search parity passes. Debounced result readiness is still slower. |
| src/services/backupReadScheduler.js | A | Chunked/deferred reads tested; no backup/restore business rule change. |
| src/services/collationCompareCache.js | A | Bounded comparator reuse; equivalence tests pass. |
| src/services/firestoreRestPagination.js | A, limited acceptance | Pinned-read-time/name cursors, complete drain, abort/generation guards tested locally; not server-visible UI pagination or fresh staging acceptance. |
| src/services/realtimeSnapshotItems.js | A | Incremental snapshot decoding and fallback behavior covered. |
| src/services/recordCalculationCache.js | A | Record/context identity invalidation covered; cannot mutate published records in place. |
| src/utils/collectionIdentity.js | A | Stable identities with fallback contracts covered. |
| src/utils/productMeasures.js | A | Product-object/unit stock index preserves record subtotal accumulation order; numerical parity tests pass. |
| src/utils/firstRecordLookup.js | A | First-match semantics and duplicates covered. |
| src/utils/incrementalProductStock.js | A | Incremental/history stock parity passes; business quantities unchanged. |
| vite.config.js | A | Ignore generated Gradle/test artifacts to prevent dev reload loops; not production data change. |

## NEEDS FIX

- `functions/package.json` and `functions/package-lock.json`: B. Inherited dependency/override churn is not a performance optimization. Retained, not reverted without ownership evidence; requires separate dependency/security and Functions runtime verification before release. This takeover does not deploy Functions.
- Search result readiness: existing leading 160 ms debounce creates measured delay even though input paint/render improve. Keep separately registered; not silently call this smooth or attribute it to machine noise.
- Large App/bundle, save latency and production staging parity are not closed by three-screen opening tests.
- Historical profile instrumentation overlaps event timing; large profile JSON is not isolated app cost. Do not sum render/storage stages or credit harness work as production speedup.

## UNSAFE Changes

No definite business-semantic regression was established in the examined candidates/tests, so no inherited code was deleted speculatively. This is not universal safety certification. Inventory, pricing, debt/payment, tenant and security contracts require production/staging acceptance before release; no rule changes were made here. Historical experiments already rejected before takeover (v6/v8/v11) are not claimed as takeover reversions.

## Benchmark Problems

Interrupted command: `node scripts/audit-interactions.mjs master-full-before-v13`, with CPU profiles, include-actions, dispatch stress/save, storage profile, master fixtures, fixed 2026-10-02 date, 30,000 ms action timeout, reused `phase2a-final-after` build.

- Observed node PID 32288; old session 68801 ultimately exited 1. It was not restarted. No infinite action loop was demonstrated.
- It recorded 933 samples, zero page errors and one customer floating-button obstruction. Playwright repeatedly retries an intercepted click within the finite 30-second action timeout.
- Finite screen/repetition/profile loops can nevertheless be very long: 23 screens, multiple CPU profiles, five repetitions, many actions, storage instrumentation and large profile JSON. There was no total wall-clock deadline. Exact attribution of all eight hours cannot be reconstructed from these logs.
- Separate app on 5179 remains running as requested; competing CPU load limits timing confidence. No intervention in that project.
- Added `scripts/helpers/bounded-audit-process.mjs`: independent parent deadline, persisted progress/status, cooperative browser/server cleanup, then exact child-node termination after grace. Default 5 minutes, upper bound 15 minutes; takeover benchmarks explicitly use 3 minutes. No broad process-tree kill.
- First takeover attempt completed 50 samples but the new IPC message listener held the child open. It was stopped as an exact verified process; that attempt is FAILED, not PASS. Added final IPC disconnect and a regression test. Corrected BEFORE and AFTER both exited 0 normally.
- Timeout tests exercise a synchronous infinite-loop fixture and unresolved timer fixture safely: both return 124 and retain TIMEOUT evidence. Application benchmark loops are not made infinite.
- This bounds the audit entry point used here, not a claim that every historical standalone script was retrofitted. No other benchmark script was run during takeover.

## Tests Run

- `npm run lint`.
- `npm run typecheck` (configured payroll TypeScript scope, not all App JavaScript).
- Relevant unit/integration batch: supervisor, REST integration/pagination, snapshot items, calculation/request-cache/stock/history parity, scheduling/maintenance/backup, search index/debounce, preview storage, warehouse performance contracts, hidden report.
- Supplementary batch: supervisor IPC cleanup, billing/pricing normalization, collation/record/primitive caches, lookup, dev-watch, inventory dependencies/read scope and workflow tests.
- `npm run build`.
- `git diff --check`.
- Only three-screen CPU3x paired benchmark. No full 23-screen rerun, test:all, production write or deployment.

## Test Results

| Check | Result | Evidence |
| --- | --- | --- |
| Lint | PASS exit 0 | test-results/takeover-lint.log |
| Typecheck | PASS exit 0, scoped | test-results/takeover-typecheck.log |
| Relevant tests | 305 PASS, zero fail/skip | test-results/takeover-relevant-tests.log |
| Supplementary tests | 47 PASS, zero fail/skip | test-results/takeover-supplementary-tests.log |
| Build | PASS, 41.49 seconds | test-results/takeover-build.log |
| Diff whitespace | PASS exit 0 | CRLF conversion warnings only |
| Targeted BEFORE | PASS 50 samples, zero failures/errors, exit 0, 27.323 seconds | test-results/full-interaction/takeover-phase1-before-v2/ |
| Targeted AFTER | PASS 50 samples, zero failures/errors, exit 0, 48.985 seconds including build | test-results/full-interaction/takeover-phase1-after-v1/ |

Six supervisor tests are included in the supplementary 47. The earlier 305 contains the original five; totals are test executions, not 352 unique tests. No fresh real Firebase Emulator/staging acceptance was run; earlier emulator evidence remains historical.

## Performance Evidence

Same current harness, isolated preview fixtures (600 products / 360 customers / 1,800 orders / 900 payments / 4,500 requests / 4,300 dispatches), fixed date, Chrome production profiling build, CPU3x/mobile viewport, five repetitions. BEFORE reuses immutable `phase1-target-before`; AFTER builds current source. No physical-device or Firebase ACK latency claim.

| Action | BEFORE P50 ms | Current P50 ms | Assessment |
| --- | ---: | ---: | --- |
| Order Requests open | 988.6 | 766.4 | Improved in paired run |
| Dispatch open | 701.6 | 400.9 | Improved in paired run |
| Products open | 540.9 | 228.0 | Improved in paired run |
| Dispatch customer input, legacy | 73.8 | 18.7 | Improved |
| Dispatch quantity input | 23.9 | 29.5 | +5.6 ms; not called a speedup |
| Customer search input readiness v1 | 51.8 | 14.6 | Improved input response |
| Customer search result readiness v1 | 52.0 | 159.8 | Slower; debounce boundary |
| Product search input readiness v1 | 59.4 | 14.1 | Improved input response |
| Product search result readiness v1 | 59.7 | 162.2 | Slower; debounce boundary |

Two-frame readiness is not compositor paint. Small sample count and concurrent independent app limit generalization. Build reports main JS 2,483.29 kB / gzip 672.43 kB: size remains a future performance concern. No new optimization opened to remove it here.

## Phase 1 Regression Status

Historical CPU3x Phase 1 before/after openings were requests 819.9 -> 1,053.1 (+28.4%), dispatch 409.2 -> 517.4 (+26.4%), products 393.7 -> 479.5 (+21.8%). Their original causal attribution was not established. They are not dismissed as expected. Current matched rerun above does not reproduce those three opening regressions; current request/stock/shortage/index work lowers observed render work. This does not retroactively amend the historical report or prove a single isolated cause. Search result delay remains separately B, not hidden by opening improvements.

## Files Kept

All initial tracked runtime files appear in the classification table. The remaining modified files below are D (test/build infrastructure only), not runtime speedups:

```
.github/workflows/deploy.yml
eslint.config.js
package.json
scripts/audit-interactions.mjs
tests/helpers/app-source-function.mjs
tests/production-deploy-workflow.test.mjs
tests/realtime-listener-planner.test.mjs
tests/shared-hotpaths.test.mjs
tests/visual/interaction-action-cases.mjs
tests/warehouse-dispatch-performance.test.mjs
```

All initial new runtime files appear in the classification table. These initial new report files are each D; historical claims remain subject to their explicit limits:

```
docs/reports/BACKGROUND_JOB_AUDIT.md
docs/reports/CALCULATION_HOTPATH_MAP.md
docs/reports/DEAD_CODE_CANDIDATE_REGISTER.md
docs/reports/FINAL_PERFORMANCE_REFACTOR_REPORT.md
docs/reports/FULL_APP_PERFORMANCE_105_2026_10_02.md
docs/reports/INHERITED_PASS_REGISTER.md
docs/reports/LOCAL_DATA_STORAGE_AUDIT.md
docs/reports/MASTER_PAGINATION_READ_SCOPE.md
docs/reports/MASTER_PERFORMANCE_MEASUREMENT_PROTOCOL.md
docs/reports/PAGINATION_SEARCH_AUDIT.md
docs/reports/PERFORMANCE_DATA_FLOW_MAP.md
docs/reports/PERFORMANCE_HOT_PATH_REGISTER.md
docs/reports/PERFORMANCE_PHASE1_MAIN_THREAD_REPORT.md
docs/reports/PERFORMANCE_REFACTOR_PHASE0.md
docs/reports/PHASE1_REGRESSION_REPORT.md
docs/reports/PHASE1_REMOVED_WORK_REGISTER.md
docs/reports/PHASE2A_REGRESSION_REPORT.md
docs/reports/PHASE2A_STORAGE_BASELINE.md
docs/reports/PHASE2A_STORAGE_REPORT.md
docs/reports/PHASE2_DEFERRED_REGISTER.md
```

Initial new scripts, each D; retained, not all rerun:

```
scripts/analyze-audit-source-profiles.mjs
scripts/benchmark-phase2a-storage.mjs
scripts/compare-master-performance.mjs
scripts/compare-phase1-audit.mjs
scripts/compare-phase2a-storage.mjs
scripts/helpers/master-emulator-ui-crud.mjs
scripts/master-emulator-session-regression.mjs
scripts/master-production-release-smoke.mjs
scripts/master-session-regression.mjs
scripts/report-full-app-105-audit.mjs
scripts/test-phase2a-browser-recovery.mjs
```

Initial new tests, each D; passing tests are evidence, not production optimizations:

```
tests/helpers/preview-storage-harness.mjs
tests/master-app-calculation-parity.test.mjs
tests/master-background-scheduling.test.mjs
tests/master-backup-scheduling.test.mjs
tests/master-billing-normalization-parity.test.mjs
tests/master-collation-compare-cache.test.mjs
tests/master-compatibility-maintenance.test.mjs
tests/master-dev-watch.test.mjs
tests/master-emulator-session-regression.test.mjs
tests/master-emulator-ui-crud.test.mjs
tests/master-incremental-stock.test.mjs
tests/master-interactive-read-scope.test.mjs
tests/master-inventory-history-parity.test.mjs
tests/master-inventory-render-dependencies.test.mjs
tests/master-order-request-derived-cache.test.mjs
tests/master-performance-comparison.test.mjs
tests/master-pricing-normalization-parity.test.mjs
tests/master-primitive-normalization-cache.test.mjs
tests/master-product-stock-index.test.mjs
tests/master-production-release-smoke.test.mjs
tests/master-realtime-snapshot-items.test.mjs
tests/master-record-calculation-cache.test.mjs
tests/master-request-lookup.test.mjs
tests/master-rest-emulator.test.mjs
tests/master-rest-integration.test.mjs
tests/master-rest-pagination.test.mjs
tests/master-search-debounce.test.mjs
tests/master-search-index.test.mjs
tests/phase1-hidden-report.test.mjs
tests/phase2a-preview-storage.test.mjs
```

Takeover-only new files (D): this report, `scripts/helpers/bounded-audit-process.mjs`, `tests/takeover-bounded-audit.test.mjs`. Takeover-only edits: audit supervisor/progress/cleanup wiring and ESLint inclusion. Generated test-results remain local artifacts, not release changes.

## Files Reverted/Removed

None. Removed the introduced IPC keepalive behavior by disconnecting at completed cleanup; did not remove inherited files or overwrite earlier changes. Interrupted/failed evidence is retained, not relabeled PASS.

## Remaining Work

1. Review inherited Functions dependency overrides and verify runtime separately before release.
2. Decide/verify the search-result debounce responsiveness requirement without changing business semantics.
3. Complete bounded save/ACK, real staging parity and production-like tenant/security acceptance in a separately authorized task.
4. Large bundle and slow save paths remain registered; no full-app or physical-device smoothness claim.
5. Preserve separate 5179 application. No production deploy, push, backend migration or benchmark expansion in this takeover.
