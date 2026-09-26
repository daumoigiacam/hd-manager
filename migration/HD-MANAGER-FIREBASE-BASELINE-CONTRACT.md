# HD Manager Firebase Baseline Contract

Date: 2026-08-29

## Scope and evidence

This document records the legacy Firebase behavior that the VPS runtime must
match before a production cutover. It is a code-and-test baseline, not a
production-data migration plan. Firebase production remains the known-good
production path and was not queried, changed, or disabled while preparing this
contract.

Primary evidence:

- `src/App.jsx`: legacy Firebase Auth bootstrap, Firestore tenant reads/writes,
  client flows, and listener lifecycle.
- `src/services/identityCenter.js`: Identity Center HTTP routes backed by
  Firebase Functions.
- `firestore.rules`: company claim, account type, customer ownership, and
  employee role boundaries.
- `firebase.json` and `functions/index.js`: legacy HTTP rewrites, payment
  providers, webhooks, and scheduled/event-driven processing.
- `tests/identity-center.test.mjs`, `tests/request-authorization.test.mjs`,
  `tests/customer-portal-security.test.mjs`,
  `tests/customer-debt-payment.test.cjs`,
  `tests/sepay-reconciliation.test.cjs`,
  `tests/realtime-listener-planner.test.mjs`,
  `tests/realtime-tenant-sync.test.mjs`, warehouse, order, payroll, and
  Firestore rules suites.

The Firebase baseline is a behavior contract. A VPS endpoint existing in code
does not by itself satisfy it.

## Cross-cutting contract

| Area | Firebase baseline behavior | Required VPS-compatible behavior |
| --- | --- | --- |
| Identity and session | Firebase Auth persistence restores a non-anonymous credential. Identity claims supply `identityId`, `companyId`, `accountType`, role, user and customer context. A cached UI session is released only when it is bound to that Firebase user. | Issue and refresh a server session/JWT, bind it to tenant and role, and restore it on reload without accepting stale local identity data. |
| Tenant and RBAC | Firestore rules require an authenticated identity session and restrict company records by claimed `companyId`. Customer sessions have customer-owned collection restrictions; employee message access is assignment/manager scoped. | Derive tenant and RBAC from authenticated server context. Do not trust client-supplied company or role values. |
| Error and retry behavior | UI keeps stable data during recoverable Firestore/read failures, suppresses stale listener races, and makes sensitive operations explicit. Provider errors are mapped to user-safe messages. | Return actionable non-secret errors. Retry only safe operations and preserve idempotency for mutations. |
| Realtime and reconnect | Foreground Firestore listeners are planned to avoid excess listeners; server-confirmed snapshots clear pending local state. Customer and employee scopes differ. | Tenant-scoped event delivery with reconnect, ordering/deduplication, and stale-session recovery. |
| Offline/cache | Legacy UI can retain the last stable listener/read value during transient failures; it must not turn local cache into authorization. | A VPS client may cache only as a degraded presentation state and must revalidate authorization/server data. |
| Quantity, weight, UOM | Products carry units/available units. Warehouse and order flows preserve quantity, unit, optional weight/variant, and do not silently convert business units. | Persist explicit unit IDs and quantities, validate conversions server-side, and reject missing/ambiguous lineage or UOM. |

## Domain baseline

| Domain | Firebase baseline behavior | Evidence | VPS parity requirement |
| --- | --- | --- | --- |
| Authentication | Identity Center exposes login, registration, setup, recovery, password reset, device list/revoke, logout, audit, and account deletion through Firebase Functions; the app restores Firebase Auth state. | `functions/index.js` identity exports; `src/services/identityCenter.js`; identity tests. | VPS auth must preserve login/recovery/session/device semantics or fail closed per capability. |
| Session | Session persistence is bound to Firebase Auth state and custom claims; anonymous startup credentials are not allowed to replace a private session. | `src/App.jsx` auth bootstrap; identity tests. | Access and refresh tokens must restore only the same authenticated disposable/production tenant context. |
| Company / tenant | Company identity is both a claim and the root tenant document. Tenant reads filter on `companyId`; company document is claim-bound. | `firestore.rules`; `src/App.jsx` collection source builder. | Company and organization context must come from server authorization, not UI state. |
| Customer | Employees use company-scoped customer CRUD. Customer accounts may read only their own customer record and approved dependent records, and can update an allow-listed profile subset. | Firestore rules; customer portal security tests; `App.jsx`. | Tenant-scoped customer CRUD and a customer portal scope with the same ownership restriction. |
| Product | Company-scoped products are read and managed through Firestore, including code, group, variants/attributes, prices and units used by order and warehouse screens. | `App.jsx`; product pricing/unit tests. | Product CRUD, variants and product-unit lookup must preserve active status, product code, unit and price semantics. |
| UOM | Product and warehouse forms keep the chosen display/base unit. The app supports an available-unit set and quantity/weight entry without implicit conversion. | Product/unit, warehouse quantity and scanner tests. | Server-side unit master data and explicit conversion policy; unknown UOM must be rejected. |
| Warehouse | Legacy records include warehouse imports, dispatches, stock counts and related assignment metadata, protected by company scope. | `App.jsx`; warehouse inventory/dispatch tests. | Tenant-safe warehouse masters, stock ledger and count transactions. |
| Inventory | Physical inventory is modeled through opening/import/adjustment/dispatch-related records. Quantity and weight validations are distinct. | `tests/warehouse-inventory-integrity.test.mjs`; `tests/warehouse-dispatch-weight-input.test.mjs`. | Immutable stock transactions and balances with server-side validation and read-back. |
| Order | Legacy sales orders, order requests, customer order requests and saved lines are company/customer scoped. Order creation waits for persisted confirmation before reporting success. | `App.jsx`; order request and cross-account sync tests. | Persist all lines atomically enough that a saved order never collapses multiple lines; return the authoritative order. |
| Reservation | The business sequence is explicit: an order reservation reserves stock; it is not a physical stock-out. | Existing order/warehouse workflow source and P3.8 contract tests. | Reservation must identify order and order line, be tenant-safe, and be releasable. |
| Delivery plan | Delivery preparation is separate from the sales order and physical dispatch. | Existing delivery/warehouse flow source and tests. | Persist plans and plan lines with links to order, order line and reservation. |
| Warehouse dispatch / stock-out | Physical fulfillment is a separate warehouse event. It must not be inferred solely from an order status. | Warehouse dispatch and integrity tests. | Canonical stock-out requires real `orderId`, `orderLineId`, `reservationId`, `deliveryPlanId`, `deliveryPlanLineId`, and immutable source ID. |
| Partial fulfilment | Multiple dispatches may occur against an order line; displayed dispatched and remaining amounts must not double count. | Warehouse dispatch bulk/order billing tests; P3.8 client tests. | Server must maintain or expose reconciliation for planned, dispatched and remaining quantities. |
| Reversal / return | Legacy records preserve operational history rather than silently editing completed fulfillment. | Warehouse integrity tests and existing return/reversal UI conventions. | A return/reversal must be a separate immutable event, bounded by dispatched quantity, and restore only the approved inventory/reservation state. |
| Debt | Customer debt/payment request behavior is protected by Firebase Functions and company/customer scope. | `createCustomerDebtPaymentRequest`; customer debt payment tests. | VPS debt records and settlements must not be auto-created merely to mimic UI; approved lifecycle and allocation contract are required. |
| Finance | Legacy finance/expenses and advances are company-scoped. Payroll debt carryover and payment behavior have dedicated validation. | Finance UI; payroll/debt tests. | Cash, receivable/payable, debt movement and expense posting must be tenant-safe and reconcile to their business source. |
| Payment | PayOS and SePay requests, provider status sync and reconciliation are Firebase Function flows. Customer debt payment is a protected function route. | `firebase.json`; PayOS/SePay exports; reconciliation tests. | Provider creation, signed callback verification, idempotent status sync and allocation must be supplied by VPS before UI can enable it. |
| Webhook | PayOS and SePay webhooks are served by Firebase Functions with provider-specific validation/reconciliation. | `functions/index.js`; `firebase.json`; SePay tests. | A VPS webhook ingress must authenticate providers, be idempotent, retain audit evidence and update only the intended tenant/business record. |
| Realtime / notifications | Firestore listeners and notification documents refresh employee/customer UI. Customer support messages have assignment-aware rules. | Firestore rules; realtime planner/tenant sync tests. | Authenticated tenant-scoped realtime, resume/reconnect/dedupe and notification read behavior. |
| Background events | Firebase schedules payroll auto-lock, employee evaluation aggregation and SePay reconciliation. A Firestore payment job document trigger processes payment jobs. | `functions/index.js`; payroll and reconciliation tests. | Equivalent workers/schedules with idempotent execution and observable completion/failure. |
| Reports | Legacy UI derives/reads company data and exposes reporting screens. | `App.jsx`; sales revenue and report-facing tests. | VPS report/read endpoints must represent the same tenant-scoped source data and clearly expose freshness. |
| Storage | Firebase Storage rules are part of the legacy application contract. | `storage.rules`; app storage use. | Tenant-authorized storage listing/upload/download with provider health and audit-safe errors. |
| Backup / recovery | Firebase retains source records and function-managed payment history; app recovery favors authenticated server state over local session cache. | Firebase runtime, identity flow, payment function code. | VPS must define backup, restore, audit and recovery evidence before a cutover can be certified. |

## Firebase-specific constraints that must not leak into VPS staging

When `VITE_DATA_MODE=vps-staging`, the HD Manager client must not use legacy
Firestore as an invisible data fallback. The current client explicitly:

1. returns before constructing the legacy Firestore sync/listener effect;
2. blocks `setDoc`, `deleteDoc`, REST patch and transaction wrappers; and
3. skips Firestore activity logging.

`tests/hybrid-runtime-safety.test.mjs` guards this boundary. A VPS screen may
show a VPS API error/degraded state, but it must not render Firebase or local
mock records as authoritative staging business data.

## Baseline gaps requiring VPS evidence

The following Firebase behaviors have no proven VPS replacement in a real
staging browser yet: canonical dispatch reconciliation, bounded linked
reversal, provider payment allocation, verified webhooks, scheduled jobs,
multi-session realtime, performance percentiles, and backup/recovery. These
are baseline requirements, not optional enhancements.

## Safety record

```text
FIREBASE_PRODUCTION = ACTIVE / UNCHANGED
PRODUCTION_DATA_CHANGED = NO
PRODUCTION_WRITES = 0
PRODUCTION_MIGRATION = NONE
FIREBASE_SHUTDOWN = NONE
```
