# Order request previous-order suggestions

## Scope

- Suppress successful save/edit/deposit/approval/delete/share/download notices in Order Requests. Retain errors, permissions, validation and save guards.
- Quick suggestions contain only active products from the latest non-cancelled order strictly before today's working date, scoped to customer, company and branch. If yesterday has no order, use the latest earlier order. No prior order means no quick suggestions; the + catalog remains available.
- Preserve that order's size, attribute, price, ordering unit and pricing unit. Do not copy quantity or payment/stock data. Clear draft products when switching customer or branch on a new order.
- Remove OrderRequestView's competing asynchronous preference reads and post-save preference/customer-default writes. Shared services and historical customer configuration remain intact for other workflows.
- Do not construct catalog variants until + is opened. Memoize previous-order selection independently of typing quantities.

## Verification

- Full test:all: exit 0; existing final core suite 436 passed, 1 skipped.
- Targeted previous-order, picker, customer-memory and smart-ordering tests: exit 0. Includes tenant/branch/cancellation exclusions, last-order-only selection, multiple sizes, zero-price field preservation and no mutation of history.
- Order request UX suite: 34 passed. Updated assertions explicitly cover the new requested behavior instead of legacy memory writes.
- Lint, typecheck, production build and Firebase-only bundle verification: passed.
- Browser: isolated production preview, CPU3x, 4,502 order requests; external requests blocked. Screens at 390x844 and 1280x844. Both passed.
- UI verified only the previous product appears before +; catalog is accessible with +; selecting a historical 2kg/50,000 item overrides conflicting configured 9kg/90,000 defaults; quantity entered manually; saved values survive reload; customer defaults unchanged. Share invocation verified with a stubbed native share API and no success banner.

| Width | Customer input | Select customer to suggestions | Save click to form closed |
| --- | ---: | ---: | ---: |
| 390 | 50.6 ms | 72.0 ms | 319.9 ms |
| 1280 | 50.0 ms | 75.1 ms | 314.2 ms |

Evidence: test-results/previous-order-visual/results.json, suggestions-390.png, suggestions-1280.png; previous-order-tests.log, previous-order-regression.log, previous-order-lint.log, previous-order-build.log.

## Limits

These are individual automated preview samples, not real phone or Firebase ACK measurements. No claim of zero lag on every device. Suggestions use the tenant-scoped order history provided to the view; unavailable history is not fabricated from customer configuration. No production records changed. No push, deployment or APK rebuild in this task.
