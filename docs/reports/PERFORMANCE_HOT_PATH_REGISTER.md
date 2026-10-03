# Performance hot-path register

Date: 2026-10-02; baseline `5f162f5c`. All App references mean `src/App.jsx`; line numbers refer to the unchanged current source. Timings below are P50 milliseconds in order **1x / 3x / 6x**. They describe complete actions, not individual helper durations. Confidence H = measured action plus source-profile match; S = source-confirmed risk, isolated cost not measured.

## HP01 - Shared shortage reconciliation

- Module/screen: Don dat (`order_requests`) and Xuat kho (`warehouse_dispatch`), also shell notifications.
- Action/function/source: open and post-save, `buildWarehouseDispatchShortageSummary`, App:10171; `buildLineKeyVariants`:10189; `normalizeLookupText`:4775. Callers:24076,55255,60119.
- Input: requests and their items, dispatches, customer/product catalogs, date/backlog/auto-cancel settings.
- Computation: build lookup Maps; filter dates/archive/closed-short state; expand ID/name aliases; aggregate requested/dispatched quantities; match source/timestamps and derive shortage lines. Normalization repeatedly performs NFD/regex.
- Downstream state: no direct write from pure helper; new derived summary on memo invalidation after arrays/date/policy change.
- Render: shortage groups, badges, request/export rows and shell notifications can rebuild from shared data mutations.
- Persistence: none in helper; mutation causing invalidation is separate. Background: notification calculation may also consume the helper; no isolated contention measurement.
- Baseline: dispatch open 121/457/1026; save_local_queue 389/1358/3022; request open 201/774/1731. These overlap other work and must not be summed.
- Evidence/confidence: H; 6x dispatch-save profile records App:4775 1222 ms self and :10189 385 ms across its wider recording interval.
- Proposed area only: reusable normalized identities and dependency-bounded aggregation; preserve all matching rules and full coverage.

## HP02 - Request enrichment, sorting and sheet rebuild

- Module/screen: Don dat / `order_requests`; open, create, price edit.
- Source/function: `OrderRequestView` App:59141; `visibleRequests`:59830; comparators:59868; sheet grouping:60381; share fingerprint:60621; inline edit:60775.
- Input/computation: latest request versions, customers, active products; per-request customer/product `.find`, date parsing, sorting, flattening, grouping and full sheet signature.
- Downstream: draft/saving state and `setRawOrderRequests` through add/edit handlers:19561,19751; collection replacement invalidates dependent memos.
- Render: first 20 complete customer groups displayed, but enrichment/grouping/signature precede that window.
- Persistence: `saveDataDocument` / backgroundSync callbacks, mock full-store persistence in preview. Background: request-share warmup at62365 can run after sheet changes.
- Baseline: open 201/774/1731; create 863/3160/8061; price save 893/2986/unmeasured at6x (timeout retained).
- Confidence: H for request-create/open profile; price-save isolated breakdown unknown.
- Proposed area: stable lookups, memo dependency precision, incremental group rebuild and separately scheduled share preparation. No semantic/window-size shortcuts.

## HP03 - Export grouping and post-save refresh

- Module/screen: Xuat kho / `warehouse_dispatch`; open, save, refresh visible groups.
- Source/function: `WarehouseDispatchView`:55028; `compactEditableDispatchRows`:55926; group window:56271; `handleAddWarehouseDispatch`:20696.
- Input/computation: raw dispatches, customer/product Maps, dates/driver/status; group and sum quantities/weights, sort; duplicate scan against raw dispatches before save.
- Downstream: `setRawWarehouseDispatches` optimistic append, recent-write cache, durable queue, then asynchronous flush; local enqueue failure removes optimistic row.
- Render: edited/day/grouped/shortage memos invalidated; display starts at20 groups but all source grouping precedes slicing.
- Persistence: App:20797 durable queue serializes pending writes; preview flush also serializes entire mock store. Background: flush and collection refresh may cause later updates, separate from local receipt.
- Baseline: open121/457/1026; save389/1358/3022. Confidence H on action/reconciliation; exact group-only share unmeasured.
- Proposed area: reduce unchanged-row invalidation, indexed duplicate/group lookups, preserve durable acknowledgment boundaries and all totals.

## HP04 - Export picker/search

- Module/screen/action: Xuat kho, customer/product typing and selection.
- Source/function: `rankDispatchPickerOptions`:55745; catalog:55741; product options:55803; filters:55788,55830; render:58414,58433; shared search `src/services/searchEngine.js:120`.
- Input/computation: loaded catalogs, selected customer's eligible products; token ranking then fuzzy fallback when no token match. Per-query normalization and scan; no debounce at these call sites, no result cap in ranking.
- Downstream: search/draft state; memoized options recompute for keyword changes. Render: all matched eligible options, not virtualized.
- Persistence: none for typing; selection only changes draft. Background: no picker-owned network job; global jobs can coexist.
- Baseline: customer input16/59/149; product input3/14/31; customer select19/75/181; product select11/40/90.
- Confidence: H for action timings, S for worst-case catalog fallback. Fast small eligible-product set is not a large-catalog guarantee.
- Proposed area: cache field normalization/rank preparation while preserving token/fuzzy ranking and eligibility.

## HP05 - Stock by date and monthly history

- Module/screen: Nhap Xuat Ton / `warehouse_import`; open, import with expense, change stock date/history.
- Source/function: `buildWarehouseStockRowsForDate`:51953; current memo:52111; monthly day traversal:52424; repeated call:52471; `handleAddWarehouseImport`:19888.
- Input/computation: imports, dispatches, counts, product groups, reset date, per-unit latest count baseline; filter/sum/group movements for each target date; repeat for selected month's date keys.
- Downstream: import/expense write plan, raw import/expense updates, stock and history memos; date/filter state also invalidates work.
- Render: stock cards/table/history computed before display; no remote paging of movements.
- Persistence: `saveAtomicDocuments` at19993, queue/write plan; preview JSON serialization; no new transaction semantics introduced here.
- Background: later snapshots/retries invalidate inputs; no measured background attribution.
- Baseline: open252/860/1824; save_with_expense818/2606/5139. H: 6x open profile includes normalizer1109 ms and stock builder117 ms in wider profile.
- Proposed area: reuse normalized movements and per-day aggregation with exact reset/count boundary semantics. Preserve expense linkage.

## HP06 - Product stock calculation

- Module/screen: Kho san pham / `products`; open and product mutations.
- Source/function: `buildInventoryMetrics`:43959, product map:43986; `src/utils/productMeasures.js:21` `productStockBalance`, :3 `measureQuantity`; UI:68744.
- Input/computation: each active product scans imports/dispatches and nested items; opening stock plus incoming minus outgoing; normalized measure units. P x movement-item work before 50-row UI slice.
- Downstream: derived inventory map/product rows; mutation changes raw products and causes dependent inventory/group/search memos to rebuild.
- Render: all stock calculations, then current page. Persistence: product CRUD through App:19182/19208/19226, mock full-store flush in preview. Background: snapshot replacement can retrigger.
- Baseline: open125/437/900; edit588/1556/3128; create unmeasured/2106/4667; delete unmeasured/1511/3180.
- Confidence H for opening; only measured slowness, not production cause decomposition, for CRUD.
- Proposed area: aggregate movements once by product/unit/date; preserve negative stock, opening fields, archive and quantity precedence.

## HP07 - Delivery reconciliation and legacy pricing

- Module/screen/action: Bao cao giao hang / `delivery_reports`, opening pending reconciliation.
- Source/function: `DeliveryReportView`:48210; candidate index:48469; `resolveDispatchOrderRequestPrice`:48470; dispatch traversal:48825; `src/services/productPricingUnits.js:13,28`; `src/utils/deliveryRequestIndex.js:2`.
- Input/computation: dispatches, reports, requests, customers/products; frozen billing fast path or legacy date/branch/product/unit matching among indexed candidates, grouping and sorting.
- Downstream: derived pending groups/latest-report map; saving report/command via20890/20953 changes collections and optimistic reported-ID set.
- Render: first3 customer groups while full reconciliation is calculated; exit transition220 ms at49038.
- Persistence: no write on calculation; report/command persistence separate. Background: no measured report-save sample; global work remains possible.
- Baseline: open277/1056/2441; report save BLOCKED by mismatched test selector/linked-dispatch fixture.
- Confidence H for legacy-path open; 6x profile unit normalizer560 ms, lookup normalizer549 ms. Frozen production records may be cheaper.
- Proposed area: retain candidate index, cache invariant unit/name work and frozen snapshots; do not replace legacy matching or billing precedence.

## HP08 - Persistence and share preparation cross-cutting

- Modules/screens/actions: all five mutations; request/share preview warmup.
- Source/functions: mock `persistStore` src/mocks/firebase-firestore.js:61; queue App:12273/12308; `prepareOrderRequestSheetBlobs` region62285 and effect62365; IndexedDB asset store5987/6060.
- Inputs/computation: entire preview store serialized per write; pending queue serialized; sheet grouped rows fingerprinted and rendered to canvases/Blobs when cache misses.
- Downstream/render: mock emits collection listeners; raw-array updates trigger downstream views. Share asset cache does not itself change business records.
- Persistence: full mock JSON vs bounded queue JSON vs incremental IndexedDB Blob put. Background: idle/event-triggered share warmup, async work can outlive idle callback.
- Baseline: included in preview save totals above; no independent production or share-warmup timing. Confidence H for mock profile attribution, S for warmup contention.
- Proposed area: isolate benchmark persistence cost, preserve durable production queue, profile share work separately. Never infer production Firestore slowness from mock.
