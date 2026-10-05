# HD Manager - Module Certification Report

Module: Xuất kho (`warehouse_dispatch`). Date: 2026-10-05.

## Current Status

**Xuất kho: FAIL (not certified).** Authorization, Firestore-boundary idempotency and pending/inventory projections pass their isolated checks. Preview-browser create/reload/double-submit E2E and bounded preview performance sampling also pass. Certification fails on known module-wide strict typing, UI/domain/repository boundary and design-token gaps; Firebase-backed UI with delayed/failing ACK, cloud latency, full failure lifecycle and device jank/memory are additionally blocked/unverified. No production data, deploy, push or commit was used.

## Blocker Resolution Matrix

| Blocker | Evidence hiện tại | Required action | Verification | Status |
| --- | --- | --- | --- |
| Authorization at Firebase boundary | Rules deny unauthorized create/edit/delete and self-granted permission; authorized owner/admin/warehouse role paths work. | Keep emulator regression; deploy/test only in a verified non-production Firebase project before production certification. | Emulator probe (16 assertions) and tenant isolation (14 scenarios). | PASS (emulator only) |
| Server idempotency | Deterministic tenant + mutation document ID; Firestore transaction replays identical intent and rejects changed/incomplete payload. | Exercise app UI through Firebase Emulator for double submit/retry/restart with stable mutation ID. | Concurrent same ID, lost-ACK replay, serialized replay, distinct IDs and ID mismatch in Emulator; preview UI rapid double-submit yields one local record. | PASS (boundary); UI-to-Firebase BLOCKED |
| Pending versus authoritative inventory | Pending projections are excluded from stock/pricing/dashboard; confirmed-only rows included once; failed durable enqueue is not published. | Verify delayed/failed emulator ACK through UI and reconcile list with inventory after restart. | Focused regression tests cover pending/confirmed projections and rejected enqueue. | PASS (projection tests); full lifecycle BLOCKED |
| Create, persistence, duplicate UI | Preview browser selects seeded customer/product, submits rapidly twice, reads exactly one record and reloads it. | Repeat with Emulator-backed UI and failure/retry states. | `tests/visual/warehouse-dispatch-create.preview.mjs`; local preview store only. | PASS (preview only) |
| UI performance | Five preview screen-open samples and one customer/product/save sample. | Collect representative samples on Firebase staging and physical Android devices before P95/P99 claims. | Bounded Playwright preview, 390x844 viewport. | BLOCKED for production certification |
| Strict typing for entire module | The module remains predominantly in `src/App.jsx`; strict TypeScript coverage currently targets only the extracted create transaction helper. | Extract/type module boundaries incrementally with explicit contracts and regression protection. | Current `tsconfig.dispatch.json` scope is helper-only; broader module audit in inherited report confirms uncovered JS/JSX paths. | FAIL (known technical debt) |
| UI/domain/repository separation | Form preparation, billing decisions and persistence orchestration still cross the screen/App boundary. | Establish module ownership boundaries without changing business semantics, then add contract tests. | Source mapping and prior architectural audit in this report. | FAIL (known technical debt) |
| Design tokens/consistency | Dispatch screen retains local literal styling and patterns. | Align incrementally to existing system tokens/components and verify visual regressions. | Prior module source audit; no broad redesign attempted in this continuation. | FAIL (known technical debt) |

## Commands And Results

| Check | Result |
| --- | --- |
| Firestore Emulator boundary probe | PASS, 16 boundary assertions; demo project only |
| Firestore tenant isolation | PASS, 14 scenarios |
| Focused dispatch/save/inventory/report regression | PASS, 81/81 Node tests in the exact command rerun this continuation |
| Dispatch shortage/performance tests | PASS, 16/16, including 4,500-alias result parity and bounded caches |
| Preview browser E2E | PASS: create, rapid double-submit, one persisted preview record, reload persistence; external requests blocked |
| Preview visual checks | PASS: grouping desktop/mobile and weight dialog viewport checks from prior continuation |
| `npm.cmd run lint` | PASS |
| `npm.cmd run typecheck` | PASS, existing project script covers payroll only |
| `npx.cmd tsc -p tsconfig.dispatch.json` | PASS, strict check of idempotent dispatch transaction helper |
| `npx.cmd eslint tests/visual/warehouse-dispatch-create.preview.mjs` | PASS |
| `npm.cmd run build` | PASS, 2,504 modules; 11.15s build; main entry 2,479.27 kB / 673.49 kB gzip |
| `git diff --check` | PASS; only Git's Windows LF/CRLF normalization warnings |

## E2E And Performance Evidence

The new E2E uses a Vite preview with local preview persistence, Chrome headless, and a route guard aborting every request outside the preview origin. Seeded data is preview-only (`Cửa hàng Lan Anh` / `Nước giặt HD`). Flow: open Xuất kho -> select customer/product -> quantity 4 Can -> double submit -> assert one record and mutation ID -> reload -> assert the same record persists.

| Measurement | Samples | Result | Scope |
| --- | ---: | ---: | --- |
| Xuất kho screen open | 5 | p50 19 ms, p95 113 ms (113, 21, 19, 18, 19 ms) | Preview browser, 390x844; nav click to form visible |
| Customer selection | 1 | 39 ms | Preview interaction |
| Product selection | 1 | 44 ms | Preview interaction |
| Save + local preview acknowledgement | 1 | 62 ms | Local persistence, NOT Firebase/network/server ACK |
| Rapid double submit | 1 pair | exactly 1 record | Preview persistence only |
| Reload persistence | 1 reload | same record ID and quantity | Preview persistence only |

The five-sample screen-transition p95 is below the 200 ms target in this preview, but it is not a reliable device P95. The 113 ms maximum is not an interaction-feedback measurement and should not be compared with the 100 ms feedback target. No Firebase ACK timing, real API latency, UI P99, physical-device jank or heap usage is claimed.

## Environment And Limitations

- Emulator uses isolated demo project `demo-hd-dispatch-cert`, local ports 8187/4407/4507, temporary ASCII rules/config, 60-second test timeout and 180-second process timeout. No production Firebase configuration or data was used.
- The offline case serialized a durable pending command while Firestore SDK networking was disabled, re-enabled the SDK and then committed through an actual emulator transaction. This is not a physical network outage, Android process-kill or full UI restart E2E test.
- Lost ACK is exercised by committing then replaying the same command identity; it does not measure cloud ACK latency.
- Browser E2E is preview-local; it does not run the UI's actual Firebase SDK write/ACK path. There was no production Firebase write, cloud latency percentile, device UI P95/P99, cold/warm start or heap lifecycle measurement.
- Business quantity, price, unit, inventory formulas, debt, payment, tenant ownership and authentication behavior were not intentionally changed.

## Changed Files For This Blocker Pass

- `firestore.rules`
- `src/App.jsx`
- `src/features/warehouse/DispatchTableBody.jsx`
- `src/services/executiveDashboardService.js`
- `src/services/pricingEngineService.js`
- `src/utils/incrementalProductStock.js`
- `src/utils/productMeasures.js`
- `src/utils/warehouseDispatchCreate.js`
- `tests/warehouse-dispatch-local-save.test.mjs`
- `tests/warehouse-dispatch-command.test.mjs`
- `tests/warehouse-dispatch-boundary.probe.mjs`
- `tests/warehouse-inventory-integrity.test.mjs`
- `scripts/run-dispatch-certification-emulator.mjs`
- `tsconfig.dispatch.json`
- `docs/reports/BLOCKER_RESOLUTION_REPORT_20261005.md`
- `tests/visual/warehouse-dispatch-create.preview.mjs` (preview-only E2E added in this continuation)

Earlier untracked discovery/registry files and unrelated pre-existing changes were retained. No push, deploy, commit, or production write occurred.

## Remaining Before Module Certification

Remaining before certification: remediate module-wide strict typing, UI/domain/repository separation and design-token gaps; then run Firebase-Emulator-backed UI E2E for create/retry/restart/reject and delayed ACK visibility, failure-at-each-step and in-app inventory reconciliation, read/edit/archive permission UI-to-rules parity, representative staging API/ACK timing and repeated mount/unmount memory/listener checks on browser and Android. Current final status is **FAIL / NOT CERTIFIED** because known mandatory criteria fail; runtime cloud/device evidence is separately **BLOCKED**. Do not lock it or move to another module.

## Prior Iteration Evidence (Historical)

The remaining sections record the earlier BLOCKED iteration; the follow-up matrix and results above supersede its status and test counts.

## Environment

Baseline `main` at `1bd05fc02f3271e37989066ef678bdfd3eb42d80`, with the prior discovery reports untracked. The user confirmed keeping Firebase. This iteration modifies only the dispatch create handler, adds a focused command test and documentation. No push, deployment or production data writes.

Host: Windows, Node test runner. Existing tests use local fixtures/stubbed persistence and extracted application functions. They are not Firebase cloud ACK or phone measurements. Production Vite build completed in 42.20 seconds, 2,503 transformed modules; this is build duration, not app startup latency.

## Screens, Actions And Boundaries

Primary screen: `WarehouseDispatchView` in `src/App.jsx` (baseline line 55137), routed by `MainAppView` with `activeTab=warehouse_dispatch`.

| Surface/action | Source owner | Current evidence |
| --- | --- | --- |
| Daily list, grouped customer/driver rows | editableDispatchRows, groupedEditableDispatchRows, DispatchTableBody | Grouping tests PASS; current UI runtime BLOCKED |
| Inline search and clear | dispatchListSearch, prepared search index | Source mapped; UI feedback/P95 BLOCKED |
| Pagination | dispatchRowPage, CoreRowPager | Source mapped; full UI traversal BLOCKED |
| Date/history/month selection | workingDate, selectedHistoryMonth, selectedHistoryDispatchGroup | Source mapped; current UI traversal BLOCKED |
| Shortage preview/expand/collapse/detail | dispatchShortageCustomerGroups, selectedShortageLine | Existing three-row and arrow guards PASS; live UI BLOCKED |
| Close shortage or archive a request line | handleCloseSelectedShortage, handleDeleteShortageOrderRequestRow | Cross-module write dependency mapped; concurrency/server permission certification pending |
| Customer/product picker, request defaults | handleDispatchCustomerChange, handleDispatchProductChange | Billing/catalog permission guards in existing tests PASS; keyboard UI BLOCKED |
| Quantity, unit, repeated weights | openWeightEntriesEditor, saveWeightEntries | Input/IME/weight utility tests PASS; real keyboard/mount lifecycle BLOCKED |
| Driver selection, reset | effectiveDispatchDriverId, resetDispatchVoiceDraft | Source mapped; reset is a draft action, not a server refresh |
| Create/save and validation | handleSubmitDispatch -> onAddWarehouseDispatch -> App command | Five new behavioral tests PASS after two fixes |
| Read/edit individual cells and weight popup | openDispatchCellEditor, saveInlineDispatchRow, saveDispatchListWeightEntries | Existing weight/billing guards PASS; concurrent edit/restart E2E pending |
| Archive current/history rows | deleteInlineDispatchRow, deleteHistoryDispatchRow | Confirmation and UI permission gates mapped; real server enforcement pending |
| Split sharing/download | handleShareDispatchSheet, handleDownloadDispatchSheet, dispatchSharePages | Customer-preserving page split test PASS; native share/large image lifecycle BLOCKED |
| Voice helpers | handleStartVoice, transcription helpers | Source includes disabled/unreachable legacy AI path; no claim every helper is a reachable current UI feature |
| Back/dismiss | useAppScreenBack, outside-click hook | Source mapped; runtime mount/unmount certification BLOCKED |
| Loading/empty/error/pending/retry | local draft flags, dispatchError, shared write queue | Shared queue tests PASS in isolation; per-row pending visibility and recovery completeness not certified |

No independent user-selectable sort or server-refresh button was established for this screen. Do not invent a test action for a nonexistent control. Sorting is performed by existing projections; freshness is owned by the shared read lifecycle.

Entities: dispatch, order request/line, customer/branch, product, driver/employee, delivery report and derived shortage/stock. Source order creation is a downstream dependency, tested for preserved linkage/date/billing behavior.

Active API path: shared Firestore document writes through the persisted queue, SDK setDoc with REST fallback and snapshot reconciliation. There is no active dispatch-specific HTTP transaction endpoint. UI billing/preparation and command logic remain inside App/screen, so strict repository/domain separation is not yet satisfied.

## Reproduced And Fixed

1. **Rejected local save could reappear.** The handler published a raw row and recent-write overlay before durable enqueue. When storage failed, the row was removed but the overlay survived, allowing reconciliation to reintroduce it. The new behavioral test failed with overlay size 1. Durable enqueue now occurs before either publication. A rejected enqueue leaves both unchanged.
2. **Two separate dispatches were silently collapsed.** A 20-second content heuristic was used even when both records had different client mutation IDs. Two intentional exports with the same goods/weights could return the first record without writing the second. The test failed by returning `saved-a` for `command-b`. When both IDs exist, identity comparison now determines duplication. The legacy heuristic remains for callers without complete command identity.

Before: 3 of the 5 new assertions/tests failed (overlay leak, publication order, independent commands). After: all 5 pass, including same-command replay and legacy duplicate behavior. Business quantities/weights remain unchanged in the assertions. Durable acceptance still returns `queued`; it is not a server success certificate.

## Certification Matrix

| Requirement | Status | Evidence or missing work |
| --- | --- | --- |
| Screens/actions source mapping | PASS | Detailed registry and table above; runtime traversal remains separate |
| Fixed create failure publication | PASS | Executed source handler with rejected durable storage |
| Distinct command identity | PASS | Independent identical exports survive; same ID reuses existing local record |
| Full server-side idempotency | FAIL | Local duplicate matching is not a server transaction enforcing command identity/fingerprint; new document ID remains generated independently |
| Pending versus confirmed business truth | FAIL | Raw dispatches may be consumed before ACK; no complete per-record authoritative/pending separation established |
| Strict typing | FAIL | Existing typecheck targets five payroll utilities; dispatch JSX/command boundaries are outside strict typing |
| Repository/domain boundary | FAIL | Significant preparation, persistence orchestration and domain calculations remain in App/screen |
| Server RBAC parity | FAIL | Generic Firestore employee write rules enforce tenant/session but do not reference dispatch-specific action permissions; UI permission checks are not server enforcement |
| Retry limits and tenant revisions | PASS | Shared tests cover queue persistence, newer revisions, tenant isolation, actual write lock and rollback ordering; this is limited test scope |
| End-to-end offline/restart/conflict | BLOCKED | Current browser execution unavailable; unit evidence alone is insufficient |
| UI P95 <=100 ms | BLOCKED | Not measured this iteration |
| Screen P95 <=200 ms | BLOCKED | Not measured this iteration |
| API P95 <=500 ms | BLOCKED | No verified real cloud test tenant/measurement target |
| Warm/cold start | BLOCKED | Not measured; no physical/virtual Android session tested |
| Memory, orphan listeners/timers | BLOCKED | Owners mapped; repeated runtime mount/unmount and heap evidence absent |
| Design tokens/components | FAIL | Screen retains literal styling and untyped local UI patterns outside shared token/components |
| Current regression tests | PASS | 79 runner tests, zero failures, cancellations or skips |
| Lint / existing typecheck / production build | PASS | All commands exited 0; scoped typecheck does not override strict-typing FAIL |

## Tests Run

`node --test --test-timeout=30000` with:

- warehouse-dispatch-command.test.mjs
- warehouse-dispatch-grouping.test.mjs
- warehouse-dispatch-weight-input.test.mjs
- warehouse-dispatch-order-creation.test.mjs
- warehouse-dispatch-bulk-order-billing.test.mjs
- warehouse-dispatch-local-save.test.mjs
- dispatch-share-pages.test.mjs
- warehouse-inventory-integrity.test.mjs
- save-critical-path.test.mjs
- save-integrity-regressions.test.mjs
- realtime-tenant-sync.test.mjs

Result: 79 PASS, 0 FAIL, 0 skipped. Several legacy scripts bundle multiple assertions into one runner test; 79 is the runner count, not an exhaustive business-action count. Source-string guards are also present in the inherited tests and are not equivalent to browser integration. New tests execute the actual extracted create handler with controlled collaborators.

Also executed `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`: exit 0. No full-app benchmark was run. All test invocations had a 30-second test-runner deadline.

## Technical Blockers And Attempts

Browser discovery selected the existing Codex in-app browser for `http://127.0.0.1:5213/`. Binding that tab was rejected by the browser security policy with a URL protocol error, despite the supplied URL being HTTP. The tool explicitly prohibited alternate browser/CDP workarounds for that action. No bypass was attempted. Therefore E2E, screenshots, interaction latency and heap/lifecycle measurements were not fabricated from the unit tests.

The existing `FIREBASE_PERFORMANCE_ENVIRONMENT.md` records that no verified writable cloud test tenant with equivalent data/rules was established. That report is historical evidence, not a fresh cloud inventory. No benchmark records were created in production, and no other application's project was used. The environment needs a verified target before API/ACK certification.

## Remaining Work In This Module

Keep scope on Xuất kho. Resume runtime inspection when browser access works. Establish a Firebase test target for server validation/ACK tests; an emulator can verify functional transaction/rules behavior but cannot certify cloud latency. Then complete server mutation identity/conflict enforcement, pending/confirmed handling, role-rule parity, strict typed boundaries and module UI token coverage with regression evidence.

Measure interaction/search/navigation/save feedback separately from ACK using the same large dataset and finite deadlines; retain raw sample counts/P95, error and timeout evidence. Test restart/offline/retry/concurrent edits and repeated mount/unmount memory before certification. Do not label this module PASS or proceed to the next module based on the two targeted fixes.

Historical status at the end of that earlier iteration: **FAIL** (preceded by a BLOCKED iteration). Superseded by the current status and evidence at the top of this report.
