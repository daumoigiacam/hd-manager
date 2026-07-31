# UI-003 - Enterprise AppShell & Design System

Date: 2026-07-31
Scope: UI architecture only. Business logic, Firebase, Firestore, Authentication, permissions, API, SePay, QR, webhook, calculations and persisted data were not changed.

## 1. AppShell Architecture

Added shared layout primitives in `src/layout/`:

- `AppShell`: owns the common application root boundary and forwards the root ref used by the existing quick-action button.
- `HDHeader`: shared semantic header primitive for the staff shell, order detail, add-order flow, customer portal and login shell.
- `HDNavigation`: shared navigation container for the staff shell.
- `HDBottomNavigation`: shared bottom navigation primitive for phone and customer portal navigation.
- `HDNavigationRail`: tablet navigation rail.
- `HDSidebar`: desktop navigation sidebar.

The staff root, customer portal root and login root now use `AppShell`. Existing content, handlers and navigation item calculations remain in `App.jsx`.

## 2. Design System Architecture

Added `src/design-system/` with reusable token modules:

- `colors.js`
- `spacing.js`
- `typography.js`
- `radius.js`
- `elevation.js`
- `motion.js`
- `breakpoints.js`
- `density.js`
- `responsive.js`
- `safe-area.js`
- `icons.js`
- `tokens.js`
- `index.js`

Added `src/theme/index.js` with light, dark and high-contrast theme names. The dark and high-contrast classes are architecture-ready and are not enabled by default.

## 3. Responsive Matrix

| Width | Navigation | Header target | Data layout |
|---:|---|---:|---|
| 320-359 | Bottom navigation | 52px | Card/content flow |
| 360-599 | Bottom navigation | 56px | Card/content flow |
| 600-767 | Navigation rail | 60px | Compact content |
| 768-1099 | Navigation rail | 60px | Compact/table-ready content |
| 1100-1439 | Desktop sidebar | 64px | Desktop content |
| 1440+ | Desktop sidebar | 64px | Wide desktop content |

The existing mobile shell remains the source of truth for phone behavior. The tablet rail is enabled only between 600px and 1099px. Desktop sidebar behavior remains enabled at 1100px and above.

## 4. Safe Area Verification

The new shell uses the existing safe-area variables and preserves the established `hd-safe-header`, `pb-safe`, viewport and keyboard rules. No system status bar, gesture area, notch or Dynamic Island is rendered over by the new primitives.

Dialog primitives retain a bounded height, independently scrollable body and non-scrolling header/footer behavior through the shared `.hd-dialog-*` rules.

## 5. Design Tokens

The token layer covers colors, spacing, typography, radius, elevation, motion, breakpoints, density and safe-area values. Existing CSS variables are reused where they already exist so the UI does not receive a second conflicting spacing system.

## 6. Screens and Components Updated

- Staff application root shell.
- Staff global header variants, including search header.
- Staff phone bottom navigation.
- Staff tablet navigation rail.
- Staff desktop sidebar.
- Customer portal root, header and bottom navigation.
- Login/register root shell.
- Order detail header.
- Add-order header.
- Existing dialog body/footer layout rules were retained and shared through the shell selector.

## 7. Business Regression Safety

No data access, state calculation, event handler, Firebase call, API call, payment flow, QR generation, webhook processing, role/permission check or business formula was modified. The JSX changes only replace structural tags with equivalent layout primitives and preserve existing class names.

## 8. Validation Results

| Check | Result | Notes |
|---|---|---|
| `npm run build` | PASS | Vite production build completed successfully. |
| `npm run test:all` | PASS | AI/Zalo tests and stress suite passed; 11,309 operations. |
| `npm run test:kpi` | PASS | Device benchmark log is optional and reported as warning. |
| `git diff --check` | PASS | No whitespace errors. |
| `npm test` | NOT CONFIGURED | The repository has no `test` script. |
| `npm run lint` | NOT CONFIGURED | The repository has no `lint` script or ESLint configuration. |

## 9. Responsive Checklist

Static responsive rules were added for 320, 360, 375, 390, 412, 430, 600, 768, 800, 1024, 1280, 1366, 1440, 1600 and 1920px ranges, in both orientations through width-independent grid/flex rules. Physical-device screenshots and Android/iOS system-bar verification still require device or browser automation runs outside this shell.

- [x] Phone bottom navigation is preserved.
- [x] Tablet rail is introduced at the tablet breakpoint.
- [x] Desktop sidebar is preserved and uses the shared sidebar primitive.
- [x] Shell content has minimum-size constraints to prevent horizontal layout collapse.
- [x] Dialog body scroll and footer visibility rules are shared.
- [x] Safe-area and keyboard rules remain active.
- [ ] Full physical-device matrix run.
- [ ] Repository lint command and ESLint baseline.

## 10. Exceptions and Acceptance Status

The UI-003 architecture baseline is implemented and the production build plus existing regression suites pass. The sprint should not be marked as a 100% final acceptance until the two environment-dependent items above are completed: physical-device validation and introduction of a project-approved lint configuration. This report intentionally does not claim those checks were run.
