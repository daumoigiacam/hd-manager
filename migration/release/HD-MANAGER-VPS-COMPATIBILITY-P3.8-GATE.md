# HD Manager Firebase Baseline to VPS Staging Compatibility Gate (P3.8-B)

Date: 2026-08-29

## Scope and Safety

This gate audits Firebase client behavior as the compatibility baseline and checks the HD Manager VPS staging client contracts. It does not migrate, deploy, alter, or disable Firebase production. It does not write to production or use production credentials.

P3.8 made only two safe staging reads:

- GET https://staging-app.hdconnect.net/version.json returned build p32-vps-staging-finance-refresh-20260829T090000Z.
- GET https://staging-api.hdconnect.net/api/v1/health returned HTTP 200.

The local validated bundle is p38-vps-compatibility-20260829. Because that bundle is not the bundle currently served by staging, no browser interaction with the live P3.2 site is used as evidence for P3.8 UI E2E.

## Runtime Evidence

| Item | Evidence | Result |
| --- | --- | --- |
| Firebase legacy runtime | Firestore listeners remain available in legacy mode; Firebase writers are explicitly blocked in VPS staging mode. | PASS |
| VPS staging API | https://staging-api.hdconnect.net/api/v1/health returned HTTP 200. | PASS |
| Local P3.8 staging bundle | dist/version.json reports p38-vps-compatibility-20260829; npm run verify:g10-vps-bundle found no forbidden fallback target. | PASS |
| Live staging UI provenance | Live version.json is P3.2, not the P3.8 local bundle. | PARTIAL |
| Production access | No production URL, credential, write, migration, or deploy was used. | PASS |

## Firebase Baseline

Firebase remains the legacy baseline. In legacy mode, the UI uses Firebase Auth/session restoration, Firestore data reads and onSnapshot subscriptions, and legacy Firestore writers for business operations. In vps-staging mode, the client takes the explicit VPS session/bootstrap path and rejects Firebase writes through assertFirebaseWriteAllowed; it does not silently fall back to Firebase if a VPS request fails.

Baseline behavior retained without modification:

- Auth, session, company bootstrap, customer, product, UOM, warehouse, inventory, order, debt, finance, payment, and reports retain their legacy Firebase paths where the application exposes them.
- Firebase realtime remains based on Firestore onSnapshot subscriptions.
- Legacy Firebase payment and debt-payment requests are disabled in VPS staging instead of being rerouted to Firebase.
- No Firebase scheduler, function, storage, authentication, or data was changed.

## VPS Contract and UI Work Completed

The staging client and UI now use real identifiers across the available fulfillment path:

order -> reservation -> delivery plan -> stock-out

- POST /sales/orders/:orderId/confirm confirms an order only; it does not create a stock-out.
- POST /sales/orders/:orderId/reserve creates the order reservation.
- POST /sales/orders/:orderId/delivery-plans receives real orderLineId values and returns persisted delivery-plan and line identities.
- POST /warehouse-suite/stock-out receives a real warehouse, product, unit, orderId, orderLineId, reservationId, deliveryPlanId, and deliveryPlanLineId as linkage metadata.
- The UI sends its mutation ID only as the HTTP idempotency key; it is stripped from the DTO body.
- The fulfillment UI shows ordered, reserved, planned, dispatched, and remaining quantities. It counts only stock-out entries matching every order/reservation/plan/plan-line identifier.
- The legacy warehouse-dispatch form, legacy order-return control, and legacy order-payment control are fail-closed in VPS staging because they cannot preserve the required lifecycle lineage.

## Domain Matrix

Legend: PASS means prior P3.2 browser evidence or P3.8 contract/source verification exists without a regression. PARTIAL means the client contract or source is present but P3.8 cannot yet be verified in the live staging browser. BLOCKED means no equivalent canonical VPS lifecycle exists and the UI intentionally does not emulate it.

| Domain | FIREBASE_BASELINE | VPS_RUNTIME | UI | API | DATABASE | READBACK | RECONCILIATION | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Session | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Company | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Customer | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL | PARTIAL |
| Product | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL | PARTIAL |
| UOM | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL | PARTIAL |
| Warehouse | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL | PARTIAL |
| Inventory | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL | PARTIAL |
| Order | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Reservation | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Delivery plan | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Warehouse dispatch | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | BLOCKED | PARTIAL |
| Stock-out | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | BLOCKED | PARTIAL |
| Partial fulfilment | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | BLOCKED | PARTIAL |
| Return / reversal | PASS | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Debt | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Finance | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Payment | PASS | BLOCKED | BLOCKED | PARTIAL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Webhook | PASS | PARTIAL | BLOCKED | PARTIAL | PARTIAL | BLOCKED | BLOCKED | BLOCKED |
| Realtime | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Background jobs | PASS | PARTIAL | BLOCKED | PARTIAL | PARTIAL | BLOCKED | BLOCKED | BLOCKED |
| Reports | PASS | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL |

## Evidence and Gaps

### Existing P3.2 Evidence

Auth, session, company bootstrap, customer, product, warehouse, inventory, and finance expense create/read/reload were browser-proven in the existing P3.2 staging gate using disposable data. P3.8 does not alter their accepted contracts. The local identity, VPS API, hybrid-safety, warehouse-integrity, and relevant UI contract suites all pass.

The PARTIAL reconciliation status for customer/product/UOM/warehouse/inventory means the P3.8 bundle has not been released to staging for a fresh browser read-back. It does not mean Firebase production was read or changed.

### Order to Stock-out

The P3.8 UI prevents a stock-out unless actual order line, reservation, delivery-plan, and delivery-plan-line identifiers are present. It derives dispatch progress from only canonical linked stock-ledger entries.

The current VPS service creates reservations and delivery-plan records, while the warehouse stock-out endpoint posts an immutable inventory ledger entry. The backend does not yet provide a canonical atomic dispatch aggregate that persists all of the following as one business event:

1. delivery-plan-line dispatch status and quantity;
2. order-line delivered quantity;
3. reservation consumption or release;
4. linked warehouse stock-out transaction; and
5. idempotent reconciliation and read-back.

The UI therefore keeps actual IDs and fails closed for unsafe legacy forms, but cannot claim canonical lifecycle reconciliation or P3.8 browser E2E until that API exists and the P3.8 bundle is safely deployed to staging.

### Partial Fulfilment

The UI permits multiple stock-outs only up to each persisted plan-line quantity and presents ordered/reserved/planned/dispatched/remaining figures. It avoids client-side double counting by matching every lifecycle identifier. The server does not atomically maintain dispatch/delivered/reconciliation state, so this remains PARTIAL.

### Return / Reversal

logistics-suite contains delivery-return capability, but the current staging client has no canonical endpoint that reverses the linked stock-out, updates the delivery-plan/order-line state, and prevents over-return in one transaction. The UI intentionally exposes no VPS return/reversal action. This is a VPS backend gap, not a frontend fallback gap.

### Debt, Finance, Payment, and Webhook

VPS debt/cash/expense contracts are consumed through tenant-safe client operations. Prior P3.2 evidence covers finance expense create/read/reload. There is no approved automatic order-to-debt/finance lifecycle in the VPS contract, so the UI does not invent one.

The client can list VPS payments, but no approved payment-posting/allocation contract is available to the staging UI. Legacy Firebase payment controls are blocked in VPS staging. SePay/webhook processing exists on the backend, but there is no safe client-side webhook E2E or reconciliation proof in this project. Payment and webhook remain blocked.

### Realtime, Background Jobs, and Reports

The VPS client subscribes using authenticated SSE at /realtime/stream and has reconnection/deduplication tests. Multi-session browser evidence for the P3.8 source cannot be collected until its bundle is live on isolated staging, so realtime remains PARTIAL.

Worker/job and executive/report endpoints are mapped as client contracts, but there is no equivalent browser lifecycle/reconciliation proof against P3.8. No job was run and no report data was modified during this gate.

## Test Evidence

All of the following passed after the P3.8 fulfillment safety changes:

    npm run test:vps-api                                  PASS (45 tests)
    node --test tests/vps-domain-consumption.test.mjs     PASS (10 tests)
    npm run test:identity                                 PASS
    npm run test:hybrid-runtime                           PASS
    npm run test:warehouse-inventory                      PASS
    npm run test:warehouse-dispatch                       PASS
    npm run test:warehouse-dispatch-bulk-order-billing    PASS (500-order stress, 37.82 ms)
    npm run test:order-request-ux                         PASS (30 tests)
    npm run test:customer-debt-payment                    PASS
    npm run test:realtime-listener-planner                PASS (4 tests)
    npm run test:realtime-tenant-sync                     PASS (4 tests)
    npm run test:vps-browser-smoke                        PASS (6 tests)
    npm run typecheck                                     PASS
    npm run lint                                          PASS
    VITE_DATA_MODE=vps-staging npm run build              PASS
    npm run verify:g10-vps-bundle                         PASS (13 files, 0 findings)
    git diff --check                                      PASS (only existing LF/CRLF warnings)

## Staging E2E Limitation

The isolated HTTPS staging API is reachable, but the currently served UI build is P3.2. There is no reviewed, host-key-verified staging release route in this workspace for the P3.8 bundle. Deploying through the production workflow, guessing infrastructure access, or bypassing SSH host verification would violate the isolation and safety requirements. P3.8 must not claim a browser E2E PASS yet.

## Required Blockers Before a VPS Canary

1. Provide a reviewed, isolated, host-key-verified staging release route for the P3.8 UI bundle, then repeat browser E2E using only a disposable tenant.
2. Add a canonical VPS fulfillment mutation that atomically links delivery plan line, order line, reservation, warehouse stock-out, and read-back reconciliation. The VPS backend project owns this change.
3. Add an idempotent linked reversal/return contract that cannot exceed dispatched quantity and restores the correct inventory/reservation state. The VPS backend project owns this change.
4. Define and expose approved payment allocation/posting and webhook reconciliation contracts before wiring a staging UI action. The VPS backend project owns this change.
5. After the new bundle is staged, run two-session realtime evidence and a browser order-to-dispatch read-back with disposable tenants.

## Final Gate

    HD_MANAGER_VPS_COMPATIBLE = NO
    STAGING_E2E = PARTIAL
    CANARY_READY = NO

    FIREBASE_PRODUCTION = ACTIVE
    PRODUCTION_DATA_CHANGED = NO
    PRODUCTION_WRITES = 0
    PRODUCTION_MIGRATION = NONE
    PRODUCTION_DEPLOY = NONE
    DATA_LOSS = NONE OBSERVED

    NEXT_BLOCKER = A reviewed isolated P3.8 staging release route, followed by
                   canonical VPS fulfillment/reversal reconciliation contracts.
