# Local Firebase Runtime Verification

Date: 2026-10-02

Overall: **NOT PASS / not ready for production**. The missing local runtime and additional physical-return safety gaps were repaired and tested. Gap A financial/payroll read models and Gap C amendment/financial integration remain incomplete.

## Confirmed 404 Cause

The warehouse save caller is `handleAddWarehouseDispatch` in `src/App.jsx`, through `commitAtomicInventoryOperation` in `src/services/inventoryTransactions.js`. It calls `inventoryAtomicOperation`, exported in `functions/index.js`, which invokes `executeAtomicInventoryOperation` in `functions/inventoryTransactions.js`.

Cloud mode uses `https://us-central1-hd-manager-c5839.cloudfunctions.net/inventoryAtomicOperation`. Read-only Functions inspection found 24 deployed functions, but neither `inventoryAtomicOperation` nor `orderReturnTransaction`. Existing identity endpoints are ACTIVE in us-central1 on Node 22. Region/project selection is not the cause; backend deployment is missing.

Production was not deployed. Existing localhost 5213 still uses its cloud configuration; it was not switched behind an authenticated user's back. Its cloud endpoint will remain unavailable until an explicitly approved matching backend deployment exists.

## Project Inspection

Owner said to inspect/use c5839, which was used previously. Read-only verification found:

- `.firebaserc` defaults to `hd-manager-c5839`.
- `.github/workflows/deploy.yml` explicitly builds production with project `hd-manager-c5839` and app ID `hd-manager-production`.
- Hosting site: `projects/hd-manager-c5839/sites/hd-manager-c5839`.
- Firestore: only `(default)`, location asia-southeast1. No isolated staging database was returned.
- Public `app.hdconnect.net/version.json` build: `d426221904c121bc91cf059a6ff334420af15bb8`.
- Public `hd-manager-c5839.web.app/version.json` build: `2026.8.1-rc1-1790884232343`. These hosting versions differ; no hosting parity claim is made.
- CLI-visible projects: cangiacam, daumoigiacam-e7c2b, hd-manager-c5839, quanlysaas. None has been verified as a dedicated staging project. Other applications' projects are not treated as disposable test environments.

The prior project-quota blocker is recorded in `phase4c-staging-evidence.json`; project creation was not retried in this continuation. No production business data was read, altered or deleted for load testing.

## Isolated Local Runtime

- Project: `demo-hd-manager-local`; app ID: `hd-manager-local`.
- Auth: 127.0.0.1:9199; Firestore: 127.0.0.1:8185; Functions: 127.0.0.1:5002.
- Frontend: `http://127.0.0.1:5214/` in Vite emulator mode, using real Firebase SDKs, not preview mocks.
- `src/config/firebase-endpoints.js` resolves Functions/REST/SDK hosts. Emulator mode rejects non-demo projects and production/development mode.
- `scripts/start-local-firebase.mjs` copies Functions source into an ASCII temporary directory for Windows/Java compatibility. It excludes production .env files and credentials; only source/package metadata and the dependency junction are used.
- Local Functions host currently uses installed Node 25, whereas production declares Node 22. Emulator success is not cloud runtime/staging parity.
- Test browser blocks non-local network. No API success responses were fabricated. One test deliberately forwards a real return request, waits for the backend commit and drops its response to reproduce an ambiguous confirmation.

Start the backend with `npm run firebase:local` and frontend with `npm run dev:emulator`. Java 21 must be on PATH. The current machine has `C:/Program Files/Microsoft/jdk-21.0.12.8-hotspot`.

Reproduce with `npm run test:local-inventory-e2e`. To test the already running dev server, set `HD_E2E_URL=http://127.0.0.1:5214/`. Disposable local login details are generated in `test-results/local-inventory-e2e/demo-access.json`; do not use real company credentials/data here. Emulator data is disposable and is not a backup of production.

## Verified Behavior

Evidence: `test-results/local-inventory-e2e/evidence.json`, with screenshots in the same directory.

1. Real Identity Center registration, Auth custom-token exchange and UI login.
2. Opening inventory via real authenticated Functions HTTP.
3. UI outbound 12 from stock 100: confirmed outbound, operation receipt, ledger and audit; remaining stock 88.
4. Same command retry: one logical stock effect, one ledger, unchanged balance.
5. UI outbound 101 rejected; customer and quantity remain entered; no outbound is created.
6. Distinct concurrent outbound operations at 2/5/10: one accepted request of 6 from stock 10, final balance 4; repeats remain idempotent.
7. Unauthenticated inventory HTTP rejected with 401.
8. Real UI return 3 sellable, 2 damaged, then 7 sellable: all 12 returned, only 10 enter sellable stock; final stock 98.
9. Lost return response after backend commit: UI retains draft; clicking retry forwards the exact same command and receives duplicate confirmation; no second return effect.
10. Further return rejected after all delivered quantity has been returned.
11. Original order amount/items and payment unchanged. Existing complete-scope debt auditor still passes after physical-only returns.

The evidence file contains 11 grouped cases. Order, delivery and payment setup for return testing are explicitly seeded fixtures. This is NOT proof that order creation, delivery confirmation and payment collection all ran through their UI callers. No financial credit/refund was generated.

## Additional Regression Fixed

Before the rules change, `tests/financial-evidence-rules.emulator.mjs` failed with "Expected request to fail, but it succeeded": a client could forge `orderReturns` directly. Local rules now deny client create/update/delete for return receipts/states, damaged evidence, payment correction events/states and refund receipts. Business audit records are protected by action and reserved identity prefix. Backend Admin transactions remain the writers.

16 collection/role checks pass for owner/warehouse plus cross-tenant read denial. This is local rules evidence, not a claim that all legacy order/payment writes in the application are immutable.

The return UI also generated a new mutation identity on each failed attempt. It now retains the pending key for an unchanged draft until matching server confirmation. Reload/unmount recovery of pending drafts is not claimed by this test.

## Regression Results

- `test:all`: PASS.
- `lint`, targeted lint: PASS.
- `typecheck`: PASS for the configured payroll TypeScript scope.
- Production-mode build: PASS; no deployment.
- Endpoint/client tests: 13/13 PASS.
- Inventory transaction Emulator: 6/6 PASS.
- Inventory reversal Emulator: 5/5 PASS.
- Payment correction Emulator: 7/7 PASS.
- Debt: 13/13 unit and 3/3 Emulator PASS.
- Return transaction Emulator: 7/7 PASS.
- Screen cursor Emulator: 27/27 PASS, page size 50 at 100/1000/5000, no duplicates/missing/cross-tenant rows.
- Existing inventory rules: 5/5 checks PASS.
- New correction evidence rules: 16 role/collection checks PASS plus foreign-tenant denial.

Logs are under `test-results/local-inventory-e2e/`. The earlier inherited engines were not rewritten. The inventory transaction gained a deterministic audit write inside the existing transaction.

## Remaining Work

| Area | Result | Remaining requirement |
|---|---|---|
| Finance bounded read model | NOT PASS | FinanceView still builds transaction lists and totals from full orders/payments/expenses arrays. A page of 50 is not a complete total. Server aggregates and scoped searchable cursor data must match existing approval/allocation semantics. |
| Payroll bounded read model | NOT PASS | Payroll calculations depend on complete employee/period/attendance/payment data; PayrollWorkspace also derives history and prior-period totals from supplied arrays. Authoritative period snapshots/aggregate coverage must precede truncating reads. |
| Amendment before downstream | NOT PASS | Existing handleEditOrder still uses direct merged writes, not an immutable revision command. |
| Amendment after outbound/delivery/payment | NOT PASS | No complete inventory/payment/debt compensation caller. Do not enable by overwriting existing records. |
| Return financial valuation | POLICY CONFIRMED, IMPLEMENTATION PENDING | Owner answered "theo công ty xác nhận". Implement explicit authorized per-return amounts, bounded cumulative credit/allocation checks, immutable approval evidence and consistent customer financial read models. |
| Return/payment/debt/refund lifecycle | NOT PASS | Physical returns are verified, but no authoritative return credit or application refund lifecycle is connected. Reuse existing payment correction and debt auditor; do not reconstruct allocations from a partial page. |
| Real Firebase staging | BLOCKED | No approved isolated existing project. c5839 is configured production, not staging. |
| Full cross-module UI E2E | NOT PASS | Outbound/return UI tests pass with fixture setup; request-to-payment and amendment matrix are not complete. |

PRODUCTION = NOT RELEASED

CANCEL ORDER = NOT RELEASED

PHASE 5 = NOT STARTED

FINAL STATUS = NOT PASS
