# Dispatch offline boundary — frozen for main integration after dev47

Owned files only (all new; dev47 artifacts and all shared files untouched):

- `src/features/warehouse/dispatchOriginalCustomerRules.js`
- `src/features/warehouse/dispatchOriginalBranchRules.js`
- `src/features/warehouse/warehouseDispatchOriginalPlan.js`
- `src/features/warehouse/warehouseDispatchOfflineProtocol.js`
- `src/features/warehouse/OfflineWarehouseDispatchEditor.jsx`
- `src/features/warehouse/OfflineWarehouseDispatchQueue.jsx`
- `src/features/warehouse/warehouseDispatchOfflineEditor.test.mjs`
- `src/data/offlineWarehouseDispatchRepository.js`
- This contract, `src/features/warehouse/warehouseDispatchOfflineContract.md`

The source paths above are relative to `test-results/firebase-home-release-20261107/source`.
Two additional new root files:

- `functions/offlineWarehouseDispatchCommands.cjs`
- `tests/offline-warehouse-dispatch.test.mjs`

## Supported business operation

Explicit outside-order-request, single-row, legacy document dispatch create;
quantity/weight/note/driver update of an unlinked row with a complete existing
billing snapshot; and archive of that same bounded record class. Customer,
product, branch and date reassignment are deliberately unsupported on update.

Create ID remains the original `wd_${tenantId}_${mutationId}`. Pure planners
reuse the original dispatch use-case statements with injected deterministic
clocks, original customer/branch configuration declarations and original
coordinateDispatchBilling/customerProductBilling helpers. Existing dispatch
frozen pricing wins over current pricing on edit. Weight billing aliases retain
the original update behavior. Historical missing units/prices are never repaired.

A dispatch save does NOT generate orders, payments, expenses, delivery reports,
shortage closure, order-request mutation, stock-count writes or product repricing.
Those are separate original workflows. Dispatch projection + immutable command +
existing Outbox commit in ONE transaction on the existing per-account SQLite
owner. Pending-create edits carry a real command dependency; old create receipts
do not replace newer local intentions. Queue states remain explicitly unconfirmed
until an accepted authoritative receipt. An optional onQueued callback is never
awaited for network confirmation.

Server CAS compares full original body + revision, including legacy revision 0;
receipt + dispatch + per-product serialization fence commit atomically. Immutable
receipt replay verifies current signed access and real company/employee role
policy, but never rewrites an edited document. Reviewed conflict resolution uses
a new command tied to the original immutable conflict receipt. No LWW/rebase.

## Exact main-owned composition contract

Server factory (root new sidecar):

`createOfflineWarehouseDispatchCommandService({db,projectId,appId,hasCompanyRolePermissionAction,now?,loadDomain?})`

returns `apply(actor,command)`. Actor is `{uid,tenantId,permissionRevision}`;
command is the existing claimed Outbox envelope. Wire ONLY the three exact kinds
`warehouseDispatch.create/update/archive` through the existing Development sync
handler; do not export a generic writer. Default domain loader points to the
actual nested source. Requires demo-* project and explicit localhost emulator
host. Existing DB project must match. No service was started by this work.

Client async factory:

`createOfflineWarehouseDispatchRepository({database,session,deviceId,employeeId,authorize,authorizeWrite,digest,uuid,projectId,development:true,business,protocol,onQueued?,onStateChange?,now?})`

Use the SAME existing encrypted SQLite owner, verified session/device/employee,
existing core schema and existing Outbox worker. No new connection, database or
queue. `authorize` is the existing signed read verifier; `authorizeWrite` MUST
perform full signature authorization and accept the three new command kinds.
It must return verified projectId, expiresAtMs, four scope keys, capabilities and
appSession.user.id/companyId, matching the existing import repository contract.
Read calls use home.read. Source profile isolation models are rejected.

Required ready proof, default fail-closed until main explicitly supplies it:

`{version:1,serverCAS:true,atomicOutbox:true,receiptDispatch:true,serverStockValidation:true,outsideRequestOnly:true}`

Main must dispatch authoritative receipts to `repository.applyReceipt(scope,
claimedCommand,receipt)` within the normal worker lifecycle. Route state/receipt
notifications through `warehouseDispatches` AFTER commits. Editor and queue
subscribe only to this topic. Do not await network in the local save path.

Signed capability requirements (NOT grants supplied by these files):

- Read: home.read, home.dispatches.read, home.stock.read, home.debt.read, customers.read.
- Driver directory/read: home.payroll.read, only when needed.
- warehouseDispatches.create: original create_warehouse_dispatch OR create_dispatch_without_order_request; this bounded create ALSO requires the outside capability/action below.
- warehouseDispatches.update: original edit_warehouse_dispatch; this bounded edit ALSO requires outside capability/action.
- warehouseDispatches.archive: original current/history deletion policy; server checks the exact date-dependent action.
- warehouseDispatches.createWithoutOrderRequest: original warehouse_dispatch/create_dispatch_without_order_request.
- warehouseDispatches.archiveHistory: original warehouse_dispatch/delete_dispatch_history_detail, required for any date other than server today.

All actions above belong to module warehouse_dispatch. Server requires actual
view_warehouse_dispatch too. It loads current company/employee and calls the
injected original effective role-action policy, including individual overrides.
Capabilities never derive from home.read. Signed names must be mapped by main;
new files issue no grants and remain nonactionable if missing.

Repository API: preview(draft,{base,mutationId,editedAt}); create(draft,options);
update(id,draft,options); archive(id,options); detail(id,{preferFeed});
page({after,limit<=25}); lookup(source,input); applyReceipt(scope,command,receipt).
Create/update options MUST contain the exact expectedPlan shown by preview.
A changed relation/price after preview rejects local enqueue; server repricing
also conflicts instead of invisibly changing the accepted plan.

Editor default props: `{runtime,repository,id=null,onClose,onSaved,closeRequestRef,
readSource='local'}`. Queue default props: `{runtime,repository,onOpen}`.
Main list opens use readSource='feed'; queue opens use 'local'. Mount editor with
React key derived from verified scope + id/create identity + readSource. A retained
instance fails closed if its identity changes. Same-identity Activity hide/show
preserves draft/preview/CAS, detaches listeners and revalidates status. Existing
useAppScreenBack closes picker first, prompts for dirty drafts and blocks close
during SQLite commit. No native back listener is installed. onSaved means LOCAL
queue acceptance, not server stock confirmation. Shared business.page owns bounded
lookup/search; no duplicate source-directory engine was introduced.

## Stock and unsupported operation boundaries

Acceptance queries complete CURRENT tenant warehouseImports, warehouseDispatches,
warehouseStockCounts, orders and deliveryReports inside the server transaction.
It uses the exact original productStockBalance/measureQuantity, explicit product
stock unit/opening and all current import/dispatch history, not a client page or
feed checkpoint. A product fence serializes competing sidecar commands; existing
history mutations participate in the transaction read set. Stock shortage yields
an immutable conflict receipt without a document/stock write. Client pending rows
are not confirmed stock reservations. There is no pretend complete server feed.

Stop with dispatch-unsupported-contract for ledger/VPS/mixed ledger stock;
request-linked or provenance-unknown records; invoiced or delivery-report-linked
rows (including server reverse relations); counted/reset stock; unknown actual to
stock-unit conversion; historical incomplete billing; and customer/product/branch/
date reassignment. These need the ORIGINAL matching/shortage, invoice/delivery
reconciliation, counted-inventory snapshot/reset/rebase, or ledger/reversal
contract respectively. No partial business write is substituted.

## Verification

27 focused tests passed:

`node --test tests/offline-warehouse-dispatch.test.mjs test-results/firebase-home-release-20261107/source/src/features/warehouse/warehouseDispatchOfflineEditor.test.mjs`

Covers exact original planner parity; stock competition and 130-history input;
body-only legacy CAS; immutable replay after edits; price-relation conflict;
current/history permissions; linked/ledger/count/reset denial; server and real
Node SQLite rollback; Outbox atomicity/reopen; pending-create dependencies; receipt
validation/rollback; missing checkpoint/count/scope/caps; no network await; Activity,
preview confirmation, pinned draft/CAS, back behavior and uncertain immutable retry.

All ten new code/test files passed JSX-aware focused lint (no unreachable code,
duplicate keys or unused variables, with conventional React JSX import exemption).
Server concurrency was checked with an in-process serializable transaction model;
REAL Firestore-emulator integration/concurrency and actual native UI remain main's
integration checks before asserting serverStockValidation readiness. No build,
ADB/device action, service/network operation, commit or Production action ran.

## Follow-up transaction review — refrozen

No read-after-write violation was found: each conflict write returns immediately;
all accepted-path gets/queries precede the fence/document/receipt writes. The
transaction test adapter asserts this ordering on every executed branch.

Three reproduced defects were corrected, without historical field repair:

- totalKg could survive an actual-weight edit and mask weightKg in the original
  stock calculator. Conflicting aliases now fail closed before any write.
- items:[] on a scalar legacy dispatch could make the original stock calculator
  ignore all its scalar quantities. Target records with this shape are refused;
  active historical rows that would hide positive scalar stock are also refused.
- archive receipt replay returned before the date-dependent delete-role check.
  Exact current/history authority is now checked against the pinned base before
  receipt replay and against the live document on initial execution.

Additional passing regressions verify archived imports add no stock, archived
scalar dispatches retain historical quantity but debit zero stock, archive replay
cannot release stock twice, and concurrent update/create across principals share
the product fence. Ambiguous archived historical quantities are excluded exactly
as in the original calculator. Concurrency evidence remains an in-process
serializable model, not a claim of live Firestore-emulator execution.

## Actual Development integration after immutable dev50 (next-build WIP)

The existing Runtime, NativeBusinessRoute and OfflineWarehouseWorkspace now wire
the bounded Dispatch repository/editor/queue. This is NOT completion of the
request-linked dispatch workflow. The UI explicitly labels the outside-request
subset, and all previously unsupported stock/billing/order-link cases remain
fail-closed. No existing records, database owner, queue, encryption or session
protocol was replaced.

Goodall explicitly handed bootstrap ownership to this integration and performed
a read-only spot review afterward: no blocker found; existing gate/search/schema
and cleanup wiring preserved. Dispatch is dynamically imported only after the
qualified warehouse screen has completed its initial read; editor/queue modules
are lazy. The Runtime passes the existing owner/session/directory/read verifier/
full write verifier/foreground gate. Claim, receipt and failure notifications use
only warehouseDispatches. A local onSaved callback is not server acceptance.

Additional/modified integration files (actual source-relative unless root noted):

- src/data/bootstrapOfflineCustomer.js
- src/data/offlineCustomerGrant.js (only three kind-to-capability entries)
- src/data/warehouseDispatchRuntime.js (new, lazy same-owner composition)
- src/layout/NativeBusinessRoute.jsx
- src/features/warehouse/OfflineWarehouseWorkspace.jsx
- src/features/warehouse/warehouseDispatchAccess.js (new lightweight constants/gate/labels)
- src/features/warehouse/warehouseDispatchOfflineProtocol.js (constants re-export)
- src/features/warehouse/OfflineWarehouseDispatchEditor.jsx (lightweight gate import)
- src/features/warehouse/OfflineWarehouseDispatchQueue.jsx (lightweight labels, disabled/refresh props)
- src/features/warehouse/warehouseDispatchOfflineEditor.test.mjs
- src/features/warehouse/warehouseDispatchIntegration.test.mjs (new)
- src/features/warehouse/offlineWarehouse.test.mjs (two stale assertion updates verified against immutable50; no test removed)
- this contract
- ROOT functions/offlineWarehouseDispatchCommands.cjs (original role-derived grant capability mapper export)
- ROOT performance/home-offline/start-workspace-services.mjs (Development dispatcher + capability provisioning)
- ROOT tests/offline-warehouse-dispatch.test.mjs (actual Runtime/dispatch routing tests)

Development startup changes are source preparation only. Main must restart the
EXISTING approved Development service from
performance/home-offline/start-workspace-services.mjs with its retained export,
then obtain/securely store a fresh signed grant through the existing online flow.
No server or grant was changed in live state by this work. Old running dev47
server processes and old stored grants cannot expose these new write controls.
The server imports ROOT functions/offlineWarehouseDispatchCommands.cjs, whose
default domain loader is the ACTUAL nested source
src/features/warehouse/warehouseDispatchOfflineProtocol.js plus its original pure
helpers. It does not load an old root src POC or source/functions copy.

New signed capabilities provisioned ONLY through original current role actions:
warehouseDispatches.create, warehouseDispatches.update,
warehouseDispatches.archive, warehouseDispatches.createWithoutOrderRequest,
warehouseDispatches.archiveHistory. The current/history distinction and mandatory
outside-request authority are still checked transactionally on the server.
Native-isolation B remains read-only. Re-auth/regrant is required; never patch a
stored grant or invent a local permission. No allowlist widens the server role.

Focused source checks now include actual bootstrap syncRepository execution with
real Node SQLite and modeled authoritative receipts; route content-first gates;
actual workspace create/detail/queue handlers and back/draft retention. The two
old warehouse test assertions (employee SQL shape and standard Boolean global)
were byte-identical in immutable dev50; both were corrected with all behavioral
checks retained. Native/performance acceptance is still main-owned.

Prepared, NOT EXECUTED evidence driver:
test-results/workspace-startup-20261108/drive-dispatch-native-dev51-proof.mjs
It pins immutable dev51 manifests/identity, actual source hashes, installed APK
hash and a main-supplied restarted-server manifest. Default invocation performs no
device action. Main must supply approved EXISTING customer/product/stock fixture
and expected prices, physically set network state, and handle A/B login. Phases:
offline-create -> offline-restore -> sync -> replay -> tenant-b. Creation uses
trusted CDP input into the actual product form and its preview/save buttons; no
private create/update/archive hook is called. It preserves exclusive phase
journals, stops on uncertain mutation, and never seeds/resets/clears data. The
only driver write HTTP calls are exact immutable replay and cross-tenant denial.
The driver has not been imported/executed; only node --check and host lint ran.
