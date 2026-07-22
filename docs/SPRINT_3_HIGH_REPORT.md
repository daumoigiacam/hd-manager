# Sprint 3 - High Priority Findings

Date: 2026-07-22

## Findings retained for architectural work

1. `src/App.jsx` contains the root application shell and is approximately 70k lines. This makes unrelated state changes more likely to cause broad renders.
2. The main Firestore binding layer can subscribe to many collections from the root. Deferring startup reduces the initial burst but does not replace broad listeners with screen-scoped queries.
3. `functions/index.js` has a legacy payment matching fallback that can scan a large order set when normalized payment fields are missing.
4. The REST fallback can request large pages. This is safer than a failed realtime connection but is not a substitute for pagination and indexed queries.

## Decision

No risky business-logic change was made in this sprint. Replacing these paths requires a data/query contract review because it can change realtime visibility, payment matching, or company isolation.

## Verification

- Build and syntax checks pass.
- Existing AI/Zalo, stress, and KPI tests pass.
- These findings remain open and are tracked in `docs/AUDIT_REPORT.md`.
