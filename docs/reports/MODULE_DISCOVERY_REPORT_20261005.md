# HD Manager - Phase 1 Discovery

Date: 2026-10-05. Source: `1bd05fc02f3271e37989066ef678bdfd3eb42d80`, branch `main`.

## Scope And Evidence

DISCOVERY COMPLETE. This is source discovery, not runtime certification or an optimization release. The working tree was clean when discovery started. No application, backend, native configuration, production data or deployment was changed. No benchmark was run.

Read the active application, Firebase configuration/rules, build configuration, native wrappers, services, navigation and historical performance reports. The generated Babel index parsed 221 JS/JSX/MJS/CJS files without syntax errors, covering src, Functions, Electron and the iOS Expo entry points, excluding dependencies. Native/configuration files were inspected separately, not included in that parser count. Generated output, archived copies and sibling HD Platform projects are not evidence of the active Firebase application.

Artifacts:

- `MODULE_REGISTRY_20261005.md`: module classification, features, actions, entities, dependencies, state and source definitions.
- `MODULE_DISCOVERY_SOURCE_INDEX_20261005.json`: machine-readable route, collection, callback, service, declaration and side-effect inventory.
- `.artifacts/discovery-20261005/full-source-index.json`: ignored local detailed callsite/event evidence. The ignored generator is discovery infrastructure, not production optimization.

## Actual Stack

React 19.2, Vite 7, JavaScript/JSX, Tailwind 3.4 and lucide-react. Firebase SDK 12.12.1 supplies Authentication, Firestore and Functions; Functions use Node 22/CommonJS. The default Firebase project is `hd-manager-c5839`, with business app ID `hd-manager-production`.

Android uses Capacitor 8 and bundled web assets, custom Java WiFi/safe-area/contact/external-launch/microphone plugins and the native biometric integration. Windows uses Electron 39 with preload/IPC boundaries. The iOS Expo entry is a React Native WebView wrapper; Android biometric/WiFi feature equivalence is not established by source discovery.

Firebase Storage is configured, but current Storage rules deny all reads/writes, and no active Firebase Storage SDK calls were found in the inspected application/Functions paths. Configuration alone does not establish a working Storage feature.

The Vite cloud runtime selects Firebase. HD Platform adapters exist off the default path for an opt-in VPS staging mode. They are not adopted or migrated by this task. Hosting/VPS placement is separate from the business backend.

## Routes And Modules

Navigation is an `activeTab` state machine, not a react-router URL route tree. `MainAppView` switches screen renderers; authentication gates and the customer portal have separate entry/subview flows. Browser/custom back navigation is coordinated by the existing back helpers.

27 registry entries: 24 navigation selectors, profile outside the menu, authentication and customer portal. Home and Executive Dashboard share a renderer. More is a navigation container. These are 27 discoverable surfaces, not 27 independent business engines.

| Class | Count | Entries |
| --- | --- | --- |
| A - Critical | 13 | Order Requests, Orders, Dispatch, Import, Products, Pricing, Debt, Finance, Bank Payments, Payroll, Roles/Permissions, Identity, Customer Portal |
| B - Operational | 7 | Delivery Reports, Customers/Suppliers, Attendance, Employee Reviews, Assets, Employees, Price Quotes |
| C - Supporting | 7 | Home, Executive Dashboard, Messages, Settings, Billing, More, Profile |

The registry records source callbacks, nested handlers and modal/draft state. These inventories are an audit checklist, not proof that every action has been exercised. Every new module certification remains BLOCKED pending its complete action, integrity, resilience and timing evidence. Zero modules are newly certified or locked.

## Data And State Map

`src/App.jsx` has 85,211 lines and 168 root hook bindings across state/ref/memo/external-store hooks, not 168 independent useState variables. App owns shared tenant collections, derived role-scoped views, local pending overlays, current-screen props and command callbacks. Screens also own draft/modal/search/pagination state. Specialized attendance, payroll, assets, delivery and reporting workspaces sit behind these screen boundaries.

Data flow: Firebase or REST collection reads -> raw tenant arrays -> role/scoped and cached projections -> screen props -> screen callback -> App command -> shared persistence/write queue -> SDK or REST -> ACK/snapshot/reconciliation. Local pending records can enter raw arrays before ACK; consumers must be audited for pending versus committed interpretation.

The source index records 48 client collection names, including companies/employees, customers, orders, orderRequests, imports/dispatches/stock counts, products, payments/expenses/financials, payroll, attendance, delivery, assets, messaging, loyalty, pricing and Zalo queues. Business documents are under `artifacts/{appId}/public/data/{collection}/{document}`, generally filtered by companyId. `orderRequests` and `order_requests` are different manual and AI/Zalo paths, not interchangeable collections.

Identity uses separate root account/audit/rate-limit/reset/unique-key/passkey collections and device/reset subcollections. Payment processing adds job/lookup/intent collections. The machine-readable index retains exact collection and foreground mappings rather than treating these additional server collections as client modules.

`functions/index.js` defines 36 static exports and two dynamically named customer-care triggers: 38 function names in source. These include identity, WiFi attendance, customer bootstrap/rewards, AI, payroll/evaluation jobs, payment/webhook/reconciliation and messaging assignment. Source export presence does not prove a deployed endpoint version.

## Shared Infrastructure And Design

- Persistence/read services: firestoreResilience, firestoreRestPagination, readArbiter/readLifecycle, realtimeListenerPlanner, tenantListReadModel and local-first/atomic save utilities.
- Scheduling/projections: cooperativeTaskQueue, cooperativeProjection, incrementalStableSort, recordCalculationCache and prepared-search helpers.
- Business helpers: pricing/unit billing, customer ledger, warehouse grouping/weight entries, delivery save plans and payroll integrity/period policies.
- Identity: identityCenter, nativeSessionPersistence and warmSessionUnlock.
- Hooks: useAppScreenBack, useCooperativeProjection, useCurrentCallback and usePreparedSearch; shared theme and sync-queue contexts.
- Shared layout/components: AppShell, AccountGreeting, SyncQueueStatus, messaging UI, pagination/table bodies, invoice/sharing utilities and workspace components.
- Design tokens: colors, spacing, typography, radius, elevation, motion, density, breakpoints, responsive and safe-area files in `src/design-system`; ThemeProvider, components and foundation CSS provide shared styles.

Many screen classes and inline styles remain outside semantic design-system components. This is a consistency/audit risk, not evidence that wholesale replacement would improve performance. Preserve existing accepted workflows until a module audit demonstrates a specific issue.

## Side-Effect Ownership

| Owner | Effect | Evidence And Audit Boundary |
| --- | --- | --- |
| App collection lifecycle | Firestore listeners and REST reads | `App.jsx:13887`, cleanup at 14864; aborts controllers, clears timers, unsubscribes and clears maps |
| Foreground planner | Baseline company/employee/notification listeners plus screen collections | Collection map at 1056; replans at 14910; web/native listener budgets 12/8 |
| App freshness | Visible/online refresh | 5-minute web / 12-minute native refresh at 14857; focus/online/visibility handling at 14927 |
| Local write events | Local patch and follow-up reconciliation | 14936; review queued refresh duplication alongside active reads |
| App native lifecycle | Resume/state listener | 14959; disposed flag and cleanup present |
| Write queue | Flush/retry | 12901 and interval at 13330; tenant/actor guards and stable operation identity require command-level audit |
| Attendance controller | WiFi checks and online event | 25245; one-minute check and lifecycle ownership must remain bounded |
| Zalo runtime/panels | Heartbeat, ticks and status refresh | 29274, 29311, 30720-30863; conditional ownership must be checked before calling these always-on or duplicated |
| Application lifetime | Viewport/keyboard, optional text-repair observer, freshness/performance monitor | `main.jsx`; global lifetime is not itself a leak |
| AccountGreeting | Time update | Component-owned 30-second timer; distinct from business reads |

Some older reports describe cooperative queues as unused. Current App imports and uses them; those historical statements must not be carried forward as current facts.

## Discovery Findings

These are source-confirmed properties and audit risks, not measured runtime regressions.

1. **Critical pending/committed boundary:** `handleAddWarehouseDispatch` at `App.jsx:21245` publishes raw dispatch state at 21339, persists/enqueues a write, starts asynchronous flush and returns a queued result before ACK at 21352. Edits/archive use the shared local-first path. The screen calls the create callback at 57940. Audit all downstream inventory/order/shortage/report consumers before certifying correctness. Do not remove ACK or silently label pending writes successful.
2. **Retry/restart idempotency:** Dispatch accepts a client mutation ID but otherwise generates a time/random ID and uses a short business duplicate window. Order Request creation at 20118 generates an ID and uses an in-memory in-flight signature set; its background-save branch returns before confirmation. Existing protections are useful but do not alone prove timeout/resubmit/restart safety.
3. **Full-tenant read scope:** `getTenantCollectionSources` at 13887 generally filters by companyId without server limit/orderBy. Messaging has explicit limits. REST paging can still gather the entire tenant dataset. A 20-row UI page is not bounded backend reading. Audit read volume and report integrity together; do not truncate financial or stock input datasets merely to reduce UI work.
4. **Typing coverage gap:** `package.json:117` runs `tsconfig.payroll.json`; allowJs/checkJs are enabled but strict and noImplicitAny are false, with only five payroll utilities included. Compliance with whole-app strict typechecking is FAIL. This does not mean the existing scoped command fails or the app has a demonstrated runtime defect.
5. **Inactive API helpers:** inventoryTransactions/orderReturns services construct inventoryAtomicOperation/orderReturnTransaction endpoints, but no active App consumers or matching Functions exports were found. Server utility file presence does not prove a deployed transaction feature. Do not activate these paths without a separate authorized audit.
6. **Shared-state fanout and cache invalidation:** The large App owner, derived arrays, pending overlays and manual callbacks warrant per-module render/read-lifecycle measurement. Duplicate snapshots may intentionally preserve historical product names/prices; do not remove them as redundant business truth without understanding semantics.
7. **Timeout reconciliation:** A client timeout does not cancel a server write already accepted. Certification must trace stable operation IDs, ACK, readback and retry outcomes, not only bounded waiting.

## Historical Evidence And Limitations

Reviewed inherited/Phase 0/Phase 1/Phase 2 registers and later performance release/real-Firebase reports. Earlier preview benchmarks and passing tests remain inherited evidence for their recorded commit, fixtures and environment, not current whole-module certification.

`PERFORMANCE_RELEASE_FINAL_20261003.md` records 665 passing unit tests, one skip, scoped lint/typecheck/build checks and preview CPU3x measurements. `REAL_FIREBASE_CRITICAL_PATH_REPORT.md` is BLOCKED on approved equivalent cloud test data/environment for real ACK measurement. No real production writes were generated by this discovery. Historical phone/user acceptance remains protected, but does not establish whole-app latency, memory or resilience on all devices.

Current checks are limited to source parsing, registry consistency, source-reference validation and whitespace validation. No lint, business tests, performance benchmark or deployment was rerun because this phase changes documentation only. No new CPU/network/ACK measurements are claimed.

## Selected First Module

**Xuất kho / warehouse_dispatch**, priority 1, certification BLOCKED pending audit evidence.

Reason: It connects requests, stock, orders and delivery reporting, while its active save path exposes locally pending records before ACK. Correctness and responsiveness need to be evaluated together at this shared boundary, before optimizing supporting screens.

Next action is a complete audit of this one module: create/edit/archive, shortage selection, customer/product/driver selection, weight entry, inline search, paging and split sharing; trace draft -> command -> queue -> ACK -> readback and downstream effects. Cover double-submit, timeout/retry, offline/reconnect, restart, tenant/account switch and stale snapshots. Preserve quantities, units, prices, cost, inventory, debt, payment and permissions.

Only after the audit identifies a concrete defect should a targeted fix be made. Then run relevant business/integration tests and bounded module-only performance measurements with explicit deadlines and data counts. Do not run a full-app benchmark during this discovery, migrate backend, deploy, or claim certification from source inspection. Whole-app regression and locking follow the master task gates after module evidence is collected.
