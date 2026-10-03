# Core Workflow Root Cause Register

Date: 2026-10-03. Status meanings: VERIFIED FIX, PARTIAL, OPEN, INFRASTRUCTURE.
Full gate remains NOT PASS while any required source path is open.

## RC-01: Cold Orders Search

- Module/action: Orders, first search.
- Source/function: App.jsx OrderManagementView/getPreparedOrderSearchFields;
  searchEngine.js createSearchIndexBuilder/createSearchRecordIndexAsync.
- Why: index field normalization, postings and per-line catalog searches occurred
  synchronously on first search, blocking the interaction.
- Cost evidence: root-cause-before cold608.2 ms, long-task overlap298 ms; earlier
  inherited run had434 ms. Self samples: normalization55, product lookup48,
  field preparation37 ms. These are different measurements, not interchangeable.
- Fix/deleted work: prepared async index; first-match product ID Map; screen-local
  input/store; no root update for each character; no field rebuild for each query.
- Deferred work: bounded construction outside character handler; 250 ms query debounce.
- Correctness: indexed ranking/aliases/sparse/duplicate parity, filter scope change,
  abort, store cleanup; original recency ordering preserved.
- After: root-search-final282.1 ms; root-core-final286.7 ms, no overlapping long task.
- Status: VERIFIED FIX for measured cold query. Broad50k query scoring remains RC-09.

## RC-02: Orders Root Search State

- Source: OrderSearchInput.jsx, orderSearchState.js, App.jsx header and module.
- Why: transient header text updated a root state owner.
- Fix: one local draft update; debounced screen store publication. Explicit navigation
  still updates the root when necessary.
- Deleted: per-character root setter. No persistence/network work added.
- Evidence: subscriber/idempotence/scope tests; cold query browser evidence above.
- Status: VERIFIED FIX for header search; order form/list isolation is RC-10.

## RC-03: Hidden Request Picker Work

- Module/action: Order Requests quantity/price/note and product search.
- Source: App.jsx manualFilteredCustomers, manualExtraProductVariantOptions,
  both detail/legacy requestDrafts rendering branches.
- Why: suggestion preparation ran regardless of picker visibility. One-record
  product search was repeated for every variant of the same catalog item.
- Fix: visibility guards; catalog index and membership Set; keep original variants,
  match criteria and final display ordering.
- Deleted: closed picker customer scan, variant preparation/filter/sort; repeated
  product field normalization per variant. Current-row billing remains required.
- Correctness: core-request-picker-work.test.mjs (closed paths perform zero scan;
  600-product membership vs single-record original for six query forms);34 UX checks.
- Before: root-request-inputs quantity median31.4 ms; customer187.8/product159.7 ms.
- After latest detail guards: see final report's last targeted run; do not use the
  earlier root-source-verified build to claim these final guards' improvement.
- Status: source VERIFIED FIX; all important input timing coverage still incomplete.

## RC-04: Historical Table Work on Draft Render

- Source: App.jsx plus DispatchTableBody.jsx and OrderRequestTableRows.jsx.
- Why: draft changes traversed inline historical table JSX.
- Fix: mechanical table-body extraction and memoized component boundary; stable
  useCurrentCallback forwards latest permissions/data, not stale captured handlers.
- Deleted: re-entering table body solely because draft value changed, when props stable.
- Correctness: original row spans, selections, editable command targets and disabled
  permissions rendered/tested. No row/business grouping rewrite.
- Evidence: dispatch quantity median27.6 ->26.5 ms; request quantity timing reported
  separately. No invented exact descendant render count.
- Status: PARTIAL overall: Orders historical cards and group-vs-row bounding remain.

## RC-05: Shortage Reconciliation Repeated Alias and Timestamp Work

- Source: App.jsx buildWarehouseDispatchShortageSummary/getDispatchMatch.
- Why: every source line recreated alias Sets and filtered all dispatch candidates
  again for the same timestamp; notification projection sorted unused quantity data.
- Fix: primitive-validated WeakMap alias keys; per-call alias/timestamp cache;
  sorted timestamp lower bound plus untimed rows; avoid notification-only sort.
- Deleted: identical alias allocation, repeated full timestamp predicate scans,
  unnecessary notification quantity sort. Quantities/status always recomputed from source.
- Correctness: independent Git5f full-output oracle,4500 alias fixture, seeded date,
  rename, archive, duplicate-ID, mutable quantity/status parity. Result arrays independent.
- Count:100 dispatches/300 equal-timestamp requests <=7 binary checks instead of
  30,000 timestamp predicate checks (not a claim that complete matching is O(log N)).
- Before/after save: preview totals remain around1 second; do not label this closed.
- Status: PARTIAL. Incremental affected-source projection work is still open.

## RC-06: Delivery Candidate Work

- Source: App.jsx calculateDispatchOrderRequestPrice, getDeliveryItemSearchNames,
  getDeliveryItemBillingSnapshot.
- Why: all eligible candidates allocated/sorted, including unused fallback/unit
  configuration; multiple dispatches re-prepared the same immutable request items.
- Fix: exact-ID early path, context-invalidated item cache, stable one-pass winner,
  lazy fallback and winner-only legacy unit configuration.
- Deleted: candidate full sort and unit configuration for losing candidates.
- Correctness: old Git5f function oracle;40 multi-candidate fixtures, frozen/legacy
  cases;40 tied items select first and invoke legacy configuration once, not40 times.
- Timing: delivery open median465.4 before,500.4 intermediate,420.4 latest four-flow
  run. Max582.5 ms: not a universal latency PASS or clean causal percentage.
- Status: PARTIAL. Cold current-day group/source preparation still synchronous.

## RC-07: Async Yield Timer Clamp

- Source: searchEngine.js async builder yield.
- Why: repeated nested setTimeout(0) incurred timer clamp, delaying ready results.
- Before: intermediate root-cause-after cold2072.3 ms (regression retained as evidence).
- Fix: scheduler.yield or MessageChannel; ports close; final fallback timer only
  if neither API available. No relaxation of readiness/correctness predicate.
- After: cold282.1/286.7 ms, no measured overlapping long task.
- Status: VERIFIED FIX in tested browser. Older WebView fallback timing unmeasured.

## RC-08: Preview Persistence Cost

- Source: mocks/firebase-firestore.js persistStore and preview-store-serializer.js.
- Why: isolated preview durably writes a large single-store string for local save.
- Evidence: request-save self sample setItem197 ms before and218 ms intermediate;
  serializer costs also sampled. Not a real Firebase ACK.
- Action: preserve persistence semantics; do not make the fixture falsely succeed,
  discard durability, or modify production backend to improve this number.
- Status: INFRASTRUCTURE. Browser save envelope not all attributable to business CPU.

## RC-09: Large Broad Search and Suggestions

- Source: searchEngine.js candidate scoring/sort; App.jsx request suggestion rendering.
- Why: broad query can match most records; candidate sorting/DOM count is not a
  strict constant or row bound. Cooperative BUILD is not cooperative QUERY.
- Evidence:5k/10k/50k tests verify construction/cancellation/exact lookup only.
- Remaining: bounded broad-query scoring/result strategy and row-level windowing,
  retaining global match/rank semantics and user access to all records.
- Status: OPEN. No50k UI responsiveness claim.

## RC-10: Remaining Render and Save Isolation

- Source: App.jsx OrderManagementView orderPage.items.map, request shortage projections,
  DeliveryReportView dispatchReconciliationGroups.
- Why: form parent still owns historical cards; source mutation invalidates large
  grouped projections; cold mount initializes required sources in one screen commit.
- Remaining: targeted row/form ownership isolation; affected-source reconciliation;
  bounded cold preparation, with original pricing/source precedence parity.
- Status: OPEN. Do not mark full source-level contract PASS.

## RC-11: Measurement Envelope

- Source: tests/visual/interaction-action-cases.mjs and scripts/audit-interactions.mjs.
- Why: physical-key operation includes automation dispatch, focus/visibility work
  and two animation-frame opportunities. It is not an exclusive application CPU clock.
- Fix: opt-in physical-character cases; separate focus before later focused run;
  retain original action keys/builds, profiles, absolute finite deadlines.
- Evidence:25 focused samples and91 four-flow samples; no failure/error/timeout.
- Status: INFRASTRUCTURE; not a production optimization or native FPS result.
