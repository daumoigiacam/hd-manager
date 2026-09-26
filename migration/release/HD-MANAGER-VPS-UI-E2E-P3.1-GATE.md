# HD Manager VPS UI E2E P3.1 Gate

Date: 2026-08-28

## Scope and safety

P3.1 reused only the disposable VPS stack and disposable tenants prepared for P1/P2/P3. No production account, Firebase production data, production PostgreSQL database, production deployment, migration, or business write was used in this run.

| Item | Disposable target |
| --- | --- |
| VPS API | `http://127.0.0.1:3451/api/v1` |
| PostgreSQL | disposable Docker PostgreSQL published only at `127.0.0.1:5541` |
| Redis | disposable Docker Redis published only at `127.0.0.1:6481` |
| Tenant C | `0d957aef-90d5-4392-87c8-0240a8cdf845` (`P3-UI-E2E-C`) |
| Tenant D | `84dc2eed-aad0-4460-9d23-f4cdf3c9658c` (`P3-UI-E2E-D`) |
| Disposable warehouse C | `0ec6dc3a-75f2-49cf-bebc-c8b8d89f8afc` (`P3-C-MAIN`) |

## `environment: "production"` determination

The local log label is not evidence of a request to production.

- The disposable API container is bound only to `127.0.0.1:3451`; its PostgreSQL and Redis peers resolve to the same Docker network (`postgres:5432`, `redis:6379`).
- Docker inspection showed active API connections only to those disposable Docker peers and the local listener; no external established production connection was observed.
- `docker-compose.yml` defaults `NODE_ENV` to `production` and `PLATFORM_ENVIRONMENT` to `PRODUCTION` when no value is injected. The original P1/P2/P3 override inherited those defaults.
- `src/config/app.config.ts` assigns `NODE_ENV` to `app.nodeEnv`, and `src/config/platform-config.module.ts` writes that value as the `environment` logger field. The label therefore came from a local Compose default rather than the destination of an HTTP request.
- The VPS backend has no Firebase runtime client. `FIREBASE_CONFIG` is a disabled/sentinel legacy-reader setting in this disposable stack; it did not create Firebase production traffic.
- A local-only P1 Compose override was prepared with `NODE_ENV=test`, `PLATFORM_ENVIRONMENT=TESTING`, and `FIREBASE_CONFIG=disabled`. Applying it safely requires a container recreate. The current shell does not have the already-provisioned local `SECURITY_SIGNATURE_SECRET` interpolation value, so Compose rejected the build before starting any work. No secret was read, printed, generated, or changed, and the current container was left unchanged.

Result: the current `production` label is a local configuration-label defect, not a production request. The un-applied test-label override is blocked only by local secret injection for the disposable harness.

## Previously demonstrated UI to VPS evidence

The following P3 UI operations were completed before the browser policy block, all against Tenant C and the disposable PostgreSQL database.

| Domain | UI action | VPS endpoint and result | PostgreSQL / UI evidence | Status |
| --- | --- | --- | --- | --- |
| Auth | Disposable Tenant C user signed in through the UI | VPS JWT/session issued | Company bootstrap completed; browser reload retained the session | PASS |
| Session | Reloaded authenticated UI | Existing VPS session restored | Tenant C UI continued without a new production login | PASS |
| Customer | Created `P3 Ui E2e Customer C` in UI | `POST /api/v1/master-data/customers` returned `201`; correlation `717804ff-e9be-4eb5-8aa6-2a74d811e1c7` | Tenant C row persisted in disposable PostgreSQL and re-rendered after UI reload | PASS |
| Product | Created `P3 Ui E2e Product C Three` in UI | `POST /api/v1/products` returned `201`; correlation `9bca7ef1-4583-4b7f-b32e-2a74d811e1c7` | Product `0807fd1c-396f-4879-acd3-adff3fea1191` persisted in disposable PostgreSQL and appeared in the UI | PASS |

The earlier customer-product configuration patch also returned `200` from VPS and persisted Tenant C's configured price/unit data in the disposable database.

## P3.1 domain gate

| Domain | UI -> endpoint -> VPS -> PostgreSQL -> UI evidence | Status | Reason |
| --- | --- | --- | --- |
| AUTH | Disposable UI login -> VPS session/JWT -> Tenant C -> UI bootstrap | PASS | Direct UI evidence recorded above. |
| SESSION | UI reload -> VPS session restore -> Tenant C -> UI remains authenticated | PASS | Direct UI evidence recorded above. |
| CUSTOMER | UI create -> `POST /master-data/customers` -> VPS -> disposable PostgreSQL -> UI reload | PASS | Direct UI and database evidence recorded above. |
| PRODUCT | UI create -> `POST /products` -> VPS -> disposable PostgreSQL -> UI reload | PASS | Direct UI and database evidence recorded above. |
| ORDER | No permitted UI request in P3.1 | BLOCKED | Browser security policy blocks access to the disposable local URL. No workaround was attempted. |
| WAREHOUSE | No permitted UI request in P3.1 | BLOCKED | Browser security policy blocks access to the disposable local URL. |
| INVENTORY | No permitted UI request in P3.1 | BLOCKED | Browser security policy blocks access to the disposable local URL. |
| DEBT | No permitted UI request in P3.1 | BLOCKED | Browser security policy blocks access to the disposable local URL. |
| FINANCE | No permitted UI request in P3.1 | BLOCKED | Browser security policy blocks access to the disposable local URL. |
| ORDER -> INVENTORY lifecycle | No permitted UI order flow | BLOCKED | Cannot certify business-side effects without the real UI action. |
| TENANT ISOLATION | No two-session UI test permitted | BLOCKED | P1 backend evidence confirms cross-tenant access is denied, but UI E2E evidence is required for PASS. |
| REALTIME | No two-session UI test permitted | BLOCKED | Browser policy prevents multi-session validation; no policy bypass was attempted. |

## Supporting VPS API and database evidence

P1/P2 API/database gates remain useful supporting evidence only; they do not replace the UI E2E requirement.

- Tenant D could not read Tenant C data in the backend gate; the cross-tenant request was denied (`404`) under authenticated tenant/RBAC handling.
- The P2 disposable API/database gate exercised UOM, warehouse, inventory opening and stock-out, debt receivable and settlement, finance cash/bank, and reconciliation.
- Those backend routes were measured only on the disposable stack. They establish API/database capability, not UI certification for the blocked domains.

## Validation rerun in P3.1

| Command | Result |
| --- | --- |
| `node tests/identity-center.test.mjs` | PASS - Identity Center unit checks passed. |
| `node --test tests/vps-api-client.test.mjs` | PASS - 40/40 tests. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `git diff --check` | PASS - no whitespace errors; Git emitted only existing LF/CRLF warnings. |

## Remaining blockers

1. **Browser UI E2E policy:** the browser automation policy rejects navigation/control of the disposable localhost URL. The user required no policy bypass, so Order, Warehouse, Inventory, Debt, Finance, lifecycle, two-tenant UI isolation, and realtime could not be exercised in P3.1.
2. **Disposable Compose test label activation:** recreating the local API with the new explicit TEST labels requires the pre-provisioned local secret-injection mechanism. The shell intentionally lacks `SECURITY_SIGNATURE_SECRET`; no secret handling was attempted. This does not indicate production traffic, but it prevents replacing the current local log label during this session.

## Firebase and production safety

- Firebase production: ACTIVE / UNCHANGED. P3.1 made no Firebase production request or mutation.
- VPS disposable stack: ACTIVE / UNCHANGED except for the un-applied local Compose override file.
- Production data touched: NONE.
- Production writes: 0.
- Production migration: NONE.
- Data loss: NONE observed.
- Commit, push, deploy: NONE.

## Cutover conclusion

**P3.1 BLOCKED. The VPS is not eligible for a controlled VPS cutover.**

The only permitted next action is to provide browser access to the disposable localhost stack and the existing safe local secret-injection mechanism, then repeat the blocked UI flows. No production migration, Firebase shutdown, or cutover should occur before those UI E2E gates pass.
