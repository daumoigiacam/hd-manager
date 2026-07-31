# HD CONNECT Premium Experience - Phase 2.1 Dashboard Audit

## Scope

Phase 2.1 audits the executive Dashboard presentation only. The following areas are explicitly out of scope and must remain unchanged:

- Firebase, Firestore, Authentication, API, VPS, SePay, QR and webhook flows.
- Permissions, business workflows, formulas, data structures and dashboard snapshot calculations.
- Navigation behavior and all non-dashboard modules.

## Current Architecture

- Dashboard data is assembled by `buildExecutiveDashboardSnapshot` and memoized inside `ExecutiveDashboardView`.
- Presentation is rendered by `ExecutiveDashboardView` and the local helpers `ExecutivePeriodSummaryCard`, `ExecutiveKpiCard`, `ExecutiveSectionCard`, `ExecutiveMetric` and `ExecutiveTopList`.
- The shared token foundation is already available in `src/design-system/foundation.css`.
- Owner and accounting accounts use the executive dashboard; other roles continue to use their existing role-specific home screens.

## Baseline Findings

| Priority | Area | Finding | User impact | Planned presentation fix |
| --- | --- | --- | --- | --- |
| High | First impression | The hero uses a heavy full-width gradient and decorative blur shapes without a clear executive information hierarchy. | The first screen feels visually dense rather than calm and premium. | Replace it with a restrained executive masthead, clear company identity, data freshness and a compact inbox action. |
| High | Responsive layout | Content remains a vertically stretched mobile stack on wide desktop screens. | Desktop wastes space and does not feel like enterprise software. | Add a centered responsive canvas, adaptive section grids and a controlled maximum reading width. |
| High | Visual consistency | Dashboard cards use several unrelated radius, shadow, border and background combinations. | The screen appears assembled from different UI generations. | Introduce semantic dashboard classes backed by shared design tokens. |
| Medium | Financial table | The overview table uses tightly packed values and weak row hierarchy. | Financial scanning is slower, especially on small phones. | Improve tabular typography, row rhythm, sticky visual header and responsive density without changing columns or values. |
| Medium | Navigation tabs | Tabs look like independent pills floating in a large white panel. | They consume space and reduce the executive feel. | Use a compact segmented control with clear selected state and horizontal overflow safety. |
| Medium | KPI hierarchy | KPI titles, values and comparison badges compete for attention. | Important values are not immediately distinguishable. | Strengthen value hierarchy and tone indicators while reducing decorative noise. |
| Medium | Empty states | Empty states are plain text blocks with inconsistent surfaces. | Empty data appears unfinished. | Standardize lightweight, helpful empty states using existing icons and copy. |
| Medium | Charts | Bar charts rely on saturated red/green blocks and minimal context. | Charts feel utilitarian and visually abrupt. | Use restrained enterprise colors, grid context and token-based surfaces; preserve data and scale. |
| Low | Motion | Hover translation and shadows vary between components. | Interaction feedback feels inconsistent. | Normalize transitions to 150-200 ms and disable movement under reduced-motion preference. |

## Performance Baseline

The latest successful Phase 1 production build produced:

- Main JavaScript bundle: about 2,093.51 kB, gzip about 539.59 kB.
- Main stylesheet: about 1,251.99 kB, gzip about 117.80 kB.

Phase 2.1 must not add new runtime dependencies or modify the dashboard snapshot calculation. Presentation changes will use CSS and existing icons so bundle impact remains negligible.

## Acceptance Criteria

- Dashboard immediately communicates premium enterprise quality on phone, tablet and desktop.
- Data order, values, calculations, permissions and actions remain identical.
- No new dependency and no new network request.
- Build, regression, design-system and KPI checks pass.
- The Dashboard is assessed against Premium, Enterprise, Apple-inspired, Minimal, Fast, Smooth, Consistent, Easy to Use, Beautiful and Platform-ready criteria.

