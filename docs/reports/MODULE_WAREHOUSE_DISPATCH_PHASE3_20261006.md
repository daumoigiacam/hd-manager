# HD Manager - Xuat kho Phase 3

Date: 2026-10-06
Scope: Xuat kho only. Firebase remains the backend.
No commit, push, deployment, migration or production data write.

## Certification Decision

**PHASE 3: FAIL (incomplete).** Not BLOCKED on React dependencies anymore.
Do not mark READY FOR REAL FIREBASE E2E or MODULE PASS.

The requested whole-module completion has not been achieved. Passing checks
below cover the refactored paths, not every path of WarehouseDispatchView.

| Gate | Status | Evidence / remaining work |
| --- | --- | --- |
| Whole-module strict typing | FAIL | Repository, three mutation use cases, table, weight modal, weight helpers, grouping and product options compile strictly. The main WarehouseDispatchView, its remaining helpers, shared queue/read adapter and all tests are not fully strict-checked. |
| Architecture boundary | FAIL | Create/update/archive orchestration moved out of App into warehouseDispatchUseCases.js. App keeps authentication guard and composition. Shared Firebase reads, queue routing/document paths, and remaining screen policy still require boundary work. |
| Whole-module Design System | FAIL | Table and weight modal use semantic CSS backed by shared tokens. Other forms, pickers, history/calendar and dialogs remain unaudited or use literal styling. |
| Authorization | PASS, emulator scope | 16 dispatch boundary probes plus 14 tenant checks. |
| Idempotency | PASS, emulator scope | Concurrent replay, payload mismatch, lost ACK, serialized restart/reconnect and deterministic identity checks retained. |
| Pending/inventory | PASS, existing regression scope | Durable-before-publish, pending exclusion and confirmation behavior preserved; no blanket lifecycle certification. |

Real Firebase UI E2E, cloud ACK/latency, Android device jank and memory
certification were not run. These are later certification stages, not an excuse
to treat the remaining Phase 3 source work as complete.

## Implemented In This Continuation

- Installed official @types/react and @types/react-dom as development-only
  dependencies. Restored unrelated Expo lockfile metadata removed by npm.
- Corrected the React.memo callback JSDoc so the actual table component is
  typechecked, not merely its wrapper.
- Extracted WarehouseWeightEntriesModal.jsx, typed its props, keyboard events,
  refs, focus-task lifecycle and weight state. Preserved Android IME handling,
  local keystroke state and explicit confirmation.
- Added strict types to warehouseWeightEntries.js,
  warehouseDispatchGrouping.js and warehouseDispatchProductOptions.js.
  Generic grouping/product helpers retain caller-specific fields.
- Added warehouseDispatchContracts.d.ts for fields actually consumed by commands.
  It is NOT a complete Firebase read decoder; raw read validation is still owed.
- Extracted createWarehouseDispatch, updateWarehouseDispatch and
  deleteWarehouseDispatch use cases. Existing App guards and VPS staging branch
  remain unchanged. Payload spread, units, rounding, duplicate rules, durable
  queue ordering, ACK wait, edit/archive rollback and snapshots were preserved.
- Made repository reference/transaction types generic rather than unknown.
  Added a compile contract against the real Firebase SDK types.
- npm run typecheck now includes tsconfig.dispatch.json, not just payroll.
- Added semantic weight-editor CSS using shared color, spacing, typography,
  control, focus, elevation and layer tokens. Existing viewport geometry remains.
- Expanded ESLint JSX matching to include actual warehouse components.
- Updated source-based regression assertions to inspect moved implementations;
  actual command tests still execute App wrappers and real imported use cases.

## Strict Check Coverage

tsconfig.dispatch.json includes:

- src/utils/warehouseDispatchCreate.js (compatibility export)
- src/features/warehouse/warehouseDispatchCreateRepository.js
- src/features/warehouse/warehouseDispatchUseCases.js
- src/features/warehouse/warehouseDispatchContracts.d.ts (imported)
- src/features/warehouse/DispatchTableBody.jsx
- src/features/warehouse/WarehouseWeightEntriesModal.jsx
- src/utils/warehouseWeightEntries.js
- src/utils/warehouseDispatchGrouping.js
- src/utils/warehouseDispatchProductOptions.js
- tests/types/warehouse-dispatch.contract.ts

Compiler: strict/checkJs/noEmit enabled, real React declarations, no fake ambient
React declarations. Library checking is skipped; application files above are not.
No any or unchecked unknown-to-domain casts were added. Compile-negative tests
use ts-expect-error specifically to require rejection of invalid command inputs.

## Verification

| Check | Current result |
| --- | --- |
| Dispatch/save/inventory/realtime suite | 83/83 PASS: inherited 81 plus two token guards |
| Dispatch performance regressions | 16/16 PASS |
| Firestore Emulator dispatch probes | 16/16 PASS |
| Firestore Emulator tenant isolation | 14/14 PASS |
| Actual App edit/archive/rollback and immutable stock suite | 23/23 PASS in the extended diagnostic run |
| npm run lint | PASS |
| Explicit ESLint on changed warehouse implementation/tests, max-warnings=0 | PASS |
| npm run typecheck | PASS for payroll and enumerated dispatch scope |
| Production build | PASS, 2508 modules, 10.86 s |
| Isolated create preview | PASS: customer/product selection, rapid double submit, one persisted record after reload |
| Weight viewport preview | PASS: 390/768 widths, 400/280 visible heights, sum and confirmation reachable |
| git diff --check | PASS; Windows line-ending warnings only |

Node tests use a 30 s deadline. Emulator runner has a 180 s deadline and child
test timeout of 60 s. Preview scripts have a 180 s deadline and bounded waits.
Emulator project: demo-hd-dispatch-cert. Preview blocks external requests.
No cloud Firebase data was seeded or modified.

## Performance Evidence

One isolated desktop Chromium preview run, not Android or real Firebase:

| Operation | Measured duration |
| --- | --- |
| Open dispatch, 5 samples | 116, 23, 18, 20, 19 ms |
| Open dispatch P50 / P95 of those 5 samples | 20 / 116 ms |
| Select customer | 42 ms |
| Select product | 46 ms |
| Save plus local preview persistence | 75 ms |

The sample count is small. Do not extrapolate to all devices or cloud ACK.
Weight input normalization averaged approximately 0.0002 ms and full local
input transition 0.0006 ms in the existing micro-test. This is CPU helper timing,
not end-to-end mobile input latency.

Production main JS: 2478.94 kB, gzip 674.44 kB.
No new runtime dependency, background timer, polling, subscription or network
request was introduced by this continuation. Existing focus scheduling remains
bounded and cleaned up. No whole-app non-regression performance claim is made.

Visual evidence:
- test-results/weight-viewport-390.png (inspected)
- test-results/weight-viewport-768.png
- test-results/dispatch-driver-actions-390.png
- test-results/dispatch-driver-actions-768.png

## Additional Diagnostic Failures

An extended run including two historical suites returned 87 PASS / 4 FAIL.
These failures are not hidden or counted among the 83 passing regression checks:

- export-restore-scope.test.mjs: byte equality against d4262219 handlers is
  incompatible with the already introduced idempotent create implementation
  and this requested extraction. It is not a behavioral parity assertion.
- Same historical suite: exact security-rule equality against d4262219 fails.
  HEAD already differs from that reference.
- Same historical suite: exact old summary source equality fails.
  HEAD already differs from that reference.
- inventory-transaction-concurrency.test.cjs: static assertion expects
  commitAtomicInventoryOperation in App, while the historical restore suite
  explicitly forbids it. HEAD does not contain that call. The 17 behavioral
  concurrency checks in that file pass; this static migration-contract check fails.

Those historical assertions were not removed, weakened or marked skipped.
They need an explicit current-contract update before claiming the entire
repository test suite is green.

## Remaining Source Work Before Phase 3 PASS

1. Strict-type the actual WarehouseDispatchView and all module-owned state,
   forms, callback contracts and remaining helpers, without fake declarations.
2. Validate Firebase read DTOs before shared state, and finish typed repository
   ownership of read/listener/queue/update/archive paths. Audit confirmation
   and rollback semantics across those paths rather than assuming create
   transaction probes certify all mutations.
3. Complete token/shared-component and accessibility audit of all remaining
   dispatch UI, not just the table and weight editor.
4. Repeat scoped regression, visual/performance comparison and certification
   after those changes; reconcile historical contract tests explicitly.

## Git Safety

Current branch: main.
Current commit: 1bd05fc02f3271e37989066ef678bdfd3eb42d80.
Working tree remains dirty. Pre-existing changes, including firestore.rules,
pending/inventory fixes and other module edits, were preserved.
No reset, clean, force push, commit or deployment was performed.

Final: **PHASE 3 FAIL (incomplete); Xuat kho NOT CERTIFIED.**

## Continuation: Read Boundary (2026-10-06)

Implemented warehouseDispatchReadRepository.js and included it in strict dispatch
typecheck. SDK normalized snapshots and REST results now validate tenant/customer
scope, stable document identity and consumed primitive/weight fields before ACK
bookkeeping, overlay removal or shared state publication. Invalid batches throw;
they do not partially publish, coerce amounts or erase the previous data. Existing
listener error handling is used only for dispatch callback exceptions; other
collections retain their previous callback behavior.

Valid legacy nulls and numeric strings, unknown fields and original data references
are preserved. A per-listener WeakMap avoids repeat field validation for immutable
snapshot objects without retaining removed records. This is a partial read boundary,
not validation of every nested metadata field or every cache hydration path.

Verification in this continuation:
- Scoped regression: 88/88 before the additional ACK-ordering test.
- Read-boundary tests including actual App publication and callback: 6/6.
- Existing dispatch performance regression: 16/16.
- Emulator boundary probe: 16 checks passed; demo-hd-dispatch-cert only.
- Default lint and explicit read repository lint: PASS.
- Typecheck (payroll and strict dispatch subset): PASS.
- Build: PASS, 2509 modules, 10.97 s; main JS 2481.64 kB / gzip 675.25 kB.
- git diff --check: PASS (line-ending warnings only).

Local micro-measurement, synthetic 4500 records, 30 samples, Node CPU without
throttling: first validation P95 3.7143 ms / max 6.8086 ms; unchanged validation
P95 0.5222 ms / max 0.7039 ms. These are helper CPU timings, not UI or Firebase
latency. No production data or configuration was touched. No new timer, listener,
runtime dependency or network request was added.

Remaining source blockers listed above are NOT closed: main view strict typing,
complete update/archive/queue repository contracts and ACK audit, whole-module
design/accessibility audit, and historical test contract reconciliation. Real
Firebase certification still needs an approved isolated cloud test project/account;
the user has been asked for that environment. No cloud ACK numbers are inferred.

Continuation final: **PHASE 3 FAIL (source incomplete); real Firebase E2E BLOCKED.**
No module certification, commit, push or deployment performed.

## Continuation: Edit/Archive ACK and Form Actions

Updated edit and archive use cases to await the existing bounded shared-write
confirmation after persistence accepts the command. ACK rejection/timeout propagates
to the caller, without rolling back an accepted queued mutation. Persistence failure
still follows the existing rollback behavior. No additional Firebase write is issued
by the use cases. This closes premature promise completion, not the entire mutation
audit: duplicated pre-save optimistic publication, rollback against concurrent edits,
and recent-write-overlay failure handling remain to be reconciled with the shared
save layer. Existing pending archive visibility also needs end-to-end verification.

Extracted the actual driver/reset/error/submit UI into DispatchFormActions.jsx with
strict props/events and design-token CSS. Kept driver/reset on the same row and the
submit button in the same form. Added role=alert and aria-busy. No timer, subscription,
worker or runtime dependency added. The rest of WarehouseDispatchView is NOT yet
strictly typed or fully tokenized; this extraction is incremental, not certification.

Verification:
- Scoped regression including six new deferred-ACK/failure tests: 95/95 PASS.
- Incremental stock suite plus ACK tests: 29/29 PASS (ACK tests overlap above).
- Lint, explicit new-component/use-case lint and strict subset typecheck: PASS.
- Production build: PASS, 2511 modules, 10.82 s; main gzip 675.30 kB.
- Preview visual workflow: 390/768 px, driver/reset geometry, save control,
  search, multi-image share and weight editor with reduced visual viewport: PASS.
  Inspected test-results/dispatch-driver-actions-390.png. Not a real device result.

Real Firebase environment investigation:
- Authenticated projects:list succeeded: cangiacam, daumoigiacam-e7c2b,
  hd-manager-c5839, quanlysaas. None identified as approved dispatch staging.
- Initial new-project request was blocked by execution policy. User then explicitly
  approved creating hd-manager-qa-20261006, isolated and without billing.
- Authorized projects:create reached Google Cloud and failed with code 8:
  "The project cannot be created because you have exceeded your allotted project quota."
- Failed operation: create_project.global.4619227405821077225; evidence in local
  firebase-debug.log. No QA project was successfully created, no billing linked,
  and no production configuration/data was changed.
- Cloud E2E requires increased project quota or an explicitly designated existing
  isolated QA project with access. Emulator/preview are not cloud ACK evidence.

Status: source work remains incomplete (FAIL); real Firebase E2E BLOCKED by project
quota and absence of a designated QA target. No overall module PASS claimed.

## Continuation: Concurrent Failure Safety and Quantity Form

Removed duplicate optimistic publication and captured-record rollback from edit
and archive use cases. The common durable save path is now the sole publisher.
App's saveWarehouseDispatchPatch rejects non-replayable/unsupported payloads and
stale tenant sessions before invoking that path. A persistence rejection therefore
does not write an old record or overlay; ACK timeout still retains the accepted
pending command. Tests cover late rejection after a newer record arrives, for
both edit and archive, plus boundary rejection before writes. This does not certify
server-side conflict resolution across multiple devices.

Extracted actual quantity/unit/kg controls into strict DispatchQuantityFields.jsx
with shared tokens, accessible labels and stable three-column dimensions. The
actual create/reset draft factory is now typed in warehouseDispatchFormModel.js;
independent drafts do not share their weight-entry array. No business formula or
default changed. No new runtime dependency, polling or asynchronous side effect.

Verified:
- Scoped regression: 98/98, followed by 4/4 design/model tests (2 newly added).
- Incremental stock plus edit/archive ACK: 31/31 before adding the boundary test.
- Typecheck and lint: PASS. Strict checking remains a subset, NOT the full view.
- Build: PASS, 2514 modules, 12.04 s, main gzip 675.54 kB.
- Visual preview 390/768 px: PASS for driver layout, search, share and weight
  editor. Inspected 390 px screenshot after quantity component extraction.
- git diff --check: PASS, line-ending warnings only.

Still incomplete: strict typing for remaining WarehouseDispatchView callbacks,
pickers, projections/history/shortage editors and helper dependencies; full UI token
conversion. Cloud/device E2E and full interaction performance certification remain
unverified. Do not interpret the fixed rollback race as full Phase 3 PASS.
No commit, push, deployment, production data/configuration modification.

Final isolated create preview: PASS_PREVIEW_ONLY. Five screen-open samples
110/23/22/20/20 ms (P95 110 ms); customer selection 34 ms, product selection 47 ms,
save plus local preview persistence 76 ms. Rapid double-submit produced one record,
and reload retained one record. External requests blocked. Not Firebase ACK timing
or a claim that every interaction meets P95 targets.

## Continuation: Picker, History and Shortage Surfaces

Actual WarehouseDispatchView now uses strict checked DispatchSearchPicker,
DispatchHistoryDialog and DispatchShortageDialog. Their shared CSS uses design
tokens; keyboard selection, Escape, modal focus containment and focus restoration
are covered in isolated browser tests. No polling or new runtime dependency added.
The picker still consumes the existing permission-filtered product/customer lists.

History and shortage row projections moved to checked dispatchDialogModels.
Original row IDs, snapshot precedence, chronology, units and legacy weight parsing
are preserved. Delete/close callbacks moved to dispatchHistoryActions and
dispatchShortageActions with explicit typed ports. Pending locks prevent competing
actions until the actual persistence promise settles, and failures are displayed
inside the dialog. An old shortage completion cannot close a newer selection.
Existing billing calculation is injected unchanged, not duplicated.

Visual inspection caught a narrow-screen history name being squeezed by the
delete button. Stacking that control under the name fixed it; a width assertion
protects against recurrence. Final screenshots inspected at 320/390 px.

Verification:
- Scoped unit/integration regression: 107/107 PASS.
- Strict subset typecheck: PASS; full App.jsx is still NOT strict checked.
- npm lint and explicit ESLint for the extracted components/helpers: PASS.
- Production build: PASS, 2523 modules, main gzip 676.42 kB (not a bundle reduction).
- Isolated component UI: PASS at 320/390/768/1440 px, no page errors/overflow.
- Final actual create preview: screen samples 112/22/18/18/19 ms, P95 112 ms;
  customer selection 38 ms, product selection 39 ms, local save 62 ms.
  Double submit created one record; reload retained one record.
- git diff --check: PASS (line-ending warnings only).

These preview timings are not Firebase ACK timing and the individual selection/save
samples do not establish P95 for those actions. No real-device performance claim.
Remaining source scope: parent view/calendar/shortage summary and remaining helper
boundaries still need strict typing and full token audit. Open history selection
still retains a selected group snapshot; live concurrent refresh needs further
coverage. Multi-request shortage close is not certified atomic. Whole-module
certification remains incomplete, not PASS. Real Firebase E2E remains BLOCKED by
the documented project quota / no designated QA target. No production writes,
configuration changes, commit, push or deploy in this continuation.

## Continuation: Calendar, Shortage Summary and Live History Selection

- Extracted actual calendar and shortage summary JSX into strict checked
  DispatchHistoryCalendar and DispatchShortageList. Shared token CSS replaces
  gradients, blur, hover translation and scattered sizing on these surfaces.
  The three-customer preview and compact edge-mounted expand arrow remain.
- Extracted parent shortage grouping into checked dispatchShortageGroups,
  preserving source request references, date/product deduplication, count/weight
  accumulation and newest-first ordering. Added parity assertions for these rules.
- Parent history state now holds only a nullable date key. Its open dialog resolves
  from the current historyDispatchGroupMap, not a copied group. New records/edits
  therefore appear without reopening. Removing the last record hides the dialog.
  Removed manual post-delete mutation of the selected group's copied items/totals.
- Added tests for refreshed groups, last-row removal, late delete rejection after
  switching selection, and actual App wiring. Existing late edit/archive rejection
  tests also pass. This is client concurrency evidence, not multi-device cloud E2E.
- Found and fixed focus loss when shortage actions disable their focused button:
  focus moves to the dialog before starting the action, so Escape still works.

Verification: 34 scoped tests PASS; typecheck PASS; npm lint plus explicit ESLint
of changed source PASS; final build PASS (2528 modules, 11.18 s). UI tests cover
picker, dialogs, expand/collapse, month selection and date opening at four widths
320/390/768/1440. Inspected the 320 px overview screenshot: no overlap/overflow.
The first expanded UI run exposed an overly broad option locator, then the real
disabled-button focus issue; both fixed and the final run passed.

Final isolated actual create preview: open samples 113/23/19/19/19 ms, P95 113 ms;
customer/product selection 38/38 ms; local save 78 ms; duplicate submit and reload
retain exactly one record. Previous run was 112 ms open P95 / 62 ms local save;
single-run variation does not certify absence of a performance regression. External
requests are blocked; these numbers are not server ACK or device measurements.

Remaining: whole WarehouseDispatchView is not strict checked; remaining parent
editor/voice/export helper boundaries and full token audit are not certified.
Concurrent multi-device Firebase E2E is still blocked by QA project quota. No
module-wide PASS, production write, push or deployment claimed.

## Continuation: Parent Helper Typing and Proven Dead Work Removal

Babel binding-reference inspection identified unreferenced local declarations.
Removed previewDispatchRows and its exclusively consumed mergedDispatchRows memo:
the latter unnecessarily grouped all today's rows on data updates without any UI
consumer. Also removed unreferenced openHistoryDispatchGroup (including its 80 ms
scroll timer) and getSupportedVoiceRecorderMimeType. Did not remove reachable
business operations or bypass checks to make typing pass.

Kept the actively used export padding helper as strict dispatchPreviewRows.js and
extracted the real canvas renderer into checked renderDispatchSheetCanvas.js with
explicit formatting ports. Export labels, units, legacy numeric strings, canvas
dimensions and blank-row padding are preserved. App delegates to this renderer.
Canvas visual constants are unchanged to avoid altering existing export layout.

Verification: 17 helper/share/concurrency/ACK tests plus 13 input/design/local-save/
read-boundary tests PASS. One stale source-location guard for the three-row shortage
preview failed initially; it now checks parent wiring and the actual extracted
component, retaining the same three-row/remaining-count assertions. npm lint,
explicit helper/test ESLint, strict subset typecheck and production build PASS.
Build: 2530 modules, 11.98 s, main gzip 675.37 kB.

Actual isolated create preview PASS_PREVIEW_ONLY: screen samples 108/21/17/18/19 ms
(P95 108 ms); customer 37 ms, product 42 ms, local save 94 ms; one record after
double submit and reload. A single local-save sample is not an API/P95 or no-lag
guarantee. No new polling, listener or timer introduced.

Full parent strict typing is still incomplete, including editor and voice/share
orchestration boundaries. Real multi-device Firebase E2E remains QA-quota blocked;
that is not a reason to delete live functionality. No full module PASS or deployment.

## Continuation: Remove Dispatch Voice and Type Editor/Share Orchestration

User explicitly confirmed voice must not exist in Dispatch. Removed residual
speech-recognition/recording handlers, transcript extraction/matching, Gemini
transcription branch, transcript focus and 650 ms auto-apply timer/effect, capture
cleanup effect, voice state and refs. Removed the voice-only customer projection.
Babel binding references identified the sole helper in the parser block still used
by manual entry: number formatting. Preserved its positive-number/comma/rounding
semantics in strict dispatchNumberInput.js. Shared order rows remain for manual
customer/product selection and were renamed dispatchOrderRows. Historical voice
sourceType/transcript fields were NOT migrated or erased.

Reset now only resets manual form state. Removed the unreferenced standalone
download handler; active share fallback downloading remains supported.

Actual cell save/delete delegate to strict runDispatchEditorCommand with a common
synchronous ref lock, preventing competing actions before React busy rendering.
Existing save/delete business functions and ACK behavior are unchanged. Active
share orchestration delegates to strict shareDispatchSheet: same page splitting,
native/web share and download fallback, plus synchronous duplicate guard and canvas
cleanup even when blob encoding fails. No optimistic success added.

Verification: 18 orchestration/format/export/ACK/input tests and 22 creation,
inventory, billing, read-boundary and panel-action tests PASS. Tests cover absent
voice plumbing, number formatting parity, editor duplicate/rejection/retry and
share encode failure/cleanup/lock release/permission. Strict subset typecheck,
npm lint, explicit new-helper lint and build PASS. Main gzip 671.63 kB vs 675.37 kB
previously; not a claim about device responsiveness. Actual browser preview at
390/768 px passed weight editor layout/sum and multi-image sharing (at least three
nonempty files). Native Android share and real Firebase ACK were not tested here.

The entire parent view is still not strict checked: e.g. field configuration and
business draft-building callbacks remain outside the checked subset. Voice is
removed, not deferred. No all-module PASS, production write, push or deployment.

Final create preview: screen samples 102/18/18/19/21 ms (P95 102 ms), customer
36 ms, product 39 ms, local save 75 ms. Rapid submit/reload retained one record.
External requests blocked; not cloud ACK or device performance evidence.

## Continuation: Field Configuration and Edit Payload

Actual parent delegates field configuration, field permission gating and editor
draft construction to strict dispatchEditorModel.js. The configuration builder
only builds options for the selected field, instead of mapping all three option
collections for every call. Unknown fields return null; weight retains its separate
multi-entry editor. Draft construction preserves zero-valued prices/counts and
legacy fallbacks, and copies weightEntries to avoid retaining the source array.

Actual edit payload construction now uses strict dispatchEditPayload.js. Existing
validation, pricing/domain snapshot and ACK ownership are unchanged. Tests verify
extra billing snapshot fields, branch/driver aliases, quantity versus piece count,
historic transcript/source and outside-order flags. No billing calculation moved
or changed.

Verification: first scoped group 19/19 PASS; after payload extraction a second
overlapping group 15/15 PASS. Strict subset typecheck and explicit changed-source
ESLint PASS; actual preview weight viewport/sum/share at 390/768 px PASS. This does
not certify multi-device backend conflict handling or all parent code as typed.

Push is conditional on ALL PASS in the current user instruction. Not pushed:
whole parent typing remains incomplete (including create/draft matching and billing
orchestration), and real Firebase E2E remains blocked by the previously verified
QA project quota. Requested an authorized existing QA project or quota increase.
No production data/configuration write or deploy.

## Continuation: Create, Matching and Billing Orchestration

Current user scope supersedes the preceding QA request: real Firebase E2E and
QA project creation are STOPPED at the user's request because project quota is
exhausted. No cloud E2E, cloud project creation, production data/configuration
write or deployment was attempted in this continuation.

The actual parent now delegates these execution paths to strict checked modules:
- submitDispatchForm.js: validation, duplicate lock, payload construction, command
  identity/retry and awaited persistence completion before clearing the draft.
- matchDispatchOrder.js: candidate selection, identity/deduplication, existing
  weighted matching priorities and timestamp tie-breaking.
- coordinateDispatchBilling.js: frozen dispatch/order snapshot precedence,
  current configuration fallback and actual/billing unit compatibility.
- buildDispatchOrderDefaults.js: order-to-form values, physical count/weight,
  pricing units and frozen snapshot defaults.

dispatchWorkflowContracts.d.ts supplies explicit inputs, callback ports and create
payload types. These files are included in strict/checkJs dispatch typechecking;
there are no any casts or type suppression in these new modules. Existing domain
pricing and persistence semantics are retained, not replaced. App.jsx itself is
still outside whole-file strict checking; this result certifies these extracted
paths, not every callback in the application.

Evidence:
- Differential fixtures capture the original matching, billing and defaults
  functions before extraction. Matching agrees across 200 cases; billing agrees
  across eight frozen-price/unit-compatibility combinations; defaults agree
  across 24 null/nested/fallback/unit cases.
- Scoped workflow/business regression: 10/10 Node test entries PASS, including
  existing billing (22 scenarios/60 assertions), inventory integrity, order
  creation and weight-input scripts.
- Scoped command/read-boundary/editor/history regression: 38/38 PASS.
- Failed create retains draft and mutation identity for retry; rapid duplicate
  submit does not create another command; denied outside-order creation writes
  nothing. ACK tests here use controlled local ports, not Firebase measurements.
- Two old source assertions initially failed because logic moved from App.jsx;
  assertions now follow the actual delegated implementation and pass.
- npm typecheck, npm lint, explicit new-module/test ESLint, build and diff check
  PASS. Existing CRLF normalization warnings are not whitespace failures.
- Final isolated browser preview PASS: screen samples 108/23/21/21/21 ms,
  P95 108 ms; customer selection 43 ms; product selection 38 ms; save/local ACK
  76 ms. Rapid double submit created one record; reload retained one record.
  External requests blocked; preview runner has a 180-second deadline.
- Final main bundle gzip 673.05 kB. No added timers, workers, subscriptions or
  background processing. These samples do not certify all devices or Firebase
  network/server latency.

Result: requested strict execution paths and local regression PASS.
Real Firebase E2E excluded by user decision, not represented as PASS.
Inherited working-tree changes preserved. No commit, push or deploy in this turn.
