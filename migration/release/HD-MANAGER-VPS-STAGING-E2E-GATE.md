# HD Manager VPS Staging E2E Gate

Date: 2026-08-29

## Scope and safety

This P3.2 run used only the isolated VPS staging stack and a disposable tenant. It did not use a production account, production business data, Firebase production data, production PostgreSQL, or production Redis.

| Item | Target / evidence |
| --- | --- |
| STAGING_URL | `https://staging-app.hdconnect.net/?release=p32-vps-staging-finance-refresh-20260829T090000Z` |
| API_URL | `https://staging-api.hdconnect.net/api/v1` |
| ENVIRONMENT | `VITE_DATA_MODE=vps-staging`, API container `PLATFORM_ENVIRONMENT=STAGING` |
| DATABASE_TARGET | PostgreSQL staging database `hd_connect_staging` |
| REDIS_TARGET | `hdconnect-redis-staging` isolated staging container |
| TENANT_ID | `P3.2 disposable tenant C` with `P3.2_VPS_STAGING_UI_E2E_ONLY` business marker; database UUID intentionally omitted from this report |
| UI release | `p32-vps-staging-finance-refresh-20260829T090000Z` |

The staging release was built with the VPS staging API base URL and passed `npm run verify:g10-vps-bundle`. The verifier scanned 13 generated assets and found no Firebase, Firestore, or secret markers. The staging frontend mount points to the immutable release directory above, and only `hdconnect-frontend-staging` was recreated.

The HTTPS checks returned `200` for both the staging UI and staging API. The staging frontend, API, gateway, PostgreSQL, and Redis containers were healthy. Production vhost checksums were unchanged before and after the staging frontend release.

## Environment label determination

Some staging API log records contain `environment: "production"`. This is a Node runtime-mode label from `NODE_ENV=production`, not evidence of production routing or production storage:

- The same running API container has `PLATFORM_ENVIRONMENT=STAGING`.
- The browser used only the two staging HTTPS hostnames listed above.
- The frontend is mounted in the staging container and exposes the P3.2 release marker publicly.
- The verified database target is `hd_connect_staging` and the verified Redis target is `hdconnect-redis-staging`.
- No request to a Firebase production hostname or production application hostname was observed during the disposable UI run.

The logger field is misleading and should be made explicitly staging-aware in a later observability task. It is not a reason to treat this run as production traffic.

## UI to VPS evidence

The following actions were performed in a real browser against the staging URL using the disposable account. IDs, access tokens, cookies, and passwords are intentionally not recorded here.

| Domain | Browser action and staging endpoint | VPS and PostgreSQL staging evidence | Status |
| --- | --- | --- | --- |
| AUTH | Disposable user signed in through the staging UI. | VPS issued a staging JWT/session and the tenant bootstrap completed. | PASS |
| SESSION | Browser reload after login. | The same disposable session restored and the UI remained authenticated. | PASS |
| COMPANY | Authenticated staging UI bootstrapped its disposable company/tenant. | Tenant context was returned by the VPS staging auth/bootstrap path and rendered in UI. | PASS |
| CUSTOMER | Created and re-read a disposable customer through the UI -> `POST /master-data/customers`, `GET /master-data/customers`. | VPS response was rendered; the customer persisted in `hd_connect_staging` and remained available after reload. | PASS |
| PRODUCT | Created an active disposable product through the UI -> `POST /products`, `GET /products`. | VPS persisted the ACTIVE product in `hd_connect_staging`; UI rendered it for later order/inventory actions. | PASS |
| WAREHOUSE | Created disposable UOM and warehouse through the UI -> `POST /master-data/units`, `POST /warehouse-suite/warehouses`. | VPS returned the created master data and staging UI used it in inventory setup. | PASS |
| INVENTORY | Posted opening balance quantity `12` through UI -> `POST /inventory/transactions/opening-balance`; reloaded inventory -> `GET /inventory/balances`, `GET /inventory/ledger`. | One disposable warehouse, balance, and ledger entry were present in PostgreSQL staging and re-rendered after reload. | PASS |
| ORDER | Created a disposable draft order with one line, quantity `2`, unit price `12,345` -> `POST /sales/orders`; order/line read through `GET /sales/orders`. | PostgreSQL staging contains exactly one matching DRAFT order and line with subtotal `24,690`; UI rendered the created line. | PARTIAL |
| DEBT | Loaded the staging debt views -> `GET /finance-suite/receivables`, `GET /finance-suite/aging`, `GET /finance-suite/payables`. | All read endpoints returned `200` and the UI rendered the valid empty disposable state. No UI debt mutation was exercised. | PARTIAL |
| FINANCE | Loaded cash/expense views -> `GET /finance-suite/cash-accounts`, `GET /finance-suite/cash-transactions`, `GET /finance-suite/expenses`; created an expense -> `POST /finance-suite/expenses`. | UI showed one pending expense for `1,234`; after browser reload it still showed one expense. PostgreSQL staging confirmed exactly one disposable expense totaling `1,234.00`. API log recorded refresh `201`, expenses read `200`, and expense create `201`. | PARTIAL |

## Finance refresh and write safety fix

The disposable finance write initially exposed a client defect: a non-retried mutation received `401`, refreshed its token successfully, but did not replay the original request. The UI could close the form without a confirmed server write.

The staging client now replays an idempotent request once after a successful token refresh without enabling network retry for mutations. The expense form remains open unless the VPS API confirms success. The disposable browser proof above exercised that exact path:

1. UI submitted the expense form.
2. The client refreshed its disposable staging session.
3. `POST /finance-suite/expenses` returned `201` from the staging API.
4. The UI rendered the pending expense.
5. Browser reload re-read the same record from staging.
6. PostgreSQL staging confirmed the record exists exactly once.

The disposable owner received only the staging-scoped `expense.manage` permission required by the existing VPS guard. No RBAC guard was bypassed or relaxed, and no production role or permission was changed.

## P3.2 domain gate

| Domain | Status | Evidence or precise limitation |
| --- | --- | --- |
| AUTH | PASS | Real staging UI login -> VPS staging JWT/session -> disposable tenant bootstrap. |
| SESSION | PASS | Browser reload retained the disposable staging session. |
| COMPANY | PASS | Disposable company/tenant bootstrap rendered from VPS staging. |
| CUSTOMER | PASS | UI create/read -> VPS staging -> PostgreSQL staging -> reload UI. |
| PRODUCT | PASS | UI active product create/read -> VPS staging -> PostgreSQL staging -> UI. |
| ORDER | PARTIAL | UI created and re-read a DRAFT order and persisted line. No UI confirmation, delivery, or cancellation action exists in the current staging order screen. |
| WAREHOUSE | PASS | UI master-data create -> VPS staging -> PostgreSQL staging -> inventory selector. |
| INVENTORY | PASS | UI opening balance -> VPS staging -> PostgreSQL staging ledger/balance -> reload UI. |
| DEBT | PARTIAL | Staging read path is proven. No disposable UI debt create/settlement lifecycle was exercised. |
| FINANCE | PARTIAL | Cash/transaction/expense read and expense write/reload are proven. Payment posting remains intentionally fail-closed pending its approved VPS payment contract. |
| ORDER_INVENTORY_LIFECYCLE | BLOCKED | The UI currently creates a DRAFT sales order only. It does not invoke the existing `POST /sales/orders/{id}/confirm` path, so no truthful UI proof exists for inventory, debt, or finance side effects from an order. |
| TENANT_ISOLATION | BLOCKED | A second independent browser/session context is needed for UI-level cross-tenant proof. Browser policy/context did not permit this without a workaround, and no workaround was used. Backend isolation evidence does not replace this UI gate. |
| REALTIME | BLOCKED | Two simultaneous staging UI sessions are required. Browser policy/context prevented that test and no bypass was attempted. |
| PERFORMANCE | PARTIAL | Staging API observations included refresh about `100.63 ms`, expenses read about `66.4 ms`, and expense create about `74.76 ms`. No statistically valid p50/p95 browser sample was collected. |

## Validation

| Check | Result |
| --- | --- |
| `npm run test:identity` | PASS |
| `npm run test:vps-api` | PASS - 42 tests |
| `node --test tests/vps-domain-consumption.test.mjs` | PASS - 7 tests |
| `node --test tests/vps-api-client.test.mjs tests/vps-domain-consumption.test.mjs` after refresh fix | PASS - 49 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` with VPS staging environment | PASS |
| `npm run verify:g10-vps-bundle` | PASS |
| `git diff --check` | PASS; only existing LF/CRLF conversion warnings were emitted by Git |

## Safety record

```text
FIREBASE_PRODUCTION = ACTIVE
PRODUCTION_DATA_CHANGED = NO
PRODUCTION_WRITES = 0
PRODUCTION_MIGRATION = NONE
PRODUCTION_DEPLOY = NONE
FIREBASE_SHUTDOWN = NONE
DATA_LOSS = NONE OBSERVED
VPS_STAGING = ACTIVE
```

No production deployment, Firebase change, production database migration, DNS change, production reverse-proxy change, production data write, commit, or push was performed in P3.2.

## Conclusion

```text
STAGING_E2E = PARTIAL
P3.2_STATUS = PARTIAL
NEXT_BLOCKER = Add a UI-exposed, contract-approved order confirmation/lifecycle action and then prove its inventory/debt/finance effects in the disposable staging tenant. After that, obtain a policy-compliant two-session staging browser test for tenant isolation and realtime.
```

The VPS is not production-ready and is not eligible for a production cutover. Firebase production remains the active legacy/production path.
