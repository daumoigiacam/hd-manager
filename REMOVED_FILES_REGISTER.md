# Removed Files Register

Whole files removed: **0**. Dependencies: **0**. Assets: **0**.

Only proven unused local import bindings were removed. Source modules and their exports remain available to all other callers/tests. The below reference proof applies to each binding: ESLint unused report, absence from the importing file's non-import AST/text (including JSX), unchanged ordered imported-module list, unchanged executable AST. No local binding was exported or registered by a route/event/Firebase/native entry. Regression tests are recorded in CLEANUP_REGRESSION_REPORT.md.

| File | Bindings removed | Reason / evidence | Reference search | Tests after removal |
| --- | --- | --- | --- | --- |
| src/App.jsx | flushSync, MoreVertical, Mic, KeyRound, Pin, Sun, Moon, Monitor, ChatAvatar, normalizeChatSearch, AUTOMATIC_EVALUATION_SCHEMA_VERSION, useHDTheme | 12 unused import bindings; module edges retained | Whole source/JSX plus tests/config/scripts; used implementations such as normalizeChatSearch remain untouched | AST parity, npm test, browser core flows |
| src/design-system/ListPagination.jsx | React | Automatic JSX runtime; side-effect import retained | AST/text; build transform | AST parity, build, browser pagination |
| src/features/attendance/AttendanceRoleSelector.jsx | React | Automatic JSX runtime; side-effect import retained | AST/text; build transform | AST parity, attendance tests |
| src/features/business-report/BusinessReportWorkspace.jsx | React | Named hooks retained | AST/text; build transform | AST parity, build |
| src/features/employees/EmployeeBankQr.jsx | React | Named hooks/memo retained | AST/text; build transform | AST parity, build |
| src/features/orders/CoreRowPager.jsx | React | Automatic JSX runtime; side-effect import retained | AST/text; build transform | AST parity, core pagination, browser |
| src/features/settings/CompanyBankAccounts.jsx | React | useState retained | AST/text; build transform | AST parity, build |
| src/features/settings/CustomerCareSettings.jsx | React | Named hooks retained | AST/text; build transform | AST parity, build |
| src/layout/SyncQueueStatus.jsx | React | Named context/hooks retained; sync behavior unchanged | AST/text; build transform | AST parity, retry/sync unit coverage |

Source diff: 16 deleted lines and 15 replacement lines, net one line removed. This is not a claim of 16 lines of business logic removed. Test helper also drops its now-unused createHash import as part of the cross-platform assertion correction.
