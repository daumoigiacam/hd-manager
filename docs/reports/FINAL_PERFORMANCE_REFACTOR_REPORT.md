# HD Manager Performance Refactor

## Executive Summary

Working report, 2026-10-03. Final release acceptance has not yet been issued.
The preserved Phase 0/1/2A work and the subsequent bounded caches, incremental
calculations, listener decoding and background scheduling have passed the current
configured full functional suite. Actual local Firebase Identity/Auth/Rules and
selected UI persistence checks have passed independently. Final all-module v2
timings and cloud build are recorded below; official deployment and production
acceptance are still pending. The v3 collation control and all-module run are
complete; the larger positive deltas need same-chain baseline verification.

The owner's latest architecture decision, 2026-10-03, is authoritative: keep
HD Manager business data, authentication and backend on Firebase
`hd-manager-c5839` for this task. The briefly requested Platform migration was
stopped before any migration edit, data write or deployment. VPS remains the
frontend hosting target, not a replacement business backend. Do not enable
Platform adapters or deploy a Platform build in this performance release.

This report never equates preview local persistence with Firebase server ACK,
Emulator authentication with production authentication, or response-size paging
with reduced total financial-history reads.

## Baseline

Pinned Git baseline: `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.
The immutable performance BEFORE is
`test-results/full-interaction/phase2a-final-after/app`, not a rebuild of current
source. Candidate v1 remains immutable. Candidate v2 is separately built at
`test-results/full-interaction/master-final-candidate-after-v2/app`.
Harness changes, fixture counts, failed attempts and measurement contracts are
recorded in `MASTER_PERFORMANCE_MEASUREMENT_PROTOCOL.md`.

## Phase 0

The original audit is retained in `PERFORMANCE_REFACTOR_PHASE0.md`; it was not
replaced or repeated as new implementation evidence. The inherited pass register
tracks the baseline, protected CSS, correctness comparisons and later checks.

## Phase 1

Preserved hidden-report computation guards and render work. Immutable published
collection records retain identity when unchanged; incremental snapshot decoding
reads only changed document data after the first snapshot, and zero document
data on metadata-only updates. Duplicate/ambiguous IDs retain conservative
fallback behavior. These CPU operation counts are not billable-read evidence.

## Phase 2A - Storage

Preserved preview dirty-collection persistence, write coalescing and serializer
work. Changes in `src/mocks` are isolated preview functionality; production uses
the real Firebase transport. Crash recovery, reload and namespace isolation are
covered in the Phase 2A suite. Large exports still have a final JSON serialization;
chunked reads alone are not a claim that all export CPU work moved to a worker.

## Phase 2B - Pagination

The production REST collector uses bounded 200-document responses, stable cursor
traversal and one pinned snapshot time. Timeout, abort, revision and tenant gates
prevent partial or stale pages replacing authoritative arrays. Actual Emulator
tests retain 201 records during concurrent insert/update/delete and reject
foreign-tenant access. SDK snapshot decoding is incremental independently.

Core App inventory/debt/reconciliation consumers still require full authoritative
histories. The dependency map explains why truncating shared arrays to the visible
page would change results. Existing bounded chat queries remain intact. The
unused interactive `pricingChangeLogs` listener/binding was removed, while full
backup/reset registry coverage remains. This is not an on-demand screen cursor
implementation and does not certify a reduction in total billable history reads.
See `MASTER_PAGINATION_READ_SCOPE.md` for the exact consumer scope.

## Phase 2C - Search

Prepared postings/prefix/numeric indexes preserve accents, names, codes, phone
numbers, initials and original ranking. Leading/trailing debounce applies only
to the three prepared picker/product callers; other callers retain their prior
behavior. Primitive text memoization is exact, bounded to 2048 short strings,
and retains original coercion/errors for nonprimitive inputs.

## Phase 2D - Calculation

First-record maps preserve duplicate and NaN lookup behavior. Immutable-record
calculation reuse preserves actual Git-baseline results and invalidates by exact
inputs/context. Only explicit-zone ISO timestamps are cached; local/timezone-
dependent and object/date conversion branches retain original behavior.

## Phase 2E - Inventory

Indexed stock calculations avoid catalog-by-history rescans. Mutable-input mode
still detects in-place changes; the App explicitly uses immutable published
records. Float accumulation order, archived/reset cutoffs, warehouses, units,
orphans and bounded cache lifetime are tested against independent source.
Historical movements reuse measures across date changes. Dedicated history v2
has 123 passing timing samples and 15 improving pairs, with no positive deltas.
Unavailable monthly-report UI controls are not certified by that history run.

## Phase 2F - Order Requests

Visible-request, sheet-row and history-row derivations are reused per immutable
record and exact customer/catalog/tenant context. Grouping and sorting remain
outside the row caches, and mutable grouping works on clones. Raw fields,
branch fallback, invalid/nonempty date strings, absent dates, billing and units
match independent pinned Git/frozen source. Editable current-day rows and CRUD
handlers are not rewritten to improve the benchmark.

Candidate v3 further reuses exact ordered-pair Vietnamese collation results,
bounded to 2048 short pairs per component/tenant lifetime. No sort key or business
result changes; four additional tests and the independent request parity suite
pass. Its latency results must be established separately before release.

## Phase 2G - Dispatch

Shortage label/variant preparation and customer/product lookup work are bounded
and reused without caching quantities or dispatch state. Unrelated maintenance
jobs park during active warehouse entry. The current restored App uses legacy
direct Firestore SDK dispatch persistence, not the unexported modern atomic API.
Actual UI selection, two pieces, two weights totaling 3.75 kg, 10,000/kg pricing,
37,500 total, server confirmation, cleared draft and reload were verified locally.

## Phase 2H - Delivery Reports

Per-record report/pricing derivation and first-record lookups preserve source
resolution, compatibility branches, units and billing. Pricing normalization
has a separate bounded exact primitive cache. Numerical comparisons use actual
App source and an independent baseline, not a rewritten oracle with new math.

Candidate v4 additionally caches only raw billing normalization strings with
512 entries / 256-character eligibility. Input coercion remains live, including
errors; no prices, tenant records or billing snapshots are cached. All other
billing declarations match pinned Git source after line-ending normalization.
Five focused cases prove exact results, variant/snapshot/grouping parity,
eviction and reduced repeated normalization work. The combined billing/pricing
parity suite has 13 passes. Full configured v7 regression passed with 378 of 379
master cases, no failures and one explicitly opt-in REST skip. That run preceded
the two final test-only assertions. The final `master-full-regression-v8.log`
completed the full configured chain with 380 of 381 master cases passing,
zero failed and the same explicit opt-in skip. Final lint v7 also exited 0.

The v4 six-module preview follow-up completed 261 samples with zero failed
actions/page errors. Its 57 exact pairs against unchanged baseline control v9
include four positive P50 deltas, all retained. CPU6x request create-save is
9970.8 -> 3454.6 ms; request open 2195.2 -> 1519.8 ms and delivery open
2756.7 -> 1487.7 ms. CPU3x finance expense-save increases 167.5 ms despite
lower render P50, so universal speedup/no-regression acceptance is not claimed.
The correct v4 source profiles still show request mapping/collation and delivery
processing costs. The prior all-screen v3 run does not certify the newly edited
v4 source; final all-screen and release/production gates remain open. The v4
cloud build and Firebase-only bundle check have now passed separately, with 19
files inspected, project `hd-manager-c5839`, cloud mode and zero Platform runtime
markers (`master-production-build-v4.log`, `master-production-bundle-v4.log`).
The workflow additionally lints both billing/pricing helpers; its safety suite
and static checker reran with 22 passes. This is not deployment evidence.

## Phase 3 - Background

Compatibility maintenance is one-inflight, chunked, input/visibility/offline-
aware and cancelled on tenant/logout changes. Eligible original-tenant work is
re-admitted rather than silently lost. Loyalty retries back off and respect
revision/tenant/readiness; backup reads are chunked, sequential and input-aware.
Actual Emulator App maintenance parking/resumption and independent extracted
scheduler tests cover distinct scopes; neither certifies every offline App save
replay or production background delivery.

## Cleanup

Only the proven unused `buildLineKey` wrapper and unused interactive pricing-log
read were removed. Unverified legacy engines/routes remain. No file was deleted,
and no Functions business source, Rules, index, stock formula, debt formula or
payment rule was changed. Functions dependency configuration/lock was updated
for security fixes, separately from business code. The dead-code register retains
unresolved candidates.

## Full Regression

`master-full-regression-v2-r3.log`: full configured test chain exit 0. Master
group: 370 tests, 369 passes, zero failures, one opt-in REST Emulator skip.
`master-rest-emulator-v2.log`: separate actual execution, four passes, no skips.
`master-emulator-session-regression-v2-r14.log`: 22 actual local Firebase cases.
`master-auth-regression-security-v3-r2.log`: 22 cases passed again with final
Functions dependency versions. Full configured tests also passed in
`master-full-regression-security-v3.log` before the narrow v3 collation addition.
Lint, additional harness/helper lint and payroll-scoped typecheck exit 0.
The scoped typecheck is not whole-App TypeScript coverage.

Harness failures are preserved: role-specific footer navigation, mobile
contextual create controls and relative picker locator errors were repaired in
test infrastructure, not by widening App permissions. WebChannel connectivity
images after deliberate offline simulation are aborted, never mocked; all other
foreign browser endpoints remain failures. No credentials/tokens/storage dumps
are included in regression evidence.

## Performance Before/After

Dedicated products BEFORE v5 / AFTER v2: 180 samples each, 42 exact pairs,
no failures/errors or unpaired actions. All six positive deltas are retained.
The additional controlled BEFORE v6 / AFTER v3 repeats use the same immutable
builds and fixture/measurement contracts, with 180 samples each and 42 pairs.
Their nine positive deltas are retained, not relabeled expected or removed.
Both v2 and v3 product runs use the same immutable candidate v2 source.

Dedicated history BEFORE v2 / AFTER v2: 123 samples each, 15 pairs, all improved.
General AFTER v1 was diagnostic only: 933 samples, one normal desktop customer
pagination click intercepted by FAB/footer. v2 corrects customer-only clearance.
General v2 completed with 942 samples, no failures/errors, including the same
normal customer pager clicks. No force click bypass is used. The historical
general pair has 147 exact-size pairs; supplemental actions not present in the
old run remain unpaired. Controlled BEFORE v7 / AFTER v4 completed with 234
samples each, 48 exact pairs, no unpaired actions and no failures/errors. CPU3x
requests open changed 1394.5 to 841.4 ms, create-save 4887.4 to 2331.5 ms,
expense-save 536.1 to 373.1 ms and quote apply 1204.5 to 530.3 ms. Large historical
CPU3x increases did not reproduce with identical action order. All nine remaining
small positive deltas (0.1-7.9 ms) are retained; this is not a blanket no-regression
claim. v3 is measured in its own subsequent controlled run.

General CPU6x P50 milliseconds (historical paired observations):

| Action | BEFORE | Candidate v2 |
| --- | ---: | ---: |
| Requests open | 2037.6 | 1380.7 |
| Request create-save | 12623.5 | 3463.6 |
| Request price-save | 8402.2 | 3666.4 |
| Dispatch open | 1156.5 | 851.1 |
| Inventory open | 754.8 | 476.2 |
| Delivery reports open | 2784.0 | 1414.8 |

This is substantial improvement, not proof that large request saves are instant.

The final same-chain v3 control completed 234 samples, zero failures/errors and
48 exact pairs. CPU6x request open is 2635.2 -> 1513.6 ms and create-save is
12233.5 -> 4522.8 ms; CPU3x open is 1394.5 -> 833.2 ms and create-save is
4887.4 -> 2348.6 ms. Actual-source 4500-request ordering remains exact and uses
less than half the direct collation calls. The v3 cache improves CPU6x open/save
versus v2 but does not improve every metric. Three baseline positive P50 deltas
remain (+31.5/+15.2/+0.9 ms); overlapping sample ranges and unchanged request
modal render P50 do not establish their cause. Signed measurements remain in
the protocol and local comparison artifacts. No blanket zero-regression claim.
Dispatch CPU1x consecutive-query readiness P50 is 130.7/131.4 ms versus
12.0/12.9 ms before; render P50 is lower at 0.8/1.0 versus 4.6/5.5 ms. The real
bounded debounce wait is retained and evaluated separately from input paint.

All CPU1x/3x/6x measurements are synthetic browser throttling, not physical
Android latency. Selected profile runs do not measure every real network ACK.

## Files Changed

The release diff includes preserved Phase 1/2A work plus App calculation/search/
listener/background changes, bounded utility/services, customer-only CSS
clearance, regression/benchmark infrastructure and reports. Exact release file
inventory will be recorded with the reviewed Git diff before commit.

## Files Removed

None.

## Tests

Evidence paths above are ignored local artifacts. Tracked regression tests,
measurement protocol and independent baseline checks reproduce the contracts.
Official payroll, tenant and password-recovery Firestore Rules checks passed.
The initial Windows Unicode-path Java failure was corrected by copying the same
Rules to an ASCII temporary runtime, not by changing authorization rules.
Root and Functions production audits now report zero vulnerabilities. Functions
uses busboy 3.2.2 and an explicit qs 6.16.0 override; business source is unchanged.

Official architecture, big-stress and KPI commands completed. The architecture
report still contains failing theoretical scalability projections; KPI results
remain WARNING without optional real-device evidence. These commands' successful
exit codes must not be presented as measured production load or device PASS.

## Build

Candidate v2 App SHA256:
`3F401F0B032E45739DF762D799A634FFDAC892C9360444EB439BF393B7F49BDE`.
Candidate v3 App SHA256:
`A92D4A482DF78557C959DE76838561A40CAAB6599CB0A02A3660A84AF01BF8A8`.
Audit-script SHA256:
`A80265F08DC244AB4F6AD51ADC081A747B49C85094811639DBF4EA90FA017D56`.
Action-case SHA256:
`EA6B01D8A7D1D7829B267D28EAC3D40094201E60868EFC336A9C1AC18F72FAA9`.
Production cloud build and Firebase-only bundle verification passed for cloud
mode, project `hd-manager-c5839`, app `hd-manager-production`. The verified bundle
contains zero HD Platform runtime markers. This was before v3; the final source
must be built and verified again before release.

Final v3 cloud build and Firebase-only bundle check now also passed, with 19
files inspected and zero Platform runtime markers. Full configured regression
reran successfully in `master-full-regression-v4.log`: 374 of 375 master cases
passed, zero failed, one explicit opt-in REST Emulator skip (covered separately
by the real Emulator suite). Final lint, supplemental lint and payroll-scoped
typecheck passed. Full configured regression and lint passed again in
`master-full-regression-v6.log` and `master-final-lint-v6.log` after the static
checker fix: 375 of 376 master cases passed, zero failed, one explicit opt-in
REST skip covered by the separate real Emulator execution. Release and
production validation are not implied by these results.

The final all-module v3 run completed 942 samples across 23 screens, zero failed
actions and zero page errors. Its descriptive comparison with candidate v2 has
210 exact-size pairs and 124 positive P50 deltas. CPU6x request create-save is
3463.6 -> 5295.6 ms and delivery open is 1414.8 -> 1862.6 ms. These are not
accepted regressions or proof that the narrow collation cache caused them.
An unrelated Vite server on port 5179 was found consuming 10.72 CPU seconds in
five wall seconds; its process predates this run. That observation is not a
continuous load record or a causal explanation of every timing difference.
The owner explicitly requested that server remain running. Fresh targeted
same-chain BEFORE v9 / AFTER v6 runs preserved it and the full fixture, completed
261 samples each with no failures/errors, and yielded 57 matched pairs, zero
unpaired actions and 16 positive P50 deltas. CPU6x request create-save improved
9970.8 -> 3875.4 ms; request open 2195.2 -> 1270.9 ms; delivery open
2756.7 -> 1365.1 ms. These remain slow and are local preview results, not server
acknowledgements. CPU3x request-open P50 increased 263.8 ms and finance expense
save increased 199.2 ms; CPU6x finance open-edit increased 96.9 ms. All signed
results are retained; no zero-regression claim is made. Correct v3 source maps
were used for the fresh AFTER profiles. No other application's process was
stopped or code/data edited.

An additional full BEFORE v8 attempt was interrupted after an agent-caused
large-JSON inspection contaminated its timing window. Partial logs/profiles are
retained; it has no final samples/summary JSON and is not acceptance evidence.
The fresh targeted repeat did not overlap our builds, suites or large JSON
inspections, but cannot eliminate the external shared-host limitation.

## Deployment

Not yet performed for this refactor. Only the repository's official main-push
workflow is authorized; no alternate hosting path or destructive migration.
The workflow now runs the bounded production static checker after the existing
served index/build-ID check and uploads its JSON evidence even on failure. This
verifies direct first-party JS/CSS availability and MIME types, not authenticated
business operations, dynamic imports or production latency.
Read-only preflight of the current production baseline initially caught a checker
bug: canonical Vite `./assets/` references were rejected as traversal. The fix
allows only that exact leading segment and still rejects embedded traversal,
encoding, credentials and query strings. The focused checker/workflow suite has
22 passes. Actual static preflight then passed for the unchanged baseline SHA
with five JS/CSS assets and 4,093,154 total bytes, recorded in
`smoke-1791007017318-16956.json`. This is not deployment or authenticated smoke
evidence for the unpushed refactor.

## Production Smoke Test

Current v9 is rechecked through actual local Firebase Emulator sessions: 22 cases
pass (two-tenant server-issued identity/RBAC/isolation, product/customer UI
create/save/reload, legacy dispatch save and server-confirmed reload, offline
SDK/session and legacy maintenance lifecycle). Evidence:
`test-results/master-emulator-session-v9.log`. No API mocks or injected claims,
and no production records touched. This is selected local business evidence,
not all-module real CRUD, scheduled jobs, physical devices or production smoke.

Not yet certified. Static served SHA/assets and authenticated business/persistence
checks are separate gates. Production benchmark writes are prohibited. Actual
authenticated production coverage requires a suitable authorized human session;
local Emulator evidence must not be substituted for this gate.

## Git Commit

No refactor release commit yet. Inherited work remains preserved.

## GitHub Main

No refactor push yet. Only non-force `HEAD:main` after regression/review.

## Production URL

`https://app.hdconnect.net`

## Remaining Limitations

Current working source is the unaccepted v9 candidate (v7 editable contexts plus
per-call bounded nested-Map alias variants). It passes 36 focused parity/bounds/
work-count cases and lint. JSON-key predecessor v8 is not accepted: its matched
diagnostic save-create P50 is 8539.1 ms, all three P50 deltas increase and the
audit JSON wrapper participates in its sampled CPU stack. Current v9 diagnostic
completes 15 matched CPU6 samples without errors: save-create P50 improves from
3814.7 to 3061.8 ms (-19.7%), P95 3329.4 ms. Open-create P50 increases 21.1 ms
and retains P95 2411.9 ms. Cloud build and Firebase-only post-build verification
pass. Full-scope current-source and production gates remain open; no broad
performance acceptance is implied.

The earlier v7 editable-context candidate passes
17 independent request parity cases, lint and configured regression, but the
matched 15-sample diagnostic does not prove faster saves: P50 save-create is
3814.7 ms versus v5's 3196.8 ms. Operation counts improve for unrelated customer
changes; latency acceptance and full current-source coverage remain open.

Current candidate v5 completes 942 all-screen preview samples without action or
JavaScript errors, and passes configured v9 regression (383/384 master cases,
zero failures, one explicit opt-in REST skip) and lint. Cloud build verification
confirms Firebase-only `hd-manager-c5839`, 19 files, zero Platform markers.
Editable request base-row cache parity has 16 passes with live dispatch status
and permission/tenant invalidation. These are local checks, not release proof.

Full candidate v3/v5 comparison retains 110 positive P50 deltas out of 210 matched
keys. CPU6 request create-save remains 4031.3 ms, price-save 3663.0 ms and dispatch
local receipt 2003.3 ms. Therefore no claim that all modules are smooth is made.
Dedicated CPU6 save-create profiling completes 15 diagnostic samples with no
errors; its P50 is 3196.8 ms. Sampled stacks identify request-row sorting,
shortage matching and preview localStorage work. No save-price sample executed
in that restricted chain, so price-save stacks remain unverified. The separately
owned app on localhost:5179 remains running as required by the user.

- Authoritative coupled financial/inventory histories are not remote screen pages.
- Preview CPU timings are not real production server-ACK or physical-device proof.
- Monthly report controls unreachable in this baseline UI remain unmeasured.
- The local host uses Node 25; official pipeline Functions checks use Node 22.
- Product small positive timing deltas still require profiling/acceptance analysis.
- All-module v2 interaction checks passed; controlled timing analysis, official
  build/deploy and production gates remain open.

These limitations and pending gates prevent a FULL PASS declaration now.
