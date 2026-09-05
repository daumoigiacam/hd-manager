import test from 'node:test';
import assert from 'node:assert/strict';
import { readCompleteVpsCollection } from '../src/api/vpsCompleteCollection.js';

const companyId = 'synthetic-tenant-a';
const row = (id) => ({ id: String(id), companyId });
test('loads more than 100 records without dropping history or accepting duplicated pages', async () => {
  const all = Array.from({ length: 3083 }, (_, i) => row(i));
  const calls = [];
  const result = await readCompleteVpsCollection(async (query) => {
    calls.push(query);
    return { items: all.slice((query.page - 1) * query.limit, query.page * query.limit), pagination: { totalItems: all.length, hasNextPage: query.page * query.limit < all.length } };
  }, { companyId });
  assert.equal(result.items.length, 3083);
  assert.equal(calls.length, 31);
  assert.equal(result.complete, true);
  assert.deepEqual(result.items, all);
  assert.ok(calls.every(q => q.sortBy === 'createdAt' && q.sortOrder === 'asc'));
});
test('empty tenant is valid but incomplete, foreign-tenant, repeated and shifting pages are rejected', async () => {
  const read = (items, totalItems, hasNextPage = false) => async () => ({ items, pagination: { totalItems, hasNextPage } });
  assert.deepEqual((await readCompleteVpsCollection(read([], 0), { companyId })).items, []);
  for (const reader of [read([row(1)], 2), read([{ ...row(1), companyId: 'synthetic-tenant-b' }], 1), read([row(1), row(1)], 2), read([], 2, true), read([row(1)], 1, true)]) {
    await assert.rejects(() => readCompleteVpsCollection(reader, { companyId }), /VPS_COLLECTION_/);
  }
  let page = 0;
  await assert.rejects(() => readCompleteVpsCollection(async () => ({ items: [row(++page)], pagination: { totalItems: page === 1 ? 2 : 3, hasNextPage: page === 1 } }), { companyId }), /CHANGED_DURING_READ/);
  await assert.rejects(() => readCompleteVpsCollection(async () => ({ items: [] }), { companyId }), /PAGINATION_REQUIRED/);
});
test('cancelled or unauthenticated loads cannot supply stale tenant data', async () => {
  let calls = 0;
  await assert.rejects(() => readCompleteVpsCollection(async () => { calls++; return {}; }, { companyId, cancelled: () => true }), /CANCELLED/);
  assert.equal(calls, 0);
  await assert.rejects(() => readCompleteVpsCollection(async () => ({})), /TENANT_REQUIRED/);
});
