import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, writeBatch } from 'firebase/firestore';
import {
  SCREEN_CURSOR_AUTHORITATIVE_COLLECTIONS_BY_TAB,
  SCREEN_CURSOR_COLLECTIONS_BY_TAB,
  createScreenCursorRuntime,
} from '../src/services/screenCursorRuntime.js';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Local Firestore Emulator required');
}

const projectId = 'hd-manager-screen-cursor';
const appId = 'screen-cursor';
const pageSize = 50;
const screenTabs = [
  'orders',
  'order_requests',
  'warehouse_dispatch',
  'customers',
  'products',
  'pricing',
  'price_quotes',
];
const collectionNames = [...new Set(screenTabs.flatMap(tab => SCREEN_CURSOR_COLLECTIONS_BY_TAB[tab]))];
const environment = await initializeTestEnvironment({
  projectId,
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});
const evidence = [];

const seedCollection = async ({ db, companyId, collectionName, size }) => {
  for (let offset = 0; offset < size; offset += 400) {
    const batch = writeBatch(db);
    for (let index = offset; index < Math.min(size, offset + 400); index += 1) {
      const id = `${companyId}-${collectionName}-${String(index).padStart(6, '0')}`;
      batch.set(doc(db, `artifacts/${appId}/public/data/${collectionName}/${id}`), {
        id,
        companyId,
        sequence: index,
      });
    }
    await batch.commit();
  }
};

try {
  const appSource = readFileSync('src/App.jsx', 'utf8');
  assert.match(appSource, /useScreenCursorState\s*\(/);
  assert.match(appSource, /<ScreenCursorLoadMore cursorState=\{screenCursorState\}/);
  assert.match(appSource, /orders=\{cursorOrders\}/);
  assert.match(appSource, /customers=\{cursorCustomers\}/);
  assert.match(appSource, /products=\{cursorProducts\}/);
  assert.match(appSource, /orderRequests=\{cursorOrderRequests\}/);
  assert.match(appSource, /warehouseDispatches=\{warehouseDispatches\}\s+visibleWarehouseDispatches=\{cursorWarehouseDispatches\}/);
  assert.deepEqual(SCREEN_CURSOR_AUTHORITATIVE_COLLECTIONS_BY_TAB.warehouse_dispatch, ['warehouseDispatches']);
  assert.match(appSource, /cursorManagedCollections\.has\(collectionName\)/);
  assert.match(appSource, /authoritativeCollections\.has\(collectionName\)/);

  for (const size of [100, 1_000, 5_000]) {
    const companyId = `screen-tenant-${size}`;
    const foreignCompanyId = `foreign-tenant-${size}`;
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const collectionName of collectionNames) {
        await seedCollection({ db, companyId, collectionName, size });
        await seedCollection({ db, companyId: foreignCompanyId, collectionName, size: 3 });
      }
    });

    const db = environment.authenticatedContext(`owner-${size}`, {
      companyId,
      appUserId: `owner-${size}`,
      accountType: 'employee',
      role: 'super_admin',
      identityId: `owner-${size}`,
    }).firestore();
    const runtime = createScreenCursorRuntime({ db, appId, pageSize });

    for (const tab of screenTabs) {
      const startedAt = performance.now();
      await runtime.activate({ tab, tenantId: companyId });
      const activeCollections = SCREEN_CURSOR_COLLECTIONS_BY_TAB[tab];
      const firstPage = runtime.snapshot();
      assert.equal(firstPage.activeTab, tab);
      assert.equal(firstPage.companyId, companyId);

      for (const collectionName of activeCollections) {
        let collectionState = firstPage.collections[collectionName];
        assert.equal(collectionState.items.length, pageSize);
        assert.equal(collectionState.documentsRead, pageSize);
        assert.equal(collectionState.requests, 1);
        assert.ok(collectionState.items.every(item => item.companyId === companyId));

        const requestsBeforeRefresh = collectionState.requests;
        await Promise.all(Array.from({ length: 10 }, () => runtime.refresh(collectionName)));
        collectionState = runtime.snapshot().collections[collectionName];
        assert.equal(collectionState.requests, requestsBeforeRefresh + 1);

        let maximumPageRead = pageSize;
        while (collectionState.hasMore) {
          const readsBefore = collectionState.documentsRead;
          await runtime.loadMore(collectionName);
          collectionState = runtime.snapshot().collections[collectionName];
          maximumPageRead = Math.max(maximumPageRead, collectionState.documentsRead - readsBefore);
          assert.ok(collectionState.documentsRead - readsBefore <= pageSize);
        }

        assert.equal(collectionState.items.length, size);
        assert.equal(new Set(collectionState.items.map(item => item.id)).size, size);
        assert.ok(collectionState.items.every(item => item.companyId === companyId));
        assert.ok(collectionState.items.every((item, index, items) => (
          index === 0 || `${items[index - 1].id}`.localeCompare(`${item.id}`) < 0
        )));

        const localId = `${companyId}-${collectionName}-local`;
        runtime.applyLocalMutation({ collectionName, documentId: localId, payload: { companyId } });
        runtime.applyLocalMutation({ collectionName, documentId: localId, payload: { companyId, patched: true } });
        assert.equal(runtime.snapshot().collections[collectionName].items.filter(item => item.id === localId).length, 1);
        runtime.applyLocalMutation({ collectionName, documentId: localId, action: 'delete' });
        assert.equal(runtime.snapshot().collections[collectionName].items.some(item => item.id === localId), false);

        evidence.push({
          size,
          tab,
          collectionName,
          pageSize,
          maximumPageRead,
          requests: collectionState.requests,
          documentsRead: collectionState.documentsRead,
          duplicates: 0,
          missing: 0,
          foreignTenant: 0,
          elapsedMs: performance.now() - startedAt,
        });
      }
    }
    runtime.dispose();
  }

  mkdirSync('test-results/core-gaps', { recursive: true });
  writeFileSync(
    'test-results/core-gaps/screen-application-cursor-emulator.json',
    JSON.stringify({
      scope: 'Exact screen cursor runtime imported by App.jsx for list rendering; finance/payroll aggregates excluded.',
      evidence,
    }, null, 2),
  );
  console.log(JSON.stringify({ cases: evidence.length, evidence }, null, 2));
} finally {
  await environment.cleanup();
}
