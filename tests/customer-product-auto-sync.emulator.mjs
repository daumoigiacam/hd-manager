import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, runTransaction, updateDoc, disableNetwork, enableNetwork } from 'firebase/firestore';
import { commitOrderRequestWithDefaults, configScopeFingerprint, orderRevision, payloadFingerprint } from '../src/utils/customerProductAutoSync.js';
import { resolveCustomerProductConfiguration } from '../src/services/customerProductBilling.js';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local emulator required');
const env = await initializeTestEnvironment({ projectId: 'demo-customer-product-sync', firestore: { rules: readFileSync(process.env.HD_CUSTOMER_SYNC_RULES_PATH || 'firestore.rules', 'utf8') } });
const claims = (companyId = 'a', role = 'owner') => ({ companyId, identityId: `identity-${role}`, appUserId: `employee-${role}`, accountType: 'employee', role });
const db = env.authenticatedContext('owner-a', claims()).firestore();
const ref = (database, collection, id) => doc(database, `artifacts/sync-test/public/data/${collection}/${id}`);
const base = { id: 'c', companyId: 'a', priceOverrides: { p: { billingUnit: 'Kg', pricingUnit: 'Kg', size: '1-1.1kg', unitPrice: 62000, price: 62000, defaultOrderUnit: 'Con' } } };
const metrics = { reads: 0, writes: 0, attempts: 0 };
let count = 0;
const check = async (name, action) => { await action(); count++; console.log(`PASS ${name}`); };
const get = (collection, id) => getDoc(ref(db, collection, id));
const command = async (id, patch = {}, before = null, customer = base) => {
  const payload = { id, customerId: 'c', companyId: 'a', date: '2026-10-30', items: [{ productId: 'p', sizeLabel: '1-1.1kg', unitPrice: 63000, billingUnit: 'Kg', quantityUnit: 'Con', quantity: 120 }], ...patch };
  return { requestId: id, payload, companyId: 'a', mutationId: `${id}-${before?.syncVersion || 0}`, fingerprint: await payloadFingerprint(payload),
    expectedOrderRevision: orderRevision(before), expectedCustomerConfig: configScopeFingerprint(customer), syncDefaults: true,
    now: new Date().toISOString(), actorId: 'employee-owner' };
};
const commit = (cmd, database = db, isOnline = true) => commitOrderRequestWithDefaults({ command: cmd, companyId: cmd.companyId, isOnline,
  reference: (c, id) => ref(database, c, id), transaction: callback => runTransaction(database, tx => {
    metrics.attempts++;
    return callback({ get: r => { metrics.reads++; return tx.get(r); }, set: (...args) => { metrics.writes++; tx.set(...args); }, update: (...args) => { metrics.writes++; tx.update(...args); } });
  }),
});
try {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(ref(ctx.firestore(), 'customers', 'c'), base);
    await setDoc(ref(ctx.firestore(), 'products', 'p'), { companyId: 'a', name: 'Test product' });
    await setDoc(ref(ctx.firestore(), 'customers', 'other'), { companyId: 'a', priceOverrides: { p: { price: 1 } } });
    await setDoc(ref(ctx.firestore(), 'customers', 'foreign'), { companyId: 'b' });
  });
  const first = await command('r');
  await check('order and defaults commit atomically; 120 Con snapshot stays Con with Kg price', async () => {
    await commit(first);
    assert.equal(metrics.reads, 3);
    assert.equal(metrics.writes, 2);
    assert.equal((await get('customers', 'c')).data().priceOverrides.p.price, 63000);
    assert.equal((await get('orderRequests', 'r')).data().items[0].quantityUnit, 'Con');
    assert.equal((await get('orderRequests', 'r')).data().items[0].billingUnit, 'Kg');
    assert.equal((await get('customers', 'other')).data().priceOverrides.p.price, 1);
  });
  await check('quantity-only writes just the order, not customer defaults', async () => {
    const before = (await get('orderRequests', 'r')).data();
    const customer = (await get('customers', 'c')).data();
    const c = await command('r', { items: [{ ...before.items[0], quantity: 121 }] }, before, customer);
    const snapshot = { ...metrics };
    await commit(c);
    assert.equal(metrics.reads - snapshot.reads, 2);
    assert.equal(metrics.writes - snapshot.writes, 1);
    assert.equal((await get('customers', 'c')).data().productConfigVersion, customer.productConfigVersion);
  });
  await check('duplicate replay is read-only and cannot undo a newer customer configuration', async () => {
    await updateDoc(ref(db, 'customers', 'c'), { 'priceOverrides.p.price': 64000 });
    const writes = metrics.writes;
    await commit(first);
    assert.equal(metrics.writes, writes);
    assert.equal((await get('customers', 'c')).data().priceOverrides.p.price, 64000);
  });
  await check('stale configuration rejects the whole order and retains committed defaults', async () => {
    await assert.rejects(commit(await command('stale')), /Cấu hình/);
    assert.equal((await get('orderRequests', 'stale')).exists(), false);
  });
  await check('concurrent editors: one commits, one conflicts; history and inventory are untouched', async () => {
    const before = (await get('orderRequests', 'r')).data();
    const customer = (await get('customers', 'c')).data();
    const a = await command('r', { items: [{ ...before.items[0], unitPrice: 65000 }] }, before, customer);
    const b = await command('r', { items: [{ ...before.items[0], unitPrice: 66000 }] }, before, customer);
    b.mutationId += '-second';
    const results = await Promise.allSettled([commit(a), commit(b)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await get('orderRequests', 'r')).data().syncVersion, 3);
    assert.equal((await get('warehouseDispatches', 'r')).exists(), false);
  });
  await check('permission denied rolls back order as well as configuration', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(ref(ctx.firestore(), 'employees', 'employee-sales'), { companyId: 'a', position: 'Kinh doanh' });
      await setDoc(ref(ctx.firestore(), 'companies', 'a'), { rolePermissions: { sales: { customers: false } } });
    });
    const restricted = env.authenticatedContext('sales', claims('a', 'sales')).firestore();
    const customer = (await get('customers', 'c')).data();
    const c = await command('denied', { items: [{ ...first.payload.items[0], unitPrice: 67000 }] }, null, customer);
    await assertFails(commit(c, restricted));
    assert.equal((await get('orderRequests', 'denied')).exists(), false);
  });
  await check('tenant isolation rejects foreign customer/order paths', async () => {
    const foreign = env.authenticatedContext('foreign', claims('b')).firestore();
    await assertFails(getDoc(ref(foreign, 'customers', 'c')));
    const c = await command('cross-tenant');
    c.payload.customerId = 'foreign';
    c.fingerprint = await payloadFingerprint(c.payload);
    await assert.rejects(commit(c));
    assert.equal((await get('orderRequests', 'cross-tenant')).exists(), false);
  });
  await check('assigned-only sales can update their customer but cannot update another employee customer', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(ref(ctx.firestore(), 'companies', 'a'), { rolePermissions: { sales: { customers: true } },
        rolePermissionActions: { sales: { customers: { view_all_customers: false, view_assigned_customers: true } } } });
      await updateDoc(ref(ctx.firestore(), 'customers', 'c'), { empId: 'employee-sales' });
    });
    const sales = env.authenticatedContext('sales', claims('a', 'sales')).firestore();
    await updateDoc(ref(sales, 'customers', 'c'), { productConfigUpdatedBy: 'employee-sales' });
    await assertFails(updateDoc(ref(sales, 'customers', 'other'), { productConfigUpdatedBy: 'employee-sales' }));
  });
  await check('offline failure preserves the command; reconnect replay commits once', async () => {
    const customer = (await get('customers', 'c')).data();
    const c = await command('offline', { items: [{ ...first.payload.items[0], unitPrice: 68000 }] }, null, customer);
    const durable = JSON.parse(JSON.stringify(c));
    await disableNetwork(db);
    try { await assert.rejects(commit(c, db, false)); } finally { await enableNetwork(db); }
    assert.equal((await get('orderRequests', 'offline')).exists(), false);
    await commit(durable);
    const version = (await get('customers', 'c')).data().productConfigVersion;
    await commit(durable);
    assert.equal((await get('customers', 'c')).data().productConfigVersion, version);
  });
  await check('customer configuration change seeds next order and leaves existing order snapshots frozen', async () => {
    const history = (await get('orderRequests', 'r')).data();
    await runTransaction(db, async tx => {
      const r = ref(db, 'customers', 'c');
      const live = (await tx.get(r)).data();
      tx.update(r, { priceOverrides: { ...live.priceOverrides, p: { ...live.priceOverrides.p, size: 'new-size', sizeLabel: 'new-size', price: 70000, unitPrice: 70000, unitPrices: { Kg: 70000 }, defaultOrderUnit: 'Con' } } });
    });
    const customer = (await get('customers', 'c')).data();
    const config = resolveCustomerProductConfiguration({ customerConfig: customer.priceOverrides.p, product: { id: 'p', unit: 'Kg' } });
    assert.equal(config.unitPrice, 70000);
    const c = await command('next', { items: [{ ...first.payload.items[0], sizeLabel: config.sizeLabel, unitPrice: config.unitPrice, quantityUnit: config.defaultOrderUnit }] }, null, customer);
    await commit(c);
    assert.equal((await get('orderRequests', 'next')).data().items[0].unitPrice, 70000);
    assert.deepEqual((await get('orderRequests', 'r')).data(), history);
    const portal = env.authenticatedContext('portal', { companyId: 'a', accountType: 'customer', customerId: 'c', appUserId: 'portal', identityId: 'portal' }).firestore();
    await assertFails(updateDoc(ref(portal, 'customers', 'c'), { 'priceOverrides.p.price': 1 }));
  });
  await check('a branch default update preserves inherited siblings, root defaults and other branches', async () => {
    await updateDoc(ref(db, 'customers', 'c'), { branches: [{ id: 'b', name: 'Test branch' }, { id: 'untouched', name: 'Other branch' }],
      'priceOverrides.other': { price: 75000, pricingUnit: 'Kg' } });
    const customer = (await get('customers', 'c')).data();
    const c = await command('branch-order', { branchId: 'b', items: [{ ...first.payload.items[0], unitPrice: 73000 }] }, null, customer);
    await commit(c);
    const saved = (await get('customers', 'c')).data();
    assert.equal(saved.branches[0].priceOverrides.p.price, 73000);
    assert.deepEqual(saved.priceOverrides, customer.priceOverrides);
    assert.deepEqual(saved.branches[0].priceOverrides.other, customer.priceOverrides.other);
    assert.deepEqual(saved.branches[1], customer.branches[1]);
  });
  console.log(JSON.stringify({ status: 'PASS', checks: count, metrics, environment: 'LOCAL_FIRESTORE_EMULATOR' }));
} finally { await env.cleanup(); }
