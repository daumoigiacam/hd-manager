# HD CONNECT Premium Phase 2.5
## Visual Polish Audit

**Date:** 2026-08-01  
**Scope:** Presentation layer only; audit performed before implementation

## Summary

The previous phases established a token-backed design-system foundation, AppShell, shared controls, premium dashboard/data styles, and responsive navigation. The remaining visual inconsistency is concentrated in the legacy compatibility stylesheet and feature-level utility classes. The business module still lives largely in `src/App.jsx`; this audit therefore prioritizes safe global polish at the design-system layer instead of rewriting feature markup.

## Findings

| Severity | Location | Finding | Effect | Treatment |
| --- | --- | --- | --- | --- |
| High | `src/index.css` (legacy compatibility rules) | Many literal radii, shadows, weights, spacing values, and saturated colors coexist with token rules. | Cards, chips, dialogs and legacy surfaces can feel visually inconsistent. | Add a scoped premium polish compatibility layer that maps common surfaces to existing design tokens without changing layout or behavior. |
| High | `src/design-system/foundation.css` | Typography tokens exist, but body/heading rhythm and text-density defaults are not fully normalized. | Dense screens can feel heavier than an enterprise UI. | Refine line-height, weight, letter-spacing and heading margins at the shared shell boundary. |
| Medium | `src/index.css` and `foundation.css` | Glass/backdrop rules are present in multiple areas, and some surfaces have heavier shadows than the intended premium direction. | Visual depth is not consistently subtle; excess blur can affect low-end devices. | Limit glass to header/sidebar/hero/floating panels and use XS/SM/MD elevation tokens elsewhere. |
| Medium | `src/design-system/foundation.css` | Radius tokens exist, but legacy values range from small custom radii to large rounded panels and pills. | Buttons, inputs, cards and badges do not always share one visual language. | Define semantic component radius aliases and use them in shared primitives/compatibility selectors. |
| Medium | `src/App.jsx` | Lucide icons are used consistently as a family, but feature markup still controls size/alignment locally. | Icon visual weight can drift between modules. | Add global icon sizing/alignment rules for shared shell and component-library surfaces; retain existing icon family. |
| Low | `src/index.css` | Existing reduced-motion handling is present, but premium motion tokens are not applied to every legacy surface. | Some interactions can have different transition timing. | Normalize only shared interactive surfaces; preserve feature-specific transitions where needed. |
| Low | Device validation | Static source/build checks cannot prove exact iPhone/Android physical rendering, keyboard behavior, or 120Hz motion. | Real-device visual confidence remains incomplete. | Run the existing automated suite and record physical-device validation as a residual risk. |

## Protected Invariants

No changes are permitted to Firebase, Firestore, Authentication, API contracts, VPS/deployment, SePay, QR, webhook, permissions, business logic, calculations, persistence, or stored data.

## Planned Safe Changes

- Refine existing design tokens rather than introducing a second theme.
- Add semantic typography, radius, glass and elevation aliases.
- Add one scoped compatibility layer under the shared enterprise shell.
- Keep tables/forms/data lists free of blur and soft-3D effects.
- Keep motion short and disable/reduce it under `prefers-reduced-motion`.
- Keep the existing Lucide icon library and shared icon sizing contract.

## Validation Plan

1. `npm run build`
2. `npm run test:design-system`
3. `npm run test:kpi`
4. `npm run test:all`
5. `git diff --check`
6. Review the diff for presentation-only changes.

## Audit Conclusion

Phase 2.5 can be delivered safely as a design-token and compatibility-layer polish. A full replacement of every legacy CSS declaration in `src/index.css` would be a large architectural rewrite and is intentionally excluded from this focused visual pass because it could alter module layout and behavior.
