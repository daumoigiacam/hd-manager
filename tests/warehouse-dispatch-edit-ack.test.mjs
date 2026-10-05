import assert from 'node:assert/strict';
import test from 'node:test';
import { updateWarehouseDispatch, deleteWarehouseDispatch } from '../src/features/warehouse/warehouseDispatchUseCases.js';
import { appFunction } from './helpers/app-source-function.mjs';
import { canSaveLocallyFirst } from '../src/utils/localFirstSave.js';

test('actual dispatch persistence boundary rejects unsupported payloads and stale tenant before writes', async () => {
  const writes = [];
  const activeTenantScopeRef = { current: 'test' };
  const save = appFunction('saveWarehouseDispatchPatch', {
    sanitizeFirestoreWritePayload: value => value,
    canSaveLocallyFirst, myCompanyId: 'test', activeTenantScopeRef,
    saveDataDocument: async (...args) => { writes.push(args); return { queued: true }; },
  });
  await assert.rejects(save('warehouseDispatches', 'd', { weightKg: NaN }, { merge: true }), /không hợp lệ/);
  await assert.rejects(save('payments', 'd', {}, { merge: true }), /không hợp lệ/);
  activeTenantScopeRef.current = 'different-company';
  await assert.rejects(save('warehouseDispatches', 'd', { weightKg: 10 }, { merge: true }), /đã thay đổi/);
  assert.equal(writes.length, 0);
  activeTenantScopeRef.current = 'test';
  await save('warehouseDispatches', 'd', { weightKg: 10 }, { merge: true });
  assert.equal(writes.length, 1);
});

for (const operation of ['edit', 'archive']) {
  const run = context => operation === 'edit'
    ? updateWarehouseDispatch('d', { weightKg: 12 }, 'employee', context)
    : deleteWarehouseDispatch('d', context);
  function setup() {
    let rows = [{ id: 'd', companyId: 'test', quantity: 5, weightKg: 10 }];
    const context = {
      rawWarehouseDispatches: rows, customers: [], products: [], myCompanyId: 'test',
      currentUser: { id: 'employee' }, parseLooseQuantityValue: value => Number(value || 0),
      parseLooseMoneyValue: value => Number(value || 0), normalizeLeadingLabel: value => value,
      normalizeProductPricingUnit: value => value, isSameBillingUnit: (a, b) => a === b,
      getTodayString: () => '2026-10-06', setRawWarehouseDispatches: update => { rows = update(rows); },
      rememberRecentLocalWrite() {},
      saveDataDocument: async (_collection, id, payload) => {
        rows = rows.map(row => row.id === id ? { ...row, ...payload } : row);
        return { queued: true, companyId: 'test' };
      },
    };
    return { context, rows: () => rows };
  }
  test(`${operation} stays pending until confirmation and writes only once`, async () => {
    const { context } = setup();
    let release;
    const ack = new Promise(resolve => { release = resolve; });
    let writes = 0;
    context.saveDataDocument = async () => { writes++; return { queued: true, companyId: 'test' }; };
    context.requireSharedWriteConfirmation = async (result, collection, id) => {
      assert.deepEqual(result, { queued: true, companyId: 'test' });
      assert.equal(collection, 'warehouseDispatches');
      assert.equal(id, 'd');
      await ack;
    };
    let done = false;
    const task = run(context).then(() => { done = true; });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(done, false);
    release(); await task;
    assert.equal(done, true); assert.equal(writes, 1);
  });
  test(`${operation} ACK timeout rejects without rolling back a durable pending command`, async () => {
    const { context, rows } = setup();
    context.requireSharedWriteConfirmation = async () => { throw new Error('ACK timeout'); };
    await assert.rejects(run(context), /ACK timeout/);
    assert.equal(operation === 'edit' ? rows()[0].weightKg : rows()[0].isArchived,
      operation === 'edit' ? 12 : true);
  });
  test(`${operation} rejected persistence does not request confirmation`, async () => {
    const { context, rows } = setup();
    const previous = rows()[0];
    context.saveDataDocument = async () => { throw new Error('Storage full'); };
    context.requireSharedWriteConfirmation = async () => { assert.fail('Unexpected ACK'); };
    await assert.rejects(run(context), /Storage full/);
    assert.equal(rows()[0], previous);
  });
  test(`${operation} late rejection cannot overwrite a newer edit or refreshed record`, async () => {
    const { context, rows } = setup();
    let reject;
    context.saveDataDocument = () => new Promise((_resolve, fail) => { reject = fail; });
    context.requireSharedWriteConfirmation = async () => assert.fail('No accepted write');
    const task = run(context);
    const expected = { id: 'd', companyId: 'test', weightKg: 42, note: 'new server revision' };
    context.setRawWarehouseDispatches(() => [expected]);
    reject(new Error('Old write failed'));
    await assert.rejects(task, /Old write failed/);
    assert.equal(rows()[0], expected);
  });
}
