# Performance data-flow map

Baseline: `5f162f5c`, 2026-10-02. Read-only source audit; no runtime company access. References use current `src/App.jsx` line numbers unless a file is named.

## Shared source and ownership

```text
Firebase documents (authoritative after server confirmation)
  -> tenant collection queries :13658, companyId filter :13665
  -> SDK onSnapshot :14432 OR REST fallback :13732
  -> source merge / recent-local-write overlay / stable collection refs
  -> raw React arrays and tenant/archive useMemo selectors :14822-14873
  -> module selectors -> calculations -> render window -> UI
  -> validated mutation -> local optimistic state / durable queue
  -> SDK or REST persistence -> server snapshot -> reconciliation
```

Production Firestore initialization at645 does not configure a persistent Firestore IndexedDB cache. Auth IndexedDB at633 is a different storage path. React raw arrays/stable maps are caches, not a second authoritative server database. A pending local command is authoritative evidence of the user's unsynchronized intent, not proof that the server accepted it.

Preview substitutes `src/mocks/firebase-firestore.js` through Vite aliases. It loads the whole seed/persisted store, clones snapshots, filters/sorts in memory and serializes the whole mock store per write. Its timing cannot establish cloud write latency.

Alternative VPS branches remain in source (`handleAddWarehouseImport`:19888, `handleAddWarehouseDispatch`:20696), guarded by `isVpsStagingMode`. Phase 0 maps the approved Firebase baseline, does not activate these branches or claim all alternative runtimes are equivalent.

## 1. Don dat

```text
orderRequests + customers + products + dispatches
 -> rawOrderRequests/raw catalog arrays -> company/archive selectors
 -> latest request per version root :59820
 -> visibleRequests enrichment :59830 -> date/sales filters
 -> sorted sheet rows/group totals :60381 + shortage :60119
 -> complete customer groups, initial20 :60504
 -> draft/create or edit :19561/:19751
 -> saveDataDocument :19664/:19796 (backgroundSync path can publish locally)
 -> pending writes/SDK/REST -> raw state + share warmup -> snapshot merge
```

Authoritative: persisted request quantities, source IDs, approval state and frozen billing fields. Temporary: draft, picker terms, editing/saving state. Duplicated: enriched request objects, grouped sheet rows, raw arrays/stable refs and share fingerprint/Blob representation. Serialized: request command, pending queue, share signature; mock store only in preview.

Full collection loaded before display window; no active remote request cursor in App. Memos reuse values on unrelated renders but rebuild when raw request/catalog arrays or filters change. Draft-only changes do not inherently require every memo to rebuild; nonmemo helpers/JSX and share-signature work still run according to their call sites. Mutations changing arrays invalidate enrichment, grouping and shortage.

## 2. Nhap Xuat Ton

```text
warehouseImports + warehouseDispatches + warehouseStockCounts + products/company settings
 -> raw arrays -> tenant/archive filters
 -> product lookup/group options/reset boundaries
 -> buildWarehouseStockRowsForDate :51953
 -> current stock :52111 + per-day monthly history :52424/:52471
 -> stock table, entry form, history/details
 -> import :19888 / stock count :20291 / edit :20053/:20377
 -> import+expense plan :19970 -> saveAtomicDocuments :12838
 -> local collection application -> queue flush -> remote snapshot -> recompute
```

Authoritative: individual movements/counts and company reset settings; stock totals are derived, not a replacement ledger. Temporary: date/unit/group selection and entry drafts. Duplicated: per-date stock rows, month groups and raw/cache arrays. Serialized: write plan (including related expense), pending queue, preview store. No remote movement pagination. Monthly history is a client date filter, not a data limit. Current/date-history memos invalidate on movement/count/product/settings changes; history can rerun the same full movement scan for each date.

## 3. Xuat kho

```text
orderRequests + warehouseDispatches + customers/products (+ staff/policies)
 -> tenant raw arrays -> selected-date requests/dispatches + catalog Maps
 -> shortage :55255 + order-derived options :55310
 -> eligible product/customer picker :55745/:55803
 -> compact/group editable dispatches :55926 -> initial20 groups :56271
 -> input draft -> handleAddWarehouseDispatch :20696
 -> duplicate check + normalized record + optimistic raw append
 -> durable enqueue :20797 -> async flush -> SDK/REST -> receipt/snapshot
```

The durable queue is explicitly separate from server confirmation. Enqueue failure rolls back the optimistic append. Preserve this distinction. Raw/stable/optimistic/queue copies are intentional overlapping representations until acknowledgment. Search/voice/edit drafts are temporary; no per-keypress remote query. All company dispatch/request records arrive before local date filtering; display window does not constrain shortage input. Post-save array replacement rebuilds shortage/grouping and can also affect shell-derived notifications/loyalty.

## 4. Kho san pham / tinh ton

```text
products + warehouseImports + warehouseDispatches (+ orders for financial metrics)
 -> raw company products and movements
 -> buildInventoryMetrics :43959 -> each productStockBalance :43986
 -> inventoryByProductId + category/unit/search filters :68700
 -> usePagedList :68744 (50 rows, in-memory slice)
 -> product create/edit/archive :19182/:19208/:19226
 -> saveDataDocument -> SDK/queue/REST -> raw product update -> rebuild inventory
```

Product catalog and movement records are authoritative after acknowledgment; balance/display rows are derived caches. Search creates ranked/indexed-field objects; page selection is temporary. Product changes invalidate product-dependent stock metrics even if only descriptive fields changed. Full products and movements loaded and computed before UI paging. Catalog search filters loaded records, not remote pages.

## 5. Bao cao giao hang

```text
dispatches + deliveryReports + requests + customers/products
 -> tenant arrays -> latest report per dispatch + customer/product Maps
 -> buildDeliveryRequestIndex :48469
 -> dispatch frozen-price fast path / legacy resolution :48470
 -> pending reconciliation map/group :48825
 -> first3 customer groups / expanded list :48999
 -> report draft / optimistic reported IDs
 -> add/update report :20890/:20935 or command plan :20953
 -> saveDataDocument or grouped writes -> queue/server -> latest report update
```

Persisted report and billing snapshot fields are authoritative; candidate index, pending groups and transition snapshots are caches. Optimistically hidden/reported IDs and form state are temporary. Legacy candidates duplicate references to requests, not another ledger. No remote dispatch/report cursor; date/employee/status restrictions are local selectors after collection loading. Reconciliation memos rebuild when dispatch/report/request/catalog/date dependencies change. Save performance remains unmeasured for the correct linked-row scenario.

## Cross-layer invalidation risk

Mutation -> new collection identity -> company selectors -> multiple module/shell memos. `src/utils/collectionIdentity.js` and stable refs preserve some unchanged objects, but they do not make every aggregate incremental. Do not claim all work runs on every keystroke or, conversely, that useMemo prevents recomputation on data changes. No measured per-component render-count decomposition was inherited; that detail requires targeted traces later.
