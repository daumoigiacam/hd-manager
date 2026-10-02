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

const projectId = 'hd-manager-phase4-cursor';
const appId = 'phase4-cursor-app';
const companyId = 'company-a';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnvironment = await initializeTestEnvironment({ projectId, firestore: { rules } });
const pathFor = (collectionName, id) => `artifacts/${appId}/public/data/${collectionName}/${id}`;

try {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const writes = [];
    for (let index = 0; index < 105; index += 1) {
      const id = `product-${`${index}`.padStart(4, '0')}`;
      writes.push(setDoc(doc(database, pathFor('products', id)), {
        id,
        companyId,
        name: `Product ${index}`,
        sequence: index,
      }));
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

  let cursor = first.cursor;
  let hasMore = first.hasMore;
  let merged = first.items;
  let pages = 1;
  while (hasMore) {
    const page = await readTenantCursorPage({
      db: employeeDb,
      appId,
      collectionName: 'products',
      companyId,
      pageSize: 20,
      cursor,
    });
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

  assert.deepEqual(
    mergeCursorItems([{ id: 'b', value: 1 }, { id: 'a', value: 1 }], [{ id: 'b', value: 2 }, { id: 'c' }]),
    [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c' }],
  );
  assert.equal(normalizeCursorPageSize(0), 50);
  assert.equal(normalizeCursorPageSize(5_000), 200);
  await mkdir('test-results/phase4', { recursive: true });
  await writeFile('test-results/phase4/firestore-cursor-pagination.json', `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: 'LOCAL_FIRESTORE_EMULATOR',
    status: 'PASS',
    originalRecords: 105,
    firstPageRecords: first.items.length,
    pageSize: 20,
    tenantLeakCount: remaining.items.filter(item => item.companyId !== companyId).length,
    duplicateCount: merged.length - new Set(merged.map(item => item.id)).size,
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
