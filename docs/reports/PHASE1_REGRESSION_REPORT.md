# Phase 1 Regression Report

Date: 2026-10-02. Locked baseline: `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.

## Evidence Boundaries

Opening/profile runs alone are not a complete business regression.
All action writes use an isolated preview store with outbound network blocked. No real Firebase acknowledgement, production stock mutation, financial posting or physical-device keyboard acceptance is claimed.
The monthly report branch is not reachable from the current three-button inventory toolbar. Callback equivalence tests do not constitute UI acceptance of that hidden feature.

## Mutation Propagation Review

| Module | Reviewed path | Preservation / evidence | Remaining coverage |
| --- | --- | --- | --- |
| Order requests | Add/edit -> validated durable write -> raw request state -> latest versions, permission filter, visible groups, totals | Handlers and dependent selectors unchanged. Isolated create cases verify persisted request and updated UI | New-run price-edit, filter/sort and full repeated-edit coverage incomplete |
| Import/inventory | Import+expense command -> collection state -> day rows, stock summaries, movement report | Same atomic command/linked expense validation retained. Only hidden monthly UI preparation skipped; active formula unchanged. Initial Nhap/Xuat/Ton view parity collected | Real server acknowledgement, date-filter scenarios and actual stock adjustment UI not fully rerun |
| Dispatch | Validated dispatch -> local durable queue -> raw dispatch state -> shortage/group/list | Write path, duplicate guards, quantity semantics and shortage logic unchanged. Opening/picker/input timings rerun | New-run valid stock-save/select-product/select-customer/reopen coverage incomplete; local queue is not server success |
| Products | Add/edit/archive -> collection subscription -> active products, filters, page and stock metrics | Business handlers unchanged; final product-only suite has 75 samples with no failures/errors, including five ordinary desktop create clicks and persisted create/search/archive assertions | New-run edit/save/reopen and all inventory-tab interactions incomplete |
| Delivery reports | Validated report+payment+expense command -> subscribed records -> reconciliation groups | Pricing/matching/command/duplicate guards and memoized cards unchanged | Extended cashflow test selects source-linked rows but then requests nonexistent freeform product input. Baseline and after failures must stay recorded, not count as PASS |

## Focused Patch Tests

`node --test tests/phase1-hidden-report.test.mjs` checks:

1. Active month-table formula source equals locked baseline after removing the guard and normalizing line endings.
2. Hidden tabs do not read monthly data.
3. Report values equal baseline for Kg/Con, archived imports, stock-count values, missing counts and hidden groups.
4. Tab dependency and hidden selection preservation.
5. Hash-equivalence of the rest of App after reversing only this patch in memory, including all business handlers and JSX.
6. Product action CSS reserves the larger footer/navigation height and overrides the staff-only rule.

Result: all six focused tests passed on the final source.

These are focused tests, not a claim of complete five-module end-to-end acceptance.
The baseline-equivalence audit test requires the locked Git commit in local history.

## UI/Data Parity

The audit harness captures exact main text and table/list row text before mutations on all five screens, plus all three inventory tabs, for CPU1x/3x/6x.
Screenshots are retained in `phase1-actions-before` / `phase1-actions-after`.
The same selectors and ordinary clicks are used before and after. No forced-click workaround or business-content normalization.
The product action position changes intentionally; data, counts and table text must remain equal.

Initial extended comparison: 24/24 main-text snapshots matched; 23/24 row-text snapshots matched. The CPU6x request snapshot used separate text/row reads: the baseline captured its temporary one-row empty state before table rows were populated, whereas the after snapshot captured populated rows. This mismatch remains in the raw evidence; it is not silently normalized away.

The harness now waits for the request table to contain data and reads text/rows together in one DOM evaluation. Supplemental paired runs `phase1-ready-parity-before` / `phase1-ready-parity-after` reuse the immutable baseline/final builds with the same fixtures. Both have 30 samples and zero failures/errors; all six initial views (requests/products x three CPU profiles) match exact text, row order, counts and amounts. These runs supplement data parity only; they do not replace the original timing series or prove all business actions.

Screenshots are diagnostic captures near initial DOM readiness, not a full settled-transition/physical-device visual acceptance. The desktop product capture shows its floating action above the bottom navigation; action success is independently verified by ordinary clicks.

Physical mobile keyboard, IME composition, touch scrolling, caret under continuous typing, all modal actions and real backend acknowledgement were not exhaustively tested. Source-identical form markup/handlers reduce risk but are not a substitute for those checks.

## Incomplete Cases and Performance Caveats

- Baseline desktop product create: 30-second timeout with bottom navigation intercepting the pointer. This is a real UI obstruction; CSS patch is scoped to products.
- Delivery extended cases: fixture/selector mismatch on all three profiles, not a measured save-latency result.
- Both extended five-module runs retain the same failed desktop product create, so their inventory save histories stay matched. The separate final product suite succeeds and has different navigation/mutation context; its timing is not compared against the extended suite as a speedup.
- CPU6x customer input remains above 100 ms. Several opens and saves remain well above instant-feedback targets.
- Long-task event collection is incomplete at CPU6x. Missing entries cannot be interpreted as smoothness.
- Final target CPU3x opens increase versus baseline: requests +28.4%, dispatch +26.4%, products +21.8%, delivery +12.6%. Corresponding root render times also rise. Smaller increases in the intermediate run suggest variance but do not isolate its cause or establish significant-regression exclusion.

## Final Verification

- `node --test tests/phase1-hidden-report.test.mjs`: 6/6 passed.
- `npm run test:all`: completed with exit 0; existing business/security/integrity tests passed. This is not a new exhaustive end-to-end acceptance of all five modules.
- `npm run lint`: exit 0 for the repository's configured file set.
- `npm run typecheck`: exit 0; the existing script checks `tsconfig.payroll.json`, not all React code.
- `npm run build`: exit 0, production bundle built in 11.46 seconds. This is not a production deployment or a production-latency measurement.
- `git diff --check`: exit 0. Runtime diff is limited to the visibility/selection guards and product CSS offset; pre-existing harness/report changes remain intact.
- Final target timing run: 120 samples, zero failures/page errors. Product-only final action run: 75 samples, zero failures/page errors.
- Extended paired runs: 205 samples each with four failures each (three delivery fixture mismatches and one initial desktop product footer failure), preserved in raw results.

## Gate

No business formula/handler changes; visible data parity and focused tests are separate from incomplete end-to-end coverage.
Retain only the measured inventory UI improvement and product action-accessibility fix.
Do not claim all five modules or all Android devices are smooth. Do not deploy or advance automatically to Phase 2.

PHASE 1 STATUS: BLOCKED
