# HD CONNECT Business Contract Gaps

Date: 2026-08-22
Scope: local VPS-mode blocker elimination only

This file records fields and lifecycle rules that the current HD Manager UI does not prove. It is not an approval and does not authorize production writes.

## Warehouse and Inventory

| Field or flow | Current UI evidence | VPS contract | Why it remains open |
|---|---|---|---|
| Warehouse selection for stock movement | Legacy import/dispatch records have no mandatory resolved `warehouseId`; the new VPS-mode form now requires an explicit selection from the VPS warehouse master | `warehouseId` is required UUID and tenant-scoped | Owner must confirm which physical warehouse receives/issues each operation; no default is inferred |
| UOM selection | Legacy records contain labels such as `Con`, `Kg`, and other display units; VPS ledger requires `unitId` | `unitId` is required UUID; no implicit conversion in adapter | Owner must approve the exact UOM and any conversion/yield rule |
| Weight versus stock quantity | UI can record both count and weight; `StockLedger` stores quantity/baseQuantity while weight is recorded separately by the warehouse service | One signed ledger quantity plus optional weight movement | No conversion from kg to con or from con to kg is inferred |
| Stock count | Legacy form aggregates a group and can contain multiple measures; VPS count requires one product/unit line in a count session | `StockCountSession` + `StockCountLine` | Requires a product-level count UI/contract and approval of multi-measure semantics |
| Edit/delete movement | Existing VPS ledger is append-only | No edit/delete ledger endpoint | Requires approved reversal/adjustment semantics; UI fails closed |

## Finance, Debt, and Payment

| Field or flow | Current UI evidence | VPS contract | Why it remains open |
|---|---|---|---|
| Expense create | Existing UI has category, amount, date, note; VPS expense create now accepts an explicit technical code and keeps the new record in DRAFT | `POST /finance-suite/expenses` | Approval/posting and allocation must be exercised before claiming accounting parity |
| Expense edit/delete | No VPS patch/delete expense contract is exposed | Create/approve/post only | Requires cancellation/amendment policy |
| Payment to debt/finance | VPS payment route is read-only/disabled in current environment; Firebase UI payment semantics include matching and posting | Provider/payment/reconciliation and finance allocation | Provider, account mapping, collision decisions, and posting rules are external |

## Payroll and Documents

| Flow | Evidence | Remaining contract |
|---|---|---|
| Payroll generate/approve/lock | VPS adapter routes for periods, generate, approve, and lock now exist; HD Manager still computes legacy snapshots and lock journal in Firebase-shaped collections | Map authoritative employee/attendance/policy inputs to `HrPayrollPeriod` and `HrPayroll`; prove locked immutability |
| Documents | VPS document transport exists, but no verified HD Manager user-facing document consumer was found in the migrated path | Define list/detail/upload/download permissions and storage provider behavior |
| Worker/events | Backend event/worker transports exist | Prove a real UI mutation produces an event, worker execution, and final state without inventing a UI monitor |

## Realtime

The VPS SSE stream is authenticated and tenant scoped, but a disposable tenant-A/tenant-B browser fixture is still required to prove same-tenant delivery, cross-tenant denial, reconnect, heartbeat, duplicate handling, and re-authentication.

## Decision rule

The fields above must be resolved by source evidence or an explicit owner/business approval. The app must not assign a warehouse, create a UOM conversion, convert weight to quantity, post payment accounting, or mutate an immutable ledger by inference.
