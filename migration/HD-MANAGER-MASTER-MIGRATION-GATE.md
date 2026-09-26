# HD Manager Master Migration Gate

Date: 2026-08-29

## Scope and safety boundary

This gate compares the Firebase baseline in
`migration/HD-MANAGER-FIREBASE-BASELINE-CONTRACT.md` with the current HD
Manager VPS staging client. It uses only code, tests, and the already recorded
disposable staging evidence. It does not query or mutate production Firebase,
production PostgreSQL, production Redis, production payment providers, or
production infrastructure.

Current observed staging endpoints:

| Target | Observation |
| --- | --- |
| `https://staging-app.hdconnect.net/version.json` | HTTP 200; serves `p32-vps-staging-finance-refresh-20260829T090000Z` (P3.2), not the P4/P3.8 artifact. |
| `https://staging-api.hdconnect.net/api/v1/health` | HTTP 200. |
| P4 artifact | Local immutable artifact `p4-vps-staging-20260829T072544Z`, SHA-256 `08A6FB1849F0448AEA9B01A65480DEACBAD58FD81A3F8FEA03075C4AF582BB18`; it has not been safely released to staging. |

The app is therefore not eligible for canary or production cutover.

## FIREBASE_BASELINE

The Firebase baseline remains active and is documented in the companion
contract. It includes Firebase Auth/custom-claim session restore, Firestore
tenant/RBAC rules, company/customer/product/order/warehouse collections,
Firebase Functions for identity and payment providers, Firestore realtime, and
scheduled/document-triggered jobs.

Firebase is the authoritative legacy/production path. No code in this task
changes Firebase production behavior.

## VPS_COMPATIBILITY

The HD Manager staging client has a typed/normalizing API adapter in
`src/api/hdConnectStaging.js` and a guarded transport in `src/api/client.js`.
It contains server-session authentication, tenant-safe query/payload helpers,
idempotency keys for supported mutations, authenticated SSE reconnect with
`afterEventId`, and contracts for core master data, warehouse, inventory,
sales, finance, notification, reporting and platform endpoints.

This is contract evidence, not proof that every VPS service implements the
same business semantics. The gaps below remain owned by the VPS/HD Connect
Platform where no client-side change can make the operation correct.

## HD_MANAGER_VPS_INTEGRATION

Implemented and regression-guarded in the HD Manager client:

- VPS staging restores its own session and bootstraps company/user through the
  VPS API.
- Core data reads for customers, products, UOMs, orders, warehouses,
  notifications, attendance and employees use VPS API calls.
- Firebase sync/listeners short-circuit before any legacy Firestore read in
  VPS staging. Firebase writes and activity logs fail closed in VPS staging.
- Order workflow exposes confirm, reserve and release. It does not use order
  confirmation as a hidden stock-out/payment/debt event.
- Delivery plans, linked warehouse dispatch and reversal UI require real
  lineage IDs. The client sends no fabricated IDs.
- Debt and cash UI consumes the available VPS finance contracts. Legacy
  payment controls remain fail-closed in staging.

The Firebase-boundary regression check was added to
`tests/hybrid-runtime-safety.test.mjs` during this gate. It ensures a staging
bundle cannot silently use the legacy Firestore effect or Firestore writers.

## E2E_STATUS

The only approved real browser evidence is the prior P3.2 HTTPS staging run
against disposable tenant C and database `hd_connect_staging`:

| Capability | Evidence | Status |
| --- | --- | --- |
| Auth, session, company | Login, reload and tenant bootstrap in real staging browser. | PASS |
| Customer | Create/read/reload via `POST`/`GET /master-data/customers`. | PASS |
| Product and UOM | Disposable product and UOM create/read used in inventory flow. | PASS |
| Warehouse | Disposable warehouse create/read. | PASS |
| Inventory | Opening balance, ledger/balance read-back after reload. | PASS |
| Order | Draft with one line create/read/reload only. | PARTIAL |
| Debt | Read models only; no lifecycle mutation evidence. | PARTIAL |
| Finance | Expense create/read/reload evidence; payment allocation absent. | PARTIAL |
| Fulfillment and return | Current client has contracts and static tests, but P4/P3.8 is not live in staging for browser read-back. | PARTIAL |
| Tenant isolation | A second independent approved browser context has not been proven. | BLOCKED |
| Realtime | Client/SSE tests pass; no two-session HTTPS staging evidence. | PARTIAL |

No P4/P3.8 browser E2E claim is made while staging serves P3.2.

## PAYMENT_STATUS

Firebase baseline: PayOS and SePay request, status-sync and webhook functions,
plus protected customer debt-payment request, are active legacy behaviors.

VPS/HD Manager status: the client can list the VPS customer-portal payment
endpoint but intentionally refuses to substitute it for internal finance
payments. There is no approved VPS payment creation/allocation/posting
contract proven in staging. The UI correctly remains fail-closed.

**Status: BLOCKED. Owner: HD Connect Platform/VPS.**

VPS_GAP:

- Feature: operator payment posting/allocation and customer/provider payment
  lifecycle.
- Current behavior: legacy Firebase Functions own PayOS/SePay creation,
  verification and reconciliation; staging UI blocks legacy controls.
- Expected behavior: tenant- and RBAC-guarded VPS endpoints with provider
  reference, immutable idempotency key, allocation to order/debt, audited
  status transition and read-back.
- Firebase evidence: `functions/index.js` exports `createPayosPaymentLink`,
  `payosWebhook`, `syncPayosPaymentStatus`, `createSepayPaymentRequest`,
  `sepayWebhook`, `syncSepayPaymentStatus`, and customer debt payment.
- HD Manager expectation: consume the returned canonical payment/payment
  allocation objects only after a documented VPS contract exists.
- Acceptance test: disposable HTTPS staging provider-sandbox payment from
  create through signed callback, idempotent replay, allocation/read-back and
  unauthorized tenant rejection.

## WEBHOOK_STATUS

Firebase Functions currently receive PayOS/SePay callbacks. No VPS webhook
ingress, signature verification, idempotency, tenant routing or staging
provider-sandbox read-back is proven by this repository.

**Status: BLOCKED. Owner: HD Connect Platform/VPS.**

VPS_GAP:

- Endpoint/feature: separate staging callback ingress for PayOS and SePay.
- Current behavior: Firebase Functions own the callback routes and
  reconciliation.
- Expected behavior: provider signature validation, replay protection,
  correlation to the intended tenant/order/payment, immutable audit event and
  safe status read-back.
- Acceptance test: valid callback succeeds once; duplicate is idempotent;
  invalid signature/cross-tenant reference is rejected; no production provider
  credential is used.

## REALTIME_STATUS

The VPS adapter calls authenticated SSE `/realtime/stream`, preserves
`afterEventId`, deduplicates events, reconnects with bounded backoff and
refreshes a VPS read model when an event arrives. Client tests exercise this
behavior. The Firebase baseline also has tenant-aware Firestore listeners.

**Status: PARTIAL. Owner: shared (HD Manager evidence + VPS event service).**

Required evidence: after the P4 artifact is served through HTTPS staging, use
two disposable sessions in the same tenant and a second tenant. Prove delivery,
dedupe/resume after reconnect and the absence of cross-tenant events. Browser
policy must permit this without a workaround.

## PERFORMANCE_STATUS

P3.2 observed individual staging calls around 66-101 ms for expense/session
paths. Those samples are not p50/p95 measurements and do not certify browser
performance, error rate, concurrency, Redis behavior or recovery behavior.

**Status: BLOCKED. Owner: infrastructure/HD Connect Platform for metrics; HD
Manager for browser collection once staging release is available.**

Required evidence: staging-only load plan, endpoint p50/p95/error-rate sample
for login, bootstrap, customer/product/order/inventory/finance, plus SSE
reconnect observation. No production performance claim is permitted.

## DATA_COMPATIBILITY

No Firebase-to-VPS production migration, copy, dual write, reconciliation job
or production data comparison ran in this task. Previous disposable staging
read-back proves only the created disposable records persisted in PostgreSQL
staging. It is not evidence of production data reconciliation.

**Status: BLOCKED. Owner: data migration owner + HD Connect Platform.**

Required input: approved source-to-target mapping, tenant mapping, UOM and
quantity conversion decisions, reconciliation rules, dry-run/rollback plan,
and a disposable/staging reconciliation result. No `prisma db push`, reset or
production write is acceptable as a substitute.

## REGRESSION_STATUS

| Check | Result |
| --- | --- |
| `npm run test:all` | PASS on 2026-08-29; includes identity, VPS API client (45 tests), warehouse, order, reconciliation, payroll and Functions syntax suites. |
| `npm run test:hybrid-runtime` after Firebase-boundary guard | PASS |
| Existing P3.8/P4 recorded API, identity, domain, lint, typecheck and build suites | PASS at their recorded gate; not reclassified as browser E2E evidence here. |
| `git diff --check` | PASS; Git emitted existing LF/CRLF warnings only. |
| Staging UI version check | PASS as an observation: still P3.2, so P4 browser verification remains blocked. |
| Staging API health | PASS: HTTP 200. |

## Final domain matrix

| Domain | FIREBASE | VPS | HD MANAGER | E2E | STATUS | OWNER | EXACT NEXT ACTION |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | PASS | PASS contract | PASS | PASS P3.2 | PASS | HD Manager/VPS | Keep regression coverage. |
| Session | PASS | PASS contract | PASS | PASS P3.2 | PASS | HD Manager/VPS | Keep reload/token-expiry coverage. |
| Tenant / RBAC | PASS rules | PASS contract | PASS guards | PARTIAL | PARTIAL | VPS + HD Manager | Two-tenant HTTPS browser proof with 403 cross-tenant read/write. |
| Company | PASS | PASS contract | PASS | PASS P3.2 | PASS | HD Manager/VPS | Keep bootstrap contract stable. |
| Customer | PASS | PASS contract | PASS | PASS P3.2 | PASS | HD Manager/VPS | Repeat under P4 after release. |
| Product | PASS | PASS contract | PASS | PASS P3.2 | PASS | HD Manager/VPS | Repeat under P4 after release. |
| UOM | PASS | PASS contract | PASS | PARTIAL | PARTIAL | VPS + HD Manager | Prove product unit conversion/read-back on P4 staging. |
| Warehouse | PASS | PASS contract | PASS | PASS P3.2 | PASS | HD Manager/VPS | Repeat under P4 after release. |
| Inventory | PASS | PASS contract | PASS | PASS opening balance | PARTIAL | VPS + HD Manager | Prove dispatch/reversal balance reconciliation. |
| Order | PASS | PASS contract | PASS controls | PARTIAL draft only | PARTIAL | HD Manager/VPS | Release P4, then browser-confirm/reserve/reload. |
| Reservation | PASS behavior | PASS contract | PASS controls | Not re-run on P4 | PARTIAL | VPS + HD Manager | Create/reserve/release in disposable HTTPS browser. |
| Delivery plan | PASS behavior | PASS contract | PASS UI | Not re-run on P4 | PARTIAL | VPS + HD Manager | Create plan and read back linked lines. |
| Warehouse dispatch | PASS | PARTIAL semantics | PASS lineage UI | Not re-run on P4 | PARTIAL | VPS | Add canonical atomic dispatch aggregate and prove browser read-back. |
| Stock-out | PASS | PASS endpoint | PASS lineage DTO | Not re-run on P4 | PARTIAL | VPS + HD Manager | Prove only linked plan-line stock-out updates balance/ledger once. |
| Partial fulfilment | PASS | PARTIAL | PASS display/validation | Not re-run on P4 | PARTIAL | VPS | Persist/reconcile per-line remaining quantity server-side. |
| Reversal / return | PASS | PASS endpoint contract | PASS UI | Not re-run on P4 | PARTIAL | VPS + HD Manager | Prove bounded immutable reversal/read-back in staging. |
| Debt | PASS | PASS read/mutation contract | PASS UI | Read only | PARTIAL | HD Manager/VPS | Disposable receivable and settlement lifecycle/read-back. |
| Finance | PASS | PASS cash/expense contract | PASS UI | Expense only | PARTIAL | HD Manager/VPS | Cash/debt integration and source reconciliation test. |
| Payment | PASS | Missing approved lifecycle | Fail-closed | BLOCKED | BLOCKED | VPS | Implement payment/allocation contract and provider-sandbox E2E. |
| Webhook | PASS | Missing proven ingress | No UI workaround | BLOCKED | BLOCKED | VPS | Implement signed, idempotent staging callbacks and audit/read-back. |
| Realtime | PASS | PASS client contract | PASS SSE integration | No two-session proof | PARTIAL | VPS + HD Manager | Controlled two-session staging evidence. |
| Background events | PASS | API surface only | No equivalent UI lifecycle | BLOCKED | BLOCKED | VPS | Expose/test idempotent worker schedules and completion states. |
| Reports | PASS | PASS read contract | PASS read panels | Not P4 browser-proven | PARTIAL | VPS + HD Manager | Prove report freshness and tenant scope on P4. |
| Storage | PASS | PASS read contract | PARTIAL UI | No staging E2E | PARTIAL | VPS + HD Manager | Prove authorized upload/download/list or keep fail-closed. |
| Recovery / backup | PASS legacy baseline | No evidence | No cutover control | BLOCKED | BLOCKED | Infrastructure + data owner | Supply VPS backup/restore/recovery runbook and staging proof. |
| Performance | PASS baseline expectation | Unmeasured | Unmeasured | BLOCKED | BLOCKED | Infrastructure + HD Manager | Collect staging p50/p95/error/reconnect evidence. |

## Blocker classification

| Classification | Blocker | Owner | Exact next action |
| --- | --- | --- | --- |
| AUTO-CLOSABLE | Firebase staging boundary lacked a direct regression assertion. | HD Manager | Closed in this task by extending `tests/hybrid-runtime-safety.test.mjs`; test passes. |
| INFRASTRUCTURE | Verified P4/P3.8 artifact is not served by HTTPS staging; current version is P3.2. | Platform owner | Provide the approved staging-only release execution with attested host, remote path, service and rollback artifact. Do not use production deploy or guessed SSH access. |
| VPS_FIX | Atomic canonical dispatch reconciliation is not proven for delivery-plan line, order line, reservation and stock-out. | HD Connect Platform | Implement/document one idempotent fulfillment aggregate or an equivalent query/read model and add staging E2E acceptance test. |
| VPS_FIX | Payment allocation/provider flow and verified webhook ingress are absent. | HD Connect Platform | Provide the exact API/webhook contracts and provider-sandbox staging credentials/target through the platform-owned release process. |
| VPS_FIX | Worker/scheduler parity is not evidenced. | HD Connect Platform | Expose idempotent job lifecycle, schedule ownership and staging execution evidence. |
| OWNER_INPUT | Data reconciliation and cutover source-to-target mapping are not approved. | Data migration owner | Provide approved mappings, conversions, reconciliation tolerances and dry-run/rollback acceptance criteria. |
| DECISION_REQUIRED | Recovery/backup certification scope is undefined for VPS. | Platform/data owner | Approve a staging restore drill, RPO/RTO target and audit evidence format. |

## Final gate

```text
HD_MANAGER_VPS_COMPATIBLE = NO
STAGING_E2E = PARTIAL
DATA_RECONCILIATION = BLOCKED
PAYMENT = BLOCKED
WEBHOOK = BLOCKED
REALTIME = PARTIAL
PERFORMANCE = BLOCKED
RECOVERY = BLOCKED
CANARY_READY = NO

FIREBASE_PRODUCTION = ACTIVE / UNCHANGED
PRODUCTION_DATA_CHANGED = NO
PRODUCTION_WRITES = 0
PRODUCTION_MIGRATION = NONE
PRODUCTION_DEPLOY = NONE
FIREBASE_SHUTDOWN = NONE
DATA_LOSS = NONE OBSERVED
```

Migration is not complete. Firebase remains the active production baseline.
