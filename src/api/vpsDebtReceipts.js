import { HdApiError } from './client.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value) => `${value ?? ''}`.trim();
const isUuid = (value) => UUID_PATTERN.test(text(value));

const fail = (message, code) => new HdApiError(message, { code });

const requireUuid = (value, code, message) => {
  const normalized = text(value);
  if (!isUuid(normalized)) throw fail(message, code);
  return normalized;
};

const money = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw fail('A positive receipt amount is required.', 'VPS_RECEIPT_AMOUNT_REQUIRED');
  }
  return amount;
};

const receiptNumber = (value) => {
  const normalized = text(value);
  if (!normalized || normalized.length > 80) {
    throw fail('A stable receipt number is required.', 'VPS_RECEIPT_NUMBER_REQUIRED');
  }
  return normalized;
};

export async function saveVpsCustomerDebtReceipt(api, session, payment = {}) {
  const companyId = requireUuid(
    session?.companyId,
    'VPS_RECEIPT_TENANT_REQUIRED',
    'VPS tenant context is required.',
  );
  if (payment.companyId && text(payment.companyId) !== companyId) {
    throw fail('Cannot post a receipt for another tenant.', 'VPS_RECEIPT_TENANT_MISMATCH');
  }
  const number = receiptNumber(
    payment.receiptNumber || payment.clientMutationId || payment.id || payment.referenceCode,
  );
  const response = await api.createFinanceCustomerReceipt({
    receiptNumber: number,
    cashAccountId: requireUuid(
      payment.cashAccountId,
      'VPS_RECEIPT_CASH_ACCOUNT_REQUIRED',
      'Select an active VPS cash account before recording a receipt.',
    ),
    receivableId: requireUuid(
      payment.receivableId,
      'VPS_RECEIPT_RECEIVABLE_REQUIRED',
      'This payment has no mapped VPS receivable to settle.',
    ),
    amount: money(payment.amount),
    occurredAt: text(payment.occurredAt || payment.paidAt || payment.date) || undefined,
    note: text(payment.note || payment.bankContent).slice(0, 500) || undefined,
    clientMutationId: `hdm-receipt:${number}`.slice(0, 180),
  });
  const transaction = response?.cashTransaction;
  const movement = response?.debtMovement;
  if (transaction?.companyId !== companyId || movement?.companyId !== companyId) {
    throw fail('The VPS receipt response belongs to a different tenant.', 'VPS_RECEIPT_TENANT_MISMATCH');
  }
  return response;
}
