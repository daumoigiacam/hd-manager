# Safe Cleanup Audit - 2026-10-03

## Checkpoint

- BASE_COMMIT: `4db424a3e511bc2a24162245e7423478da9f89c8`
- BASE_BRANCH: `main`; cleanup branch: `codex/safe-cleanup-20261003`
- Initial working tree: clean. Existing stash `6608aef8fe1c5012925dbc2581ed5cc7007910d1` is untouched; no new stash was made.
- BASE_TEST_RESULT: previous release 665 node-runner PASS, 1 SKIP, custom script suites PASS; 19 save/UX PASS; 78 preview browser samples without failure.
- BASE_BUILD_RESULT: production web and signed Android release PASS in the immediately preceding release task.
- BASE_FILE_COUNT: 890 tracked files; 196 source files.
- BASE_SOURCE_SIZE: 5,925,494 bytes with LF-normalized text. Normalization avoids misleading Windows CRLF size changes.
- Checkpoint is the existing immutable Git commit; no destructive reset or extra copy of production data was made.

## Repository Coverage

Tracked scope: root 87, .github 3, android 61, deploy 4, docs 109, electron 5, functions 28, hdconnect-website 47, ios-expo 16, migration 11, public 14, release 2, reports 1, scripts 53, src 196, tests 253.

The requested top-level assets/components/services/utils/hooks/pages/features/firebase/config/e2e/mocks/fixtures/capacitor directories are not all separate roots here. Their equivalents live under src, Android resources, public, Functions, tests, native and root configuration. Ignored node_modules, build/cache directories, local env/keys, existing APKs and temporary evidence are not deletion candidates.

Read-only inventory: `scripts/audit-safe-cleanup.mjs`; local JSON: `test-results/safe-cleanup/repository-inventory.json`. It inventories source, 49 assets, 49 dependency declarations, 36 config-related paths and 12 stylesheets. No tracked .old/.bak/.backup/.tmp/.disabled/.copy/.orig files were found. Filename/string scans are deliberately over-inclusive and cannot authorize deletion by themselves.

## Reference And Registration Review

- Static AST import scan and ESLint unused-symbol candidates, including JSX-aware textual confirmation before removing bindings.
- Whole tracked-text searches include tests, dynamic import strings, scripts, workflows, Java/XML/Gradle, manifests, CSS and config; reports alone do not count as runtime reachability.
- Vite preview aliases, workers, Firebase entry/config/Functions exports, Capacitor plugin discovery/MainActivity, Electron entry, PWA icons and website URLs remain intact.
- No module import edge or evaluation order was removed. Named/default bindings only were removed; side-effect-only imports explicitly retain module loading where necessary.
- No exported implementation, route, state initializer, callback, Firebase registration, event handler or business helper was deleted.
- Auth/session candidate employeeSessionProfile.js remains B, despite no filename consumer, because it exports an identity/permission adapter.
- Queue/cursor/read-lifecycle compatibility helpers and preview persistence retain test/build consumers. They are not dead production code just because some modes do not load them.
- Similar normalizers/pricing/date/share helpers have different contracts or callers. No duplicate implementation was merged. Exact byte-hash scan found no duplicate source files; nine identical-asset hash groups are retained for distinct native qualifiers/platform/public paths.
- The one src console.debug is the DEV + perfCheck-gated share-cache diagnostic; retained. Error/warn/business logging was not removed. No src debugger/TODO/FIXME/HACK match was found in this scan.
- CSS dynamic classes, media queries and density-qualified native assets were retained. No visual behavior was intentionally changed.
- Font dependencies with no literal consumer remain B for owner review, not bulk-uninstalled. Tool dependencies invoked by binary names/ambient type resolution remain C.

## Route Coverage

`scripts/audit-module-paths.mjs` successfully matched all 22 navigation modules to components, child components, handler/call sites and foreground collections. Detailed evidence: `test-results/module-source-inventory.json` and `test-results/safe-cleanup/routes.log`.

| Route | Page/component |
| --- | --- |
| home / executive_dashboard | ExecutiveDashboardView |
| order_requests | OrderRequestView |
| orders | OrderManagementView |
| warehouse_dispatch | WarehouseDispatchView |
| delivery_reports | DeliveryReportView |
| warehouse_import | WarehouseImportView |
| customers | CustomerCRMView |
| debt | DebtManagementView |
| finance | FinanceView |
| bank_payments | BankPaymentCenterView |
| messages | MessageCenterView |
| pricing | SimplePricingEngineView |
| company_attendance | AttendanceView |
| employee_reviews | EmployeeReviewModuleView |
| asset_management | AssetManagementView |
| payroll | SalaryView |
| employees | EmployeeView |
| products | ProductManagementView |
| price_quotes | PriceQuoteBroadcastView |
| settings | SettingsView |
| role_permissions | RolePermissionView |
| billing | BillingView |

This is static mapping, not an exhaustive production call graph. Deep links and alternate runtime APIs were kept.

## Changes

20 unused import bindings removed from nine source files; 0 whole files, dependencies, assets or CSS rules removed. The full executable AST, exports and module load order remain equal to baseline in nine parity tests. Net source reduction: 225 LF-normalized bytes and one line (16 old source lines replaced by 15 lines).

One inherited test hashed mixed local line endings rather than canonical content. After Git checkout its CSS hash failed even though CSS exactly matched baseline after LF normalization. The test now compares canonical CSS with the fixed release commit and retains both allowed-rule assertions. No CSS/runtime fix or baseline hash overwrite was made.

The new audit script and AST parity tests are tooling only, not production optimization. Six requested root reports document the change and retained candidates.

## Rollback

Cleanup is isolated on its branch. After commit, use a normal `git revert <cleanup-commit>` to undo only this cleanup if required, after checking the working tree; do not reset main or restore unrelated files. The baseline remains available at the SHA above. Production deployment: **NO**. Push: **NO**.
