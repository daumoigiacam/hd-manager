# Save and background-sync audit

## Status

PARTIAL IMPLEMENTATION, not full-app acceptance. This change removes the remote
acknowledgement from independent document saves. It deliberately does not convert
dependent financial/account workflows into falsely successful offline operations.
No production data, database rules, deployment, signing or Git push was performed.

## Evidence and root causes

- The shared saveDataDocument previously tried the SDK first and only queued
  after timeout/quota failures. Its default SDK wait is 4500 ms; a REST fallback
  can add another wait. These are code-path limits, not measured user latency.
- Several handlers bypass the shared writer with direct setDoc calls.
- Order request handlers additionally awaited requireSharedWriteConfirmation.
- The existing pending queue replaced an entire pending payload when another
  partial edit arrived, losing unsent fields from the earlier edit.
- src static inventory: 197 write entry points: 64 saveDataDocument, 123 setDoc,
  9 runTransaction, 1 deleteDoc. These include wrappers and mocks, not 197 buttons.
  26 call sites are eligible for the local-first collection policy. Eligibility
  still depends on payload, tenant and caller confirmation requirements.
- Reproduce inventory: node scripts/audit-save-paths.mjs. Detailed file/line/owner
  listing: test-results/save-path-inventory.json. Dynamic/SDK service calls and
  every visible button are not exhaustively covered by this static inventory.

## Implemented

Eligible collections: customers (without account credentials), products,
orderRequests, warehouseDispatches, warehouseStockCounts, pricingInputs,
pricingRules, pricingScenarios, deliveryReports, assets and holidays.

1. Validate and scope to the active company.
2. Serialize and verify the pending write in localStorage before shared-writer
   optimistic UI updates or returning local acceptance.
3. Retain a revision, stable document ID and the complete unsent payload.
4. Return queued:true without awaiting network; reuse the existing sync worker.
5. Retry upon the browser online event as well as the existing worker schedule.
6. Keep failed writes; distinguish queued from server-confirmed metrics.
7. Preserve fields across partial edits, including nested maps and arrays.
8. Block ambiguous map-replacement coalescing instead of silently resurrecting
   removed fields. The earlier write must sync before retrying that edit.
9. Storage-full failures reject instead of pretending the save succeeded.
10. Order request background handlers now await durable local acceptance before
    returning. Foreground create/edit paths no longer await queued remote ACK.

Date/SDK transform objects, field masks and credential-bearing payloads are not
eligible for the new local-first branch. Existing remote paths remain in place.

## Remaining work by workflow

| Workflow | Current handling / reason not accepted as fully local-first |
| --- | --- |
| Sales invoice create/edit/delete | Remote confirmation retained; linked fees, payments and loyalty updates require a durable grouped command, not independent early success |
| Warehouse imports | Import and expense records are written separately; need atomic/grouped replay before changing acknowledgement semantics |
| Asset costs | Asset cost log and linked expense require grouped replay |
| Payments, receivables, advances, payroll | Financial and closing invariants require server confirmation; not converted |
| Employee accounts, customer login, company/security settings | Identity provisioning, authorization and uniqueness require server confirmation; not converted |
| Chat, Zalo, uploads, external sharing | External side effects/upload acknowledgement; not converted |
| Deletes and special archive flows | Some call direct setDoc/deleteDoc or explicitly await confirmation; inventory lists remaining paths |
| Multiple browser tabs/devices | Existing localStorage queue is not a cross-tab transactional command store; concurrent-tab acceptance remains unverified |

Pending data only survives while browser/app storage is retained. Closing an app
does not guarantee execution of JavaScript in the background: synchronization
continues while running or after reopening with a valid session and connection.

## Validation

- npm run test:all: PASS, including 10 save-critical-path tests.
- Explicit ESLint for App.jsx, localFirstSave.js and save-critical-path tests: PASS.
- npm run typecheck: PASS (existing payroll-scoped TypeScript project only).
- Firebase cloud production build: PASS.
- Isolated Chromium preview, 390x844: inline order edit 126 ms; create form close
  73 ms; existing visual script also verifies saved data and reload behavior.
  These are preview fixtures, NOT Firebase production latency measurements.
- Shared save/queue executable tests: no remote ACK needed to return local
  acceptance; storage failure prevents UI application; latest revision retained;
  create plus edit survives JSON serialization; old ACK cannot clear a new edit.
- Firestore Emulator: PASS. Three coalesced replay cases equal sequential SDK
  writes; offline latest edit survives; cross-tenant write denied. Existing
  10-collection create/edit/read acceptance also passed (30 samples). Local
  emulator timings: create 5-298 ms, edit 5-30 ms; reconnect plus denial check
  56 ms. This does not measure production or app UI acknowledgement speed.
- Before/after production latency, all-device performance, every form, physical
  iOS/Android and full-app offline acceptance have NOT been verified.

## Changed files for this task

- src/utils/localFirstSave.js: replay policy and safe partial-write coalescing.
- src/App.jsx: durable-first path, reconnect retry, order-request ACK separation,
  customer/asset/holiday handlers routed through the shared writer.
- tests/save-critical-path.test.mjs: executable persistence, failure and merge tests.
- tests/firestore-save-acceptance.test.mjs: compare coalesced replay with sequential
  writes against the isolated Firestore emulator.
- scripts/audit-save-paths.mjs: reproducible structured inventory without payloads.
- This report: scope, evidence and remaining acceptance gaps.

Existing native system-bar/footer edits from the preceding task were preserved.

## Follow-up: linked financial documents and sensitive actions

Implemented after the initial audit:

- Manual invoice creation persists invoice, upfront receipt and seller expense
  as one durable local command. Removed separate fire-and-forget financial calls
  from the draft submission flow.
- Invoice edits group the order, linked fee and changed upfront payment. Payment
  and expense IDs are stable per order. Pending financial rows participate in
  subsequent edits, even before a React render/cloud snapshot.
- Dispatch-derived invoice creation retains its server transaction and duplicate
  dispatch checks; linked financial documents now join that same transaction.
- Import create/edit/archive groups import plus its expense in one local command.
- The queue commits financial groups through a Firestore transaction, never
  individual REST writes. A failed child write rejects the entire group.
- Each entity retains its in-flight lock until the transaction actually settles;
  a UI timeout cannot permit a newer commit to overtake an older one.
- Replay requires the same Firebase UID and tenant. Commands conflicting with
  another pending entity/document write are rejected for explicit retry.
- Payroll retains server-confirmed locking. It now blocks while local tenant
  writes remain pending and rejects rapid duplicate taps via a synchronous ref.
- Employee forms show confirmation progress and reject duplicate submission.
  Profile creation reuses a request ID and transaction, including after an
  ambiguous response. Retry returns the existing profile instead of overwriting
  it. Login credentials are not copied into the local outbox.

Verification: full test:all passed; 13 focused save tests passed; ESLint passed;
cloud production build passed. Firestore Emulator verified three-document atomic
commit, replay with the same IDs, and rollback of an order when its expense write
is denied by rules. Payroll/account tests execute actual extracted handlers with
controlled transaction/network dependencies; they are NOT live identity-provider
or physical-device acceptance.

Remaining limitations: cross-device stale-edit conflict resolution and multi-tab
queue coordination have not been implemented; derived loyalty/QR follow-ups are
best-effort after server confirmation and are not a durable workflow across app
termination. Live identity provisioning, all sensitive-action UI latency and
physical Android/iOS behavior are not certified. This is NOT an absolute or
full-app acceptance claim. Payroll/account creation intentionally do not report
server success while offline. No deploy, push or new APK was performed.
