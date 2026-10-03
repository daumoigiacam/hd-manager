# Phase 1 Main Thread / UI Report

Date: 2026-10-02. HD Manager 1.0.5.
Locked baseline: `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.
Branch: `codex/final-22-module-audit-20261002`.

## Scope and Safety

Five modules audited: Order requests, Warehouse import/inventory, Warehouse dispatch, Products/stock, Delivery reports.
Inherited Phase 0 reports and `FULL_APP_PERFORMANCE_105_2026_10_02.md` remain unchanged.
The inherited 811 successful samples are historical evidence, not measurements collected in this phase.
Pre-existing dirty harness/action-case files and Phase 0 reports were preserved.
No commit, push, deployment, backend change, migration, new pagination/search/calculation architecture, background scheduling change or runtime dependency.

Runtime patch: a report-visibility guard and matching selection guard in `src/App.jsx`; one product-specific footer-offset rule in `src/design-system/foundation.css`.
No mutation handler, pricing/unit formula, permission, tenant filter, stock builder or confirmation contract changed.

## Measurement Method

- Baseline build was captured before source edits and reused for the action run, never rebuilt from patched source.
- Final build: `phase1-products-final-after/app`, reused without rebuilding for `phase1-final-target-after`.
- Matched final target runs: `test-results/full-interaction/phase1-target-before` and `phase1-final-target-after` (120 samples each; no failures or page errors).
- Matched extended runs: `phase1-actions-before` and `phase1-actions-after` (205 samples each). Their inventory guard is final, but their initial product CSS candidate still failed; both retain four failures, described in the regression report.
- Final product-only action suite: `phase1-products-final-after` (75 samples, no failures or page errors). It validates the corrected CSS; its different navigation history is not used for cross-suite speedup claims.
- Same fixture generator: 600 products, 360 customers, 1800 orders, 900 payments, 4500 requests, 4300 dispatches, plus the same built-in preview seed. Extended actions add the same preview customer override.
- Five repetitions; CPU6x/CPU3x at 390x844 and CPU1x at 1366x900; headless Chrome, React production profiling.
- Event to expected DOM observation plus two RAFs. Not backend acknowledgement, compositor FPS or physical Android performance.
- All non-local network requests aborted; no production company records written.
- `compare-phase1-audit.mjs` emits matched P50/render/commit/observed-long-task attribution and exact initial-view parity to `phase1-comparison.json`.
- Source-mapped CPU profiles identify work but start before automation input. Their sampled self-times are not causal percentages of interaction wall time.

## Opening Measurements

P50 milliseconds, five samples per cell. These are the target runs, without extended action mutations.

| Module | CPU | Before | After | Delta | Change |
| --- | --- | ---: | ---: | ---: | ---: |
| Order requests | 6x | 1615.6 | 1592.3 | -23.3 | -1.4% |
| Order requests | 3x | 819.9 | 1053.1 | +233.2 | +28.4% |
| Order requests | 1x | 192.8 | 194.5 | +1.7 | +0.9% |
| Warehouse dispatch | 6x | 987.6 | 922.4 | -65.2 | -6.6% |
| Warehouse dispatch | 3x | 409.2 | 517.4 | +108.2 | +26.4% |
| Warehouse dispatch | 1x | 124.8 | 113.8 | -11.0 | -8.8% |
| Warehouse import/inventory | 6x | 1810.1 | 591.4 | -1218.7 | -67.3% |
| Warehouse import/inventory | 3x | 862.9 | 339.3 | -523.6 | -60.7% |
| Warehouse import/inventory | 1x | 285.2 | 88.6 | -196.6 | -68.9% |
| Delivery reports | 6x | 2261.3 | 2243.6 | -17.7 | -0.8% |
| Delivery reports | 3x | 1074.2 | 1210.0 | +135.8 | +12.6% |
| Delivery reports | 1x | 458.4 | 266.9 | -191.5 | -41.8% |
| Products | 6x | 852.3 | 947.6 | +95.3 | +11.2% |
| Products | 3x | 393.7 | 479.5 | +85.8 | +21.8% |
| Products | 1x | 134.6 | 119.5 | -15.1 | -11.2% |

Do not attribute incidental improvements in unchanged modules to this patch. Different runs show system/scheduling variance, including the desktop delivery baseline. Likewise, increases in unchanged routes are retained as evidence; no universal non-regression or smoothness guarantee is asserted.
Final CPU3x request/dispatch/product opens increased by 21.8-28.4%. The intermediate run had smaller increases, but that does not invalidate the final measurements. Root-render times also increased; the cause is not isolated. Significant-regression exclusion is therefore an unmet gate, not a PASS justified by guessing system variance.

## Changed Hot Path: Hidden Monthly Inventory UI

The month table was computed even though the import/export/stock views do not display it.
Its report branch is currently not exposed by the three-button toolbar. No new toolbar entry was added.
The guard avoids hidden UI preparation, not the underlying stock calculation algorithm.
All existing dependencies remain, with tab visibility added. The report row selection is not cleared just because hidden rows are not prepared.

Root React render P50 (ms):

| CPU | Before | After | Root commit P50 before/after |
| --- | ---: | ---: | --- |
| 6x | 1652.9 | 454.2 | 2 / 2 |
| 3x | 785.1 | 256.4 | 2 / 2 |
| 1x | 268.5 | 72.2 | 2 / 2 |

This reduced work per render, not the number of root commits. No new memo abstraction is credited.
The active monthly callback remains source-identical after removing the guard and normalizing line endings.
Focused callback tests compare baseline/new results for units, archive exclusion, stock counts and hidden groups.

Matched extended inventory save-with-expense results (same final App guard; intermediate CSS candidate on both paired action histories):

| CPU | Save P50 before | Save P50 after | Change | Root render before/after |
| --- | ---: | ---: | ---: | --- |
| 6x | 7262.4 | 2129.6 | -70.7% | 6811.3 / 1519.9 |
| 3x | 2759.6 | 1111.4 | -59.7% | 2425.7 / 805.4 |
| 1x | 734.3 | 339.7 | -53.7% | 635.4 / 217.3 |

CPU6x save profiles still show normalization self-time (2868 -> 1074 ms), preview persistStore (221 -> 201 ms) and setItem (220 -> 213 ms). These are sampled CPU self-times, not database acknowledgement or percentages of save wall time. Hidden monthly preparation is skipped by a tested visibility guard; stock and normalization algorithms remain untouched.

Observed long-task events are incomplete: CPU6x import-open samples contain no long-task entries despite hundreds of milliseconds of React work. Zero entries do not mean zero blocking or no jank. Database-duration fields are null in these open samples, not zero Firebase latency. Full long-task/real-device acceptance remains unproven.

## Input and Interaction Findings

Dispatch quantity input P50 at CPU6x: 41.3 -> 35.7 ms in final target runs.
Dispatch customer input P50 at CPU6x: 149.4 -> 151.7 ms; still above 100 ms.
Picker opening P50 at CPU6x: 15.6 -> 19.1 ms.
These paths were not rewritten; do not claim their small movements as improvements caused by this patch.

Product create action was blocked by footer interception on baseline desktop. The first CSS candidate also failed. The final two-class rule reserves the larger of footer/bottom-nav heights and passes all five ordinary desktop create clicks plus mobile create/search/archive checks in the 75-sample product suite. There is no valid desktop baseline create duration to calculate a speedup.

## Remaining Work and Gate

See [Deferred register](PHASE2_DEFERRED_REGISTER.md), [Removed-work register](PHASE1_REMOVED_WORK_REGISTER.md), and [Regression report](PHASE1_REGRESSION_REPORT.md).
The other four modules retain costly normalization/reconciliation/search/stock paths. Their algorithm/data architecture is explicitly deferred, rather than bypassed to manufacture faster timings.
Complete interaction coverage and physical keyboard/backend acceptance are not established by opening measurements, build success or unit tests.
Final verification: 6/6 patch tests, existing `test:all`, lint, configured payroll typecheck, production build and `git diff --check` completed successfully. The ready-table supplemental parity run matches 6/6 exact requests/products initial views across three CPU profiles. Extended delivery cases remain incomplete and final CPU3x increases remain unresolved; these successful checks do not close the regression gate.
Do not automatically start Phase 2.

PHASE 1 STATUS: BLOCKED
