# Premium Phase 2.2 Navigation Audit

## Scope

Presentation-layer audit for the staff application shell. Business logic, permissions, Firebase, API, payment, QR, webhook, and stored data are out of scope for modification.

## Current Structure

- `MainAppView` owns the active tab and keeps the existing `setActiveTab` history behavior.
- `renderHeader` renders the page header and delegates search/filter actions to the existing module state.
- `footerNavItems` derives the mobile navigation from permission-filtered items and per-account usage.
- `desktopSidebarItems` derives the desktop/tablet navigation from the same permission-filtered source.
- `HDNavigation` contains three presentation variants: mobile bottom navigation, tablet rail, and desktop sidebar.
- Notification filtering already derives the active module context through `filterNotificationsForActiveTab`.

## Findings

| Severity | Area | Finding | Impact | Planned presentation-only fix |
| --- | --- | --- | --- | --- |
| High | Desktop navigation | The sidebar renders one long flat list with no semantic groups or collapse state. | On large screens, users scan too many items and the content area loses usable width. | Add grouped visual sections, a local collapse toggle, and compact labels while preserving the same permission-filtered items and handlers. |
| High | Responsive navigation | Tablet rail and desktop sidebar repeat the same navigation markup. | Visual behavior can drift between breakpoints and maintenance is harder. | Share a presentational item renderer and add consistent active/badge styles without changing navigation state. |
| Medium | Header | Header actions are module-aware but the shell does not expose a consistent breadcrumb/context treatment. | Location in the app is less obvious on desktop and action spacing varies by module. | Add a compact context/breadcrumb line on desktop and normalize action sizing; keep existing search/filter handlers. |
| Medium | Search | Existing search is module-local and opens from the header. | There is no lightweight global shell affordance for recent/empty/loading presentation. | Add a presentation layer for shell search states and route selection through existing `setActiveTab`; do not alter module queries. |
| Medium | Notifications | The center already filters by active module, but the dialog lacks compact unread/read filters. | Users cannot quickly focus on unread notifications in the current context. | Add local view filtering and unread styling using the existing notification collection and click handler. |
| Low | Mobile navigation | Bottom navigation is permission- and usage-aware, but active state and overflow treatment are visually basic. | The footer works but does not communicate the premium hierarchy consistently. | Add compact active indicator, safe-area styling, and accessible labels without changing item ordering rules. |
| Low | Accessibility | Navigation items do not expose a consistent tooltip/expanded label strategy when compact. | Collapsed desktop/rail navigation needs a clear accessible name. | Add `aria-label`, `title`, and expanded-state attributes to navigation buttons. |

## Invariants

- `tabPermissions` remains the source of truth for visibility.
- Existing `setActiveTab` is retained for all navigation clicks.
- Existing notification context filtering and notification click routing are retained.
- No Firestore/API/payment/QR/webhook code is changed by this sprint.

## Baseline Verification

The preceding dashboard sprint passed the production build and regression scripts. Phase 2.2 will rerun those checks after the presentation changes.
