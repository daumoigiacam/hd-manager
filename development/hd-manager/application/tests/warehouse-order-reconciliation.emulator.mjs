import assert from 'node:assert/strict';
import {createWarehouseOrderEmulator} from './helpers/warehouse-order-emulator.mjs';
import {createOrderCreationAdmission} from '../src/services/orderCreationAdmission.js';
const fixture = await createWarehouseOrderEmulator();
let passed = 0;
const test = async (name, callback) => {await callback(); console.log('PASS ' + name); passed++;};
try {
  await test('46 actual atomic transactions succeed across reconciliation refreshes, preserving source links, date, quantity and amount', async () => {
    const drafts = await fixture.seed();
    const gate = createOrderCreationAdmission({timeoutMs: 30000}), identity = 'qa-a:owner-a:permissions1';
    const callback = async (...args) => {
      const result = await fixture.create()(...args);
      gate.update({identity, ready: false, callback});
      setTimeout(() => gate.update({identity, ready: true, callback}), 15);
      return result;
    };
    gate.update({identity, ready: true, callback});
    for (const draft of drafts) await gate.run(['owner-a', draft, {}], identity);
    const result = await fixture.snapshot();
    assert.equal(result.orders.length, 46);
    assert.equal(new Set(result.dispatches.map(row => row.linkedOrderId)).size, 46);
    for (const row of result.orders) {
      assert.equal(row.amount, 680400); assert.equal(row.orderDate, '2026-11-21');
      assert.equal(row.sourceDispatchDate, '2026-11-20'); assert.equal(row.items[0].billingQuantity, 16.2);
      assert.equal(row.sourceDispatchIds.length, 1);
      assert.equal(result.dispatches.find(dispatch => dispatch.id === row.sourceDispatchIds[0]).linkedOrderId, row.id);
    }
    assert.equal(result.orders.reduce((sum,row) => sum + row.amount, 0), 31298400);
  });
  await test('two clients with stale local lists racing the same dispatch produce exactly one order', async () => {
    const [draft] = await fixture.seed(1);
    const a = fixture.create(), b = fixture.create();
    const results = await Promise.allSettled([a('owner-a', draft, {}), b('owner-a', draft, {})]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const result = await fixture.snapshot(); assert.equal(result.orders.length, 1);
    assert.equal(result.dispatches[0].linkedOrderId, result.orders[0].id);
  });
  await test('server-linked dispatch blocks creation even if the client has not seen the existing order', async () => {
    const [draft] = await fixture.seed(1);
    await fixture.patchDispatch('dispatch-0', {linkedOrderId: 'existing-order'});
    await assert.rejects(fixture.create()('owner-a', draft, {}), /đã được lên đơn|không còn khả dụng/);
    assert.equal((await fixture.snapshot()).orders.length, 0);
  });
  await test('missing source dispatch rolls back all order/link writes in a multi-dispatch draft', async () => {
    const [draft] = await fixture.seed(1);
    draft.sourceDispatchIds.push('missing-dispatch');
    await assert.rejects(fixture.create()('owner-a', draft, {}));
    const result = await fixture.snapshot(); assert.equal(result.orders.length, 0); assert.equal(result.dispatches[0].linkedOrderId, undefined);
  });
  await test('cross-tenant source dispatch is rejected with no partial order', async () => {
    const [draft] = await fixture.seed(1);
    await fixture.patchDispatch('dispatch-0', {companyId: 'qa-b'});
    await assert.rejects(fixture.create()('owner-a', draft, {}));
    assert.equal((await fixture.snapshot()).orders.length, 0);
  });
  console.log(JSON.stringify({status: 'PASS_FIRESTORE_EMULATOR_ONLY', passed, projectId: fixture.projectId, productionWrites: 0}));
} finally {await fixture.cleanup();}
