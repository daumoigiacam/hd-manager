# Core Workflow Smoothness - 2026-10-03

## Verdict

CLIENT PERFORMANCE GATE: NOT PASS. Improvements are verified, but cold order search,
long tasks, complete interaction coverage and actual compositor/memory acceptance
remain open. Firebase ACK is unverified and is NOT the reason for this verdict.
No production writes, deployment, push, migration or Firebase configuration changes.

## Scope and environment

Four workflows only: order requests, orders, dispatch and delivery reports.
Windows, installed Chrome headless, Playwright, 390 x 844 viewport, CPU throttling 3x.
Production-style Vite preview with isolated mock persistence, NOT real Firebase.
Fixed fixture date: 2026-10-02. Fixture: 364 customers, 600 products, 1,800 orders,
900 payments, 4,503 order requests and 4,303 dispatches.
The unrelated application at port 5179 remained running as requested. CPU throttling
does not simulate a specific Android device or eliminate host contention.

## Changes in this task

- Orders: normalize payment snapshots once per source change; reuse for filtering
  and daily revenue. Search no longer repeats this normalization on every keystroke.
- Orders: debounce 250 ms; construct searchable fields once per current filtered
  dataset and reuse the index across queries. Preserve final newest-first ordering.
- Delivery reports: coalesce form-scroll timeouts and clear the pending timeout on
  unmount. Do not cancel business-critical writes or background sync.
- Harness: opt-in post-GC heap/DOM/listener observations, exact-result order search
  checks, separate input-paint and result-ready measurements, including cold search.
- Regression assertions updated for the new memo composition, full-source totals,
  and the previously removed optional share-image warmup. The mutation-handler
  comparison still checks every other statement against commit 5f162f5.

Existing dirty files and previous optimizations are retained. This task did not
introduce their storage, reconciliation, pricing, background queue or dispatch-save
changes. No new worker, backend, virtualization framework or business rule.

## Evidence and methodology

Artifacts under `test-results/full-interaction/`:

| Run | Purpose | Samples | Failures | Parent timeout |
| --- | --- | ---: | ---: | ---: |
| smoothness-before | Four-workflow baseline | 76 | 0 | 180 s |
| smoothness-orders-before | Matched isolated order baseline | 16 | 0 | 120 s |
| smoothness-after | Four-workflow final verification | 86 | 0 | 240 s |
| smoothness-orders-after | Matched isolated order comparison | 16 | 0 | 120 s |
| smoothness-orders-cold-after | First-index construction check | 18 | 0 | 120 s |

The four-workflow AFTER run adds lifecycle GC probes and order-search actions;
it is not an exact controlled comparison with the four-workflow BEFORE run.
Do not attribute all wall-time differences to the patch. A small unit-test run
also overlapped the broader AFTER run. The isolated order pair uses matching options.
Timers are bounded independently of browser progress. All listed runs completed.

## Orders: matched before/after

Milliseconds; median / maximum. Input paint is two animation-frame opportunities,
not a hardware touch measurement. Result-ready includes the debounce interval.

| Action | Before | After |
| --- | ---: | ---: |
| Warm search input paint | 320.7 / 398.2 | 25.8 / 30.7 |
| Warm search exact result ready | 348.4 / 418.4 | 288.7 / 298.1 |
| Open orders | 244.0 / 380.7 | 324.5 / 387.0 |
| Last page | 37.9 | 33.0 |

The open-screen increase is unresolved, not an accepted regression. A subsequent
targeted run observed 121.2-247.9 ms opens, showing run variability; that does not
prove absence of regression. Controlled repeated profiling remains necessary.

Cold search: input paint 28.4 ms, exact result ready 709.1 ms, overlapping long task
434 ms. The first query constructs the full current index synchronously. Subsequent
queries in that run take 267.5-277.0 ms including debounce. Thus the warm typing
improvement does not close the cold-search/main-thread gate.

## Four-workflow results

AFTER median / maximum, ms. Save means the harness's observed local UI completion,
not remote ACK. These durations must not be interpreted as continuous UI freezes.

| Action | Median | Maximum |
| --- | ---: | ---: |
| Order requests open | 596.6 | 682.2 |
| Order requests create form | 225.1 | 340.3 |
| Order requests save | 1380.2 | 1785.7 |
| Orders open | 224.7 | 274.4 |
| Dispatch open | 445.8 | 509.1 |
| Dispatch quantity input | 28.9 | 31.1 |
| Dispatch weight input | 14.6 | 15.5 |
| Dispatch customer search input paint | 63.7 | 108.1 |
| Dispatch product search input paint | 21.2 | 78.3 |
| Dispatch save | 687.0 | 915.0 |
| Delivery reports open | 532.6 | 550.5 |
| Delivery cashflow save | 282.4 | 310.9 |
| Delivery expense save | 214.4 | 214.4 |

The original broader baseline had request save 1170.1/1280.4 ms and dispatch save
602.9/712.2 ms. Because the instrumentation and workload differ, no save improvement
or regression is established by that pair. Save-path investigation remains open.

## CPU and rendering

Maximum observed `thread.long_task` duration in the broader AFTER interaction
windows: requests 644 ms, orders 192 ms, dispatch 471 ms, delivery 513 ms.
These are overlapping browser tasks, not exclusive business-function timings.
Nested React profiler durations must not be summed as independent CPU time.
No >700 ms long task was captured in these windows; this is not a universal freeze
guarantee. Cold search separately adds the 434 ms task noted above.

Scroll RAF probes: requests 284 callbacks/max 20.8 ms; orders 275/max 45.9 ms;
dispatch 279/max 33.4 ms; delivery 285/max 16.7 ms. Mean spacing is about 4.2 ms in
headless Chrome, not a real 60 Hz compositor cadence. Actual FPS, GPU overdraw and
dropped-frame <1%: NOT MEASURABLE IN CURRENT ENVIRONMENT with this harness.
No decorative CSS was deleted on speculation.

## Memory and cleanup

Five open/away cycles per workflow, explicit CDP GC, JS heap only:

| Workflow | Mounted heap first -> last MB | Away heap first -> last MB |
| --- | ---: | ---: |
| Requests | 32.4 -> 35.7 | 22.1 -> 26.5 |
| Orders | 29.0 -> 29.3 | 26.5 -> 27.2 |
| Dispatch | 33.5 -> 34.6 | 27.3 -> 28.8 |
| Delivery | 33.8 -> 34.2 | 29.2 -> 31.6 |

Away DOM counts after warmup are approximately 1004/1008/1012/1013 respectively.
Document-wide listeners are usually 315, delivery 317, with transient 398/400.
Shared application listeners remain active; these are NOT screen-owned leak counts.
Mock subscriptions are typically 15, dispatch mounted 9. This is not evidence about
real Firebase socket cleanup. Diagnostic telemetry itself retains observations.
The heap growth is unresolved; five cycles cannot certify leak freedom.
Process/GPU memory, detached retaining paths, screen-owned pending requests and
complete timer counts were not established. Do not compare this heap to the user's
150-250 MB process-memory target.

The new scroll timer has coalescing/unmount tests. Search index lifetime is one
current memo scope, invalidated with source/filter/product/customer changes and
released on unmount; no history of queries/results is retained. Its size scales
with the active dataset and has no fixed record ceiling. A bounded first-query
processing strategy remains necessary; do not call this constant-memory search.

## Lists, data and startup

- Orders render 50 rows per page. This is DOM pagination, NOT database pagination.
- Requests initially show 20 customer groups; rows within a group and load-more
  growth remain unbounded. Dispatch uses grouped progressive rendering too.
- Delivery starts with limited reconciliation groups; expansion can render all.
- Shared histories remain loaded for existing reconciliation/financial correctness.
  This task does not claim bounded server queries or complete virtualization.
- No new database query-duration measurement: preview has no real network query.
- Baseline startup shell/three mock subscriptions was 1337.66 ms, not an end-to-end
  real-device interactive cold-start measurement. Cold/hot universal gates unverified.

## Background work

P0: draft input, selection, visible filtering. P1: durable write, mandatory sync and
error tracking. P2: existing cooperative loyalty/backup/maintenance queues. They
already pause/defer for relevant input, visibility and dispatch conditions; retained.
P3 share-image precomputation was removed in the inherited task and is now explicit
on demand. No new P4 job was proven obsolete and deleted in this task.
Hidden dashboard memoization and inherited pricing caches were not rewritten.
No pending durable write was cancelled merely because a screen unmounted.

## Tests

- New search/timer tests: 4 PASS, including 1,800 records, eight queries, exactly one
  field-index construction, result parity, changed scope and timer coalescing.
- Order-request UX: 34 PASS after updating composition assertion.
- Hidden-report + on-demand-sharing: 9 PASS, including exact business-handler
  comparison with only the known optional warmup call excluded.
- Lint PASS; typecheck PASS (repository's payroll tsconfig scope); build PASS.
- Full regression `npm run test:all`: PASS, exit 0 within 240-second bound.
  Final master-performance suite: 392 tests, 391 PASS, 1 skipped, 0 FAIL;
  this count is that suite, not the aggregate of all preceding suites.
  Log: `test-results/smoothness-test-all.log`. The new standalone four-test
  hardening suite was run separately. `git diff --check`: PASS (line-ending
  conversion warnings only).

## Remaining acceptance work

1. Remove the measured cold-search synchronous index-build bottleneck without
   stale results or shifting an equally large task into startup.
2. Attribute request-save and dispatch-save work with matched traces; reduce only
   proven unrelated work. Preserve local durability and background Firebase sync.
3. Complete orders edit/save, request pricing/search/selection and delivery
   search/filter/date-range interaction coverage; existing measured cases are partial.
4. Bound expanded grouped lists without dropping business rows or corrupting totals.
5. Investigate heap retaining paths and screen-owned resource cleanup with longer
   bounded lifecycle tests. Validate actual compositor frames on a real device.
6. Verify cold startup and real data query bounds separately, without production
   benchmark writes. Firebase ACK stays a separate gate.

No FULL PASS, production readiness or universal smoothness claim is made.
