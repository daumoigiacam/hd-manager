# Phase 1 Removed Work Register

Date: 2026-10-02. Baseline: 5f162f5ce85fd4dc746382f13a6a4170e4a29775.

## P1-01: Hidden monthly inventory table

- Module: WarehouseImportView / Nhap Xuat Ton.
- WHY: `warehouseMovementTableRows` ran a month-date loop and stock preparation while the table's JSX was hidden. Its consumers are monthly grouping, selected monthly row/detail and report-tab JSX, not the visible import/export/stock totals or save handlers.
- AVOIDS: monthly table preparation, its dependent grouping and selected-detail preparation on hidden views. Does not reduce loaded data, bypass validation or change the stock builder.
- DEPENDENCIES: retain every existing dependency; add `warehouseInventoryTab` so report activation/data changes recompute correctly. Preserve the selected row while hidden; validate its existence when report is active.
- MEASURED IMPACT: see the matched before/after table in `PERFORMANCE_PHASE1_MAIN_THREAD_REPORT.md`. Do not infer improvement from the guard alone.
- CORRECTNESS: five focused tests check hidden data is not read, active formula is unchanged apart from line endings, unit/archive/count/group results equal the locked baseline, tab/selection dependencies are retained, and the rest of App matches the locked baseline after reversing only this patch in memory.
- Important: current visible toolbar exposes Nhap/Xuat/Ton only. The pre-existing report branch has no current toolbar entry. This phase does not add a new UI feature. Its formula is tested through extracted callbacks, not a claim of end-to-end report-tab acceptance.
- Business handlers, Firebase calls, stock algorithms, data scope and scheduler are unchanged.

## Changes Deliberately Not Made

- No generic memo wrapping: several expensive paths are business calculations and existing memoized paths already have stable data dependencies.
- No removal of product stock on the normal products tab: low-stock row styling still consumes it.
- No change to inherited memoized delivery cards, indexed request matching, quantity input behavior or pagination.
- No delayed input timer, shortened fixture, disabled validation, reduced data scope or replacement of acknowledgement semantics.
- No files deleted; no new runtime library; no new React.memo/useMemo/useCallback abstraction.

## P1-02: Product create action obstruction

- Evidence: unchanged baseline desktop click timed out after 30 seconds; Playwright explicitly reported bottom navigation intercepting pointer events. Screenshot: `phase1-actions-before/cpu-high-1x-products-failure.png`.
- WHY: only staff-shell floating actions had a bottom offset. The company/product action lacked a non-staff footer reservation.
- CHANGE: one product-specific CSS rule positions the action above the maximum of footer height and bottom-navigation height plus existing spacing. Desktop CSS sets footer height to zero despite a visible bottom navigation; the first fallback-only candidate failed and was replaced, not credited as successful. The two-class selector also overrides the staff-shell rule. No forced clicks, hidden navigation, new JS, animation or handler change.
- MEASURED IMPACT: functional click accessibility is checked by the identical action harness after the patch. Baseline has no valid create timing on desktop, so no numeric speedup may be claimed there.
- Remaining business/data logic unchanged. This is an interaction-accessibility fix, not an optimization of stock calculation or persistence.
- Final isolated products check: `phase1-products-final-after`, 75 successful opening/action samples, zero failures/errors. All five desktop ordinary create clicks succeeded, with persisted create/search/archive assertions. Context differs from the five-module action run, so its timings are not used for cross-run speedup claims.
