# Pagination and search audit

Baseline `5f162f5c`, 2026-10-02. Scope: current Firebase company-account path. PASS means only the stated bounded mechanism, not end-to-end speed.

## Source of data

`src/App.jsx:13658` builds collection sources. For company users, every non-message collection is queried with `companyId == tenantCompanyId` at13665, with no limit, orderBy or startAfter. REST equivalent at13761 builds the same tenant filter and no list cursor for these five modules. Active listener selection reduces which collections are subscribed; it does not page records inside a collection.

`src/services/screenCursorRuntime.js` supports cursor primitives but is not imported by current App. It has a test dependency, not active screen integration. Therefore the earlier Gap A/C register cannot certify present pagination. Mock snapshot logic atfirebase-firestore.js:95 sorts/filters a fully loaded store even when a test supplies limit/startAfter.

## Main lists

| List | UI page/window | Remote cursor / limit / order | Local filters and ordering | All loaded first? | Audit status |
|---|---|---|---|---|---|
| Don dat |20 complete customer groups, grows via load-more; App:60504 |None / unbounded / no explicit query order |Version root/latest, archive, permissions, date/sales; timestamps then configured sheet/customer/product order |Yes, enrichment and full totals precede window |NEED_OPTIMIZATION at data/calculation layer; KEEP complete-group UI mechanism |
| Xuat kho |Initial20 groups :56271, local load-more |None / unbounded / no explicit query order |Date, customer/product, employee/status; grouped editable rows and sorting |Yes, shortage and grouping precede window |NEED_OPTIMIZATION; UI window alone is not cursor paging |
| Xuat kho shortages |First3 customers, expand-all :58132 |None |Request date/backlog/expiry/closed-short/source coverage |Yes |NEED_OPTIMIZATION in calculation; never page away needed evidence |
| Nhap Xuat Ton |Date/month tabs, stock/group/detail tables; no remote page |None / unbounded / no explicit query order |Reset date, target date, group/unit, per-month history |Yes, history scans full movement/count inputs |NEED_OPTIMIZATION |
| Products |50 rows via usePagedList :68744 |None / unbounded / no explicit query order |Active/archive, category/unit/discount, ranked search, inventory-positive tab |Yes, stock and filters before slice |PASS for50-row DOM slice only; NEED_OPTIMIZATION for data/stock computation |
| Delivery pending reconciliation |3 customer groups collapsed, expanded list :48999 |None / unbounded / no explicit query order |Working date/employee, reported/pending, legacy matching; reconciliationOrder |Yes, all groups built first |NEED_OPTIMIZATION |
| Delivery history/reports |Client-derived day/history data, no server cursor |None / unbounded |Date/report status and employee restrictions in DeliveryReportView |Yes |NEED_OPTIMIZATION; large history runtime cost unmeasured |

`usePagedList` in `src/services/renderOptimization.js:4` explicitly takes `items.length` and slices the already materialized array. There is no remote read in this hook. A future cursor design must preserve complete totals/reconciliation through an approved architecture; Phase0 does not introduce one.

## Product and customer pickers

| Surface/source | Preloaded set and scan | Normalization / debounce | Result bound / virtualization | Status |
|---|---|---|---|---|
| Export product :55803,:55830 |Full catalog loaded; eligible ordered/fixed/catalog subset ranked per keyword |Shared token ranking builds fields per search; fuzzy second pass if no token hits; no local debounce |No rank limit; :58414/:58433 map every match; no virtualization |NEED_OPTIMIZATION for large fallback set; measured input3/14/31ms does not show a problem for small eligible set |
| Export customer :55788 |Request customer options, not blindly every catalog customer |Same ranker, aliases/phone/address normalized per keyword; no debounce |No rank cap in this path; normal list render |6x149ms input, NEED_OPTIMIZATION |
| Request extra products :60281,:60309 |All active product variants prepared per customer/config dependency, then scan/filter/sort |productMatchesLookup and variant normalization each changed query; no debounce here |16 blank /80 typed results; cap after scan/sort, no virtualization |NEED_OPTIMIZATION in preprocessing, KEEP result/eligibility semantics |
| Request customer :60335 |availableCustomers already loaded; shared customer search |Normalization/field construction per invocation, direct draft term |No remote paging; exact upper UI behavior depends on picker path |NEED_OPTIMIZATION; no isolated picker CPU profile |
| Product management :68726 |All active products filtered then searchProducts |searchEngine builds token fields per record/query; no useDebouncedValue for productSearch |50-row page after full ranking |NEED_OPTIMIZATION in query preparation; PASS bounded DOM |
| Import group picker :51618/:51625 |Group options built from catalogs, imports, dispatches, orders and requests |normalize labels on changed query; no debounce |18 results after filter; no virtualization |Source risk only; isolated cost not measured |
| Import supplier :51666 |Merged recent suppliers and active customer catalog |Per-keyword filter/normalization |8 results at51709; recent candidates18 |Source risk only; keep business deduplication |
| Delivery customer :48426 |Loaded dispatch-customer options |Filter names/term in view |20 blank /30 searched after scan |Bounded display, full client data remains |

## Duplicate mechanisms and limits

`src/services/searchEngine.js:8` normalization, App:4775 lookup normalization and pricing-unit normalization are similar but have different whitespace/fuzzy/unit contracts. App ranker wraps shared search then adds fallback scoring; it is not safe to delete one as a duplicate. Shared search's field index is constructed inside `buildSearchResult` for each record/search, not a persistent index. A historical test imports `createSearchRecordIndex`, but current source search finds no such exported helper; do not credit that absent optimization.

BLOCKED evidence: query count/bytes and Firebase completion time on a real test tenant; catalog-fallback search with worst-case unmatched terms; touch/scroll on physical devices. This audit does not run those scenarios or claim remote pagination is complete.
