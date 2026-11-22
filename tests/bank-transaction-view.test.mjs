import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import {
  getBankTransactionTimestamp,
  isBankTransactionIgnored,
  sortBankTransactionsByTransactionDate
} from '../development/hd-manager/application/src/utils/bankTransactionView.js';

const transactions = [
  {
    id: 'created-later-but-older',
    transactionDate: '2026-08-21',
    transactionDateTime: '2026-08-21T23:59:00+07:00',
    createdAt: '2026-08-22T00:30:00+07:00'
  },
  {
    id: 'today',
    transactionDate: '2026-08-22',
    transactionDateTime: '2026-08-22T08:15:00+07:00',
    createdAt: '2026-08-22T08:16:00+07:00',
    reconciledPaymentId: 'payment-today'
  },
  {
    id: 'today-later',
    transactionDate: '2026-08-22',
    transactionDateTime: '2026-08-22T09:45:00+07:00',
    createdAt: '2026-08-22T09:46:00+07:00',
    reconciledPaymentId: 'payment-today-later'
  }
];

assert.ok(
  getBankTransactionTimestamp(transactions[0]) < getBankTransactionTimestamp(transactions[1]),
  'the transaction date must take precedence over createdAt'
);

const sorted = sortBankTransactionsByTransactionDate(transactions);
assert.deepEqual(sorted.map(transaction => transaction.id), ['today-later', 'today', 'created-later-but-older']);
assert.equal(sorted.length, transactions.length, 'sorting must not drop reconciled transactions');
assert.ok(sorted.some(transaction => transaction.id === 'today'), 'today transaction must remain visible');

const appSource = fs.readFileSync(new URL('../development/hd-manager/application/src/App.jsx', import.meta.url), 'utf8');
const appTree = parse(appSource, { sourceType: 'module', plugins: ['jsx'] });
const bank = appTree.program.body
  .find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'BankPaymentCenterView');
assert.ok(bank, 'inspect the canonical actual bank component');
const bankPaymentCenterSource = appSource.slice(bank.start, bank.end);
assert.match(bankPaymentCenterSource, /sortBankTransactionsByTransactionDate/);
assert.match(bankPaymentCenterSource, /usePagedList\(sortedTransactions/);
assert.match(bankPaymentCenterSource, /bankTransactionPage\.items\.map\(transaction =>/);
assert.doesNotMatch(bankPaymentCenterSource, /sortedTransactions\.slice\(/);
assert.match(appSource, /activeTab === 'bank_payments' \? 'TT giao dịch'/);
assert.match(bankPaymentCenterSource, /scrollToTransactionList/);
assert.match(bankPaymentCenterSource, /ref=\{transactionListRef\}/);
assert.match(appSource, /aria-label="Cài đặt TT giao dịch"/);
assert.match(appSource, /aria-controls="bank-settings-menu"/);
assert.match(appSource, /id="bank-settings-menu"/);
assert.match(bankPaymentCenterSource, /hd-bank-customer-accounts/);
assert.match(bankPaymentCenterSource, /TK Khách hàng/);
assert.match(bankPaymentCenterSource, /bankSettingsView === 'customers'/);
assert.doesNotMatch(bankPaymentCenterSource, />Tài khoản KH liên kết<\/h3>/);
assert.doesNotMatch(bankPaymentCenterSource, /Ngân hàng gần nhất/);
assert.doesNotMatch(bankPaymentCenterSource, /Có quyền đối soát/);

const ignored = [];
for (const field of ['autoReconcileStatus', 'reconciliationStatus', 'status']) {
  for (const value of ['ignored', 'cancelled', 'canceled', ' IGNORED ']) {
    const row = { id: `${field}-${value.trim()}`, [field]: value, amount: 1000, content: 'TT KNOWN', date: '2026-11-21' };
    assert.equal(isBankTransactionIgnored(row), true);
    ignored.push(row);
  }
}
for (const status of ['pending', 'no_order_code_match', 'not_ignored', 'cancel_requested', 'paid', '']) {
  assert.equal(isBankTransactionIgnored({ status }), false, 'Only explicit ignored/cancelled states qualify');
}
assert.equal(isBankTransactionIgnored({ status: 'ignored', autoReconcileStatus: 'no_order_code_match' }), true);
assert.equal(sortBankTransactionsByTransactionDate(ignored).length, ignored.length, 'Ignored/cancelled records remain available for display');

// Evaluate the actual startup eligibility expression without executing its
// reconciliation loop or any provider/database side effect.
let automaticEligibility;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'pendingTransactions'
    && node.init?.type === 'CallExpression' && node.init.callee?.object?.name === 'bankTransactions'
    && node.init.callee?.property?.name === 'filter') automaticEligibility = node.init;
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit);
    else if (value?.type) visit(value);
  }
}
visit(appTree);
assert.ok(automaticEligibility, 'The canonical automatic reconciliation eligibility filter exists');
assert.match(appSource, /import \{[^}]*isBankTransactionIgnored[^}]*\} from '\.\/utils\/bankTransactionView\.js'/);
let lookups = 0;
const pending = { id: 'pending', status: 'pending', amount: 1000, content: 'TT KNOWN', date: '2026-11-21' };
const eligibleBindings = {
  bankTransactions: [...ignored, { ...pending, id: 'ignored-error', status: 'ignored', autoReconcileStatus: 'no_order_code_match' }, pending],
  isBankTransactionIgnored, resolveBankTransactionContent: row => row.content, resolveBankTransactionAmount: row => row.amount,
  paymentByBankTransactionId: new Set(), bankReconcileInFlightRef: { current: new Set() },
  normalizeLookupText: value => String(value || '').toLowerCase(), orders: [], currentCompany: {},
  resolveMatchedOrderFromTransfer: () => { lookups++; return {}; },
};
const beforeEligibility = JSON.stringify(eligibleBindings.bankTransactions);
const eligible = Function(...Object.keys(eligibleBindings), 'return (' + appSource.slice(automaticEligibility.start, automaticEligibility.end) + ')')(...Object.values(eligibleBindings));
assert.deepEqual(eligible.map(row => row.id), ['pending']);
assert.equal(lookups, 0, 'Ignored records must be excluded before memo matching');
assert.equal(JSON.stringify(eligibleBindings.bankTransactions), beforeEligibility, 'Eligibility cannot rewrite ignored history');

for (let run = 0; run < 100; run += 1) {
  assert.deepEqual(
    sortBankTransactionsByTransactionDate(transactions).map(transaction => transaction.id),
    ['today-later', 'today', 'created-later-but-older'],
    `stable ordering failed on run ${run + 1}`
  );
}

console.log('Canonical bank transaction view: paging contracts and 100 stable-sort checks passed');
