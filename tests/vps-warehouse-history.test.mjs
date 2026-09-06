import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHdConnectStagingApi,
  normalizeVpsWarehouseHistoryRecord,
} from '../src/api/hdConnectStaging.js';

test('keeps unresolved legacy warehouse history display-only and separate from VPS target IDs', () => {
  const history = normalizeVpsWarehouseHistoryRecord({
    id: 'history-import-1',
    companyId: 'tenant-a',
    quantity: '12',
    weight: '24.5',
    sourceDocumentId: 'legacy-import-1',
    metadata: {
      warehouseId: 'legacy-warehouse-1',
      productId: 'legacy-product-1',
      unitId: 'legacy-unit-1',
      productName: 'Ga',
      quantityUnit: 'Con',
      date: '2026-09-05',
    },
  }, 'IMPORT');

  assert.equal(history.warehouseId, '');
  assert.equal(history.productId, '');
  assert.equal(history.unitId, '');
  assert.equal(history.sourceWarehouseId, 'legacy-warehouse-1');
  assert.equal(history.sourceProductId, 'legacy-product-1');
  assert.equal(history.sourceUnitId, 'legacy-unit-1');
  assert.equal(history.quantity, 12);
  assert.equal(history.totalKg, 24.5);
  assert.equal(history.legacySourceId, 'legacy-import-1');
  assert.equal(history.historicalOnly, true);
  assert.equal(history.readOnlyLedger, true);
});

test('uses tenant-authenticated warehouse history endpoints without accepting caller tenant overrides', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ path, options });
      return {
        items: [{
          id: 'history-dispatch-1',
          companyId: 'tenant-a',
          warehouseTargetId: 'warehouse-a',
          productTargetId: 'product-a',
          unitTargetId: 'unit-a',
          orderRequestTargetId: 'request-a',
          quantity: '3',
          weight: '6.2',
          occurredAt: '2026-09-05T10:00:00.000Z',
          sourceDocumentId: 'legacy-dispatch-1',
          metadata: { quantityUnit: 'Con', productName: 'Vit' },
        }],
        pagination: { totalItems: 1, hasNextPage: false },
      };
    },
  });

  const page = await api.listWarehouseHistoryDispatches({
    companyId: 'forged-company',
    tenantId: 'forged-tenant',
    page: 1,
    limit: 100,
  });

  assert.equal(calls[0].path, '/warehouse-suite/history/dispatches');
  assert.equal(calls[0].options.query.companyId, undefined);
  assert.equal(calls[0].options.query.tenantId, undefined);
  assert.equal(page.items[0].warehouseId, 'warehouse-a');
  assert.equal(page.items[0].productId, 'product-a');
  assert.equal(page.items[0].unitId, 'unit-a');
  assert.equal(page.items[0].orderRequestId, 'request-a');
  assert.equal(page.items[0].sourceSystem, 'hd-connect-vps-history');
});
