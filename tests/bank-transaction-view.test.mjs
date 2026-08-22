import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getBankTransactionTimestamp,
  sortBankTransactionsByTransactionDate
} from '../src/utils/bankTransactionView.js';

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

const appSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8');
assert.match(appSource, /sortBankTransactionsByTransactionDate/);
assert.match(appSource, /sortedTransactions\.map\(transaction =>/);
assert.doesNotMatch(appSource, /sortedTransactions\.slice\(0,\s*12\)/);

for (let run = 0; run < 100; run += 1) {
  assert.deepEqual(
    sortBankTransactionsByTransactionDate(transactions).map(transaction => transaction.id),
    ['today-later', 'today', 'created-later-but-older'],
    `stable ordering failed on run ${run + 1}`
  );
}

console.log('Bank transaction view tests passed: 103 assertions');
