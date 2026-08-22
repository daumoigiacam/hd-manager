# HD Manager UI Info Icon Inventory

Audit date: 2026-08-22

## Scope and scan method

- Scanned the `src/` UI source tree, including `src/App.jsx`, shared design-system components, layout components, feature pages, dialogs, drawers and mobile views.
- The repository currently contains 91 source files under `src/`, 34 view functions and 11 named section/card helpers in the main UI file.
- A raw scan found 1,048 description-like JSX hits (`description`, `subtitle`, `helper`, `hint` and explanatory `<p>` elements). This is a candidate count, not a count of unique user-facing messages: it includes validation, status, empty-state, realtime and data labels.

## Classification inventory

| Location | Existing text or pattern | Classification | Action |
| --- | --- | --- | --- |
| `src/App.jsx:21765` `SectionInfoHint` | Shared local `i` control and tooltip | CONTEXT_HELP | One shared component; no network or Firebase work |
| `src/App.jsx:33776` `BankPaymentCenterView` | “Theo dõi QR, giao dịch chuyển khoản và đối soát công nợ...” | CONTEXT_HELP | Move beside “Ngân hàng & Thanh toán” |
| `src/App.jsx:44055` `ReportSection` | Report section subtitles explaining the section purpose | CONTEXT_HELP | Move beside each report title |
| `src/App.jsx:75883` `HolidayConfigCard` | “Cài tiền cố định hoặc % lương ngày...” | CONTEXT_HELP | Move beside “Ngày lễ trong năm” |
| `src/App.jsx:76058` `EmployeeView` | Account model explanation | CONTEXT_HELP | Move beside “Mô hình tài khoản” |
| `src/App.jsx:76854` `EmployeeView` | Monthly sales revenue explanation, short `8/2026` month selector | CONTEXT_HELP | Show beside “Doanh thu”; keep the month picker interactive |
| `src/App.jsx:23734-23935` workflow guards | “Cần có khách hàng và sản phẩm trước...” and similar setup steps | ACTION_GUIDANCE | Keep visible because the user must act on it |
| `src/App.jsx` form and editor validation branches | “Vui lòng nhập...”, quantity/price validation and save errors | VALIDATION / ERROR | Keep visible |
| `src/App.jsx` payment, debt, inventory and reconciliation cards | Amounts, debt, payment, sync, stock and matching states | STATUS / REQUIRED_INFORMATION / REALTIME | Keep visible; never move dynamic data into help |
| `src/App.jsx` warning and destructive-action dialogs | Delete, reset, permission and data-loss warnings | WARNING | Keep visible |
| `src/design-system/components.jsx` `HDDialog`, `HDStatusState`, `HDEmptyState` | Dialog/state descriptions | CONTEXT_HELP or REQUIRED_INFORMATION depending on caller | No global replacement; caller classification is required to avoid hiding action guidance |

## Current implementation boundary

Only static context help has been moved so far. Dynamic business values and actionable instructions remain in their original locations. The remaining raw scan candidates require page-by-page review before being moved; they must not be mass-replaced by a text pattern.

## Safety checks

- No business calculation, Firestore query/write, schema, payment flow, persistence or realtime listener was changed for this UI work.
- The info control renders local text only. It does not call Firebase, an API, a timer or a global event listener.
- Existing unrelated VPS changes and untracked artifacts are outside this audit and remain untouched.
