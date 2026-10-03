# Real Firebase Critical Path Verification

Date: 2026-10-03

Status: **BLOCKED - no verified writable real-Firebase test environment**.
No production writes, deployment, push, business-code changes, or new optimization
were performed for this verification. No previous preview PASS is upgraded to
real-Firebase PASS.

## Environment and Attempts

- `.firebaserc` has only the default project `hd-manager-c5839`.
- `.env.local` targets `hd-manager-c5839`, the company's real Firebase backend.
- `.env.emulator` targets `demo-hd-manager-local` with emulators enabled. This
  is not a cloud staging environment and cannot establish real network/ACK latency.
- Inspected existing performance reports, production release smoke script,
  Firestore instrumentation, and save handlers without changing them.
- Firebase CLI `projects:list --json --non-interactive` was bounded by a
  30-second parent timeout. First attempt failed immediately with EPERM reading
  the CLI configuration. Retried with approved elevated access: succeeded in
  about 2.24 seconds, without a timeout.
- Accessible projects: `cangiacam`, `daumoigiacam-e7c2b`, `hd-manager-c5839`,
  `quanlysaas`. Neither the returned metadata nor local configuration identifies
  any of these as an HD Manager staging project with equivalent rules/functions,
  test tenant, and a large test dataset. Access alone is not staging authorization.
- Requested the project/test tenant permitted for test writes. No such target
  has been established at report time. No legitimate production save payload has
  been supplied, and creating a production order solely for timing is prohibited.

CLI elapsed time is discovery evidence, NOT a business request or Firebase ACK
measurement. No three-flow browser measurement was started; none timed out.

## Dataset

The inherited preview baseline contains 364 customers, 600 products, 1,800 orders,
4,503 order requests, 4,303 dispatches, and 900 payments. These are preview fixture
counts, not verified real Firebase counts. Real test-tenant counts for all six
collections remain unverified. No smaller dataset was used to infer performance.

## Measurement Results

NM means not measured, not zero and not a timeout.

| Flow | CPU/UI | Firebase/Network | ACK | UI completion | Total |
| --- | --- | --- | --- | --- | --- |
| Order Request Save | NM | NM | NM | NM | NM |
| Dispatch Save | NM | NM | NM | NM | NM |
| Delivery Report Open | NM | NM | N/A (write ACK) | NM | NM |

The acceptance requirement for numeric samples is NOT satisfied. No claim about
Firebase being fast or slow is supported. Read-only report opening has not been
measured in an authenticated, verified large-dataset test session either.

## Instrumentation Review

Existing `recordFirestoreOperation` in `src/services/performanceMonitor.js`
records SDK wall time and deliberately sets `databaseDurationMs: null`. This
includes cache, networking, retries, and callback scheduling; it does not expose
isolated server execution time.

`src/App.jsx` calls `requireSharedWriteConfirmation` for order-request writes.
The Firebase dispatch creation path instead enqueues a durable local write,
starts `flushPendingFirebaseWriteNow` without awaiting it, and returns a queued
receipt. Consequently UI completion can precede server ACK. This is a source
finding, not a measured latency. Existing persistence semantics were left intact.

No instrumentation was added to business code without a runnable real-Firebase
measurement target. Existing mock timings were not rerun or reused as cloud data.

## Timing Methodology for Unblocking

Use one monotonic browser timeline and correlate each operation to its exact
mutation/document, not a global queue completion or unrelated network response.
Record T1 action, T2 preparation entry, T3 actual transport start, T4 verified
server acknowledgement, and T5 visible UI confirmation plus render opportunity.
Capture CPU work separately from elapsed waits; T3-T2 is not necessarily CPU time.

- Pre-request elapsed: T3-T1, with measured CPU slices attributed separately.
- Request-to-ACK elapsed: T4-T3, including transport and Firebase processing.
- ACK is a timestamp relative to T1, not an additional duration to add to T4-T3.
- Post-ACK UI completion: max(0, T5-T4). Record T5<T4 explicitly for local receipts.
- User-visible total: T5-T1. Durable completion total: max(T4,T5)-T1.
- Delivery open: measure any actual read transport separately; a cached screen
  can have no request. Never manufacture a write ACK for a read-only flow.

Network transit and internal Firebase execution cannot be independently derived
from a client promise or a multiplexed Firestore stream alone. Only separately
reported server timing/traces would support that split. Do not add overlapping
React, SDK, network, or background-write spans together.

Future runs must have a finite action deadline and an independent process deadline.
On deadline, retain request/mutation identity and last observed milestone, classify
TIMEOUT, and do not infer server failure or perform blind duplicate writes.

## Limitations and Next Requirement

Need an explicitly identified real Firebase staging project/test tenant, authorized
test login, verified equivalent configuration, and baseline-scale non-production
data before the two save flows can be measured safely. Alternatively, observe
owner-specified legitimate business saves without fabricating benchmark records.
Do not send passwords in chat.

Until then: CPU bottleneck, Firebase/network bottleneck, ACK latency, and UI
completion for these real flows are undetermined. Preview critical-path PASS
remains preview-only. No production data or Firebase configuration was changed.
