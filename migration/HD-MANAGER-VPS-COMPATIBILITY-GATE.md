# HD Manager VPS Compatibility Gate

Date: 2026-08-29

## Scope and safety record

This gate audits and changes only the HD Manager frontend/client. It does not
modify the VPS backend, PostgreSQL, Redis, Firebase, deployment targets, or
production business data.

Observed staging targets:

| Target | Result |
| --- | --- |
| `https://staging-api.hdconnect.net/api/v1/health` | HTTP 200; API, PostgreSQL, Redis, outbox, worker, and event bus reported healthy. |
| `https://staging-app.hdconnect.net/version.json` | HTTP 200, but serves `p32-vps-staging-finance-refresh-20260829T090000Z` built 2026-08-28. It does not serve this compatibility build or the verified P4 artifact. |

No browser mutation was attempted because the staging UI release is stale and
the staging-only release target has not been attested for this task.

## Client fixes completed here

### Linked dispatch stock-out

`buildVpsInventoryTransaction` now sends the canonical linked-dispatch
identifiers both at the VPS DTO top level and in legacy-compatible metadata:

- `orderId`
- `orderLineId`
- `reservationId`
- `deliveryPlanId`
- `deliveryPlanLineId`
- `sourceDispatchId`

The UI already rejects missing lineage before stock-out. `referenceId` remains
the delivery plan, while `sourceDispatchId` remains the durable dispatch
mutation identity; a delivery-plan id is never used as a dispatch id.

### Realtime

The VPS SSE client now:

- parses SSE `id:` fields;
- persists the last event ID in session storage, scoped to the authenticated
  company and staging token namespace;
- reconnects with both `Last-Event-ID` and `afterEventId`;
- deduplicates replayed event IDs;
- validates explicit event tenant scope and fails closed on a mismatch rather
  than retrying forever; and
- has the active company supplied by the HD Manager UI when it opens the
  stream.

These changes do not add a Firebase fallback in VPS staging.

## Evidence

| Check | Result |
| --- | --- |
| `npm run test:vps-api` | PASS, 48 tests. Includes linked dispatch DTO, idempotency, partial/replay-safe SSE cursor, `Last-Event-ID`, dedupe, refresh, and tenant-mismatch rejection. |
| `node --test tests/vps-domain-consumption.test.mjs tests/hybrid-runtime-safety.test.mjs tests/realtime-tenant-sync.test.mjs` | PASS, 15 tests. |
| `npm run test:all` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| VPS-staging build plus `npm run verify:g10-vps-bundle` | PASS; 13 bundle files scanned, no Firebase writer finding. |
| `git diff --check` | PASS; only pre-existing LF/CRLF warnings from Git. |
| HTTPS staging API health | PASS, HTTP 200. |
| HTTPS staging UI version | BLOCKED for this gate: P3.2 bundle remains served. |

The VPS handoff asserts disposable PostgreSQL and Redis E2E coverage for the
canonical lifecycle, outbox/retry/DLQ/recovery, and tenant SSE. This frontend
repository does not contain the VPS test stack, so that evidence is recorded
as VPS-contract evidence and is not relabeled as new browser evidence.

## Compatibility matrix

| DOMAIN | FIREBASE_BASELINE | VPS_CONTRACT | HD_MANAGER_STATUS | REAL_DB_E2E | BROWSER_E2E | STATUS | ACTION |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication | Firebase Auth and Identity Center | JWT login/refresh contract | PASS; VPS-only login/session transport | PASS, prior disposable staging evidence | P3.2 prior evidence only | PARTIAL | INFRASTRUCTURE_BLOCKED: release current build before rerun. |
| Session | Claim-bound session restore | Token refresh and `/auth/me` | PASS | PASS, prior disposable staging evidence | P3.2 prior evidence only | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Company / tenant | Firestore claim-bound company | Server-derived tenant and RBAC | PASS; no client tenant override | PASS, VPS handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Customer | Scoped CRUD and customer ownership | Tenant-scoped customer API | PASS | PASS, prior disposable staging evidence | P3.2 prior evidence only | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Product | Product, variants, price, units | Product/unit API | PASS | PASS, prior disposable staging evidence | P3.2 prior evidence only | PARTIAL | INFRASTRUCTURE_BLOCKED |
| UOM | Explicit product/warehouse units | Unit master and mapping | PASS | PARTIAL, prior product/inventory evidence | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Warehouse | Tenant-scoped warehouse records | Warehouse suite API | PASS | PASS, prior disposable staging evidence | P3.2 prior evidence only | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Inventory | Immutable inventory records | Ledger/balance/stock-out contract | PASS | PASS, VPS handoff; prior opening-balance browser readback | Current dispatch build not served | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Order | Atomic saved lines and explicit confirmation | Sales order, confirm, reserve, release | PASS | PASS, VPS handoff; prior draft browser readback | Current workflow build not served | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Reservation | Separate from physical stock-out | Reservation consumption/release | PASS | PASS, VPS handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Delivery plan | Separate dispatch preparation | Plan/line linkage contract | PASS | PASS, VPS handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Warehouse dispatch / stock-out | Canonical physical fulfillment | Linked canonical dispatch and idempotency | PASS; full lineage DTO fixed here | PASS, VPS handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Partial fulfilment | Ordered/reserved/dispatched/remaining | Duplicate/partial protection | PASS; UI calculates and bounds remaining quantity | PASS, VPS handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Reversal / return | Immutable operational history | Immutable bounded reversal | PASS; existing UI creates separate reversal | PASS, VPS handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Debt | Protected company/customer lifecycle | Receivable and settlement contract | PASS client contract | PASS, VPS handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Finance | Expense, cash and source reconciliation | Expense/cash/debt contract | PASS client contract; no payment substitution | PASS for disposable VPS finance coverage in handoff | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Payment | Firebase PayOS/SePay lifecycle | No approved VPS allocation/provider contract evidenced here | Fail-closed | BLOCKED | BLOCKED | BLOCKED | VPS_HANDOFF: provide documented payment/allocation contract and disposable provider-sandbox E2E. |
| Webhook | Firebase provider callback verification | No approved VPS ingress evidenced here | No frontend workaround | BLOCKED | BLOCKED | BLOCKED | VPS_HANDOFF: signed, tenant-routed, idempotent staging callback contract. |
| Realtime | Firestore listeners and notifications | Tenant SSE replay/dedupe contract | PASS; cursor/replay/tenant guard fixed here | PASS, VPS handoff | Current bundle stale; no two-session rerun | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Background jobs | Firebase schedules/triggers | Outbox, retry, recovery, DLQ asserted by handoff | PARTIAL; no equivalent operator UI lifecycle | PASS, VPS handoff | N/A | PARTIAL | VPS_HANDOFF: expose supported user-visible job state only if baseline requires it. |
| Reports | Tenant-scoped reporting | Reporting reads | PASS client read adapter | PARTIAL | Current bundle stale | PARTIAL | INFRASTRUCTURE_BLOCKED |
| Storage | Firebase Storage rule boundary | Storage read/provider contracts | PARTIAL; no new upload/download E2E | PARTIAL | Current bundle stale | PARTIAL | VPS_HANDOFF for any missing storage mutation contract. |
| Performance / recovery | Legacy operational baseline | API health is good; no p50/p95 or restore drill | BLOCKED | BLOCKED | BLOCKED | OWNER_INPUT: staging load metrics and tested backup/restore runbook. |

## Required next action

**INFRASTRUCTURE_BLOCKED**: the platform owner must execute the already
approved staging-only release path with an attested staging host, remote path,
service, and rollback artifact. The served `version.json` must identify the
new compatibility/P4 bundle. No production host, deployment, or credential may
be used.

Once that bundle is served, rerun disposable HTTPS browser E2E for linked
dispatch, partial dispatch, duplicate retry, reversal, reload/read-back and
two-tenant SSE isolation. Payment and webhook remain separate VPS handoffs;
they must not be disguised with a Firebase fallback in staging.

## Final gate

```text
HD_MANAGER_VPS_COMPATIBLE = NO
STAGING_RELEASE = BLOCKED
STAGING_E2E = PARTIAL
CANARY_READY = NO

FIREBASE_PRODUCTION = ACTIVE / UNCHANGED
PRODUCTION_DATA_CHANGED = NO
PRODUCTION_WRITES = 0
PRODUCTION_MIGRATION = NONE
PRODUCTION_DEPLOY = NONE
FIREBASE_SHUTDOWN = NONE
DATA_LOSS = NONE OBSERVED
```
