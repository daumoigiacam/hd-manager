# Master Performance Measurement Protocol

Working verification record, 2026-10-03. This is not release acceptance.

## Immutable Reference

- Git baseline: `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.
- Master-start before bundle: `test-results/full-interaction/phase2a-final-after/app`.
- Never rebuild into this directory. The phase name reflects the inherited
  storage phase; it is the BEFORE bundle for the autonomous master continuation.
- Isolated preview only, loopback server, fixed date `2026-10-02`; no production
  writes, production user credentials or connection to localhost 5213.
- Full fixture: 600 products, 1800 orders, 900 payments, 4500 requests and 4300
  dispatches, plus documented supplemental records. No smaller AFTER dataset.

## Contracts

CPU6x and CPU3x use the mobile viewport; CPU1x uses the desktop viewport. Match
profiles between builds, not across unlike viewports. Five repetitions for most
actions; certain duplicate-submit flows have three. Report sample count and
median/tail, not one favorable observation.

Historical `search`/`input` keys do not necessarily wait for filtered results.
Supplemental `*_input_paint_v1` and `*_result_ready_v1` share one actual input;
the former waits for input value plus two frames, the latter for the complete
ordered result list plus two frames. Frame opportunities are not compositor
paint or physical-device latency. Never compare different contracts.

Preview saves measure local write/receipt and UI work, not cloud acknowledgement.
Persistence, exact records, reopen and reload are separate assertions outside
save timing. Real REST Rules/cursor/snapshot checks run separately in the actual
Firestore Emulator; they are not production latency measurements.

## Preserved Failed Runs

| Run | Observations | Why incomplete |
|---|---|---|
| `master-full-before-v3` | 756 samples; zero page errors | Three product guards expected a lowercase name after the legacy editor title-cased it. Desktop customer action was genuinely covered by navigation. |
| `master-products-before-v4` | 157 samples; zero page errors | Numeric-only coverage-name suffixes also matched other products' price fields under the existing ranking rules; strict exact-list waits failed. |

Original summary, screenshots, stores and failure stacks remain untouched. Valid
nonfailed action samples may be reported as such, not as complete acceptance.
Do not mix their partial coverage samples into the replacement focused pair.

## Repaired Focused Product Pair

The v5 focused BEFORE and its AFTER use the same full fixture and all five legacy
product edit saves before supplemental search/CRUD checks. The untouched
`p_perf_1` provides a settled nonmatching precondition; title-casing of edited
`p_perf_0` remains asserted. Coverage names/categories use Alpine, Beacon and
Cobalt with corresponding alphabetic short names. These markers do not change
the business search algorithm. Thirty-six independent read-only semantic checks
validated both old and prepared search behavior for this fixture.

Frozen harness SHA256 at v5 BEFORE start:

- `scripts/audit-interactions.mjs`:
  `80FA7216E530D7122582AAEEAC508F68BC75E5EAEC46CB6BFCF1BB1A15EF42AF`
- `tests/visual/interaction-action-cases.mjs`:
  `B4AD27FF7D50E8B41A8160007369EEC88F91C13431BF50DCBE7692C05D3438FA`

Flags: `HD_AUDIT_CPU_PROFILES=1`, `HD_AUDIT_ACTIONS_ONLY=1`,
`HD_AUDIT_INCLUDE_ACTIONS=1`, `HD_AUDIT_DISPATCH_STRESS=1`,
`HD_AUDIT_STORAGE_PROFILE=1`, `HD_AUDIT_MASTER_FIXTURES=1`,
`HD_AUDIT_PRODUCT_LEGACY_PRECONDITION=1`,
`HD_AUDIT_FIXED_DATE=2026-10-02`, `HD_AUDIT_ACTION_TIMEOUT_MS=30000`,
`HD_AUDIT_REUSE_BUILD=1`, `HD_AUDIT_MODULES=products`,
`HD_AUDIT_ACTION_MODULES=products`, `HD_AUDIT_PROFILE_MODULES=products`.
Change only output phase and immutable build directory between the pair.

## Dedicated History Pair

The opt-in `HD_AUDIT_INVENTORY_HISTORY=1` run is separate from default coverage.
It retains 4300 dispatches and 4500 requests, distributes the dispatch fixture
across a completed 31-day month and uses real calendar/group/unit controls.
It must use the same setup and immutable builds on both sides. Unavailable
monthly-report controls are recorded, not replaced with simulated clicks.

## Final Candidate Evidence Update

The focused product BEFORE v5 completed with 180 timing samples, no page errors
and no failed guards. Its original global harness hashes above remain historical.
The later history-only harness repair corrected an independently checked group
ordering oracle; it did not change product or other nonhistory branches. Branch
hash comparisons and 124 read-only numeric checks are retained with the history
repair evidence. Do not claim that the global harness files stayed byte-identical.

History BEFORE v1 timed out because its oracle assumed the wrong group order;
its zero-sample failure is retained. History BEFORE v2 completed with 123 timing
samples across CPU1x/3x/6x, zero page errors and no failed guards. It exercises
actual stock/calendar/unit controls and all 31 completed historical dates with
the unchanged large fixture. Monthly report controls were unreachable in this
UI: no monthly-report performance acceptance is inferred from these timings.

The final candidate reuses per-movement measures across stock-date changes and
an immutable-record stock index across unrelated product edits. In-place mutable
records remain supported by the utility's default mode; the App opts into the
immutable published-record contract covered by regression tests. Search uses a
leading/trailing debounce only in the three prepared-search callers to avoid a
fixed wait for the first input after idle. Actual browser measurements must still
establish performance: operation counts alone are not latency acceptance.

`test-results/master-full-regression-final-candidate.log` completed with exit 0.
The master test group contained 322 tests: 321 passed, zero failed, one opt-in
Emulator test skipped. That skip requires separate actual Emulator execution.
Lint and payroll-scoped typecheck passed. The typecheck scope is not a claim of
whole-application TypeScript coverage.

AFTER build destination: `master-final-candidate-after-v1/app`. Paired products
use `master-products-after-v1`; this is a new build and never overwrites BEFORE.
Release, production smoke and final acceptance are not yet certified.

## Candidate v1 Completed Measurements

- Product AFTER v1: 180 timings, zero failures/errors. The dedicated v5/v1 comparison has 42 paired actions and no unpaired actions. CPU6 product edit-save P50 changed from 2257.7 to 1118.7 ms; creation from 2918.3 to 1314.8 ms; search-result readiness from 134.3 to 77.6 ms. Sixteen positive deltas are retained, including CPU3 modal open-create 75.7 to 141.2 ms; these remain investigation inputs, not an accepted regression.
- History AFTER v1: 123 timings, zero failures/errors. All 15 action/profile pairs improved without positive deltas. CPU6 stock-open P50 changed from 242.3 to 59.4 ms; the 31-date aggregate action from 153.9 to 59.4 ms. Exact numeric/day/unit parity is tested independently; this is not monthly-report UI acceptance.
- General AFTER v1: 933 timings, zero page errors, one failed extended customer action. A normal desktop next-page click was intercepted by the customer FAB/footer. The failure screenshot, text, summary and log remain unchanged. This run is diagnostic, not a passing release benchmark; no comparison gate is bypassed to hide the failure.

Candidate v2 adds bounded exact primitive caches, per-request visible/sheet/history derivation reuse, and removes only the unused interactive pricingChangeLogs source. It corrects customer pager/FAB clearance, preserving the inherited CSS hash after stripping exactly the two permitted isolated corrections. The new cache tests compare actual source with independent pinned Git and optional frozen baseline, including raw fields, coercion, ordering, grouping, units, edits and tenant replacement. The first v2 regression attempt caught an incorrect fixture expectation for a nonempty invalid date string; the independent source comparison already matched the baseline. The fixture now separately asserts retained invalid strings and truly absent-date fallback, without changing application behavior.

The v1 build remains immutable and does not certify these subsequent source changes. v2 needs its own fresh build, full regression and paired measurements.

## v2 Real Firebase Emulator Regression

`test-results/master-emulator-session-regression-v2-r14.log` completed with exit
0 and 22 passing cases. It uses actual local Identity Center Functions, server
Auth claims, Firestore SDK/Rules and browser controls, not injected UI identity or
response mocks. Product/customer creation and legacy direct-SDK dispatch save
were verified with server reads and reload. Dispatch checks retain two pieces,
two weight entries (1.25 + 2.5 kg), 3.75 kg billing and 37,500 amount. Two tenants
and employee/customer sessions cover permissions, reload, logout, offline SDK
write resumption and observable compatibility-maintenance parking/resumption.

Failed attempts remain in their separate r1-r13 logs. Harness corrections use the
sales employee's More-menu route, the mobile contextual customer create button
and relative picker locators. They do not change App business code or RBAC.
The customer bootstrap Function is explicitly allowed only on the demo loopback
endpoint. Firebase WebChannel's installed source confirms its connectivity
image `www.google.com/images/cleardot.gif` after a deliberate offline failure.
Five such image probes were aborted without fabricated responses; all other
foreign requests remain acceptance failures. No production endpoint is allowed.

`test-results/master-rest-emulator-v2.log` separately completed with exit 0,
four passing tests and no skips, using cached Firestore Emulator 1.20.4.
Microsecond-compatible pinned readTime was honored across live insert/update/
delete; all 201 fixture records were retained and foreign-tenant Rules denied.

These are local Emulator results, not production authentication/performance
certification, modern atomic inventory API coverage or offline App save replay.
The host uses Node 25 while Functions requests Node 22; official CI uses Node 22.
The Emulator services and dev server were stopped before further CPU timing.

## Remaining Release Gates

General candidate v2 finished with 942 samples, no page errors and no failed
actions. Normal desktop customer pager/FAB clicks pass without force clicks.
The comparison with general BEFORE v3 retains 147 exact-size pairs, every
positive delta, and every unpaired supplemental action. Products use the
separate exact-contract pairs; the old general baseline's failed product cases
are not accepted product baselines. General BEFORE v3 did not execute all newly
added supplemental mutations, so its full action chain is not identical to v2.
A new controlled finance/employee/request/quote/debt pair uses the same current
harness, fixture and action order against the two immutable builds to investigate
the CPU3x increases rather than attributing them to source without evidence.

That pair completed as BEFORE v7 / AFTER v4: 234 samples per build, zero errors
or failures, 48 exact pairs and no unpaired actions. CPU3x requests open changed
1394.5 to 841.4 ms, request create-save 4887.4 to 2331.5 ms, expense-save 536.1 to
373.1 ms, and quote apply 1204.5 to 530.3 ms. The large increases from the older
general chain did not reproduce under identical action order. Nine small positive
deltas remain (0.1-7.9 ms); they are retained in `master-comparison.json`.
This resolves the action-chain confounder, not every possible device regression.

The dispatch readiness loop replaces one fully settled nonempty query with the
next, in immediate succession. It does not clear the field between samples.
CPU1x readiness P50 increases from 12.0/12.9 to 130.7/131.4 ms for customers/
products while measured React render P50 decreases from 4.6/5.5 to 0.8/1.0 ms.
The bounded trailing debounce therefore has a real result-latency tradeoff; do
not describe that readiness measurement as immediate or remove it from results.
Input-paint and final-result timings remain separate acceptance observations.

Product repeats show both signed timing changes. In the controlled v6/v3 pair,
CPU3x edit-open total P50 is 64.0/73.1 ms while React render P50 is 8.2/7.2 ms.
CPU3x input observation P50 is 0.6/0.6 ms but end-of-frame P50 changes; its total
P50 is 17.8/23.6 ms. CPU6x edit-open is 170.5/146.1 ms. These diagnostics explain
why total time cannot be equated to isolated App CPU, but do not prove every
positive modal/filter delta is harmless. All original samples remain retained.

Source-profile decoding must receive the build's parent directory, because the
decoder resolves `app/assets/<asset>.map` under that directory. v2 profiles were
decoded again with `master-final-candidate-after-v2`, never v1 source maps.

After the final source is stable: rerun full regression, lint, payroll-scoped
typecheck, real Emulator checks, production build and paired UI measurements.
Investigate regressions without relabeling them expected. Only then commit and
non-force push `HEAD:main`, use the official workflow, verify served build SHA,
and perform safe production smoke/performance checks. No release or FULL PASS
is certified by this working protocol.

## Candidate v3 and Dependency Verification

Candidate v3 adds only a bounded, exact ordered-pair collation cache to request
sorting. It uses the same Vietnamese numeric collator, limits retained pairs to
2048 and strings to 256 characters, bypasses coercible objects and long inputs,
and resets with the component/tenant lifetime. Sorting and every request output
still match independent Git/frozen source. Four additional tests verify ordering,
pair-key collisions, eviction, coercion and lifetime; these are operation-count
and correctness checks, not latency acceptance. BEFORE and v1/v2 builds remain
immutable. A same-chain v3 run is recorded separately as control AFTER v5.

Control AFTER v5 completed: 234 samples, zero action failures/page errors,
48 exact pairs against BEFORE v7 and no unpaired actions. Request CPU6x open
changed 2635.2 to 1513.6 ms and create-save 12233.5 to 4522.8 ms; CPU3x open
changed 1394.5 to 833.2 ms and create-save 4887.4 to 2348.6 ms. The actual-source
4500-request test preserves exact output and requires fewer than half the direct
collator calls. Cache v3 versus v2 reduces CPU6x open by 97.0 ms and save by
184.2 ms; CPU3x save total increases 17.1 ms while React render decreases 17.3 ms.
This is not evidence that every timing metric improved.

Three baseline-to-v3 positive P50 deltas remain: CPU3x finance edit-open +31.5 ms,
request create-open +15.2 ms and CPU1x finance edit-open +0.9 ms. For CPU3x
finance edit-open, BEFORE min/P50/max is 73.0/92.0/167.2 ms and v3 is
77.9/123.5/139.3 ms. Request create-open is 209.1/250.0/415.1 ms versus
152.5/265.2/429.9 ms, with unchanged React render P50 of 10.4 ms. These small
samples overlap substantially and do not isolate a causal regression. Finance
does not mount the new request-only cache. Keep all signed data and avoid a
blanket no-regression certification; the final all-screen v3 run is separate.

Final v3 configured regression (`master-full-regression-v4.log`) exited 0:
375 master cases, 374 passed, zero failed and one opt-in REST Emulator skip.
That REST path has separate actual Emulator evidence, not a silent missing test.
Lint, supplemental helper/script lint, payroll-scoped typecheck and cloud build
also exited 0. `master-production-bundle-v3.log` reports Firebase-only PASS,
19 inspected files and zero Platform runtime markers. This is build verification,
not deployment or authenticated production acceptance.

Final Functions dependency versions are `@fastify/busboy` 3.2.2 and `qs` 6.16.0
(explicit override). Root and Functions production audits both return zero
vulnerabilities. `master-full-regression-security-v3.log` completed with exit 0;
`master-auth-regression-security-v3-r2.log` completed with 22 actual local
Identity/Auth/Rules/UI persistence cases after the dependency update. The first
attempt used an unsupported runner flag and did not execute tests; its failure
log is retained. Emulator and dev services were stopped before v3 CPU timing.

Official payroll, tenant and recovery Rules checks passed in an ASCII temporary
runtime. The initial Unicode-path Java failure is retained, not suppressed.
The official architecture/stress/KPI commands completed, but static scalability
projections still fail and device KPI evidence remains WARNING. Their exit codes
are not real production scalability or Android performance certification.
The production cloud build and Firebase-only bundle verification passed for
`hd-manager-c5839`; no release deployment or production smoke has occurred yet.

## Final v3 All-Screen Run and Host Contention

`master-full-after-v3` completed 942 samples, zero failures/errors, across the
same 23 screens and full master fixture. Source profiles were decoded against
`master-final-candidate-after-v3`, not another build's source maps. The descriptive
v2/v3 comparison has 210 exact-size pairs, zero unpaired actions and 124 positive
P50 deltas. Both signed data and every original attempt remain retained. This is
not zero-regression acceptance; v2 is another candidate, not the pinned baseline.

Read-only process checks identified an unrelated Vite server on localhost:5179,
serving the separate Can Gia Cam project. A five-second observation measured
10.72 CPU seconds for that process; it predates the final v3 run. This is evidence
of current host contention, not a continuous record proving why each action
changed. The owner asked to keep that application running. Subsequent matched
measurements preserve it and do not stop its process, edit its code or data.
No emulator, build or full regression suite is run concurrently with our own
timed benchmark. Shared-host timings retain that external-load limitation.

Full configured regression and lint reran successfully in
`master-full-regression-v6.log` and `master-final-lint-v6.log`. Production static
preflight exposed the checker's rejection of valid Vite `./assets/` paths. The
narrow fix and traversal-negative cases pass in the focused 22-case suite; an
actual credential-free GET-only check then passed for current production SHA
`5f162f5ce85fd4dc746382f13a6a4170e4a29775`, with five assets. Its evidence is
`test-results/master-production-release-smoke/smoke-1791007017318-16956.json`.
Earlier failed reports are retained. No App code or production data changed to
make this checker pass, and this preflight does not certify the new candidate.

### Additional Baseline v8 Measurement Contamination

The new full same-chain BEFORE v8 uses the original immutable
`phase2a-final-after/app`, not current source. During its CPU6x stage, a read-only
PowerShell inspection of the large v3 sample JSON consumed CPU unexpectedly;
the inspection was interrupted rather than allowed to continue. This is an
additional agent-caused contention window, not background App work. Retain the
v8 attempt and its partial logs/profiles, but do not use it as clean performance
acceptance or a flattering replacement baseline. The benchmark itself was then
interrupted; no final samples/summary JSON was written. No slow observations are
deleted from its retained log.

## Fresh Six-Module Control v9/v6

`master-control-before-v9` and `master-control-after-v6` both exited 0 with 261
samples, no failed actions and no page errors. They reuse immutable builds
`phase2a-final-after/app` and `master-final-candidate-after-v3/app`, respectively.
The same measurement contracts and fixture counts produce 57 matched summary
pairs, zero unpaired actions and 16 positive P50 deltas. No modules are excluded
from that comparison. This targeted follow-up covers finance, employees,
order_requests, price_quotes, debt and delivery_reports; it does not replace the
earlier 942-sample all-screen coverage or certify the remaining screens.

Both runs retain 600 products, 364 customers, 1,800 orders, 900 payments, 4,503
order requests and 4,303 dispatches, fixed date 2026-10-02 and CPU1x/3x/6x.
The external port-5179 application remained running as the owner requested;
our builds, test suites and large JSON inspections did not run concurrently
with either fresh benchmark. External CPU contention is still a limitation,
not a proven cause of every signed difference.

CPU6x P50 results (milliseconds, BEFORE -> AFTER):

| Action | BEFORE | AFTER |
| --- | ---: | ---: |
| Order requests open | 2195.2 | 1270.9 |
| Order requests create-save | 9970.8 | 3875.4 |
| Delivery reports open | 2756.7 | 1365.1 |
| Delivery report cashflow double-tap save | 3095.0 | 442.5 |
| Price quotes apply-price | 1605.7 | 849.5 |
| Finance open-edit | 153.2 | 250.1 |
| Finance save-edit | 567.3 | 590.4 |

The largest positive P50 deltas are CPU3x order-requests open (+263.8 ms),
CPU3x finance double-tap expense save (+199.2 ms) and CPU6x finance open-edit
(+96.9 ms). They remain in `master-control-after-v6/master-comparison.json`;
no zero-regression acceptance is inferred. CPU3x order-open render P50 changes
853.0 -> 881.8 ms while wall P50 changes 1034.3 -> 1298.1 ms; these are distinct
measurements and do not alone attribute the difference to a source change.

AFTER CPU profiles were decoded against the matching v3 build's source maps.
These local preview saves are not Firebase server acknowledgements. Order-save
and report-open still miss the desired smooth large-data response on CPU6x.
No physical-device or authenticated production performance PASS is established.

## Billing Cache Candidate v4 / Control AFTER v7

Candidate v4 changes only the billing module's raw-string normalization hot
path, using the same 512-entry / 256-character bound as pricing normalization.
Every other billing declaration is checked against pinned Git source, apart
from CRLF/LF line endings. Five focused billing cases cover public results,
variant/amount/grouping parity, live coercion/errors, actual cache eviction and
isolated normalization operation counts. Reusing a short label 2,000 times
performs one normalization; 257-character labels are recomputed, not retained.
This operation-count proof is not a production latency measurement.

`master-control-after-v7` builds immutable `master-final-candidate-after-v4/app`
and completes the same six-module contract: 261 samples, no failures/errors.
Comparison with unchanged BEFORE v9 yields 57 exact pairs, no unpaired actions
and four positive P50 deltas. CPU6x request create-save is 9970.8 -> 3454.6 ms,
request open 2195.2 -> 1519.8 ms, delivery open 2756.7 -> 1487.7 ms and apply-price
1605.7 -> 1237.1 ms. These are still local preview timings on the shared host.

All positive P50 deltas remain recorded: CPU3x finance expense double-tap save
+167.5 ms, CPU3x finance open +31.4 ms, CPU6x finance open-edit +22.4 ms and
CPU3x employees open-edit +10.8 ms. Corresponding render P50s decrease in all
four pairs. Wall time and render time cannot be equated, and that observation
does not establish the cause of slower wall timings or certify no regression.
Compared with the immediately preceding candidate, some large-data openings
also take longer; the new cache is not described as universal timing improvement.

Profiles are decoded against the v4 source maps. The billing-normalization
frame falls outside the top 20 self-time frames in the CPU6x first-open request
and delivery profiles (it was 66 / 105 ms in the preceding candidate's matched
profiles). Absence from that top-20 report is not zero CPU time. Source request
mapping/collation and delivery processing remain visible hot paths.

Retain the earlier 942-sample all-screen results and all source builds. They
predate this narrow billing edit; new all-screen coverage and release/production
gates are still required. No production record or other application's process
was changed during this follow-up.

Final v4 functional regression is `master-full-regression-v8.log` (full configured
chain exited 0; master group 381 cases, 380 passed, zero failed, one opt-in REST
skip already covered by separate actual Emulator execution). The final focused
billing/pricing suite has 13 passes. Official lint v7 and supplemental helper
lint exit 0. Cloud build v4 and Firebase-only bundle verification exit 0, with
19 files inspected and no Platform runtime markers. The official deployment
workflow's helper-lint extension and production static checker pass 22 focused
cases. None of these results establish production release or server-ACK timing.
# Candidate v5 Full-Scope Evidence, 2026-10-03

Current v9 matched CPU6 diagnostic completes 15 samples, no errors, three
matching v7 keys. Save-create P50 3061.8 ms (-752.9 ms/-19.7%), P95 3329.4 ms,
render P50 1930.5 ms. Open P50 improves 25.8 ms, but open-create P50 increases
21.1 ms and P95 reaches 2411.9 ms. The slow sample is retained. Matching
source profiles resolve shortage item traversal self time 277 ms (v7 711 ms);
this does not prove all wall-clock delta is caused by the cache. The shared
app on 5179 remains running. Full-scope current-source and production gates
are still required; no save-price samples executed in this selected chain.

Alias candidate v8 (JSON tuple keys) completes 15 matched diagnostic samples,
no errors. Versus v7 all three P50s increase: save-create +4724.4 ms (P50
8539.1 ms, P95 9841.6 ms), open +223.4 ms, open-create +78.4 ms. The audit wraps
every JSON call for storage observations; its first-save profile includes 551 ms
self time in that wrapper. This identifies instrumentation participation, not
proof that all latency is instrumentation or a production causal conclusion.
All slow samples and immutable v8 profiles remain. The implementation is not
accepted. Current v9 uses bounded nested primitive-key Maps without JSON key
serialization; focused parity/bounds pass, timings remain to be established.

Candidate v7 narrows editable base-row contexts to each associated customer and
employee name, with permission and dispatch overlays evaluated live. Seventeen
frozen-source parity cases and configured regression/lint pass. Its matched
CPU6 diagnostic completes 15 samples, three paired keys, no errors. Compared
to v5: open P50 1501.8 to 1508.8 ms (render 980.7 to 950.5), open-create 349.0
to 396.3 ms, save-create 3196.8 to 3814.7 ms. Every increase is retained.
Granular operation-count reduction does not certify latency improvement; v7
performance acceptance remains open, and no full v7 run or deployment is implied.

Subsequent FIFO collation-eviction experiment v6 is rejected, not accepted.
Matched diagnostic v5/v6 has three paired keys, no unpaired keys and no errors;
all P50 deltas increase (open +697.3 ms, save-create +660.0 ms, open-create
+104.2 ms). This is not proof of source causality on the shared host, but it
does not establish improvement. Only the newly introduced FIFO helper/test
edits are undone. Immutable v6 profiles/results remain; current runtime is v5.

`master-full-after-v4` completed against immutable
`master-final-candidate-after-v5/app`: 942 samples, 23 screens, no failed actions
or page errors. No fixture, action-chain or timing threshold was reduced.
Source profiles were decoded against that exact build. The separate app on port
5179 stayed running, as explicitly requested; shared CPU noise is a limitation.

Descriptive full v3 versus full v5 comparison retains all 210 matching action
keys, zero unpaired keys and 110 positive P50 deltas. Largest increases include
CPU3 request create-save +573.9 ms and CPU6 customer edit-save +332.0 ms. These
must not be omitted or called source-proven regressions without controlled
investigation. Do not compare full action-chain timings to six-module controls
as though they were identical runtime sequences.

Current CPU6 P50: request create-save 4031.3 ms, request price-save 3663.0 ms,
dispatch local receipt 2003.3 ms, request open 1716.1 ms and delivery open
1544.5 ms. Local preview receipts are not Firebase acknowledgements.

A dedicated `master-save-profile-v5` diagnostic reuses the immutable v5 build,
full master fixtures and CPU6, restricted to request actions solely to capture
save CPU stacks. It completed 15 samples without failed actions or page errors:
five each for open, open-create and save-create. Save-create P50 is 3196.8 ms,
render P50 2215.8 ms. No save-price samples executed in this selected chain;
save-price profiling is NOT certified by this diagnostic.

The first save-create CPU stack resolves to the matching v5 source: request-row
sorting (`App.jsx:60279`, 457 ms self; `60294`, 268 ms), shortage matching
(`App.jsx:10350`, 551 ms; `10260`, 312 ms) and preview `setItem` (376 ms).
These sampled self-times describe only this profile, do not partition wall-clock
P50 and do not demonstrate Firebase ACK or a production storage bottleneck.
The diagnostic must not replace the 942-sample full-scope acceptance evidence.

Current App SHA256:
`1EFCACB94146710D0EB830CE33F554065E00012E66E2984833411629EDFCBBB8`.
