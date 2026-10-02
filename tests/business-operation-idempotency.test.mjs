import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildBusinessDocumentId,
  createBusinessMutationId,
  ensureBusinessMutationId,
  isValidBusinessMutationId,
} from '../src/utils/businessMutationIds.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('business command ids are valid and deterministic document ids are tenant scoped', () => {
  const commandId = createBusinessMutationId('warehouse-dispatch', 'fixed-retry-1');
  assert.equal(commandId, 'warehouse-dispatch-fixed-retry-1');
  assert.equal(isValidBusinessMutationId(commandId), true);

  const first = buildBusinessDocumentId('wd', 'company-a', commandId);
  const retry = buildBusinessDocumentId('wd', 'company-a', commandId);
  const otherCompany = buildBusinessDocumentId('wd', 'company-b', commandId);
  const otherCommand = buildBusinessDocumentId('wd', 'company-a', createBusinessMutationId('warehouse-dispatch', 'fixed-retry-2'));

  assert.equal(retry, first);
  assert.notEqual(otherCompany, first);
  assert.notEqual(otherCommand, first);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});

test('triple save and reconnect retry resolve to one business document and one stock deduction', () => {
  const commandId = createBusinessMutationId('warehouse-dispatch', 'network-retry');
  const writes = new Map();
  const stockBefore = 100;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const documentId = buildBusinessDocumentId('wd', 'company-a', commandId);
    writes.set(documentId, { documentId, quantity: 12 });
  }

  const stockAfter = [...writes.values()].reduce((stock, dispatch) => stock - dispatch.quantity, stockBefore);
  assert.equal(writes.size, 1);
  assert.equal(stockAfter, 88);
});

test('separate forms produce separate commands even when business content is identical', () => {
  const first = createBusinessMutationId('order', 'form-a');
  const second = createBusinessMutationId('order', 'form-b');
  assert.notEqual(first, second);
  assert.notEqual(
    buildBusinessDocumentId('o', 'company-a', first),
    buildBusinessDocumentId('o', 'company-a', second),
  );
});

test('invalid externally supplied command ids are rejected instead of being rewritten ambiguously', () => {
  assert.throws(() => ensureBusinessMutationId('../unsafe', 'order'), /không hợp lệ/i);
  assert.throws(() => buildBusinessDocumentId('o', 'company-a', 'contains space'), /không hợp lệ/i);
});

test('order, order request and warehouse forms retain one command id across retries', () => {
  assert.match(appSource, /const createSingleOrderState = \(\) => \(\{\s*clientMutationId: createBusinessMutationId\('order'\)/);
  assert.match(appSource, /const createBulkOrderDraft = \(seed = \{\}\) => \(\{[\s\S]{0,180}clientMutationId: seed\.clientMutationId \|\| createBusinessMutationId\('order'\)/);
  assert.match(appSource, /const createDraft = \(seed = \{\}\) => \(\{[\s\S]{0,180}clientMutationId: seed\.clientMutationId \|\| createBusinessMutationId\('order-request'\)/);
  assert.match(appSource, /const createEmptyDispatchDraft = \(assignedDriverId = ''\) => \(\{\s*clientMutationId: createBusinessMutationId\('warehouse-dispatch'\)/);
  assert.match(appSource, /clientMutationId: dispatchDraft\.clientMutationId \|\| createBusinessMutationId\('warehouse-dispatch'\)/);
  assert.match(appSource, /clientMutationId: draft\.clientMutationId,\s*customerId: customer\.id/);
  assert.match(appSource, /clientMutationId: draft\.clientMutationId \|\| createBusinessMutationId\('order'\),\s*customerId/);
});

test('all three create handlers derive stable tenant-scoped document ids', () => {
  assert.match(appSource, /buildBusinessDocumentId\('o', myCompanyId, clientMutationId\)/);
  assert.match(appSource, /buildBusinessDocumentId\('or', myCompanyId, clientMutationId\)/);
  assert.match(appSource, /buildBusinessDocumentId\('wd', myCompanyId, clientMutationId\)/);
  assert.match(appSource, /replayedOrder = existingCompanyOrders\.find\(\(order\) => order\?\.clientMutationId === clientMutationId\)/);
  assert.match(appSource, /replayedRequest = orderRequests\.find\(request => \(/);
});

