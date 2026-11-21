import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {buildCustomerBatchPricePatch} from '../src/utils/customerBatchPricePatch.js';
import {resolveCustomerProductConfiguration, buildCustomerProductBillingSnapshot} from '../src/services/customerProductBilling.js';
import {normalizeProductPricingUnit, normalizeUnitPriceMap} from '../src/services/productPricingUnits.js';
import {configScopeFingerprint, syncError} from '../src/utils/customerProductAutoSync.js';

const shared = fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx', import.meta.url), 'utf8');
const tree = parse(shared, {sourceType: 'module', plugins: ['jsx']});
const definitions = ['parseLooseMoneyValue', 'hasCustomerOrderConfigurationValue', 'normalizeCustomerPriceOverrides'].map(name => {
  const declaration = tree.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === name));
  assert.ok(declaration, `Actual shared helper ${name}`);
  return shared.slice(declaration.start, declaration.end);
}).join('\n');
const normalize = Function('normalizeProductPricingUnit', 'normalizeUnitPriceMap', `${definitions};return normalizeCustomerPriceOverrides;`)(
  normalizeProductPricingUnit, normalizeUnitPriceMap,
);
const product = Object.freeze({id: 'qa_chicken', name: 'Gà', unit: 'Con', sellingPrice: 50000});
function richCustomer(id = 'A') {
  return {id, name: `Customer ${id}`, companyId: 'qa-only', phone: id === 'A' ? '0900000001' : '0900000002', customerProductIds: ['qa_chicken', 'qa_duck'],
    qaCustomerMetadata: {retain: true}, priceOverrides: {
      qa_chicken: {price: 58000, unitPrice: 58000, sellingPrice: 58000, pricingUnit: 'Kg', billingUnit: 'Kg',
        defaultOrderUnit: 'Con', orderUnits: ['Con', 'Kg'], unitPrices: {Kg: 58000, Con: 145000},
        unitConversions: 'Con=2.5', qaMetadata: {retain: 'main-policy'},
        variants: [{id: 'large', price: 62000, size: 'Lớn', pricingUnit: 'Kg', unitPrices: {Kg: 62000},
          unitConversions: 'Con=3', qaMetadata: {retain: 'variant-policy'}}]},
      qa_duck: {price: 67000, pricingUnit: 'Con', qaMetadata: {retain: 'other-product'}},
      zeroLegacy: 0,
    }};
}
function freeze(value) {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
}
const patch = (customer, options = {}) => buildCustomerBatchPricePatch({
  customer, product, price: 59000, normalizedOverrides: normalize(customer), ...options,
});

test('rich selected config keeps raw metadata, units, conversions and exact variants while changing only base pricing', () => {
  const customer = freeze(richCustomer()), before = structuredClone(customer);
  const normalizedOverrides = freeze(normalize(customer));
  const result = patch(customer, {normalizedOverrides, fingerprint: configScopeFingerprint(customer)});
  const selected = result.priceOverrides.qa_chicken;
  assert.equal(selected.price, 59000);
  assert.equal(selected.unitPrice, 59000);
  assert.equal(selected.sellingPrice, 59000);
  assert.deepEqual(selected.unitPrices, {Kg: 59000, Con: 145000});
  for (const key of ['pricingUnit', 'billingUnit', 'defaultOrderUnit', 'orderUnits', 'unitConversions', 'qaMetadata', 'variants']) {
    assert.deepEqual(selected[key], customer.priceOverrides.qa_chicken[key], key);
  }
  assert.deepEqual(result.priceOverrides.qa_duck, customer.priceOverrides.qa_duck);
  assert.equal(result.priceOverrides.zeroLegacy, 0, 'Normalization must not delete an unrelated legacy override');
  assert.equal(result.__customerConfigBase, configScopeFingerprint(customer));
  assert.deepEqual(customer, before);
});

test('actual normalized billing uses 59000 per Kg while keeping Con pricing, conversions and explicit variant prices', () => {
  const customer = richCustomer(), result = patch(customer);
  const updated = {...customer, ...result};
  for (const config of [result.priceOverrides.qa_chicken, normalize(updated).qa_chicken]) {
    const billing = resolveCustomerProductConfiguration({customerConfig: config, product});
    assert.equal(billing.unitPrice, 59000);
    assert.equal(billing.pricingUnit, 'Kg');
    assert.equal(billing.defaultOrderUnit, 'Con');
    assert.equal(billing.unitConversions, 'Con=2.5');
    const invoice = buildCustomerProductBillingSnapshot({configuration: billing, product,
      actualQuantity: 2, actualUnit: 'Con', actualWeightKg: 5});
    assert.equal(invoice.amount, 295000);
    assert.equal(invoice.actualQuantity, 2);
    const variant = resolveCustomerProductConfiguration({customerConfig: config, product, configurationId: 'large'});
    assert.equal(variant.unitPrice, 62000);
    assert.equal(variant.unitConversions, 'Con=3');
  }
});

test('existing unitPrice alias must change even when there is no unit-price map', () => {
  const customer = {priceOverrides: {qa_chicken: {unitPrice: 58000, sellingPrice: 57000, pricingUnit: 'Kg', billingUnit: 'Kg', defaultOrderUnit: 'Con'}}};
  const result = patch(customer);
  assert.equal(result.priceOverrides.qa_chicken.unitPrice, 59000);
  assert.equal(result.priceOverrides.qa_chicken.sellingPrice, 59000);
  assert.equal(resolveCustomerProductConfiguration({product, customerConfig: normalize({...customer, ...result}).qa_chicken}).unitPrice, 59000);
});

test('only existing primary-unit entries change, preserving map aliases, non-primary prices and raw extra fields', () => {
  const customer = {priceOverrides: {qa_chicken: {price: 58000, pricingUnit: 'Kg',
    unitPrices: {kilogram: 58000, Kg: 58000, Con: 145000, note: {retain: true}},
    pricesByUnit: {kgs: 58000, Con: 140000}, priceByUnit: {Kg: 58000, Con: 135000}}}};
  const result = patch(customer), selected = result.priceOverrides.qa_chicken;
  assert.equal(selected.unitPrices.kilogram, 59000);
  assert.equal(selected.unitPrices.Kg, 59000);
  assert.equal(selected.unitPrices.Con, 145000);
  assert.deepEqual(selected.unitPrices.note, {retain: true});
  assert.deepEqual(selected.pricesByUnit, {kgs: 59000, Con: 140000});
  assert.deepEqual(selected.priceByUnit, {Kg: 59000, Con: 135000});
  const otherOnly = patch({priceOverrides: {qa_chicken: {price: 58000, pricingUnit: 'Kg', unitPrices: {Con: 145000}}}});
  assert.deepEqual(otherOnly.priceOverrides.qa_chicken.unitPrices, {Con: 145000}, 'Do not add a new primary map entry');
  assert.equal(resolveCustomerProductConfiguration({product, customerConfig: otherOnly.priceOverrides.qa_chicken}).unitPrice, 59000);
});

test('normalized-only defaults remain available while raw variant and unrelated-product metadata win', () => {
  const customer = richCustomer();
  const normalizedOverrides = {...normalize(customer), normalizedOnlyProduct: {price: 123, meta: true}};
  normalizedOverrides.qa_chicken.normalizedOnly = {retain: true};
  const result = patch(customer, {normalizedOverrides});
  assert.deepEqual(result.priceOverrides.qa_chicken.normalizedOnly, {retain: true});
  assert.deepEqual(result.priceOverrides.qa_chicken.variants, customer.priceOverrides.qa_chicken.variants);
  assert.deepEqual(result.priceOverrides.qa_duck, customer.priceOverrides.qa_duck);
  assert.deepEqual(result.priceOverrides.normalizedOnlyProduct, normalizedOverrides.normalizedOnlyProduct);
});

test('legacy customPrices, numeric prices and array overrides retain unrelated raw records', () => {
  for (const customer of [
    {customPrices: {qa_chicken: 58000, other: {price: 12, metadata: {retain: true}}}},
    {priceOverrides: [{productId: 'qa_chicken', price: 58000, pricingUnit: 'Kg', metadata: {retain: true}},
      {productId: 'other', price: 12, metadata: {retain: true}}]},
  ]) {
    const before = structuredClone(customer), result = patch(customer);
    assert.equal(result.priceOverrides.qa_chicken.price, 59000);
    assert.deepEqual(result.priceOverrides.other.metadata, {retain: true});
    assert.deepEqual(customer, before);
  }
});

test('blank size preserves existing labels; a chosen size updates its existing alias without changing attributes or variants', () => {
  const customer = richCustomer();
  Object.assign(customer.priceOverrides.qa_chicken, {size: 'Vừa', sizeLabel: 'Vừa', attributeLabel: 'Móc'});
  assert.equal(patch(customer, {size: ' '}).priceOverrides.qa_chicken.size, 'Vừa');
  const selected = patch(customer, {size: '  Nhỏ  '}).priceOverrides.qa_chicken;
  assert.equal(selected.size, 'Nhỏ');
  assert.equal(selected.sizeLabel, 'Nhỏ');
  assert.equal(selected.attributeLabel, 'Móc');
  assert.deepEqual(selected.variants, customer.priceOverrides.qa_chicken.variants);
});

test('fingerprint is optional, but supplied UI fingerprints are retained exactly and never replaced by latest data', () => {
  const customer = richCustomer(), fingerprint = configScopeFingerprint(customer);
  customer.priceOverrides.qa_duck.price = 68000;
  assert.notEqual(configScopeFingerprint(customer), fingerprint);
  assert.equal(patch(customer, {fingerprint}).__customerConfigBase, fingerprint);
  assert.equal(Object.hasOwn(patch(customer), '__customerConfigBase'), false);
  for (const invalid of ['', null, 0, false, {}]) {
    assert.throws(() => patch(customer, {fingerprint: invalid}), {code: 'customer_batch_price_invalid'});
  }
});

test('invalid prices and variant-only configurations fail without inventing a primary variant or changing inputs', () => {
  const customer = freeze(richCustomer());
  for (const price of [0, -1, NaN, Infinity, -Infinity, '59000']) {
    assert.throws(() => patch(customer, {price}), {code: 'customer_batch_price_invalid'});
  }
  for (const variants of [[{id: 'only', price: 62000, pricingUnit: 'Kg'}],
    [{id: 'one', price: 62000, pricingUnit: 'Kg'}, {id: 'two', price: 65000, pricingUnit: 'Con'}]]) {
    assert.throws(() => patch({priceOverrides: {qa_chicken: {variants}}}), /cấu hình biến thể/);
  }
});

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const appTree = parse(appSource, {sourceType: 'module', plugins: ['jsx']});
const quote = appTree.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'PriceQuoteBroadcastView');
const quoteFunctions = new Map(quote.body.body.filter(node => node.type === 'VariableDeclaration')
  .flatMap(node => node.declarations.filter(item => item.id.name).map(item => [item.id.name, item.init])));
let editCustomer;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'handleEditCustomer') editCustomer = node.init;
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value?.type) walk(value);
  }
}
walk(appTree);
assert.ok(editCustomer, 'Use the actual customer CAS handler');
const compile = (code, env) => Function(...Object.keys(env), `return (${code})`)(...Object.values(env));
const sharedInitializer = name => {
  const declaration = tree.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === name));
  const node = declaration.declarations.find(item => item.id.name === name).init;
  return shared.slice(node.start, node.end);
};
const normalizeProductIds = compile(sharedInitializer('normalizeCustomerProductIds'), {normalizeCustomerPriceOverrides: normalize});
const friendly = compile(sharedInitializer('getFriendlyFirebaseErrorMessage'), {
  isFirestoreInternalAssertionError: () => false, isFirebaseQuotaError: () => false,
  isFirebasePermissionError: () => false, isTimeoutLikeError: () => false,
});

// Execute both real handlers and the real helper/CAS comparison. Only the
// Firestore transport is replaced by an isolated, deterministic document map.
function handlerFixture({selected = ['A'], variantOnly = false, editOverride} = {}) {
  const initial = [richCustomer('A'), richCustomer('B')];
  if (variantOnly) initial[0].priceOverrides.qa_chicken = {variants: [{id: 'large', price: 62000, pricingUnit: 'Kg'}]};
  const server = new Map(initial.map(customer => [customer.id, structuredClone(customer)]));
  const snapshots = new Map(initial.map(customer => [customer.id, freeze(structuredClone(customer))]));
  const applyingBatchPriceRef = {current: false}, calls = [], commits = [], publications = [], statuses = [], busy = [];
  const holds = new Map();
  let selectedIds = [...selected];
  const products = [product, {id: 'qa_duck', name: 'Vịt', unit: 'Con'}];
  const editor = () => compile(appSource.slice(editCustomer.start, editCustomer.end), {
    isVpsStagingMode: false, firebaseUser: {uid: 'actor'}, myCompanyId: 'qa-only',
    rawCustomers: [...server.values()], currentUser: {id: 'actor'},
    getCustomerHonorific: () => '', buildCustomerPhoneDuplicateKey: String,
    doc: (...args) => args.at(-1), db: {}, appId: 'isolated-fixture', configScopeFingerprint, syncError,
    sanitizeFirestoreWritePayload: value => value,
    runTransaction: async (_database, callback) => {
      const writes = [];
      const result = await callback({
        get: async id => ({exists: () => server.has(id), data: () => structuredClone(server.get(id))}),
        update: (id, value) => writes.push({id, value}),
      });
      for (const {id, value} of writes) {
        server.set(id, {...server.get(id), ...structuredClone(value)});
        commits.push({id, value: structuredClone(value)});
      }
      return result;
    },
    activeTenantScopeRef: {current: 'qa-only'}, setRawCustomers() {},
    upsertLocalListRecord: (_setter, value) => publications.push(value), rememberRecentLocalWrite() {},
    saveDataDocument: () => assert.fail('Configuration edits must use the actual server transaction'),
  });
  const env = () => ({
    dataFresh: true, applyingBatchPriceRef, activeProducts: products, batchPriceProductId: product.id,
    batchPriceValue: '59000', batchPriceSize: '', normalizeCustomerPriceOverrides: normalize,
    normalizeCustomerProductIds: normalizeProductIds, buildCustomerBatchPricePatch, configScopeFingerprint,
    parseLooseMoneyValue: Number, getFriendlyFirebaseErrorMessage: friendly,
    setQuoteStatus: value => statuses.push(value), setIsApplyingBatchPrice: value => busy.push(value),
    setSelectedBatchCustomerIds: value => {selectedIds = typeof value === 'function' ? value(selectedIds) : value;},
    getBatchPriceTargetCustomers: productId => compile(appSource.slice(
      quoteFunctions.get('getBatchPriceTargetCustomers').start, quoteFunctions.get('getBatchPriceTargetCustomers').end,
    ), {managedCustomers: [...snapshots.values()], selectedBatchCustomerSet: new Set(selectedIds),
      normalizeCustomerProductIds: normalizeProductIds, activeProducts: products, batchPriceProductId: product.id})(productId),
    onEditCustomer: async (id, value) => {
      calls.push({id, value: structuredClone(value)});
      if (holds.has(id)) await holds.get(id);
      return editOverride ? editOverride(id, value) : editor()(id, value);
    },
  });
  return {server, snapshots, calls, commits, publications, statuses, busy, holds, applyingBatchPriceRef,
    get selectedIds() {return selectedIds;},
    refresh: id => snapshots.set(id, freeze(structuredClone(server.get(id)))),
    run: overrides => {
      const node = quoteFunctions.get('handleApplyBatchCustomerPrice');
      return compile(appSource.slice(node.start, node.end), {...env(), ...overrides})();
    },
  };
}

test('actual quote handler applies 59000 only to selected A with its UI fingerprint and no product-list rewrite', async () => {
  const f = handlerFixture(), other = structuredClone(f.server.get('B'));
  const expected = configScopeFingerprint(f.snapshots.get('A'));
  await f.run();
  assert.deepEqual(f.calls.map(call => call.id), ['A']);
  assert.equal(f.calls[0].value.__customerConfigBase, expected);
  assert.equal(Object.hasOwn(f.calls[0].value, 'customerProductIds'), false);
  assert.equal(f.server.get('A').priceOverrides.qa_chicken.unitPrice, 59000);
  assert.equal(f.server.get('A').priceOverrides.qa_chicken.unitPrices.Kg, 59000);
  assert.deepEqual(f.server.get('A').priceOverrides.qa_chicken.variants, f.snapshots.get('A').priceOverrides.qa_chicken.variants);
  assert.deepEqual(f.server.get('B'), other);
  assert.equal(Object.hasOwn(f.server.get('A'), '__customerConfigBase'), false, 'The CAS marker is not stored as customer data');
  assert.equal(f.commits.length, 1);
  assert.equal(f.publications.length, 1);
  assert.match(f.statuses.at(-1), /Đã áp giá/);
});

test('actual CAS rejects stale UI despite latest parent data; partial retry selects only failed B and never rewrites A', async () => {
  const f = handlerFixture({selected: ['A', 'B']});
  f.server.get('B').priceOverrides.qa_duck.qaMetadata.retain = 'new concurrent policy';
  await f.run();
  assert.deepEqual(f.commits.map(commit => commit.id), ['A']);
  assert.deepEqual(f.selectedIds, ['B']);
  assert.match(f.statuses.at(-1), /Đã cập nhật 1\/2/);
  assert.match(f.statuses.at(-1), /Customer B/);
  assert.match(f.statuses.at(-1), /Cấu hình vừa được người khác sửa/);
  assert.equal(f.server.get('B').priceOverrides.qa_chicken.price, 58000);
  const confirmedA = structuredClone(f.server.get('A'));
  f.refresh('B');
  await f.run();
  assert.deepEqual(f.calls.map(call => call.id), ['A', 'B', 'B']);
  assert.deepEqual(f.commits.map(commit => commit.id), ['A', 'B']);
  assert.deepEqual(f.server.get('A'), confirmedA, 'Retry must not rewrite a confirmed customer policy or version');
  assert.equal(f.server.get('B').priceOverrides.qa_chicken.price, 59000);
  assert.equal(f.server.get('B').priceOverrides.qa_duck.qaMetadata.retain, 'new concurrent policy');
});

test('actual allSettled handler waits for every confirmation and keeps the duplicate-submit lock until the last customer settles', async () => {
  const f = handlerFixture({selected: ['A', 'B']});
  f.server.get('B').priceOverrides.qa_duck.price = 68000;
  let acknowledgeA;
  f.holds.set('A', new Promise(resolve => {acknowledgeA = resolve;}));
  const saving = f.run();
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  assert.equal(f.applyingBatchPriceRef.current, true);
  assert.equal(f.commits.length, 0);
  assert.match(f.statuses.at(-1), /^Đang áp giá/);
  await f.run();
  assert.deepEqual(f.calls.map(call => call.id), ['A', 'B']);
  acknowledgeA(); await saving;
  assert.match(f.statuses.at(-1), /Đã cập nhật 1\/2/);
  assert.deepEqual(f.selectedIds, ['B']);
  assert.equal(f.applyingBatchPriceRef.current, false);
  assert.deepEqual(f.busy, [true, false]);
});

test('actual handler reports the known variant error with no write and retains the failed customer for correction', async () => {
  const f = handlerFixture({variantOnly: true}), before = structuredClone(f.server.get('A'));
  await f.run();
  assert.equal(f.calls.length, 0);
  assert.equal(f.commits.length, 0);
  assert.deepEqual(f.server.get('A'), before);
  assert.deepEqual(f.selectedIds, ['A']);
  assert.match(f.statuses.at(-1), /Đã cập nhật 0\/1.*Customer A/);
  assert.match(f.statuses.at(-1), /Sản phẩm chỉ có cấu hình biến thể/);
  assert.equal(f.applyingBatchPriceRef.current, false);
  const longMessage = 'Cấu hình cần được chọn lại. '.repeat(25);
  assert.equal(friendly({code: 'customer_batch_price_invalid', message: longMessage}), longMessage);
  assert.notEqual(friendly({code: 'customer_batch_price_invalid_other', message: longMessage}, 'fallback'), longMessage);
});

test('actual handler treats a missing receipt as failure and preserves queued status for an explicitly queued receipt', async () => {
  const failed = handlerFixture({editOverride: async () => undefined});
  await failed.run();
  assert.equal(failed.commits.length, 0);
  assert.deepEqual(failed.selectedIds, ['A']);
  assert.match(failed.statuses.at(-1), /Đã cập nhật 0\/1.*Customer A/);
  assert.match(failed.statuses.at(-1), /Chưa nhận được xác nhận/);
  const queued = handlerFixture({editOverride: async () => ({queued: true})});
  await queued.run();
  assert.match(queued.statuses.at(-1), /^Đã lưu tạm giá/);
  assert.equal(queued.applyingBatchPriceRef.current, false);
});
