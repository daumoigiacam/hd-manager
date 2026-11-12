# Native Finance route handoff

Implemented entry: `OfflineFinanceWorkspace.jsx`, default export. Props:

```jsx
<OfflineFinanceWorkspace runtime={runtime} directory={directory} onNavigate={onNavigate}/>
```

Main owns the navigation entry, signed navigation policy, lifecycle, and device checks.
The component calls only `onNavigate('home')`. Its existing `useAppScreenBack`
handler closes editor first (preserving the draft), then detail, before main's
fallback Home. Main retains the only raw native Back listener. The route uses
the existing cancelable DOM Back hook; there is no additional native listener.
Hide/unmount or rerender the route when its existing runtime invalidates, expires,
or changes account; the component adds no runtime subscription. Async reads check
`isCurrent()` and expiry after completion and discard obsolete requests.

## Existing owner and directory

Pass the **existing** runtime and Goodall's **existing** directory instance. The
route creates no database, runtime, cache, transport, listener or command queue.
It requires the actual signed `home.read` plus `home.cashflow.read` capabilities
for both payments and expenses. No role or `home.read`-only expansion grants
cashflow access. No invented per-source payment/expense permission is required.
Main may await its lazy `runtime.business.directory()` and pass the resolved
directory as the `directory` prop. The route itself does not invoke that getter,
start bootstrap, or create another directory while rendering.
The current signed `allowedTabs` must be addressed by main/server policy before
adding a Finance navigation entry; the route does not invent a tab entitlement.
`native-isolation-v1` is explicitly unsupported: its `nativeCashTransactions`
schema is not silently interpreted as product `payments` / `expenses`.

The adapter already uses the real `offlineBusinessDirectory.js` API:

```js
directory.page('payments' /* or 'expenses' */, {
  from, to, text, employeeId, status, limit: 40, cursor, checkpoint,
});
// => { items, hasMore, nextCursor, metadata }
directory.lookup(source, [id], {checkpoint});
// => same envelope with one matching item, or no item
```

`metadata` must retain `source`, `checkpoint`, `serverConfirmedOnly: true`,
`financialCalculationAllowed: false`, `projection: 'bounded-directory-scalars-v1'`,
and `timeZone: 'Asia/Ho_Chi_Minh'`.
The existing checkpoint is `{generation,seq,capturedAt,dayKey,sourceProfile}`.
Authorization and principal/tenant/revision/session binding remain in the directory;
the adapter additionally checks each returned row's company and rejects mixed
checkpoints, duplicate IDs, malformed pages and nonadvancing cursors.

UI end dates are inclusive and converted to directory `[from,to)` bounds using
UTC date arithmetic. `businessDate` from the SQL directory is authoritative,
including its Vietnam timezone normalization. The fallback date function uses
the original App cashflow field priority and original product date functions.
Initial/reset dates use actual current Vietnam day from `businessDayKey(Date.now())`,
never a fixture date or a cached checkpoint day. An empty result for today remains
empty. Each completed source shows its checkpoint day alongside actual today;
the user can explicitly select that source day with **Chọn ngày dữ liệu**.
Reviewed directory date correction: manual payments use the first nonempty
`cashflowDate`/`paymentDate`/`paidDate`/... source, while the original
SePay/PayOS-equivalent provider classification selects bank-date candidates and
manual fallback. SQL filtering and cursor order use the same expression and
Vietnam date normalization. The previously reported all-payments bank-date
priority mismatch is resolved. No cross-owned directory code was edited here.
Search/date/employee filtering occurs in SQL before LIMIT. Archived records are
hidden using the original `!isArchived` predicate while retaining the SQL cursor;
an archive-only page still offers Load more and is not presented as an empty ledger.

Thu and Chi have independent cursors and checkpoint-bound detail lookups. This
avoids claiming global ordering across two independently paginated sources.
The only displayed count is **loaded, active rows**. No page-based totals,
balances, debt allocations, or overpayments are computed. Detail is explicitly a
bounded source preview; the directory's 1024-character limit is disclosed.

## Reviewed approval filtering contract

The current directory implements Finance approval status separately from raw
payment-completion status. Both source descriptors now advertise:

```js
directory.sources.payments.statusFilter = 'cashflow-approval-v1';
directory.sources.expenses.statusFilter = 'cashflow-approval-v1';
```

Reviewed SQL `status` filtering implements the original
`App.getCashflowApprovalMeta` / `requiresCashflowApproval` semantics **before
LIMIT**, accepting `pending`, `approved`, `rejected`. The existing UI sends
these values and enables automatically from the descriptors; no view code
change is required. Missing descriptors still fail closed.

Current projection now includes numeric `amount`, which the route consumes
directly. Null/absent/string amounts remain unavailable, never zero; negative
stored amounts remain reversals. Both sources now project the original scalar
approval/payment-completion fields below, plus `type`, with JSON null for absent
fields and JSON booleans preserved as booleans:

```text
approvalStatus, sourceType, requiresApproval, handoverStatus, createdByRole,
isPaymentIntent, paymentIntent, isCustomerDebtPaymentIntent,
paymentStatus, settlementStatus, reconciliationStatus
```

The route uses the original product functions to distinguish approval from
payment completion. If this projection is incomplete it shows an explicit
unknown official status instead of claiming approval or debt application.
It separately displays server-confirmation provenance and detects any supplied
pending-local flags. The directory should continue to expose only committed
Home feed rows, never overlay arbitrary local writes.

## Optional Development financial command sidecar

The new bounded command sidecar, optional ready `cashflow` prop and controlled
create/edit/conflict forms are described in [CASHFLOW_PROTOCOL.md](./CASHFLOW_PROTOCOL.md).
Default read-only sessions stay read-only: no new grants were issued. Controls
require emulator mode, a ready Development repository and an explicit signed
command capability. Approval/delete/compound workflows stay unsupported.
Local saves report pending, and only actual accepted receipts report server
confirmation. No generic App writer or LWW path is used.

No extraction of App's `FinanceView` was necessary. If main later exposes the
original screen, a possible host intent is
`onNavigate('finance', {view:'original', source, id, checkpoint})`; this is a
proposed host hook, not an implemented route or enabled action. It must receive
the original complete authorized inputs and original permission callbacks.
Never pass directory pages into its ledger/summary calculators.

## Search latency

No debounce, deferred query value or timer delays a Finance search. Each input
passes its filters directly into the SQL page request. An explicit request
ticket and query identity discard superseded responses and block old-row actions.

Existing startup telemetry records `finance.search.input`, then
`finance.search.input-to-result` per visible source. `inputToResultMs` starts at
the DOM input event timestamp (monotonic clock, with a legacy timestamp fallback)
and ends in `useLayoutEffect` after matching result/error DOM commit. It includes
dispatch delay, React scheduling, authorization, SQLite/bridge work and render;
it is not SQL-only timing. No search text or account/document IDs are recorded.
`outcome` distinguishes result and error; pending requests invalidated by another
query/unmount emit `finance.search.superseded` with elapsed time instead of a
successful sample. Main should report these counts alongside successful latency,
and use the slower source for a two-section input-to-complete-result sample.

The endpoint is explicitly `dom-commit`, not a claim of completed screen paint.
Main's device harness can measure the subsequent visible frame. The P95 <100 ms
target remains unverified until main measures the actual native navigation path.

## Focused verification

Run from the actual source:

```text
node --test src/features/finance/offlineFinanceModel.test.mjs
```

Twelve tests cover actual-today defaults and input timestamp clock handling,
original payment date priorities, approval/payment/sync
distinctions, missing/zero/reversed amounts, signed read gates, revocation during
reads, cursor validation, same-checkpoint detail, and the **actual directory SQL**
with an in-memory completed-feed fixture (no persistent database). The component
also parses in the source check. No app build, ADB, device, service, Production
operation or commit was performed. Native routing, Back behavior, visual checks
and lifecycle invalidation remain main's integration checks.
The additional cashflow protocol suite covers server and same-DB Outbox/overlay
atomicity, authorization, revisions/conflicts, receipt recovery and retained-draft
source contracts. Both suites can run with the command in CASHFLOW_PROTOCOL.md.
