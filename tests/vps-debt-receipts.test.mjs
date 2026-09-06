import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reverseVpsCustomerDebtReceipt,
  saveVpsCustomerDebtReceipt,
} from '../src/api/vpsDebtReceipts.js';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const CASH = '22222222-2222-4222-8222-222222222222';
const RECEIVABLE = '33333333-3333-4333-8333-333333333333';

test('posts one tenant-scoped atomic receipt rather than client-side cash and debt writes', async () => {
  let request;
  const result = await saveVpsCustomerDebtReceipt({
    createFinanceCustomerReceipt: async (payload) => {
      request = payload;
      return {
        cashTransaction: { id: 'cash-1', companyId: COMPANY },
        debtMovement: { id: 'debt-1', companyId: COMPANY },
      };
    },
  }, { companyId: COMPANY }, {
    id: 'receipt-1',
    cashAccountId: CASH,
    receivableId: RECEIVABLE,
    amount: 500000,
    date: '2026-09-06',
    note: 'Thu no',
  });

  assert.equal(request.receiptNumber, 'receipt-1');
  assert.equal(request.cashAccountId, CASH);
  assert.equal(request.receivableId, RECEIVABLE);
  assert.equal(request.clientMutationId, 'hdm-receipt:receipt-1');
  assert.equal(result.cashTransaction.id, 'cash-1');
});

test('refuses an unmapped receivable without making an API request', async () => {
  let called = false;
  await assert.rejects(
    () => saveVpsCustomerDebtReceipt({
      createFinanceCustomerReceipt: async () => { called = true; },
    }, { companyId: COMPANY }, {
      id: 'receipt-2',
      cashAccountId: CASH,
      amount: 1,
    }),
    { code: 'VPS_RECEIPT_RECEIVABLE_REQUIRED' },
  );
  assert.equal(called, false);
});

test('reverses only a verified VPS receipt using its stable native transaction ID', async () => {
  let request;
  const result = await reverseVpsCustomerDebtReceipt({
    reverseFinanceCustomerReceipt: async (payload) => {
      request = payload;
      return {
        cashTransaction: { id: 'cash-reversal', companyId: COMPANY },
        debtMovement: { id: 'debt-reversal', companyId: COMPANY },
      };
    },
  }, { companyId: COMPANY }, {
    id: '44444444-4444-4444-8444-444444444444',
    companyId: COMPANY,
    source: 'hd-connect-vps',
    receiptNumber: 'PT-001',
  }, 'Duplicate receipt entered by cashier');

  assert.deepEqual(request, {
    receiptNumber: 'PT-001',
    reversalNumber: 'RV-44444444-4444-4444-8444-444444444444',
    reason: 'Duplicate receipt entered by cashier',
    clientMutationId: 'hdm-receipt-reversal:44444444-4444-4444-8444-444444444444',
  });
  assert.equal(result.cashTransaction.id, 'cash-reversal');

  await assert.rejects(
    () => reverseVpsCustomerDebtReceipt({
      reverseFinanceCustomerReceipt: async () => {
        throw new Error('must not call API');
      },
    }, { companyId: COMPANY }, {
      id: 'legacy-payment',
      companyId: COMPANY,
      source: 'firebase',
      receiptNumber: 'PT-LEGACY',
    }, 'Duplicate receipt entered by cashier'),
    { code: 'VPS_RECEIPT_REVERSAL_RECONCILIATION_REQUIRED' },
  );
});
