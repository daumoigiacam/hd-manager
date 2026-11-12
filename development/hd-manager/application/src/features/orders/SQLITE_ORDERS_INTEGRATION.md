# Product Orders route

`SQLiteProductOrders.jsx` is a lazy product route with default props
`{runtime, onNavigate}`. It uses the existing HDButton and OrderSearchInput
boundaries. The legacy OrderManagementView cannot safely consume a directory
page: it computes allocations from its complete `orders` and `payments` props.
This route never passes page-only histories into that view.

## Owner wiring (main agent; not changed here)

Expose the main agent's lazy `runtime.business` (object or function returning a
promise). All server-source list/search/filter/paging and picker pages delegate
to Goodall's shared offlineBusinessDirectory. Orders has no competing source
directory engine or lifecycle. Its page contract is items/nextCursor/hasMore;
the adapter converts the UI's inclusive end date to its `[from,to)` contract.

Expose a lazy `runtime.orderProduct()` for full detail, complete-history ledger,
local-command pages and manual creation. Instantiate `createSQLiteOrderProduct`
from `sqliteOrderDirectory.js` with:

```js
createSQLiteOrderProduct({
  database,                 // existing encrypted native connection owner
  session,                  // existing verifiedDataSession
  authorize: fullAuthorize, // existing signed grant verifier
  orders,                   // existing runtime orders facade: repository/create
  business,                 // resolved SAME shared directory; signed source scopes
  actorEmployeeId: appSession.currentUser.id, // signed employee identity
})
```

Keep both promises scoped to that bootstrap instance. Do not open another database,
start another feed/worker, create a transport, or replace the Orders writer.
`orders.create()` must remain the existing wrapper which notifies the same sync
engine after `offlineOrderRepository.create()` commits. Lazy-load the default
route only for Orders navigation. Runtime also needs its existing `scope`,
`capabilities`, `expiresAtMs`, `appSession`, `isCurrent()` and `subscribe()`.
`onNavigate('home')` is the only navigation callback currently emitted. The route
can list shared source pages without orderProduct; detail, financials and create
then explicitly fail closed. No App/layout/bootstrap changes are included here.

## Read and finance contracts

- Directory and picker signed permissions, scope, Unicode search, date/filter
  semantics and checkpoint cursors are owned by business.page(source,filters).
  The current shared Orders contract requires home.read, home.orders.read and
  orders.read. No source-directory page is used as financial input.
- Pages: default 25, maximum 100. The selector distinguishes downloaded server
  Orders from create commands on this device by sync state. It does not merge
  independent source cursors or present pending intent as a server document.
  After create the route selects its actual command state.
- Local-command paging uses only existing offline_orders_v1/local_commands.
  Its keyset cursor binds account, revision, filter, limit and command-event
  watermark. Local LIKE search uses permitted fields with literal wildcards,
  never arbitrary JSON. This local search is not accent-insensitive.
- Full detail requires home.read and home.orders.read as well as orders.read;
  it validates the completed feed and reads full order lines, with same-account
  command intent taking precedence. No snapshot-array/native-source fallback.
- Detail returns only explicit order presentation fields. No raw customer phone,
  address, payment credentials, employee documents or arbitrary order fields.
- Financial detail additionally requires signed `home.read`, `home.debt.read`,
  `home.orders.read`, `home.cashflow.read`, `home.imports.read`, `customers.read`,
  `customers.history.read`, `customers.history.orders.read`, and
  `customers.history.payments.read`. Missing names are reported verbatim.
- Ledger reads every relevant customer order, all customer payments and expenses,
  the customer opening balances, and all tenant warehouse imports (the original
  supplier matcher also uses name/phone). Bounded SQL pages run in one consistent
  transaction. Only then does it call the original
  `buildCustomerReconciledLedger` from productCRMShared. It returns aggregate
  balances and order allocations, not raw financial histories.
- Completeness is for the downloaded, counted feed checkpoint, not a claim of
  live server freshness. Partial counts/checkpoints or pending customer/order
  mutations suppress balances. Accepted local Orders not yet in that completed
  feed also suppress financials. Financials are not derived from directory pages,
  `paidAmount`, incomplete customer-history date windows or zero fallbacks.

## Supported writes and server path

Manual create requires signed orders.create/orders.read/home.read plus the exact
requiredCapabilities advertised by business.sources for customers, products and
employees. Current catalogue scopes include home.debt.read + customers.read,
home.stock.read and home.payroll.read. Missing scopes disable create with their
exact names; they are never expanded from role or home.read. Creation also needs
active same-tenant customer/products/employees and a signed
actor employee ID. Explicit actual/billing quantities, units and price go through
the existing `buildCustomerProductBillingSnapshot` and
`validateOfflineOrderDocument`. It queues a draft with no payment, fee, warehouse
dispatch, Zalo queue or fabricated server confirmation. A stable order ID and
creation timestamp survive UI retries. Existing immutable command payloads win
over later catalog changes; changed intent with the same ID is rejected.

The existing route is `POST /sync` with `command.kind === 'order.create'`:
`src/data/offlineCustomerTransport.js` →
`performance/home-offline/start-workspace-services.mjs` (sync branch) →
`functions/offlineOrderCommands.cjs`. Server authorization rechecks the active
actor and original `orders/create_manual_order` role permission; references and
the immutable receipt are validated transactionally. The generic customer API
alone does not dispatch Orders commands. A native-isolation actor is explicitly
read-only on that service. Do not enable create on a different endpoint merely
because it accepts customer commands.

Only note edit and archive/restore have the bounded CAS sidecar below. Quantity /
price edits, hard delete, payment recording/QR, warehouse creation, fees, returns,
customer reassignment and delivery adjustments remain disabled. Offline save
displays pending status; only an accepted receipt promotes
it to SYNCED. An uncertain commit keeps the form intent/ID fixed for retry or
directory reconciliation.

## CAS note/archive sidecar: exact owner wiring

The root `functions/offlineOrderCommands.cjs` and actual-source
`src/data/offlineOrderRepository.js` now dispatch order.update/order.archive;
the original order.create path and its document/receipt bytes are preserved.
The same existing local_commands, Outbox, dependencies and transaction owner
carry these mutations. Two additive tables retain the metadata projection and
immutable mutation receipts; no connection/database/schema reset is created.

Main owns these integration changes; none was made by this sidecar:

1. Add authorizer kind mappings `order.update → orders.update` and
   `order.archive → orders.archive` without changing any signature, session,
   clock or scope checks.
2. Issue orders.update only when the ORIGINAL
   `hasCompanyRolePermissionAction(subject,'orders','edit_order_items')` passes;
   issue orders.archive only for original `orders/delete_order`. There is no
   original archive-specific action. The archive cap deliberately requires the
   more conservative delete action. Do not infer either from home.read,
   orders.read/create, or the legacy UI's own-draft convenience exception.
   `edit_order_quantity_price` is NOT mapped to note edits or this sidecar.
3. Extend the live POST /sync dispatch allowlist to exactly order.create,
   order.update and order.archive. Pass
   `hasCompanyRolePermissionAction: projector.hasCompanyRolePermissionAction`
   to createOfflineOrderCommandService. The mutation handler independently
   re-reads offlineHomeActors, offlineCustomerAccess, company and employee in
   its Firestore transaction and checks current tenant/revision/cap/action.
   The old create-only authorize callback is not reused as mutation authority.
4. Route both mutation receipts through the same concrete Orders repository's
   applyReceipt, rather than Customer receipt hooks. Notify topic orders for
   claim/receipt/failure. `runtime.notifySync()` already exists and is called by
   the Orders route after an explicitly saved metadata mutation.
5. Only after those pieces are genuinely wired, pass the following option to
   the EXISTING createOfflineOrderRepository construction:

   ```js
   mutationProtocol: {version: 1, serverCAS: true, receiptDispatch: true}
   ```

   Without every flag, UI mutations remain disabled and direct calls fail closed.
   No new runtime getter is required: the existing runtime.orderProduct returns
   the product helper, whose `change(request)` calls concrete.update/archive.
   The existing orders facade still needs only repository()/create().

The root server's default mutation-domain loader points to the actual nested
source `src/features/orders/orderMutationProtocol.js` in this workspace. If the
server is packaged/exported elsewhere, pass `loadMutationDomain: () => import(...)`
resolving THAT same reviewed module. Do not resolve the older root-src POC.

Payload version 1 contains immutable baseFingerprint/baseRevision/baseCommandId,
editedAt, patch and optional resolvesConflictId. CAS fingerprints cover the raw
original server body with its document ID supplied virtually when absent; a
legacy missing ID is never written back merely to edit metadata. A missing
offlineRevision is 0; accepted mutations increment it. The fingerprint is always
required as well as revision, so legacy Online writes retaining the same revision
cannot be silently overwritten. A dependency uses the authoritative accepted
parent receipt fingerprint. Raw credentials are included in CAS but redacted
from returned snapshots using the existing Home-feed redaction rule.

Note patch allows exactly `{note: string}` and updates the existing updatedAt /
zaloContentEditedAt invalidation fields. Archive/restore allows exactly
`{isArchived: boolean}`, mirroring original handleToggleArchive; no related
payment, expense, stock row or immutable command is deleted. Neither operation
recalculates or fills historical line quantity/unit/price fields. Original
summarizeOrderBillingItems is used only when explicit saved billing inputs are
complete; incomplete legacy billing remains visibly incomplete. Monetary,
payment, fee, return, reassignment and stock changes are rejected explicitly,
because handleEditOrder also coordinates loyalty, linked expense/payment writes
and payment/share assets. Those effects have not been replaced by a generic patch.

The editor pins the exact body it opened. A changed local/source body requires
review, not silent rebase. One unresolved metadata mutation per order is allowed;
an edit behind a pending create waits on that create's immutable command ID.
If that create fails/conflicts, its child stays blocked and requires create
reconciliation; the sidecar does not overwrite a colliding server order or
pretend the create succeeded. Direct CAS conflicts retain their original command,
Outbox and receipt. The UI shows server note/archive state and can submit an
explicit NEW CAS decision against the authoritative conflict snapshot. A later
server change conflicts again. Missing server orders are never recreated.

Accepted metadata projections stop masking a completed source once it contains
that revision or newer, including legacy writes which retain the revision.
Ledger balances are withheld while pending/conflicting or awaiting a completed
feed checkpoint. Rollback to an old create-only APK must not replay new mutation
receipts through Customer hooks: use a protocol-aware build and retain the DB,
Outbox and receipts; never clear them to make rollback appear successful.

## React.Activity and native screen back

The route caches only its visited scope's adapter/state. Activity effect
reattachment rechecks grants without resetting repo, page, cursor, detail,
selection, manual-create draft, note/archive draft or pending search text. Only
an ACTUAL query/scope identity change resets pagination. Confirmed rows remain
visible while same-query revalidation runs; mismatched/unvalidated query actions
are disabled. Source checkpoint errors preserve context for explicit restart.
Subscriptions accept only orders/completed Home-data topics, not home-status or
home-progress; receipts refresh data without clearing selection/drafts.

OrdersWorkspace calls the existing useAppScreenBack hook; there is no native
backButton listener and no extra parent DOM listener. Back closes an active
create/edit form first (confirmation for a dirty draft, busy save blocks close),
then detail, then filter panel. Otherwise it returns false for main's Home
fallback. Activity detaches/reattaches those existing effect listeners normally.
Scope loss unmounts this account's view; no state is shared across principals.

## Focused checks

From workspace root:

```powershell
node --test test-results/firebase-home-release-20261107/source/src/features/orders/sqliteOrderDirectory.test.mjs
node --test tests/offline-order-metadata-cas.test.mjs
```

Uses isolated in-memory SQLite, Goodall's actual shared directory, the existing
schema/command repository,
and AST-extracted original production ledger calculations. Covers pagination,
literal search/filtering, tenant/principal isolation, field projection,
incomplete sources, financial subcapabilities, complete histories beyond a page,
supplier reconciliation, atomic Outbox creation, immutable retries, authoritative
receipt merge and stale cursors, source-metadata diagnostics, CAS rollback,
immutable metadata retries, explicit conflict resolution, pending-create
dependencies, protection against later server edits, and retained Activity/query
identity. The root server tests use the AST-extracted actual original role
checker and assert original create document/receipt bytes, raw-body CAS,
transaction rollback, scope and credential redaction. Current result: 23/23 pass.
No protected crypto tests, app builds, ADB or services.
Main agent still owns native navigation integration and dev34 device regression.
