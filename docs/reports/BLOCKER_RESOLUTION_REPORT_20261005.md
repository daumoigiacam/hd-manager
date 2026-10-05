# HD Manager - Xuất kho Critical Blocker Resolution

Date: 2026-10-05
Repository: `main` at `1bd05fc02f3271e37989066ef678bdfd3eb42d80`
Scope: only the three critical Xuất kho blockers in the task directive.

## Outcome

| Critical blocker | Status | Evidence boundary |
| --- | --- | --- |
| Authorization | **PASS** | Firestore Rules tested in isolated emulator, including tenant identity and configured dispatch actions |
| Idempotency | **PASS** | Transaction/rules tested in isolated emulator for concurrent retries, replay, conflicts and stable IDs |
| Pending/inventory integrity | **PASS** | Focused regression tests for queue/pending state and confirmed-only projections |

**Xuất kho module certification: NOT CERTIFIED.** As required by the stop condition, work stops after resolving these three blockers. Browser/device E2E, full module certification and performance measurement are not claimed or performed here.

## 1. Authorization

### Root cause

The generic tenant write rules allowed authenticated employees to write dispatch documents without enforcing the effective create/edit/delete action used by the app. Permission configuration fields could also be modified without adequately validating the employee's company role.

### Resolution

- Added Firestore Rules checks for the signed-in employee's tenant membership and effective dispatch action for create, edit, archive and delete.
- Create requires a stable `clientMutationId`, a document path derived from the tenant and that mutation ID, and a matching `companyId`.
- Existing legacy records without a mutation ID remain editable; safe defaults avoid making those records unreadable to the update rule.
- Dispatch permission configuration can be changed only by a server-admin claim or an owner identified by the employee record in the same tenant. Regular employees cannot grant themselves permission.
- Admin claims retain their existing ability to manage company permission configuration even when the admin account has no separate employee profile.

### Emulator verification

- No dispatch create action: denied.
- No edit action: denied.
- No delete action: denied.
- Employee attempts to grant own company dispatch permission: denied.
- Owner profile with ordinary employee token role can manage the permission config: allowed.
- Verified admin claim without an employee profile can manage the permission config: allowed.
- Warehouse role with explicit create action: allowed.
- Owner authorized create, edit, archive and delete: allowed.
- Legacy dispatch edit without `clientMutationId`: allowed.
- Mutation ID under a mismatched document ID: denied.
- Existing tenant isolation suite: 14 scenarios pass.

Result: **PASS in emulator only**. No production Rules deployment occurred.

## 2. Idempotency

### Root cause

Client-side duplicate heuristics do not protect against concurrent/retried requests at the Firestore boundary. A committed write with a lost acknowledgement could otherwise be repeated under a new document ID or a reused ID with different content.

### Resolution

- The unchanged form intent retains its client mutation identity across a retry. A changed intent gets a new identity.
- Dispatch create uses a Firestore transaction against the deterministic `wd_{companyId}_{clientMutationId}` document.
- If absent, the transaction creates it. If present, exact canonical payload replay returns the committed record; a changed, incomplete or mismatched payload is rejected.
- Firestore Rules enforce the same deterministic ID, mutation ID and tenant relationship at the server boundary.

### Emulator verification

- Two concurrent identical attempts produce one create and one replay.
- Retry after a committed write with simulated lost acknowledgement returns the same authoritative record.
- JSON-serialized queued command replay returns the same record.
- Same identity with changed quantity is rejected.
- Same identity with a removed field is rejected.
- Distinct mutation IDs create distinct records even for otherwise identical content.
- Mismatched mutation/document IDs are denied.

Result: **PASS in emulator only**. This validates Firestore transaction/rules behavior, not real cloud latency.

## 3. Pending And Inventory Integrity

### Root cause

A locally queued dispatch could be displayed before server acknowledgement and then enter stock, pricing or dashboard calculations as if it were confirmed. Enqueue rejection also needed to leave no displayed/reconciliation overlay.

### Resolution

- Persist the queued command before publishing the local pending row.
- Mark the row `__pendingFirebaseSync: true` and visibly label it as awaiting server confirmation; block editing its row cells while pending.
- Exclude pending dispatches from product stock balances, pricing inventory, executive profitability and the identified App-level dispatch aggregations.
- Await the shared write confirmation; on ACK, use the transaction's authoritative payload and remove the pending marker. On permanent rejection, reconcile to server truth rather than reporting success.
- Preserve the draft/identity on retry so the same intent uses the same mutation ID.

### Regression verification

- Pending dispatch leaves stock outgoing at zero; after confirmation it is counted exactly once.
- Pending dispatch does not alter the pricing inventory projection; confirmed dispatch does.
- Pending dispatch does not alter executive profitability; confirmed dispatch does.
- Rejected durable enqueue does not publish a raw row or overlay.
- Same pending intent cannot be reported as successful until the acknowledgement path confirms it.
- Intentional separate dispatches with identical goods remain separate when their mutation IDs differ.

Result: **PASS in focused regression tests**. A full UI-to-device restart/outage lifecycle remains unverified.

## Test Results

| Command/check | Result |
| --- | --- |
| `node scripts/run-dispatch-certification-emulator.mjs --probe` | PASS; 16 boundary assertions in one test runner file |
| `node scripts/run-dispatch-certification-emulator.mjs` | PASS; 14 tenant isolation scenarios |
| Focused dispatch/save/inventory/report regression command | PASS; 95 tests, 0 failures, 0 skipped |
| `npm.cmd run lint` | PASS |
| `npm.cmd run typecheck` | PASS; project script checks payroll scope only |
| `npx.cmd tsc -p tsconfig.dispatch.json` | PASS; strict typecheck for dispatch transaction helper |
| `npm.cmd run build` | PASS; 2,504 modules transformed |
| `git diff --check` | PASS; Windows line-ending normalization warnings only |

All emulator commands are bounded: Node test timeout 60 seconds; emulator runner process timeout 180 seconds. The local emulator uses demo project `demo-hd-dispatch-cert`, isolated temporary configuration/rules and ports 8187/4407/4507. Expected `PERMISSION_DENIED` log entries are from explicit negative authorization probes.

## Integrity And Safety Notes

- No production or staging cloud was contacted for writes; no company dataset or benchmark record was created.
- No deploy, push, commit, migration, Firebase config switch or backend change was performed.
- No price, unit, quantity, billing formula, inventory formula, debt, payment, tenant or authentication business rule was intentionally changed.
- The offline test JSON-serializes the pending-command representation while Firestore SDK networking is disabled, re-enables it and then commits to the emulator. It does not exercise the app's actual storage adapter in this probe, simulate airplane mode, OS process death or a full Android restart.
- Lost ACK is tested by replaying after a successful emulator commit; it does not measure a real network ACK.
- No UI E2E, physical/virtual device test, latency percentile, memory/leak profile or navigation performance benchmark was run. Therefore no claim of “instant” or lag-free performance is made.

## Changed Files

- `firestore.rules`
- `src/App.jsx`
- `src/features/warehouse/DispatchTableBody.jsx`
- `src/services/executiveDashboardService.js`
- `src/services/pricingEngineService.js`
- `src/utils/incrementalProductStock.js`
- `src/utils/productMeasures.js`
- `src/utils/warehouseDispatchCreate.js`
- `tests/warehouse-dispatch-local-save.test.mjs`
- `tests/warehouse-dispatch-command.test.mjs`
- `tests/warehouse-dispatch-boundary.probe.mjs`
- `tests/warehouse-inventory-integrity.test.mjs`
- `scripts/run-dispatch-certification-emulator.mjs`
- `tsconfig.dispatch.json`
- `docs/reports/BLOCKER_RESOLUTION_REPORT_20261005.md`
- `docs/reports/MODULE_WAREHOUSE_DISPATCH_CERTIFICATION_20261005.md`

Previously existing modified `src/App.jsx` work and untracked discovery/registry reports were preserved; they are not classified as new work in this report.

## Remaining Work

The next authorized phase is Xuất kho UI E2E and performance verification: create/edit/archive/retry/reject, navigation and restart, cross-screen stock reconciliation, representative dataset, bounded interaction/API timing, and repeated mount/unmount memory/subscription checks. Continue only after those checks; do not treat this blocker report as module certification.
