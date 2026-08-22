# HD CONNECT / HD MANAGER VPS UI PARITY

Date: 2026-08-22
Scope: local call-graph and contract evidence only. No production, Firebase, or database mutation was performed.

## Evidence boundary

The HD Manager VPS mode currently loads Auth, Customer, Product, Unit, Sales Order, Employee, and Notification list data through `getHdConnectStagingApi()` in `src/App.jsx`. A disposable local browser smoke has now exercised the login/core load against a separately started frontend and API, with zero Firebase requests and zero console errors. It does not prove that every rendered tab has been migrated.

The thin VPS adapter is `src/api/hdConnectStaging.js`. Newly exposed transport methods deliberately pass server-scoped DTOs and remove client-supplied `companyId`, `tenantId`, and `organizationId`; they do not translate legacy Firebase records or invent business rules.

## UI call-graph matrix

| Module | UI entry / source | Current VPS path | Existing VPS endpoint/module | Firebase path in source | Status | Missing before VPS-only |
|---|---|---|---|---|---|---|
| Auth | `src/App.jsx` login/session effects; `src/features/identity/IdentitySecurityCenter.jsx` | `getHdConnectStagingApi()` | `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`, `/auth/logout-all`, `/identity/*` | Legacy auth imports remain behind cloud-mode aliases | PASS | Browser flow is proven only on disposable core harness |
| Customer | `CustomerCRMView` and `onAdd/Edit/DeleteCustomer` in `src/App.jsx` | VPS adapter read/write | `/master-data/customers` | Firebase handlers remain for cloud mode | PASS | Full production browser evidence remains external |
| Product | `ProductManagementView` and product handlers | VPS adapter read/write | `/products`, `/products/:id` | Firebase handlers remain for cloud mode | PASS | Full production browser evidence remains external |
| Order / lines | `OrderManagementView` and order handlers | VPS adapter read/write | `/sales/orders`, `/sales/orders/:id` | Firebase order path remains for cloud mode | PASS | Payment/inventory side effects require domain cutover evidence |
| Warehouse | `warehouse_import`, `warehouse_dispatch` tabs; `WarehouseDispatchView` | Read panel consumes the existing adapter; legacy import/dispatch/count mutations remain guarded legacy handlers | `/warehouse-suite/warehouses`, `/warehouse-suite/stock-in`, `/warehouse-suite/stock-out`, `/warehouse-suite/ledger`, `/warehouse-suite/counts` | `warehouseImports`, `warehouseDispatches`, `warehouseStockCounts` Firebase state/handlers | PARTIAL | Product/warehouse/UOM/weight mapping and approved mutation DTO; disposable CRUD fixture/browser proof |
| Inventory | Inventory views nested under warehouse flows; `rawWarehouseStockCounts` state | Read panel consumes `/inventory/lookup`, `/inventory/balances`, and `/inventory/ledger`; no safe UI mutation mapping | `/inventory/lookup`, `/inventory/balances`, `/inventory/ledger`, `/inventory/transactions/*`, `/inventory/counts` | Firestore inventory/count paths | PARTIAL | Opening/replay evidence, quantity/weight/UOM semantics, movement invariants, disposable fixture |
| Finance | `FinanceView`, `rawFinancials`, `rawExpenses`, `rawPayments` | Read panel consumes cash accounts/transactions/expenses; payment posting remains explicitly blocked | `/finance-suite/cash-*`, `/finance-suite/expenses`, `/finance-suite/aging` | `financials`, `expenses`, `payments`, `bankTransactions` | PARTIAL | Accounting DTO mapping, payment posting policy, UI mutation contract, reconciliation E2E |
| Debt | `DebtManagementView` and debt handlers | Read panel consumes receivables/payables/aging; displayed debt ledger still derives from legacy-shaped orders/payments | `/finance-suite/receivables`, `/finance-suite/payables`, `/finance-suite/debt-movements`, `/finance-suite/aging` | Customer debt/payment Firestore paths | PARTIAL | Authoritative debt/allocation source, idempotency E2E, business approval, UI source-of-truth switch |
| HR | `employees`, `employee_reviews`, `company_attendance` tabs | Employee/attendance reads use VPS; check-in/check-out/leave use VPS; direct attendance time edit is explicitly blocked pending adjustment contract | `/hr-suite/employees`, `/hr-suite/attendance`, `/hr-suite/payrolls` | `employees`, `attendance`, `performance`, reviews | PARTIAL | Approved attendance adjustment DTO/permission policy and browser mutation proof |
| Payroll | `payroll` tab and payroll state | Read panel consumes `/hr-suite/payrolls`; payroll generate/approve/lock UI is not wired to VPS | `/hr-suite/payrolls`, `/hr-suite/payrolls/generate` | `payrollPeriods`, snapshots, adjustments, carryovers | PARTIAL | Payroll calculation/approval/lock mapping and disposable UI mutation proof |
| Documents | Settings/document-related UI; no verified VPS document UI entry | Adapter exists but no verified HD Manager document consumer | `/documents` and document lifecycle endpoints | Firebase files/document references remain | NOT MIGRATED | UI entry, upload metadata contract, object-storage provider, browser test |
| Notification | notification state and notification UI | VPS loader consumes list; persisted notification read action uses VPS in VPS mode | `/notifications` | Firestore `notifications` and notification functions | PARTIAL | Delivery/retry/audit E2E and provider configuration; messaging is not equivalent to notification read |
| Events | No verified HD Manager UI consumer | Adapter list method exists | `/events` | Firebase function/event references remain | NOT MIGRATED | UI contract and event-to-worker evidence |
| Worker | No verified HD Manager UI consumer | Adapter list/run methods exist | `/worker/jobs`, `/worker/jobs/run` | Scheduled Cloud Functions remain in source | NOT MIGRATED | Safe operator UI, scheduler policy, job result/audit flow |
| Reports | `ReportView` and executive dashboard in `src/App.jsx` | VPS read panel consumes `/executive/dashboard` and `/executive/reports`; legacy report rendering still receives legacy-shaped state | `/executive/dashboard`, `/executive/reports` | Report aggregation reads Firebase state | PARTIAL | Make backend response the rendered source of truth; filters/date-range parity and E2E |
| Settings | `SettingsView` in `src/App.jsx` | VPS read panel consumes platform config/flags; settings writes remain guarded legacy-shaped handlers | `/platform/config`, `/platform/flags` | Company/provider/settings writes use Firebase handlers | PARTIAL | Setting-by-setting write contract and permission mapping |
| Realtime | Firebase `onSnapshot` branch in cloud mode | `subscribeRealtime()` consumes authenticated `/realtime/stream` SSE; App reloads VPS data on events | `GET /api/v1/realtime/stream` backed by outbox → Redis pub/sub/in-process stream | Firestore `onSnapshot` listeners | PARTIAL | Disposable two-client browser E2E, Redis-backed runtime verification, reconnect/heartbeat evidence |

## Firebase reference classification

| Reference group | Current classification in VPS build | Evidence / action |
|---|---|---|
| Firebase SDK imports and cloud-mode config | BUILD / LEGACY | Vite VPS aliases use VPS mocks and restrict `envPrefix`; the VPS-mode bundle has no Firebase vendor chunk. Keep cloud compatibility until cutover approval. |
| Auth/Firestore/Storage/Functions calls in `App.jsx` | LEGACY / CLOUD-MODE | Existing Firebase branch is skipped when `VITE_DATA_MODE` is `vps-staging` or `vps-production`; do not delete until each domain has parity. |
| Firebase network guard | ACTIVE TEST GUARD | Browser smoke rejects Firebase hosts and now covers Firestore, Auth/token, Functions, Realtime, and Storage host markers. |
| Firebase migration/export tooling | NON-RUNTIME | Preserve for migration evidence; never bundle into VPS runtime. |

## Adapter contracts added or verified

The existing adapter now exposes thin transport methods for:

- Warehouse, Inventory, Finance, HR, Documents, Events, Worker
- Notification list/unread/read/archive/send
- Storage list/metadata/download/signed URL/upload/archive
- Executive reports/dashboard
- Platform config/flags

Storage upload follows the existing JSON DTO (`fileName`, `mimeType`, and `contentBase64` or `contentText`). No media is written to the frontend or backend local filesystem by this adapter.

## Realtime gate

The VPS now has an authenticated tenant-scoped SSE transport at `/api/v1/realtime/stream`. Outbox events publish to the stream through Redis pub/sub when Redis is connected, with an in-process transport for disposable runtimes without Redis. The browser adapter sends the VPS JWT through `fetch` streaming and never falls back to Firebase. Unit evidence covers same-tenant delivery and cross-tenant isolation; disposable two-client browser evidence is still not run.

- `REALTIME LOCAL CONTRACT = PASS` (same-tenant unit delivery and cross-tenant isolation)
- `REALTIME LOCAL AUTHENTICATED RUNTIME = PASS` (`200 text/event-stream`, `ready` event, tenant id present)
- `REALTIME BROWSER TWO-CLIENT E2E = NOT RUN` (no two disposable tenant fixtures/selectors)
- `REALTIME STAGING RUNTIME = NOT VERIFIED`

## Required implementation order

1. Add a domain-specific VPS read adapter and UI handler for Warehouse/Inventory, preserving explicit quantity, weight, UOM, and audit semantics.
2. Add Finance/Debt read and mutation adapters only after accounting/payment posting contracts are approved.
3. Add HR/Payroll adapter and UI mapping after salary/attendance rules are confirmed.
4. Add Notification/Documents/Reports/Settings UI consumers using the existing endpoints.
5. Run authenticated tenant-scoped realtime two-client E2E against disposable staging Redis/API.
6. Run browser module and cross-domain E2E on disposable fixtures; only then consider Firebase writer freeze.

## Current gate

| Gate | Status | Reason |
|---|---|---|
| Core Auth/Customer/Product/Order VPS UI | PASS | Existing evidence and disposable browser smoke |
| VPS adapter transport coverage | PASS | Thin adapter tests cover route selection and tenant-field protection |
| Full Warehouse/Inventory UI parity | NOT READY | UI call graph still uses Firebase-shaped state/handlers |
| Full Finance/Debt/HR/Payroll UI parity | NOT READY | UI consumers and business contracts incomplete |
| Documents/Notification/Events/Worker/Reports/Settings UI parity | NOT READY | Backend/adapter existence is not frontend consumption |
| Firebase runtime network in VPS core smoke | PASS | Browser guard observed zero Firebase requests |
| Firebase runtime dependency for all domains | NOT READY | Legacy cloud branch remains for unmigrated domains |
| Realtime | PARTIAL | SSE transport and tenant unit evidence pass; disposable runtime/browser two-client evidence is missing |
| Firebase-free cutover | BLOCKED | UI parity, data reconciliation, realtime, and external production gates remain |

## Browser E2E infrastructure boundary

The existing browser executable is installed. A disposable local core smoke was run with loopback frontend/API and a local test-only account: login/core routing produced four API requests, zero Firebase requests, and zero console errors. Expanded module CRUD, cross-domain flows, and two-client realtime E2E still cannot be marked complete because the repository does not provide stable disposable fixtures/selectors for those workflows. No production credential was requested or read.

## Local validation for this update

- `npm run test:vps-api`: 18/18, including authenticated SSE parsing, attendance normalization, and notification/storage/report/settings contract tests.
- `npm run test:vps-browser-smoke`: 4/4, with expanded Firebase host coverage.
- Disposable local browser smoke: PASS; login/core routing, 4 API requests, Firebase requests 0, console errors 0.
- Disposable authenticated SSE runtime smoke: PASS; login 201, stream 200, `text/event-stream`, initial `ready` event.
- Disposable local read-only endpoint smoke: PASS; Warehouse, Inventory, Finance, Notifications, Storage, Reports, Settings, HR, Documents, Events, and Worker list/read endpoints returned 200. This is transport evidence only, not UI CRUD parity.
- Parent VPS-mode build: PASS; parent targeted ESLint: PASS.
- Backend typecheck/build: PASS; targeted realtime Jest suites: 3/3; backend targeted ESLint: PASS.
- VPS-mode `dist/` artifact scan: 0 Firebase marker files and 0 Firebase vendor chunks.
- No production, Firebase, PostgreSQL, migration, deploy, commit, or push operation is authorized by this artifact.

## Final proof run update (2026-08-22)

The following evidence was collected against disposable local API/frontend processes only:

- VPS-mode frontend bundle was rebuilt with `VITE_DATA_MODE=vps-staging` and a loopback API base. The generated `dist/` contained zero Firebase runtime markers and no Firebase vendor chunk.
- Browser login/core smoke: PASS. The browser sent API requests to the loopback VPS API, observed zero Firebase requests, and observed zero console errors.
- Cross-domain tab read proof: PASS for the existing read paths. Visible HD Manager navigation actions reached VPS endpoints for Warehouse (`/warehouse-suite/*` plus `/inventory/*`), Debt (`/finance-suite/receivables`, `/payables`, `/aging`), Finance (`/finance-suite/cash-*`, `/expenses`), Payroll (`/hr-suite/payrolls`), HR (`/hr-suite/employees`), Reports (`/executive/dashboard`, `/executive/reports`), Settings (`/platform/config`, `/platform/flags`), and Notifications (`/notifications`). No Firebase request or console error was observed during these actions.
- Attendance check-in/check-out/leave now use the VPS attendance adapter in VPS mode; direct time overwrite remains deliberately blocked because no approved adjustment contract exists.
- This is transport/read evidence, not full module parity. Warehouse/Inventory/Finance/Debt/Payroll mutations, Documents UI, Events/Worker UI, cross-domain business workflows, and disposable fixture cleanup are not marked PASS.
- Realtime backend/unit evidence remains PASS, but the required three-browser proof (tenant A client A/B, tenant B client C, reconnect, heartbeat, duplicate handling, re-auth) was not certified because the repository has no disposable tenant-B fixture/selector harness. No events were injected into a browser.

### Current local gate after proof run

| Gate | Status | Evidence / exact remaining gap |
|---|---|---|
| VPS core UI routing | PASS | Browser login/core smoke; API requests > 0, Firebase requests 0, console errors 0 |
| Warehouse/Inventory reads | PASS | Browser read panel calls warehouse and inventory endpoints; mutation DTO/fixture parity remains open |
| Finance/Debt reads | PASS | Browser read panel calls finance/debt endpoints; authoritative payment/debt semantics remain open |
| HR/Attendance reads and attendance actions | PARTIAL | VPS list and check-in/out/leave are wired; adjustment edit and payroll mutation contracts remain open |
| Reports/Settings/Notifications reads | PASS | Browser actions call VPS endpoints; rendered legacy-shaped source and settings writes remain open |
| Documents/Events/Worker UI | NOT READY | No verified HD Manager UI entry/consumer, despite adapter/backend transport existing |
| Cross-domain business E2E | NOT READY | No disposable fixtures covering customer→order→inventory→payment→debt→notification→audit |
| Realtime three-client E2E | NOT VERIFIED | Missing disposable tenant-A/tenant-B browser fixture harness; backend authenticated tenant-scoped transport remains PASS |
| Firebase runtime in VPS bundle/core browser path | PASS | VPS bundle marker scan 0; browser Firebase requests 0 |
| Local VPS parity gate | BLOCKED | UI mutation contracts, disposable fixtures, and realtime three-client proof remain |

The above is evidence of the current local state; it does not authorize production deployment, migration, Firebase writer freeze, commit, or push.

## Blocker elimination run update (2026-08-22)

- Added a fail-closed VPS inventory transaction mapper in `src/api/hdConnectStaging.js`. It requires explicit `warehouseId`, `productId`, `unitId`, and positive quantity; it preserves weight/packed/billing values as metadata and does not perform conversion.
- Added explicit VPS-mode stock-in and stock-out routing for the existing warehouse import/dispatch forms. The forms now require the selected VPS warehouse and UOM master records before a mutation can be sent.
- VPS stock ledger edits/deletes and the grouped multi-measure stock-count form remain explicitly blocked because the backend contract is append-only and product-level, respectively.
- Added VPS finance expense creation through `POST /finance-suite/expenses` as a DRAFT record with a deterministic client code. Expense edit/delete remains blocked until an amendment/cancellation contract is approved. Payment posting remains blocked.
- Added adapter transport methods for payroll period list/create and payroll generate/approve/lock. HD Manager payroll calculation and lock still use Firebase-shaped snapshot semantics and are not marked migrated.
- Added targeted adapter tests for explicit inventory mapping, mismatch rejection, stock movement normalization, and payroll lifecycle routing.
- Business and contract gaps are recorded in `HD-CONNECT-BUSINESS-CONTRACT-GAPS.md`.

Result: local VPS parity remains `PARTIAL`. The safe, contract-complete mutation paths are now wired, while unresolved warehouse/UOM/stock-count/payment/payroll/document/realtime semantics remain fail-closed.

### Follow-up validation (2026-08-22)

- Fixed `WarehouseDispatchView` VPS prop wiring so selected warehouse/UOM masters are available at submit time instead of being read from an undefined runtime value.
- VPS import/dispatch UOM selectors now set the ledger quantity unit from the explicitly selected VPS master UOM; no quantity/weight conversion is performed.
- `npm run test:vps-api`: 22/22 PASS; targeted ESLint: PASS; typecheck: PASS; VPS-mode build: PASS; `node scripts/g10-verify-vps-staging-bundle.mjs dist`: PASS with zero forbidden Firebase markers.
- Browser mutation E2E and cross-domain disposable-fixture tests remain `GAP-INFRASTRUCTURE`: no isolated tenant A/B credentials and fixture lifecycle are available in the local environment. The existing browser harness remains 4/4 PASS and does not claim CRUD proof.
