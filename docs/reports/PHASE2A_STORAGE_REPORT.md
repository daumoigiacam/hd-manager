# Phase 2A Storage Report

2026-10-02 to 2026-10-03. See PHASE2A_STORAGE_BASELINE.md for the HEAD, dirty work and Phase 1 hashes.
Phase 1 remains BLOCKED. No production, backend, schema, business-handler, pagination, search or scheduler changes.

## Ownership and Persistence Boundaries

| Dataset / owner | Source of truth | Local role / storage | Lifetime / invalidation |
| --- | --- | --- | --- |
| Preview database / firebase-firestore.js | Isolated preview snapshot only | Authoritative within test; one JSON localStorage key, not cloud data | Origin-local until replaced; storage/BroadcastChannel reload; seed compatibility preserved |
| Pending Firebase writes / App enqueue | Unsent intent; Firebase authoritative after ACK | Durable tenant/actor-scoped offline command queue, up to 500; JSON + read-back | Revision-aware retry/ACK; legacy partition preserved |
| Raw collections / stable snapshot refs / recent write overlays | Firebase or durable pending intent | Memory cache and temporary optimistic state | Subscription/mutation/ACK; tenant reset; no new persistent duplicate |
| Session / login mode | Firebase Auth controls identity | Recovery display metadata in local/sessionStorage | Session change/logout; not authentication proof |
| Firebase Auth SDK store | SDK-managed credential | IndexedDB with localStorage fallback | SDK-controlled; no values inspected or changes |
| Identity device IDs / biometric profiles | Server enrollment/revocation | Device security metadata, native secure secret | Enrollment/revoke; security-sensitive, untouched |
| Share images / request-sheet images / QR | Underlying scoped records and fingerprint | Derived memory cache; IndexedDB Blob records; optional native share file | 32/64-entry and TTL bounds; fingerprint invalidation; QR limits 80/160; unchanged |
| Backup payload and completion metadata | Exported server data, separate recovery artifact | Intentional full JSON export; local success/failure schedule metadata | Explicit backup/restore contract; not the live local DB; untouched |
| Footer/dashboard/theme/search preferences | User selection | Small bounded/scoped preference JSON/scalars | User setting/history limits; unchanged |
| Notifications / conversation watermarks | Remote notification/message state | Local UI read/shown timestamps/maps | Scoped read/prompt events; not message truth; unchanged |
| Delivery category/expansion preferences | User choice | Bounded local array / session scalar | Category edits and view session; unchanged |
| Payroll notices / freshness / performance flags | Local user/build/debug state | Small scoped scalars, not ledger data | Dismissal/build/startup; unchanged |
| VPS session and Electron machine metadata | Separate runtime/session identity | Session tokens or small native JSON | Alternate runtime/logout or machine lifetime; untouched |

Cache added here is only serialized preview collection fragments. Owner: one mock-module instance; source: immutable replaced collection objects; key: object identity in WeakMap; scope: same preview store; lifetime: garbage collection or external store reload, with full cache reset on reload. It is not a new business truth/cache TTL policy, contains no cross-origin/global/production state, and never feeds snapshots in place of source data.

## Audit Findings and Change

The mock persists every collection after setDoc/deleteDoc and once after touched multi-collection transactions. Snapshot data()/forEach and mutation payloads also use JSON roundtrip clones. Real App saves use durable queue / authoritative commands, not this mock database in a cloud build (`vite.config.js` aliases only preview/non-cloud paths).

Changes limited to the mock: reuse JSON for unchanged collection identities; serialize the changed collection; reassemble the exact same envelope; synchronously write one legacy-compatible localStorage value before notification. Only when the envelope equals the last successfully accepted value is the current durable value read and compared before skipping a duplicate. Changed writes do not incur an extra full-store read. A failed write or removed disk value cannot be mistaken for success. Emissions/broadcasts still occur. External reload resets fragment cache and last accepted value; errors still reject mutations.

Full-store BYTES on a changed write remain necessary for the retained single-key atomic envelope and existing seed/import/readers. This phase reduces repeated stringify traversal, not the full changed-write payload. Separate per-record keys would introduce partial commit/recovery and compatibility changes; not implemented without a tested journal/transactional local store. Clone isolation remains intact; snapshot JSON roundtrips were not replaced with shared references. The first per-record fragment candidate increased cold cost and was discarded in favor of simpler per-collection fragments.

Production queue has no whole-company persistence: tenant-specific command array, coalesced commands, read-back before durable acceptance, and alreadyPersisted prevents the second write. Removing its verification or deferring a durable write would weaken its contract. No production storage timings are inferred from preview.

No duplicate data deleted: raw state/overlays protect stale-snapshot recovery; share memory/Blob/native copies have independent consumers; backups are recovery artifacts. Extra serialized fragments duplicate representation in memory and have a cost; no claim of reduced memory footprint.

## Measurement

Initial browser runs: phase2a-actions-before and phase2a-actions-after, 210 samples each with no failures/page errors. After contains the intermediate unconditional read candidate, not the final duplicate-only read refinement; do not promote its numbers as final. Initial Node before/after and per-record-fragment-candidate results are also retained separately.

Final paired browser runs: phase2a-final-before (immutable Phase 1 final build) and phase2a-final-after (final mock). Same existing fixtures, CPU1x/3x/6x, viewports, selectors and event-to-DOM boundaries; test-only storage instrumentation enabled on both. The date rolled over during this task, so the final pair fixes the fixture date and advancing browser calendar to 2026-10-02 noon Vietnam time. Native performance.now, timers and animation clocks remain unchanged. Initial unpinned runs do not replace this pair. Outbound requests blocked; no server latency claim. JSON instrumentation includes snapshot clones and the harness's persisted-DOM assertion reads, so parse totals are not isolated application parse cost. Storage durations are synchronous browser calls, not sum-able Firebase latency.

Microbenchmark: six dataset mock APIs, edit/duplicate and restart; full audit fixture, five repetitions. UTF-8 bytes measured there; Storage adapter is an in-memory Map, so its write duration is not browser disk duration. Cold first mutation differs from warmed subsequent collections and is reported separately. Raw samples retained under test-results/phase2a-storage.

## Final Before / After / Delta

Both final primary browser runs completed 210 samples, zero failed actions and zero page errors. Full fixture counts match. Five repetitions per row. Durations below are median milliseconds; render is observed React root work, not a separate server stage. JSON/Storage observations overlap the event-to-DOM interval and must NOT be added together as server latency.

| CPU / save action | Event-to-DOM before -> after (delta) | Stringify before -> after | Parse before -> after | Storage setItem before -> after | Root render before -> after |
| --- | --- | --- | --- | --- | --- |
| 6x product create | 4295.8 -> 4535.8 (+5.6%) | 120.5 -> 4.9 | 3.7 -> 3.7 | 140.8 -> 162.8 | 3687.2 -> 3979.2 |
| 6x request create | 9789.1 -> 9217.0 (-5.8%) | 95.8 -> 63.0 | 25.4 -> 28.7 | 79.4 -> 84.0 | 8857.7 -> 8281.0 |
| 6x import + expense | 2275.0 -> 2110.5 (-7.2%) | 200.5 -> 7.3 | 2.0 -> 1.5 | 232.0 -> 223.4 | 1626.7 -> 1666.0 |
| 3x product create | 2051.2 -> 1996.4 (-2.7%) | 31.5 -> 1.6 | 1.9 -> 1.5 | 41.0 -> 43.5 | 1645.2 -> 1668.4 |
| 3x request create | 3219.8 -> 2988.1 (-7.2%) | 129.1 -> 25.5 | 11.8 -> 12.7 | 148.2 -> 164.1 | 2541.0 -> 2423.2 |
| 3x import + expense | 1280.4 -> 1011.6 (-21.0%) | 111.1 -> 3.4 | 1.2 -> 0.9 | 126.9 -> 122.4 | 907.8 -> 756.2 |
| 1x product create | 593.2 -> 592.1 (-0.2%) | 18.6 -> 1.0 | 0.5 -> 0.3 | 28.0 -> 28.0 | 462.8 -> 466.2 |
| 1x request create | 914.9 -> 807.5 (-11.7%) | 40.3 -> 6.5 | 3.5 -> 2.9 | 61.6 -> 56.6 | 695.1 -> 646.1 |
| 1x import + expense | 366.5 -> 285.0 (-22.2%) | 29.7 -> 0.9 | 0.3 -> 0.2 | 44.0 -> 42.2 | 237.7 -> 211.2 |

No large CPU3x save regression in this matched pair. Customer typing at CPU3x increased 61.5 -> 66.2 ms (+7.6%, +4.7 ms); CPU6x product modal open increased 137.4 -> 161.2 ms (+17.3%, +23.8 ms). These actions write no preview DB; attribution is not established and is not dismissed as system variance. CPU6x product save remains slower despite lower stringify, with increased observed root work and Storage duration; no proven causal decomposition. This phase does not change render/search to hide these results.

Navigation P50 before -> after: requests 1930.6 -> 1735.2 (6x), 1187.5 -> 838.5 (3x); dispatch 1157.5 -> 1050.0 (6x), 515.2 -> 507.8 (3x); import 752.9 -> 759.3 (6x), 356.5 -> 358.0 (3x). Phase 1 source hashes are unchanged. Import navigation does not write the preview DB, so navigation differences are not credited as serialization savings.

Real browser changed-write counts did NOT decrease: median product/request/import saves at 6x = 2/1/3 both sides, at 3x = 1/4/3 both sides. At 3x, the respective written payload totals remain 3,600,465 / 14,460,571 / 11,115,323 UTF-16 code units. The microbenchmark proves duplicate-write suppression, not fewer writes in every app workflow. Main browser counts can include background writes and differ by workflow/profile; no equality assertion for unrelated scheduling is claimed.

### Isolated API Encoding and UTF-8 Bytes

Final Node labels: `final-before`, `final-after`; same full fixture and five repetitions. Map storage durations are NOT native disk performance.

| Dataset edit | Wall before -> after ms | Stringify before -> after ms | Encoded UTF-8 bytes before -> after | Durable UTF-8 bytes both sides |
| --- | --- | --- | --- | --- |
| Requests (first/cold) | 10.75 -> 12.15 | 8.791 -> 6.898 | 3,601,106 -> 3,601,077 | 3,601,065 |
| Dispatches (warm) | 10.64 -> 9.00 | 8.559 -> 2.232 | 3,601,133 -> 1,332,003 | 3,601,092 |
| Products (warm) | 10.73 -> 3.58 | 9.408 -> 0.376 | 3,601,173 -> 146,817 | 3,601,132 |
| Customers (warm) | 10.26 -> 3.16 | 9.149 -> 0.100 | 3,601,213 -> 53,956 | 3,601,172 |
| Payments (warm) | 11.12 -> 3.36 | 9.877 -> 0.269 | 3,601,253 -> 112,374 | 3,601,212 |
| Imports (warm) | 10.47 -> 5.83 | 9.195 -> 0.007 | 3,601,355 -> 305 | 3,601,314 |

All six identical duplicate operations reduce disk writes from 1 to 0 and written bytes from approximately 3.6 MB to 0, while notifications remain intact. Cold first wall cost increased 13.0% (+1.40 ms): cache population and envelope reconstruction introduce work; the measured delta is disclosed, not explained away. Repeated collection encoding is removed, but cold full encoding, changed collection traversal, envelope assembly and full changed-write storage remain.

Raw artifacts: `test-results/full-interaction/phase2a-final-{before,after}` (samples, summaries, storage-comparison and phase1-comparison); `test-results/phase2a-storage/final-{before,after}/results.json`; `test-results/phase2a-storage/browser-recovery.json`. These are ignored local audit artifacts, not committed production data.

## Verification and Remaining Gate

Focused tests 14/14, real-browser storage recovery, test:all, lint, extra lint for new files, payroll-scoped typecheck and production build completed successfully. Typecheck does not cover the entire JavaScript application. See regression report for the supplemental dispatch assertion failure and missing end-to-end acceptance.

Remaining: production storage timing unmeasured; full changed-write envelope remains; snapshot roundtrip clones remain; cold initialization and extra fragment memory remain; mock failed-write RAM rollback and concurrent isolation remain pre-existing limitations. Complete create/edit/reopen/stock/payment UI regression is not established. Phase 1 remains BLOCKED and unchanged. No backend/deploy/push, schema migration or Phase 2B work was performed.

PHASE 2A STATUS:
BLOCKED
