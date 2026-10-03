# Final Remaining Performance Root Cause

Date: 2026-10-03. Branch: `codex/final-22-module-audit-20261002`.
HEAD: `5f162f5ce85fd4dc746382f13a6a4170e4a29775` (unchanged).

## Result And Boundaries

Source changes implemented in all three requested areas. Inherited correctness
tests remain green. **Not a claim of full performance PASS**: the report's initial
render is much shorter, but waiting for its complete projection is still slower
than the inherited sample. The exact remaining functions are listed below.

No push, commit, deployment, staging creation, production writes, backend migration,
or Firebase configuration changes. Firebase production transport is unchanged.
The unrelated application on port 5179 was not stopped. The working tree already
contained extensive changes; this report describes this task, not the entire diff
against HEAD. No inherited files were reverted or deleted.

## 1. Báo cáo giao hàng mở lần đầu chậm vì tính giá và dựng toàn bộ nhóm đối soát của ngày đang chạy bên trong render

**FILE:** `src/App.jsx`, `src/utils/deliveryRequestIndex.js`.

**FUNCTION:** former `dispatchReconciliationGroups` useMemo, now
`prepareDispatchReconciliationGroups`; `calculateDispatchOrderRequestPrice`;
`dayDispatches`; `buildDeliveryRequestIndex`.

**EVIDENCE:** inherited `final-core-verified` profile and current
`remaining-root-final` profile in `test-results/full-interaction/`.
The workload has 4,303 dispatches, 4,503 requests and 360 generated customer groups
plus dedicated delivery customers. Previously the reconciliation loop, billing
resolution, group construction and sorting all completed before React could commit
the report. This was day-scoped work, not aggregation of every historical order.
Do not describe it as an unfiltered full-history report.

| CPU3x observation | Inherited | Intermediate before reopen cache |
| --- | ---: | ---: |
| First report React render, actualDuration | 252.9 ms | 35.8 ms |
| First commit from click, not compositor paint | 272.4 ms | 53.9 ms |
| First fully ready report, two frame opportunities | 444.7 ms | 606.7 ms |
| Median fully ready report, five opens | 325.1 ms | 524.0 ms |
| Module render events per open | 2 | 4 |

Intermediate first-render durations over five opens: 35.8, 24.4, 24.2, 26.7, 23.1 ms.
Complete-ready times: 606.7, 515.7, 524.0, 588.6, 520.9 ms.
These are distinct milestones; the shell is NOT counted as a completed report.
The browser readiness predicate excludes `[data-hd-module-loading]`.

### Final Reopen Verification

`remaining-report-cache`: same order-request then report navigation sequence,
CPU3x, 120-second external deadline, 10 samples, no failures or console errors.
No unit/build workload ran concurrently with this measurement; the unrelated
port-5179 application remained running as requested. Extended save actions were
disabled in this reopen-only run.

| Milestone | Final measurement |
| --- | ---: |
| First report React render | 33.0 ms |
| First fully ready report | 586.6 ms |
| Fully ready reopens 2 / 3 / 4 / 5 | 196.8 / 163.6 / 158.4 / 155.0 ms |
| Five-open median fully ready | 163.6 ms |
| Report render events | 4 first open; 2 per reopen |

Additional source fix: cache only successfully completed projections using weak
keys for all five immutable inputs (dispatches, customers, products, requests,
reports), with date/employee-ID/delivery-participant scope and at most eight scopes
per source set. Reopening unchanged sources no longer recalculates reconciliation.
Any replaced source array or changed scope misses the cache. Cancelled work never
publishes into it. Existing immutable-source conventions remain required; this is
not persistence, a new authorization mechanism, or an optimistic save.
Tests verify every source replacement, date, employee and role-scope separation,
plus bounded eviction. The first fully ready report is still slower than the
inherited 444.7 ms sample; the repeat-open improvement does not hide that fact.

**FIX:**

- Convert reconciliation preparation into a generator executed outside React
  render, by `useCooperativeProjection` / `runCooperativeProjection`.
- Show date, day dispatch count and an explicit pending state first. Do not show
  an empty report as a final answer or allow submission against an incomplete
  projection. Publish one complete result, rather than per-row React updates.
- Yield after dispatch work and group construction; stable cooperative merge sort
  replaces the final group sort. A batch checks a 4 ms budget and a 128-operation
  cap. This is a cooperative target, not a hard upper bound for one pricing call.
- Cancel obsolete generators on source/date change and unmount. Rejected work
  has an error state, not apparent success.
- Reuse immutable customer/product/asset lookup maps and the request candidate
  index across reopen. WeakMap keys include source array, customer lookup and
  normalizer identity. Replacing customer/tenant/source context invalidates it.
  Last-wins duplicate-ID lookup and candidate source ordering are preserved.
- Reuse one MessageChannel per job and close it on completion/cancellation.
  The first implementation created a channel for each batch and capped batches at
  eight records. That added measurable scheduling overhead and was corrected.

### Pipeline Attribution

Counts below describe the source algorithm/fixture or explicit unit counters, not
invented profiler call counts. Sampling profiles measure sampled self time, not
precise invocation counts or an additive end-to-end breakdown.

| Stage | Source/function | Work and evidence |
| --- | --- | --- |
| Snapshot/read | preview `createSnapshot`, `snapshotDoc` | Local preview only; `snapshotDoc` sampled 26 ms in the current first-open envelope. No real Firebase ACK measured. |
| Normalization | realtime snapshot item pipeline | Existing delta normalization retained; one edit still normalizes one changed record in its test. |
| Customer/product lookup | `getDeliveryRecordLookup` | Once per immutable array identity, reused after unmount/reopen; source replacement test verifies invalidation. |
| Request lookup | `buildDeliveryRequestIndex` | One indexing pass per request/customer context; candidate merge preserves duplicate positions. No `orders.find` is added. |
| Day dispatch selection | `dayDispatches` | Filters 4,303 dispatches, applies employee scope, sorts names. Sort callback sampled 20 ms; this remains synchronous. |
| Pricing | `calculateDispatchOrderRequestPrice` | Day dispatches still require valid pricing; customer candidate callback sampled 22 ms, pricing resolver 18 ms. Existing frozen-snapshot and winner-only fallback paths retained. |
| Aggregation/rows | `prepareDispatchReconciliationGroups` | Generator sampled 24 ms self, no longer part of initial render. Scale tests count one price resolver invocation per included dispatch. |
| Existing reports | `reportCustomerGroups` | Still synchronous over day reports; the browser fixture has zero existing delivery reports, so this path is not stress-certified. |
| State/React | `useCooperativeProjection` | One async result publication per completed job. Four observed module renders include shell/source updates/final result; no per-row setState chain. |
| Layout | browser | `getClientRects` sampled 34 ms in the profiling envelope, including automation. Not isolated business/layout cost. |

The profile envelope can extend beyond readiness. Do not add these self samples
to React durations or wall time. `(program)` and automation time are not assigned
to a business function without evidence.

## 2. Tìm kiếm diện rộng chậm vì bước chấm điểm, lọc kết quả và sắp xếp vẫn chạy đồng bộ khi render

**FILE:** `src/services/searchEngine.js`, `src/hooks/usePreparedSearch.js`,
`src/App.jsx` Orders view.

**FUNCTION:** `createSearchIndexBuilder.finish().rank/search`, former synchronous
`displayOrders`, new `searchAsync`.

**EVIDENCE:** the prior index already prepared fields once, but the Orders view
called synchronous `index.search` and then filtered/sorted its result inside render.
Therefore the root cause was NOT repeated normalization of all fields in this
already-indexed path. Broad prefix queries can still match the entire collection.

**FIX:**

- Add cancellable async candidate collection/intersection/scoring and stable
  merge sorting, with finite per-batch operation and time budgets.
- Build the field index outside render; reuse a scheduler channel per job.
- Prepare the filtered recency order and membership only when source/filter data
  changes. Ordinary queries intersect matches with that order without a per-query
  full collection sort. No searchable record fields are re-normalized per query.
- For legacy duplicate recency keys, preserve relevance tie ordering with a
  cooperative candidate sort using precomputed order ranks. This avoids changing
  ordering semantics to obtain a speed result.
- Guard results by index/query/order/membership identity, abort stale work, and
  distinguish pending/error/no-results. A cleared query uses the prepared list.
- Keep the existing 250 ms input debounce and 50-row pagination. No rendering of
  5,000 or 50,000 rows was introduced.

### Search Scale Evidence

`tests/core-search-query-scaling.test.mjs` tests 1,000 / 5,000 / 10,000 /
50,000 records. Broad, numeric multi-token, absent and repeated queries equal the
synchronous reference. Field accessor counts remain exactly N after queries;
membership/order filtering and duplicate-recency ties are covered. Cancellation
and invalid budgets reject rather than loop indefinitely.

| Records | Field preparation calls, including all queries | Cooperative yields in parity test |
| ---: | ---: | ---: |
| 1,000 | 1,000 | 217 |
| 5,000 | 5,000 | 1,330 |
| 10,000 | 10,000 | 2,815 |
| 50,000 | 50,000 | 15,667 |

These are Node correctness/work-count tests. Their `queryParityMs` includes
reference computation/assertions and is NOT browser query latency or CPU3x data.
They do not certify 50k-record React first-load performance.

Browser evidence: `remaining-orders-search-oracle`, CPU3x, 1,802 runtime orders:

| Iteration | Input + two frame opportunities | Exact first-page result + two frames |
| ---: | ---: | ---: |
| 1 | 18.7 ms | 481.7 ms |
| 2 | 6.9 ms | 413.1 ms |
| 3 | 7.3 ms | 401.1 ms |

Result timing includes the 250 ms debounce. Each cycle performs absent search,
broad search, exact ordered result assertion, clear, and exact restored page
assertion. At most 50 rendered rows. Five screen reopens and last-page navigation
also pass; last-page navigation was 24.8 ms. No console errors. Screenshot inspected:
`test-results/full-interaction/remaining-orders-search-oracle/cpu-mid-3x-orders-search.png`.

## 3. Preview persistence gây chậm vì mỗi lưu gọi persistStore để ghi lại toàn bộ ứng dụng

**FILE:** `src/mocks/firebase-firestore.js`, new `src/mocks/preview-journal.js`.

**FUNCTION:** `setDoc`, `deleteDoc`, `runTransaction` -> `persistStore`.

**EVIDENCE:** inherited first-save CPU profile sampled `localStorage.setItem`
at about 195 ms, in addition to store serialization. Serializer fragment caching
did not remove the full final string/write. The three write entry points all
reached that full-store write.

**FIX:**

- Keep the baseline fixture readable and append document patches, including
  tombstones, under a baseline-scoped preview journal prefix.
- One transaction writes all touched documents as one atomic localStorage value.
  Save resolves only after that write succeeds. No fire-and-forget fake success.
- Load/reload replays durable patches in order; replacement baselines are scoped
  separately and stale writers reject. Duplicate identical verified writes can be
  skipped; notification behavior is preserved.
- Write failure rejects, immediate restart recovers successful changes, and a
  failed multi-document durable write recovers neither half. Cross-tab reload and
  foreign records remain covered by tests.
- Browser harness readers now read baseline plus journal, not a stale baseline.
  Existing preview read-check scripts were adapted and syntax checked; their full
  unrelated visual suites were not rerun.

50,000-product test: **3,205,595-byte baseline; 157-byte transaction patch;
one durable write; zero full-store writes during save**. Both documents recover
after restart. Existing serializer code remains as inherited test infrastructure,
but is no longer called by preview saves.

**PREVIEW-ONLY — KHÔNG PHẢI PRODUCTION BOTTLENECK.**

No production Firebase speed claim follows from this change. Journal replay is
startup/sync work, and journal space remains subject to browser quota. This task
does not add destructive compaction; quota failure is a failed save, not success.
The prefix fingerprint is fixture versioning, not a security or tenant boundary.

## Method And Dataset

Windows host, Chromium preview profiling build, mobile 390x844, CDP CPU3x, fixed
2026-10-02. No network ACK conclusions. Initial fixture counts: customers 364,
products 600, orders 1,800, requests 4,503, dispatches 4,303, payments 900,
delivery reports 0. After the mock's normal seed merge: customers 365, products
602, orders 1,802, requests 4,503, dispatches 4,303, payments 901, reports 0.
Five isolated order-request saves add five records during the action run.

Report scale tests execute actual source projection at 20/1,000/5,000 dispatches,
with controlled pricing dependencies. They verify totals, repeated execution,
cancellation, two dates, and employee-scoped/unscoped filtering. They are not a
real backend or full 5k-row browser render benchmark. Existing pricing oracle
tests continue to compare business pricing against the independent Git reference.

All browser runs had an external 90/120/180-second deadline and bounded inner
waits. Tests use `--test-timeout=30000`. No full-app benchmark was run.

### Harness Corrections And Non-comparable Evidence

- `remaining-root-verified`: first scheduler version. Report first-ready 981.6 ms;
  channel creation/close appeared in profile. Replaced per-batch channels and the
  eight-record cap, not merely rerun without a source fix.
- `remaining-report-scheduler`: cold report-only navigation, not the same warm-up
  sequence as the inherited two-module run. Do not compare its 1,736.9 ms to the
  warmed inherited 444.7 ms as a controlled before/after pair.
- `remaining-root-final`: same two-module sequence, 35 samples, zero failures and
  zero console errors. Host contention existed; the late save samples overlap a
  unit-test run. Do not claim a statistically isolated save-speed improvement from
  those timings. The structural removal of full-store writes is separately tested.
- `remaining-orders-search`: reader injection failed parsing; fixed by wrapping
  injected declarations in an IIFE.
- `remaining-orders-search-fixed`: exact-result oracle incorrectly included two
  seed orders that did not match `khach`; finite 10-second timeout retained evidence.
  Corrected the independent fixture oracle, not the application search.
- `remaining-orders-search-oracle`: 12 samples, zero failures/errors; correct
  broad-search, clear, paging and reopen verification.

## Tests And Verification

| Check | Result |
| --- | --- |
| Inherited plus focused unit set | 436 PASS, 1 existing SKIP, 0 FAIL (437 total) |
| Save/UX set | 19 PASS, 0 FAIL |
| Additional final storage guard retest | PASS |
| Additional report date/scope retest | PASS |
| npm run lint | PASS |
| Explicit lint of new hooks/services/mock/tests/harness | PASS |
| npm run typecheck | PASS; existing tsconfig.payroll.json scope only |
| npm run build | PASS, rerun after final cache change |
| Updated visual script syntax | PASS; not all unrelated visual scenarios executed |

Logs: `test-results/remaining-root-final-unit.log`,
`remaining-root-final-save-ux.log`, `remaining-root-storage-final.log`,
`remaining-root-final-lint.log`, `remaining-root-final-build.log`.
CPU profiles and samples remain under the named `test-results/full-interaction`
directories; source attribution: `test-results/remaining-root-final-profile.txt`.
Final cache verification logs: `test-results/remaining-root-cache-unit.log`,
`remaining-root-cache-save-ux.log`, `remaining-root-cache-build.log`.
Lint, explicit new-file lint and payroll typecheck were rerun successfully after
the cache change. Save/UX remained 19 PASS.

## Exact Remaining Cost / Not Certified

1. `src/App.jsx: calculateDispatchOrderRequestPrice` still resolves candidates for
   each day's dispatch. The generator yields between dispatches, not inside a
   single pricing resolution. Therefore unusually large same-customer histories
   can still produce a long individual step. First complete-report readiness is
   586.6 ms in the final CPU3x run. Reopens now reuse completed projections and
   take 155.0–196.8 ms; first-open work remains a separate limitation.
2. `src/App.jsx: dayDispatches` still synchronously filters/sorts the loaded
   dispatch collection; `reportCustomerGroups` still aggregates existing day
   reports synchronously. Dense historical-report browser coverage is not present
   in the zero-report fixture. No blanket report performance PASS is assigned.
3. Broad search must still score actual matching candidates and return all matches
   for correct pagination. It is cooperative, not constant-time. Browser DOM
   validation used 1,802 orders, not a 50,000-order application load.
4. Preview `createSnapshot` still constructs/sorts the changed collection's query
   snapshot before notifying. Removing persistence does not remove that separate
   collection-level cost or make any statement about Firebase/network latency.

This task removes/defer the identified render-bound projection, synchronous query
execution and full-store save writes. It does not certify every report dataset,
every device, or a production end-to-end latency target.
