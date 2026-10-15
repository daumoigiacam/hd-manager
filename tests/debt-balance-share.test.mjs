import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDebtBalanceShare } from '../src/utils/debtBalanceShare.js';

test('shares exact ledger balance without deriving it from revenue minus payments', () => {
  const result = buildDebtBalanceShare({ name: 'Tuyết Phước Thành', phone: 'PRIVATE', managerName: 'PRIVATE', ledger: { currentDebt: 97320000, creditBalance: 0, totalRevenue: 301081800, totalPaid: 226547030 } });
  assert.match(result.text, /97\.320\.000 VNĐ/);
  assert.match(result.text, /Tuyết Phước Thành/);
  assert.doesNotMatch(result.text, /PRIVATE|301\.081\.800|hạn mức/);
});
test('credit and zero balances use the correct direction', () => {
  assert.match(buildDebtBalanceShare({ ledger: { currentDebt: 0, creditBalance: 1000 } }).text, /công ty còn nợ khách hàng: 1\.000 VNĐ/);
  assert.match(buildDebtBalanceShare({ ledger: { currentDebt: 0, creditBalance: 0 } }).text, /Công nợ hiện tại: 0 VNĐ/);
});
test('invalid or missing ledger never produces a misleading zero notice', () => {
  assert.throws(() => buildDebtBalanceShare({}));
  assert.throws(() => buildDebtBalanceShare({ ledger: { currentDebt: NaN, creditBalance: 0 } }));
});
