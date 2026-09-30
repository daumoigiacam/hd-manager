# HD Manager performance audit across 22 modules

Date: 2026-09-30. Baseline: `0249017de2873e56556865c0566ecadded6c55f2`.

Historical first-phase report. The subsequent browser/Android interaction measurements and current acceptance decision are in [PERFORMANCE_INTERACTION_AUDIT_2026-09-30.md](PERFORMANCE_INTERACTION_AUDIT_2026-09-30.md). Statements below about missing browser coverage describe the earlier phase, not the final state of the later audit.

## Status and scope

PARTIAL ACCEPTANCE ONLY. Six shared performance problems were reproduced in actual source helpers and fixed. The current functional suite, focused tests, lint, typecheck and production build pass. Isolated Firestore SDK/rules tests also pass. This is not evidence that all user interactions are now instantaneous.

No Flutter migration, production deployment, production database writes, rules changes, secret copying or Android release was performed. The user's cloud-data localhost at `http://127.0.0.1:5212/` was left running. A separate production preview build with isolated local mock data was served on `http://127.0.0.1:5217/` for navigation timing only. This provides click-to-visible-content evidence, but not keyboard, scroll, FPS, physical-device, or production-network measurements.

The navigation registry contains 24 entries. This audit counts Home and Executive Detail as one reporting module and excludes More, which is navigation. `scripts/audit-module-paths.mjs` asserts that the resulting inventory covers all 22 business modules. It records source locations, await sites, selected save handlers, child components and foreground data dependencies. Static await counts are not request counts and do not prove latency.

## Reproduced causes and changes

1. Shared currency/quantity helpers constructed `Intl.NumberFormat` for every value. Reuse locale formatters while preserving the original coercion, rounding and output.
2. Global search filtered/sorted/formatted records while its dialog was closed. Gate all seven entity preparation callbacks on search visibility. Reopening still applies the existing access restrictions and latest data. Navigation search remains available.
3. Equivalent realtime payloads replaced entire collection references. Retain equal plain-data references after comparing every field, deletion, row order and sync marker. Unknown SDK objects remain changed conservatively. Genuine edits still invalidate derived calculations.
4. The dashboard recalculated billing snapshots and parsed the same dates repeatedly in one synchronous report build. A CPU profile identified these calls. Cache only within that build and release in `finally`; edits, tenants and subsequent dates never share this cache. Financial formulas are unchanged, with cached/uncached parity tests.
5. Durable enqueue serialized and wrote the whole queue twice: once to persist/verify, then again to publish the in-memory queue count. Publish without repeating the verified write. Non-durable retry/ack paths still persist normally. Quota failure, failed readback and revision handling retain their safety checks.
6. The executive dashboard deliberately stayed mounted under `display:none` to preserve its state, but background collection updates could still rerender the expensive hidden report tree. Keep it mounted and freeze its props while another module is active; returning Home consumes the latest props in one render. Product and employee list images now use lazy loading and asynchronous decoding, while invoice/share images remain eager for export correctness.

## Before and after

Windows, Node 25.9.0, synthetic data, actual source helpers. One warmup and five timed samples per CPU case. These are CPU/control-flow measurements, not phone response times. Results are in `test-results/shared-hotpaths-before.json`, `shared-hotpaths-after.json`, `save-queue-before.json` and `save-queue-after.json`.

| Operation | Before median | After median | Meaning |
| --- | ---: | ---: | --- |
| Format 6,000 amounts | 84.59 ms | 1.85 ms | Same formatted values |
| Prepare closed search, 9,000 transactions | 53.25 ms | below 0.01 ms | 2,500 formatted rows reduced to zero |
| Build dashboard, 6,000 orders / 1,200 customers | 256.20 ms | 58.11 ms | Same calculated report; about 77% less CPU |
| Apply equal 6,000-row snapshot, including fixture clone | 9.18 ms | 15.01 ms | Comparison costs more but prevents downstream invalidation |
| Collection invalidations for 10 equivalent snapshots | 10 | 0 | Not a measurement of React render count |
| Enqueue with 499 pending records, memory storage | 1.920 ms | 0.949 ms | Serialization/control-flow only |
| Storage writes per durable enqueue | 2 | 1 | Readback verification retained |

Production preview navigation used 360 customers, 1,800 orders and 900 payments. Three More/Home cycles and Order Request, Dispatch and Orders round trips measured `7-79 ms` click-to-visible-content. Samples: More `38/8/7 ms`; Home from More `10/9/9 ms`; Order Request `22 ms`, Home `61 ms`; Dispatch `20 ms`, Home `21 ms`; Orders `32 ms`, Home `79 ms`. No page error was recorded. This is a desktop Chrome mobile viewport measurement, not a physical-phone guarantee.

An actual changed snapshot still requires calculations; this is intentionally not suppressed. The snapshot comparison tradeoff must be measured on a real low-end device before claiming a universal improvement.

## Firestore emulator verification

Used the installed Firestore emulator 1.20.4, project `demo-hd-save-acceptance`, localhost only, real SDK and unchanged repository security rules. The fixture creates three records and edits each once in each collection, then reads through a second client. These writes do NOT exercise each module's form validation, account provisioning, or full save handler.

| Collection | Create median / maximum ms | Edit median / maximum ms |
| --- | ---: | ---: |
| customers | 14 / 325 | 11 / 28 |
| products | 9 / 10 | 8 / 9 |
| orders | 7 / 8 | 7 / 8 |
| orderRequests | 7 / 8 | 7 / 8 |
| warehouseImports | 6 / 7 | 6 / 8 |
| warehouseDispatches | 6 / 6 | 6 / 6 |
| deliveryReports | 5 / 6 | 5 / 6 |
| expenses | 6 / 7 | 5 / 6 |
| payments | 5 / 5 | 5 / 6 |
| employees | 6 / 6 | 6 / 6 |

Additional assertions passed: coalesced writes match sequential writes; offline edits preserve the last revision; reconnect confirmation completed in 24 ms in this fixture; wrong-tenant writes fail; an atomic order/payment/expense group replays without duplication; a denied expense rolls back the entire group. Logs contain expected permission-denied messages for negative tests.

Initial emulator attempts failed before tests because the CLI could not read its user config, Java received a malformed non-ASCII rules path, and the emulator lacked Vietnamese validation resources. The final run used a relative rules path and an English locale for that Java process only. All emulator processes started by this audit were stopped. No machine-wide locale or Firebase account setting was changed.

## Module coverage and remaining work

Every row below was inspected at source level. Tests named below ran in this audit, either within `npm run test:all` or the additional focused command. NONE of the rows has new browser/device acceptance. A source/rules test passing is not a UI performance pass.

| Module | Paths examined | Evidence and unresolved boundary |
| --- | --- | --- |
| 1 Home and detailed reports | Report derivation, payroll/debt inputs, hidden mounted report | Business-report finance/view-model and cache parity tests pass. Hidden dashboard updates are frozen off-route; production-preview navigation measured 7-79 ms with the large fixture. Physical-device profiling remains open. |
| 2 Order requests | Create, edit, durable queue, share | Order-request UX, save-critical-path, share and emulator tests pass. Cross-device click latency unmeasured. |
| 3 Orders and invoices | Manual/dispatch create, edit, payment/fee group, warm share cache | Atomic/revision, billing, share-cache and emulator tests pass. Dispatch-linked creation intentionally needs a server transaction. |
| 4 Warehouse dispatch | Save/edit, shortage list, grouped rows | Dispatch local-save/grouping/bulk-order tests and emulator pass. Durable enqueue now writes once. |
| 5 Delivery | Save/report edit, linked expense/payment, images | Delivery reconciliation/layout and emulator tests pass. Upload/native attachment latency remains unmeasured. |
| 6 Warehouse inventory | Imports, linked voucher, stock count | Inventory integrity/unit tests and emulator pass. Monetary groups retain atomic confirmation semantics. |
| 7 Customers and suppliers | Create/edit, customer ledger, contacts | Customer billing/memory/contact/ledger/security tests and emulator pass. Render of long lists needs device profiling. |
| 8 Debt | Ledger, payment add/delete | Debt layout, payment/security, reconciliation and emulator tests pass. Payment notification follow-up is still awaited in source. |
| 9 Income and expenses | Create/edit income/expense, approval | Finance layout/save tests and emulator pass. Several edits await direct Firestore writes; no blanket optimistic approval added. |
| 10 Banking | Bank read view, reconciliation and deep links | SePay reconciliation, customer debt payment and bank deep-link tests pass. External bank/provider response not measured. |
| 11 Messages | Conversations, permissions, attachments, send | Chat layout/search/security tests pass. Image preparation, GPS and remote send require platform/network tests. |
| 12 Pricing | Input cost and rule saves, derived prices | Product-price/unit and customer billing tests pass. Independent saves use existing durable queue. |
| 13 Attendance | Roster, WiFi/GPS, edit/check-in/out | Roster and six WiFi logic tests pass. Device permission and GPS time not simulated as successful. |
| 14 Employee reviews | Review write, criteria settings, payroll linkage | Evaluation automation, review UI and payroll evaluation tests pass. Actual form interaction unmeasured. |
| 15 Assets | Asset save, cost log and expense coupling | Asset model/layout tests pass. Cost log and expense still use sequential remote writes; needs an atomic migration with dedicated failure tests. |
| 16 Payroll | Period loading, close, adjustment and carryover | Lock/freeze/hardening/carryover/workspace tests pass. Server lock is retained; no false local-only completed state. |
| 17 Employees | Create/edit profile, account provisioning | Idempotent profile retry and identity tests pass; employee collection emulator writes pass. Authentication provisioning latency is not covered by a collection write. |
| 18 Products | Create/edit, units and inventory derivation | Product unit/billing tests and emulator pass. Existing local-first path benefits from queue fix. |
| 19 Price quotes | Bulk customer update, text share/copy | Shared share-path source inspected; no dedicated end-to-end quote test executed. External destination acceptance unknown. |
| 20 Settings | Company save, backup/restore, integration panels | Identity, runtime and authorization tests pass. Backup/restore and external integrations were not invoked against user data. |
| 21 Roles | Permission edit and company save | Role/navigation and authorization tests pass. Permission edits still need server confirmation; no offline privilege elevation. |
| 22 Subscription | BillingView | Source currently renders plan information; no create/save workflow or live billing test to measure. |

## Remaining causes and acceptance gaps

- The executive dashboard remains mounted for fast return navigation, but its memo boundary now suppresses off-route data churn. This removes hidden React work without discarding dashboard state.
- Standalone payment creation awaits customer notification writes after saving money. Notification failure can reject the handler after the payment succeeded. This is a confirmed source-level correctness/latency risk, not fixed by the shared CPU changes. A durable idempotent notification outbox is required before separating it safely.
- Asset cost and related expense saves remain sequential. Do not simply run them concurrently or report success early: atomicity and durable failure recovery are necessary.
- Attendance/employee/payment/expense edits contain direct server writes. Differentiate immediate button feedback from authoritative confirmation; queueing permissions, payroll locks or account credentials indiscriminately would be unsafe.
- Build output still contains an approximately 2.52 MB entry chunk (668 KB gzip). Parsing/compilation on low-end devices is a plausible cold-open cost, not yet measured here. No large code-splitting refactor was attempted without UI regression access.
- Production API duration, TTFB, retries, request/response sizes, database execution time, React commit duration, FPS, p95 click-to-paint and external share acceptance are NOT measured. Emulator latency is not substituted for these values.
- The existing monitor can be enabled locally with `?perfMonitor=1`; `window.hdPerformanceMonitor.download('json')` exports client events. Firestore client operation time is not database execution time. A missing `Server-Timing` database metric must remain unknown.
- The installed APK is unchanged. Native performance and crash acceptance require a newly built artifact and device/emulator UI tests after the web changes are reviewed.

## Verification and reproduction

- `npm run test:all`: PASS, including the new shared-hotpaths regression tests through `test:firestore-resilience`.
- Additional focused run: 30 tests PASS, zero failures (attendance, finance/report periods, payroll model, employee review, order-request share, dispatch local-save and new shared tests).
- `npm run lint` and targeted ESLint for all new/changed scripts/helpers: PASS.
- `npm run typecheck`: PASS (repository payroll TypeScript scope, not all JSX).
- `npm run build`: PASS.
- Production preview navigation test with scale 3: PASS; all measured route changes `7-79 ms`, no page errors.
- `node scripts/audit-module-paths.mjs`: covers all 22 module groups.
- `node scripts/profile-shared-hotpaths.mjs after` and `node scripts/profile-save-queue.mjs after`: reproduce isolated CPU measurements. Preserve baseline reports; do not label optimized code as a new baseline.
- `tests/firestore-save-acceptance.test.mjs`: PASS with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8180`. Output: `test-results/firestore-save-acceptance.json`.

## Changed files

| File | Reason |
| --- | --- |
| `src/App.jsx` | Reuse number formatters, avoid closed-search preparation, preserve equal snapshot references, remove duplicate queue persistence, freeze hidden dashboard rendering, lazily decode list images |
| `src/services/executiveDashboardService.js` | Build-scoped date/billing caches |
| `src/utils/collectionIdentity.js` | Conservative plain-data structural sharing |
| `tests/shared-hotpaths.test.mjs` | Eight regression tests for correctness, permissions, queue verification, cache invalidation and hidden-dashboard freezing |
| `tests/warehouse-dispatch-local-save.test.mjs` | Update structural assertion for the new persistence argument; still enforces write/readback before publication |
| `tests/helpers/app-source-function.mjs` | Extract actual helpers without running App or opening a Firebase connection |
| `tests/helpers/save-queue-harness.mjs` | Isolated storage/control-flow harness |
| `scripts/profile-shared-hotpaths.mjs` | Reproducible CPU and no-op invalidation measurements |
| `scripts/profile-save-queue.mjs` | Queue serialization/write-count measurements |
| `scripts/audit-module-paths.mjs` | Checked 22-module source inventory |
| `package.json` | Include shared regression tests in normal test suite |
| This report | Evidence, before/after, unresolved risks and acceptance boundaries |

Conclusion: measured shared bottlenecks are improved without changing financial formulas or write authorization. Full 22-module speed/smoothness acceptance remains OPEN until the browser/device and live-network measurement gaps above are resolved.
