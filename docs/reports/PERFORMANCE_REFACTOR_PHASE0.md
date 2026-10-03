# HD Manager 1.0.5 - Phase 0

Date: 2026-10-02. Scope: audit and mapping only. No Phase 1 authorization is implied.

## Git safety and baseline lock

- Branch: `codex/final-22-module-audit-20261002`.
- Current and baseline commit: `5f162f5ce85fd4dc746382f13a6a4170e4a29775`.
- Commit subject: Record customer debt repayments as expenses and release Android 1.0.5.
- Starting tracked changes: `scripts/audit-interactions.mjs` and `tests/visual/interaction-action-cases.mjs`, 7 insertions / 4 deletions. They add the executive route, bounded audit timeout, selected-module stress guard and corrected employee selector. They predate Phase 0.
- Starting untracked files: `docs/reports/FULL_APP_PERFORMANCE_105_2026_10_02.md`, `scripts/analyze-audit-source-profiles.mjs`, `scripts/report-full-app-105-audit.mjs`. Preserve all three.
- Read `git status`, commit and full tracked diff before edits. No reset, checkout, deletion, commit, push or deployment. A new safety branch/tag is unnecessary for documentation-only additions; it would not capture the uncommitted evidence anyway.
- Recorded SHA-256 fingerprints for 287 existing source/config/audit files before edits, for comparison after writing reports. No AGENTS.md found in the workspace search or drive-root check.

### Immutable evidence identity

Baseline report: [FULL_APP_PERFORMANCE_105_2026_10_02.md](FULL_APP_PERFORMANCE_105_2026_10_02.md).
The following fingerprints identify the local evidence, including raw profiles and source maps, not just a rounded report table.

| Directory under test-results/full-interaction | Files | Samples | Incomplete cases | Page errors | SHA-256 tree digest |
|---|---:|---:|---:|---:|---|
| full-app-105-audit | 246 | 697 | 11 | 0 | E0FB61221E0E33F49CEACF6FC38512765FADFDFECA8AF1508F86FBE89294C718 |
| full-app-105-followup | 31 | 69 | 3 | 0 | E8608A0DB7629A70F7022434DE963FA07E515C3E2A559EE6A5FE858F57DB9624 |
| full-app-105-employees | 3 | 45 | 0 | 0 | F530EB1CD1C633AE1910FCD75BFB96E5052A229945FA8829B07ED120D3FA6C9F |

Tree digest method: recursively enumerate files, PowerShell `Sort-Object FullName`; for each file use relative path with `/`, one space, uppercase SHA-256; join lines with LF without trailing LF; SHA-256 of UTF-8 bytes. Filesystem names and file bytes are part of the lock. These files are ignored local test artifacts; a future machine needs the evidence directories, not Git alone.

Summary JSON SHA-256, in the same order:

```text
18FAABE6FE82A772F25EE822A34BEAFCBFA10F7D3BE2F495A1C014E36769F547
193E6604498D9D5EDE8C5D22DA4308E7C36464CA106E95F945CEB998689C4A29
D6AB18FE7518C7EA518FC3AE49207F19EC74A6B2292AD24ED031A1C863D5501D
```

## Measurement contract retained

23 screens; 811 successful timing samples, NOT 811 independent business PASS cases. CPU 1x uses 1366x900, 3x/6x use 390x844. Chrome preview with React production profiling; sample fixtures, isolated mock storage, no remote business writes. Added fixture: 600 products, 360 customers, 1,800 orders, 900 payments, 4,500 requests, 4,300 dispatches; seed merges can change final counts. Other modules have small seed sets.

Time = interaction event to expected DOM plus two RAFs, not server acknowledgment. Five opens and generally 3-5 action repetitions; use P50, do not promote small-sample P95 into a service SLA. Profiles start before the event and include automation overhead: self-time identifies code hotspots, not exact fractions of event latency. Preserve 7-second timeouts and 30-second followup evidence; never discard failures. No new all-app benchmark was run.

## Deliverables

1. [Inherited results](INHERITED_PASS_REGISTER.md)
2. [Hot paths](PERFORMANCE_HOT_PATH_REGISTER.md)
3. [Data flow](PERFORMANCE_DATA_FLOW_MAP.md)
4. [Storage](LOCAL_DATA_STORAGE_AUDIT.md)
5. [Pagination and search](PAGINATION_SEARCH_AUDIT.md)
6. [Calculation map](CALCULATION_HOTPATH_MAP.md)
7. [Background jobs](BACKGROUND_JOB_AUDIT.md)
8. [Dead-code candidates](DEAD_CODE_CANDIDATE_REGISTER.md)

## Findings and future targets

The five priority modules have measured client bottlenecks. Main-thread reconciliation, repeated normalization, product-by-movement scans, per-day recomputation and full mock serialization are separate costs. Current company collection queries are tenant-filtered but unbounded; render windows are not remote cursors. Some historical cursor/maintenance utilities are not imported into the restored App.

Proposed targets for a separately approved implementation phase, with unchanged fixtures, CPU, viewport and timing boundaries:

| Target | Acceptance evidence required later |
|---|---|
| Immediate feedback | Busy/accepted feedback within 100 ms at 6x; separately measure local durable receipt and remote acknowledgment |
| Input responsiveness | P50 <=100 ms and no worse than baseline; preserve text, focus, caret and validation |
| Large screen opens | Aim <=500 ms P50 at 6x; retain baseline absolute values and disclose misses |
| Long tasks | Reduce count and longest task >50 ms in matched traces, without hiding work after measurement |
| Saves | At least 50% lower client P50 for the measured slow actions; never label local queue receipt as server success |
| Data processing | Fewer repeated scans/normalizations and renders per mutation; same rows, totals, sorting, permissions and legacy matching |
| Persistence and background | Measure bytes/stringification, active requests and input overlap; retain durability, retry and backup behavior |

Every implementation needs before/after hot-path measurements and business regression assertions. Do not reduce fixture size, drop old records, remove checks, change pricing/stock semantics or replace production latency with mock timings to meet a target.

## Evidence boundaries and gate

Missing runtime acceptance remains explicitly BLOCKED: Firebase acknowledgment latency, physical devices, long-running background contention, delivery save with the correct linked-dispatch fixture, desktop floating-button obstruction and large real histories. Those are not claimed as PASS by this documentation gate.

Phase 0 maps source behavior and inherited measurements; it does not certify production correctness, zero lag, staging parity or readiness for Phase 5. No production data was read through the app or mutated during this audit. Only the nine requested Markdown reports are added. Final hash/diff verification is recorded below after report validation.

## Final verification

- All nine requested reports exist and are nonempty; relative report links resolve.
- Before/after SHA-256 comparison: 287 existing files checked, zero changed, zero missing. Existing source/config/audit work is preserved byte-for-byte.
- Final git status adds exactly the nine Phase0 reports to the initial dirty state. No tracked business diff, no deletion. `git diff --check` passes; Git only emits existing LF/CRLF conversion warnings for the two pre-existing audit edits.
- No benchmark, app build, production interaction or business test was rerun. Documentation validation is not a substitute for runtime acceptance.

Selected locked source/evidence SHA-256 values:

```text
src/App.jsx
FF933182965999E1B48C34FFA9F676D155EB314B5C73DF7EA0E6FC33B6E52C97
src/mocks/firebase-firestore.js
FC6538837348E71EC1EDE2A04AAE6D817BDBFD0A96043EE1D575F648BD773183
scripts/audit-interactions.mjs
83369D928DB2A680590D92CFE28090835431649DE4B77A1C099AA12186575FA0
tests/visual/interaction-action-cases.mjs
5F3B8E38802DA8E8BD3B63C00288150A5CA2D63BB37D20FCF942976EDE971D93
docs/reports/FULL_APP_PERFORMANCE_105_2026_10_02.md
8B6C275C9FBB5CB88EFCC74EFAE90BB3018BE42AE99491C51EDE934A1A7C4562
```

| Phase0 requirement | Result |
|---|---|
| Baseline and Git safety |PASS: commit, dirty-state diff and evidence digests recorded |
| Five module flows and hot paths |PASS: source, inputs, mutation and downstream effects mapped |
| Storage and serialized data |PASS: source-owned paths inventoried; unknown runtime byte counts explicitly bounded |
| Pagination/search |PASS for audit completeness; optimization gaps remain clearly marked |
| Calculation/background work |PASS for mapping; code risks separated from measured causes |
| Dead-code audit |PASS: classified references; no unsupported REMOVE_CANDIDATE admitted |
| No business/schema/production changes |PASS: docs-only delta and unchanged fingerprints |

This PASS is exclusively the Phase0 audit gate, not a smoothness or release gate. Runtime gaps above remain open. Phase1 has not started.

STATUS: PASS
