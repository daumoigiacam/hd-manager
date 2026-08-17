# HD Manager VPS-First Backend Audit

Date: 2026-08-16

## Decision

**STATUS: NO-GO - NOT READY FOR A VPS-ONLY BUSINESS BACKEND CUTOVER.**

This audit did not change Firebase, Firestore, VPS routing, production data,
Nginx, or client traffic. It did not commit, push, deploy, or run a data
migration.

The current VPS is the static frontend host. Firebase remains the active
business backend for authentication, Firestore data, realtime updates,
payment reconciliation, webhooks, and scheduled/background work.

## Current production request path

```text
Web / Android / Desktop client
  -> Nginx on VPS: static React/Vite files
  -> /api/* and /webhooks/* reverse proxy
  -> Firebase Hosting
  -> Firebase HTTP Functions / Firestore / Firebase Auth / Storage
```

Realtime client state is still supplied by Firestore subscriptions. The
frontend also has direct Firestore reads and writes. Therefore moving only
the Nginx proxy or only a few APIs to the VPS would create split ownership of
orders, debts, payments, and reporting data.

## Backend inventory

| Function area | Active production backend | Frontend / trigger | VPS parity | Work required | Status |
| --- | --- | --- | --- | --- | --- |
| Login and company registration | Firebase Functions + Firebase Auth | identityLogin, identityRegisterCompany, custom tokens | Generic Nest JWT/identity APIs exist, but contracts and trust model differ | Build tenant-aware identity bridge, token/session migration, password/PIN/device parity | Not migrated |
| Account setup and devices | Firebase Functions | identityCompleteSetup, devices, revoke, logout, audit | Partial generic identity modules only | Implement device, session revocation, audit, RBAC and tenant isolation contracts | Not migrated |
| Password and PIN recovery | Firebase Functions | recovery, verify-PIN and owner reset routes | No verified equivalent for current phone-first/trusted-device flow | Implement secure recovery, owner approval, audit and Firebase/Auth migration strategy | Not migrated |
| Customers and customer portal | Firestore + Firebase Functions | direct Firestore, customerPortalBootstrap | Partial master-data customer API | Migrate tenant/customer data and portal contract, then change client reads | Not migrated |
| Products and pricing | Firestore | direct Firestore reads/writes | Partial product API | Data migration and order/pricing compatibility, including existing product IDs | Not migrated |
| Orders and sales | Firestore | direct Firestore and order flows | Partial sales-order API; line edit unavailable | Implement full order lifecycle, line edits, pricing and history; migrate data | Not migrated |
| Inventory and warehouse | Firestore | direct Firestore, inventory UI | Adapter is feature-disabled by default | Reconstruct stock opening balances, movements, reservations and reports | Not migrated |
| Debt, accounting and reports | Firestore | direct reads, transactions and reporting transforms | Generic modules not proven equivalent | Ledger mapping, payment reconciliation and financial report verification | Not migrated |
| Employee, payroll and evaluation | Firestore + scheduled Functions | auto payroll lock and evaluation aggregation | No verified matching worker implementation | Implement immutable payroll jobs, evaluation aggregation and audit trails | Not migrated |
| Customer points and redemption | Firebase Function + Firestore | customerRedeemPoints | No verified equivalent | Implement point eligibility, atomic redemption and audit | Not migrated |
| AI content | Firebase Function | geminiGenerateContent | No verified equivalent | Move provider key handling and tenant/rate-limit controls to VPS | Not migrated |
| SePay payment creation and QR | Firebase Functions | create, sync and QR proxy routes | No provider implementation found | Implement provider client, QR cache, idempotency and audit | Not migrated |
| PayOS payment creation and sync | Firebase Functions | create/sync payment routes | No provider implementation found | Implement provider client, signature checks and reconciliation | Not migrated |
| SePay / PayOS webhooks | Firebase Functions | public /webhooks/sepay, /webhooks/payos | Current Nest webhook controllers are JWT guarded | Create public, verified, replay-safe, idempotent webhook endpoints | Not migrated |
| Background payment processing | Firestore document trigger | processPaymentJob | Generic BullMQ service has sample processing only | Implement durable payment jobs, retries, dead-letter handling and reconciliation | Not migrated |
| Notifications and realtime | Firestore listeners / Firebase services | onSnapshot and direct listeners | No WebSocket/SSE client transport found | Design tenant-scoped realtime events and client subscription migration | Not migrated |
| File storage and media | Firebase Storage | Firebase-backed application flows | MinIO exists but no HD Manager migration bridge | Inventory objects, permissions, URLs, migration and rollback plan | Not migrated |

## Firebase Functions that remain active

functions/index.js exports 26 HTTP functions and 3 background triggers. The
active HTTP surface includes identity login/registration/setup/recovery,
PIN/device/session/audit operations, customer portal and point redemption,
Gemini AI, SePay payment/QR/sync/webhook, PayOS payment/sync/webhook, and
customer debt-payment creation. The background surface includes payroll auto
lock, employee-evaluation aggregation, and a payment-job trigger.

firebase.json rewrites these routes to Firebase Functions. The VPS Nginx
template explicitly proxies /api/* and /webhooks/* to Firebase Hosting. This
is an active production dependency, not an unused fallback.

## VPS platform audit

The nested hd-connect-platform project contains a real NestJS foundation:
PostgreSQL/Prisma, Redis/BullMQ, health checks, PM2/Docker deployment assets,
generic authentication, identity, integration, and webhook administration
modules. Its build generated dist/src/main.js during this audit.

It is not yet a drop-in HD Manager business backend:

1. Its auth and identity routes do not match the current Firebase identity
   contracts, custom-token behavior, trusted-device/PIN recovery flow, or
   verified tenant data.
2. Its integration and webhook controllers are protected by JWT/permissions.
   They cannot receive public SePay or PayOS callback traffic as required.
3. No provider-specific SePay/PayOS signature validation, payment creation,
   reconciliation, or idempotent inbound webhook processor was found.
4. The BullMQ worker is generic/sample processing, not an implementation of
   payroll, evaluation, or payment-trigger workloads.
5. No WebSocket Gateway, Socket.IO, SSE endpoint, or migrated frontend
   realtime client was found.
6. The frontend VPS adapter is optional and partial. It blocks unresolved
   customer/warehouse IDs and explicitly says order-line editing is not
   enabled until the VPS contract exists. Inventory use is disabled by default.
7. The root GitHub Actions workflow builds and deploys only the static React
   bundle. It does not build, migrate, deploy, health-check, or route traffic
   to the NestJS service.

## Data migration and historical integrity blockers

Existing platform migration documentation records unresolved source-data
requirements. They must be resolved before any write cutover:

- Warehouse identities are not fully evidenced for all source orders.
- Inventory opening balances and replay/as-of logic are not proven.
- Debt opening ledgers and payment-account/reconciliation semantics are not
  fully mapped.
- Some source orders lack sufficient tenant or warehouse evidence.
- Identity records require approved invitation/reset handling; fake users
  must not be created.

No production Firestore-to-PostgreSQL migration, production database write,
or DNS/route switch was performed during this audit.

## Required migration sequence

Each phase is a separate implementation and acceptance gate. Firebase remains
the source of truth until its replacement phase passes reconciliation and
rollback tests.

1. **Foundation and observability:** deploy the Nest service independently,
   add health/readiness checks, structured logs, metrics, secrets management,
   backup and rollback procedures.
2. **Data model and read-only bridge:** map Firestore collections, IDs,
   tenant ownership, indexes and historical ledgers; import a read-only copy
   into PostgreSQL; reconcile counts and financial totals.
3. **Identity:** build a VPS identity API compatible with the app, including
   login, refresh, logout, RBAC, tenant isolation, trusted devices, recovery,
   owner reset and immutable audit logs. Decide separately whether Firebase
   Auth stays temporarily behind the VPS or is migrated.
4. **Master data and business writes:** migrate customers, products,
   employees, orders, inventory, debt/accounting and reports in bounded
   modules. Use dual-read verification before changing a source of truth; do
   not use unverified dual writes.
5. **Payments and webhooks:** implement provider-specific VPS endpoints for
   SePay and PayOS with HTTPS, signature verification, replay protection,
   idempotency keys, durable queues, retry/dead-letter handling, audit logs
   and reconciliation tests.
6. **Background work:** replace scheduled and document-trigger Firebase work
   with named BullMQ workers and server-side schedules, including payroll,
   evaluation, payments, notifications and reporting jobs.
7. **Realtime:** introduce tenant-scoped WebSocket or SSE delivery, client
   subscriptions, ordering/version behavior, reconnect handling and
   multi-client tests before removing Firestore listeners.
8. **Controlled cutover:** update Nginx/API routing one module at a time,
   monitor production, keep a tested rollback path, and only then retire
   Firebase Functions after a stable verification period.

## Validation performed in this audit

| Check | Result | Notes |
| --- | --- | --- |
| Source dependency scan | Completed | Firebase Functions, rewrites, direct Firestore access and VPS adapter gaps were identified. |
| NestJS compile artifact | Completed | hd-connect-platform/dist/src/main.js was generated. |
| VPS production runtime health | Not tested | No production service deployment or traffic switch was attempted. |
| Firestore to PostgreSQL reconciliation | Not tested | Intentionally blocked until a backed-up migration plan exists. |
| SePay/PayOS VPS webhook E2E | Not tested | Equivalent public VPS endpoints do not exist. |
| VPS realtime E2E | Not tested | Equivalent transport/client implementation does not exist. |
| Production cutover | Not attempted | Unsafe with the current dependency and data-parity gaps. |

## Final status

**CHUA HOAN TAT - all mandatory business backend functions still depend on
Firebase/Cloud Functions or direct Firestore.**

The safe next action is to implement the migration sequence above in reviewed,
tested phases. A full VPS-only cutover, a Firebase shutdown, or a frontend
traffic switch must not be performed now.
