import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDispatchListSearchFields } from '../src/features/warehouse/dispatchListSearchFields.js';
import { createSearchRecordIndex, createSearchRecordIndexAsync } from '../src/services/searchEngine.js';
import { buildWarehouseDispatchPresentationGroups } from '../src/utils/warehouseDispatchGrouping.js';
import { appFunction } from './helpers/app-source-function.mjs';

const customers = new Map([
  ['trang', { name: 'Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh', displayName: 'Ch\u1ecb Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh', phone: '0909 123 456', address: 'Ch\u01a1n Th\u00e0nh' }],
  ['exact', { name: 'Ch\u1ecb Trang' }],
  ['lac', { name: 'Ch\u1ecb L\u1ea1c' }],
]);
const products = new Map([
  ['vit', { name: 'V\u1ecbt S\u1ed1ng', shortName: 'VS', code: 'PVS' }],
  ['ga', { name: 'G\u00e0 M\u00f3c', shortName: 'GM' }],
]);
const employees = new Map([['driver', { name: 'V\u00f5 \u0110\u1ea1i Hi\u1ec7p', phone: '0911 222 333' }]]);
const context = {
  customers, products, employees,
  customerName: customer => customer.displayName || customer.name || '',
  driverId: row => row.assignedDriverId || row.driverId || '',
  driverName: row => row.assignedDriverNameSnapshot || employees.get(row.assignedDriverId)?.name || '',
  quantity: row => Number(row.pieceCount ?? row.quantity) || 0,
  unit: row => row.quantityUnit || 'Con',
  weight: row => Number(row.weightKg) || 0,
  compactProductName: name => name === 'V\u1ecbt S\u1ed1ng' ? 'VS' : name,
  formatNumber: value => `${value}`.replace('.', ','),
  formatDate: date => date.split('-').reverse().join('/'),
};
const rows = Object.freeze([
  Object.freeze({ id: 'lac', customerId: 'lac', customerName: 'Ch\u1ecb L\u1ea1c', productId: 'ga', quantity: 26, date: '2026-10-03' }),
  Object.freeze({ id: 'trang-long', customerId: 'trang', customerName: 'Ch\u1ecb Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh', productId: 'vit', productShortName: 'VS', quantity: 5, weightKg: 17, assignedDriverId: 'driver', date: '2026-10-03', branchName: 'Chi nh\u00e1nh B\u1ebfn C\u00e1t' }),
  Object.freeze({ id: 'trang-exact', customerId: 'exact', customerName: 'Ch\u1ecb Trang', productId: 'ga', quantity: 20, date: '2026-10-03' }),
]);
const index = createSearchRecordIndex(rows, row => buildDispatchListSearchFields(row, context));
const ids = query => index.search(query).map(row => row.id);

test('the screenshot customer matches accents, case, partial letters and reordered words', () => {
  for (const query of ['Ch\u1ecb trang', 'chi trang', 'CHI TRANG', 'chi tr', 'trang chi', 'chon thanh', 'Ch\u01a1n Th\u00e0nh']) {
    assert.ok(ids(query).includes('trang-long'), query);
  }
  assert.deepEqual(ids('t'), ['trang-long', 'trang-exact']);
  assert.deepEqual(ids('chi trang'), ['trang-exact', 'trang-long']);
  assert.deepEqual(ids('chi khongtontai'), []);
  assert.deepEqual(ids(''), rows.map(row => row.id));
});

test('multiple search words can match customer, product, driver, phone, branch, number and date', () => {
  for (const query of ['trang vs', 'trang hiep', 'hiep 17', '0909123', '0911222', 'trang ben cat', '5 con 17 kg', '03/10/2026 vs', 'pvs']) {
    assert.deepEqual(ids(query), ['trang-long'], query);
  }
  assert.deepEqual(ids('gm 26'), ['lac']);
});

test('merged rows retain source aliases and quantities; grouped presentation keeps the best match first', () => {
  const merged = Object.freeze({ ...rows[1], id: 'merged-trang', quantity: 12,
    sourceRows: Object.freeze([rows[1], Object.freeze({ ...rows[1], id: 'trang-second', quantity: 7, note: 'Giao s\u1edbm' })]) });
  const mergedIndex = createSearchRecordIndex([merged, rows[2]], row => buildDispatchListSearchFields(row, context));
  for (const query of ['trang 12', 'trang 7', 'som', 'trang-second']) assert.equal(mergedIndex.search(query)[0], merged);
  const ranked = index.search('chi trang');
  const groups = buildWarehouseDispatchPresentationGroups({ rows: ranked });
  assert.equal(groups[0].rows[0], rows[2]);
  assert.equal(groups[1].rows[0], rows[1]);
  assert.equal(rows[1].quantity, 5);
});

test('numeric words do not match inner digits of a name, year or concatenated values; exact words rank first', async () => {
  const numericRows = [
    { ...rows[0], id: 'prefix', customerName: 'Khach 260', customerId: '', quantity: 10 },
    { ...rows[0], id: 'inner', customerName: 'Khach 1026', customerId: '', quantity: 10 },
    { ...rows[0], id: 'combined', customerName: 'Khach', customerId: '', quantity: 2, weightKg: 6 },
    rows[0],
    { ...rows[0], id: 'name-exact', customerName: 'Khach 26', customerId: '', quantity: 10 },
  ];
  const numericIndex = createSearchRecordIndex(numericRows, row => buildDispatchListSearchFields(row, context));
  assert.deepEqual(numericIndex.search('gm 26').map(row => row.id), ['name-exact', 'lac', 'prefix']);
  assert.deepEqual(await numericIndex.searchAsync('gm 26'), numericIndex.search('gm 26'));
});

test('actual parent callback supplies field objects to the shared index', () => {
  const fields = appFunction('getDispatchListSearchFields', {
    buildDispatchListSearchFields, customerLookup: customers, productLookup: products, employeeLookup: employees,
    getCustomerDisplayName: context.customerName, getDispatchDriverId: context.driverId,
    getDispatchDriverName: context.driverName, getDispatchRowQuantity: context.quantity,
    getDispatchRowQuantityUnit: context.unit, getDispatchRowWeight: context.weight,
    getCompactProductName: (_id, name) => context.compactProductName(name),
    formatNumber: context.formatNumber, formatCompactDateLabel: context.formatDate,
  }, { scope: 'WarehouseDispatchView', memoCallback: true });
  assert.deepEqual(createSearchRecordIndex(rows, fields).search('Ch\u1ecb trang').map(row => row.id), ['trang-exact', 'trang-long']);
});

test('prepared queries reuse fields and a new entity snapshot invalidates old lookup values', async () => {
  let builds = 0;
  const prepared = await createSearchRecordIndexAsync(rows, row => { builds++; return buildDispatchListSearchFields(row, context); });
  for (const query of ['t', 'trang', 'chi trang', 'vs', 'hiep', 'zzz']) {
    assert.deepEqual(await prepared.searchAsync(query), index.search(query));
  }
  assert.equal(builds, rows.length);
  const updatedCustomers = new Map(customers);
  updatedCustomers.set('trang', { name: 'Kh\u00e1ch M\u1edbi', phone: '0988 777 666' });
  const updated = createSearchRecordIndex(rows, row => buildDispatchListSearchFields(row, { ...context, customers: updatedCustomers }));
  assert.equal(updated.search('0988777')[0], rows[1]);
  assert.equal(updated.search('0909123').length, 0);
});
