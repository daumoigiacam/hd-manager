# Final Core Performance Root Cause Report

Date: 2026-10-03. Status: IMPROVED, NOT FULL ROOT-CAUSE CLOSURE.

## 1. Request Save

Lưu Đơn đặt chậm vì snapshot preview đọc lại toàn bộ collection, trạng thái dựng lại dữ liệu đơn/phiếu không đổi và persistence preview vẫn ghi chuỗi toàn bộ store.

- FILE: `src/mocks/firebase-firestore.js`, `src/App.jsx`, `src/mocks/preview-store-serializer.js`.
- FUNCTION: `createSnapshot`, `onSnapshot`, `buildWarehouseDispatchShortageSummary`, `appendRequestLines`, `persistStore`.
- EVIDENCE: one-record edit now normalizes 1 rather than 4500 documents; source profiler identifies repeated request preparation and native localStorage write. Final first-save sampled native setItem self time is 195ms; this is not a Firebase ACK measurement.
- FIX: per-listener document deltas; cached dispatch index; immutable per-request preparation for status/notification projections. Final grouping/status output and full-store preview persistence remain. No fake success or durability bypass.

## 2. Delivery Report

Mở Báo cáo giao hàng chậm vì tải nguồn ban đầu, duyệt các ứng viên đơn và chuẩn hóa thông tin dòng lặp lại trước khi tổng hợp nhóm trong ngày.

- FILE: `src/App.jsx`, `src/mocks/firebase-firestore.js`.
- FUNCTION: `calculateDispatchOrderRequestPrice`, `getDeliveryItemMatchMetadata`, `dayDispatches`, current-day group projections, `createSnapshot`.
- EVIDENCE: final cold-open profile retains request/candidate frames (23/15ms sampled self), collector work (24ms) and dispatch projection (10ms); first open 444.7ms, five-open median 325.1ms. Intermediate preview delta creation was also doing a growing-array lookup for each initial addition; corrected to direct append.
- FIX: reuse candidate quantity/weight/size/unit metadata; initial delta append no longer searches existing prefix. Prior frozen-price shortcut, candidate ordering and winner-only fallback are retained. Cold candidate/group work is not fully eliminated.

## 3. Large Lists

Danh sách lớn chậm vì giới hạn theo số nhóm khách không giới hạn được số dòng, còn nút tải thêm làm số dòng DOM tăng liên tục.

- FILE: `src/App.jsx`, `src/services/groupedRowPage.js`, `src/features/orders/CoreRowPager.jsx`.
- FUNCTION: `getGroupedRowPage`, `visibleRequestSalesGroups`, `visibleDispatchGroups`.
- EVIDENCE: one 10000-row group was unbounded under the old group slice. New tests visit all 100 pages with at most 100 data rows, exact original row references/order and correct page rowspans.
- FIX: 100-data-row pages for request and dispatch tables. Totals, search inputs and exports still use full business collections. This is bounded pagination, not full-app virtualization. Orders broad-query ranking and other nested lists remain outside this completed fix.

## Before / After

Local Chrome production-profile preview, mobile 390x844, CPU3x, fixed business day 2026-10-02. Fixture approximately 364 customers, 600 products, 1800 orders, 900 payments, 4503 requests, 4303 dispatches before measured saves. No production data written. Other application at localhost5179 was left running as requested.

| Action | Prior evidence median | Intermediate median | Final median | Final range |
| --- | ---: | ---: | ---: | ---: |
| Request save | 1043.7ms | 702.4ms | 692.3ms | 682.5-816.5ms |
| Request quantity input | 20.7ms | 9.9ms | 11.5ms | 10.2-12.9ms |
| Delivery open | 420.4ms | 428.4ms | 325.1ms | 310.7-444.7ms |
| Request module open | 665.4ms | 552.3ms | 484.8ms | 335.8-507.7ms |
| Single request edit normalization count | 4500 | 1 | 1 | deterministic test |
| One large customer group rendered data rows | 10000 | 100 | 100 | deterministic paging test |

Prior evidence: `root-request-picker-final` for save/input, `root-source-verified` for module openings. Intermediate: `final-core-targeted`. Final: `final-core-verified`. These are separate runs, not randomized paired trials; host load can vary. Do not generalize these values to physical Android or Firebase latency.

Both new targeted UI runs contain 35 samples, five iterations per measured action, zero failures and zero browser errors. Each had a hard 180000ms supervisor deadline. The final run was made after regression tests/build finished, without concurrent test commands. The intermediate run overlapped test completion during setup, so it is diagnostic rather than a controlled baseline.

## Save Stages and Attribution

| Stage | Source / classification | Evidence status |
| --- | --- | --- |
| User click to confirmed expected UI + two animation frames | Browser interaction recorder | Measured totals above |
| Validation, request construction, duplicate guard, selected pricing | Request submit / handleAddOrderRequest | Preserved; exact individual wall-time spans NOT INSTRUMENTED |
| Customer/product lookup | Existing scoped lookup paths | Exact separate duration UNMEASURED |
| Payment/expense processing | Not exercised by this no-deposit save scenario | N/A for this fixture, not removed |
| Status preparation / React update | Cached projections + React profiler events + CPU profile | Sampled attribution, not exclusive elapsed stage boundaries |
| Durable preview persistence | persistStore -> serializer -> localStorage.setItem | CPU self samples; full-store residual documented |
| Firebase/network/ACK | Preview has no real Firebase transport | UNMEASURED; never infer ACK from mock success |
| Notification | Employee-created request does not call customer-portal notification send | Not causal in this save fixture |
| UI completion | Expected modal hidden, two animation frames | Included in total, not added again |

This task has NOT completed exact independent wall-clock timing for every requested save substage. Profiler self samples cover the profiler recording window, which may extend beyond the UI-ready boundary. React durations, long tasks, layout and CPU samples overlap and are not summed.

## Correctness / Regression

- Main business/core regression command: 423 tests, 422 PASS, 1 SKIP, 0 FAIL. Log: `test-results/final-core-unit.log`.
- 19 save/UX tests PASS (including 34 internal request UX checks).
- Lint PASS; explicit lint added for the new pager/helper/mock/tests. Typecheck PASS for the repository's existing `tsconfig.payroll.json` scope, not a new whole-App typecheck.
- Production build PASS, 11.72s. No deployment.
- `git diff --check` PASS; existing line-ending warnings only.
- New tests: snapshot one-record deltas and unsubscribe, 10000-row paging/back navigation/removal clamping, dispatch-index invalidation, request projection oracle parity across edits/removals/aliases/mode changes.
- Existing candidate pricing, duplicate save, durable queue/failure/reload, source identity, quantity, permission and tenant tests remain PASS.
- Test harness fix: AST projection evaluator now models `useRef` lifetime, rather than trying to import React while evaluating isolated calculations.

## Layout / Background

Source scan found modal viewport measurement in App around the keyboard handling and another container measurement, not a new alternating DOM write/read loop inside the changed projection code. getClientRects in browser profiles includes automation/visibility checks: not attributed wholly to application layout. No animations were removed speculatively. No new causal evidence links backup/loyalty/retry/REST polling to these samples; marked NOT CAUSAL in this evidence set.

## Remaining Root Causes / Coverage

1. Preview full-store synchronous durable persistence remains: roughly 195ms native setItem self time in the final first-save profile, plus serializer work. Incremental durable persistence is NOT implemented.
2. Request status output still merges/traverses all visible request groups; only unchanged preparation and dispatch indexing are eliminated.
3. Delivery cold source candidate traversal and day aggregation remain synchronous; final median improved but the cold first-open remains 444.7ms.
4. Very broad indexed queries still synchronously score/sort candidates; cooperative index construction is not cooperative query ranking. Previous passed ordinary search was retained, not re-optimized.
5. The new row bound covers request/dispatch tables; no claim that every nested order/delivery list is virtualized. Browser scroll/FPS and all component/effect invocation counts were not collected.

These are unfinished items, not external permission blockers. Therefore this report does not claim FULL PASS or complete elimination. No commit, push, deployment, Firebase migration/configuration change or production write was performed. Pre-existing working-tree edits were retained.
