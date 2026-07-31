# HD CONNECT Premium Phase 2.3 Audit

Date: 2026-08-01  
Scope: Presentation layer only. No business logic, data model, Firebase, API, payment, webhook, or permission changes are permitted in this phase.

## Audit Method

This baseline audit was performed before source changes using static inspection of `src/App.jsx`, `src/index.css`, existing design-system files, package scripts, and the current test entry points. Runtime visual verification is recorded separately because the local preview browser is not available for unrestricted navigation in this environment.

## Screens In Scope

| Module | Main component | Current presentation path | Baseline finding |
| --- | --- | --- | --- |
| Orders | `OrderManagementView` | `src/App.jsx:59286` | Filter controls, daily revenue, order cards, and detail panel are mixed in one large render path. Status colors are local to the component. |
| Inventory | `WarehouseImportView`, `WarehouseDispatchView` | `src/App.jsx:48740`, `src/App.jsx:51500` | Import/export/stock sections use different border, radius, and empty-state treatments. Dense grids need a shared data-surface treatment. |
| Customer | `CustomerCRMView` | `src/App.jsx:64134` | Customer overview and detail views use local card styles and repeated empty states. Mobile/desktop presentation is not explicitly expressed by shared module classes. |
| Supplier | Supplier-linked customer/import surfaces | `src/App.jsx:64134`, `src/App.jsx:48740` | Supplier relationships are represented inside existing customer/import views; they do not have a shared status/data presentation layer. |
| Debt | `DebtManagementView` | `src/App.jsx:72846` | Debt summary, orders, and payments use multiple local red/blue/green styles. Status semantics are not centralized at the presentation layer. |

## Findings

### High

| ID | Location | Finding | Impact | Recommended presentation fix |
| --- | --- | --- | --- | --- |
| P23-H01 | `src/App.jsx:61505-61630` | Orders filter/revenue/list surfaces have no common module wrapper or sticky toolbar contract. | Users lose context while scrolling long order lists; visual hierarchy varies by viewport. | Add a shared premium data-module wrapper and scoped sticky toolbar/data-surface classes without changing filter state or handlers. |
| P23-H02 | `src/App.jsx:50800-51172` | Inventory sections use several local card/grid patterns and separate empty-state markup. | Warehouse users must scan inconsistent surfaces; dense rows are harder to compare. | Normalize presentation wrappers, row dividers, status tones, and mobile overflow behavior. |
| P23-H03 | `src/App.jsx:73376-73589` | Debt summary and transaction blocks use ad-hoc status colors and repeated card styles. | Debt status is visually inconsistent and can increase scanning errors. | Apply a presentation-only status badge/tone map and shared debt data-surface styles. |

### Medium

| ID | Location | Finding | Impact | Recommended presentation fix |
| --- | --- | --- | --- | --- |
| P23-M01 | `src/App.jsx:66313-66390` | Customer detail uses local card styles and does not expose a common responsive data-module hook. | Customer cards/details do not share the same responsive rhythm as Orders and Debt. | Add scoped customer module classes and responsive card/table surface styles. |
| P23-M02 | Orders, Inventory, Customer, Debt | Empty states are individually authored (`Chưa có...`) and not consistently actionable. | Empty screens feel like dead ends and have inconsistent spacing. | Use shared premium empty-state presentation while retaining existing actions and text meaning. |
| P23-M03 | Orders, Inventory, Customer, Debt | Loading/skeleton presentation is not consistently visible at module level. | Slow reads provide inconsistent feedback. | Add a reusable presentation skeleton class/component only where existing loading state is already available; do not add new data requests. |
| P23-M04 | `src/App.jsx` throughout module ranges | Status labels and tones are local to each module. | Equivalent states can appear with different colors. | Centralize display metadata in a pure helper; do not alter stored status values. |

### Low

| ID | Location | Finding | Impact | Recommended presentation fix |
| --- | --- | --- | --- | --- |
| P23-L01 | `src/index.css` and module JSX | Repeated radius, shadow, border, and spacing utility combinations. | Minor maintenance cost and visual drift. | Add narrowly scoped premium data tokens/classes rather than broad global overrides. |
| P23-L02 | Data lists | Desktop/table and mobile/card behavior is implicit in existing utility classes. | Responsive intent is difficult to audit. | Add explicit responsive classes and verify at the required widths. |

## Invariants To Preserve

- Existing handlers, state variables, Firestore reads/writes, API calls, payment flows, and permissions remain unchanged.
- Existing stored status values remain unchanged; only their display label/tone may be normalized.
- Existing filter semantics, sort order, selection behavior, and empty-state actions remain unchanged.
- No new feature, schema field, migration, or network request is required for this phase.

## Validation Baseline

The repository already exposes these checks and they must be rerun after the presentation changes:

- `npm run build`
- `npm run test:design-system`
- `npm run test:kpi`
- `npm run test:all`

The current KPI gate treats missing physical-device logs as a warning, not a production blocker. Device-only FPS/RAM validation cannot be claimed from static CI output alone.

## Runtime Verification Limitation

The local preview was not navigated during this audit because the available browser tool rejected the local preview URL under its browsing policy. The final report must distinguish static/build/test validation from physical-device visual validation and list any remaining manual checks honestly.

## Audit Conclusion

The data modules are functionally present and should be stabilized through shared, scoped presentation primitives. The safest implementation is additive CSS/helper work plus small `className`/wrapper changes in the existing module returns. No business-logic refactor is warranted for this sprint.
