import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const extract = (name, next) => source.slice(source.indexOf(`const ${name} =`), source.indexOf(`const ${next} =`));
const context = vm.createContext({
  roundMoneyValue: Math.round,
  parseLooseMoneyValue: value => Number(value || 0),
  isCashflowOfficial: item => !item.requiresApproval || item.approvalStatus === 'approved',
});
vm.runInContext(extract('applyCustomerSupplierReconciliation', 'buildCustomerReconciledLedger'), context);
const reconcile = vm.runInContext('applyCustomerSupplierReconciliation', context);
const select = vm.runInContext('getCustomerDebtRepayments', context);

test('repayment reduces net company payable without changing receipts or sales', () => {
  const sales = { currentDebt: 200, creditBalance: 0, totalPaid: 50, totalRevenue: 250 };
  const purchase = { totalPurchaseDebt: 1000 };
  assert.equal(reconcile(sales, purchase).creditBalance, 800);
  const partial = reconcile(sales, purchase, [{ amount: 300 }]);
  assert.equal(partial.creditBalance, 500);
  assert.equal(partial.currentDebt, 0);
  assert.equal(partial.totalPaid, 50);
  assert.equal(partial.totalRevenue, 250);
  const settled = reconcile(sales, purchase, [{ amount: 300 }, { amount: 500 }]);
  assert.equal(settled.creditBalance, 0);
  assert.equal(settled.currentDebt, 0);
  assert.equal(settled.totalRepaid, 800);
});

test('customer overpayments can be repaid; archived, pending and unrelated expenses cannot reduce debt', () => {
  const base = { customerId: 'c', companyId: 'co', sourceType: 'customer_debt_repayment', amount: 80 };
  const records = [base, { ...base, isArchived: true }, { ...base, customerId: 'other' },
    { ...base, companyId: 'other' }, { ...base, sourceType: 'manual_accounting_expense' },
    { ...base, requiresApproval: true, approvalStatus: 'pending' }];
  const approved = select({ id: 'c', companyId: 'co' }, records);
  assert.equal(approved.length, 1);
  assert.equal(reconcile({ creditBalance: 100 }, {}, approved).creditBalance, 20);
  assert.equal(reconcile({ creditBalance: 100 }, {}, []).creditBalance, 100);
});

test('repayment submission uses expenses, blocks overpayment and leaves receipt flow separate', async () => {
  const debt = source.slice(source.indexOf('function DebtManagementView('));
  const body = debt.slice(debt.indexOf('const handlePaymentSubmit ='), debt.indexOf('const resolveDebtShareStatusMessage ='));
  let expense = null;
  let status = '';
  const state = {
    debtPaymentSubmitRef: { current: false }, selectedCustomer: { id: 'c', name: 'Customer', ledger: { creditBalance: 100 } },
    newPayment: { kind: 'repayment', amount: '60', date: '2026-10-02', method: 'Tiền mặt', clientMutationId: 'stable-id' },
    canRecordRepayment: true, canRecordCustomerPayment: true, isDriver: false,
    employee: { id: 'emp', name: 'Accountant' }, paymentTargetOrderId: '',
    parseLooseMoneyValue: Number, setDebtPaymentStatus: value => { status = value; },
    setIsSavingDebtPayment: () => {}, resetPaymentDraft: () => {},
    onAddRepayment: async value => { expense = value; return { queued: true }; },
    onAddPayment: () => { throw new Error('Must not create a receipt'); },
    getFriendlyFirebaseErrorMessage: error => error.message,
  };
  const sandbox = vm.createContext(state);
  vm.runInContext(body, sandbox);
  const submit = vm.runInContext('handlePaymentSubmit', sandbox);
  await submit({ preventDefault() {} });
  assert.equal(expense.sourceType, 'customer_debt_repayment');
  assert.equal(expense.amount, 60);
  assert.equal(expense.clientMutationId, 'stable-id');
  assert.match(status, /chưa xác nhận từ máy chủ/);
  expense = null;
  state.newPayment.amount = '101';
  await submit({ preventDefault() {} });
  assert.equal(expense, null);
  assert.match(status, /không được vượt/);
  assert.match(debt, /setDebtViewFilter\('credit'\); setSearchKeyword\(''\); setDebtDateFilterMode\('all'\)/);
});
