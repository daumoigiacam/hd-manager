// One atomic, already-reconciled read. Never cache callbacks, permissions or
// editor drafts, and never use a presentation snapshot as write admission.
export const CUSTOMER_FINANCIAL_READ_KEYS=Object.freeze([
  'customers','orders','payments','expenses','paymentReconciliations','customerPoints',
  'customerLoans','products','warehouseImports','warehouseDispatches',
]);
export function customerFinancialSnapshot(props, ledgerMap) {
  return {ledgerMap,sources:Object.fromEntries(CUSTOMER_FINANCIAL_READ_KEYS.map(key=>[key,props[key]]))};
}
export function customerEditNeedsFinancialReadiness(patch) {
  return ['openingDebtAmount','openingDebtNote','openingPayableAmount','openingPayableNote',
    'debtLimitMode','debtLimitAmount','purchaseReconciliationEnabled']
    .some(key=>Object.hasOwn(patch||{},key));
}
