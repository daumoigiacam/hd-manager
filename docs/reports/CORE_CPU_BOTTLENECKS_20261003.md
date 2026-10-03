# Orders and report CPU follow-up

Date: 2026-10-03. Local changes only; no production writes, deployment or push.

## Root causes and changes

- Orders sorted by reparsing dates inside every comparator call. Decorate once with timestamps, then sort with the existing ID tie-break. Original objects and ordering are preserved.
- Empty search still built tied-order search ranks. Skip that work without search tokens.
- Closed add-order wizard still collected imported warehouse dispatch IDs. Build those only while the wizard is open, before its import action becomes available.
- Orders mounted 50 cards per page. Use 20 cards with existing previous/next pagination; total records, filters and financial calculations still use all records.
- Executive report repeatedly scanned the same rows for daily/monthly/yearly totals. Build period buckets once within each synchronous snapshot calculation, retaining original accumulation order and amount getters. Arbitrary date-range calculations are unchanged.
- Dashboard payroll repeatedly scanned orders for each employee/month. Scope an index to one synchronous payroll calculation. No index is retained across saves, account changes or later builds.

## Evidence

Browser: isolated production preview, Chrome headless, 390x844, CPU3x. External network blocked. Fixture adds 600 customers, 3000 orders, 1500 payments, 12 employees and 1 product to preview defaults. Not a real Android device or Firebase ACK measurement.

Readable CPU profile identified date parsing/sorting, order view-model construction, dispatch-ID collection, employee sales summaries and report period scans. Source profiling log: `test-results/core-profile-readable.log`.

| Measurement | Before | After |
| --- | --- | --- |
| Open Orders, action through target visibility and two animation frames | Previously reported 218-236 ms; this turn readable profile 214 ms | 176 ms, repeated 175 ms |
| Home navigation in final targeted run | Not an equivalent paired baseline | 35-78 ms |
| Period-total optimization alone, same existing date/billing caches, Node CPU | 32-45 ms across two four-run checks | 19-23 ms |

Report comparisons assert deep equality with the uncached reference and with the prior period-scan implementation (generated timestamp excluded). The raw uncached 182 ms result is NOT claimed as the previous production performance: it lacks earlier caches as well.

One browser run overlapped the regression suite and showed substantial CPU contention. It was excluded, then repeated alone twice. The unrelated localhost5179 app remained running as requested. Measurements have scheduling variance; these are not statistically established device-wide guarantees.

Navigation readiness uses the target header/report visibility plus two frames, not an assertion that every background calculation has finished. Report CPU is measured separately. Orders remain above 100 ms; instant navigation and absence of every long task are NOT established.

## Verification

- `npm run test:master-performance`: 446 passed, 1 skipped, 0 failed (447 total).
- `node --test tests/core-report-index.test.mjs`: 3 passed, including edits, scoped-cache cleanup, ownership, archived rows, sorting and repayment exclusion equality.
- `npm run lint`: passed.
- Explicit ESLint on changed helpers, report service and measurement tests: passed.
- `npm run typecheck`: passed (repository's configured payroll typecheck scope).
- `npm run build`: passed.
- Targeted navigation preview: passed, no page errors. Previous/next Orders pagination verified ranges 1-20 and 21-40 and unchanged total.
- `git diff --check`: passed, existing line-ending warnings only.

Browser runner has a 180-second overall deadline and bounded waits. No full-app benchmark was run. Logs: `test-results/core-nav-final.log`, `test-results/core-final-pagination.log`, `test-results/core-regression.log`, `test-results/core-final-lint.log`, `test-results/core-final-typecheck.log`, `test-results/core-final-build.log`.

## Remaining limits

The measured redundant work is reduced, not merely deferred. Mounting order cards, view-model construction and browser layout still cost time. Production network/ACK, physical devices and fresh cold startup are not verified by this test. No promise of zero lag on every device. Existing prior local UI, debt and suggestion changes were preserved.
