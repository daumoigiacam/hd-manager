# HD Manager: acceptance evidence, 30 September 2026

## Decision

**Partial PASS. Full-app production acceptance remains OPEN.**

Tests below were actually executed. A successful UI/mock test is not a claim
that all Firebase operations, external sharing receivers or native APK functions
complete within one second. No production records, rules or indexes were changed.

## Measured speed and correctness

| Environment / operation | Result | Evidence |
| --- | --- | --- |
| Desktop Chrome, 6,000 orders + 3,000 payments + 1,200 customers | Navigation 30-294 ms | acceptance-scale10.log |
| Android Pixel 8 emulator, Chrome, development server | First Order Requests navigation 2,399 ms: FAIL | acceptance-android.log |
| Same Android emulator, optimized build, 10 navigations | 160-275 ms: PASS under 1,000 ms | acceptance-android-optimized.log |
| Same Android emulator, optimized build, edit request price | 613 ms: PASS | acceptance-android-save.log |
| Same Android emulator, optimized build, create request form | 710 ms: PASS | acceptance-android-save.log |
| Desktop optimized build, edit/create | 94 / 55 ms | acceptance-optimized-save.log |

All timings use local synthetic Firebase data. Navigation is click to two
animation frames; save timing is click to form closure. The save test separately
waits for the persisted record, verifies the edited unit price, verifies exactly
one created request, reloads, and compares both saved item arrays. This checks
local persistence, NOT production server acknowledgement. No arbitrary sleeps
were added to application save paths.

The development-build outlier disappears on the optimized build. This comparison
does not isolate individual compiler, module-fetch and render costs and is not
proof that a production slow device can never exceed one second.

## Executed acceptance checks

All logs are in `test-results/` with prefix `acceptance-`.

- `order-request-save`: edit and create, plus new persistence/reload assertions.
- `order-create-fab`: order creation entry point.
- `employee-create-fab`: add form, settings, departments/holidays, full-page
  employee profile and fixed save bar.
- `customer-create`: customer creation UI.
- `product-editor`: product create/edit UI.
- `customer-supplier-directory`: customer/supplier tabs and layout.
- `finance-summary`: daily income/expense summary UI.
- `delivery-redesign`: restored legacy delivery UI.
- `messaging-redesign`: messaging list, filters and conversation UI.
- `global-search.keyboard`: search interaction/focus at 320, 390, 768, 1366 px.
- `business-report`: report UI and period/navigation checks across configured
  viewport sizes, including 320-768 px and desktop branch.
- `npm run test:all`: existing functional suite PASS.
- Firestore Emulator tenant rules: **14/14 PASS**.
- Firestore Emulator payroll rules: **19/19 PASS**.
- ESLint PASS.

The Firestore tests use a demo project and test-loaded rules. Expected
PERMISSION_DENIED logs are negative authorization tests, not failures. The normal
emulator config hit a Java non-ASCII-path issue; `tests/firebase-acceptance.json`
avoids passing that path to Java, while the test loads the actual repository
rules using initializeTestEnvironment. No rules were weakened.

## Defect fixed in this acceptance run

The employee settings modal could be covered by the footer after opening the
department section. Only main containing an active ARIA modal now rises above
navigation. Ordinary employee/order/product screens do not rise above it.
Re-tested department/holiday actions, profile, and normal navigation.

Stale tests were corrected rather than restoring removed UI: employee selector
now excludes a hidden chart node; messaging filter uses an exact accessible
name; global search starts from Customers because Home intentionally has no
search icon; company name assertion uses the current greeting markup.

## Still required before a full-app PASS

- Actual cloud request/TTFB/database duration and save acknowledgements under
  slow/offline/reconnect conditions for every save flow.
- Native testing of the exact cloud release binary. A debug preview APK was
  tested subsequently (see below); it is not the release binary.
- End-to-end external share delivery (receiver can reject/cancel independently).
- Double-submit and simultaneous-user cases for every financial/identity flow;
  existing regression coverage does not prove every UI path.
- A documented representative production dataset/device/network performance
  envelope; a local synthetic dataset is not sufficient for universal guarantees.

## Files changed during this acceptance run

- `src/design-system/foundation.css`: active modal layering fix.
- `tests/visual/navigation-performance.audit.mjs`: Android CDP support,
  local-origin guard and explicit sub-second gate.
- `tests/visual/order-request-save.visual.mjs`: Android support, isolated fixture,
  one-second gate, stored-record and reload assertions.
- `tests/visual/employee-create-fab.visual.mjs`: visible employee-card locator.
- `tests/visual/messaging-redesign.visual.mjs`: exact unread filter locator.
- `tests/visual/global-search.keyboard.visual.mjs`: current search entry point.
- `tests/visual/business-report.visual.mjs`: current company-name markup.
- `tests/firebase-acceptance.json`: isolated emulator invocation config.

Prior worktree edits have been preserved. No commit, push or deployment was
performed in this run.

## Additional native and backend verification

- Built and installed a debug preview APK on read-only Pixel_8 Android emulator.
  Native header/system-back smoke test PASS. WebView 133.0.6943.137.
- Native footer navigation: 12 samples, 20-178 ms in the first successful run.
  This uses programmatic DOM clicks and two animation frames with isolated
  preview fixtures, not production data or a physical touch latency measurement.
  Repeat log: `test-results/native-navigation-raw.log`.
- Cold Android Activity starts: 1416 ms and 940 ms. These are OS Activity timings,
  not complete data-ready timings. The universal sub-second target is NOT PASS.
- Crash buffer was empty when inspected. This does not establish long-term
  crash freedom. Playwright's browser-context API is unsupported by this WebView;
  native verification used the existing raw-CDP scripts instead.
- New `tests/firestore-save-acceptance.test.mjs`: actual Firebase SDK writes and
  independent server reads across 10 collections, three create/edit pairs each,
  PASS against isolated Firestore Emulator and repository security rules.
- Offline double edit retained the latest revision; remote acknowledgement did
  not occur while offline; another SDK client read the latest value after reconnect.
  Cross-tenant write denial PASS. Evidence: `test-results/firestore-save-acceptance.json`.
  This tests SDK/backend behavior, not every application queue or UI offline flow.
- No production data or secrets were used. The APK is preview-only and must not
  be distributed as a cloud release. Cloud web assets are rebuilt and synced back
  after testing; the installed preview APK is not a deliverable.

Overall verdict remains PARTIAL PASS. iPhone Safari/WebView, production network
latency, exact signed release APK, complete financial double-submit/concurrency
and recipient-side sharing remain unverified. No claim of full-app acceptance.
