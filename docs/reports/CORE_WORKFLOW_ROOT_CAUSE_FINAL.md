# Core Workflow Root Cause Final Evidence

Date: 2026-10-03

SOURCE-LEVEL ROOT CAUSE ELIMINATION: NOT PASS

This is a truthful checkpoint of implemented and verified fixes, not a claim that
the entire requested final gate has been completed. Remaining items below are client
source work, not a Firebase/FPS permission blocker.

## Concrete Causes and Fixes

1. Dispatch quantity typing previously revisited historical table JSX because the
   draft was owned by WarehouseDispatchView alongside that table. `src/App.jsx` now
   passes stable visible groups/current callbacks to `DispatchTableBody.jsx`.
   Quantity input performs a local draft update; the measured path has no overlapping
   long task. This does not mean cold dispatch mount or save is equally fast.
2. Orders first search blocked while field normalization/index preparation and
   repeated product catalog lookup ran on the synchronous query path.
   `searchEngine.js` now builds cooperatively; `usePreparedSearch.js` owns cancellation;
   `OrderSearchInput.jsx` owns transient text. Valid product IDs use a first-match Map.
   The measured cold query went from608.2 to282.1-286.7 ms, including250 ms debounce,
   with the observed298 ms long-task overlap removed. The earlier434 ms observation
   belongs to the inherited run, not the paired608.2 ms sample.
3. Saving an Order Request still invalidates large shortage/status projections in
   `buildWarehouseDispatchShortageSummary` and the local preview store's `persistStore`.
   Repeated alias construction/timestamp filtering and unnecessary notification sort
   were removed, preserving independent quantities/status/dispatch IDs. Full projection
   work still exists. Preview setItem sampling197-218 ms cannot be called Firebase ACK.
4. Delivery opening called `calculateDispatchOrderRequestPrice` for current-day rows
   and prepared/sorted all historical price candidates. It now uses stable one-pass
   selection, exact-ID bypass, record/context caches and winner-only unit configuration.
   Full day group preparation is still synchronous; the remaining cold-open long tasks
   prevent marking the Delivery gate PASS.
5. Request quantity/price/note renders also searched hidden customer/product pickers
   in primary, detail and legacy form branches. All closed branches are now guarded;
   product variant matching reuses a catalog index/membership Set. Actual request
   quantity median dropped from31.4 to20.7 ms in the final focused run (not an
   exclusive CPU measurement or a claim for every input/device).

## Measurements

Local Chrome production profiling,390x844,CPU3x. Fixed business date2026-10-02.
Dataset:364 customers,600 products,1800 orders,900 payments,4503 requests,4303 dispatches.
Other applications, including localhost5179, remained running. Host contention was
not eliminated. Browser automation/visibility/frames are included in envelopes.

| Path | Before median ms | Latest measured median ms | Latest max ms | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Orders cold exact query | 608.2 | 286.7 | 286.7 | root-core-final; includes250 ms debounce; no overlapping long task |
| Dispatch quantity | 27.6 | 26.5 | 44.3 | root-source-verified; five samples; no overlapping long task |
| Dispatch kg | not paired | 13.2 | 13.9 | three samples; current draft only |
| Request quantity, one character | 31.4 | 20.7 | 21.3 | root-request-picker-final; five samples; no overlapping long task |
| Request customer, one character | 187.8 | 199.0 | 200.3 | final focused envelope; module render median16 ms; not latency PASS |
| Request product, one character | 159.7 | 128.2 | 157.2 | final focused envelope; module render median8.1 ms |
| Request save | 1103.3 | 1043.7 | 1123.3 | local preview receipt, not Firebase ACK; render median442.9 ms |
| Dispatch save | 699.0 | 637.2 | 770.3 | intercepted local atomic endpoint, not Firebase ACK |
| Delivery open | 465.4 | 420.4 | 582.5 | five samples; long tasks remain |
| Request screen open | 591.7 | 665.4 | 739.9 | not a regression-free screen gate |
| Orders screen open | 202.9 | 262.9 | 416.9 | index work bounded but total-open median not improved |
| Dispatch screen open | 389.6 | 434.7 | 1439.8 | cold outlier retained; no universal mount PASS |
| Delivery compound save | not paired | 254.3 | 265.9 | three local double-tap cases preserve atomic behavior |

Different before/after runs are evidence, not a clean randomized causal experiment.
Final request guards were added AFTER the four-flow build; only the final request-only
run measures them. Do not mix build revisions to claim an improvement.

## Artifacts and Deadlines

- `root-cause-before`: immutable inherited bundle,88 samples, zero errors/failures.
- `root-cause-after`: intermediate timer-clamp regression retained, not discarded.
- `root-search-final`: targeted Orders query verification,120 s deadline.
- `root-core-final`: four modules,88 samples,240 s deadline.
- `root-request-final`: request table extraction verification,120 s deadline.
- `root-request-inputs`: physical character cases before closed-picker guards.
- `root-source-verified`:91 samples, zero errors/failures;240 s deadline;
  completed107972 ms, includes earlier customer/product focus envelope.
- `root-request-focused-input`:25 samples, zero errors/failures;120 s deadline;
  same immutable build; focus moved outside character action. A concurrent build was
  started during part of this diagnostic, so it is not treated as an uncontended baseline.
- `root-request-picker-final`: latest request source,25 samples, zero errors/failures;
 120 s deadline, no concurrent test/build intentionally started during browser actions.

Directories are under `test-results/full-interaction/`. JSON, profiles and deadline
status remain available locally. Profiles' runtime `(program)`, layout queries and
profiling callbacks include harness/browser work; do not assign those to pricing.
No full-app benchmark, cloud fixture, native FPS test or production write was run.

## Correctness and Tests

- Targeted master/core/business regression superset:417 tests,416 PASS,0 FAIL,1 SKIP.
  Log: `test-results/root-source-unit.log`.
  Skipped: explicit opt-in local REST emulator test (`MASTER_REST_EMULATOR=1`), not
  represented as a pass or as real Firebase verification.
- Save/UX regression:19 PASS,0 FAIL; includes34 request UX assertions and billing
  script scenarios. Log: `test-results/root-source-save-ux.log`.
- Additional save integrity/search/harness:46 PASS,0 FAIL.
  Log: `test-results/root-source-integrity.log`.
- Product/customer closed-picker tests verify no hidden scan;600-product membership
  agrees with original single-product search for aliases/numeric/multiword queries.
- Delivery pricing agrees with pinned Git5f original across frozen/legacy and40
  multi-candidate fixtures. Forty tied candidates still select first; only winner's
  legacy unit configuration is resolved.
- Shortage full output equals pinned Git5f oracle across aliases, dates, archives,
  duplicate IDs and live mutations. No cache retains stock/money/quantity/status.
- Search5k/10k/50k: cooperative construction, cancellation and exact-query parity.
  These tests are NOT50k broad-query DOM/latency acceptance.
- Lint PASS, including explicit new component/hook/service files.
- Typecheck PASS (`tsconfig.payroll.json`); this is the repository's configured scope,
  not a claim that all85k lines of App.jsx have static type coverage.
- Production build PASS; no deployment.

## Gate

| Requirement | Status |
| --- | --- |
| Measured cold Orders search blocking build removed | PASS for measured query |
| Dispatch quantity avoids full recomputation | PASS for tested path |
| Hidden request picker work removed | PASS source/parity and quantity verification |
| Reconciliation quantity/status correctness | PASS tested oracle fixtures |
| Delivery candidate selection/pricing correctness | PASS tested oracle fixtures |
| Order save unnecessary CPU fully eliminated | NOT PASS |
| All form/history render boundaries isolated | NOT PASS |
| All cold Delivery/Request/Dispatch long tasks eliminated | NOT PASS |
| Broad50k query and strict row/DOM bounding | NOT PASS |
| Every requested price/note/search input individually measured | NOT COMPLETE |
| Exact per-character render/function/allocation counts | NOT COMPLETE |
| Lifecycle tests for new search/subscribers/timers | PASS targeted scope |
| No native leaks across entire application | UNMEASURED, no such claim |
| Regression, lint, configured typecheck, build | PASS within recorded scope |

## Remaining Source Work

1. Isolate OrderManagementView historical cards from draft fields without capturing
   stale permission/payment/edit handlers; measure quantity/price/note separately.
2. Make shortage projection updates affected-source incremental with full oracle
   parity, not a blanket removal of reconciliation or duplicate detection.
3. Bound Delivery cold reconciliation preparation and strict row work while preserving
   historical source priority; opening only today does not justify discarding older requests.
4. Complete broad-query scoring/result window strategy; preserve global ranking and
   access to all rows. Customer group paging alone is not strict row virtualization.
5. Capture exact application event-to-UI and per-component call counts for all listed
   inputs, separate from automation envelope. Do not attribute unassigned runtime time.

No production credential, device or Firebase blocker prevents these client tasks.
They are unfinished implementation/verification work, explicitly not PASS.

## Git and Safety

Branch: `codex/final-22-module-audit-20261002`.
HEAD unchanged: `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.
Working tree retains extensive interrupted-task changes. Git diff totals include
pre-existing work and must not be described as this task's entire change set.
No reset, clean, checkout overwrite, force push, commit, push, deploy or migration.
No changes to Firebase configuration/production data, pricing/stock/debt/payment,
tenant/permissions/authentication rules. Local generated build/artifacts only.
