# Phase 2A Regression Report

2026-10-02 to 2026-10-03. Phase 1 source guards and product footer fix preserved byte-for-byte (SHA-256 checks in eight focused tests). No application business handlers, transactions, queue semantics, stock/pricing/unit formulas, permissions, Firebase schemas or production runtime files changed.

## Focused Storage Tests

`node --test tests/phase2a-preview-storage.test.mjs tests/phase1-hidden-report.test.mjs`: 14/14 passed on final source, including all eight Phase 2A cases and six inherited Phase 1 patch cases.

Covered: exact JSON/key-order/escaping/undefined omission; create/edit/restart for requests, imports, dispatches, products, customers, payments; linked import/expense transaction; deletion; snapshot clone isolation; duplicate disk-write suppression with notifications retained; removed durable value forces rewrite; rejected storage failure with identical retry; interrupted multi-collection callback leaves disk unchanged; malformed startup and malformed sync preserve baseline fallback behavior; external reload invalidates cache and retains foreign tenant records.

Tests compare actual old/new mock APIs, not only serializer strings. The frozen baseline source/seed under test-results/phase2a-baseline is required; it is a local ignored audit artifact, not a production dependency.

`node scripts/test-phase2a-browser-recovery.mjs`: final source and frozen baseline both pass real Chrome localStorage assertions with full audit fixtures. Seven collections create/edit/linked transaction state recover identically after page reload; injected QuotaExceededError rejects without changing the durable snapshot, an identical retry persists, and interrupted transaction data is absent after restart. The first test-server setup had an optimizer/watcher shutdown stall; no-discovery/no-watch isolated configuration completed with exit 0. Browser recovery is storage API acceptance, not the app UI or real stock ledger.

## Preserved Failure Semantics and Known Limits

- setItem failure still rejects before emit/broadcast; synchronous durable write has not been deferred/coalesced behind UI acceptance.
- Cached representation never certifies persistence. The final duplicate optimization checks both the last accepted serialized value and the currently stored identical value; normal changed writes do not incur a full-store read first.
- Multi-collection transactions still persist one snapshot after the callback succeeds. Interrupted callback stores no partial disk snapshot. The existing mock mutates in-memory state before persistence (including a standalone failed setDoc) and during callbacks, with no rollback/isolation for failed/concurrent callbacks. Disk failure parity is not in-memory rollback correctness; this pre-existing mock limitation is not silently labeled production transaction correctness.
- Malformed startup still warns and falls back to seed; malformed sync still warns and leaves memory unchanged. Corruption is not repaired by pretending seed is company data.
- Cross-tab events still reload the entire legacy snapshot. Concurrent writers without event processing can still overwrite each other's stale snapshots in the original mock; no new multi-tab merge guarantee is claimed.
- Production queue retry, stale ACK prevention, actor/tenant scope and read-back are unchanged and checked by the existing test suite; a mock receipt is never a server ACK.

## Application Regression Boundary

Browser action harness uses the existing large fixtures and isolated preview save assertions. It covers request create, product create/search/archive and import-with-expense; request price edit/reopen, product edit/reopen, valid dispatch save/reopen and complete stock values are not all newly covered end-to-end. Six-dataset mock create/edit/restart tests are storage parity, not a replacement for those business workflows.

Customer/payment storage API parity is covered; real customer/payment UI saves and server acknowledgement are not measured in this phase. No private customer records, tokens, biometric secrets or production storage values were read.

Do not count opening timings, successful builds, serializer equality or isolated mock APIs as complete business-regression PASS. Report final measured latency increases rather than guessing system variance. No Phase 2B authorization is implied.

## Final Runs and Checks

- Primary matched UI runs `phase2a-final-before` / `phase2a-final-after`: 210 samples each, zero failed actions, zero page errors, fixture counts equal. CPU1x/3x/6x, five repetitions, fixed advancing 2026-10-02 calendar, same full fixtures and instrumentation. Details and latency increases are in PHASE2A_STORAGE_REPORT.md.
- Supplemental dispatch runs `phase2a-dispatch-before` / `phase2a-dispatch-after`: BOTH exit 1 after 22 samples at CPU6x. Same assertion: `Double click must issue exactly one operation`, observed 0 instead of 1 simulated authoritative operations. No page errors. The form-reset timing (2754.2 / 2591.3 ms) is NOT evidence of a confirmed dispatch; exclude it from successful save comparisons. This failure exists on the immutable baseline and remains unresolved. Whether the app took an alternate local path or the harness missed the operation has not been established; do not claim a newly introduced storage bug or duplicate-safe backend success. No further CPU3x/1x dispatch-save coverage follows after the failed assertion.
- Native Chrome localStorage recovery: baseline and final both PASS, full fixture, reload identity and durable failure/retry assertions. VM focused tests: 14/14 PASS.
- `npm run test:all`: exit 0, including production queue/failure/stale-revision and business regression tests already in the repository. This is not Firebase staging or phone acceptance.
- `npm run lint`: exit 0. Explicit extra ESLint for mock, serializer, new storage harness/tests/scripts and modified action runner: exit 0.
- `npm run typecheck`: exit 0 (repository payroll TypeScript scope only).
- `npm run build`: exit 0, Vite production build; no deployment.
- `git diff --check`: exit 0, only existing LF/CRLF warnings. Phase 1 App/CSS SHA-256 matches starting hashes exactly.

## Acceptance Gate

BLOCKED, not a full regression PASS. Storage API compatibility is demonstrated for tested cases; full application create/edit/reopen and stock/payment acceptance is incomplete and the supplemental dispatch assertion fails on both builds. Cold API first-write wall time also increased 10.75 -> 12.15 ms, while CPU6x product create increased 4295.8 -> 4535.8 ms despite reduced stringify; no proven causal decomposition of the UI increase. No substantial CPU3x save increase is observed in this final pair, but that does not override missing acceptance.

No fake ACK, deferred durable-write success, backend/schema/business-handler change, migration, real-company writes, staging, push or deploy. All inherited changes retained. Phase 1 remains BLOCKED; Phase 2B not started.

PHASE 2A STATUS:
BLOCKED
