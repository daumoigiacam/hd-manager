# Performance Release Final - 2026-10-03

## Scope

Finalize the existing core performance work only. No new optimization, business-rule change, Firebase migration, production-data write, or web/VPS deployment.

Reviewed runtime changes retain business calculations and server-confirmed saves: cooperative projections/search, cancellation, bounded presentation pagination, immutable-record caches, deferred background work, and isolated table rendering. Preview incremental persistence remains behind the preview build alias. Production bundle verification passed for Firebase hd-manager-c5839, with no HD Platform or preview-fixture markers.

## Release-only Corrections

- Deployment steps now require explicit workflow_dispatch authorization. A main push runs CI but cannot deploy production.
- The performance regression command includes the new core test files.
- Two old dispatch source-structure assertions now inspect the extracted table component and verify its App wiring. No application behavior was changed to satisfy these tests.

## Verification

- npm test: PASS. Node test-runner summaries total 665 PASS, 1 SKIP, 0 FAIL; additional custom-script suites passed. Do not add overlapping subset counts to this total.
- Core/master performance subset: 436 PASS, 1 SKIP, 0 FAIL.
- Save/UX subset: 19 PASS, 0 FAIL.
- lint, typecheck, production build, production Firebase bundle verification: PASS.
- Browser regression: 78 samples, zero failures/errors, four core workflows only, preview CPU3x, 240-second parent deadline. Saves are preview saves, not production Firebase ACK measurements.
- Stress simulation: no crash, 232.1 MB peak RSS, 30.7 ms maximum event-loop delay, zero reported risks.
- KPI gate: PASS with warnings. Legacy static scale projections still report 7/8 failed scale points. These estimates are advisory, not measured production latency or concurrency capacity.
- git diff --check: PASS (line-ending normalization warnings only).

Local evidence is retained under ignored test-results/performance-release-*.log and test-results/full-interaction/performance-release-regression. Machine-generated evidence is not committed.

## Preserved Outside This Release

Stash 6608aef8fe1c5012925dbc2581ed5cc7007910d1 preserves inherited functions/package.json, functions/package-lock.json dependency changes and docs/reports/firebase-performance-environment-evidence.json. These are not deleted and are excluded from the performance commit. No signing material or environment secrets are included.

## Remaining Limitations

The previously accepted delivery-report cold-open residual remains; no speculative optimization was added. Preview CPU3x results do not establish physical Android device or real Firebase network performance. No production deployment is authorized in this task.

Commit/main equality and signed APK provenance must be verified after pushing. APK validation and installation results are recorded separately with the release artifact because the APK must be built from the committed main source.
