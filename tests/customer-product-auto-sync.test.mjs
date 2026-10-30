import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { planCustomerProductSync, configScopeFingerprint, payloadFingerprint } from '../src/utils/customerProductAutoSync.js';
import { resolveCustomerProductConfiguration } from '../src/services/customerProductBilling.js';
const { hasCustomerMessageRoutingChanged } = createRequire(import.meta.url)('../functions/customerMessaging.js');

const meta = { now: '2026-10-30T15:00:00Z', actorId: 'sales-a' };
const base = () => ({ id: 'c', companyId: 'a', customerProductIds: ['p'], priceOverrides: {
  p: { size: '1-1.1kg', unitPrice: 62000, price: 62000, billingUnit: 'Kg', pricingUnit: 'Kg', defaultOrderUnit: 'Con', orderUnit: 'Con', note: 'keep' },
  other: { price: 100 },
} });
const item = patch => ({ productId: 'p', sizeLabel: '1-1.1kg', unitPrice: 62000, billingUnit: 'Kg', quantityUnit: 'Con', quantity: 120, ...patch });
const order = row => ({ customerId: 'c', items: [row] });

for (const [name, patch] of Object.entries({ size: { sizeLabel: '1.1-1.2kg' }, price: { unitPrice: 63000 }, orderUnit: { quantityUnit: 'Thùng' }, all: { sizeLabel: '1.1-1.2kg', unitPrice: 63000, quantityUnit: 'Thùng' } })) {
  test(`sync ${name} only, preserve price unit and history`, () => {
    const customer = base();
    const old = order(item());
    const original = structuredClone({ customer, old });
    const row = item(patch);
    const result = planCustomerProductSync(customer, order(row), old, meta);
    const config = result.patch.priceOverrides.p;
    assert.equal(config.size, row.sizeLabel);
    assert.equal(config.unitPrice, row.unitPrice);
    assert.equal(config.defaultOrderUnit, row.quantityUnit);
    assert.equal(config.billingUnit, 'Kg');
    assert.equal(config.note, 'keep');
    assert.equal(config.version, 1);
    assert.deepEqual(result.patch.priceOverrides.other, customer.priceOverrides.other);
    assert.deepEqual({ customer, old }, original);
    const resolved = resolveCustomerProductConfiguration({ customerConfig: config, product: { id: 'p', unit: 'Kg' } });
    assert.equal(resolved.unitPrice, row.unitPrice);
    assert.equal(resolved.defaultOrderUnit, row.quantityUnit);
  });
}

test('quantity-only does not update any default or metadata', () => {
  assert.equal(planCustomerProductSync(base(), order(item({ quantity: 121 })), order(item()), meta).patch, null);
});
test('ambiguous sizes without variants preserve the entire prior product configuration', () => {
  const result = planCustomerProductSync(base(), { items: [item({ sizeLabel: 'small' }), item({ sizeLabel: 'large' })] }, null, meta);
  assert.equal(result.patch, null);
  assert.deepEqual(result.skipped, [{ productId: 'p', reason: 'ambiguous-variant' }]);
});

test('editing one of several unresolved sizes cannot overwrite defaults using that line alone', () => {
  const before = { customerId: 'c', items: [item({ sizeLabel: 'small' }), item({ sizeLabel: 'large' })] };
  const after = { ...before, items: [{ ...before.items[0], unitPrice: 65000 }, before.items[1]] };
  const result = planCustomerProductSync(base(), after, before, meta);
  assert.equal(result.patch, null);
  assert.equal(result.skipped.length, 1);
});

test('a customer change considers defaults for the destination, even if line values are unchanged', () => {
  const customer = base();
  customer.id = 'new';
  customer.priceOverrides.p.price = 50000;
  customer.priceOverrides.p.unitPrice = 50000;
  const result = planCustomerProductSync(customer, { customerId: 'new', items: [item()] }, order(item()), meta);
  assert.equal(result.patch.priceOverrides.p.price, 62000);
});
test('stable variants can change size without creating a duplicate; siblings keep independent prices', () => {
  const customer = base();
  customer.priceOverrides.p.variants = [
    { id: 'small', size: 'small', billingUnit: 'Kg', price: 61000, defaultOrderUnit: 'Con' },
    { id: 'big', size: 'big', billingUnit: 'Kg', price: 65000, defaultOrderUnit: 'Con' },
  ];
  const result = planCustomerProductSync(customer, { items: [item({ configurationId: 'small', sizeLabel: 'new-small', unitPrice: 60000 }), item({ configurationId: 'big', sizeLabel: 'new-big', unitPrice: 66000 })] }, null, meta);
  assert.equal(result.patch.priceOverrides.p.variants.length, 2);
  assert.deepEqual(result.patch.priceOverrides.p.variants.map(v => [v.id, v.size, v.price]), [['small', 'new-small', 60000], ['big', 'new-big', 66000]]);
});
test('catalog attributes get independent stable defaults and branch changes never overwrite root', () => {
  const customer = base();
  customer.branches = [{ id: 'b', name: 'Branch' }, { id: 'other', name: 'Other' }];
  const result = planCustomerProductSync(customer, { branchId: 'b', items: [item({ attributeLabel: 'To', unitPrice: 65000 }), item({ attributeLabel: 'Trung', unitPrice: 62000 })] }, null, meta);
  assert.equal(result.patch.priceOverrides, undefined);
  assert.equal(result.patch.branches[0].priceOverrides.p.variants.length, 2);
  assert.deepEqual(result.patch.branches[0].priceOverrides.other, customer.priceOverrides.other);
  assert.deepEqual(customer.priceOverrides.p, base().priceOverrides.p);
  assert.deepEqual(result.patch.branches[1], customer.branches[1]);
  assert.throws(() => planCustomerProductSync(customer, { branchId: 'missing', items: [item()] }, null, meta));
});
test('Con/Kg are never silently exchanged and invalid prices fail before any write', () => {
  assert.throws(() => planCustomerProductSync(base(), order(item({ billingUnit: 'Con', unitPrice: 500 })), null, meta));
  assert.throws(() => planCustomerProductSync(base(), order(item({ unitPrice: NaN })), null, meta));
});
test('fingerprints ignore transient save timestamps and object key order, not business data', async () => {
  assert.equal(configScopeFingerprint(base()), configScopeFingerprint(structuredClone(base())));
  assert.equal(await payloadFingerprint({ a: 1, b: 2, createdAt: 'old' }), await payloadFingerprint({ b: 2, a: 1, createdAt: 'new' }));
  assert.notEqual(await payloadFingerprint({ quantity: 1 }), await payloadFingerprint({ quantity: 2 }));
});

test('customer trigger skips config-only writes but retains assignment and creation handling', () => {
  const before = { id: 'c', companyId: 'a', empId: 'sales', priceOverrides: { p: { price: 1 } } };
  assert.equal(hasCustomerMessageRoutingChanged(before, { ...before, productConfigVersion: 2, priceOverrides: { p: { price: 2 } } }, 'c'), false);
  assert.equal(hasCustomerMessageRoutingChanged(before, { ...before, empId: 'other' }, 'c'), true);
  assert.equal(hasCustomerMessageRoutingChanged(before, { ...before, companyId: 'b' }, 'c'), true);
  assert.equal(hasCustomerMessageRoutingChanged(null, before, 'c'), true);
});

test('actual written-event handler avoids routing queries for product-default changes', async () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('exports.syncCustomerMessageAssignment = onDocumentWritten('));
  const handlerText = block.slice(block.indexOf('async (event) => {'), block.indexOf('\n);'));
  let calls = 0;
  const handler = new Function('hasCustomerMessageRoutingChanged', 'normalizeAppId', 'syncCustomerSupportMessageRouting', 'console', `return (${handlerText})`)(
    hasCustomerMessageRoutingChanged, id => id, async () => { calls++; return { updated: 1 }; }, { log() {} },
  );
  const before = { companyId: 'a', empId: 'sales' };
  const event = after => ({ params: { appId: 'test', customerId: 'c' }, data: { before: { exists: true, data: () => before }, after: { exists: true, data: () => after } } });
  await handler(event({ ...before, priceOverrides: { p: { price: 62000 } } }));
  assert.equal(calls, 0);
  await handler(event({ ...before, empId: 'other' }));
  assert.equal(calls, 1);
});
