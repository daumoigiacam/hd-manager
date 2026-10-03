# Debt Repayment Cost Classification

## Cause

The debt ledger correctly stores customer repayments in expenses with
`sourceType: customer_debt_repayment`, but daily finance and operating-cost
reports treated these liability settlements as newly incurred costs.

## Correction

- Keep the expense document, actual cash outflow, debt reduction, approval,
  tenant scope, validation and persistence unchanged.
- Exclude explicitly identified repayments from daily finance cost/profit,
  home direct operating costs and executive recognized operating costs.
- Display a separate repayment subtotal in daily finance, while retaining
  individual transactions in the cash list.
- Existing tagged records receive corrected calculations without migration.
- Do not infer repayment classification from arbitrary free-text descriptions.
- Preserve the pre-existing order-request changes in the working tree.

## Verification

- 19 targeted tests passed: repayment, cost classification and finance reports.
- Browser preview passed at 390px and 1366px: save 300,000 repayment, remaining
  payable 700,000, reload, no extra receipt, zero new cost and separate subtotal.
- Lint and typecheck passed.
- Production data was not modified; no deployment or push performed.

## Limits

Browser checks use isolated preview storage, not real Firebase transactions.
This is a repayment classification correction, not a conversion of all daily
finance totals to accrual accounting. Genuine cash outflow reports retain
repayments. Historical manual records without the explicit source tag need
individual review rather than automatic reclassification.
