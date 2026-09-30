# PERFORMANCE AUDIT REPORT - HD Manager

Date: 2026-09-30. Repository HEAD: `0249017de2873e56556865c0566ecadded6c55f2`.

## Acceptance decision

**PARTIAL. Do not mark the full application PASS.** Measured CPU/render bottlenecks have been fixed and verified. All 22 module-opening checks passed five times on Android emulator Chrome, with observed maxima below 300 ms in the isolated fixture. This does not establish that every operation on every device/network is instantaneous.

The latest full Android action run contains 65 successful measurements covering product create/search/archive, employee profile edit, order-request create, finance edit and customer price application. Product and order-request edit measurements are also included in the navigation run. Record persistence is asserted separately from visible feedback. Other modules have source/functional coverage and opening measurements, NOT complete CRUD acceptance.

No Flutter migration, UI-wide rollback, production data mutation, database/index/rules change, deployment, push or APK release was performed. The user's Firebase localhost at `http://127.0.0.1:5212/` still responds HTTP 200. Separate disposable preview servers and synthetic data were used for UI measurement. No staging/production secrets were copied into the test fixture.

## Actual stack

Installed versions inspected: React 19.2.7, Vite 7.3.6, Capacitor 8.4.1, Firebase SDK 12.16.0. The application uses React DOM, not React Native/Flutter. Firebase Auth, Firestore and Storage are used by the cloud runtime. Vite aliases isolate preview mocks; the release bundle check confirms Firebase runtime markers and no platform/VPS markers.

Routing is the existing `activeTab`/back-stack system in `App.jsx`, not React Router. State is mainly React state/hooks/refs passed from App/MainAppView, with HDThemeProvider context. No Redux/Zustand migration was introduced. Existing caches include local collection snapshots, a durable pending-write queue, invoice/share caches and retained dashboard state. Service/util modules and the central SDK wrappers remain in use.

## Measurement contract

- Desktop Chrome at 1366x900 and a 390x844 browser viewport; actual Android emulator Chrome at 411 CSS px with its real software keyboard. A desktop viewport is NOT an iPhone test. The installed Capacitor APK was not tested or rebuilt in this phase.
- Fixture adds 600 products, 360 customers, 1,800 orders, 900 payments and a known order request to existing preview seeds. Action runs give one customer a fixed product so create/apply-price workflows are meaningful. All external browser requests are blocked; cloud writes cannot be exercised by this fixture.
- At least five samples per reported interaction, using production React profiling builds and preserved source maps. `before/app` already contains the earlier shared-hotpath fixes. It is NOT pristine HEAD. This phase compares pagination/indexing/hidden-list/keyboard changes against that baseline.
- Total time begins at captured click/input/change/submit, not before Playwright locates a control. Completion means the expected DOM/value condition plus two animation-frame opportunities. It is NOT an actual compositor paint timestamp, first cold data load, or remote commit acknowledgment.
- React root duration is recomputed from raw events for commits starting inside the interaction window. Nested profiler times and preparation renders are excluded. SDK spans retain their originating interaction IDs. Overlapping work is not automatically causal work.
- Capture-to-microtask timing is not isolated application handler duration. Validation, transformation, database and state phases that lack precise instrumentation remain UNKNOWN. No fabricated per-stage numbers were assigned.
- Five samples give empirical p95 equal to maximum, not a population reliability guarantee. Profiler/emulator overhead and run variability are material.

Full min/average/p95/max tables, React timings and observed wrapped SDK counts: [measurement appendix](PERFORMANCE_INTERACTION_MEASUREMENTS_2026-09-30.md). Raw events, screenshots, CPU profiles, preserved builds and CSV: `test-results/full-interaction/`. The report generator recomputes render/SDK attribution from raw samples; older raw `summary.json` render totals are superseded by the appendix.

## Top 10 Root Causes

| ID | Module/interaction and source | Root cause and evidence | Fix, before/after and risk |
| --- | --- | --- | --- |
| R01 | Products open/edit/input/save; `src/App.jsx:68598`, ProductManagementView | 602 product rows mounted, updated and laid out during small form changes. CPU/React traces and repeated Android measurements reproduce the cost. | Shared 50-row pagination; filter/search still use ALL products. Open mean 1394.46 -> 200.38 ms, save-edit 1930.54 -> 320.62 ms. Check page reset, last page, search and archive; financial/inventory source arrays are not truncated. |
| R02 | Finance open/edit/save; `src/App.jsx:47329`, FinanceView | More than 900 transaction rows rendered; repeated employee lookup per row. Baseline Chrome profile includes substantial layout work and Android open mean 2136.50 ms. | Render 50 rows, reuse employee name map. Open mean 228.16 ms after. Desktop save-edit mean 372.86 -> 80.06 ms. Totals explicitly remain based on the complete filtered transaction set; UI test asserts totals do not change between pages. |
| R03 | Pricing open; `src/App.jsx:37100`, buildPricingCandidateIndexes | Every matrix cell repeatedly scans and normalizes candidate names/groups; CPU source mapping identifies these calls. | Classify candidates once and retain first positive-price candidate and first catalog candidate separately. Android open mean 335.78 -> 125.36 ms. Priority/parity tests guard against changing the customer's price source. |
| R04 | Price quotes open/save; `src/App.jsx:39808`, PriceQuoteBroadcastView | A permanently CSS-hidden selector still built hundreds of React buttons. Save profile also shows normalizeCustomerProductIds rebuilding a 600-product Set for each customer. | Remove only the hidden selector; keep the visible selector. Reuse the current catalog ID Set for customer filtering. Open mean 369.04 -> 171.16 ms. Same Save-profiler pair mean 445.44 -> 408.40 ms; still above the simple-interaction budget. Saved/legacy/override ID precedence is tested. |
| R05 | Shared number formatting; `src/App.jsx:2698` | Earlier helper profiling shows per-value Intl formatter allocation. | Reuse locale formatters. Earlier CPU median for 6,000 amounts 84.59 -> 1.85 ms; output parity tests. This is helper timing, not phone latency. |
| R06 | Closed global search; `src/App.jsx:25674` | Search entities were filtered/sorted/formatted while the search UI was closed. | Gate expensive preparation by search visibility without bypassing permission filters. Earlier helper median 53.25 -> below 0.01 ms. Reopen consumes current data; source/helper tests retain access restrictions. |
| R07 | Realtime/state propagation; `src/App.jsx:13971`, `src/utils/collectionIdentity.js`; hidden dashboard at `src/App.jsx:41821` | Equal payloads invalidated collections; retained hidden dashboard could consume background prop changes. | Preserve structurally equal plain-data references; freeze inactive dashboard props and refresh on return. Earlier identical-snapshot invalidations 10 -> 0. Comparison itself costs MORE CPU: median 9.18 -> 15.01 ms for 6,000 cloned rows. Do not claim that every snapshot becomes faster; changed fields/deletes/unknown SDK objects must still propagate. |
| R08 | Report derivation; `src/services/executiveDashboardService.js:2535` | CPU profile identifies repeated date parsing/billing derivation during a synchronous report build. | Build-scoped cache, released in finally; no cross-tenant/date stale cache. Earlier 6,000-order helper median 256.20 -> 58.11 ms. Cached/uncached financial parity tests pass. |
| R09 | Durable save queue; `src/App.jsx:12218` | One enqueue serializes/writes the same queue twice, after durable write/readback verification. | Avoid only the second redundant persistence. Earlier 499-pending-command helper median 1.920 -> 0.949 ms; writes 2 -> 1. Storage-full/readback/revision checks remain. This is not device-storage or backend latency. |
| R10 | Product create/keyboard; `src/main.jsx:115`, `src/utils/keyboardViewport.js` | Real Android keyboard resized BOTH innerHeight and visualViewport from 794 to 394 px. Their difference was zero, so modal stayed 794 px and Save was offscreen. Before action FAILED rather than having a valid timing. | Shared viewport resolver also compares the stable baseline and clamps modal to visible height during dismiss. Five create/save cycles, search close and subsequent navigation pass on Android; unit cases cover resize, overlay, pan and restoration. Physical iOS/WebView and rotation remain open. |

The older shared-helper evidence and limitations are retained in `PERFORMANCE_MODULE_AUDIT_2026-09-30.md`; its earlier statements that browser testing had not happened are superseded by this report. Those historic helper files preserve medians/maxima rather than full individual timings, so they do not satisfy the new per-interaction statistics contract by themselves.

## Before / After Highlights

Means in ms, Android emulator Chrome unless stated otherwise:

| Interaction | Before | After | Mean reduction |
| --- | ---: | ---: | ---: |
| Open Finance | 2136.50 | 228.16 | 89.3% |
| Open Products | 1394.46 | 200.38 | 85.6% |
| Open product edit | 626.10 | 73.34 | 88.3% |
| Input product short name | 516.62 | 86.44 | 83.3% |
| Save product edit | 1930.54 | 320.62 | 83.4% |
| Open Pricing | 335.78 | 125.36 | 62.7% |
| Open Price quotes | 369.04 | 171.16 | 53.6% |
| Save request price | 319.76 | 339.50 | -6.2% |

Request-price save did NOT improve in the final run and remains a follow-up, not a hidden failure. A quote-save run before the last Set fix ranged 666-1011 ms; after reopening emulator Chrome the profiled reference ranged 400-512 ms, then 341-445 ms after the Set fix. All results are retained. Reopening the browser is NOT shipped as a performance fix and does not justify selecting only the fastest run.

The appendix includes ten distinct slowest interactions. Latest create-product save is 439-544 ms; employee profile save 91-135 ms; request create-save 231-267 ms; finance note save 223-266 ms. These are completed UI transitions in a local mock, not server acknowledgment times. There is no claim that every Save is below 200 ms.

## Coverage By Module

All rows have source inventory and five successful Android opening samples. Figures below are mean / max ms from `final-after`. Opening checks also exist on desktop and desktop mobile viewport. The final quote-only index change has additional focused measurements. Blank CRUD coverage is intentionally not marked PASS.

| Module | Android open mean / max | Additional UI checks in this phase; remaining boundary |
| --- | --- | --- |
| Home/detail report | 58.8 / 63.8 | Financial calculation tests; all detail tabs/filter combinations not end-to-end covered. |
| Order requests | 99.9 / 123.2 | Create, product/customer selection, numeric input, price edit, save, persistence after reload. Share/delete, network loss and double tap require device E2E. |
| Orders/invoices | 156.2 / 170.3 | Existing billing/atomic/share-cache tests; full invoice/payment/fee UI flow not newly measured. |
| Warehouse dispatch | 77.3 / 90.6 | Source and existing grouping/billing/local-save tests; full dispatch CRUD UI remains. |
| Warehouse imports/inventory | 88.7 / 96.8 | Inventory/unit integrity tests; import-plus-expense and scanner device flows remain. |
| Delivery | 75.6 / 78.6 | Existing reconciliation/layout tests; media uploads, linked payments and report CRUD remain. |
| Products | 200.4 / 225.0 | Create/edit, text/number input, save, archive, global search, page change/reset, last page, real Android keyboard. Unarchive and image upload not exercised. |
| Customers/suppliers | 251.7 / 289.2 | Customer-specific price update through quotes; full customer form CRUD not newly measured. |
| Debt | 176.4 / 186.3 | Ledger/payment/security tests; payment UI and reconciliation on live services remain. |
| Finance | 228.2 / 248.6 | Edit note/input/save, page switching and full totals; approval/create/delete and actual remote rejection remain. |
| Banking | 67.3 / 77.2 | Existing reconciliation/deep-link tests; no real payment initiated. |
| Messages | 78.4 / 101.3 | Existing classification/security tests; remote send, media, full conversation scroll remain. |
| Pricing | 125.4 / 152.5 | Lookup parity and margin/unit tests; every pricing editor/save branch not covered. |
| Attendance | 95.2 / 139.9 | Roster/source checks; GPS/WiFi permissions, actual check-in and all edit modes remain. |
| Employee reviews | 110.1 / 137.6 | Existing automation/payroll-link tests; full review-form interaction remains. |
| Assets | 71.5 / 82.8 | Model tests; asset cost/expense coupling needs dedicated partial-failure E2E. |
| Payroll | 122.8 / 134.3 | Lock/freeze/carryover/workspace tests; server close/adjustment UI not fully measured. |
| Employees | 68.3 / 74.9 | Open profile, type name, save and verify record five times. New account provisioning/permissions not covered by this test. |
| Price quotes | 171.2 / 181.4 | Select fixed product/customer, apply distinct prices five times, verify priceOverrides and visible feedback. External Zalo delivery not tested. |
| Settings | 79.2 / 111.0 | Source/runtime checks; no destructive reset/restore or actual integration changes executed. |
| Roles | 116.8 / 132.0 | Existing authorization tests; server-confirmed privilege editing not represented by local fixture. |
| Subscription | 66.5 / 76.1 | Plan-information screen; no live billing workflow claimed. |

## Firebase, Network, Render And State Findings

- `getTenantCollectionSources` at `src/App.jsx:13568` scopes data by company; most employee/company collection queries are not limited. Messages have explicit limits. UI pagination does NOT reduce these document reads. Applying an arbitrary limit would silently corrupt aggregate balances; any server-paging/aggregate redesign needs separate correctness evidence.
- The realtime planner deduplicates active collection subscriptions and keeps an intentional foreground retention budget. The instrumented wrapper plateaued at 15 entries in the repeated navigation fixture. This is consistent with three baseline plus twelve foreground slots, not proof that every subscription in every module is leak-free.
- Realtime application still merges full source document sets on changed snapshots. Equal snapshots are now reused. Larger changed snapshots and derived customer ledgers remain candidates for profiling; no blanket query/index change was made.
- Product/finance edit no longer rerenders hundreds of rows. Some saves still generate multiple root commits. Quote-save profiles show customer-ID normalization, ledger derivation, mock-store persistence and substantial React profiler overhead. Removing the proven repeated Set construction does not eliminate all root propagation.
- No real Firestore request waterfall was measured in this phase. SDK counts are not HTTP request counts. Method/endpoint, payload/response bytes, TTFB, retry count and server database duration for real saves are UNKNOWN. Mock duration includes local storage serialization and callbacks; it must not be labeled Firebase latency.
- Image lazy loading/async decoding was restricted to ordinary product/employee list images. Invoice/share rendering retains its own readiness rules. Actual large-media upload/decode and external-share acceptance were not measured.
- The cloud build still has an approximately 2.52 MB entry JS chunk, about 669 KB gzip. Cold parsing on low-end devices is unverified; changing frameworks or rolling back all UI is not justified by the current evidence.

## Safety And Remaining Work

1. Keep server confirmation for payroll locks, account/permission changes and dependent financial operations. Existing durable/atomic queue semantics were not weakened to manufacture fast success.
2. Standalone payment creation (`handleAddPayment`) still awaits notification work after saving money; notification failure can misreport a committed payment. Asset-cost/expense writes (`handleAddAssetCostLog`) remain sequential. These source-level risks require dedicated idempotent/partial-failure tests before changing behavior.
3. Complete the missing CREATE/EDIT/SAVE/DELETE/SEARCH/FILTER/SORT/SCROLL/modal matrix for each row above, including denied writes, offline/reconnect, slow service and duplicate tap. Existing source/logic tests are not a replacement for those device E2E cases.
4. Measure real Firebase client transport and Functions server timing in an authorized isolated test tenant. Leave database duration unknown without server evidence; do not copy production credentials/data into tests.
5. Test iPhone Safari, iPhone WebView/Capacitor and a freshly built Android APK. Chrome in an Android emulator is useful but not native APK or physical-device acceptance. Run orientation, IME composition, keyboard dismissal, safe areas and long scrolling with frame traces.
6. Re-measure request-price save, create-product save and quote apply under non-profiling release conditions and defined lower-end device budgets. Retain slower samples. Do not promise a 100% latency bound across networks/devices.

## Tests And Artifacts

- `npm run test:all`: PASS, including the final rerun in `test-results/full-interaction/final-test-all.log`, after updating the old Finance structural assertion to require paged rendering and full-list totals. Includes shared save/revision/atomic tests and the new performance tests. The focused `test:interaction-performance` suite separately passes all 15 tests.
- Additional focused tests: 19 PASS for price margins, product visibility, business report finance/view-model, payroll workspace and keyboard geometry.
- Instrumentation regression verifies stale/background SDK spans and pre-click preparation renders are not charged to the current interaction. Pagination boundaries and first-match pricing parity are covered.
- `npm run lint`, focused ESLint, `npm run typecheck`: PASS. Repository typecheck is payroll TypeScript scope, not comprehensive checking of the large JSX application.
- Production Firebase cloud build: PASS. Bundle preflight: PASS, zero platform/VPS runtime markers. The initial bare preflight required explicit build environment; rebuilt with cloud/project configuration and reran successfully. No deployment took place.
- Before/after desktop runs: 280 + 280 opening/edit/input samples; extended actions 120 + 120. Android baseline/final opening/edit runs: 140 + 140. Final Android extended actions: 65; focused quote runs: five each. CPU profiles and raw data remain local under `test-results/full-interaction`.
- Final quote-index build also passes five price-application checks each on desktop and the mobile browser viewport: 74.8-138.4 ms and 74.0-97.4 ms respectively, zero failures/browser errors. These are additional regression checks, not a new paired before/after claim; raw results are in `desktop-final-quote`.
- Android create-save initially FAILED due to offscreen actions; its layout JSON is retained in `android-create-investigation`. An intermediate test attempted navigation while the search keyboard intentionally hid the footer; corrected to close search through its visible clear button and verified subsequent navigation. No force-click was used.
- Earlier emulator database/rules evidence remains in the previous report and is not reclassified as full UI acceptance.
- Final lint and whitespace checks pass. Only existing LF/CRLF normalization warnings remain. Temporary ADB forwarding/reverse mappings have been removed; the user's localhost still returns HTTP 200.

## Changed Files

| Files | Reason |
| --- | --- |
| `src/App.jsx` | Measured pagination/indexing/hidden-render fixes, shared formatter/search/queue/snapshot changes, profiler/subscription hooks; preserve formulas, permissions and full aggregate inputs |
| `src/main.jsx`, `src/utils/keyboardViewport.js` | One shared Android resize/overlay modal-height calculation; restore visible action area |
| `src/services/performanceMonitor.js`, `vite.config.js` | Opt-in diagnostic spans, interaction IDs, root/module commit observation, active subscription inventory, preview-only profiling build and source maps |
| `src/services/renderOptimization.js`, `src/utils/listPage.js`, `src/design-system/ListPagination.jsx`, `src/design-system/foundation.css` | Shared 50-row list pagination with accessible controls and full-dataset filtering |
| `src/services/executiveDashboardService.js`, `src/utils/collectionIdentity.js` | Earlier measured build-scoped caches and conservative snapshot structural sharing |
| `scripts/audit-interactions.mjs`, `tests/visual/interaction-action-cases.mjs` | Isolated browser/emulator before-after harness, persistence assertions, captured failures, screenshots, server/ADB cleanup; failed checks return nonzero |
| `scripts/interaction-metrics.mjs`, `scripts/report-interaction-audit.mjs` | Reproducible statistics with explicit interaction windows; generated appendix/CSV |
| `scripts/audit-module-paths.mjs`, `scripts/profile-shared-hotpaths.mjs`, `scripts/profile-save-queue.mjs` | Source inventory and earlier actual-helper benchmarks |
| `tests/performance-monitor.test.mjs`, `tests/interaction-metrics.test.mjs`, `tests/list-page.test.mjs`, `tests/pricing-candidate-index.test.mjs`, `tests/keyboard-viewport.test.mjs` | Instrumentation, paging, pricing priority/catalog reuse and keyboard regressions |
| `tests/shared-hotpaths.test.mjs`, `tests/helpers/app-source-function.mjs`, `tests/helpers/save-queue-harness.mjs`, `tests/warehouse-dispatch-local-save.test.mjs` | Earlier shared performance/correctness regression evidence |
| `tests/finance-mobile-layout.test.mjs`, `package.json`, `eslint.config.js` | Update paging contract, include new tests and lint touched JSX |
| This report, measurement appendix, previous audit report | Evidence, reproducible numbers, exact coverage and unfulfilled acceptance criteria |

Reproduce UI runs with `node scripts/audit-interactions.mjs <unique-phase>`; set `HD_AUDIT_ANDROID=1` for an authorized emulator, or `HD_AUDIT_ACTIONS_ONLY=1` for action cases. Use `HD_AUDIT_REUSE_BUILD=1` and `HD_AUDIT_BUILD_PHASE=<retained-phase>` to compare preserved builds. Never overwrite the retained baseline or interpret a current build named "before" as historical code. `node scripts/report-interaction-audit.mjs` regenerates the measured appendix from raw results.
