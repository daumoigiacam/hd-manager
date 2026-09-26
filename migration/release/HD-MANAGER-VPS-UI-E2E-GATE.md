# HD Manager VPS UI E2E Gate

Date: 2026-08-28

## Scope and Safety Boundary

This gate used only the disposable local stack at `C:\Users\daumo\AppData\Local\Temp\hd-connect-p1-auth-tenant-e2e`:

- VPS API: `127.0.0.1:3451`
- PostgreSQL: `127.0.0.1:5541`
- Redis: `127.0.0.1:6481`
- Browser bundle: `127.0.0.1:5175`
- Docker compose project: `hdconnect-p1-auth-e2e`

The API container is bound only to `127.0.0.1:3451`; Docker labels and bind mounts point to the disposable Temp directory. `GET /api/v1/health/live` and `GET /api/v1/health/ready` both returned HTTP 200. PostgreSQL and Redis were healthy local containers.

No production account, Firebase project, production database, production network endpoint, production migration, deployment, or production business write was used. All test records referenced below exist only in the disposable PostgreSQL container.

Safety note: the local API log serializes `environment: "production"` for one disposable request even though the container, API port, and database are local. Because that label is ambiguous under the P3 safety rules, no further live mutation was made after observing it. It must not be interpreted as proof of a production request.

## P3_STATUS

`P3_STATUS = BLOCKED`

The in-app Browser control policy blocked all further interaction with the local browser URL. It explicitly prohibited retrying through another browser surface, CDP, or an indirect workaround. P3 cannot be declared PASS without the outstanding real UI actions.

## Disposable Test Identity and Data

| Item | Disposable evidence |
| --- | --- |
| Tenant C | `P3-UI-E2E-C`, company `0d957aef-90d5-4392-87c8-0240a8cdf845` |
| Tenant D | `P3-UI-E2E-D`, company `84dc2eed-aad0-4460-9d23-f4cdf3c9658c` |
| Tenant C user | `2a4198ea-5fa0-4c9a-b43d-70d490783a9f`, disposable owner account |
| Tenant C warehouse | `0ec6dc3a-75f2-49cf-bebc-c8b8d89f8afc`, `P3-C-MAIN` |
| UI-created customer | `6fd8cee4-55d2-4749-97d0-0322f3ea3b08`, `P3 Ui E2e Customer C` |
| UI-created product | `0807fd1c-396f-4879-acd3-adff3fea1191`, `P3 Ui E2e Product C Three` |

Read-only PostgreSQL verification shows Tenant C with one user, one customer, two products, and one warehouse; Tenant D has one user and no Tenant C data. The customer and product above are stored with Tenant C's `companyId`.

## UI -> VPS -> PostgreSQL Evidence Already Collected

The following actual browser actions were completed on the disposable Tenant C before Browser control was blocked:

1. VPS-mode login completed in the local HD Manager UI. The generated VPS session restored after a full browser reload.
2. The UI created `P3 Ui E2e Customer C`; the protected local customer API returned HTTP 201 with recorded correlation ID `717804ff-e9be-4eb5-8aa6-2a74d811e1c7`. PostgreSQL contains the resulting Customer record under Tenant C.
3. The UI created `P3 Ui E2e Product C Three`; the protected local product API returned HTTP 201 with recorded correlation ID `9bca7ef1-4583-4b7f-b32e-2a74d811e1c7`. PostgreSQL contains the resulting Product record under Tenant C.
4. The UI updated Customer C fixed-product settings through `PATCH /api/v1/master-data/customers/6fd8cee4-55d2-4749-97d0-0322f3ea3b08`; local API correlation ID `fb462b26-518a-4b7f-b32e-2df2c012d68a` completed HTTP 200 in 72.98 ms. The local log records Tenant C's company and disposable user ID.

This is real local UI evidence, not a mock. It proves the path `HD Manager UI -> localhost VPS API -> JWT/RBAC/tenant context -> disposable PostgreSQL -> UI refresh` for Auth, Customer, and Product only.

## Domain Results

| Domain | UI action and persisted evidence | Route / data location | Result |
| --- | --- | --- | --- |
| AUTH | Disposable Tenant C login completed in local UI. | VPS Auth on local API; disposable PostgreSQL user. | PASS |
| SESSION | Browser reload restored the VPS session in the local UI. | VPS token namespace `vps-staging`; local API session restore. | PASS |
| TENANT | Tenant C was used through UI; P1 API guard evidence denies cross-tenant reads. A second UI session for Tenant D could not be completed after Browser policy block. | VPS tenant resolver + local PostgreSQL. | PARTIAL |
| CUSTOMER | UI create, HTTP 201 correlation, PostgreSQL row, and UI reload evidence. | VPS Customer API -> disposable PostgreSQL. | PASS |
| PRODUCT | UI create, HTTP 201 correlation, PostgreSQL row, and UI reload evidence. | VPS Product API -> disposable PostgreSQL. | PASS |
| ORDER | UI form was reached, but an actual disposable order create/save could not finish after Browser control was blocked. The adapter validates warehouse and operational unit mapping, but that is not UI E2E proof. | VPS sales-order adapter exists; PostgreSQL UI proof missing. | BLOCKED |
| WAREHOUSE | No completed UI create/read workflow in this gate. P2 proves only local protected API -> PostgreSQL. | VPS API/DB supporting evidence only. | BLOCKED |
| INVENTORY | No completed UI stock-in, stock-out, or opening-balance workflow in this gate. P2 proves only local protected API -> PostgreSQL. | VPS API/DB supporting evidence only. | BLOCKED |
| DEBT | No completed UI receivable/settlement workflow in this gate. P2 proves only local protected API -> PostgreSQL. | VPS API/DB supporting evidence only. | BLOCKED |
| FINANCE | No completed UI finance lifecycle in this gate. The UI explicitly fail-closes payment posting in VPS staging until an approved contract exists. | VPS API/DB supporting evidence only. | BLOCKED |
| ORDER_INVENTORY_LIFECYCLE | No evidence that a sales order automatically posts inventory, receivable/debt, or finance entries on VPS. | Not proven. | BLOCKED |
| TENANT_ISOLATION | P1/P2 API E2E proves Tenant B receives 404 for Tenant A customer/product/order resources; browser Tenant D isolation is still outstanding. | VPS JWT/RBAC/tenant guards -> disposable PostgreSQL. | PARTIAL |
| REALTIME | The frontend opens an authenticated VPS realtime stream and suppresses Firebase fallback in staging; two live browser sessions could not be operated after the policy block. | VPS SSE adapter exists; UI observation missing. | BLOCKED |
| PERFORMANCE | Local API read measurements and two browser-originated mutations exist, but no complete UI timing pass for all core domains. | Disposable local VPS only. | PARTIAL |

## Supporting VPS API -> PostgreSQL Evidence

P1 and P2 were previously run only against the same disposable local stack. They are supporting evidence, not a substitute for P3 UI proof:

- P1: authenticated login/JWT, tenant resolver, RBAC denial, Customer/Product/Order API flows, and cross-tenant `404` behavior were verified against disposable PostgreSQL.
- P2: UOM, Warehouse, Inventory, Debt, and Finance protected API flows were verified against disposable PostgreSQL. The measured local read latencies were 27.56 ms (UOM), 25.31 ms (Warehouse), 27.04 ms (Inventory), 24.12 ms (Debt aging), and 32.86 ms (Finance cash account).
- Current local health check: API live and ready endpoints are both HTTP 200; Docker API/PostgreSQL/Redis containers are healthy.

An attempted rerun of the P1/P2 Jest E2E command on 2026-08-28 stopped before API or database access because this shell did not have the required local secrets (`SECURITY_MASTER_KEY`, `SECURITY_SIGNATURE_SECRET`, `DATABASE_URL`, JWT secrets, Redis URL, and integration encryption key). No secret was printed, fabricated, or changed, and the failure is not treated as an application regression.

## Frontend Routing and Firebase Safety

The local staging code uses `VITE_DATA_MODE=vps-staging` and `VITE_API_BASE_URL` through `HdConnectStagingApi`.

- `src/api/hdConnectStaging.js` creates a `vps-staging` token namespace and routes API calls through the configured VPS base URL.
- `src/App.jsx` has explicit `isVpsStagingMode` guards that prevent Firebase pending-write flushes and Firebase listeners from running in this disposable VPS mode.
- The current staged UI bridge maps an authenticated VPS JWT/session to the legacy employee profile without replacing JWT role or permission claims.
- This gate did not access, change, disable, or test Firebase production. Production Firebase remains outside and unchanged.

## Validation Performed in This Gate

| Check | Result |
| --- | --- |
| `node tests/identity-center.test.mjs` | PASS |
| `node --test tests/vps-api-client.test.mjs` | PASS, 40/40 |
| `npm run typecheck` | PASS |
| Local VPS API liveness/readiness | PASS, HTTP 200 |
| Disposable PostgreSQL Tenant C/D row verification | PASS |
| New browser UI action after policy rejection | BLOCKED by Browser URL policy |

## Required Report Fields

- `AUTH = PASS`
- `SESSION = PASS`
- `TENANT = PARTIAL`
- `CUSTOMER = PASS`
- `PRODUCT = PASS`
- `ORDER = BLOCKED`
- `WAREHOUSE = BLOCKED`
- `INVENTORY = BLOCKED`
- `DEBT = BLOCKED`
- `FINANCE = BLOCKED`
- `ORDER_INVENTORY_LIFECYCLE = BLOCKED`
- `TENANT_ISOLATION = PARTIAL`
- `REALTIME = BLOCKED`
- `PERFORMANCE = PARTIAL`
- `FIREBASE_STATUS = ACTIVE/UNCHANGED (not contacted by disposable VPS-staging run)`
- `VPS_STATUS = ACTIVE/LOCAL-HEALTHY`
- `PRODUCTION_DATA_TOUCHED = NONE`
- `DATA_LOSS = NONE`

## TOP_BLOCKERS

1. Browser automation policy blocks interaction with the disposable local UI URL, so remaining domain E2E actions cannot be executed or observed.
2. The local API log's `environment: "production"` label is ambiguous even though Docker networking and PostgreSQL evidence are local-only; no further mutation should occur until the disposable profile labels this environment unambiguously.
3. The current shell lacks the already-provisioned disposable backend test environment variables, preventing a fresh P1/P2 suite rerun without exposing or fabricating secrets.
4. Order lifecycle, warehouse, inventory, debt, finance, and realtime have no completed UI -> VPS -> PostgreSQL proof.

## Conclusion

**P3 BLOCKED → Browser Use cần được cấp quyền truy cập URL disposable localhost theo chính sách an toàn; đó là việc duy nhất cần thiết để hoàn tất các UI E2E còn lại.**
