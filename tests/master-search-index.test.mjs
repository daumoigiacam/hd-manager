import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as engine from '../src/services/searchEngine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
// Original HEAD blob, pinned so later commits cannot silently update the oracle.
const referenceSource = execFileSync('git', ['show', 'a8bc002524e2792d8069ee4678eafcf7d83bfb81'], {
  cwd: root,
  encoding: 'utf8',
});
const currentSource = readFileSync(new URL('../src/services/searchEngine.js', import.meta.url), 'utf8');

function loadEngine(source, context = {}) {
  const exports = [...source.matchAll(/^export const (\w+)/gm)].map(match => match[1]);
  return vm.runInNewContext(`${source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')}\nObject.freeze({ ${exports.join(', ')} });`, context);
}

const reference = loadEngine(referenceSource);
const fieldsOf = record => record?.fields;

// Move VM metadata into this realm without losing holes, NaN/Infinity or identity.
function metadata(results) {
  const output = new Array(results.length);
  for (let index = 0; index < results.length; index++) {
    if (!(index in results)) continue;
    const result = results[index];
    output[index] = { ...result, matchedFields: Array.from(result.matchedFields) };
  }
  return output;
}

function recordList(results) {
  return Array.prototype.map.call(metadata(results), result => result.record);
}

function assertParity(records, queries, getFields = fieldsOf, oldGetFields = getFields) {
  const index = engine.createSearchRecordIndex(records, getFields);
  for (const query of queries) {
    const expected = metadata(reference.rankSearchRecords(records, query, oldGetFields));
    const label = `query ${String(query)}`;
    assert.deepEqual(metadata(engine.rankSearchRecords(records, query, getFields)), expected, `legacy ${label}`);
    assert.deepEqual(metadata(index.rank(query)), expected, `index ${label}`);
    const expectedRecords = recordList(expected);
    assert.deepEqual(engine.searchRecords(records, query, getFields), expectedRecords, `searchRecords ${label}`);
    assert.deepEqual(index.search(query), expectedRecords, `index.search ${label}`);
    for (const result of index.rank(query)) {
      if (result) assert.strictEqual(result.record, records[result.index], `record identity ${label}`);
    }
  }
}

const queries = [
  '', ' ', '\t\n', '---', '. / +', '\u0301', '\u{1f600}', '\u4e2d\u6587', '\uff11\uff12',
  undefined, null, false, true, 0, -1, 12.34, NaN, Infinity, 1234n,
  [], ['tam', 'xoai'], {}, { toString: () => '  ALPHA---beta  ' },
  'alpha', 'ALPHA', 'alp', 'alpha beta', 'beta alpha', 'alphabeta', 'alpha alpha',
  'alpha missing', 'a', 'object', 'null', 'false', 'undefined', 'nan', 'infinity',
  'dong', '\u0110\u1ed3ng', 'tam xoai', 'xoai tam', 'vms', 'vit moc', 'moc vit',
  '0978194836', '0978 194 836', '1948', '1234', '234', '12 34', '0', '1e3',
  'kh dx 01', 'HD20260001', 'hd 2026 0001', 'ha\u0300ng', 'vit@MOC/sach',
];

test('prepared and legacy ranking match the original across coercion and field semantics', () => {
  const sharedKey = { name: 'custom' };
  const records = [
    { fields: [
      { key: 'primary', priority: 100, values: ['Alpha Beta', ' alpha beta ', 'ALPHA BETA', 'alphabeta'] },
      { key: 'phone', priority: 82, value: '0978 194 836', values: ['ignored'] },
    ] },
    { fields: [
      { key: 'primary', priority: 100, value: 'Anh T\u00e2m \u0110\u1ed3ng Xo\u00e0i' },
      { key: 'code', priority: '78', values: ['KH-DX-01', '12', '34'] },
    ] },
    { fields: [
      null, undefined, {}, { key: 'primary', values: ['---', '\u{1f600}', '\u4e2d\u6587', '\u0301'] },
      { key: 'fallback', priority: 0, values: ['Beta Alpha', 0, false, NaN, Infinity] },
    ] },
    { fields: [
      { key: 'primary', priority: -15, value: null, values: ['V\u1ecbt M\u00f3c S\u1ea1ch', 'vms'] },
      { key: '', priority: 'bad', values: [null, undefined, '', '  ', ['Alpha', 'Beta'], { label: 'ignored' }] },
      { key: 0, priority: null, values: [true, -1, 1234n] },
    ] },
    { fields: [
      { key: 'primary', priority: 100, value: '', values: ['must not appear'] },
      { key: sharedKey, priority: 90, value: { toString: () => 'Alpha Beta' } },
      { key: 'primary', priority: 90, values: ['alpha', 'beta'] },
    ] },
    { fields: [{ key: 'primary', priority: Infinity, values: ['alpha'] }] },
    { fields: [{ key: 'primary', priority: -Infinity, values: ['alpha'] }] },
    { fields: [{ key: 'primary', priority: 100, values: ['Alpha Beta', 'alphabeta'] }] },
    { fields: [] }, { fields: null }, { fields: false }, undefined, null,
  ];
  assertParity(records, queries);
  const before = engine.rankSearchRecords(records, 'alpha', fieldsOf);
  assertParity(records, queries.slice().reverse());
  assert.deepEqual(engine.rankSearchRecords(records, 'alpha', fieldsOf), before, 'query order never changes fields');
});

test('domain fields, aliases, initials and existing search wrappers match the original', () => {
  const products = [
    { id: 'p1', name: 'V\u1ecbt M\u00f3c S\u1ea1ch', shortName: 'VMS', code: 'VMS-01', barcode: '893850000001',
      category: 'V\u1ecbt', mainGroup: 'Th\u1ef1c ph\u1ea9m', unit: 'Con', attributes: { size: 'Large' },
      productAttributes: ['fresh', 'clean'], variants: [['Grade A', '12']], attributeOptions: ['frozen'] },
    { id: 'p2', productName: 'V\u1ecbt M\u00f3c S\u1ea1ch', productShortName: 'Duck', alias: 'alpha beta', abbreviation: 'ab', sku: 'SKU-1234' },
    { id: 'p3', name: 'V\u1ecbt M\u00f3c S\u1ea1ch', shortName: 'VMS' },
    { id: 'p4', name: 'Other', productName: 'Alpha Beta', alias: 'alphabeta', unit: 0 },
  ];
  const customers = [
    { id: 'c1', name: 'Anh T\u00e2m \u0110\u1ed3ng Xo\u00e0i', phone: '0978 194 836', phoneNumber: '0123',
      plainName: 'Plain', displayName: 'Displayed', customerHonorific: 'Mr', shopName: 'Shop', storeName: 'Store',
      businessName: 'Business', companyName: 'Company', contactName: 'Contact', contactPerson: 'Person',
      searchAliases: ['Nested Alpha', 'Beta'], zaloContact: '9876', zaloPhone: '4567', code: 'KH-DX-01', customerCode: 'C-12',
      address: 'B\u00ecnh D\u01b0\u01a1ng', locationInput: 'Location', area: 'Area', region: 'Region', route: 'Route', routeName: 'Express',
      customerGroup: 'Group', group: 'Wholesale', groupName: 'Buyer', managerName: 'Manager', note: 'Note', notes: 'Notes', searchText: 'Searchable',
      branches: [{ name: 'Branch', branchName: 'North', label: 'Outlet', code: 'BR-34', phone: '5556', address: 'Alpha Beta', locationInput: 'Depot' }],
      customerBranches: [{ name: 'East' }], deliveryBranches: [{ address: 'West' }] },
    { id: 'c2', name: 'T\u00e2m \u0110\u1ed3ng Xo\u00e0i', branches: 'ignored' },
    { id: 'c3', name: 'T\u00e2m \u0110\u1ed3ng Xo\u00e0i' },
  ];
  const orders = [
    { id: 'o_abc123sandyn', invoiceCode: 'HD-2026-0001', customerName: customers[0].name,
      customerPhone: '0978 194 836', customer: { name: 'Linked Name', phone: '1234' }, branchName: 'North', customerBranchName: 'Depot',
      items: [{ description: 'Description', productName: products[0].name, productNameSnapshot: 'Historical', productCode: 'VMS-01', sku: 'SKU-12', barcode: '893850' }],
      date: '2026-10-03', salesOwner: { name: 'Owner' }, salesEmpName: 'Employee', note: 'Alpha Beta', notes: 'Note' },
    { id: 'o2', orderCode: 'ORDER-1234', invoiceCode: 'INVOICE-5678', code: 'C-34', paymentCode: 'PAY-56', items: [] },
    { id: 'o3', code: 'CODE-1234', items: [{ productName: 'Alpha Beta' }] },
    { id: 'o4', paymentCode: 'PAY-1234' },
  ];
  const employees = [
    { id: 'e1', name: 'Nguy\u1ec5n V\u0103n \u0110\u1ee9c', displayName: 'Displayed', username: 'user', alias: 'alpha beta',
      phone: '0978 194 836', phoneNumber: '1234', email: 'alpha@example.com', employeeCode: 'EMP-12', code: 'E-34',
      position: 'Kinh doanh', role: 'Role', department: 'Sales', address: 'North', searchText: 'Extra' },
    { id: 'e2', name: 'Nguy\u1ec5n V\u0103n \u0110\u1ee9c' },
  ];
  const cases = [
    [products, 'getProductSearchFields', 'searchProducts'],
    [customers, 'getCustomerSearchFields', 'searchCustomers'],
    [orders, 'getOrderSearchFields', 'searchOrders'],
    [employees, 'getEmployeeSearchFields', 'searchEmployees'],
  ];
  const domainQueries = [...queries, 'v', 'vm', '89385', 'HDSANDYN', 'nguyen duc', 'emp 12', 'linked name', 'historical'];
  for (const [records, fieldsName, searchName] of cases) {
    for (const record of records) {
      assert.deepEqual(JSON.parse(JSON.stringify(engine[fieldsName](record))), JSON.parse(JSON.stringify(reference[fieldsName](record))));
    }
    const allQueries = [...domainQueries, ...records.flatMap(record => Array.from(reference.buildSearchIndexTokens(record, reference[fieldsName])))];
    assertParity(records, allQueries, engine[fieldsName], reference[fieldsName]);
    for (const query of allQueries) {
      assert.deepEqual(engine[searchName](records, query), Array.from(reference[searchName](records, query)), `${searchName}: ${String(query)}`);
    }
  }
  const options = { getItemText: () => [['Custom Item', '12'], 'Alpha'], getCustomerText: () => ['External Customer', '34'] };
  assertParity(orders, [...queries, 'custom item', 'external customer', 'customer 34'],
    order => engine.getOrderSearchFields(order, options), order => reference.getOrderSearchFields(order, options));
  for (const query of [...queries, 'custom item', 'external customer']) {
    assert.deepEqual(engine.searchInvoices(orders, query, options), Array.from(reference.searchInvoices(orders, query, options)));
    assert.deepEqual(metadata(engine.rankCustomerSearchResults(customers, query)), metadata(reference.rankCustomerSearchResults(customers, query)));
  }
});

test('deterministic generated fixtures retain all scores and matched-field order', () => {
  let seed = 0x1234abcd;
  const next = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  const words = ['Alpha', 'Beta', 'alphabet', '\u0110\u1ed3ng', 'T\u00e2m', 'Xo\u00e0i', 'V\u1ecbt', 'M\u00f3c', 'S\u1ea1ch', '12', '34', '0978', '0'];
  const priorities = [0, 10, 35, 82, 100, -10, '82', 'invalid', null];
  const records = Array.from({ length: 96 }, (_, id) => ({ id,
    fields: Array.from({ length: 1 + next(5) }, (_, position) => ({
      key: position === 0 && next(2) ? 'primary' : ['other', 'code', 'phone', 'primary'][next(4)],
      priority: priorities[next(priorities.length)],
      values: Array.from({ length: 1 + next(4) }, () => `${words[next(words.length)]}${[' ', '-', '/', ''][next(4)]}${words[next(words.length)]}`),
    })),
  }));
  const generatedQueries = Array.from({ length: 80 }, () => `${words[next(words.length)]} ${words[next(words.length)]}`);
  for (const record of records.slice(0, 24)) {
    const text = record.fields[0].values[0];
    generatedQueries.push(text, engine.collapseSearchText(text), engine.normalizeSearchText(text).slice(0, 3));
  }
  assertParity(records, [...queries, ...generatedQueries]);
});

test('ranking tiers, numeric scoring, collapsed gating and stable ties stay exact', () => {
  const records = [
    { id: 'token', fields: [{ key: 'primary', priority: 100, value: 'beta alpha' }] },
    { id: 'direct', fields: [{ key: 'primary', priority: 100, value: 'other' }, { key: 'code', priority: 82, value: 'alpha' }] },
    { id: 'prefix-token', fields: [{ key: 'primary', priority: 100, value: 'beta alphabet' }] },
    { id: 'prefix', fields: [{ key: 'primary', priority: 100, value: 'alpha beta' }] },
    { id: 'exact-a', fields: [{ key: 'primary', priority: 100, value: 'alpha' }] },
    { id: 'exact-b', fields: [{ key: 'primary', priority: 100, value: 'ALPHA' }] },
    { id: 'missing', fields: [{ key: 'primary', priority: 100, value: 'beta' }] },
  ];
  const index = engine.createSearchRecordIndex(records, fieldsOf);
  assert.deepEqual(index.rank('alpha').map(result => [result.record.id, result.score, result.exact, result.index]), [
    ['exact-a', 2205, true, 4], ['exact-b', 2205, true, 5], ['direct', 1652, true, 1],
    ['prefix', 1305, false, 3], ['token', 655, false, 0], ['prefix-token', 610, false, 2],
  ]);
  const edgeRecords = [
    { fields: [{ key: 'primary', priority: 100, values: ['alpha beta'] }] },
    { fields: [{ key: 'primary', priority: 100, values: ['alpha beta'] }, { key: 'other', priority: 20, value: 'alphabeta' }] },
    { fields: [{ key: 'primary', priority: 100, values: ['12', '34'] }] },
    { fields: [{ key: 'first', priority: 10, value: 'alpha' }, { key: 'second', priority: 10, value: 'alpha' }] },
    { fields: [{ key: 'primary', priority: 100, value: 'unrelated' }, { key: 'fallback', priority: 1, value: 'alpha' }, { key: 'primary', priority: 100, value: 'alpha' }] },
    { fields: [{ key: 'first', priority: 10, value: 'alpha' }, { key: 'second', priority: 10, value: 'beta' }] },
  ];
  assertParity(edgeRecords, ['alpha', 'alphabeta', '234', '12 34', 'beta alpha', 'alpha beta']);
  const edgeIndex = engine.createSearchRecordIndex(edgeRecords, fieldsOf);
  assert.deepEqual(edgeIndex.rank('alphabeta').map(result => [result.index, result.score, result.matchedFields, result.exact]), [[1, 2090, ['other'], true]]);
  assert.deepEqual(edgeIndex.rank('234').map(result => [result.index, result.score, result.matchedFields]), [[2, 620, ['primary']]]);
  assert.deepEqual(edgeIndex.rank('alpha').find(result => result.index === 3).matchedFields, ['first']);
  assert.deepEqual(edgeIndex.rank('beta alpha').find(result => result.index === 5).matchedFields, ['second', 'first']);
});

test('snapshot fields and membership change only on explicit rebuild; legacy APIs read edits', () => {
  const product = { id: 'p1', name: 'Alpha Beta', code: '12', variants: ['Old Variant'] };
  const records = [product];
  const index = engine.createSearchRecordIndex(records, engine.getProductSearchFields);
  const before = metadata(index.rank('alpha'));
  product.name = 'Gamma Delta';
  product.code = '34';
  product.variants[0] = 'New Variant';
  records.unshift({ id: 'p2', name: 'Gamma Delta' });
  assert.deepEqual(metadata(index.rank('alpha')), before);
  assert.strictEqual(index.search('alpha')[0], product, 'result reference remains live');
  assert.deepEqual(index.search('gamma'), []);
  assert.deepEqual(index.search('34'), []);
  assert.deepEqual(index.search('old variant'), [product]);
  assert.deepEqual(index.search(''), [product]);
  assert.deepEqual(engine.searchProducts(records, 'alpha'), []);
  assert.deepEqual(engine.searchProducts(records, 'gamma'), records);
  assertParity(records, ['alpha', 'gamma', 'gd', 'ab', '12', '34', 'old variant', 'new variant', ''], engine.getProductSearchFields, reference.getProductSearchFields);
  const rebuilt = engine.createSearchRecordIndex(records, engine.getProductSearchFields);
  records.reverse();
  assert.deepEqual(rebuilt.search('gamma').map(record => record.id), ['p2', 'p1'], 'snapshot ties retain creation order');
  assert.deepEqual(engine.searchProducts(records, 'gamma').map(record => record.id), ['p1', 'p2']);
});

test('getFields external context, field arrays, priorities and keys are snapshotted', () => {
  const fields = [{ key: 'primary', priority: 100, values: ['alpha'] }];
  const records = [{ id: 'a' }];
  let context = 'old context';
  let calls = 0;
  const getFields = () => { calls++; return [...fields, { key: 'other', values: [context] }]; };
  const index = engine.createSearchRecordIndex(records, getFields);
  const before = index.rank('alpha');
  fields[0].values[0] = 'beta';
  fields[0].key = 'changed';
  fields[0].priority = 1;
  fields.push({ key: 'added', value: 'gamma' });
  context = 'new context';
  for (let count = 0; count < 3; count++) {
    assert.deepEqual(index.rank('alpha'), before);
    assert.deepEqual(index.search('beta'), []);
    assert.deepEqual(index.search('gamma'), []);
    assert.deepEqual(index.search('old context'), records);
    assert.deepEqual(index.search('new context'), []);
  }
  assert.equal(calls, 1);
  const rebuilt = engine.createSearchRecordIndex(records, getFields);
  assert.equal(calls, 2);
  for (const query of ['alpha', 'beta', 'gamma', 'new context', 'old context']) {
    assert.deepEqual(metadata(rebuilt.rank(query)), metadata(reference.rankSearchRecords(records, query, getFields)));
    assert.deepEqual(metadata(engine.rankSearchRecords(records, query, getFields)), metadata(reference.rankSearchRecords(records, query, getFields)));
  }
});

test('empty queries skip legacy callbacks; active callbacks keep invocation order and arity', () => {
  for (const api of [engine, reference]) {
    const records = [{ id: 'a', text: 'alpha' }, { id: 'b', text: 'beta' }, { id: 'c', text: 'beta' }];
    const calls = [];
    function getFields(record) {
      calls.push([record.id, arguments.length]);
      if (record.id === 'a') records[1].text = 'alpha';
      return [{ key: 'primary', value: record.text }];
    }
    for (const query of ['', '---', '\u{1f600}']) {
      assert.equal(api.rankSearchRecords(records, query, getFields).length, 3);
      assert.deepEqual(calls, []);
    }
    assert.deepEqual(Array.from(api.searchRecords(records, 'alpha', getFields), record => record.id), ['a', 'b']);
    assert.deepEqual(calls, [['a', 1], ['b', 1], ['c', 1]]);
    assert.throws(() => api.rankSearchRecords(records, 'alpha', () => { throw new Error('callback failed'); }), /callback failed/);
    assert.throws(() => api.rankSearchRecords(records, 'alpha', () => ({})), error => error.name === 'TypeError');
    assert.doesNotThrow(() => api.rankSearchRecords(records, '', null));
  }
  const records = [{ id: 'a' }, { id: 'b' }];
  const calls = [];
  engine.createSearchRecordIndex(records, function getFields(record) { calls.push([record.id, arguments.length]); });
  assert.deepEqual(calls, [['a', 1], ['b', 1]], 'construction eagerly calls getFields once even without a query');
  assert.throws(() => engine.createSearchRecordIndex(records, () => ({})), TypeError);
});

test('non-arrays, sparse sources, duplicate references and default APIs retain original behavior', () => {
  for (const records of [undefined, null, false, {}, 'alpha', new Set([{ fields: [] }]), []]) {
    assertParity(records, queries);
  }
  const record = { fields: [{ key: 'primary', value: 'alpha beta' }] };
  const sparse = new Array(6);
  sparse[1] = record;
  sparse[4] = record;
  sparse[5] = undefined;
  assertParity(sparse, queries);
  assert.deepEqual(engine.createSearchRecordIndex(sparse, fieldsOf).rank('alpha').map(result => result.index), [1, 4]);
  assert.deepEqual(engine.rankSearchRecords(), []);
  assert.deepEqual(engine.createSearchRecordIndex().rank(), []);
  assert.deepEqual(engine.createSearchRecordIndex().search(), []);
  assertParity([record], queries, undefined);
});

test('search output mutations and frozen source data cannot corrupt prepared fields', () => {
  const records = Object.freeze([
    Object.freeze({ fields: Object.freeze([Object.freeze({ key: 'primary', priority: 100, values: Object.freeze(['alpha', 'beta']) })]) }),
  ]);
  const index = engine.createSearchRecordIndex(records, fieldsOf);
  const expected = metadata(reference.rankSearchRecords(records, 'alpha', fieldsOf));
  const ranked = index.rank('alpha');
  ranked[0].matchedFields.push('changed');
  ranked[0].score = -1;
  ranked[0].record = null;
  ranked.push({});
  const search = index.search('alpha');
  search.length = 0;
  assert.deepEqual(metadata(index.rank('alpha')), expected);
  assert.deepEqual(index.search('alpha'), records);
  assert.ok(Object.isFrozen(index));
});

test('operation counts prove one query normalization and no field preparation per indexed search', () => {
  const context = { normalizations: 0 };
  const instrumented = loadEngine(`
    const originalNormalize = String.prototype.normalize;
    String.prototype.normalize = function (...args) {
      normalizations++;
      return originalNormalize.apply(this, args);
    };
    ${currentSource}
  `, context);
  const records = Array.from({ length: 24 }, (_, id) => ({ id, fields: [
    { key: 'primary', priority: 100, values: ['Alpha Beta', `Name ${id}`] },
    { key: 'code', priority: 82, value: `1234-${id}` },
  ] }));
  let calls = 0;
  const getFields = record => { calls++; return record.fields; };
  const index = instrumented.createSearchRecordIndex(records, getFields);
  assert.equal(calls, records.length);
  assert.equal(context.normalizations, records.length * 3, 'each unique field value is normalized once at creation');
  for (const query of [...queries, 'alpha', 'alpha b', 'alpha beta']) {
    const before = context.normalizations;
    index.rank(query);
    assert.equal(context.normalizations - before, 1, `rank normalizes only the query: ${String(query)}`);
    index.search(query);
    assert.equal(context.normalizations - before, 2, `search normalizes only the query: ${String(query)}`);
  }
  assert.equal(calls, records.length, 'repeated indexed queries never call getFields');
  const before = context.normalizations;
  instrumented.rankSearchRecords(records, 'alpha', getFields);
  assert.equal(context.normalizations - before, 1 + records.length * 3, 'legacy search also normalizes its query only once');
  assert.equal(calls, records.length * 2, 'legacy search still reads current fields');
});

test('postings score only intersected candidates, then verify complete numeric tokens', () => {
  const context = { scoredIndices: [] };
  const scorerHeader = 'const buildSearchResult = (record, index, query, indexedFields) => {';
  assert.ok(currentSource.includes(scorerHeader));
  const instrumented = loadEngine(currentSource.replace(scorerHeader, `${scorerHeader}\nscoredIndices.push(index);`), context);
  const duplicate = { fields: [
    { key: 'primary', priority: 100, value: 'Alpha' },
    { key: 'code', priority: 82, values: ['12', '3456'] },
  ] };
  const records = new Array(9);
  records[0] = duplicate;
  records[1] = { fields: [{ key: 'primary', value: 'Alphabet' }, { key: 'code', value: '123999' }] };
  records[2] = { fields: [{ key: 'primary', value: 'Other' }, { key: 'code', value: '123456' }] };
  records[3] = { fields: [{ key: 'primary', value: 'Alpha' }, { key: 'code', value: '999' }] };
  records[5] = duplicate;
  records[7] = { fields: [{ key: 'primary', value: 'beta' }, { key: 'code', values: ['456', '789'] }] };
  records[8] = { fields: [{ key: 'primary', value: 'Alpha' }, { key: 'code', values: ['456123', '789'] }] };
  const index = instrumented.createSearchRecordIndex(records, fieldsOf);
  const cases = [
    ['alph', [0, 1, 3, 5, 8]],
    ['alpha 123456', [0, 1, 5, 8]],
    ['123456', [0, 1, 2, 5, 8]],
    ['123456 789', [8]],
    ['456789', [0, 2, 5, 7, 8]],
    ['7', [7, 8]], ['78', [7, 8]], ['123 999', [1]],
    ['alpha alpha', [0, 1, 3, 5, 8]],
    ['absent', []], ['alpha absent', []], ['9999', [1, 3]], ['', []],
  ];
  for (const [query, expectedScored] of cases) {
    context.scoredIndices.length = 0;
    assert.deepEqual(metadata(index.rank(query)), metadata(reference.rankSearchRecords(records, query, fieldsOf)), query);
    assert.deepEqual(context.scoredIndices, expectedScored, `candidate scoring for ${query}`);
  }
  assert.deepEqual(Array.from(index.search('123456'), record => records.indexOf(record)), [2, 0, 0], 'full numeric exact matches rank first and trigram collisions are rejected');
});

test('numeric grams span values within fields, never join separate fields, and support any query length', () => {
  const records = [
    { fields: [{ key: 'primary', priority: 100, values: ['A-12', 'B-3456', 'C-7890'] }] },
    { fields: [{ key: 'primary', priority: 100, value: '12' }, { key: 'code', priority: 82, value: '3456' }] },
    { fields: [{ key: 'primary', priority: 100, values: ['123123', '123123', ' 123123 ', '123'] }] },
    { fields: [{ key: 'primary', priority: 100, values: [['12', '34'], '56'] }] },
    { fields: [{ key: 'primary', priority: 100, value: '\uff11\uff12\uff13 \u0661\u0662\u0663' }] },
    { fields: [{ key: 'primary', priority: 100, value: `${'0123456789'.repeat(8)}9` }] },
  ];
  assertParity(records, [
    '1', '2', '12', '23', '234', '2345', '234567890', '1234567890', '123123123', '123123123123',
    '12 3456', '12 b', 'b 2345', '34 56', '1234', '123456', 'a12', 'b3', '\uff11\uff12\uff13', '\u0661\u0662\u0663',
    '0123456789'.repeat(8), `${'0123456789'.repeat(8)}9`, `${'0123456789'.repeat(8)}0`,
  ]);
  const index = engine.createSearchRecordIndex(records, fieldsOf);
  assert.ok(!index.search('123456').includes(records[1]), 'digits from separate fields are not concatenated');
  assert.ok(index.search('12 3456').includes(records[1]), 'separate query tokens may match separate fields');
});

test('prefix vocabulary boundaries and mixed alphanumeric/numeric tokens match the reference', () => {
  const tokens = ['a', 'a0', 'a00', 'a9', 'aa', 'ab', 'az', 'b', 'b0', 'z', 'z0', 'zz', 'zzz', '0a', '9z'];
  const records = tokens.map((token, id) => ({ id, fields: [{ key: 'primary', priority: 100, value: token }] }));
  records.push({ fields: [{ key: 'primary', priority: 100, values: ['\u0110\u1ed3ng', 'Do\u0302ng', '\u00df', '\u4e2d\u6587', 'a--b', 'a\u0301z'] }] });
  assertParity(records, [...tokens, 'a000', 'a99', 'ac', 'azy', 'b1', 'zzzz', 'zzzzzz', 'z 0', '9 z', '0a 9z', '0', '9', '\u0111', 'dong', 'do', 'a b', 'a!b', 'a a']);
});

test('postings are deduplicated per source position and numeric key space stays bounded', () => {
  const context = { debugMaps: {} };
  const tokenHeader = 'const tokenPostings = new Map();';
  const digitHeader = 'const digitPostings = new Map();';
  assert.ok(currentSource.includes(tokenHeader) && currentSource.includes(digitHeader));
  const instrumented = loadEngine(currentSource
    .replace(tokenHeader, `${tokenHeader}\ndebugMaps.tokens = tokenPostings;`)
    .replace(digitHeader, `${digitHeader}\ndebugMaps.digits = digitPostings;`), context);
  const repeated = { fields: Array.from({ length: 12 }, () => ({
    key: 'primary', priority: 100, values: ['alpha alphabet alpha', 'alpha', '111111111', '12', '34', '12'],
  })) };
  const records = [repeated, repeated, repeated];
  const index = instrumented.createSearchRecordIndex(records, fieldsOf);
  for (const postings of Object.values(context.debugMaps)) {
    for (const indices of postings.values()) assert.deepEqual(Array.from(indices), [0, 1, 2]);
  }
  assert.ok(context.debugMaps.digits.size <= 1110);
  assert.deepEqual(metadata(index.rank('alpha 1123')), metadata(reference.rankSearchRecords(records, 'alpha 1123', fieldsOf)));
  index.search('a');
  index.search('1111111111234');
  for (const postings of Object.values(context.debugMaps)) {
    for (const indices of postings.values()) assert.deepEqual(Array.from(indices), [0, 1, 2], 'query intersections never mutate private postings');
  }
});

test('randomized digit substrings, mixed queries, sparse duplicates and context rebuilds retain exact metadata', () => {
  let seed = 0x76543210;
  const next = max => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % max;
  };
  const labels = ['Alpha', 'Alphabet', 'Beta', 'Zebra', '\u0110\u1ed3ng', 'T\u00e2m', 'Xo\u00e0i'];
  const records = new Array(72);
  const numericQueries = ['0', '00', '000', '0000', 'zzzz'];
  for (let position = 0; position < records.length; position++) {
    if (position % 7 === 0) continue;
    const label = labels[next(labels.length)];
    const digits = Array.from({ length: 10 }, () => String(next(10))).join('');
    records[position] = { fields: [
      { key: 'primary', priority: [100, 0, -10][next(3)], values: [label, `${label} Extra`, `${label} ${label}`] },
      { key: 'code', priority: 82, values: [`SKU-${digits.slice(0, 3)}`, digits.slice(3, 6), digits.slice(6)] },
      { key: 'other', priority: 35, value: `${labels[next(labels.length)]} ${digits.slice(0, 3)}9999` },
    ] };
    const start = next(5);
    const length = 1 + next(6);
    const numeric = digits.slice(start, start + length);
    numericQueries.push(numeric, `${label.slice(0, 2)} ${numeric}`, `${numeric} ${label}`, `${numeric} ${numeric}`);
  }
  records[14] = records[13];
  records[21] = records[20];
  let context = 'old context 456789';
  const getFields = record => record ? [...record.fields, { key: 'context', value: context }] : [];
  assertParity(records, [...numericQueries, ...queries], getFields);
  const index = engine.createSearchRecordIndex(records, getFields);
  context = 'new context 987654';
  records[13].fields[0].values[0] = 'Changed';
  assert.deepEqual(index.search('old context'), records.filter(Boolean));
  assert.deepEqual(index.search('new context'), []);
  assertParity(records, [...numericQueries, 'changed', 'old context', 'new context', '456789', '987654'], getFields);
});

test('candidate source order also preserves the original sort for non-finite scores', () => {
  const records = [
    { fields: [{ key: 'primary', priority: 100, value: 'alpha beta' }] },
    { fields: [{ key: 'primary', priority: Infinity, value: 'alpha' }, { key: 'code', priority: -Infinity, value: 'beta' }] },
    { fields: [{ key: 'primary', priority: Infinity, value: 'alphabet beta' }] },
    { fields: [{ key: 'primary', priority: -Infinity, value: 'alpha beta' }] },
    { fields: [{ key: 'primary', priority: 100, value: 'alpha beta' }] },
  ];
  assertParity(records, ['alpha beta', 'a b', 'beta alpha', 'alphabet beta', 'alpha alpha beta']);
});
