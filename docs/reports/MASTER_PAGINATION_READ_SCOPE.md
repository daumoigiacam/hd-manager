# Master Pagination Read Scope

Date: 2026-10-03. Evidence: current, modified workspace source, not merely committed master. Source anchors below are one-based lines inspected for this report; later edits can move them.

Scope: architecture/read-scope review only. This report is the only file changed for this request. No App, helper, query configuration, rules, workflow or test edits; no tests, builds, network requests, deployments, emulator runs or browser profiling during the serial CPU benchmark.

## Decision Summary

Actual REST request pagination is integrated, but it deliberately drains the complete employee tenant collection before publication. It does not satisfy a screen requirement to avoid fetching records outside the visible page. Existing UI pagination and incremental snapshot decoding do not change that conclusion.

The smallest evidenced next decisions are:

1. Remove `pricingChangeLogs` from interactive activation after confirming the inspected consumer inventory remains current. No rendered or calculation consumer was found; retain independent backup/reset support.
2. Replace the interactive full `zalo_inbox_bridge_logs` source with a separate bounded latest-log query, subject to timestamp coverage/type, ordering parity and index readiness. Only five logs are currently displayed.
3. Do not count removal of `activityLogs` as interactive-read savings: it is already absent from the current collection bindings and foreground route map.
4. Do not truncate shared orders, stock, customers, payments or payroll arrays to a visible page/date range. First separate list-only state from the specific complete-history consumers documented below.

These are actionable findings, not a FULLPASS certification or proof of production read/billing savings.

## Actual Query Paths

The collection registry is [App.jsx:1039](<D:/quản lý bán hàng 1/src/App.jsx:1039>). Startup blockers are identity-only; baseline listeners remain companies, employees and notifications at [App.jsx:1041](<D:/quản lý bán hàng 1/src/App.jsx:1041>) and [App.jsx:1046](<D:/quản lý bán hàng 1/src/App.jsx:1046>). Per-tab activation is declared at [App.jsx:1047](<D:/quản lý bán hàng 1/src/App.jsx:1047>).

| Session/source | Actual server scope | Completeness / bound | Source |
| --- | --- | --- | --- |
| Employee companies | Exact tenant document, not a collection scan | One document | [App:13720](<D:/quản lý bán hàng 1/src/App.jsx:13720>) |
| Employee ordinary collections, including notifications | `companyId == tenantCompanyId` | SDK listener query has no document limit; REST fallback drains full collection | [App:13726](<D:/quản lý bán hàng 1/src/App.jsx:13726>), [App:13880](<D:/quản lý bán hàng 1/src/App.jsx:13880>) |
| Employee manager messages | Company equality, `createdAt DESC`, `limit(200)` | Bounded latest window, not complete message history | [App:13735](<D:/quản lý bán hàng 1/src/App.jsx:13735>) |
| Employee non-manager messages | Company + assigned customer-support conversation + assignment state; separate company + internal/internal_group/support query; both `createdAt DESC`, `limit(200)` | Up to 200 per source; deduplicated union can reach 400. REST multi-source branch uses SDK queries, not full collector | [App:13748](<D:/quản lý bán hàng 1/src/App.jsx:13748>), [App:13810](<D:/quản lý bán hàng 1/src/App.jsx:13810>) |
| Customer own customer record | Exact customer document | One document | [App:13763](<D:/quản lý bán hàng 1/src/App.jsx:13763>) |
| Customer owned ordinary collections | Company + customer equality | Complete matching customer-scoped result; not a visible-page bound | [App:13674](<D:/quản lý bán hàng 1/src/App.jsx:13674>), [App:13766](<D:/quản lý bán hàng 1/src/App.jsx:13766>) |
| Customer notifications | Company + customer + recipientType customer, `createdAt DESC`, `limit(100)` | Bounded latest window | [App:13775](<D:/quản lý bán hàng 1/src/App.jsx:13775>) |
| Customer messages | Company + customer + customer_support, `createdAt DESC`, `limit(100)` | Bounded latest window | [App:13782](<D:/quản lý bán hàng 1/src/App.jsx:13782>) |

REST mirrors the special inbox order/limits at [App.jsx:13854](<D:/quản lý bán hàng 1/src/App.jsx:13854>). Companies, customer sessions and messages are excluded from the generic employee full collector at [App.jsx:13879](<D:/quản lý bán hàng 1/src/App.jsx:13879>). Preserve these exceptions and all role/customer filters in any replacement adapter.

### Complete REST collector

- [firestoreRestPagination.js:46](<D:/quản lý bán hàng 1/src/services/firestoreRestPagination.js:46>) accepts only a direct collection with employee tenant equality and stable document-name order. It is not an arbitrary date/search/list query adapter. Companies and customer_accounts are explicitly excluded at line 69.
- Default page size is 50, maximum 200; App explicitly requests 200 at [App.jsx:13887](<D:/quản lý bán hàng 1/src/App.jsx:13887>).
- [firestoreRestPagination.js:191](<D:/quản lý bán hàng 1/src/services/firestoreRestPagination.js:191>) loops until a short page, using `__name__ ASC`, a full `referenceValue` cursor, exclusive `startAt.before=false`, and pinned `readTime` on later requests. Exact multiples of the page size require a final empty-page request.
- Bootstrap timestamps requiring microsecond truncation or consistent-time replay discard the original page before decoding/publication; at most one bootstrap replay occurs. Later missing/inconsistent readTime rejects ([line 208](<D:/quản lý bán hàng 1/src/services/firestoreRestPagination.js:208>)). Accepted response metadata includes boolean done presence and object explainMetrics ([line 84](<D:/quản lý bán hàng 1/src/services/firestoreRestPagination.js:84>)); this report does not newly validate live REST behavior.
- The public result preserves `{id,data}` and resolves only after exhaustion ([line 225](<D:/quản lý bán hàng 1/src/services/firestoreRestPagination.js:225>)). App publishes only after its current-generation check ([App.jsx:14269](<D:/quản lý bán hàng 1/src/App.jsx:14269>)). Cancellation/error does not publish partially collected pages.
- Per-page 9 seconds covers token/retry/fetch/JSON; eligible complete scans have a 120-second whole-collection budget ([App.jsx:13889](<D:/quản lý bán hàng 1/src/App.jsx:13889>), [App.jsx:14257](<D:/quản lý bán hàng 1/src/App.jsx:14257>)). Progress does not renew the whole budget. Failure can preserve previous stable data; it is not evidence that new data is complete/fresh.
- This bounds each response and duration, not total collection memory/documents. Successful scans still read all matching documents, with possible discarded bootstrap documents. The fixed timestamp is per scan/collection, not a shared transaction snapshot across orders, payments, imports and expenses.

### Listener scheduling and UI slices

Foreground overflow still calls `readCollection`, which performs the complete scan. A listener-count cap and bounded warm LRU do not cap documents per query ([App.jsx:14604](<D:/quản lý bán hàng 1/src/App.jsx:14604>), [App.jsx:14631](<D:/quản lý bán hàng 1/src/App.jsx:14631>)). A future page source must remove the competing generic listener, overflow read and refresh owner, not merely add a limited query beside them.

`usePagedList` computes `items.length` then slices the already available array ([renderOptimization.js:4](<D:/quản lý bán hàng 1/src/services/renderOptimization.js:4>)); `useChunkedList` also slices local items ([line 94](<D:/quản lý bán hàng 1/src/services/renderOptimization.js:94>)). Neither performs a server cursor read.

## Existing Page Helpers Are Not an Integrated Replacement

No import/use of `screenCursorRuntime` or `createScreenCursorRuntime` was found in current App. Its tab mapping is therefore not evidence of active server paging.

| Helper | Useful existing behavior | Gate before reuse |
| --- | --- | --- |
| [firestoreCursorPagination.js:47](<D:/quản lý bán hàng 1/src/services/firestoreCursorPagination.js:47>) | Tenant equality + documentId ASC + startAfter(snapshot) + limit | At line 70, data spread can overwrite actual document ID. No caller-equivalent `{id,data}` decoder, date/search/role query shape or REST fixed-time contract. `mergeCursorItems` line 36 re-sorts IDs with localeCompare, not necessarily server order or current chronological UI order. |
| [firestoreCursorPagination.js:89](<D:/quản lý bán hàng 1/src/services/firestoreCursorPagination.js:89>) | Full SDK cursor collector with duplicate guard | Auto-drains, exposes onPage, and has no cross-page pinned snapshot. Do not use it to publish partial financial truth; a nonadvancing page can also be reported exhausted by the page reader. |
| [tenantListReadModel.js:4](<D:/quản lý bán hàng 1/src/services/tenantListReadModel.js:4>) | Explicit list-only state, tenant return validation, arbiter invalidation | Caller metadata is not authorization. Preserve query-specific order/eligibility and actual document identity before reuse. |
| [screenCursorRuntime.js:19](<D:/quản lý bán hàng 1/src/services/screenCursorRuntime.js:19>) | Separate page state and lifecycle | Only dispatches are declared authoritative here; that is incomplete compared with actual dependencies below. At lines 98/163, refresh can coalesce into an old in-flight page instead of invalidating it. At line 170, local mutations update runtime state without equivalent tenant/query membership checking or synchronizing the underlying model. |

Do not directly replace shared App arrays with these helper results. Harden the narrow adapter contract first; avoid broad helper changes during the frozen benchmark pair.

## Core Module Read Classification

"Coupled" means at least one established consumer needs more than the displayed records. It does not mean every prop or every historical document is necessary for every role. Query projection or date narrowing needs a consumer-specific proof, not a broad route flag. Baseline employee notifications and previously warmed sources can add reads beyond the route's declared set.

| Module | List surface vs established calculations/actions | Safe decision now / current anchors |
| --- | --- | --- |
| Home / executive dashboard | Summary, inventory, profit/debt, salary/review and operating signals, not a standalone recent-items list | Coupled. Dashboard receives broad datasets and reconciled ledger: [App:25878](<D:/quản lý bán hàng 1/src/App.jsx:25878>); inventory helper [App:44328](<D:/quản lý bán hàng 1/src/App.jsx:44328>), dashboard use [App:43049](<D:/quản lý bán hàng 1/src/App.jsx:43049>). |
| Orders | Visible page is local; allCompanyOrders additionally prevents invoicing a warehouse dispatch twice; customer ledger/payment/delivery links | Coupled. Duplicate check [App:65051](<D:/quản lý bán hàng 1/src/App.jsx:65051>); local page [App:65228](<D:/quản lý bán hàng 1/src/App.jsx:65228>); shared ledger [App:24453](<D:/quản lý bán hàng 1/src/App.jsx:24453>). |
| Order requests | Filtered rows, editing/sharing and dispatch coverage use requests + dispatches + product/customer/employee identities | Not proven list-only. Actual callback boundary [App:59541](<D:/quản lý bán hàng 1/src/App.jsx:59541>); dispatch shortage consumes requests outside today's visible page [App:55641](<D:/quản lý bán hàng 1/src/App.jsx:55641>). |
| Warehouse import / stock history | Day/month rows coexist with cumulative opening/remaining quantities and prior actual-count baselines | Full-history coupled. Reset [App:52146](<D:/quản lý bán hàng 1/src/App.jsx:52146>); prepared sources [App:52329](<D:/quản lý bán hàng 1/src/App.jsx:52329>); stock callback [App:52341](<D:/quản lý bán hàng 1/src/App.jsx:52341>); monthly replay [App:52855](<D:/quản lý bán hàng 1/src/App.jsx:52855>). |
| Warehouse dispatch | Day display, earlier open requests, shortage, imports/stock and linked driver/delivery history | Coupled. View [App:55414](<D:/quản lý bán hàng 1/src/App.jsx:55414>); shortage explicitly includes previous open orders [App:55641](<D:/quản lý bán hàng 1/src/App.jsx:55641>). |
| Delivery reports | Report list plus cross-linked orders/requests, dispatch/import records, payments, expenses and asset costs | No established independent list source. Split linked detail/action requirements before bounding reports or companion datasets: [App:48582](<D:/quản lý bán hàng 1/src/App.jsx:48582>). |
| Customers / suppliers | Customer/supplier pages are local; payable/receivable reconciliation, history, points/loans and stock/product pricing also use these inputs | Coupled. Ledger [App:70336](<D:/quản lý bán hàng 1/src/App.jsx:70336>); supplier/customer slices [App:70469](<D:/quản lý bán hàng 1/src/App.jsx:70469>), [App:70546](<D:/quản lý bán hàng 1/src/App.jsx:70546>). |
| Debt | Paged customers plus complete ledger/opening debt, orders/payments, supplier imports and expenses | Coupled. Ledger [App:80875](<D:/quản lý bán hàng 1/src/App.jsx:80875>); local slice [App:81079](<D:/quản lý bán hàng 1/src/App.jsx:81079>). |
| Finance | Period-filtered transactions and totals coexist with customer debt/payment options and linked source records | Coupled. Complete customer ledger [App:47579](<D:/quản lý bán hàng 1/src/App.jsx:47579>); local page and official transaction totals [App:47752](<D:/quản lý bán hàng 1/src/App.jsx:47752>). |
| Bank payments / reconciliation | Transaction list plus pending/matched counts, today's QR amount and order/customer associations | Coupled. Full maps [App:36326](<D:/quản lý bán hàng 1/src/App.jsx:36326>); stats [App:36385](<D:/quản lý bán hàng 1/src/App.jsx:36385>). Do not page-truncate payments or reconciliation state. |
| Products | Local product page plus complete catalog options/grouping and stock from orders/imports/dispatches | Coupled. Stock-backed metrics [App:69100](<D:/quản lý bán hàng 1/src/App.jsx:69100>); local product slice [App:69160](<D:/quản lý bán hàng 1/src/App.jsx:69160>). |
| Pricing | Active route renders SimplePricingEngineView, not the larger PricingEngineView; current costs, groups, formulas and suggestions use products/orders/requests/imports/dispatches/counts/inputs/rules | Coupled core inputs, removable-log candidate separately. Route [App:25955](<D:/quản lý bán hàng 1/src/App.jsx:25955>); active engine snapshot [App:38574](<D:/quản lý bán hàng 1/src/App.jsx:38574>). A short rendered input/suggestion list is not proof inputs are list-only. |
| Price quotes | Customer/product targeting and order activity affect the quote workflow | Not proven list-only. Actual route [App:25956](<D:/quản lý bán hàng 1/src/App.jsx:25956>); component [App:40209](<D:/quản lý bán hàng 1/src/App.jsx:40209>). Audit narrow recipient-directory mode separately. |
| Employees / employee reviews | Employee directory plus attendance, complaints, evaluation/performance and payroll/debt/advance links | Coupled. Review calculation [App:75990](<D:/quản lý bán hàng 1/src/App.jsx:75990>), directory module [App:76551](<D:/quản lý bán hàng 1/src/App.jsx:76551>); route inputs [App:1060](<D:/quản lý bán hàng 1/src/App.jsx:1060>). |
| Attendance | Date display/summary and employee actions; attendance also feeds reviews/payroll | Separate date-scoped display is a future candidate, not safe truncation of shared attendance. Actual view [App:27738](<D:/quản lý bán hàng 1/src/App.jsx:27738>); salary use [App:78988](<D:/quản lý bán hàng 1/src/App.jsx:78988>). |
| Payroll | Salary construction uses attendance, financials, performance, customers/orders/payments, holidays, evaluations and opening carryovers; lock actions persist complete period snapshots | Coupled. Live salary [App:78988](<D:/quản lý bán hàng 1/src/App.jsx:78988>); lock payload [App:79110](<D:/quản lý bán hàng 1/src/App.jsx:79110>). Locked snapshots/adjustments already load by tenant + periodId, not arbitrary whole-history UI pages [App:18387](<D:/quản lý bán hàng 1/src/App.jsx:18387>). |
| Assets | Asset list plus all linked cost/fuel/distance logs and fleet summary | Coupled. Per-asset metrics and summary [App:35632](<D:/quản lý bán hàng 1/src/App.jsx:35632>); metric aggregation [App:35546](<D:/quản lý bán hàng 1/src/App.jsx:35546>). |
| Points / rewards / promotions | Reward lists coexist with balances, redemption/settings and customer-portal eligibility | No proven harmless truncation of shared points/catalog. Route scope [App:1057](<D:/quản lý bán hàng 1/src/App.jsx:1057>); portal inputs [App:81808](<D:/quản lý bán hàng 1/src/App.jsx:81808>). Require consumer-specific audit before a bounded catalog-only mode. |
| Messages / notifications | Message source windows are already bounded; local conversation/notification rendering and unread/business signals still depend on supplied windows and other business arrays | Preserve existing bounds and role filters; do not call them full-history counts. Local conversation chunking [App:45905](<D:/quản lý bán hàng 1/src/App.jsx:45905>); generated notifications [App:24491](<D:/quản lý bán hàng 1/src/App.jsx:24491>); unread counts [App:24745](<D:/quản lý bán hàng 1/src/App.jsx:24745>). |
| Settings / Zalo | Configuration and backup controls; runtime queues/inbox dedupe/readiness/rate limits are not merely log lists | Bridge logs can be independent; queues cannot be truncated wholesale. Ready work [App:29305](<D:/quản lý bán hàng 1/src/App.jsx:29305>), hourly limit [App:29814](<D:/quản lý bán hàng 1/src/App.jsx:29814>), duplicate inbox lookup [App:30021](<D:/quản lý bán hàng 1/src/App.jsx:30021>). |
| Customer portal / customer order | Own-history balance, loans/points, pricing, cart and order workflows | Keep customer-only access and complete matching history wherever calculations need it; inbox100 is a separate exception. View [App:81808](<D:/quản lý bán hàng 1/src/App.jsx:81808>); pricing [App:82284](<D:/quản lý bán hàng 1/src/App.jsx:82284>); customer query scopes above. |

### Why visible dates do not bound authoritative history

Warehouse history preparation filters archive/reset eligibility once, then lazily caches measures. It still starts from complete import/dispatch/count arrays; it is a CPU optimization, not a narrower data query. The callback selects latest count measures before the target date ([App.jsx:52394](<D:/quản lý bán hàng 1/src/App.jsx:52394>)), then accounts for subsequent imports/dispatches through the target date ([App.jsx:52420](<D:/quản lý bán hàng 1/src/App.jsx:52420>)). Same-day baseline timestamp comparisons and product/unit lookup remain relevant. A month report calls it for each date; loading only that month's movements loses prior opening balance/counts.

Debt reconciliation combines customer opening balances, orders, payments, imports and expenses ([App.jsx:10900](<D:/quản lý bán hàng 1/src/App.jsx:10900>)). Orders additionally use raw all-company orders for dispatch reuse prevention. Date-bound list results must never replace these authoritative sources, nor imply a complete search result, count or balance.

A future date-only screen adapter is feasible only if its list is separate and all opening balances/prior counts/duplicate checks are supplied independently with equivalent semantics. Without an existing equivalent indexed summary/read model, retaining full history for those consumers is necessary. Paging the list while keeping an unconditional full fetch beside it is not a document-read reduction.

## Unnecessary Interactive Read Candidates

### pricingChangeLogs: strongest removal candidate

It is activated on pricing ([App.jsx:1065](<D:/quản lý bán hàng 1/src/App.jsx:1065>)), bound to a raw setter ([App.jsx:14364](<D:/quản lý bán hàng 1/src/App.jsx:14364>)), and tenant/archive filtered ([App.jsx:15518](<D:/quản lý bán hàng 1/src/App.jsx:15518>)). Remaining occurrences are registry/local setter/reset/backup support and root prop forwarding/destructuring ([App.jsx:23442](<D:/quản lý bán hàng 1/src/App.jsx:23442>), [App.jsx:23980](<D:/quản lý bán hàng 1/src/App.jsx:23980>)). No rendered list or calculation use was found in App or the other src files searched.

Recommended later change: remove its interactive activation, not its backup collection, reset scope, stored records or authorization. Confirm no pending source change introduces a consumer. This is avoided unnecessary collection loading, not cursor pagination.

### zalo_inbox_bridge_logs: first real bounded-query candidate

Messages/settings both request it ([App.jsx:1068](<D:/quản lý bán hàng 1/src/App.jsx:1068>)); the generic binding ([App.jsx:14358](<D:/quản lý bán hàng 1/src/App.jsx:14358>)) currently has tenant-only full-query semantics. Its filtered array ([App.jsx:15031](<D:/quản lý bán hàng 1/src/App.jsx:15031>)) is sorted by stringified createdAt ([App.jsx:29754](<D:/quản lý bán hàng 1/src/App.jsx:29754>)). The discovered rendered consumer shows only `.slice(0,5)` ([App.jsx:31674](<D:/quản lý bán hàng 1/src/App.jsx:31674>)). No calculation, dispatcher decision or duplicate check on this log array was found.

The inbox duplicate check uses `zaloInboxMessages`, not bridge logs ([App.jsx:30021](<D:/quản lý bán hàng 1/src/App.jsx:30021>)). Therefore preserve operational inbox reads while replacing only the log display source.

### activityLogs: not a current interactive full-read problem

It is in DATA_COLLECTION_NAMES/backup/reset labels, but absent from allCollectionBindings ([App.jsx:14321](<D:/quản lý bán hàng 1/src/App.jsx:14321>)) and FOREGROUND_REALTIME_COLLECTIONS_BY_TAB. Payroll lock journals and adjustment audit writes remain real uses ([App.jsx:18575](<D:/quản lý bán hàng 1/src/App.jsx:18575>), [App.jsx:18741](<D:/quản lý bán hàng 1/src/App.jsx:18741>)). Keep audit records and protected semantics; don't claim nonexistent interactive full reads were eliminated.

### Other conditional candidates, not established savings

`pricingScenarios` is activated and bound ([App.jsx:1065](<D:/quản lý bán hàng 1/src/App.jsx:1065>), [App.jsx:14363](<D:/quản lý bán hàng 1/src/App.jsx:14363>)), but the active SimplePricingEngineView route does not receive it ([App.jsx:25955](<D:/quản lý bán hàng 1/src/App.jsx:25955>)). Its rendered scenario consumer is in the larger PricingEngineView definition ([App.jsx:38374](<D:/quản lý bán hàng 1/src/App.jsx:38374>)); a real scenario-write handler exists ([App.jsx:20655](<D:/quản lý bán hàng 1/src/App.jsx:20655>)). Audit reachability of that feature before removing interactive activation; don't classify stored simulations as disposable.

Do not treat Zalo send/campaign queues, inbox records, pricingInputs, payment_reconciliations, attendance or notification inputs as unused just because a panel is hidden or displays a short slice. Readiness, throttling, dedupe and financial/HR consumers are concrete counterexamples. Additional overdeclared route inputs warrant a separate consumer audit, not speculative removal here.

## Initial SDK Reads, Incremental Decode and Billing

The installed SDK contract says the first QuerySnapshot.docChanges result contains every document as added: [snapshot.d.ts:497](<D:/quản lý bán hàng 1/node_modules/@firebase/firestore/dist/firestore/src/api/snapshot.d.ts:497>). App still subscribes to the original full tenant queries ([App.jsx:14564](<D:/quản lý bán hàng 1/src/App.jsx:14564>)). Initial server loading of those queries is not made document-bounded by the incremental helper.

[realtimeSnapshotItems.js:63](<D:/quản lý bán hàng 1/src/services/realtimeSnapshotItems.js:63>) fully maps the first event and reuses decoded data for unchanged documents on later trusted deltas. App creates one collector per source, passes captured source identity, and feeds it before shouldApply/cache/metadata gates ([App.jsx:14457](<D:/quản lý bán hàng 1/src/App.jsx:14457>)). Source-data comparison preserves publication after previously ignored cache changes and avoids redundant metadata-only setters ([App.jsx:14485](<D:/quản lý bán hàng 1/src/App.jsx:14485>)).

This reduces data()/normalizer work, not the original query result. It still traverses snapshot.docs/order and creates output wrappers, so it is not an O(changes)-only entire callback. A 4000 -> 1 -> 0 decode counter is CPU evidence, not 4000 -> 1 -> 0 billable reads. Initial server queries/listeners remain subject to Firestore read billing; cache/metadata callbacks, reconnects and server changes cannot be priced from JavaScript data() counts. No production billing/read telemetry or current pricing verification was performed in this report.

Employee notifications remain an uncapped tenant query, unlike the customer100 window. The dialog's 60/80 chunking ([App.jsx:24739](<D:/quản lý bán hàng 1/src/App.jsx:24739>)) is local. A bounded notification list would need separate equivalent unread counts/business signals; simply slicing shared notification input silently changes those semantics.

## Backup and Authorization Remain Independent

Backup collection names derive from the registry, excluding companies from the generic list ([App.jsx:7426](<D:/quản lý bán hàng 1/src/App.jsx:7426>)). Backup independently reads complete SDK tenant queries for each collection through collectBackupCollections ([App.jsx:17521](<D:/quản lý bán hàng 1/src/App.jsx:17521>)); it does not depend on interactive arrays or their completeness. Companies use the current company or exact document fallback ([App.jsx:17531](<D:/quản lý bán hàng 1/src/App.jsx:17531>)). Background yielding changes scheduling, not coverage.

Consequently bridge-log or pricingChangeLogs interactive read removal must not remove their complete backup/export/reset support. Do not substitute page state for an export, nor certify backup as a single cross-collection snapshot. Existing sourceCompanyId/legacy-dispatch postfilter acceptance is broader than the production companyId query coverage ([App.jsx:17488](<D:/quản lý bán hàng 1/src/App.jsx:17488>)); that is a separate coverage question, not permission to issue a broader query.

Keep tenant-session guards, authenticated user transport, exact company identity and credential exclusions. REST context is scope metadata, not proof of permission. Rules require identity, signed-in-company ownership, application-document access and payroll access on list reads ([firestore.rules:859](<D:/quản lý bán hàng 1/firestore.rules:859>)); messages have extra employee authorization and customer_accounts is excluded ([firestore.rules:388](<D:/quản lý bán hàng 1/firestore.rules:388>)). A limited query must preserve role/customer/assignment constraints, not weaken them. Hidden UI is not an authorization boundary.

## Bridge Page Enablement Gates

Proposed narrow adapter: company equality, `createdAt DESC`, explicit document-name DESC tie-breaker, exclusive full cursor tuple, `limit(5)` for today's actual display. If a separate history UI is later added, default50/cap200 with next-page requests only on explicit demand. No auto-draining into a supposedly paginated screen.

1. Verify timestamp presence and type without production writes. Current full-query/client sort retains records without createdAt by treating it as an empty string. The installed SDK explicitly excludes records missing an orderBy field ([query.d.ts:191](<D:/quản lý bán hàng 1/node_modules/@firebase/firestore/dist/firestore/src/lite-api/query.d.ts:191>)). All-missing or sparse legacy fixtures expose an immediate parity gap. Adding orderBy is not behavior-neutral.
2. Verify normalized ordering. Current SDK mapper turns top-level timestamps into ISO strings ([App.jsx:13712](<D:/quản lý bán hàng 1/src/App.jsx:13712>)); native Firestore mixed string/Timestamp ordering is not equivalent to sorting those normalized strings. The local bridge writer supplies ISO createdAt but spreads payload afterward ([App.jsx:29985](<D:/quản lý bán hàng 1/src/App.jsx:29985>)); it alone cannot prove coverage/type for all historical writers/imports.
3. Define tie parity. Current client sort has no explicit document-ID tie-breaker. Prove the chosen server tie order matches the existing full result, or document/approve an intentional display-order change. Document-name-only paging cannot promise newest-five parity.
4. Verify index readiness later. The repository declares inbox composites ([firestore.indexes.json:80](<D:/quản lý bán hàng 1/firestore.indexes.json:80>), [line 120](<D:/quản lý bán hàng 1/firestore.indexes.json:120>)), but no companyId/createdAt bridge-log composite. No deployed-index inspection occurred. Do not infer it exists, and do not deploy an index/backfill/schema migration during the freeze.
5. Until these gates are resolved, keep the new adapter disabled. If legacy coverage requires a migration and migrations are forbidden, this chronological bounded path is blocked; say so. Do not repair it with a hidden full scan, insecure unfiltered query, or silent omission. A missing-index/permission failure should remain explicit, not return an empty authoritative collection.
6. Keep page state/loading/error/cursor separate from shared authoritative arrays and collection-server-confirmed flags. Refresh/delete/archive/source-scope changes invalidate its generation and cursor. Live latest-page updates must not corrupt accumulated older-page order or duplicate records.

## Minimal Next Source Plan After the Freeze

1. Confirm/remove the proven-unused pricingChangeLogs interactive activation; retain backup/reset capability. Consider pricingScenarios only after its feature reachability check.
2. Establish bridge timestamp/index/order readiness. Build a single-purpose list adapter rather than widening the full authoritative REST collector's validation. It must retain document identity, normalizer semantics, query shape, tenant/RBAC and cancellation.
3. Replace only the bridge-log display source; eliminate its generic full listener/overflow/refresh ownership. Load five latest records once or subscribe to that limited window. Add older pages only if a visible history workflow needs them.
4. For operational date lists, specify distinct list and calculation contracts. Independent complete/history or equivalent indexed opening-balance/duplicate/reconciliation inputs must exist before removing their shared full reads. Customer/product directory-only modes may be candidates after counts, selection options, prices and global search are separated.
5. Do not present a page adapter plus an unconditional authoritative scan as completion of the no-full-dataset screen requirement. Report remaining full reads by consumer, including baseline notifications and independent backups.

## Verification Strategy for Later Execution

No verification commands were run during this documentation task. Required later evidence:

- Extracted actual App callbacks: one initial limited query, correct bound/order/filters, zero competing generic full reads on activation, overflow, revisit and refresh; backup still independently complete.
- Demo/local emulator only when explicitly allowed: authenticated allowed/denied role/customer/tenant query behavior, actual REST readTime/response contract, deterministic cursor boundaries. No production writes.
- List parity against complete fixtures: equal timestamps, missing createdAt, mixed Timestamp/string values, empty/<5/exact5/>5, archive/delete/update and stable IDs. Resolve schema/tie differences before asserting newest-five equality.
- Page lifecycle: no automatic drain, exclusive cursor, request/document accounting, malformed/nonadvancing errors, generation abort, scope/filter change, auth retry, token/JSON stalls and no stale publication. Ensure refresh supersedes an in-flight older page.
- Business replay: unchanged stock day/month opening values, reset date/at, prior counts, product/unit measures, duplicate-dispatch invoice prevention, customer/supplier debt, reconciliation and payroll lock/carryovers when visible lists are partial.
- Read accounting: distinguish browser decode counters, mock request/document counts, emulator transport evidence and actual production billing. CPU profiling alone cannot establish document-read savings.

Remaining limitations: no live collection coverage, deployed indexes, production query telemetry or billing were inspected. Static consumer evidence establishes a narrow bridge-log/removable-log path and concrete blockers; it does not certify every core module as server-paginated or financially complete under arbitrary partial data.

## Subsequent Interactive Read Change

The coordinating implementation removed `pricingChangeLogs` from the pricing foreground activation and `allCollectionBindings`. The active SimplePricingEngineView does not consume this collection; removing both owners prevents a refresh/overflow path from starting a competing read. Raw state/reset mappings, DATA_COLLECTION_NAMES, backup enumeration, stored records and security are unchanged. `tests/master-interactive-read-scope.test.mjs` guards those boundaries. This is removal of unnecessary interactive work, not a claim of UI cursor pagination or measured billable-read savings. The static inspection above predates this narrow change; its line anchors may move.
