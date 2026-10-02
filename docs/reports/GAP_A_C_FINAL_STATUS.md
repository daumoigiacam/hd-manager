# Gap A/C Final Status

> GAP A/C = PAUSED BY OWNER. The application has been restored to baseline d4262219 with export-only presentation optimization. The sections below are historical evidence, not the current runtime contract. See `EXPORT_PERFORMANCE_RESTORE_REPORT.md` for current status and checkpoint b4a116b4.

Date: 2026-10-02

## Latest Local Runtime Continuation

See `LOCAL_FIREBASE_RUNTIME_VERIFICATION_2026_10_02.md` for the newer authenticated browser/Functions/Firestore evidence. It supersedes the older "no authenticated browser E2E" statements below for outbound and physical returns only. The full financial lifecycle and overall Gap A/C remain **NOT PASS**.

- Local demo runtime is working at `http://127.0.0.1:5214/`; existing cloud-mode localhost 5213 is not silently repointed.
- 11 browser/HTTP verification cases pass, including UI retry after losing a response from a committed return.
- A reproduced client-write vulnerability in return/correction evidence was fixed in local Firestore rules; 16 collection/role checks pass.
- Owner confirmed manual company valuation on 2026-10-02. The remaining financial gap is implementing explicit per-return approval and consistent financial read models, not waiting for a proportional allocation rule.
- Read-only inspection confirms `hd-manager-c5839` is the configured production project, with only `(default)` Firestore and neither new inventory nor return endpoint deployed. It is not an approved isolated staging environment.
- No production deployment, Cancel Order release or Phase 5 run was performed.

Overall result: **NOT PASS**. This continuation integrated real screen cursor reads and a real inventory-safe return workflow, but it did not complete every Gap A and Gap C acceptance item.

## Inherited Pass Register

The locked capabilities in `INHERITED_PASS_REGISTER.json` were preserved. No payment, inventory or cursor engine was rewritten.

| Capability | Inherited evidence | Current regression |
|---|---|---|
| Payment allocation/reversal | `functions/paymentCorrection.js` | 7/7 Firestore Emulator PASS; concurrency 2/5/10; B/C and original receipt unchanged |
| Debt reconciliation | `functions/debtCorrectionReconciliation.js` | 13/13 unit and 3/3 Firestore Emulator PASS |
| Inventory transaction | `functions/inventoryTransactions.js` | 6/6 Firestore Emulator PASS; concurrency 2/5/10/25/50 |
| Inventory reversal step | `functions/inventoryReversal.js` | 5/5 Firestore Emulator PASS |
| Cursor engine/model | `firestoreCursorPagination.js`, `tenantListReadModel.js` | Reused by the real screen runtime; engine not reworked |
| Read arbitration/lifecycle/backfill | Prior Phase 4 evidence | Preserved; full `test:all` PASS |

## Gap A: Real Screen Cursor Integration

`src/services/screenCursorRuntime.js` is instantiated by `src/App.jsx`. The mapped screen no longer obtains its displayed list from the foreground full-collection listener. It activates the existing tenant cursor model with page size 50, exposes load-more, coalesces in-flight refreshes, applies local writes by ID and refreshes after server confirmation.

| Screen | Real application read path | 100/1,000/5,000 evidence | Status |
|---|---|---|---|
| Orders | `orders` cursor | max page read 50; missing 0; duplicate 0; foreign tenant 0 | PASS for list path |
| Order requests | `orderRequests` cursor | max page read 50; missing 0; duplicate 0; foreign tenant 0 | PASS for list path |
| Outbound | `warehouseDispatches` cursor | max page read 50; missing 0; duplicate 0; foreign tenant 0 | PASS for list path |
| Customers | `customers` cursor | max page read 50; missing 0; duplicate 0; foreign tenant 0 | PASS for list path |
| Products | `products` cursor | max page read 50; missing 0; duplicate 0; foreign tenant 0 | PASS for list path |
| Pricing | `products` + `pricingInputs` cursors | max page read 50; missing 0; duplicate 0; foreign tenant 0 | PASS for mapped list path |
| Quotations | `customers` + `products` cursors | max page read 50; missing 0; duplicate 0; foreign tenant 0 | PASS for mapped list path |
| Finance | Client arrays and whole-period calculations still require a complete server aggregate/read model | Not covered | NOT PASS |
| Payroll | Client arrays and whole-period calculations still require a complete server aggregate/read model | Not covered | NOT PASS |

Evidence: `tests/screen-application-cursor.emulator.mjs` and `test-results/core-gaps/screen-application-cursor-emulator.json`, 27 cases PASS. The test imports the same runtime used by `App.jsx`, verifies application wiring, stable order, tenant isolation, load-more, refresh coalescing and local mutation behavior.

Remaining Gap A limitations:

- Global search is not yet a complete server-bounded search over unloaded pages.
- Finance and payroll cannot use a partial 50-row page to calculate authoritative totals; no server aggregate/read model has been completed for them.
- Some supporting lookup arrays outside the primary mapped list remain shared application data.

Therefore **GAP A = NOT PASS** despite the mapped list-screen integration passing.

## Gap C: Return Application Workflow

### Implemented

The real order detail screen now calls `onReturnOrder`, which reaches `src/services/orderReturns.js`, authenticated `orderReturnTransaction` in `functions/index.js`, and `functions/orderReturnTransactions.js`.

The server transaction:

- Requires owner identity, tenant scope, an idempotency key and confirmation that goods were actually received back.
- Verifies linked outbound operations, inventory ledger rows and delivery evidence.
- Supports partial, repeated and full returns.
- Enforces cumulative returned quantity less than or equal to delivered quantity under contention.
- Creates one immutable `orderReturns` receipt per logical mutation.
- Restores sellable goods through `RETURN_INBOUND` ledger entries.
- Records damaged goods as `RETURN_DAMAGED` and applies zero sellable-stock delta.
- Changes the order return summary to `PARTIAL_RETURN` or `FULL_RETURN` without deleting or overwriting the original outbound history.
- Emits a server-confirmed cursor mutation so the active order list refreshes without a duplicate foreground request.
- Retries only transient Firestore transaction failures outside the SDK transaction; the deterministic receipt makes an unknown prior commit safe to replay.

Evidence: `tests/order-return-application.emulator.cjs`, 7/7 PASS:

- Real screen-to-server wiring assertion.
- Partial 20, damaged 30, full remaining 50 from delivered 100.
- Sellable stock restored by 70 only; damaged 30 excluded.
- Same-key concurrency 2/5/10 creates one logical effect.
- Ten distinct concurrent returns cannot exceed the delivered total.
- Idempotency conflict, missing delivery evidence and unapproved financial valuation fail closed.

### Not Implemented

| Area | Status | Reason |
|---|---|---|
| Amendment before outbound | NOT PASS | No complete application revision caller |
| Amendment after outbound/delivery/payment | NOT PASS | No compensation caller spanning inventory, payment and debt |
| Return inventory movement | PASS at application transaction scope | Real UI caller and Firestore transaction are covered |
| Full return business completion | NOT PASS end-to-end | Inventory/status passes, but financial valuation and refund are not completed |
| Payment integration for return | NOT PASS | Existing correction step is intentionally not called without an approved return amount |
| Debt integration for return | NOT PASS | Auditor remains complete-scope/read-only; return does not publish an authoritative financial credit |
| Refund workflow | NOT PASS | No application workflow for requested -> recorded -> confirmed; no bank execution is claimed |
| Multi-order payment return E2E | NOT PASS | Inherited payment primitive preserves B/C, but return A is not financially valued or connected |
| Amendment concurrency 2/5/10 | NOT PASS | Caller does not exist |
| Combined financial concurrency | NOT PASS | Return/payment/debt/refund are not one approved transaction boundary |

## Business Rule Required

`docs/reports/BUSINESS_RULE_REQUIRED.json` records the implemented inventory rules and the remaining blocker `partial_return_valuation`.

The application does not guess how discounts, tax and delivery charges are allocated across a partial or repeated return. Any return payload containing `creditAmount`, `paymentCorrection` or `refund` is rejected with `business_rule_required`. This blocks order credit, payment release, debt adjustment, refund amounts and post-payment price/quantity amendment, but it does not block the already-implemented physical return evidence.

## Required E2E Matrix

| Flow | Result |
|---|---|
| A: Request -> order -> outbound -> delivery -> payment -> debt | Existing module regressions PASS; one new browser/application cross-module E2E was not run |
| B: Partial return 20 -> 30 -> reconciliation | Inventory application transaction PASS; financial reconciliation NOT PASS |
| C: Full return -> reconciliation | Inventory application transaction PASS; financial reconciliation NOT PASS |
| D: Damaged return | PASS for transaction, evidence and sellable-stock invariant |
| E: Amendment before/after outbound/delivery/payment | NOT RUN; caller missing |
| F: Multi-order payment, return A, preserve B/C | Payment primitive PASS; application return integration NOT PASS |
| G: Same-key retry | PASS for application return at 2/5/10; not complete for the missing amendment/financial workflow |
| Cursor screen -> mutation -> transaction -> refresh | Wiring and Emulator transaction evidence PASS; no authenticated browser E2E, so this does not make Gap A/C globally PASS |

## Regression Evidence

- `npm run test:screen-application-cursor`: PASS, 27 cases across 100/1,000/5,000 records.
- `npm run test:order-return-application`: PASS, 7/7 cases.
- Inventory transaction Emulator: PASS, 6/6.
- Inventory reversal Emulator: PASS, 5/5.
- Payment correction Emulator: PASS, 7/7.
- Debt reconciliation: PASS, 13/13 unit and 3/3 Emulator.
- `npm run lint`: PASS.
- Targeted lint for new cursor/return files and tests: PASS.
- `npm run typecheck`: PASS for the configured payroll TypeScript project; this is not full-repository typing coverage.
- `npm run build`: PASS, 2,484 modules, 11.60 seconds.
- `npm run test:all`: PASS after both extracted save-queue test harnesses were updated to mock the new server-ACK cursor event.
- Localhost UI smoke: Orders rendered, exactly one `Tải thêm` control was present and browser console errors were empty; no live mutation was performed.

The Emulator CLI warning about missing CLI authentication/MOTD was non-fatal; all local Emulator suites completed successfully.

## Release Decision

The new endpoint exists in source only. It was not deployed. Cancel Order remains unavailable. No Phase 5 load run was started.

PRODUCTION = NOT RELEASED

CANCEL ORDER = NOT RELEASED

PHASE 5 = NOT STARTED

FINAL STATUS = NOT PASS
