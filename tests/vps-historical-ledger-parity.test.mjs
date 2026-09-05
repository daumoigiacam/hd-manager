import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';
import { parse } from '@babel/parser';

const backend = process.env.HDCO_BACKEND_ROOT;
if (!backend) throw Error('HDCO_BACKEND_ROOT_REQUIRED_FOR_REAL_COMPILED_CONTRACT');
const { buildHistoricalCustomerLedger } = createRequire(import.meta.url)(join(backend, 'dist/src/finance-suite/historical-customer-ledger.js'));
const sourceCommit = '4fc19c19d53446add92576d47eb116f3fc0eb45a';
const source = execFileSync('git', ['show', `${sourceCommit}:src/App.jsx`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const names = new Set(['roundMoneyValue', 'parseLooseMoneyValue', 'normalizeCustomerOpeningDebtAmount', 'getCustomerOpeningDebtAmount', 'getCustomerOpeningDebtDate', 'buildCustomerOpeningDebtOrder', 'buildCustomerLedger', 'compareLedgerItems', 'CASHFLOW_APPROVAL_STATUS', 'UNCONFIRMED_PAYMENT_STATUSES', 'PAYMENT_INTENT_SOURCE_TYPES', 'isUnconfirmedPaymentIntent', 'requiresCashflowApproval', 'isCashflowOfficial', 'parseVietnameseDateTimeString', 'parseEntityTimestampValue', 'getEntityTimestamp', 'getDateKeyFromAnyValue', 'getPaymentRawPayosData', 'getPaymentDateCandidates', 'getPaymentDateSource', 'getPaymentDateKey', 'getPaymentTimestamp', 'toDateInputString', 'applyCustomerSupplierReconciliation']);
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const declarations = [];
for (const node of ast.program.body) {
  if (node.type !== 'VariableDeclaration') continue;
  for (const d of node.declarations) if (d.id.type === 'Identifier' && names.delete(d.id.name)) declarations.push(`const ${source.slice(d.start, d.end)};`);
}
assert.equal(names.size, 0, `Missing legacy functions: ${[...names]}`);
const context = vm.createContext({
  getCustomerDisplayName: (c) => c.name,
  getTodayString: () => { throw Error('NO_INVENTED_TODAY_IN_RECONCILIATION'); },
});
vm.runInContext(`${declarations.join('\n')}\nthis.oracle = (c,o,p) => applyCustomerSupplierReconciliation(buildCustomerLedger(c,o,p), {});`, context);
const marker = (id) => ({ sourceRecordId: id, version: 'hdco-native-payment-history/v2' });

test('compiled VPS ledger matches immutable legacy per-entry allocation across 400 date and timestamp cases', () => {
  let seed = 9173;
  const random = (max) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let run = 0; run < 400; run++) {
    const customer = { id: 'customer', name: 'Synthetic', openingDebtAmount: random(4) ? random(100) : 0, openingDebtDate: '2026-07-01', createdAt: '2026-07-01T01:00:00Z' };
    const orders = Array.from({ length: 8 }, (_, n) => ({ id: `o${n}`, customerId: 'customer', amount: random(1000) + random(4) / 4, date: `2026-08-0${1 + random(3)}`, isArchived: random(10) === 0 }));
    const payments = Array.from({ length: 9 }, (_, n) => ({ id: `p${n}`, customerId: 'customer', amount: random(1000) + random(4) / 4, date: `2026-08-0${1 + random(3)}`, matchedOrderId: `o${random(8)}`, allocateOldestFirst: random(3) === 0, requiresApproval: random(5) === 0, approvalStatus: random(3) === 0 ? 'pending_handover' : 'approved', isArchived: random(10) === 0, isPaymentIntent: random(10) === 0 }));
    if (run >= 200) {
      for (const row of [...orders, ...payments]) {
        const kind = random(4), hour = String(random(24)).padStart(2, '0');
        if (kind) row.date += `T${hour}:00:00${kind === 1 ? '' : kind === 2 ? 'Z' : '+07:00'}`;
      }
      for (const row of orders) if (random(3) === 0) row.paidAt = '2026-08-05T03:00:00Z';
    }
    const expected = context.oracle(customer, orders, payments);
    const native = (r) => ({ id: `native-${r.id}`, companyId: 'tenant', customerId: 'native-customer', matchedOrderId: r.matchedOrderId ? `native-${r.matchedOrderId}` : null, amount: r.amount?.toString(), fields: { ...r, __hdcoProjection: marker(r.id) } });
    const actual = buildHistoricalCustomerLedger({ companyId: 'tenant', customerId: 'native-customer', customers: [native(customer)], orders: orders.map(native), payments: payments.map(native), imports: [] });
    for (const key of ['totalRevenue', 'totalPaid', 'currentDebt', 'creditBalance', 'salesDebtBeforeReconcile', 'customerCreditBeforeReconcile']) assert.equal(Number(actual[key]), expected[key], `case=${run},field=${key}`);
    for (const order of actual.orders) {
      const ref = expected.orders.find((r) => r.id === order.sourceId);
      assert.ok(ref, order.sourceId);
      assert.equal(Number(order.outstanding), ref.outstandingAmount, `case=${run},order=${order.sourceId}`);
      assert.equal(Number(order.applied), ref.appliedAmount, `case=${run},applied=${order.sourceId}`);
      assert.equal(Number(order.creditApplied), ref.creditApplied || 0, `case=${run},credit=${order.sourceId}`);
      assert.deepEqual(order.allocations.map((a) => [a.id.replace(/^native-/, ''), Number(a.amount), a.matchType]), Array.from(ref.allocations, (a) => [a.paymentId, a.amount, a.matchType || 'oldest_first']), `case=${run},allocations=${order.sourceId}`);
    }
    for (const payment of actual.payments) {
      const ref = expected.payments.find((r) => r.id === payment.sourceId);
      assert.ok(ref);
      assert.equal(Number(payment.applied), ref.appliedAmount, `case=${run},payment-applied=${payment.sourceId}`);
      assert.equal(Number(payment.overpaid), ref.overpaidAmount, `case=${run},overpaid=${payment.sourceId}`);
    }
  }
});
