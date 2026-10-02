# Export Restore and Performance Report

Date: 2026-10-02 (Asia/Saigon)

## A. Known-Good Baseline

- Baseline: `d426221904c121bc91cf059a6ff334420af15bb8`, 2026-10-02 03:20:01 +0700.
- Commit: `Use current dashboard and navigation on all screen sizes`.
- `git log`, `git reflog`, status, full diff and diff stat were inspected before restoration. App.jsx history, function exports, rules, Firebase configuration and package scripts were compared.
- This is the last committed version before the uncommitted architecture work. Earlier read-only inspection of `app.hdconnect.net/version.json` returned this exact build ID; see `LOCAL_FIREBASE_RUNTIME_VERIFICATION_2026_10_02.md`.
- Its warehouse handler uses the pre-existing durable pending-write queue and Firestore SDK/REST recovery, not the new HTTP inventory contract. Restored behavior was then verified with authenticated local Firebase, not assumed from the commit label.
- This is not a new production acceptance test. No production records were created, modified or deleted.

## Checkpoint

- Local branch: `codex/backup-before-restore-2026-10-02`.
- Commit: `b4a116b40f7580c321e2ecd466bf1e418428b33f`.
- Snapshot includes all tracked changes and non-ignored untracked source/reports using a separate temporary Git index. HEAD and the normal index were not reset or committed over.
- Reports and paused architecture source files remain on disk and in the checkpoint. Ignored local configuration was not deleted or committed. Generated build/test outputs are not the source checkpoint.
- No force push, history deletion or hard reset.

## B. Root Cause

There is no committed migration hash to blame: the breaking change was in the uncommitted working tree, now captured by the checkpoint.

Old path:

`WarehouseDispatchView -> handleAddWarehouseDispatch -> enqueuePendingFirebaseWrite(durable: true) -> flushPendingFirebaseWriteNow -> setDoc / existing Firestore recovery -> artifacts/{appId}/public/data/warehouseDispatches/{id}`.

Broken local path:

`handleAddWarehouseDispatch -> commitAtomicInventoryOperation -> https://us-central1-hd-manager-c5839.cloudfunctions.net/inventoryAtomicOperation`.

The latter endpoint was absent from the 24 deployed functions. The local frontend and new backend contract did not match production. Local rules had also been changed to deny direct warehouse writes. Restoring the old frontend alone without its original rules would not establish a valid local smoke test.

Neither `inventoryAtomicOperation` nor `orderReturnTransaction` was deployed. No staging project or database was created.

## C. Restore

Restored from the baseline:

- `src/App.jsx`: removed the uncommitted inventory/return HTTP callers, whole-app cursor integration and other architecture changes. Existing order/payment/debt/return business behavior is the baseline, not a new redesign.
- `functions/index.js` and `firestore.rules`: exact baseline content; no new function exports or rule bypass.
- `src/services/realtimeListenerPlanner.js`, `src/services/searchEngine.js`: baseline shared behavior.
- `package.json`: baseline default test/build scripts, with four explicit local restore/emulator commands retained/added.
- Baseline assertions restored in order-cross-account-sync, realtime-tenant-sync, save-critical-path, save-integrity-regressions, warehouse-dispatch-grouping and warehouse-dispatch-order-creation tests.

Retained test-only support: demo-project endpoint resolution, Auth/Firestore Emulator connections, existing mock instrumentation and audit tooling. Normal cloud destinations are unchanged. Unrelated Android version edits were preserved.

`tests/export-restore-scope.test.mjs` compares create/edit warehouse handlers byte-for-byte with the baseline and compares function exports/rules exactly. It also guards full-data totals/search and presentation-only paging.

### Smoke: 10/10 PASS

`node scripts/verify-export-restore.mjs` uses real Auth, existing Identity Center Functions and Firestore Emulators, with the original rules loaded. Only loopback network is permitted. No mocked write-success response.

1. Open Warehouse Dispatch.
2. Select customer.
3. Select product.
4. Enter quantity 12.
5. Click Save; independently read the committed document with the local Admin SDK.
6. Reload the entire page and reopen Warehouse Dispatch.
7. Confirm the saved customer/dispatch is visible.
8. Check persisted legacy receipt-based stock: opening 100 minus outbound 12 equals 88; no new inventory operation document.
9. No HTTP 404 and no requests to either new transaction endpoint.
10. No page exceptions or console errors.

The inventory check is against persisted legacy import/dispatch quantities, not the removed `inventoryBalances` model and not a claim of concurrent transactional stock enforcement.

Before optimizing, the same smoke passed with server confirmation observed at 215.98 ms. Final instrumented run: 191.29 ms click-to-independent-read confirmation; app's `setDoc` span 125 ms. Single-run loopback timings, not production SLA or server p95.

Evidence: `test-results/export-restore/smoke.json`, `confirmed.png`. Old local-first semantics remain: queued on device is not reported as cloud-confirmed. No redesign of retries or offline behavior.

## D. Performance Baseline

Measured only after the restored smoke passed, before changing WarehouseDispatchView rendering. The pre-optimization build is preserved under `test-results/full-interaction/export-restored-before/app` and was reused for the final before measurements.

Fixture: 360 customers, 600 products, 4,500 order requests, 4,300 dispatches, 1,800 orders, 900 payments. Isolated preview storage; no production connection. Desktop Chrome, mobile 390x844 and desktop viewport, React production profiling. Not an actual phone/APK or cloud latency test.

CPU samples and source inspection identified the large table render/layout workload: all 4,300 rows were mounted in the component that also owns the entry fields. Baseline open profile included about 604 ms in `getClientRects`; this includes browser/automation layout cost and is not attributed entirely to application JavaScript. Search/input renders also traversed the full displayed table.

## E. Exact Optimization

Only production UI optimization: `WarehouseDispatchView` in `src/App.jsx`.

- Initially render 20 complete presentation groups; `Tải thêm phiếu xuất` adds 20 more.
- Never split row spans within a customer/shipment group.
- Reset the display limit when date/search scope changes.
- Preserve all loaded data, filters, full totals, sharing/export, shortage comparison and write handlers.
- No new reads, listeners, dependencies, schema, write API or backend.

Browser checks verify 20 -> 40 visible rows for the fixture and finding customer 359 beyond the initial page. The old fuzzy search can match broad common words; its matching semantics were deliberately not changed.

## F. Before / After

Median milliseconds, same fixture and measurement method. Five samples for open/picker/customer search/quantity; three for select/product search/save per viewport. Final before and after runs each have 64 successful samples and no failures/errors.

| Action | Mobile Before | Mobile After | Desktop Before | Desktop After |
|---|---:|---:|---:|---:|
| Open module and visible list | 820.5 | 110.7 | 1008.1 | 113.1 |
| Open customer picker | 18.3 | 5.3 | 19.4 | 5.5 |
| Search customer | 430.2 | 15.0 | 464.9 | 16.8 |
| Select customer | 1215.9 | 18.1 | 1282.0 | 20.1 |
| Search product | 19.3 | 3.1 | 17.3 | 3.1 |
| Select product | 454.0 | 10.6 | 464.7 | 11.5 |
| Input quantity | 81.8 | 8.9 | 99.9 | 7.5 |
| Save -> local queue/UI response | 1318.2 | 380.8 | 1448.8 | 430.2 |

Save above is explicitly local preview queue/UI work, NOT server confirmation. Opening the entire historical list is intentionally no longer a first-frame requirement; every group remains reachable via load-more and unchanged full-data search.

### Reads, Listeners and Render Work

- Preview benchmark: 15 active listeners both before/after. Zero instrumented Firestore operations during input/search/select; one local preview write operation during save. Preview has no cloud reads; it cannot measure Firebase billed reads.
- Real Emulator smoke: 15 listeners before/after save. Before save: 15 snapshots delivering 4 server documents in aggregate. After save: 17 snapshots delivering 6 server documents in aggregate. Snapshot document deliveries are NOT billed-read counts (repeated deliveries may include the same document).
- Final smoke network: 326 completed HTTP responses total, including Vite assets; 21 Firebase responses, of which 13 Firestore transport responses. All completed statuses 200/204. These include login/reload, not just Save.
- React measured median work for mobile input: 22.6 -> 4.9 ms for customer search and 16.8 -> 0.7 ms for quantity; mobile save 316.6 -> 242.3 ms. Root profiler events and subscription snapshots are retained in samples.json. These are duration measurements, not a claim of one render per input.
- Cloud billed reads, mobile hardware behavior and real network p95 were not measured. No claim of zero remaining lag or maximum possible speed.

Remaining cost: saving still updates full legacy datasets and causes roughly 0.24-0.29 s of measured React work in this fixture. Global backup/loyalty/other background behavior was restored to baseline, not reworked under the export-only scope. Expanding all groups again can increase DOM cost. A very large single group is rendered whole to preserve its row span.

Evidence directories: `test-results/full-interaction/export-before-full` and `export-after-final` (summary.json, samples.json, observations.json, screenshots). Initial failed selector attempts were test-harness issues, not counted as passing samples; final runs have zero failures. Source changes were not made to conceal those failures.

## G. Regression

- 77/77 tests PASS across 12 selected warehouse/save/scope test files. This includes the five new baseline/scope assertions.
- Authenticated Firebase Emulator smoke: 10/10 PASS before and after optimization.
- Final before/after browser benchmark: 64 + 64 successful samples; paging checks PASS on both viewports.
- `npm run lint`: PASS; targeted lint for new test/script: PASS.
- `npm run typecheck`: PASS (configured payroll TypeScript scope).
- `npm run build`: PASS.
- `git diff --check`: PASS; existing CRLF warnings only.
- Paused Gap A/C architecture sources/reports/tests are preserved but are no longer the default application contract. Those architecture-specific integration assertions are not claimed as current production acceptance; default package scripts were restored to the baseline.

## H. Final Status

RESTORE = PASS

EXPORT PERFORMANCE = PASS

PRODUCTION = NOT RELEASED

GAP A/C = PAUSED BY OWNER

PASS is limited to the local restored contract, measured fixture and listed tests. No production deployment, production data test, new staging, Cancel Order release or Phase 5 work was performed. Local demo URL: http://127.0.0.1:5214/. Existing cloud-configured localhost is not substituted with fake data.
