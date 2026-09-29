# Performance Audit - 2026-09-30

Status: targeted fixes verified locally; full-app production acceptance NOT complete.
No production data, database indexes, Firebase rules or deployment changed.

## Confirmed causes and fixes

1. Navigation hit-testing: the staff shell raised the entire main element to
   z-index 50 whenever employee/order/product add buttons existed. Navigation
   sits at z-index 30. On the Orders screen, main covered the footer and
   intercepted clicks. Chrome reproduced a 5-second click timeout (and an
   earlier 30-second timeout), not a slow API. Removed the main stacking rule.
   Hide duplicate contextual add controls when these screens already have
   their own add button. Keep the actual module add controls.
2. Order editing and invoice-template saving awaited QR/image/native-file cache
   preparation after their data writes. They now start that work immediately
   without waiting for it to finish. Share itself still waits on a cache miss;
   cache failures are recorded and do not falsely turn a saved order into an
   unsuccessful save. No artificial timeout/delay added.
3. Pending-write acknowledgement removed every write with the same document
   key, including a newer edit made during an in-flight write. Each queued
   write now has a revision. Acknowledgements and error updates apply only to
   that revision, including after a tenant switch. A successful flush drains a
   newer revision immediately instead of waiting for the 30-second retry tick.

## Before / after evidence

Environment: isolated Vite preview on localhost:5223, synthetic Firebase data,
Chrome headless, 390 x 844 mobile viewport. Not an Android/iOS device benchmark.
No real customer records were written. Navigation test blocks external traffic.

| Metric | Before | After |
| --- | --- | --- |
| Orders -> More | Click intercepted by main; timed out | Click works |
| Five main tabs, two rounds | Sequence could not finish | 35-143 ms click to two animation frames |
| Edit order-request unit price | No comparable baseline recorded | 112 ms to close editor |
| Render time for that save | Not measured | 55 ms recorded total |
| Mock write acknowledgement | Not measured | 49 ms; one attempt, no retries |
| Save trace duration | Not measured | 50 ms, 1364 payload bytes |
| Actual network/API/DB latency | Not measured | Not measured: mock has no HTTP write |
| Order save dependency | Data/finance writes + share preparation | Data/finance writes; share prepares independently |
| New edit during old acknowledgement | New edit could be discarded | New revision retained and flushed; regression tested |

Some navigation render entries are zero because the existing profiler samples
events; this is NOT proof of zero render work. Two animation frames measure UI
response, not completion of all background data loading.

## Coverage and remaining work

| Area | Checked | Still required |
| --- | --- | --- |
| Shared shell/navigation | Real Chrome clicks across five tabs; footer layering | Real iOS/Android and large datasets |
| Order requests | Edit price; modal text/number keyboard geometry simulation; rotation; restore; trace | Firebase latency, offline/reconnect and concurrent accounts |
| Orders/share | Handler regression: waits for server, does not wait for image warmup | Real OS share receiver, large invoice and payment changes |
| Personnel/products | Navigation and add-button hit testing | Identity-enrollment and edit-save timings against isolated backend |
| Dispatch/inventory | Existing functional suite; shared queue revision test | Actual save/reconnect timing |
| Customers/debt/cashflow | Existing functional suite only | Per-action network and ledger profiling |
| Attendance/payroll/reports | Existing functional suite; source audit only | Large-company render and payroll computation profiling |
| Chat/delivery/settings | Existing functional tests only where present | Per-action save, upload, navigation profiling |

Source risks not represented as measured root causes: App.jsx remains large;
order editing still serially updates loyalty and related accounting records;
personnel edits use direct Firestore writes; shared save has SDK/REST retries;
some refresh paths can query a collection. These require runtime evidence before
changing financial consistency, access-control behavior or indexes.

The performance-suite scale results are simulations, not observed user latency.
Do not use them to claim a full-app sub-second guarantee. Real Safari keyboard,
native WebView, database duration, and full before/after production measurements
remain unverified. No full-app PASS claimed.

## Verification and changed files

- `src/App.jsx`: nonblocking share preparation; revision-safe queue flush.
- `src/utils/pendingWriteRevision.js`: tenant/document/revision comparison,
  with compatibility for persisted legacy writes.
- `src/design-system/foundation.css`: remove footer-blocking stacking rule;
  prevent duplicate add buttons from intercepting clicks.
- `tests/save-critical-path.test.mjs`: five deterministic regressions covering
  server confirmation, pending share work, tenant isolation and concurrent edits.
- `tests/visual/navigation-performance.audit.mjs`: actual click sequence,
  add-button hit testing and timing output; no forced clicks.
- `tests/visual/viewport-save.audit.mjs`: local-date fixture correction so the
  test record is visible in the device-local Today filter.
- `package.json`: include critical-path regressions in existing test command.

Existing payroll-source and account-greeting changes in the worktree were kept.
They are not attributed to this performance change.

Verification commands: `npm run test:all`, `npm run lint`, `npm run build`,
`node --test tests/save-critical-path.test.mjs`, and the two browser audits.
Browser outputs: `test-results/navigation-performance.json`,
`test-results/save-audit-home.png`; full-suite/build logs are under test-results.
