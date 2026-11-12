# Offline HR workspace

Entry: default export `OfflineHRWorkspace.jsx`.

Self check-in/out now has a separate, optional `attendanceRepository` prop and
explicit command capabilities. See [ATTENDANCE_PROTOCOL.md](./ATTENDANCE_PROTOCOL.md)
for the exact main-owned grant/transport/receipt integration. Without that wiring
the read workspace stays unchanged; all other HR/payroll writes remain unavailable.

```jsx
<OfflineHRWorkspace
  runtime={runtime}
  directory={readyBusinessDirectory}
  onNavigate={onNavigate}
  initialSource="employees"
/>
```

Main owns navigation entitlement, bootstrap, invalidation/rerender, native Back,
database closure, and the native SDK lifecycle. No other files were edited for
this workspace. These changes are for the build after dev35; frozen web assets,
manifests and build scripts were not changed.

`initialSource` supports actual sources `employees`, `attendance`, `financials`,
`payrollSnapshots`, `payrollPeriods`; route aliases `company_attendance` and
`payroll` map to attendance and snapshots. Default is employees. The component
calls only `onNavigate('home')`. The existing `useAppScreenBack` closes detail
first and consumes that event; at the list it leaves Back to main. Header Back
also closes detail first. Activity effect detach/reattach retains filters,
selection and completed list/detail results without requerying an unchanged
owner/query. A real owner/query change or explicit reload still reads anew.

## Existing owner / lazy helper contract

The finalized directory is unchanged. Employees, attendance and payroll metadata
use its `page` and exact checkpoint-pinned `lookup`. Neither financials nor full
payroll bodies are exposed by its bounded scalar projection.

Main must additionally expose this lazy method before enabling financials and
full payroll detail:

```js
// Inside the EXISTING scoped runtime owner, alongside business.directory().
// No second connection, session, authorizer, listener or bootstrap.
let hrReaderPromise;
const hrReader = () => hrReaderPromise ||= import(
  '../features/hr/offlineHRReadRepository.js'
).then(({createOfflineHRReadRepository}) => createOfflineHRReadRepository({
  database, session, authorize,
})).catch(error => { hrReaderPromise = null; throw error; });

// Add hrReader to main's existing Object.freeze({...}) business object.
// The component awaits runtime.business.hrReader() only for those reads.
```

The import path above is relative to `src/data/bootstrapOfflineCustomer.js`.
The helper constructor does no SQL. It owns no resource that needs closing;
the old runtime's existing session and database owner reject subsequent reads.
Until wired, the affected UI shows an explicit unavailable message. It never
constructs an alternate owner or falls back to browser/Firebase storage.

Helper API:

```js
reader.pageFinancials({monthKey, employeeId, text, type, limit: 40, cursor, checkpoint});
reader.financialDetail(id, {checkpoint});
// Both => {items, hasMore, nextCursor, metadata}

reader.payrollDetail({employeeId, monthKey, snapshotId, checkpoint});
// => {kind, employeeId, monthKey, details, metadata, ...}
// kind: frozen | unavailable | needs-review | pending-source
```

Every read requires verified `home.read` + `home.payroll.read`. Those are existing
signed capabilities. The Home server maps financials/employees/attendance/payroll
sources to the existing `payroll.view_all_payroll` role action; the component
does not invent a self-only or broad-write entitlement. Main's signed A profile
has `appSession.sourceProfile === undefined`; that is accepted. B's
`native-isolation-v1` is rejected, never interpreted as legacy HR records.

## Query and authority boundaries

- Each request uses the existing serialized SQLite transaction owner, with
  signed permission/session/expiry checks before and after. There is no DDL,
  cleanup, database creation, new listener, HTTP call or global list loading.
- Head revision, generation, captured time, day and feed sequence must match
  the completed head and BOTH applied/reported checkpoints. All reads bind
  tenant, principal, permission revision and session. Keep the whole checkpoint
  object from the directory; do not strip its identity fields.
- Each list page contains at most 40 rows. Next replaces the mounted page,
  rather than retaining a growing array/history. Filters precede SQL LIMIT;
  IDs break date ties with BINARY ordering. No OFFSET/fetch-all filter occurs.
- Employee selection uses an exact ID input or the selected employee card's
  read shortcuts. No global employee option list is loaded. Attendance month
  uses a Vietnam `[first-day, next-month-first-day)` interval via the directory.
  Payroll metadata uses the real `monthKey`; employees have no invented date.
- Financials uses actual `id/companyId/empId/type/amount/reason/date/isArchived`
  and pending flags from `App.addFinancialRecord`. `document.date` alone is its
  business date; createdAt is never substituted. Types are bonus, penalty,
  advance, allowance, employee_purchase. Vietnamese query normalization and
  accent folding run before LIMIT in SQLite. Returned strings cap at 1024
  characters; original signed amounts remain per-record values, not totals.
- The screen labels source pending states and explains that local changes not
  in the completed feed are excluded. It never rewrites pending/source data or
  claims Outbox completion from these reads.

Payroll detail reads at most TWO candidate rows for exactly the selected
employee/month (one when a selected snapshot ID is supplied), then its exact
period ID. A duplicate candidate is ambiguous, not an invitation to choose the
latest write. Each raw body is capped at 512 KiB **before** crossing the bridge;
oversized bodies fail intact rather than returning truncated calculation inputs.

The authority is the existing full `payrollSnapshots.salaryDetails` result,
created by `createPayrollEmployeeSnapshot` in `utils/payrollPeriodLock.js` and
used by the existing Home locked-payroll projection. It is checked using the
original `inspectPayrollSnapshot` with matching employee/month/period membership.
Only bounded numeric display values and provenance are returned to the view.
There is no replacement calculator, reallocation, summation or rounding policy.
Missing fields are unavailable, not zero. Stored negative results remain negative.

Missing/open, pending, archived or incomplete periods withhold salary values.
`ADJUSTED`, nonzero adjustment counts and selected-snapshot adjustment references
also withhold values: the finalized Home feed does NOT contain payrollAdjustments.
The original live `buildPayrollViewProjectionSteps` applies adjustments, prior
debt, policy history, review sources and complete customer ledgers. Recomputing
it from selected directory previews or fetching all company history would be
incorrect. The UI therefore labels a valid result as the original frozen payroll,
never current company debt or an estimate for an unclosed month.

## Other writes remain unavailable

Existing product action / online authority, and the missing Offline authority:

| Operation | Existing role action / online path | Missing Offline protocol |
| --- | --- | --- |
| Check in/out, leave, correction, proxy | `company_attendance.check_in_out`, `request_leave`, `edit_attendance`, `approve_proxy_attendance`; `identityRecordAttendance` calls `/api/identity/attendance` with an online ID token and trusted-device secret | Only self check-in/out have the new protocol described above; main must bind its signed capabilities and original live device/location context. Leave, correction and proxy remain unsupported |
| Bonus/penalty | `payroll.add_bonus_penalty`, `edit_bonus_penalty`, `delete_bonus_penalty`; App add/edit/deleteFinancialRecord writes Firestore financials | No accepted Offline financial command/capability or payroll-side-effect receipt |
| Advance | `payroll.create_salary_advance_request`, `create_salary_advance_for_others`, `approve_salary_advance`, `reject_salary_advance` and `delete_salary_advance`; existing advance/financial-record workflows | No Offline advance/approval command, authorization mapping or atomic server/local payroll application |
| Employee purchase | `payroll.record_employee_purchase`, `edit_employee_purchase`, `delete_employee_purchase`; existing financial-record workflow | No Offline purchase/payroll command or receipt |
| Lock/adjust payroll | Original handleLockPayrollPeriod / handleAdjustLockedPayroll check original owner/accounting authority and Firestore transactions; the VPS branch explicitly reports its generate/approve/lock UI unmapped | No Offline lock/adjust endpoint or sync command with source revisions, rules confirmation, audit and durable receipt; no fabricated lock role action |
| Employee edits | `employees.create_employee`, `edit_employee`, `delete_employee` | No signed employee mutation/Outbox protocol in this runtime |

Main owns extending the workspace service dispatcher for the two self-attendance
commands. This workspace does not register a live service route. Presence of the ONLINE identity
attendance route or generic Firestore writes is not an Offline write protocol.
The view never reports an attendance hour before an authoritative accepted receipt
and exposes no callback that pretends to approve a salary or other HR operation.

## Checks

Run only the focused host tests (no services, builds or devices):

```sh
node --test test-results/firebase-home-release-20261107/source/src/features/hr/offlineHRWorkspace.test.mjs
```

Tests use actual Home applyPage/publish, real SQLite JSON queries, the finalized
directory, and original payroll policy/snapshot constructors and integrity
checker. They exercise pagination/search/month scope, pending/adjusted/missing
and oversized payroll, stale checkpoints, revocation and obsolete async owners.
Native UI performance remains main's validation responsibility.
