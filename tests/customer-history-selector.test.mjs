import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerRecordSelector } from '../src/utils/customerLedgerIndex.js';
import { appFunction, appObject } from './helpers/app-source-function.mjs';
import { calculateLoyaltyPoints } from '../functions/loyaltyRewards.mjs';
import { evaluateCustomerLoyaltyOrder, isActiveCustomerLoyaltyOrder } from '../src/utils/customerLoyaltyEligibility.js';
import { hasLoyaltySnapshotChanges } from '../src/utils/loyaltySnapshot.js';

test('history index preserves strict identity, row order and snapshot isolation through edits, removals and tenant changes', () => {
  const choose = createCustomerRecordSelector();
  const rows = Object.freeze([
    { id: 'one', customerId: 'c' }, { id: 'space', customerId: ' c ' },
    { id: 'number', customerId: 1 }, { id: 'string', customerId: '1' }, { id: 'empty', customerId: '' },
    { id: 'two', customerId: 'c', isArchived: true },
  ].map(Object.freeze));
  for (const id of ['c', ' c ', 1, '1', '', undefined]) assert.deepEqual(choose(rows, id), rows.filter(r => r.customerId === id));
  assert.strictEqual(choose(rows, 'c')[0], rows[0]);
  assert.strictEqual(choose(rows, 'c'), choose(rows, 'c'));
  const revised = rows.map(r => r.id === 'one' ? { ...r, customerId: 'other', amount: 125 } : r);
  assert.deepEqual(choose(revised, 'c'), [rows[5]]);
  assert.deepEqual(choose(revised.slice(1), 'other'), []);
  assert.deepEqual(choose([{ id: 'new-company', customerId: 'c' }], 'c').map(r => r.id), ['new-company']);
  assert.deepEqual(choose(rows, 'c'), [rows[0], rows[5]], 'returning to an earlier immutable snapshot is exact');
  assert.throws(() => choose({}, 'c'), /record array/);
});

test('all customer selections index a dataset once instead of rescanning its records for every customer', () => {
  const choose = createCustomerRecordSelector();
  let reads = 0;
  const rows = Object.freeze(Array.from({ length: 10000 }, (_, i) => Object.freeze({
    id: `p${i}`, get customerId() { reads++; return `c${i % 400}`; },
  })));
  for (let i = 0; i < 400; i++) assert.equal(choose(rows, `c${i}`).length, 25);
  assert.equal(reads, rows.length);
  for (let i = 0; i < 400; i++) choose(rows, `c${i}`);
  assert.equal(reads, rows.length, 'same snapshot incurs no new membership reads');
});

const setLiteral = name => new Set(appObject(name).arguments[0].elements.map(node => node.value));
const approvals = Object.fromEntries(appObject('CASHFLOW_APPROVAL_STATUS').properties.map(node => [node.key.name, node.value.value]));
const isUnconfirmedPaymentIntent = appFunction('isUnconfirmedPaymentIntent', {
  PAYMENT_INTENT_SOURCE_TYPES: setLiteral('PAYMENT_INTENT_SOURCE_TYPES'),
  UNCONFIRMED_PAYMENT_STATUSES: setLiteral('UNCONFIRMED_PAYMENT_STATUSES'),
});
const requiresCashflowApproval = appFunction('requiresCashflowApproval', { CASHFLOW_APPROVAL_STATUS: approvals });
const isCashflowOfficial = appFunction('isCashflowOfficial', { isUnconfirmedPaymentIntent, requiresCashflowApproval, CASHFLOW_APPROVAL_STATUS: approvals });
const getPaymentDateKey = row => row.paymentDate || row.date || '';
const dateAdapters = {
  getPaymentDateKey, getDateKeyFromAnyValue: value => typeof value === 'string' ? value.slice(0, 10) : '',
  getEntityTimestamp: row => Date.parse(row.createdAt || row.date) || 0,
  getPaymentTimestamp: row => Date.parse(getPaymentDateKey(row)) || 0,
};
const compareLedgerItems = appFunction('compareLedgerItems', dateAdapters);
const buildCustomerOpeningDebtOrder = appFunction('buildCustomerOpeningDebtOrder', {
  getCustomerOpeningDebtAmount: row => Math.max(0, row.openingDebtAmount || 0),
  getCustomerOpeningDebtDate: row => row.openingDebtDate || '2026-09-01',
  getCustomerDisplayName: row => row.name || '',
});
const ledger = choose => appFunction('buildCustomerLedger', {
  selectCustomerHistoryRows: choose, buildCustomerOpeningDebtOrder, compareLedgerItems, getPaymentDateKey, isCashflowOfficial,
});

test('actual App allocation results match full scans for every customer and changed snapshot', () => {
  const indexed = ledger(createCustomerRecordSelector());
  const fullScan = ledger(rows => rows);
  const customers = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, openingDebtAmount: i * 15, openingDebtDate: '2026-09-01' }));
  const orders = Array.from({ length: 1200 }, (_, i) => ({ id: `o${i}`, customerId: `c${i % 40}`,
    date: `2026-10-${String(i % 28 + 1).padStart(2, '0')}`, amount: i % 13 * 1000, isArchived: i % 23 === 0 }));
  const payments = Array.from({ length: 900 }, (_, i) => ({ id: `p${i}`, customerId: `c${i % 40}`,
    date: `2026-10-${String(i % 28 + 1).padStart(2, '0')}`, amount: i % 11 * 1300,
    matchedOrderId: i % 3 === 0 ? `o${i % 1200}` : '', allocateOldestFirst: i % 7 === 0,
    allocationMode: i % 9 === 0 ? 'oldest_first' : '', isArchived: i % 19 === 0,
    approvalStatus: i % 17 === 0 ? 'pending_handover' : 'approved', status: i % 31 === 0 ? 'pending' : 'completed',
  }));
  const original = JSON.stringify({ customers, orders, payments });
  const snapshots = [
    [orders, payments],
    [orders.map((r,i)=>i===0?{...r,customerId:'c1',amount:20000}:r), payments.map((r,i)=>i===1?{...r,customerId:'c2',amount:30000}:r)],
    [orders.slice(10), payments.slice(20)], [orders, payments],
  ];
  for (const [o,p] of snapshots) for (const customer of customers) assert.deepEqual(indexed(customer,o,p), fullScan(customer,o,p));
  assert.equal(JSON.stringify({ customers, orders, payments }), original, 'no caller records or allocations mutate');
});

test('actual loyalty callback writes identical complete snapshots with indexed and full-scan histories', async () => {
  const customers = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `Fixture ${i}`, bonusLoyaltyPoints: i + 2, usedLoyaltyPoints: i }));
  const orders = Array.from({ length: 240 }, (_, i) => ({ id: `o${i}`, customerId: `c${i % 8}`, date: i % 9 ? '2026-10-30' : '2026-10-31',
    amount: 10000 + i * 10, status: i % 13 === 0 ? 'cancelled' : 'completed', deliveryStatus: i % 4 === 0 ? 'pending' : 'Đã giao',
    sourceDispatchIds: [`d${i}`], sourceOrderRequestId: i % 2 ? `r${i}` : '', isArchived: i % 19 === 0 }));
  const payments = Array.from({ length: 260 }, (_, i) => ({ id: `p${i}`, customerId: `c${i % 8}`, date: '2026-10-31',
    amount: 11000, matchedOrderId: i % 3 ? `o${i % 240}` : '', isArchived: i % 17 === 0,
    approvalStatus: i % 7 === 0 ? 'pending_handover' : 'approved' }));
  const orderRequests = orders.map((r,i) => ({ id:`r${i}`,customerId:r.customerId,source:i%3?'customer_portal':'employee',isArchived:i%11===0 }));
  const warehouseDispatches = orders.map((r,i) => ({ id:`d${i}`,customerId:r.customerId,sourceOrderRequestIds:[`r${i}`],isArchived:i%23===0 }));
  const customerPoints = [{ id:'customer_points_c0',customer_id:'c0',bonus_points:7,used_points:3,available_points:2,pointHistory:[{id:'previous'}] }];
  const fixedEpoch = Date.parse('2026-10-31T04:00:00Z');
  class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedEpoch])); } static now() { return fixedEpoch; } }
  const run = async (choose, conditions, options) => {
    let state = customerPoints.slice(); const writes = [], remembered = [];
    const callback = appFunction('syncCustomerLoyaltyPoints', {
      firebaseUser:{uid:'fixture'},myCompanyId:'fixture-company',currentUser:{id:'fixture-user'},currentCompany:{},
      customers,customerPoints,orders,payments,orderRequests,warehouseDispatches,
      selectCustomerHistoryRows:choose,buildCustomerLedger:ledger(choose),
      getEffectiveCustomerLoyaltySettings:()=>({enabled:true,earnAmountPerPoint:1000,redeemValuePerPoint:100,eligibilityConditions:conditions}),
      buildCustomerDebtLimitStatus:(_,value)=>({enabled:true,exceeded:value.currentDebt>5000}),
      isActiveCustomerLoyaltyOrder,evaluateCustomerLoyaltyOrder,calculateLoyaltyPoints,hasLoyaltySnapshotChanges,
      getTodayString:()=>'2026-10-31',getDateKeyFromAnyValue:dateAdapters.getDateKeyFromAnyValue,
      parseLooseMoneyValue:value=>Number(value)||0,roundMoneyValue:Math.round,Date:FixtureDate,
      setRawCustomerPoints:update=>{state=update(state);},rememberRecentLocalWrite:(...args)=>remembered.push(args),
      saveDataDocument:async(...args)=>{writes.push(args);return true;},
    }, {memoCallback:true,scope:'App'});
    for(const customer of customers) assert.equal(await callback(customer.id,options),true);
    return {state,writes,remembered};
  };
  for(const conditions of [{},{notOverdue:true,orderedViaHdManager:true,delivered:true},{withinCreditLimit:true,afterFifteenOrders:true}]) {
    const options={extraOrders:[{id:'extra',customerId:'c0',amount:8000,date:'2026-10-31',placedViaHdManager:true}],archivedOrderIds:['o0']};
    assert.deepEqual(await run(createCustomerRecordSelector(),conditions,options),await run(rows=>rows,conditions,options));
  }
});
