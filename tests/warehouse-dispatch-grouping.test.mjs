import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildWarehouseDispatchPresentationGroups,
  getWarehouseDispatchPresentationGroupId,
  resolveWarehouseDispatchDeliveryStatus,
} from '../src/utils/warehouseDispatchGrouping.js';

const dispatch = (overrides = {}) => ({
  id: 'dispatch-1',
  sourceOrderRequestId: 'request-1',
  customerId: 'customer-a',
  customerName: 'Anh Toàn',
  assignedDriverId: 'driver-nam',
  assignedDriverName: 'Anh Nam',
  productId: 'duck',
  ...overrides,
});

test('one customer with one product remains one display row', () => {
  const groups = buildWarehouseDispatchPresentationGroups({ rows: [dispatch()] });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].rowSpan, 1);
  assert.equal(groups[0].driverName, 'Anh Nam');
  assert.equal(groups[0].deliveryStatus.label, 'Chưa giao');
});

test('one shipment with multiple products and one driver renders one merged group', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [
      dispatch({ id: 'line-1', productId: 'lv' }),
      dispatch({ id: 'line-2', productId: 'gkm' }),
      dispatch({ id: 'line-3', productId: 'canh-vit' }),
    ],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].rowSpan, 3);
  assert.deepEqual(groups[0].rows.map(row => row.productId), ['lv', 'gkm', 'canh-vit']);
});

test('different drivers do not merge', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [dispatch({ id: 'line-1' }), dispatch({ id: 'line-2', assignedDriverId: 'driver-binh', assignedDriverName: 'Anh Bình' })],
  });

  assert.equal(groups.length, 2);
});

test('different delivery statuses do not merge', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [dispatch({ id: 'line-1' }), dispatch({ id: 'line-2', deliveryStatus: 'shipping' })],
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.deliveryStatus.label), ['Chưa giao', 'Đang giao']);
});

test('different export orders do not merge even when customer and driver match', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [dispatch({ id: 'line-1', sourceOrderRequestId: 'request-1' }), dispatch({ id: 'line-2', sourceOrderRequestId: 'request-2' })],
  });

  assert.equal(groups.length, 2);
});

test('different customers do not merge', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [dispatch({ id: 'line-1' }), dispatch({ id: 'line-2', customerId: 'customer-b', customerName: 'Chị Lan' })],
  });

  assert.equal(groups.length, 2);
});

test('a ten-product shipment retains every product row under one group', () => {
  const rows = Array.from({ length: 10 }, (_, index) => dispatch({ id: `line-${index}`, productId: `product-${index}` }));
  const groups = buildWarehouseDispatchPresentationGroups({ rows });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].rowSpan, 10);
  assert.equal(groups[0].rows.length, 10);
});

test('an unassigned delivery group is safe and displays Chưa giao', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [
      dispatch({ id: 'line-1', assignedDriverId: '', assignedDriverName: '' }),
      dispatch({ id: 'line-2', assignedDriverId: '', assignedDriverName: '' }),
    ],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].driverName, 'Chưa giao');
  assert.equal(groups[0].hasAssignedDriver, false);
  assert.equal(groups[0].deliveryStatus.label, 'Chưa giao');
});

test('a delivery report marks only its matching dispatch as delivered', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [dispatch({ id: 'line-1' }), dispatch({ id: 'line-2' })],
    deliveryReports: [{ id: 'report-1', dispatchId: 'line-2', deliveryStatus: 'delivered' }],
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.deliveryStatus.label), ['Chưa giao', 'Đã giao']);
});

test('precomputed status survives compact display rows and still prevents a bad merge', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [
      dispatch({ id: 'merged-delivered', deliveryStatusKey: 'delivered', deliveryStatusLabel: 'Đã giao' }),
      dispatch({ id: 'merged-pending', deliveryStatusKey: 'pending', deliveryStatusLabel: 'Chưa giao' }),
    ],
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.deliveryStatus.label), ['Đã giao', 'Chưa giao']);
});

test('rows without a shipment or dispatch identity stay separate', () => {
  const groups = buildWarehouseDispatchPresentationGroups({
    rows: [
      dispatch({ id: '', sourceOrderRequestId: '', productId: 'lv' }),
      dispatch({ id: '', sourceOrderRequestId: '', productId: 'gkm' }),
    ],
  });

  assert.equal(groups.length, 2);
});

test('shipment and export identifiers take priority over the individual dispatch id', () => {
  assert.equal(getWarehouseDispatchPresentationGroupId(dispatch({ shipmentId: 'shipment-7' })), 'shipment:shipment-7');
  assert.equal(getWarehouseDispatchPresentationGroupId(dispatch({ exportOrderId: 'export-9', shipmentId: '' })), 'shipment:export-9');
  assert.equal(getWarehouseDispatchPresentationGroupId(dispatch({ sourceOrderRequestId: '', id: 'line-1' })), 'dispatch:line-1');
});

test('unknown delivery status stays distinct instead of being silently merged as pending', () => {
  assert.deepEqual(resolveWarehouseDispatchDeliveryStatus({ deliveryStatus: 'on_hold' }), {
    key: 'on_hold',
    label: 'on_hold',
  });
});

test('the dispatch table uses grouped cells with rowSpan for driver and customer', async () => {
  const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.match(appSource, /buildWarehouseDispatchPresentationGroups/);
  assert.match(appSource, /deliveryReports=\{deliveryReports\}/);
  assert.match(appSource, /<td rowSpan=\{groupRowSpan\} className="border border-slate-700 bg-sky-50\/60/);
  assert.match(appSource, /<td rowSpan=\{groupRowSpan\} className="border border-slate-700 px-1\.5 py-2 align-middle/);
});
