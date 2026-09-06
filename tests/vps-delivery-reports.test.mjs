import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadVpsDeliveryReports,
  saveVpsDeliveryReport,
} from '../src/api/vpsDeliveryReports.js';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const UNIT = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE = '44444444-4444-4444-8444-444444444444';

test('writes an idempotent tenant-scoped delivery report without creating a stock-out', async () => {
  let payload;
  const saved = await saveVpsDeliveryReport({
    createLogisticsDelivery: async (next) => {
      payload = next;
      return {
        id: '55555555-5555-4555-8555-555555555555',
        companyId: COMPANY,
        deliveryNumber: next.deliveryNumber,
        metadata: next.metadata,
        lines: next.lines,
        createdAt: '2026-09-06T00:00:00.000Z',
      };
    },
  }, { companyId: COMPANY }, {
    id: 'delivery-report-1',
    actualWeightKg: 12,
    expectedWeightKg: 10,
    date: '2026-09-06',
  }, {
    id: 'dispatch-ledger-1',
    sourceDispatchId: 'dispatch-source-1',
    companyId: COMPANY,
    productId: PRODUCT,
    unitId: UNIT,
    warehouseId: WAREHOUSE,
    quantity: 12,
    quantityUnit: 'Con',
  });

  assert.equal(payload.deliveryNumber, 'HDM-DELIVERY-delivery-report-1');
  assert.equal(payload.metadata.sourceRecordId, 'delivery-report-1');
  assert.equal(payload.metadata.sourceDispatchId, 'dispatch-source-1');
  assert.equal(payload.lines[0].quantity, 12);
  assert.equal(payload.lines[0].metadata.reportedActualWeightKg, 12);
  assert.equal(payload.clientMutationId, 'hdm-delivery-report:delivery-report-1');
  assert.equal(saved.actualWeightKg, 12);
  assert.equal(saved.differenceKg, 2);
});

test('confirms map delivery only through the native departed-to-delivered transition', async () => {
  const calls = [];
  const saved = await saveVpsDeliveryReport({
    createLogisticsDelivery: async (next) => ({
      id: '55555555-5555-4555-8555-555555555555',
      companyId: COMPANY,
      status: 'DEPARTED',
      deliveryNumber: next.deliveryNumber,
      metadata: next.metadata,
      lines: next.lines,
    }),
    transitionLogisticsDelivery: async (id, next) => {
      calls.push({ id, ...next });
      return {
        id,
        companyId: COMPANY,
        status: 'DELIVERED',
        deliveredAt: '2026-09-06T12:00:00.000Z',
        deliveryNumber: 'HDM-DELIVERY-map-delivery-1',
        metadata: { sourceRecordId: 'map-delivery-1' },
        lines: [{ productId: PRODUCT }],
      };
    },
  }, { companyId: COMPANY }, {
    id: 'map-delivery-1',
    deliveryStatus: 'delivered',
    actualWeightKg: 12,
    quantity: 12,
  }, {
    companyId: COMPANY,
    productId: PRODUCT,
    unitId: UNIT,
    warehouseId: WAREHOUSE,
    quantity: 12,
  });

  assert.deepEqual(calls, [{
    id: '55555555-5555-4555-8555-555555555555',
    transitionCode: 'DELIVER',
    reason: 'Confirmed from HD Manager delivery map.',
  }]);
  assert.equal(saved.deliveryStatus, 'delivered');
  assert.equal(saved.isDelivered, true);
  assert.equal(saved.deliveredAt, '2026-09-06T12:00:00.000Z');
});

test('does not treat a draft delivery report as a completed delivery', async () => {
  const saved = await saveVpsDeliveryReport({
    createLogisticsDelivery: async (next) => ({
      id: '55555555-5555-4555-8555-555555555555',
      companyId: COMPANY,
      status: 'DRAFT',
      deliveryNumber: next.deliveryNumber,
      metadata: next.metadata,
      lines: next.lines,
    }),
    transitionLogisticsDelivery: async () => {
      throw new Error('draft delivery must not transition directly to delivered');
    },
  }, { companyId: COMPANY }, {
    id: 'map-delivery-draft',
    deliveryStatus: 'delivered',
    actualWeightKg: 12,
    quantity: 12,
  }, {
    companyId: COMPANY,
    productId: PRODUCT,
    unitId: UNIT,
    warehouseId: WAREHOUSE,
    quantity: 12,
  });

  assert.equal(saved.deliveryStatus, 'draft');
  assert.equal(saved.isDelivered, false);
});

test('rejects missing target product mapping instead of guessing a product or stock quantity', async () => {
  await assert.rejects(
    () => saveVpsDeliveryReport({}, { companyId: COMPANY }, { id: 'delivery-report-2' }, {
      companyId: COMPANY,
      quantity: 5,
    }),
    { code: 'VPS_DELIVERY_PRODUCT_MAPPING_REQUIRED' },
  );
});

test('loads native reports and historical records only from the current tenant', async () => {
  const result = await loadVpsDeliveryReports({
    listLogisticsDeliveries: async () => ({
      items: [{
        id: 'native-1',
        companyId: COMPANY,
        metadata: { sourceRecordId: 'report-1', actualWeightKg: 12 },
        lines: [{ productId: PRODUCT, actualWeightKg: 12 }],
        createdAt: '2026-09-06T10:00:00.000Z',
      }, {
        id: 'other-tenant',
        companyId: '66666666-6666-4666-8666-666666666666',
        metadata: { sourceRecordId: 'report-other' },
      }],
    }),
    listLegacyBusiness: async () => ({
      items: [{
        companyId: COMPANY,
        sourceId: 'report-1',
        data: { id: 'report-1', actualWeightKg: 10 },
      }, {
        companyId: COMPANY,
        sourceId: 'historical-only',
        data: { id: 'historical-only', actualWeightKg: 8 },
      }],
    }),
  }, { companyId: COMPANY });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].source, 'hd-connect-vps');
  assert.equal(result.items[1].source, 'hd-connect-vps-history');
});
