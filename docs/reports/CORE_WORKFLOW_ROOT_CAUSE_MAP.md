# Core Workflow Root Cause Map

Date: 2026-10-03. Scope: Order Requests, Orders, Dispatch, Delivery Reports only.
Backend remains Firebase. No cloud data writes, deploy, migration, commit or push in this task.

## Evidence and Counting Rules

Source: `src/App.jsx`, new screen/input components, source-extraction parity tests,
and local Chrome CPU3x profiles in `test-results/full-interaction/root-*`.
Preview data: 364 customers, 600 products, 1800 orders, 900 payments,
4503 order requests and 4303 dispatches. These are isolated local fixtures.
An automation envelope is NOT business CPU time. Sampling self-time is NOT an
exclusive wall-time breakdown. Long-task overlap is NOT attributed wholly to a function.
Native FPS/memory and real Firebase ACK remain unmeasured; neither is used as an excuse
to mark unfinished client work complete.

The counts below are source-level direct calls. Exact descendant render counts,
object-allocation totals and all transitive function counts were not instrumented.
They must not be invented or represented as zero.

## Orders: Search

Character -> OrderSearchInput.onChange -> one local setDraft -> input component.
No root setter, persistence, request, inventory calculation or report aggregation.
After 250 ms debounce -> screen-local orderSearchStore.set -> subscribed input and
OrderManagementView -> prepared index query -> membership filtering -> newest-order
ordering -> paged results. Store writes of an identical value do not notify.

Data/source change -> usePreparedSearch effect -> AbortController -> bounded async
field preparation (at most 24 records or 4 ms per turn) -> cooperative vocabulary
merge sort -> publish only a matching records/getFields index. Unmount aborts work.
Cold input no longer invokes full index construction synchronously.

Original cold path: ranked search -> per-record prepareSearchFields -> normalization
and token/posting allocation -> per-item product lookup -> score/filter/sort.
Product lookup formerly filtered the catalog and searched it for every order item.
Valid-ID lookups now use a first-record Map; legacy name matching remains available.

Remaining: broad queries can still score/sort many candidates synchronously. Local
5k/10k/50k tests prove bounded construction and exact query parity, NOT every broad
query's responsiveness at 50k. Newest-order ordering still operates over matching rows.

## Orders: Quantity / Price / Note and Save

Single-order input -> handleItemChange -> copy draft items array, edit current draft
item -> one setNewOrder -> OrderManagementView. No direct persistence/request.
Bulk input -> handleBulkDraftItemChange -> current bulk draft/item -> local screen
state -> current totals/validation presentation.

Historical `orderPage.items.map` remains in this component. Its status, billing
summary and handlers are therefore still visited on a form render. This has NOT
been established as fully isolated by the new search input component.

Save -> existing single/bulk submit -> session/permission/duplicate guard -> current
draft validation and pricing snapshot -> linked order/payment/expense commands ->
existing durable persistence boundary -> existing confirmation policy -> UI state.
Required financial writes and server checks were not removed. Images/share data
are prepared only for explicit share actions (inherited behavior retained).
No new real-Firebase save or manual-order-create timing was obtained in this task.

## Order Requests: Customer / Product / Quantity / Price / Note

Input -> updateDraft or updateDraftItem -> one setRequestDrafts -> OrderRequestView.
The updater traverses the draft list and selected draft's items, not persisted orders.
Local formatting/current-row pricing remains required for the form.

Before: even with pickers closed, primary and detail form branches ran
searchCustomerRecords over available customers, built customer-scoped product variants,
and called productMatchesLookup once per variant. The latter prepared a one-record
search index repeatedly for the same product. Quantity/price/note reused this render path.

After: all three customer-picker branches return no suggestions when closed; detail
product suggestion branches are guarded by isProductPickerOpen. Extra product picker
does no filter/sort/group when closed. Product fields are indexed once per active
catalog; a query produces a product membership Set used across variants. Original
variant substring matching and final selected/name ordering are retained.

Historical table -> OrderRequestTableRows (React.memo) -> stable current callbacks,
source groups and selected row key. A draft does not become a table prop. This is a
source boundary and parity-tested; it is not a fabricated per-component render counter.
Visible count is customer-group bounded, NOT a strict row/node bound.

Save -> handleSubmitOrderRequests -> validate active draft -> freeze required billing
fields -> onAddOrderRequest/onEditOrderRequest -> durable save -> close/retain form
according to actual receipt/error -> deferred customer product memory update.
Snapshot -> existing shortage/status derived data -> notification reconciliation.
Optional request image/share preparation is not called by ordinary save.

Shortage matching -> customer/product alias index -> timestamp lower bound -> matching
suffix -> quantity/status projection. Same timestamp work is reused without sharing
mutable dispatch-ID result arrays. Per-record WeakMap caches only alias key values,
not quantities, prices or status; every alias value is checked before reuse.
Notification-only projection avoids sorting quantities it does not display.
Remaining: a persisted dataset mutation still rebuilds substantial shortage projections.

## Dispatch: Quantity / Kg / Search / Note

Input -> controlled onChange -> current dispatchDraft setter -> WarehouseDispatchView.
No direct persistence, request, backup or full inventory rebuild from the character.
Required quantity formatting/current draft preview remains.
Historical body -> DispatchTableBody (React.memo), stable callbacks and visible groups.
Search -> local picker state -> existing prepared customer/product indexes and deferred
query -> bounded suggestion results. Input paint and result readiness are separate metrics.

Save -> handleSubmitDispatch -> permission/session/double-submit guard -> draft validation
and selected source resolution -> onAddWarehouseDispatch -> inventory atomic persistence
boundary -> actual receipt -> reset only on acceptance. Required stock validation remains.
Snapshot changes may rebuild grouping/shortage summaries. Those are not quantity keystrokes.
Preview atomic endpoint is locally intercepted; its receipt is NOT a Firebase ACK.

## Delivery Reports: Open / Filter / Current Draft / Save

Navigation -> mount DeliveryReportView -> dayDispatches/dayReports filters FIRST ->
employee assignment scope -> latest report-by-dispatch Map -> current-day groups.
Legacy price lookup -> customer ID/name request index -> getDeliveryRequestMetadata ->
branch/product/date eligibility -> candidate priority comparison -> one best candidate.
Frozen dispatch/source snapshots retain precedence. Historical candidates cannot simply
be restricted to today: old source requests are valid according to existing business rules.

Before: all eligible price candidates were collected/sorted; unused fallback pricing
was prepared, repeated item names/snapshots were normalized for different dispatches.
After: stable one-pass winner selection, immutable record/context name/snapshot caches,
exact product-ID bypasses name preparation, fallback only when needed, legacy unit
configuration resolved only for the selected winner. No price/quantity/unit formula changed.

Filter/draft state -> current screen render -> memoized day/source calculations remain
stable unless their actual dependencies change. Current row previews still calculate.
Save -> existing session/permission validation -> report/payment/expense/cost planning ->
one compound durable boundary -> receipt -> publish UI. Duplicate and failure guards retained.
Delivery scroll timer coalesces requests and clears on unmount.

Remaining: cold mount still synchronously filters historical sources and prepares all
current-day reconciliation groups; measured open long tasks have not all disappeared.

## Cross-Cutting Work

Layout: input harness reads getClientRects; this is automation visibility checking,
not proof of application layout thrashing. No hot input layout read/write loop was removed
without source evidence. Modal/keyboard sizing remains functional.
Persistence: draft typing does not stringify the store. Preview save still serializes
and writes the isolated store; sampled native setItem cost must not be called Firebase.
Background: inherited dispatch typing maintenance guard retained. No unrelated app/server
was stopped. Timers/subscribers/async search cleanup tested; universal leak-free/native
memory claims are not made.
