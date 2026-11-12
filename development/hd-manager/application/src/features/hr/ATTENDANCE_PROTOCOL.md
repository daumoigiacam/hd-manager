# Self-attendance command integration

This is an implementation for Development integration, not APK acceptance or a
deployed server route. No bootstrap, grant issuer, HTTP service, shared directory,
native database or production entry was modified. Payroll writes stay disabled.

## Narrow original behavior

Supported command kinds and **new explicit signed capabilities**:

| Kind / capability | Original action |
| --- | --- |
| `attendance.check_in` | `recordManualAttendance` action `in` |
| `attendance.check_out` | `recordManualAttendance` action `out` |

Both require existing `home.read` + `home.payroll.read`, A's signed source profile
absent/undefined, and the fresh original role action
`company_attendance.check_in_out`. The target must be the signed actor's own
employee ID. `home.read`, role labels or read-route navigation do not grant writes.
Main must add the two exact operation mappings to its signed authorizer/grant
policy deliberately; they are NOT currently inferred from any existing capability.

No correction, leave, proxy/approval, historical timestamp, policy or salary
mutation is supported. In particular, the App's alternate proxy `saveWorkRoleAttendance`
path is not replaced with a generic write. The original self path goes through
`identityRecordAttendance` / `/api/identity/attendance` and
`functions/attendanceManual.js`. That unmodified function executes inside the
new service's outer transaction. It still validates assigned work roles, original
shift/grace/overnight rules, company and employee status, WiFi/GPS/fixed radius,
trusted device, required biometric enrollment, check-in prerequisites, duplicates,
leave collisions and `LOCKED`/`ADJUSTED` payroll periods. No formula was copied.

**The server chooses the actual work date and time at processing.** The form's
date is an expected work-date CAS target, not authority to backdate. If the
server chooses a different work date, no staged attendance/audit write commits.
The receipt reports a conflict. The user must explicitly choose the correct
date/new request; the old intent remains retained.

## Main's server binding

Root export: `functions/offlineAttendanceCommands.cjs`:

```js
const {createOfflineAttendanceCommandService} = require('./offlineAttendanceCommands.cjs');
const applyAttendance = createOfflineAttendanceCommandService({
  db, projectId, appId,
  authorize, // verified actor policy; transaction-scoped reads
  hasCompanyRolePermissionAction, // original App/server role policy
  getAttendanceContext, // ORIGINAL authenticated identity/device + live method
  now: Date.now,
});
const receipt = await applyAttendance({uid,tenantId,permissionRevision}, command);
```

The constructor requires a `demo-*` project and loopback `FIRESTORE_EMULATOR_HOST`,
and rejects a mismatched db.projectId. This module is not registered in index.js.

`getAttendanceContext(tx, actor, command)` must resolve the ORIGINAL authenticated
identity/device path for THIS request, never trust identity fields from command
JSON. Its exact result is:

```js
{
  principalId, // must equal actor.uid
  identityId,  // identity_accounts doc resolved by original authenticated identity
  device: {deviceId},
  deviceSecret, // transient original secure device credential; NEVER Outbox JSON
  method,      // FRESH original WiFi/GPS capture for this actual HTTP submission
  verifyDevice(savedDevice, deviceSecret, freshIdentity, serverAtMs) { /* original verifier */ }
}
```

The service rereads the identity_accounts document and saved device in its own
transaction. `verifyDevice` must be the original manual-attendance credential
logic from `identityCenter.attendance`: trusted, not revoked, credential-version
match, unexpired credential, constant-time secret-hash comparison. Do not supply
a role-only/no-op adapter or a fake `serverVerified` flag. Original required
biometric checks also remain in `recordManualAttendance`. The original verifier
is currently closed over the Identity Center; main must expose/reuse that trusted
adapter rather than weakening or replacing its policy here.

Offline method evidence in the immutable payload is **not used as a live GPS/WiFi
claim**. Main's authenticated transport must collect fresh original evidence
before actual sync submission and provide `context.method`. Missing live evidence
fails with `failed-precondition`, without a receipt or attendance mutation. A
background worker lacking current device/location authentication must leave the
intent unconfirmed and request foreground verification, not reuse old coordinates
or bypass biometric/device requirements. Main owns this transport behavior.

No new arbitrary evidence lifetime or client timestamp rule is introduced. This
is a live original-validated operation when processed, not historical attendance
import. The UI states that distinction before local save.

The service rereads offlineHomeActors, offlineCustomerAccess, company, employee,
identity, device, attendance and payroll period. The fresh role/action and signed
capability policy are checked even for receipt replay. Original attendance and
immutable audit writes are staged, then committed with CAS revision + receipt in
ONE transaction. A fingerprint/revision mismatch discards all staged business
writes and records only a conflict receipt. Both normal online changes and other
work roles are covered by the full source fingerprint; no LWW replacement occurs.

Receipts are immutable under
`offlineAttendanceReceipts/<fingerprint([tenantId,uid,commandId])>`.
Same command ID + digest returns its existing receipt without duplicate audit.
Different payload reuse is rejected. Receipt persistence failure aborts the whole
transaction. Original validation refusals produce a durable rejected receipt,
without attendance/audit mutation. Unsupported legacy credential-shaped attendance
documents fail closed and are never copied into receipts.

## Main's local binding and UI prop

New actual source export: `src/data/offlineAttendanceRepository.js`:

```js
const repository = await createOfflineAttendanceRepository({
  database, session, authorize, digest, uuid, deviceId,
  employeeId: verifiedGrant.appSession.user.id,
  projectId, development: true,
  captureMethod, // original WiFi/GPS provider, no typed coordinates or secrets
});

<OfflineHRWorkspace
  runtime={runtime} directory={directory} onNavigate={onNavigate}
  initialSource="attendance" attendanceRepository={repository}
/>
```

`digest(text)` is the existing SHA-256 hex function. `authorize` must verify new
write kinds against their exact signed capabilities, not treat them as Home read.
Instantiate lazily once per existing runtime owner. No new SQLite connection,
native callback, timer or subscription is created. One additive table,
offline_attendance_overlay_v1, is created in that SAME Dev database at repository
initialization. Existing commands/Outbox, source tables and metadata schema are
not migrated or modified. There is no DDL in the shared directory/read paths.

The prop must be the ready scoped repository, with
`protocol === 'offline-attendance-v1'` and its employeeId matching the signed
current user. Without BOTH that prop and the corresponding explicit capability,
the form cannot be opened. Check-in and checkout capabilities gate independently.

Repository contract:

```js
repository.request({kind,workDate,workRole,reviewedConflict: null});
// => {commandId,state:'PENDING_SYNC',serverConfirmed:false,localDurable:true}
repository.prepare({workDate,workRole}); // exact bounded full-source CAS proof
repository.command(commandId);          // scoped overlay + authoritative receipt
repository.page({limit:20});            // bounded own intent history, max40
repository.applyReceipt(scope,command,receipt);
```

Main's EXISTING sync owner claims the common local_commands/Outbox work. Route
these two kinds to applyAttendance on the authenticated server transport, and
route their receipts to this repository's `applyReceipt`. Candidate scope and
the existing leaseOwner must remain intact. Notify the existing sync coordinator
after a committed request (e.g. a scoped wrapper around repository.request);
do not create a second sync owner or listener.

Existing createOfflineCommandRepository triggers atomically enqueue the command,
Outbox and initial event with the overlay insert. Accepted receipts atomically
update the command state, lease, event and overlay server snapshot. Neither local
intent nor receipt application writes to offline_home_feed_records_v1. An accepted
snapshot can provide a subsequent checkout CAS base before Home delta catches
up. The original server timestamp is the only displayed confirmed hour.

The overlay is append-only per command. Pending requests block a second intent
for that entity. Conflicts retain both the old intent and server evidence; the
user must explicitly view the exact receipt before a NEW CAS request links its
resolvesConflictId. A later server change still conflicts. An authoritative
rejection may also be explicitly reviewed, then a new request uses a fresh base.
Transport/lease failures without an authoritative receipt are not silently reset
or cloned; main's existing same-ID unknown-outcome recovery owns those cases.

Main's account/tenant/session/permission closure still invalidates every async
operation. The controlled attendance draft stays in the retained HR parent;
Back closes it first while preserving its values. Effect detach/reattach does
not enqueue again or refetch unchanged completed read pages/details. The bounded
intent queue and receipt refresh are user actions, with no polling. Payroll,
correction/proxy and approval controls remain disabled.

## Focused host checks

```sh
node --test tests/offline-attendance-commands.test.cjs \
  test-results/firebase-home-release-20261107/source/src/features/hr/offlineAttendanceRepository.test.mjs \
  test-results/firebase-home-release-20261107/source/src/features/hr/offlineHRActivity.test.mjs \
  test-results/firebase-home-release-20261107/source/src/features/hr/offlineHRWorkspace.test.mjs
```

Server tests use a rollback-capable transaction double and the actual unchanged
recordManualAttendance/getShiftWindow/validateMethod path (including the original
exported device validator). Local tests execute real SQLite, existing schema
triggers, existing command repository and Home checkpoint storage. They cover
fresh policy/device checks, full CAS conflicts, atomic audit/receipt rollback,
idempotent replay, live-method requirements, original role preservation, local
enqueue/receipt rollback, explicit review, capability gating and Activity/Back.
These are NOT Firestore-emulator, HTTP, APK, location-device or native acceptance
results. No services/builds/ADB were run.
