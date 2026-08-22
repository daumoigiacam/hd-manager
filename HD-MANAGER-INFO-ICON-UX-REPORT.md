# HD Manager Info Icon UX Report

Audit date: 2026-08-22

## Result

`PARTIAL — NOT COMPLETE`

The shared Info Icon interaction and the audited context-help surfaces work locally, but the repository-wide visual QA gate is not complete. The existing visual-QA harness stopped before finishing because it could not find the existing `Tìm chức năng` button after the desktop navigation loop. No change was made to that unrelated harness failure.

## Audit

- Scanned 91 source files under `src/`.
- Identified 34 view functions and 11 named section/card helpers in `src/App.jsx`.
- Found 1,048 raw description-like JSX hits. This is a candidate count, not a unique-message count; it includes status, validation, empty-state, realtime and dynamic data text.
- Moved 5 audited static context-help surfaces to the shared Info Icon: bank payments, report sections, holiday configuration, employee account model and employee sales revenue.
- Kept action guidance, validation, warnings, errors, required financial information, realtime status and dynamic business values inline.
- Full candidate inventory is recorded in `UI_INFO_ICON_INVENTORY.md`. Remaining candidates require page-by-page classification before they can be moved safely.

## Implementation

- Shared component: `SectionInfoHint` in `src/App.jsx`.
- Uses the existing `lucide-react` dependency only for the app icon system; the visible control is plain text and no dependency was added.
- The visible control is now a plain lowercase `i` without a border; keyboard focus uses a subtle underline instead of a surrounding ring.
- Supports hover, click/tap, focus styling, accessible label, `aria-describedby`, tooltip role and `Escape` close.
- Help content is static and local. The component does not call Firebase, an API, a timer or a global event listener.
- Inline action guidance in `WorkflowGuideCard` was deliberately kept visible.
- The employee revenue card now appears immediately below “Tài khoản bộ phận”, uses the shorter “Doanh thu” label, aligns with an interactive month picker, and displays the selected month as `8/2026`.
- Added focused static regression checks in `tests/section-info-hint.test.mjs`.

## Business Safety

- Business logic: PASS for the touched diff.
- Formulas, quantity, weight, price, debt, payment, inventory, payroll and commission logic: unchanged by this UI task.
- Firestore schema and queries/writes: unchanged by this UI task.
- Payment and reconciliation flow: unchanged by this UI task.
- Production data: not written, migrated, reset or deleted.

## Validation

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run test:design-system`: PASS
- `node tests/section-info-hint.test.mjs`: PASS
- `npm run test:all`: PASS
- `npm run build`: PASS; 2,402 modules transformed, built in 12.09s.
- `git diff --check`: PASS with existing LF/CRLF conversion warnings only.

## Browser QA

- Local preview: PASS at `http://127.0.0.1:5174/`.
- Mobile direct QA: PASS for the employee screen. The three audited info icons are visible, the account tooltip opens by tap, its text is readable, and `Escape` closes it.
- Follow-up mobile QA: PASS for the revenue card. The plain `i` has no visible border, the tooltip is fully readable near the viewport edge, the card is directly below “Tài khoản bộ phận”, and the month control displays `8/2026`.
- Desktop responsive screenshot: PASS for the employee screen; titles and icons remain visible without horizontal overflow in the inspected viewport.
- Accessibility spot check: PASS for accessible labels, tooltip role, focus ring and Escape handling on the audited component.
- Fresh reload produced no new console warnings after the interaction. Previously accumulated local warnings were from the unavailable local Firebase/WebChannel and stale release-check context, not from the Info Icon interaction.
- Repository visual QA script `node tests/visual/hd-manager-visual-qa.mjs`: FAIL/blocked by the pre-existing harness lookup for `Tìm chức năng` at `tests/visual/hd-manager-visual-qa.mjs:415`; this prevented full route/viewport coverage.

## Remaining Risks

1. The raw scan still contains description-like candidates that have not all been manually classified and migrated. A mass replacement was intentionally avoided because it could hide required guidance or realtime/status information.
2. Full repository visual QA is not verified until the existing harness navigation lookup is repaired or the same coverage is completed through another non-mutating test path.
3. Native Android status-bar/notification rendering was not part of this local web UI task and was not verified here.

No commit, push, deploy or production-data operation was performed.
