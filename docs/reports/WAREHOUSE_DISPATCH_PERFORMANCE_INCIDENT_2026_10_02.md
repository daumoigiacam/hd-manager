# Warehouse Dispatch Performance Incident

Date: 2026-10-02

## Result

Local mitigations are implemented and regression-tested. **Physical-device and production incident acceptance: NOT PASS / not verified.** The public application has not been updated in this investigation. No production records were written, no functions/rules were deployed, and no release gate was bypassed.

## Identified Work Competing With Input

1. The automatic loyalty effect previously launched calculations and writes for many customers together. Its callback depended on the point collection it updated. Timestamp-only differences could produce more writes without a business change.
2. Customer honorific normalization previously submitted all inferred customer patches concurrently.
3. Warm realtime subscriptions could remain active after navigating from another workspace to warehouse dispatch.
4. Picker search repeatedly normalized customer/product fields. Request-product collection repeatedly searched the full product array.
5. Shortage reconciliation repeatedly constructed normalized historical aliases. Saving a dispatch changes its input collection and runs full reconciliation again.
6. Daily automatic backup starts after 45 seconds on web or 5 minutes in the native shell. It reads the backup collections concurrently and serializes the results. There was no warehouse/input-focus guard. This can compete with employee entry after startup; the trigger itself was not included in the short interaction timing samples.

These are code/profiling findings, not proof that any one task caused the specific employee's morning incident. Their device, application build, network, and authenticated session trace have not been obtained.

## Local Changes

- Keyed cooperative maintenance queue: latest work per customer, one asynchronous job at a time, a 250 ms yield between jobs, cleanup on logout/tenant change.
- Loyalty maintenance waits for complete server-confirmed inputs and pauses in warehouse dispatch, hidden pages, or focused text inputs. Direct business-event synchronization remains separate.
- Unchanged loyalty business fields no longer produce timestamp-only writes. Points, eligible orders, settings, pending reward day/value, and other business differences still trigger updates.
- Honorific migration uses the same cooperative scheduling and pauses during dispatch entry.
- Automatic backup no longer starts in dispatch. Pending startup work is cancelled on navigation and rescheduled after leaving; focused text entry, offline state and hidden pages delay the job. Manual backup remains unchanged. A backup already in flight can finish; its existing read/serialization architecture still needs separate bounded-data review.
- Dispatch workspace drops unrelated warm listeners while retaining required sources and baseline subscriptions.
- Customer/product picker search reuses a normalized index. Product lookup during request collection uses a Map.
- Picker initially renders 50 results with load-more. Search still considers the complete available lookup set.
- A bounded historical label/alias cache reuses deterministic strings only. Quantities, dates, closed-short flags, archive flags, and dispatch coverage are never cached as results.
- Dispatch duplicate detection checks tenant/archive, command identity and its existing time window before normalizing older historical records.
- Inventory transport distinguishes missing endpoint, network failure and confirmation timeout. HTTP inventory commands are not mislabeled as queued Firestore writes.

No calculation rules were changed. Shortage reconciliation still reads complete authoritative dispatch/request inputs, not the visible cursor page. This preserves existing reconciliation behavior; it does not certify that all inherited business rules are complete.

## Measured Evidence

Runner: `scripts/audit-interactions.mjs`, isolated Playwright preview, React production profiling build, desktop Chrome with a mobile viewport and CPU throttling. Fixture: 360 customers, 600 products, 1,800 orders, 900 payments, 4,500 order requests, 4,300 dispatches.

Baseline: `test-results/full-interaction/dispatch-lag-before/summary.json`.

After: `test-results/full-interaction/dispatch-lag-release-candidate/summary.json`, 78 interaction samples, zero runner failures and zero collected browser errors. This run includes the final backup scheduling and inventory error refinements.

| Action / CPU | Before p50 ms | After p50 ms | After p95 ms |
|---|---:|---:|---:|
| Open / 6x slowdown | 1152.1 | 914.9 | 1008.4 |
| Search customer / 6x | 199.5 | 147.2 | 154.9 |
| Input quantity / 6x | 61.8 | 54.8 | 59.4 |
| Open / 3x | 470.8 | 388.6 | 523.4 |
| Search customer / 3x | 82.6 | 50.7 | 87.5 |
| Open / desktop 1x | 108.1 | 94.0 | 130.7 |
| Search customer / desktop 1x | 17.4 | 12.6 | 16.4 |
| Input quantity / desktop 1x | 7.2 | 8.1 | 8.6 |

Five samples per open/search/quantity action are insufficient for a broad device SLA. Quantity-input improvement is not significant. The weak-CPU run still has long interactions and is **not a zero-lag pass**.

The save test intercepted only the inventory command with a simulated 120 ms acknowledgement. Three distinct dispatch saves per CPU tier, each double-clicked, produced exactly one command per intended save with the expected customer and stock movement. Save p50: 1163.7 ms (6x), 502.8 ms (3x), 221.8 ms (1x). These are UI-plus-simulated-network timings, not real Firestore/Cloud Functions latency.

The timing fixture does not enable loyalty maintenance. Queue pause/coalescing, unchanged point writes and application wiring are separate regression tests; this audit does not quantify production loyalty write savings.

## Cloud / Public Build Check

The local Firebase project configuration is `hd-manager-c5839`. A read-only OPTIONS request to `https://us-central1-hd-manager-c5839.cloudfunctions.net/inventoryAtomicOperation` returned HTTP 404. Read-only Firebase deployed-function metadata also contained no function with that name in any listed region.

The public entry asset was `assets/index-CEJ7idp6.js` during inspection. It did not contain the local `inventoryAtomicOperation` caller. Consequently, the missing endpoint blocks the current local transaction path, but it is **not established as the cause of the morning production incident**.

Do not deploy the new frontend transaction caller alone, and do not restore direct client stock writes as a fallback. Server deployment, initialization/backfill/reconciliation and staging parity must be accepted together before releasing this architecture.

## Regression Coverage

- Full `npm run test:all`: PASS.
- `npm run lint`, targeted lint for new files, and `npm run typecheck`: PASS.
- `npm run build`: PASS.
- New maintenance tests: pause, coalescing, serial in-flight work, disposal, error continuation.
- Search tests: exact ordering parity, accents, phone, initials and reused index.
- Shortage cache tests: new dispatches, archived dispatches, changed quantities, closed-short lines, renamed lookups, cold/warm result parity and bounded caches with 4,500 distinct aliases.
- Inventory error tests: 404, network, timeout, business rejection, same-key retry and no false offline-queue claim.
- Preview Firestore mock now respects tenant filters, document cursors and limited query listeners. This is test-runtime support, not a production SDK change.

## Remaining Acceptance Work

1. Capture the affected employee's platform/build and whether the stall happens while typing/selecting or after Save; reproduce without creating duplicate real stock movements.
2. Validate on an actual affected phone/APK with enabled loyalty and real authenticated realtime updates.
3. Complete staging parity and deploy/verify the atomic inventory endpoint with initialized balances and reconciliation evidence before production frontend release.
4. Full client-side historical reconciliation still makes weak-CPU opens/saves expensive. A correct bounded server read model remains necessary; truncating history would trade speed for incorrect data.
5. Required realtime subscriptions, finite pending-business-write retries and financial reconciliation remain active. This investigation does not claim that every background task has been disabled or that an already-started backup can be interrupted safely.

Production: NOT UPDATED. Phase 5: NOT STARTED.
