# Navigation Response

## Scope and Evidence

Isolated production-style Vite preview; external network blocked; Chrome 390x844,
CPU3x, 600 fixture customers, 3000 orders, 1500 payments, 12 employees and one
fixture product (plus preview defaults). This is not a real-device or Firebase
network measurement. Each run has a 180-second deadline.

The profiler found dashboard payroll calculations and financial aggregation on
the return-to-home path. Cache diagnostics identified attendance updates as a
dependency invalidation. The comparator also forced renders for visibility-only
changes, and the payroll loader invalidated an already-empty state.

## Changes

- Skip visibility-only report renders while retaining data/callback checks.
- Avoid replacing an already-empty locked-payroll state.
- Reveal the retained same-scope report before scheduling updated calculations
  after paint. Mark pending report updates aria-busy; cancel pending work on
  navigation. Company/employee identity changes bypass deferred props.
- Preserve all calculation formulas, Firebase writes, permissions and debt fixes.

## Measurements

Click to visible target plus two animation frames, milliseconds:

| Route | Before | After |
| --- | --- | --- |
| Debt to Home, update overlap | 244-308 | 54 |
| Debt to Home, subsequent | 43-46 | 39 / 39 |
| Home from More | 33-49 | 41-62 |
| Order Requests open | 84-95 | 92 |
| Dispatch open | 100-125 | 115 |
| Orders open | 214-258 | 236 |

Runs vary with background fixture arrivals and CPU contention. Do not interpret
the small differences as statistically established improvements. The change
removes report refresh from the navigation paint path, not the underlying CPU
cost of generating a new report. Orders mount and report recomputation remain
measurable; universal instantaneous navigation is not established.

## Validation

24 targeted tests passed, including report equivalence, data invalidation and
repayment cost regression. Lint/typecheck passed. The browser harness also waits
for report aria-busy to clear, with a 15-second timeout. No production writes,
push, deployment, or data deletion performed. Prior uncommitted changes retained.
