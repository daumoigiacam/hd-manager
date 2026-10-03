# Phase 2A Storage Baseline

2026-10-02. HEAD `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.
Branch `codex/final-22-module-audit-20261002`. Phase 1 remains BLOCKED; its changes are preserved, not reworked.

## Starting Source Fingerprints (SHA-256)

| File | Hash |
| --- | --- |
| src/App.jsx (Phase 1 guard included) | 3C49780AF8105568773D5E2330AA0A7FE8870CA3578A61673468A5CDD378BB32 |
| src/design-system/foundation.css (Phase 1 footer fix included) | B4D3CA7C1E4A5A34F270CBD7AB2DF2BB2F88CBC180C52FA4916B987FBDB020FC |
| src/mocks/firebase-firestore.js | FC6538837348E71EC1EDE2A04AAE6D817BDBFD0A96043EE1D575F648BD773183 |
| scripts/audit-interactions.mjs | 7606A2B301B7648C4E1EBB2431958A00630ED830958ED48AD5A16221CE5CE097 |

Starting tracked modifications: App.jsx, foundation.css, audit-interactions.mjs, interaction-action-cases.mjs. Starting untracked work: nine Phase 0 reports, full-app report, four Phase 1 reports, three audit/report scripts, phase1-hidden-report.test.mjs. No changes discarded, commit, push, deployment, staging or production writes authorized here.

Inherited: Phase 0, local storage audit, calculation map, full-app audit and all four Phase 1 reports. Previous Phase 1 improvement is not a fresh Phase 2A baseline. Reuse its final immutable app only for paired new measurements before storage edits.

## Measurement Contract

Full fixture sizes retained: 600 products, 360 customers, 1800 orders, 900 payments, 4500 requests, 4300 dispatches, plus preview seed. All UI writes isolated and outbound network blocked. CPU1x/3x/6x and existing event-to-DOM boundaries retained. Preview JSON/storage is NOT Firebase latency. Test-only instrumentation measures JSON calls and Storage get/set durations without recording payloads or tokens; instrumentation overhead is present on both sides.

Cold serialization, warm mutation, duplicate write and reload are distinct. Microbenchmarks invoke mock storage APIs, not application business handlers; they cannot prove pricing/stock business correctness or real-device acceptance.

Production queue remains untouched: bounded tenant-scoped commands; write + read-back before durable acceptance; retry revisions prevent stale acknowledgement. Share-image IndexedDB, backup exports, SDK Auth and security secrets are separate owners, not a shared whole-company local database.

Execution crossed midnight into 2026-10-03. Final paired browser runs use test-only `HD_AUDIT_FIXED_DATE=2026-10-02` for both fixture and advancing browser calendar, while native performance/RAF/timer clocks remain unchanged. Earlier unpinned/intermediate runs are retained but not used as the final acceptance pair. Source hashes above were recorded before storage changes.
