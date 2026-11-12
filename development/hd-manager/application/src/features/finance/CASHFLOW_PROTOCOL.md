# Development manual cashflow sidecar — integration contract

This is implemented source, not a live endpoint or an issued grant. Main owns
HTTP dispatch, grant issuance, runtime/bootstrap, permission maps, and navigation.
No protected Customer/Order protocol or financial formula was edited.

## Bounded operations and original authority

These **new proposed** signed capabilities equal the command kind. They are not
present in read-only grants and must not be fabricated on the client.

| Command / capability | Original Finance role action |
| --- | --- |
| `cashflow.income.create` | `create_income` |
| `cashflow.income.update` | `edit_income_voucher` OR `edit_cashflow` |
| `cashflow.expense.create` | `create_expense` |
| `cashflow.expense.update` | `edit_expense_voucher` OR `edit_cashflow` |

All operations additionally require `home.read` and `home.cashflow.read`.
Original owner-account recognition can satisfy the role predicate; it does not
replace explicit command capabilities. Check fresh original authority inside
every server transaction, including idempotent receipt retries. Grant issuance
must verify the same real role actions and supported domain eligibility first.
There is no QA identity exception.

Manual income is **always** `employee_reported_income`, `requiresApproval:true`,
`approvalStatus:pending_handover`, `handoverStatus:pending`. This is a report, not
posted debt recovery. Income requires the original
`isOrderCodeAutoMatchEnabled(company)` to be false. Do not disable company
matching for QA: when enabled/default-enabled, the original auto-match workflow
is required and the sidecar rejects income. Approved income creates would need
`buildPaymentConfirmationWrites` and its complete-ledger notification/Zalo
effects; those are deliberately unsupported.

Manual expense creates derive approval from original `approve_driver_cashflow`:
approved `manual_accounting_expense` for authorized approvers; otherwise pending
`employee_reported_expense`. Updates preserve existing approval/source and edit
only amount/day/note/category, or amount/day/note/customer/method for income.
Only the actor's own simple manual vouchers are editable. Driver positions use
the original delivery flow and are rejected via original
`isEmployeeDriverPosition`; main must not issue these manual capabilities for
that unsupported workflow. No debt repayment, asset/delivery linkage, bank
imports, payment intents, approval/rejection, delete/archive, or cross-employee
editing is supported. Unsupported operations throw instead of returning success.

Amounts use original `parseLooseMoneyValue`, restricted to positive finite safe
whole VND in this sidecar. There is no rounding or new money formula. Notes and
categories use original normalizers; dates are explicit valid calendar days,
not a fallback to today. No partial-page ledger/balance computation occurs.

## Server factory (root backend file)

`D:/quản lý bán hàng 1/functions/offlineCashflowCommands.cjs`

```js
const {createOfflineCashflowCommandService} = require('./offlineCashflowCommands.cjs');
const applyCashflow = createOfflineCashflowCommandService({
  db, projectId, appId,
  authorize, // async (tx, actor, {kind, capability}) => access, described below
  policy: {
    hasCompanyRolePermissionAction: original.hasCompanyRolePermissionAction,
    isOwnerAccountUser: original.isOwnerAccountUser,
  },
  domain: {
    parseLooseMoneyValue: original.parseLooseMoneyValue,
    capitalizeFirst: original.capitalizeFirst,
    normalizeLeadingLabel: original.normalizeLeadingLabel,
    normalizeExpenseCategoryLabel: original.normalizeExpenseCategoryLabel,
    isOrderCodeAutoMatchEnabled: original.isOrderCodeAutoMatchEnabled,
    isEmployeeDriverPosition: original.isEmployeeDriverPosition,
    CASHFLOW_APPROVAL_STATUS: original.CASHFLOW_APPROVAL_STATUS,
  },
});
// In the EXISTING authenticated dispatcher, for the four exact command kinds:
// return applyCashflow(verifiedActor, request.body.command);
```

Factory requires `demo-*` project plus local `FIRESTORE_EMULATOR_HOST`, and
accepts a Firestore-compatible `doc`/`runTransaction` adapter. It has no HTTP
export, service startup, grant signer, or Production registration.

`authorize` MUST transaction-read the current identity, company, employee,
role policy, and command capabilities. A client-supplied role/snapshot, cached QA
profile, or callback returning unconditional authority is invalid integration.
Return:

```js
{
  subject: {company, employee, currentUser},
  capabilities: verifiedCurrentCapabilities,
}
// company.id === actor.tenantId
// employee.id === currentUser.id; employee.companyId === actor.tenantId
// currentUser.firebaseUid === actor.uid; currentUser.companyId === actor.tenantId
```

The service independently invokes original role predicates, re-reads the employee
relation and income customer relation, verifies tenant/archive status, validates
the complete whitelist, then reads the existing receipt and voucher. All reads
precede writes. A successful business document and receipt are committed in one
Firestore transaction. Retry returns the same receipt only after reauthorization.

Envelope: existing `{commandId,idempotencyKey,kind,entityId,baseRevision,
payloadDigest,payload}`; `payload={input,baseRevision,baseFingerprint?,
resolvesConflictId?}`. Digest is SHA-256 of the exact `JSON.stringify(payload)`.
Updates require both `offlineCashflowRevision` (legacy default 0) and canonical
whole-document SHA-256 to match the live voucher. Receipt idempotency binds actor,
tenant, key, kind, entity, base revision and digest. Conflicts are durable receipts
with the current own-voucher snapshot/fingerprint/revision; no silent rebase.

## Same native owner and SQLite queue

```js
const cashflow = await createOfflineCashflowRepository({
  database, session, deviceId, digest, uuid, authorize, // EXISTING owner objects
  projectId, development: mode === 'emulator',
  employeeId: runtime.appSession.currentUser.id,
});
<OfflineFinanceWorkspace runtime={runtime} directory={directory}
  cashflow={cashflow} onNavigate={onNavigate}/>
```

The optional ready `cashflow` prop is preferred; `runtime.cashflow` may instead
be a ready instance if main chooses that interface. The UI calls no new runtime
getter and does not instantiate the factory. Main may attach a lazy factory
inside its existing owner and await it before passing the ready prop. Do not
create a second runtime, database, sync engine, transport, or listener.

The repository uses the existing signature verifier with `kind:'home.read'`,
then checks the exact signed command capability, scope, employee identity, source
profile and expiry. It does not need to weaken the shared authorizer map.
Authorization brackets local transactions and is rechecked before durable commit.
Factory adds one module-owned `offline_cashflow_v1` table in the SAME database.
The existing `local_commands`, Outbox trigger and immutable-intent rules remain
unchanged. Intent, queue entry and overlay commit or roll back together.

Main must route authoritative receipts **once**, through the existing sync
owner's receipt dispatcher:

```js
async function applyReceipt(scope, command, receipt) {
  if (Object.values(CASHFLOW_COMMANDS).some(kinds =>
    Object.values(kinds).includes(command.kind))) {
    return cashflow.applyReceipt(scope, command, receipt);
  }
  return existingReceiptProcessor(scope, command, receipt);
}
```

Do not first apply the generic receipt and then apply it again. The module's
method wraps the same original command receipt transaction, checks the result's
identity/digest/intent/revision, and atomically updates its overlay. The existing
global command claimant/retry engine leases these commands unchanged; failure
states are read by joining `local_commands`. Protected Customer/Order handlers
retain their existing branches. Connectivity notification uses the existing
`runtime.notifySync`; scheduling failure never changes a durable-save result.

Repository methods:

```js
create(source, input, entityId); // source payments|expenses; stable entity on retry
prepareEdit(source, id);        // returns full-source-derived proof + allowed input
update(proof, input);
page({limit:40});               // bounded overlay/status list, not accounting input
resolveConflict(source, id, input, {
  commandId, currentFingerprint, currentRevision, // exact server version user saw
});
applyReceipt(scope, command, receipt);
```

`prepareEdit` reads complete authorized completed Home-feed JSON or a complete
accepted receipt; it NEVER seeds edits from directory previews. Local source
changes invalidate the proof without replacing a draft. Server changes after
queueing produce a CAS conflict. Resolution creates a new command against the
exact viewed conflict; original command and conflict remain in history. A newer
conflict invalidates the resolution proof and leaves the input untouched.

The UI reports a durable local save as **pending server confirmation**. It shows
server confirmation only after an actual accepted receipt. Home-feed pages and
local overlays remain separate; neither supplies partial-ledger totals.

## Activity and Back behavior

`useAppScreenBack` is the only added Back integration; no raw native listener.
Back closes the retained editor first, preserving its controlled input, then
closes detail. Root fallback Home remains main's responsibility. The editor is
under `React.Activity` and has no effect that seeds or overwrites its draft.
Background Home/receipt updates never replace the draft or its revision proof.
Opening another voucher while a draft exists resumes that draft instead of
discarding it. Only explicit **Bỏ bản nhập** discards it.

Source list reattachment checks actual runtime/directory/query identity and the
completed query/reload refs; it does not reset rows/cursors on Activity return.
Explicit refresh keeps old same-query rows visible and marks pending; errors
retain those rows but block their actions until source revalidation succeeds.
Async edit preparation has its own ticket, invalidated by Back/another intent.
No form default depends on effect attachment.

## Checks and remaining host work

```text
node --test src/features/finance/offlineFinanceModel.test.mjs src/features/finance/offlineCashflowProtocol.test.mjs
```

Focused tests exercise original extracted normalizers/driver detection, injected
role-policy denials, atomic server writes, CAS/idempotency/conflicts, shared SQL
Outbox/overlay rollback, receipt failure recovery and signed-capability revocation
during local commit. Fake server adapters and in-memory SQLite fixtures are used;
these are not a claim of live Firestore or native acceptance.

Main still needs authenticated dispatcher and receipt routing, original policy
injection, real grant eligibility/issuance, optional repository attachment, and
native visual/Back/Activity validation in a future build. All controls remain
disabled without the ready protocol + emulator build + explicit signed grant.
No build, ADB, service mutation, Production operation or commit was performed.
