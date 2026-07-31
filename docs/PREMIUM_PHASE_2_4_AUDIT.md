# HD CONNECT Premium Phase 2.4
## Component Library Audit

**Audit type:** Static presentation-layer audit before implementation  
**Date:** 2026-08-01  
**Scope:** React/Vite component and style layer only

## Executive Summary

The repository already has a design-system foundation and an Enterprise AppShell from the previous UI phases. The current component library is not yet complete enough to be the single source of truth for all controls: it exposes `HDCard`, `HDButton`, `HDField`, `HDDialog`, and `HDStatusState`, while most feature screens still render native controls directly inside the large feature module `src/App.jsx`.

This audit is intentionally written before code changes. No business logic, Firebase configuration, API contract, payment flow, webhook, permission, database structure, or stored data is changed by this audit.

## Findings

| Severity | Location | Finding | Performance/UI impact | Recommended treatment |
| --- | --- | --- | --- | --- |
| High | `src/App.jsx` (77,131 lines) | Feature screens and presentation markup are concentrated in one monolithic module. | Makes global control consistency difficult and increases regression risk when styling controls in place. | Add presentation-only primitives and migrate shared visual shells first; leave data handlers in the feature layer. |
| High | `src/App.jsx` | Static scan found approximately 781 native `<button>`, 425 `<input>`, 114 `<select>`, and 9 `<table>` tags. | Different controls can have different height, focus, disabled, loading, and touch-target behavior. | Provide compatibility classes and typed primitives for incremental migration. |
| High | `src/design-system/components.jsx` | The library has no first-class Input, Select, Badge, Table, Toast, Skeleton, or Progress components. | New screens can bypass the design system and recreate UI patterns. | Add reusable, presentation-only components with token-backed CSS. |
| Medium | `src/design-system/foundation.css` | Existing Button API covers only primary, secondary, danger, and ghost variants. | Warning/success/text/icon/loading states are not represented consistently. | Extend variants without changing existing class names or event behavior. |
| Medium | `src/design-system/foundation.css` | Existing dialog and field styles are good foundations but do not expose a complete validation/input API. | Error and focus states can vary in feature forms. | Add `HDInput`/`HDSelect` wrappers and validation styles. |
| Medium | `src/design-system/icons.js` | A shared icon-size contract exists, while feature code imports Lucide icons directly. | Icon sizing can drift across new controls even though the icon family is consistent. | Keep Lucide as the single icon family and expose shared size/touch helpers; do not rewrite business screens in this phase. |
| Medium | `src/App.jsx` and module-specific CSS | Data modules use a mixture of legacy utility classes and premium data classes. | Tables/cards may not share the same empty/loading/status language. | Normalize shared presentation classes and add library primitives for future migration. |
| Low | `package.json` | No dedicated lint script is configured. | Static UI lint cannot be reported as PASS through npm. | Preserve package surface; report lint as not configured unless a non-invasive existing tool is available. |
| Low | Browser/device validation | The repository can be built and scripted, but physical Android/iOS/tablet visual validation is not available from static source inspection alone. | Safe-area and keyboard behavior still need real-device confirmation. | Run build and existing test suites; list real-device validation as residual risk. |

## Existing Strengths

- `src/layout/AppShell.jsx` centralizes the shell structure.
- `src/design-system/foundation.css` already defines typography, color, spacing, radius, elevation, motion, focus, dark-theme, and safe-area tokens.
- `src/design-system/icons.js` defines a shared icon-size contract.
- Existing dialog body scrolling and sticky header/footer patterns are tokenized.
- Previous premium navigation and data-display work is preserved.

## Invariants for Phase 2.4

The implementation must not modify:

- Firestore/Firebase initialization, rules, collections, or stored documents.
- Authentication, roles, permissions, SePay, QR, webhook, or payment reconciliation.
- Business calculations, report aggregation, or domain state transitions.
- API payloads, persistence handlers, or navigation destinations.

## Validation Plan

1. Extend the shared component API and token-backed CSS only.
2. Preserve existing class names and DOM semantics where feature code already depends on them.
3. Run `npm run build`.
4. Run `npm run test:design-system`, `npm run test:kpi`, and `npm run test:all`.
5. Review the final diff for presentation-only changes and confirm no production push/deploy is performed.

## Audit Conclusion

The component system needs a focused additive implementation. A literal 100% JSX migration of a 77k-line feature module in one pass would create unnecessary regression risk, so Phase 2.4 should establish the complete reusable library and migrate shared presentation surfaces incrementally. Remaining native feature controls are tracked explicitly in the final report rather than being hidden behind an inaccurate completion claim.
