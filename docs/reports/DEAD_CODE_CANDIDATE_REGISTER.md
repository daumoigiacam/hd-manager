# Dead-code and duplicate-code candidate register

Baseline `5f162f5c`, 2026-10-02. Audit classifications only. **No file or function was deleted.** Absence of an App import does not prove dead code; tests, build scripts, alternate modes and dynamic references also matter.

## Register

| Candidate | Classification | Evidence and disposition |
|---|---|---|
| src/utils/deliveryRequestIndex.js |KEEP |Static App import:17, active memo:48469, tests/delivery-request-index.test.mjs. Retains duplicate/name/source ordering. Current legacy-pricing hotpath still uses it |
| src/utils/productMeasures.js |OPTIMIZE |Static App import:381, stock caller:43986, tests/product-measures.test.mjs and package test:product-pricing-units. Keep calculations, consider aggregation architecture only after approval |
| App buildWarehouseDispatchShortageSummary |OPTIMIZE |Direct shell/export/request callers:24076,55255,60119. CPU profile evidence. Not duplicate dead logic merely because called from three screens |
| App visibleRequests and stock/history derived rows |OPTIMIZE |Rendered by five active routes; measured hotspots. Preserve every business rule and result |
| App normalizeLookupText; searchEngine normalizeSearchText; productPricingUnits normalizeText |DUPLICATE (similar operation, NOT identical contract) |Shared NFD/regex work; whitespace, aliases, fuzzy matching and unit fallback differ. Used from runtime and tests. Consolidation requires equivalence evidence |
| App share cache memory + IndexedDB + native file layers |KEEP |Read/write and async share callers at5987-6400,62285-62375. Intentional layered cache, not unused duplicate business state |
| src/services/cooperativeTaskQueue.js |UNKNOWN (test-used, not active App import) |Only implementation and tests/warehouse-dispatch-performance.test.mjs import found in source/scripts/tests/config search. Utility test registers timers through injected scheduler. No removal candidate; old integration claims not transferable |
| src/services/screenCursorRuntime.js |LEGACY_COMPATIBILITY / test-used |tests/screen-application-cursor.emulator.mjs imports it; no current App import. Exports route/collection mappings and mutation event for prior Gap A/C. Keep paused architecture intact; not evidence of live pagination |
| src/services/readLifecycle.js |UNKNOWN (test-used) |tests/read-lifecycle.test.mjs imports it; no current App integration found. Keep until ownership of prior architecture is resolved |
| tests/warehouse-dispatch-performance.test.mjs createSearchRecordIndex import |UNKNOWN / historical-test mismatch |Current searchEngine.js has no such exported symbol in source search. This test file is not evidence that runtime search uses persistent indexing. Phase0 does not repair/delete test or declare it PASS |
| App VPS branches / src/api/client.js |LEGACY_COMPATIBILITY |Guarded alternative runtime, API client token storage and existing package tests. Inactive in Firebase audit is not unused across supported builds |
| src/mocks/firebase-firestore.js and mock auth |KEEP |Vite preview aliases and audit harness activate them; dynamic collection/listener paths. Benchmark depends on whole-store behavior; do not delete/change to improve scores |
| App legacy pending-write/cache cleanup :1119,:1165,:13929 |LEGACY_COMPATIBILITY |Session initialization compatibility with earlier persisted data. A missing new writer is insufficient evidence that users have no old data |
| App duplicated dispatcher heartbeat paths :29241,:30687 |SIMPLIFY candidate only |Different component/gating contexts; conditional machine/bridge state. Runtime simultaneous mount not established. Do not merge or remove without lifecycle/role evidence |
| Existing Gap A/C reports and INHERITED_PASS_REGISTER.json |KEEP as historical documentation |Describe prior working tree; current runtime differs. Add scoped clarification in new report instead of overwriting history |

## Removal admission checklist

No entry is admitted as REMOVE_CANDIDATE in this phase. For a future admission, all columns below need positive investigation, not just a filename search.

| Reference type | Audit performed / result |
|---|---|
| Static import |rg across src/tests/scripts/functions/config identifies active and test-only dependencies above |
| Dynamic import |No current App dynamic import found for queue/cursor/readLifecycle names; naming-only search is not exhaustive runtime proof |
| Route |Current App route consumers and cursor route map inspected; map existing in a utility does not mount it |
| Event |Cursor exports a mutation event; App active share/realtime events inspected. Do not assume event strings cannot be constructed dynamically |
| Timer |Queue owns injected timers when instantiated; App has independent active timers. No queue instantiation in current App found |
| Firebase callable |Client utilities are not callable exports; no matching functions source reference found. Existing Cloud Function exports are NOT deletion candidates |
| Background job |App callbacks directly schedule maintenance; queue utility is not wired into those call sites |
| Test dependency |Explicit imports for all three apparently inactive utilities exist; prevents declaring them unreferenced |
| Build dependency |package.json test scripts and vite.config.js preview aliases inspected; mock files are required. Full alternative build reachability not certified |
| Runtime reference |Inherited profiles show stock/reconciliation/index callers. Runtime reachability of every alternate configuration is UNKNOWN; no live production traversal performed |

Because dynamic/runtime ownership and test dependencies are not disproven, candidate status stays UNKNOWN/LEGACY_COMPATIBILITY rather than REMOVE_CANDIDATE. This is an audited limitation, not permission to remove files. Phase0 completes classification; deletion would require a separately approved phase and stronger evidence.

## Autonomous Master Continuation - 2026-10-03

The owner now authorizes verified cleanup. Historical classifications above remain
unchanged as baseline evidence. No files were removed.

| Local helper | Evidence | Disposition |
|---|---|---|
| `buildWarehouseDispatchShortageSummary` inner `buildLineKey` | Sole identifier occurrence was its declaration; search covered source, tests, scripts, Functions, workflow and build configuration. Lexically private, not exported or registered as a route, event, timer or callable. Active consumers use `buildLineKeyVariants` directly. | Removed unused wrapper only. |
| Same function's `buildRequestMatchKey` and `coveredRequestLineKeys` | The prior private Set was populated solely for a duplicated coverage scan. Coverage is now derived from the same already-filtered `matchedDispatchLines`; no external reference or registration exists. | Removed redundant scan/Set. Independent frozen-Git calculation parity must remain green. |
| Queue/cursor/read-lifecycle compatibility utilities | Existing test/build references still exist. Queue is now actively integrated with maintenance; this does not make the other utilities removable. | Keep. |

These removals are not a performance acceptance claim. Final regression and paired
benchmarks remain required; mathematical parity includes alias/source/date matching
and equal-timestamp ordering.
