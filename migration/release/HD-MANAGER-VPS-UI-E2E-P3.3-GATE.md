# HD Manager VPS UI E2E P3.3 Gate

Date: 2026-08-29

## Scope and safety

P3.3 changed only the HD Manager frontend/client source in this workspace. No VPS backend, PostgreSQL, Redis, Firebase configuration, Firebase data, production infrastructure, migration, production deployment, commit, or push was changed.

| Item | Value |
| --- | --- |
| Staging UI | `https://staging-app.hdconnect.net` |
| Staging API | `https://staging-api.hdconnect.net/api/v1` |
| Local P3.3 bundle | `p33-vps-staging-ui-lifecycle-20260829` |
| Live staging release observed | `p32-vps-staging-finance-refresh-20260829T090000Z` |
| Production data touched | No |
| Production writes | `0` |
| Production migration | None |
| Production deploy | None |
| Firebase production | Active and unchanged |

The staging API health endpoint returned HTTP `200`. Its PostgreSQL and Redis checks were healthy. The staging UI version endpoint also returned HTTP `200`, but it still serves the P3.2 bundle, not the local P3.3 bundle.

## Implemented frontend work

### Order

- Added tenant-safe adapters for `POST /sales/orders/{id}/reserve` and `POST /sales/orders/{id}/release-reservation`.
- Added VPS staging order-detail controls for confirm, reserve, and release. The controls render the actual VPS state (`DRAFT`, `PENDING_APPROVAL`, `CONFIRMED`, `RESERVED`) and keep each mutation idempotent.
- Preserved the existing fail-closed legacy payment collection behavior. A generic cash transaction is not substituted for a legacy payment record.

### Debt

- Added a VPS-only debt lifecycle panel that creates a receivable through `POST /finance-suite/receivables` and settles it through `POST /finance-suite/debt-movements`.
- The forms do not send `companyId`, `tenantId`, or `organizationId`; tenant scope remains derived from the authenticated VPS JWT.

### Finance

- Added a VPS-only cash panel for cash account creation and cash transaction create/read through the existing Finance API.
- The UI states explicitly that a cash transaction does not automatically settle a receivable. The existing expense create/read/reload flow remains unchanged.

## P3.3 status

| Domain | Status | UI state | API/backend state | Exact blocker / next owner |
| --- | --- | --- | --- | --- |
| ORDER | PARTIAL | Confirm/reserve/release controls are implemented and contract-tested locally. | `confirm`, `reserve`, and `release-reservation` endpoints exist. | The P3.3 bundle is not deployed to staging, so browser UI -> VPS proof for the new controls cannot yet be collected. Owner: staging release/infrastructure path. |
| ORDER -> INVENTORY | BLOCKED | UI exposes reservation, not an invented stock-out. | `reserve` creates inventory reservations; `confirm` does not create a stock-out. | Backend lacks an approved order fulfillment/delivery -> stock-out lifecycle contract and the staging P3.3 bundle is not live. Owner: VPS sales/inventory backend project. |
| DEBT | PARTIAL | Receivable create and settlement UI are implemented with refresh/render states. | `receivables` and `debt-movements` contracts exist. | New UI has not been browser-tested on live staging. Sales order -> receivable creation is not an approved backend lifecycle. Owner: staging release path, then VPS finance/sales backend for automatic linkage. |
| FINANCE | PARTIAL | Cash account and cash transaction UI are implemented; existing expense UI remains proven from P3.2. | Cash account/transaction endpoints exist. | New cash UI has not been browser-tested on live staging. There is no approved payment allocation contract that atomically links cash receipt, receivable settlement, and sales order. Owner: staging release path, then VPS finance backend. |
| REALTIME | BLOCKED | Existing VPS SSE subscription integration remains unchanged. | `/realtime/stream` is exercised by client tests. | Real browser multi-session proof requires two policy-compliant isolated staging sessions. The available browser context cannot create that isolation without a workaround, which was not used. Owner: staging E2E test environment. |
| TENANT ISOLATION | BLOCKED | Client strips caller-supplied tenant/company identifiers from queries and mutations. | VPS JWT/tenant guard is the authority. | UI-level A-versus-B proof requires two isolated disposable browser sessions; no bypass was used. Owner: staging E2E test environment. |

## Validation completed locally

| Check | Result |
| --- | --- |
| `npm run test:identity` | PASS |
| `npm run test:vps-api` | PASS, 44 tests |
| `node --test tests/vps-domain-consumption.test.mjs` | PASS, 9 tests |
| `npm run test:order-request-ux` | PASS, 30 tests |
| `npm run test:warehouse-inventory` | PASS |
| `npm run test:warehouse-dispatch-bulk-order-billing` | PASS, including 500-order stress check |
| `npm run test:vps-browser-smoke` | PASS, 6 safety checks |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` with `VITE_DATA_MODE=vps-staging` | PASS |
| `npm run verify:g10-vps-bundle` | PASS, no Firebase/provider markers in the VPS staging bundle |
| `git diff --check` | PASS; Git emitted only pre-existing LF/CRLF conversion warnings |

## Staging browser gate blocker

The staging endpoints are healthy, but this workspace has no safe, configured staging-release command or CI workflow. The local SSH attempt to the staging API stopped at host-key verification because `staging-api.hdconnect.net` has no trusted host key in this machine's `known_hosts`; no insecure host-key override was used. The P3.3 instruction also prohibits commit/push/deploy unless explicitly requested.

Because the new bundle is not live at the staging URL, entering the disposable browser account would only test the older P3.2 UI. That would not be valid P3.3 browser evidence, so no test credential was entered and no disposable business write was made in this run.

## Required follow-up to complete the gate

Provide one approved, host-key-verified staging deployment path for the already-built VPS-only bundle, without changing production. After that, run the disposable browser flow for confirm -> reserve -> release, receivable -> settlement, and cash account -> cash transaction; collect tenant-safe network and PostgreSQL staging evidence. A separate policy-compliant second disposable browser session is required for realtime and tenant-isolation UI proof.

## Conclusion

```text
P3.3_STATUS = PARTIAL
FIREBASE_PRODUCTION = ACTIVE
PRODUCTION_DATA_CHANGED = NO
PRODUCTION_WRITES = 0
PRODUCTION_MIGRATION = NONE
PRODUCTION_DEPLOY = NONE
NEXT_BLOCKER = approved host-key-verified staging release path for the P3.3 bundle
```

P3.3 is not a production-readiness or cutover approval. Firebase remains the active production path.
