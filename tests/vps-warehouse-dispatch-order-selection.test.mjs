import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVpsPendingDispatchOrderRows } from '../src/utils/vpsWarehouseDispatchOrderSelection.js';

const customer = { id: 'customer-1', name: 'Khach hang A' };
const product = { id: 'product-1', name: 'Ga tuoi', unit: 'Con' };

test('selects the newest VPS order line that still has an undelivered quantity', () => {
  const rows = buildVpsPendingDispatchOrderRows({
    customers: [customer],
    products: [product],
    orders: [
      {
        id: 'order-old',
        orderNumber: 'SO-OLD',
        customerId: customer.id,
        createdAt: '2026-09-01T08:00:00.000Z',
        items: [{
          id: 'line-old',
          productId: product.id,
          quantity: 3,
          deliveredQuantity: 0,
          warehouseId: 'warehouse-1',
          unitId: 'unit-1',
        }],
      },
      {
        id: 'order-new',
        orderNumber: 'SO-NEW',
        customerId: customer.id,
        createdAt: '2026-09-02T08:00:00.000Z',
        items: [{
          id: 'line-new',
          productId: product.id,
          quantity: 7,
          deliveredQuantity: 2,
          warehouseId: 'warehouse-1',
          unitId: 'unit-1',
          reservationId: 'reservation-1',
        }],
      },
    ],
  });

  assert.deepEqual(rows.map(row => row.orderId), ['order-new', 'order-old']);
  assert.equal(rows[0].orderLineId, 'line-new');
  assert.equal(rows[0].quantity, 5);
  assert.equal(rows[0].reservationId, 'reservation-1');
});

test('excludes completed, archived, and cancelled order lines', () => {
  const rows = buildVpsPendingDispatchOrderRows({
    customers: [customer],
    products: [product],
    orders: [
      {
        id: 'order-delivered',
        customerId: customer.id,
        createdAt: '2026-09-03T08:00:00.000Z',
        items: [{ id: 'line-delivered', productId: product.id, quantity: 4, deliveredQuantity: 4 }],
      },
      {
        id: 'order-cancelled',
        status: 'CANCELLED',
        customerId: customer.id,
        createdAt: '2026-09-04T08:00:00.000Z',
        items: [{ id: 'line-cancelled', productId: product.id, quantity: 4, deliveredQuantity: 0 }],
      },
      {
        id: 'order-archived',
        isArchived: true,
        customerId: customer.id,
        createdAt: '2026-09-05T08:00:00.000Z',
        items: [{ id: 'line-archived', productId: product.id, quantity: 4, deliveredQuantity: 0 }],
      },
    ],
  });

  assert.deepEqual(rows, []);
});
