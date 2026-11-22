import assert from 'node:assert/strict';
// These execute current canonical source / atomic flow against local mocks.
// They are behavior gates, not browser, emulator, or production acceptance.
import '../../development/hd-manager/application/tests/manual-order-integrity.test.mjs';
import '../../development/hd-manager/application/tests/order-creation-command.test.mjs';
import '../../development/hd-manager/application/tests/delivery-cashflow-integrity.test.mjs';
import '../../development/hd-manager/application/tests/settings-data-integrity.test.mjs';

export const auditedMutationWiring={
  handleAddPayment:[/writePlan/,/await requireSharedWriteConfirmation/,/debt_order_payment/],
  handleEditPayment:[/previousPayment\.companyId !== myCompanyId/,/writePlan\.push/,/saveAtomicDocuments/],
  handleAddExpense:[/expenseData\.assetId && !assets\.some/,/writePlan\.push/,/saveDataDocument/],
  handleEditExpense:[/rawExpenses\.some/,/writePlan\.push/,/saveDataDocument/],
  handleAddOrder:[/orderCreationIntent/,/saveAtomicDocuments/,/await requireSharedWriteConfirmation/],
  handleEditOrder:[/writePlan/,/saveAtomicDocuments/,/await requireSharedWriteConfirmation/],
  handleDeleteOrder:[/runTransaction/,/order\.companyId\s*!==\s*companyId/,/isCurrent/],
  handleRestoreCompanyBackup:[/assertSettingsDataPermission/,/prepareSettingsDataCommand/,/commitSettingsDataCommand/],
};
export function assertAuditedMutationWiring(handlers){
  for(const [name,patterns]of Object.entries(auditedMutationWiring)){
    assert.ok(handlers.has(name),`Missing canonical handler: ${name}`);
    for(const pattern of patterns)assert.match(handlers.get(name),pattern,`${name}: current integrity boundary`);
  }
}
