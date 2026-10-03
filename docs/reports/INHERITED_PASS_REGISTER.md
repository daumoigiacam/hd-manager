# Inherited PASS register

## Current full candidate measurement (2026-10-03)

### Dedicated price-save profiling

Current candidate v12 reuses one read-only empty closed-key Set within each
shortage calculation instead of allocating it separately for every request
with no closed keys. Nonempty keys retain independent Sets; no closure state
is shared across calculation calls. Independent frozen-algorithm tests cover
quantity edits, nonempty metadata, false keys, neighboring requests and
reopening lines. Configured regression v16: 387 cases, 386 pass, zero fail,
one opt-in skip, exit 0.

Matched dedicated v10/v12 runs each produced 25 samples, zero errors/failures.
CPU6 P50 before/after: edit-price opening 460.7/442.3 ms, price input
40.9/39.2, price save 3179.9/2994.4, create opening 428.4/371.0,
creation save 3191.5/3103.6. Price-save P95 3347.9 and creation-save P95
3352.4 remain slightly above v10; do not hide these tail regressions or
attribute the whole reduction to this change on shared CPU. Evidence/build:
`master-price-profile-v12` / `master-final-candidate-after-v12` under
`test-results/full-interaction`. This is a candidate, not full-scope acceptance;
the prior 942-sample v10 run does not certify newly changed v12 source.

Equality fast-path experiment v11 was rejected and removed from current
source. Matched dedicated v10/v11 runs each completed 25 samples with zero
errors/failures. Price-save P50 3179.9 -> 2978.0 ms, but P95 reached 3769.1;
creation-save P50 3191.5 -> 3694.7 ms and P95 4457.2. Other measured P50s
also increased. Shared CPU noise prevents attributing every delta solely to
this code, but evidence does not justify accepting it. Immutable experiment
build and all measurements remain at `master-final-candidate-after-v11` and
`master-price-profile-v11`. Experiment regression v15: 388 cases, 387 pass,
zero fail, one skip. After reverting only the experiment, focused collation
and independent request-baseline parity tests completed exit 0 in
`master-equal-collation-reverted.log`. Current source is again v10/v9 runtime,
not the rejected v11 experiment; experiment tests are not current-source
full-regression certification.

`master-price-profile-v10` reused the same immutable v10 preview build and
completed exit 0: 25 samples, zero failures/errors, including five actual
price saves. PRICE_ONLY explicitly enables the otherwise skipped price path.
CPU6 price-save P50 3179.9 ms, P95 3272.6 ms; this dedicated action sequence
is not comparable to the full-run 2281.7 ms as a source change experiment.
The first price-save source profile attributes self samples to collation
cache comparisons (479 ms), shortage variant construction (259 ms), shortage
item processing (257 ms), preview setItem (236 ms), and getClientRects
(289 ms). These are sampled profile totals, not additive wall-clock latency
components or Firebase server timings. Files: measurement directory
`test-results/full-interaction/master-price-profile-v10`, source-profiles.json,
and `test-results/master-price-profile-v10-run.log`. Full-run profiles cover
only finance/payroll/pricing opening by default, not every measured action.

`master-full-after-v5` completed with exit 0: 942 samples, 23 screens,
zero runtime errors and zero failed measurements. Immutable build:
`test-results/full-interaction/master-final-candidate-after-v10/app`.
This includes current v9 App caches and the dev watcher exclusions.
CPU profiles, action coverage, storage instrumentation, master fixtures,
dispatch stress and local receipt checks were enabled; fixed date 2026-10-02.
The separate application at localhost:5179 remained running as requested.

Compared with full candidate `master-full-after-v4`, 210 keys pair and zero
are unpaired; 72 have positive P50 deltas. Retain all positive deltas.
This is a candidate comparison, not acceptance against the pinned baseline.
CPU6 P50: request creation 3043.7 ms (P95 3246.2), price save 2281.7 ms,
dispatch local receipt 1576.5 ms, delivery opening 1520.2 ms, request opening
1290.5 ms, product creation 1063.1 ms. These isolated preview timings do not
prove physical-device responsiveness or Firebase server confirmation latency.
Full performance acceptance, production deployment and production business
verification remain open; no FULL PASS claim is supported.

Configured regression v14 completed exit 0: 387 cases, 386 pass, zero fail,
one opt-in REST case skipped. Log: `test-results/master-full-regression-v14.log`.
`git diff --check` also completed exit 0 (line-ending warnings only).

Date: 2026-10-02. Applies to Phase 0 baseline `5f162f5c`. Inherited evidence is not a new test run. Preserve working behavior; rework only with direct regression evidence and explicit scope.

| Evidence | Result that can be inherited | Boundary / protection |
|---|---|---|
| full-app-105-audit/summary.json | 697 successful timing observations, 0 page errors | 11 incomplete cases remain; not a complete business PASS |
| full-app-105-followup/summary.json | 69 successful observations, 0 page errors | 3 employee selector failures; original timeout evidence retained |
| full-app-105-employees/summary.json | 45 observations, 0 failures/errors after selector correction | Small employee fixture only; old selector failure is not app latency |
| Baseline warehouse input measurements | Quantity P50 7/18/34 ms; product input 3/14/31 ms at 1x/3x/6x | Preserve focus/input path; do not rewrite it merely because saves are slow |
| FINAL_22_MODULE_AUDIT_2026_10_02.md and final-22-acceptance artifacts | Historical 334-sample acceptance, zero failed actions/errors, limited action coverage | Earlier 1x run; newer 6x evidence supersedes any broad smoothness claim |
| src/utils/deliveryRequestIndex.js; tests/delivery-request-index.test.mjs | Source retains customer ID/name candidate index and original-position deduplication | Test compares candidates to legacy filter, including missing IDs, names, duplicates and archived rows. Keep ordering and legacy fallback |
| App.jsx:60504; earlier 22-module report | Complete customer-group render window retained | Never truncate totals, share output or reconciliation to the visible 20 groups |
| App.jsx:59868 and existing formatter/collator helpers | Shared comparator retained, rather than constructing locale helpers for each comparison | Keep numerical/Vietnamese ordering |
| App.jsx:20696; FINAL_22_MODULE_AUDIT_2026_10_02.md | Restored warehouse queue path retained; historical Emulator smoke 10/10 recorded in earlier report | No new inventory endpoint activation. Historical save timing is not current cloud timing |
| Earlier report; src/layout/SyncQueueStatus.jsx | Global floating queue overlay removal retained; queue diagnostics remain separate | Do not discard pending writes to hide errors |
| Baseline commit subject and customer-debt-repayment test files | Expense-based customer debt repayment is present in this revision | No financial changes in this phase. This audit does not independently recertify all repayment paths |

## Historical claims not transferable to this runtime

`INHERITED_PASS_REGISTER.json` belongs to the earlier Gap A/C continuation and explicitly reports overall NOT PASS. It says screen cursor integration was active in that earlier working tree. Current `src/App.jsx` has no import of `screenCursorRuntime.js`; current company queries use `companyId` without cursor or limit. Keep the JSON unchanged as historical evidence; do not use it to label current pagination PASS.

Likewise `cooperativeTaskQueue.js` is imported by `tests/warehouse-dispatch-performance.test.mjs`, not current App. The test's claim that its isolated queue pauses during input is not proof that current loyalty/backup work is routed through it. `readLifecycle.js` also has a test reference without current App integration. Some old tests reference exports absent from the restored source; their existence alone proves neither runtime use nor current PASS.

## Preservation checks required in a future phase

- Quantity and weight remain distinct; unit conversions, actual quantities and frozen billing remain unchanged.
- Shortage calculation preserves date/backlog, closed-short lines, aliases, timestamps, branch/source matching and previously exported records.
- Duplicate-submit, tenant ownership, pending/local/server receipt states and retry identity remain unchanged.
- Import plus related expense and grouped delivery writes retain their existing write plan semantics.
- No new PASS claim for delivery save, cloud synchronization, phone performance, biometrics or staging parity from this register.

No tests were rerun solely to reproduce inherited results in Phase 0. Missing current runtime evidence is recorded, not replaced by historical claims.

## Autonomous Master Continuation - 2026-10-03

Owner now authorizes all performance layers, safe test-infrastructure repairs, regression, main push and official production deployment AFTER acceptance. Historical Phase 0/1/2A evidence and existing dirty files remain preserved, not overwritten as new PASS claims. Start HEAD remains `5f162f5ce85fd4dc746382f13a6a4170e4a29775` on `codex/final-22-module-audit-20261002`.

Additional inherited tested results: Phase 1 hidden monthly-table/selection guards and product-footer action accessibility; Phase 2A exact preview JSON/recovery, clone isolation and verified identical-write suppression (14 focused checks plus browser recovery); final primary paired 210-sample runs with zero action/page errors; configured test:all/lint/payroll-scoped typecheck/build pass. Preserve these contracts. These are not full application, cloud or production PASS.

Explicit remaining failures retained: supplemental dispatch simulated-operation assertion 0 vs 1 on BOTH old/new builds; delivery source-linked test requests an absent freeform control; complete edit/reopen/stock/payment UI acceptance missing; unproven causes of historical CPU3x timing increases. Master task must investigate rather than inherit BLOCKED as a completed objective.

Safety: no production benchmark writes, destructive migrations, auth/RBAC/tenant weakening or financial/quantity formula changes; no force push or discard of prior changes. Comparisons must retain full fixtures, event boundaries and CPU1x/3x/6x. Technical changes may alter App source hashes, so historical byte-identity assertions are evidence of the old phase, not a prohibition on now-authorized refactoring; new semantic regression must replace that gate without deleting the original evidence.

Architecture reaffirmed by the owner on 2026-10-03: this task MUST retain the
Firebase business backend (`hd-manager-c5839`). The intervening request to migrate
to HD Platform has been revoked. No migration source edit, production data write
or Platform deployment occurred. Preserve the Firebase-only build gate and the
official VPS frontend hosting path; they are different architectural layers.

### Continuation Verification, Not Release Acceptance

On 2026-10-03 the current working tree completed `npm run test:all`, `npm run
lint` and payroll-scoped `npm run typecheck` with exit code 0. The included master
suite reported 258 passed, zero failed and one opt-in REST Emulator skip; real
Emulator results are a separate gate, never inferred from that skip. Evidence:
`test-results/master-full-regression.log` and
`test-results/master-regression-latest.log` (local ignored artifacts).

The inherited product FAB selector and rule remain unchanged. A separate customer
FAB bottom rule addresses a real desktop click failure where the navigation
intercepted the customer action. The Phase 2A CSS checksum now removes ONLY this
exact, separately asserted rule before checking the original frozen hash; all
other CSS bytes remain protected. Actual browser clicking must still pass.

These results precede final incremental calculation integration and paired
after-benchmarks. They do not certify the final source, cloud save latency,
production deployment or production smoke tests.

### Final Candidate Verification Update

The later `master-full-regression-final-candidate.log` completed the configured
full test chain with exit 0: its master group has 321 passes, zero failures and
one opt-in Emulator skip (322 tests). Lint and payroll-scoped typecheck passed
again. The separate completed actual REST Emulator run had four passes, including
fixed-snapshot cursor traversal and denied foreign/unscoped tenant reads. These
are independent checks, not production Auth or SDK-offline certification.

Focused product BEFORE v5 and AFTER v1 both completed 180 timing samples and
all exact save/reopen/reload guards without page errors. Their complete paired
comparison records every positive delta, including slower CPU3x modal openings;
those require investigation rather than an "expected" label. No failed partial
fixture coverage is silently merged into this pair.

Dedicated history BEFORE v2 and AFTER v1 both completed 123 timing samples with
zero failed guards/page errors. All 15 aggregate pairs improved, while actual
stock results, reset cutoffs, archive handling and measurement units retained
independent frozen/Git parity. This does not measure unavailable monthly-report
controls or certify physical Android smoothness.

Current REST pages bound response size and maintain one consistent snapshot.
They still collect complete authoritative financial/inventory histories: do not
describe that as on-demand screen pagination or reduced total billable reads.
No production deployment or final acceptance has yet been recorded here.

### Billing Normalization Cache Invariant

Before the next hot-path edit, retain the existing customer-product billing
contracts: configuration variant selection, allowed/actual units, quantity and
weight conversion, immutable billing snapshots, line grouping and all financial
amounts must remain exact. Only raw-string normalization may be cached, bounded
to 512 entries of at most 256 characters. Coercion must occur on every call,
including mutable objects and thrown errors. No tenant record, price or result
snapshot is stored in this cache; Firebase remains the business backend.

### Editable Request Row Cache Invariant

The next request-view change must preserve every editable row, ordering, branch,
billing snapshot, deposit, employee assignment and customer-portal approval.
Only immutable per-request base rows may be reused; warehouse status/date/IDs
must come from the current status maps on every rebuild. Customer/product,
employee/permission and tenant changes invalidate the base cache. Neither the
visible request filter nor a cached base row may authorize new records.

### v2 Verification, 2026-10-03

`master-full-regression-v2-r3.log` completed the full configured test chain with
exit 0. Its master group contains 370 tests: 369 passes, zero failures, one opt-in
REST Emulator skip. The separate actual REST execution
`master-rest-emulator-v2.log` has four passes and no skips. Lint, additional
harness/helper lint and payroll-scoped typecheck completed with exit 0.

`master-emulator-session-regression-v2-r14.log` records 22 passing local real
Firebase cases, including server-issued Identity/Auth roles, tenant Rules,
employee/customer UI sessions for both tenants, actual product/customer creation,
legacy dispatch save and reload, SDK offline restoration and observable App
maintenance parking/resumption. No production account or response mock is used.
Mobile create-button and relative-picker harness repairs are recorded separately
from App changes. Offline WebChannel connectivity images are blocked, never
given fabricated responses, and remain separate from fail-closed business URLs.

Before immutable v2 build:

- App SHA256: `3F401F0B032E45739DF762D799A634FFDAC892C9360444EB439BF393B7F49BDE`
- Foundation CSS: `2A1C1904D9E3E22013E1973AE079D3A1ADFDD99FF0169C78B1EDF29BEBAE9862`
- Audit script: `A80265F08DC244AB4F6AD51ADC081A747B49C85094811639DBF4EA90FA017D56`
- Action cases: `EA6B01D8A7D1D7829B267D28EAC3D40094201E60868EFC336A9C1AC18F72FAA9`

The product AFTER v2 run builds a new `master-final-candidate-after-v2/app` and
does not replace either BEFORE or v1. Actual desktop/tablet customer pagination
and final paired v2 measurements remain required before release acceptance.

### v4 Verification, 2026-10-03

The billing normalization-only edit preserves every other module declaration
against pinned Git source, allowing only line-ending differences. The focused
billing/pricing suite has 13 passes, covering coercion, Unicode, bounds/eviction,
unchanged public variant/amount/snapshot/grouping results and normalization work
counts. Final configured v8 regression exits 0 (380 of 381 master cases passed,
zero failures, one explicit opt-in REST skip covered by prior actual Emulator
execution); official and supplemental lint pass.

The targeted v4 preview control completes 261 samples and 57 matching baseline
pairs, no page/action errors and four positive P50 deltas retained in the
protocol. The inherited 942-sample all-screen run predates this edit. Cloud v4
build/bundle verification passes for Firebase `hd-manager-c5839`, 19 inspected
files and zero Platform runtime markers. Full new all-screen, release and
authenticated production gates remain open; no FULL PASS is asserted.

### v5 Verification, 2026-10-03

The editable request base-row cache is covered by 16 independent frozen-source
parity cases, including immutable request edits, reordering, live warehouse
status/date/IDs, permission revocation and tenant changes. The configured v9
regression exits 0: 383 of 384 master cases pass, zero failures and the same
explicit opt-in REST skip. Current official lint passes.

The new all-screen run `master-full-after-v4` uses immutable candidate v5,
completes 942 samples across 23 screens with zero page errors or failed actions.
It is not Firebase server-ACK evidence. Candidate v3 versus v5 has 210 matched
action keys, zero unpaired keys and 110 positive P50 deltas; all are retained in
`master-comparison.json`. This is a candidate comparison, not the pinned baseline
acceptance gate. Shared CPU contention remains possible because the separately
owned localhost:5179 app must stay running, per the user's instruction.

Cloud v5 build completes and post-build verification passes: build ID
`2026.8.1-rc1-1791012192963`, Firebase-only `hd-manager-c5839`, 19 inspected files,
zero Platform runtime markers. The earlier v5 verifier ran before build process
completion and is not used as final evidence; `master-production-bundle-v5-final.log`
is the authoritative post-build check. No release or production PASS is asserted.

### v6 Collation Eviction Experiment Rejected, 2026-10-03

The experiment changed only cache eviction: overflow removed the oldest pair,
not the entire cache. A circular FIFO retains at most the existing configured
pair capacity (2048 by default); the caller's collator, string bound, coercion
bypass and returned comparison values remain unchanged. The cache remains
private to its caller's tenant/lifetime, not a data-record cache.

Focused collation and actual request-projection parity: 21 passes. Configured
v10 regression exits 0: 384 of 385 master cases pass, zero failures, one explicit
opt-in REST skip. Lint passes. Matching CPU6 diagnostic completes 15 samples,
three exact paired keys and no failures/errors. All three P50s increase: open
+697.3 ms, save-create +660.0 ms, open-create +104.2 ms. Shared CPU prevents a
source-causal conclusion, but no end-to-end benefit is established. The FIFO
runtime edit and its experiment-only test are removed; current runtime is v5.
The immutable v6 bundle, profiles, regression and comparison remain preserved.

### v7 Editable Context Candidate, 2026-10-03

Editable base-row cache now receives the actual associated customer, sales ID
and resolved employee name as per-record context. Catalog and tenant changes
still invalidate the cache lifetime. Customer/employee lookup or permission
changes still invalidate the outer projection; approval permission is evaluated
live outside the static base cache, alongside existing live warehouse status.

Seventeen independent frozen-source request parity tests pass. The added
60-request operation-count case proves an unrelated customer insertion performs
zero base recalculations, one associated customer edit performs one, and owner/
canEdit grant/revocation does not reuse stale permission. Official lint passes.
The full configured v11 regression exits 0: 384 of 385 master cases pass,
zero failures and one explicit opt-in REST skip. Candidate v5/v6 timings
predate this edit and must not certify its performance or production readiness.

Matched v7 diagnostic completes 15 samples without errors and matches three
v5 keys. All P50 deltas are retained: open +7.0 ms (render -30.2 ms), open-create
+47.3 ms and save-create +617.9 ms (3196.8 to 3814.7 ms). The operation-count
improvement is proven; end-to-end save improvement is NOT established. v7 is
an unaccepted candidate pending further controlled investigation, not a release.

### v8 Shortage Alias Candidate, 2026-10-03

Shortage calculation caches only generated alias-key variants for exact tuples
of five short primitive strings, within each call and bounded to 2048 tuples.
JSON array keys preserve delimiter distinctions. Both cached storage and hits
use shallow copies; the original fresh-array behavior is retained. Coercible
objects and long strings bypass caching. Quantity, timing, archive, linkage and
dispatch-status calculations still run unchanged.

Independent pinned-source parity retains all 4500 alias lines and fields after
customer/quantity/dispatch edits; both normalization and variant cache bounds
are observed. A 300-request repeated-alias case proves over 500 fewer Set
constructions and exact unchanged outputs, including a later quantity change.
Official lint and configured v12 regression exit 0. Current runtime includes
v7 contexts and v8 aliases; all earlier full timings predate these edits.
Matched CPU6 `master-save-profile-v8` is in progress, not a release gate PASS.

The v8 diagnostic subsequently completes 15 samples, zero errors, three matched
v7 keys. Save-create P50 increases from 3814.7 to 8539.1 ms, P95 9841.6 ms;
open increases 223.4 ms and open-create 78.4 ms. These are retained, not removed
as outliers or certified as improvements. Its first-save stack includes 551 ms
self time in the audit's wrapped JSON function. The JSON-tuple implementation
is not accepted; subsequent v9 uses nested primitive-key Maps instead, with the
same 2048 total-leaf bound and fresh-array behavior. Thirty-six focused parity/
bounds/work-count cases and official lint pass. Current source v9 is still an
unaccepted candidate: no current-source full benchmark or deployment is implied.

Configured v13 regression for current v9 exits 0: 385 of 386 master cases pass,
zero failures and one explicit opt-in REST skip. This does not replace the
required current-source timing, real Firebase persistence or production gates.

Matched v9 CPU6 diagnostic completes 15 samples, zero action/page errors,
three paired v7 keys. Save-create P50 3814.7 to 3061.8 ms (-19.7%), P95 4251.5
to 3329.4 ms, render P50 2596.4 to 1930.5 ms. Open P50 improves 25.8 ms, while
open-create increases 21.1 ms and retains a 2411.9 ms P95. All deltas remain.
Source profiles match immutable v9 source maps; shortage item traversal self
time is 277 ms versus v7's 711 ms, not a wall-clock partition or server ACK.
Cloud v9 build and post-build verification pass: Firebase-only c5839, 19 files,
zero Platform markers, build ID `2026.8.1-rc1-1791014046407`. Full-scope current
source and authenticated production gates remain open; no release dispatched.

### Current v9 Real Emulator Sessions, 2026-10-03

`master-emulator-session-v9.log` records exit 0 and 22 PASS cases on actual local
Firebase Auth, Functions and Firestore with the current source, no API response
mocks or injected identity claims. Covers two tenants, owner/employee/customer
login and reload, server claims, foreign-tenant read/write rejection, SDK offline
resume and user-scoped logout isolation, product/customer UI create/save and
server-confirmed reload, legacy dispatch quantity/two weights/save/reload, and
legacy maintenance parking/idle resume/tenant gates. Production was not contacted.

Limitations remain explicit: selected CRUD is not all-module CRUD or order-price
save coverage; emulator Node 25 differs from official Node 22; scheduled Pub/Sub
functions are not running; independent queue/loyalty/backup tests are not these
real session cases. The runner writes `master-emulator-session-regression/result.json`;
the separately retained v9 log identifies this execution. Own emulator and Vite
servers were stopped after terminal test completion, and all five test endpoints
were verified nonresponsive. The user's separate app on 5179 was not stopped.

During that actual dev-session run, Vite reported a page reload caused by
`.gradle-home/wrapper/dists/.../docs/kotlin-dsl/gradle/org.gradle.api.artifacts/index.html`.
The current watcher excludes `.gradle-home`, `.gradle` and `test-results` in
addition to its inherited output exclusions; app source remains watched.
The focused actual configuration test and supplemental ESLint pass. This is
a dev-server interruption fix only, not evidence of faster production saves.
