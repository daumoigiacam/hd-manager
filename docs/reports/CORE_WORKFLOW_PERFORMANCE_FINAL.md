# Core Workflow Performance - 2026-10-03

## Current Critical-Path Status (Latest Request)

**CRITICAL PATH: PASS for the three scoped preview CPU3x improvement gates.
NOT PRODUCTION/REAL-FIREBASE ACCEPTANCE. NOT RELEASED.**

The latest request supersedes the historical four-workflow/release plan below:
NO PUSH, NO DEPLOY, no full-app audit. Firebase, tenant/permission/authentication,
pricing, stock and financial write contracts are unchanged. No production write
or configuration change was performed. The unrelated port 5179 application was
left running. CPU3x is browser throttling, not a physical Android measurement.

### Critical Path Profile

Same large fixture: 600 products, 364 customers, 1,800 orders, 900 payments,
4,503 requests, 4,303 dispatches. Only request save (5 samples), dispatch save
(3 samples), and delivery open (5 samples) were timed per targeted run.

Final confirmation: `test-results/full-interaction/critical-final-phases/`.
All 13 samples passed; zero page errors/failures. Every run had an independent
180-second supervisor timeout; no full-app benchmark or production benchmark ran.

| Component of measured interaction, P50 ms | Request save | Dispatch save | Delivery open |
| --- | ---: | ---: | ---: |
| UI completion, two frame opportunities | 1018.5 | 572.4 | 334.5 |
| Root React render (nested module timings NOT added again) | 473.0 | 371.8 | 246.4 |
| React commit | 11.7 | 6.0 | 13.8 |
| React remaining/passive effects | 13.7 | 2.2 | 2.4 |
| Instrumented JSON + Storage CPU in preview | 204.6 | 67.5 | 20.2 |
| Real network / Firebase server ACK | NOT MEASURED | NOT MEASURED | NOT MEASURED |

Commit and effect intervals come from the installed profiling React build's
`console.timeStamp("Commit", start, end, ...)` and `Remaining Effects` tracks,
captured by a benchmark-only wrapper. No production React instrumentation added.
The render column comes from the existing root Profiler. Derived calculation runs
inside render and is therefore already included, not an additional latency bucket.
Columns are independent medians and MUST NOT be summed as an exact decomposition.

Source-mapped JS sampling is retained in `critical-after-v3/source-profiles.json`
and raw profiles in both final runs. The first sample additionally records CDP
ScriptDuration/TaskDuration/LayoutDuration/RecalcStyleDuration in `cpuEnvelope`.
Those counters cover the automation action envelope, including automation and
post-readiness work, NOT isolated business CPU. They are intentionally not called
server latency or added to React duration. Per-helper source sampling is attribution,
not an exact timer for each validation/lookup operation.

Persistence remains visible separately: mock setDoc emits state and serializes the
preview database; its SDK duration overlaps render/storage, and is NOT Firebase
ACK. The approximately 205 ms request storage cost was not removed or hidden to
manufacture an apparent production speedup. No preview persistence implementation
was changed in this request.

### Order Save Root Cause

1. Saving one request republished derived lists and sorted their full contents.
   `createIncrementalStableSorter` now retains ordering of unchanged keys and
   merges changed keys, returning CURRENT row objects. It validates tie order,
   falls back on duplicate IDs, and resets per tenant/component lifetime.
   The 4,500-row unit case proves fewer than half the comparisons for one insert.
2. Sales groups were subsequences of an already sorted list but sorted again.
   Merged sheet rows and insertion-ordered customer groups also repeated ordering.
   These redundant sorts were removed; pinned-Git projection parity passes.
3. Status preparation built quantity summaries, labels and issue sorting that its
   consumer never used. `statusesOnly` keeps the same complete alias grouping,
   date/closure filtering and dispatch-row statuses, but omits unused summaries.
4. Root notifications independently built the full detail report on publication.
   `notificationOnly` preserves its two consumed outputs (issue count and latest
   request timestamp) without creating pricing/quantity/status presentation rows.

Validation, source mutation, required persistence and confirmation remain on the
save path. Customer product/preferences followups remain present; no write is
silently dropped, no success is fabricated and no arbitrary success delay added.

### Dispatch Save Root Cause

The visible shortage view and root notification both rebuilt detailed shortage
outputs when a dispatch was published. The notification had no consumer for
quantity totals, display labels or per-request financial fields. That duplicate
detail preparation is eliminated, not merely memoized. Alias accumulation also
no longer creates a new Set and spreads the full alias list for every request item.
The visible shortage view still uses the complete original output contract.

Historical v5 was 640.4 ms versus the original 618.6 ms. Replaying immutable v5
with the focused harness produced 637.2 ms; final is 572.4 ms (580.8 ms in the
preceding confirmation). Thus the regression is no longer present. Profiles
identify repeated shortage label/item/candidate preparation as the removable CPU
work. The historical 21.8 ms difference itself was not isolated to one individual
cache change, so this report does not invent that attribution or call it expected.

The save double-click check still creates exactly one tenant-scoped dispatch,
checks quantities/weight/billing values and unique mutation ID, and verifies exact
recovery after reload. This is mock/local receipt acceptance, not stock-ledger
or Cloud Function acceptance on a live server.

### Delivery Report Root Cause

The resolver eagerly prepared fallback customer configuration and price even when
a source request supplied the winning price. It now evaluates fallback only when
no candidate exists. It also avoids branch configuration for frozen/request pricing
that does not need it. Reconciliation no longer calls calculateBillableAmount when
it will discard that result in favor of a frozen snapshot. Candidate ranking,
source selection, units, frozen values and fallback precedence are unchanged.

### Work Removed

- Repeated full comparison sorts of unchanged request ordering and sorted subgroups.
- Notification-only quantity parsing, billing fields, status row spreading and labels.
- Unused dispatch quantity aggregation and issue presentation in status-only queries.
- Per-item alias Set allocation.
- Eager fallback configuration and discarded frozen-snapshot recalculation.

### Work Deferred

Fallback configuration is now demand-only. No required persistence, stock update,
server operation or customer-default write was moved into a lossy background queue.
Earlier share-on-demand changes remain inherited and are not counted as new work.

### Before/After CPU

These are UI elapsed times under CPU3x, not pure CPU or real network timings.

| Critical path | Task-entry historical P50 | Focused replay of entry v5 | Final confirmation | Change vs task entry |
| --- | ---: | ---: | ---: | ---: |
| Order Request save | 1284.7 ms | 1226.2 ms | 1018.5 ms | -20.7% |
| Warehouse Dispatch save | 640.4 ms | 637.2 ms | 572.4 ms | -10.6% |
| Delivery Report open | 426.5 ms | 389.7 ms | 334.5 ms | -21.6% |

Dispatch is also 7.5% faster than the original 618.6 ms baseline.
Matched replay root render: requests 697.0 -> 473.0 ms; dispatch 437.9 -> 371.8 ms;
delivery 311.3 -> 246.4 ms. Reduced render CPU, unchanged storage contract and
algorithm/parity tests support the result; no best intermediate sample substituted.
The prior final-code run `critical-after-v3` was 985.8 / 580.8 / 346.0 ms.
`critical-final-phases` used the same immutable app with added phase observation.

### Correctness (Current Request)

- 236 business/targeted tests PASS, 0 fail/skip:
  `test-results/critical-business-final.log` (includes the inherited 231).
- 19 save/UX tests plus 6 bounded-harness tests PASS:
  `test-results/critical-save-final.log` (25 total).
- lint PASS: `test-results/critical-lint-final.log`.
- typecheck PASS: `test-results/critical-typecheck.log` (configured payroll scope).
- production build PASS: `test-results/critical-build.log`, 11.35 seconds.
- git diff --check PASS; inherited line-ending warnings only.
- New parity: notification/status modes across aliases, duplicate/missing IDs,
  archive/closure and timestamps; stable sorting across edits/deletes/ties/source
  reorder; actual delivery resolver versus pinned Git plus fallback-call checks.

Business and save suites ran after each implementation batch (critical-business-
v1/v2/v3/v4 and critical-save-v1/v2/v3/v4 logs). No old PASS test was removed.

### Remaining Mandatory Work

The remaining latency still includes current-date/backlog status matching, current
permission overlays, stable presentation order, required billing/source resolution,
required writes and rendering visible rows. These responsibilities cannot be
deleted merely to improve a stopwatch. This is NOT proof that every remaining
implementation instruction is minimal, nor a claim that 1 second feels instant.

Real Firebase network/ACK, physical-device performance and complete production
business smoke remain unverified. They are not relabeled as PASS by this preview
gate. No full-app audit, unrelated-module optimization, production data change,
push, commit, deployment or backend migration was performed.

New changes in this request: App.jsx; incrementalStableSort.js; targeted options
and phase observation in audit-interactions.mjs; warehouse-dispatch-performance
tests; core-incremental-sort/core-delivery-pricing tests; this report. All unrelated
inherited working-tree changes were preserved. HEAD remains 5f162f5c.

## Historical Four-Workflow Status (Superseded Scope)

**IN PROGRESS / PERFORMANCE NOT PASS / NOT RELEASED.** This is the current
evidence register, not a completion or production readiness declaration.
The four-workflow acceptance gate is still open. Do not use individual passing
unit tests, a successful build, or a faster intermediate sample as release approval.

Scope: Order Requests, Orders, Warehouse Dispatch and Delivery Reports only.
Firebase remains the backend. No production data/configuration was changed.
The unrelated application on port 5179 remains running as the owner requested.

## Root Causes

1. Order Request share-only row grouping, fingerprinting and speculative image
   generation competed with list entry and saving, without a share/download action.
2. Dispatch-to-request lookup merged already ordered position lists using a Set,
   a spread and a sort for every candidate lookup.
3. Delivery pricing prepared the same request dates, timestamps, branch metadata
   and item fallback repeatedly while evaluating different dispatch candidates.
4. Shortage reconciliation repeated date construction and candidate filtering for
   request rows with the same timestamp. Full live reconciliation still remains.
5. Unconsumed history/preview/ranking derivations ran eagerly in OrderRequestView.
6. The bounded request-label comparison cache cleared its entire contents at
   saturation, losing hot entries and reallocating nested maps on subsequent sorts.
7. Remaining save-path costs include reconciliation, derived-row sorting and
   publication/render work after a collection mutation. They are not eliminated.

The large-data save CPU profiles also contain preview-only localStorage persistence
and harness getClientRects/Date work. These are not Firebase write latency and must
not be presented as production CPU costs. Do not add sampled self-times to wall
time or interpret a profiler sample as a causal before/after measurement.

## Deleted Work

- Removed the Order Request automatic share warmup event, notifier, post-save
  notifier calls and effect. Explicit share/download still prepare complete assets.
- Removed 139 lines of unconsumed request derivations: historyRequests,
  getHistoryRequestRows, historyRequestGroups, previewSheetRows,
  currentDayRequestSummary and topRequestedProducts.
- Babel binding inspection before deletion showed zero runtime consumers for
  the four terminal projections; the two history helpers only fed the dead group.
  Repository searches showed no import/route/build consumer. Historical test
  coverage now exercises the actual displayed rows, including date selection,
  grouping, billing and historical record edits against the independent Git oracle.
- Removed repeated position sorting from delivery request index lookup.

## Deferred Work

Request share row grouping and fingerprints now run on explicit share/download,
not list entry or saving. Their memoized results are reused until the source rows
change. Asset-cache versioning, complete page validation, pending-promise
deduplication and persistence remain in place.

Inherited cooperative backup/loyalty guards remain; this task did not remove their
durability requirements or claim to solve every background task. Automatic sales
invoice asset warmups and the zero-delay request-memory followup still require
separate critical-path/durability review before any deletion or rescheduling.

## Refactored Work

- Linear merge of sorted ID/name position lists, preserving overlaps, source
  order, duplicate record positions, archive filtering and result ownership.
- Record calculation cache for delivery request metadata, invalidated by record
  replacement, fallback date, customer reference and tenant lifetime.
- Per-calculation date timestamp cache, bounded to 256 entries with uncached
  fallback beyond capacity. Start/end-of-day values remain distinct.
- One-entry dispatch-match reuse for adjacent sorted request timestamps. Output
  dispatch ID arrays remain independent. No quantity/status survives a calculation.
- Comparison cache stops admitting new pairs at capacity instead of clearing hot
  entries. Uncached comparisons still call the same Intl comparator exactly.
- Added lint coverage for the core tests and delivery request index tests.

## Measurement Contract

Matched BEFORE: `test-results/full-interaction/core-actions-before-v1/summary.json`.
Current AFTER: `test-results/full-interaction/core-actions-after-v5/summary.json`.
Both contain 76 samples: 600 products, 364 customers, 1,800 orders, 900 payments,
4,503 requests and 4,303 dispatches after the same isolated fixture additions.
Fixed day: 2026-10-02. Desktop Chromium, mobile viewport, CPU3x, production React
profiling build, preview storage. **Not a physical Android or cloud ACK acceptance.**
Open/input/save rows generally have five repetitions; report cashflow has three
and standalone expense one. Median wall/frame-opportunity and React render
durations below are not pure CPU measurements or compositor-paint guarantees.
The machine is not CPU-isolated. Unfavorable observations remain in the record;
contention is a limitation, not a reason to declare a regression expected or PASS.

## Đơn đặt Before/After

| Action | BEFORE P50 ms | Current AFTER P50 ms | Render BEFORE/AFTER ms |
| --- | ---: | ---: | ---: |
| Open | 560.7 | 591.2 | 368.3 / 393.5 |
| Open create | 142.5 | 135.8 | 6.1 / 6.6 |
| Save create, local acceptance | 1322.6 | 1284.7 | 766.9 / 727.6 |

NOT PASS: opening is slower in the final measured run and saving remains far above
the target. Edit, price-change and dedicated request search timing coverage remains
incomplete; projection/correctness tests are not a substitute for UI measurements.

## Đơn hàng Before/After

| Action | BEFORE P50 ms | Current AFTER P50 ms | Render BEFORE/AFTER ms |
| --- | ---: | ---: | ---: |
| Open | 159.7 | 196.2 | 62.7 / 79.7 |
| Last page | 27.0 | 29.7 | 2.0 / 1.9 |

Open is below 200 ms in this run, but full module PASS is unproven: dedicated
search/create/edit/save/reload timing and real ACK coverage are still required.

## Xuất kho Before/After

| Action | BEFORE P50 ms | Current AFTER P50 ms | Render BEFORE/AFTER ms |
| --- | ---: | ---: | ---: |
| Open | 350.9 | 356.5 | 253.0 / 259.9 |
| Select customer | 12.4 | 13.7 | 3.3 / 3.7 |
| Quantity input | 25.0 | 21.8 | 2.2 / 1.9 |
| Weight input | 8.7 | 8.7 | 0.3 / 0.4 |
| Save, local receipt | 618.6 | 640.4 | 430.2 / 445.8 |
| Customer search result ready v1 | 153.4 | 159.3 | 3.1 / 3.8 |
| Product search result ready v1 | 154.6 | 159.2 | 3.1 / 3.5 |

Input/search satisfy their wall-response targets in this isolated run. Open and
save do not. Save regression is retained, not hidden behind a spinner or a mock ACK.
These local receipt observations do not measure Firebase-confirmed inventory writes.

## Báo cáo giao hàng Before/After

| Action | BEFORE P50 ms | Current AFTER P50 ms | Render BEFORE/AFTER ms |
| --- | ---: | ---: | ---: |
| Open | 516.4 | 426.5 | 440.3 / 360.9 |
| Cashflow save/double tap | 224.0 | 224.4 | 97.1 / 95.7 |
| Standalone expense | 173.6 | 182.4 | 44.0 / 42.0 |

Opening improved in this run but still exceeds the target. Filter/search/date-range
UI timing coverage is incomplete. Financial/reconciliation unit parity is covered,
not production report acceptance.

## CPU Reduction

Proven work-count reductions, not claimed total CPU percentages:
- 300 same-timestamp rows x 100 candidate dispatches: 30,000 predicate checks in
  the pinned Git algorithm versus 100 in the current calculation; full output parity.
- 301 date-fallback records on one date: two Date constructions, with distinct
  midnight/end-of-day results. New calls build fresh caches; invalid dates retain zero.
- 100 metadata accesses for one immutable record/context: one date parse.
- No share-row/fingerprint scan before explicit share/download.
- Long-tail comparison test retains hot pairs at saturation without cache flushing.

No claim that all four workflows are faster. Intermediate after-v2 was faster on
some actions than the final run; it is not substituted for current evidence.

## Render Reduction

See per-action tables. Delivery report open render median fell from 440.3 to
360.9 ms. Request save fell from 766.9 to 727.6 ms. Request open and dispatch
save render duration regressed. Render counts were not independently summarized;
render duration must not be described as number of renders eliminated.

## Data Scan Reduction

Share-only foreground scans and dead projection scans were removed. Candidate
union no longer sorts positions. Same-timestamp dispatch predicates are reused.
Full shortage reconciliation and some derived sorts still scan their collections;
this acceptance requirement is not fully met.

## Persistence Reduction

No new production persistence optimization in this task. Durable save/ACK checks
remain. The inherited preview serializer is test infrastructure, not proof of
production localStorage or Firebase performance. Save profile samples include
preview setItem; production persistence/ACK still needs separate measurement.

## Background Work Removed

Only speculative Order Request image warmup was removed in this task. Required
write confirmation, retry/tenant protection, notifications and financial effects
were retained. All-background-work-removed is NOT asserted.

## Correctness

Current scoped regression: **231 PASS, 0 FAIL, 0 skipped**, with per-test finite
30-second timeout. Evidence: `test-results/core-business-regression-final.log`.
Includes actual-source/pinned-Git calculation parity, request projections and
historical edits, stock/index/immutability, search/debounce, maintenance scheduling,
REST integration/pagination, delivery metadata, request on-demand sharing and
dispatch request index. New tests check overflow, invalid dates, duplicate/missing
IDs, tied timestamps and independent output arrays.

Additional final save/UX/share/pricing/dispatch-create checks: **19 PASS, 0 FAIL,
0 skipped**, recorded in `test-results/core-final-save-ux.log`, using the same
30-second per-test limit. No real Firebase create/edit/save/reload, physical device or production
mutation was run. Do not interpret preview mock acceptance as real server success.

Lint PASS: `test-results/core-final-lint.log`.
Typecheck PASS: `test-results/core-final-typecheck.log`; configured payroll scope,
not a claim of full-App static type coverage.
Production build PASS: `test-results/core-final-build.log`, 11.57 seconds.
Main bundle remains 2,480.10 kB / 671.75 kB gzip; no full bundle-splitting claim.
`git diff --check` PASS; line-ending warnings are not whitespace test failures.

## Full Regression

NOT RUN: the owner requires full regression only after the four workflow gates
PASS. Scoped regression is not relabeled as full application regression.

## Benchmark Infrastructure

All new browser audits used the inherited bounded supervisor: 180 seconds for
four-workflow comparisons, 120 seconds for save profiles, 90 seconds for the
earlier open profile. Completed runs contain deadline-status.json. No full
23-screen audit was run. No active benchmark process remains after collection.

Artifacts retained: core-workflow-before-v1; core-actions-before-v1;
core-actions-after-v1/v2/v4/v5; core-shortage-after-v3; core-hotpath-profile-v1;
core-large-save-profile-v4. Large-save profiles and their source mapping are in
`test-results/full-interaction/core-large-save-profile-v4/`.

The initial `core-save-profile-v4` omitted the stress-fixture flag and consequently
had only one base request. Its small-data save timings are EXCLUDED from large-data
acceptance. Corrected `core-large-save-profile-v4` explicitly restores the stress
fixture. This is a harness configuration mistake, not evidence of faster production.

## Git Commit

Current HEAD: `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.
Branch: `codex/final-22-module-audit-20261002`.
No commit created for this task. Inherited modified/untracked work is preserved;
the entire working-tree diff must not be attributed to this task.

This task touched App.jsx, deliveryRequestIndex.js, collationCompareCache.js,
eslint.config.js, their related tests, and this report. Two new focused tests are
core-delivery-metadata.test.mjs and core-workflow-on-demand-share.test.mjs.
See PERFORMANCE_TAKEOVER_20261003.md for inherited file ownership/status evidence.

## Push Main

NOT RUN. Conditional permission does not authorize releasing failed performance
gates or implicitly approving all inherited dependency/workflow changes.

## Production Deployment

NOT RUN. Firebase architecture, production data and backend configuration remain
unchanged. No HD Platform migration.

## Production Smoke Test

NOT RUN: no production release was made.

## Remaining Work

1. Reduce live reconciliation/row sorting on request and dispatch publication,
   with independent full-output parity, not stale summaries or altered statuses.
2. Complete per-record invalidation across navigation/remounts without weakening
   tenant/permission boundaries or draft/reset behavior.
3. Review invoice warmup and request-memory followups for durable deferred work;
   do not discard required customer defaults, payment preparation or confirmations.
4. Measure missing create/edit/search/price/filter/date-range/reload UI actions.
5. Separate input/frame, required persistence and real Firebase ACK latency.
6. Recheck four workflow gates, then full regression, build, commit/push main,
   release and production smoke in the owner's required order.

There is no architecture migration or production-data write requested to overcome
these remaining code/measurement gaps. They remain technical work, not PASS.
