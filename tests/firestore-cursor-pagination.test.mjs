import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

import {
  collectTenantCursorPages,
  mergeCursorItems,
  normalizeCursorPageSize,
  readTenantCursorPage,
} from '../src/services/firestoreCursorPagination.js';

const projectId = process.env.HD_CURSOR_TEST_PROJECT || 'demo-hdm-phase4-cursor';
const appId = process.env.HD_CURSOR_TEST_APP || 'phase4-cursor-app';
const companyId = 'company-a';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const existingRules = process.env.HD_CURSOR_EXISTING_RULES === '1';
if(existingRules && (projectId !== 'demo-hdm-perf-verification' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8185')) throw Error('Existing rules verification requires the isolated loopback project');
const testEnvironment = await initializeTestEnvironment({ projectId, firestore: existingRules ? {host:'127.0.0.1',port:8185} : { rules } });
const pathFor = (collectionName, id) => `artifacts/${appId}/public/data/${collectionName}/${id}`;
const expectedById = new Map();

try {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const writes = [];
    for (let index = 0; index < 105; index += 1) {
      const id = `product-${`${index}`.padStart(4, '0')}`;
      const record = {
        // Imported legacy fields must never override the document path identity.
        id: index >= 101 && index <= 102 ? 'legacy-duplicate-id' : id,
        companyId,
        name: `Product ${index}`,
        sequence: index,
      };
      expectedById.set(id, { ...record, id });
      writes.push(setDoc(doc(database, pathFor('products', id)), record));
    }
    writes.push(setDoc(doc(database, pathFor('products', 'other-tenant-product')), {
      id: 'other-tenant-product',
      companyId: 'company-b',
      name: 'Other tenant',
    }));
    await Promise.all(writes);
  });

  const employeeDb = testEnvironment.authenticatedContext('employee-a', {
    identityId: 'identity-employee-a',
    companyId,
    appUserId: 'employee-a',
    accountType: 'employee',
    role: 'super_admin',
  }).firestore();

  const first = await readTenantCursorPage({
    db: employeeDb,
    appId,
    collectionName: 'products',
    companyId,
    pageSize: 20,
  });
  assert.equal(first.items.length, 20);
  assert.equal(first.items[0].id, 'product-0000');
  assert.equal(first.items.at(-1).id, 'product-0019');
  assert.equal(first.hasMore, true);

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, pathFor('products', 'product-0010-new')), {
        id: 'product-0010-new',
        companyId,
        name: 'Inserted before cursor',
      }),
      setDoc(doc(database, pathFor('products', 'product-9999-new')), {
        id: 'product-9999-new',
        companyId,
        name: 'Inserted after cursor',
      }),
    ]);
  });

  expectedById.set('product-0010-new', { id: 'product-0010-new', companyId, name: 'Inserted before cursor' });
  expectedById.set('product-9999-new', { id: 'product-9999-new', companyId, name: 'Inserted after cursor' });

  const remaining = await collectTenantCursorPages({
    db: employeeDb,
    appId,
    collectionName: 'products',
    companyId,
    pageSize: 20,
    onPage: undefined,
    // Start from the first page's cursor by wrapping the page reader below.
  });
  assert.equal(remaining.items.length, 107);
  assert.equal(new Set(remaining.items.map(item => item.id)).size, 107);
  assert.ok(remaining.items.every(item => item.companyId === companyId));
  assert.ok(remaining.pageCount < 10);
  const expectedSorted = [...expectedById.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  assert.deepEqual(remaining.items, expectedSorted, 'all 107 document payloads and path-ID order must match the fixture, not only the count');

  let cursor = first.cursor;
  let hasMore = first.hasMore;
  let merged = first.items;
  let pages = 1;
  let lastPageId = first.items.at(-1).id;
  while (hasMore) {
    const page = await readTenantCursorPage({
      db: employeeDb,
      appId,
      collectionName: 'products',
      companyId,
      pageSize: 20,
      cursor,
    });
    assert.ok(page.items.every((item, index) => item.id > (index ? page.items[index - 1].id : lastPageId)), 'every next-page document ID must advance in server order');
    if (page.items.length) lastPageId = page.items.at(-1).id;
    merged = mergeCursorItems(merged, page.items);
    cursor = page.cursor;
    hasMore = page.hasMore;
    pages += 1;
    assert.ok(pages < 10, 'pagination must terminate');
  }
  const originalIds = Array.from({ length: 105 }, (_, index) => `product-${`${index}`.padStart(4, '0')}`);
  originalIds.forEach(id => assert.ok(merged.some(item => item.id === id), `missing original record ${id}`));
  assert.equal(new Set(merged.map(item => item.id)).size, merged.length);
  assert.ok(merged.some(item => item.id === 'product-9999-new'));
  assert.ok(!merged.some(item => item.id === 'product-0010-new'));
  assert.equal(merged.length,106);
  assert.deepEqual(merged,expectedSorted.filter(item=>item.id!=='product-0010-new'),'resumed cursor payloads must match all original records and the insertion after cursor');

  assert.deepEqual(
    mergeCursorItems([{ id: 'b', value: 1 }, { id: 'a', value: 1 }], [{ id: 'b', value: 2 }, { id: 'c' }]),
    [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c' }],
  );
  assert.equal(normalizeCursorPageSize(0), 20);
  assert.equal(normalizeCursorPageSize(5_000), 200);
  const unicodeAppId = `${appId}-unicode`;
  const unicodeIds = ['z', 'é', 'A', 'a', '\uE000', '\u{10000}', '😀'];
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await Promise.all(unicodeIds.map((id, value) => setDoc(doc(database, `artifacts/${unicodeAppId}/public/data/products/${id}`), { companyId, value })));
  });
  const unicodeExpected = [...unicodeIds].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  const unicodePages = await collectTenantCursorPages({ db: employeeDb, appId: unicodeAppId, collectionName: 'products', companyId, pageSize: 3 });
  assert.deepEqual(unicodePages.items.map(row => row.id), unicodeExpected, 'SDK keyset pages must follow canonical UTF-8 document-ID ordering');
  let unicodeMerged = [];
  for (let offset = 0; offset < unicodePages.items.length; offset += 3) unicodeMerged = mergeCursorItems(unicodeMerged, unicodePages.items.slice(offset, offset + 3));
  assert.deepEqual(unicodeMerged, unicodePages.items, 'merging next pages cannot reorder server results or change their data');
  await mkdir('test-results/phase4', { recursive: true });
  await writeFile(process.env.HD_CURSOR_TEST_OUTPUT || 'test-results/phase4/firestore-cursor-pagination.json', `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: 'LOCAL_FIRESTORE_EMULATOR',
    status: 'PASS',
    originalRecords: 105,
    freshReadRecords: remaining.items.length,
    freshReadExpectedRecords: expectedById.size,
    resumedCursorRecords: merged.length,
    resumedCursorExpectedRecords: expectedById.size-1,
    resumedPayloadParity: true,
    firstPageRecords: first.items.length,
    pageSize: 20,
    tenantLeakCount: remaining.items.filter(item => item.companyId !== companyId).length,
    duplicateCount: merged.length - new Set(merged.map(item => item.id)).size,
    exactPayloadParity: true,
    strictNextPageOrder: true,
    unicodeOrder: { documents: unicodeIds.length, pages: unicodePages.pageCount, exactSdkAndMergeParity: true },
    pages,
    mutationDuringPagination: {
      originalRecordsMissing: originalIds.filter(id => !merged.some(item => item.id === id)).length,
      insertionBeforeCursorExcludedFromSession: !merged.some(item => item.id === 'product-0010-new'),
      insertionAfterCursorIncluded: merged.some(item => item.id === 'product-9999-new'),
    },
  }, null, 2)}\n`, 'utf8');
  console.log('Firestore cursor pagination: deterministic pages, tenant scope, dedupe and termination PASS.');
} finally {
  await testEnvironment.cleanup();
}
