import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildCustomerOrderPreferenceKey,
  getCustomerRecentOrderPreferences,
  getLatestCustomerOrderTemplate,
  mergeCustomerOrderMemoryHistory,
} from '../src/utils/customerOrderMemory.js';
import { buildCustomerFixedProductMemoryPatch } from '../src/utils/customerFixedProductMemory.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(directory, '..', 'src', 'App.jsx'), 'utf8');

const request = ({
  id = 'order-1',
  companyId = 'tenant-a',
  customerId = 'customer-a',
  branchId = '',
  createdAt = '2026-09-17T08:00:00.000Z',
  items = [],
  ...rest
} = {}) => ({ id, companyId, customerId, branchId, createdAt, items, ...rest });

const duck = (overrides = {}) => ({
  productId: 'duck',
  description: 'Vit moc',
  configurationId: 'duck-2-3',
  sizeLabel: '2-3kg',
  quantity: 10,
  quantityUnit: 'Con',
  billingUnit: 'Kg',
  pricingUnit: 'Kg',
  unitPrice: 65000,
  ...overrides,
});

test('customer without history has no memory or latest template', () => {
  assert.deepEqual(getCustomerRecentOrderPreferences({
    requests: [], companyId: 'tenant-a', customerId: 'customer-a',
  }), []);
  assert.equal(getLatestCustomerOrderTemplate({
    requests: [], companyId: 'tenant-a', customerId: 'customer-a',
  }), null);
});

test('recent product preserves product, UOM, size and price', () => {
  const [preference] = getCustomerRecentOrderPreferences({
    requests: [request({ items: [duck()] })],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.equal(preference.productId, 'duck');
  assert.equal(preference.quantityUnit, 'Con');
  assert.equal(preference.billingUnit, 'Kg');
  assert.equal(preference.sizeLabel, '2-3kg');
  assert.equal(preference.unitPrice, 65000);
});

test('multiple products are independent', () => {
  const preferences = getCustomerRecentOrderPreferences({
    requests: [request({ items: [
      duck(),
      duck({ productId: 'chicken', configurationId: 'chicken-15', sizeLabel: '1.5kg', unitPrice: 72000 }),
    ] })],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.deepEqual(preferences.map((item) => item.productId).sort(), ['chicken', 'duck']);
});

test('newer price wins for the same variant', () => {
  const preferences = getCustomerRecentOrderPreferences({
    requests: [
      request({ id: 'old', items: [duck()] }),
      request({ id: 'new', createdAt: '2026-09-18T08:00:00.000Z', items: [duck({ unitPrice: 68000 })] }),
    ],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.equal(preferences.length, 1);
  assert.equal(preferences[0].unitPrice, 68000);
  assert.equal(preferences[0].lastOrderId, 'new');
});

test('different sizes of one product remain separate', () => {
  const preferences = getCustomerRecentOrderPreferences({
    requests: [
      request({ id: 'small', items: [duck()] }),
      request({ id: 'large', createdAt: '2026-09-18T08:00:00.000Z', items: [duck({ configurationId: 'duck-3-4', sizeLabel: '3-4kg', unitPrice: 68000 })] }),
    ],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.equal(preferences.length, 2);
  assert.deepEqual(new Set(preferences.map((item) => item.sizeLabel)), new Set(['2-3kg', '3-4kg']));
});

test('newer order UOM becomes the recent default', () => {
  const [preference] = getCustomerRecentOrderPreferences({
    requests: [
      request({ id: 'old', items: [duck()] }),
      request({ id: 'new', createdAt: '2026-09-18T08:00:00.000Z', items: [duck({ quantityUnit: 'Bo' })] }),
    ],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.equal(preference.quantityUnit, 'Bo');
  assert.equal(preference.orderUnit, 'Bo');
});

test('latest saved order remembers pricing unit, order unit and price together', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a',
      customerProductIds: ['duck'],
      priceOverrides: {
        duck: {
          price: 65000,
          unitPrice: 65000,
          billingUnit: 'Kg',
          pricingUnit: 'Kg',
          unitPrices: { Kg: 65000 },
          defaultOrderUnit: 'Con',
        },
      },
    },
    requests: [request({
      id: 'latest',
      createdAt: '2026-09-20T08:00:00.000Z',
      items: [duck({
        billingUnit: 'Con',
        pricingUnit: 'Con',
        quantityUnit: 'Thùng',
        orderUnit: 'Thùng',
        unitPrice: 72000,
      })],
    })],
    validProductIds: ['duck'],
  });

  const config = result.patch.priceOverrides.duck;
  assert.equal(config.billingUnit, 'Con');
  assert.equal(config.pricingUnit, 'Con');
  assert.equal(config.defaultOrderUnit, 'Thùng');
  assert.equal(config.orderUnit, 'Thùng');
  assert.equal(config.unitPrice, 72000);
  assert.deepEqual(config.unitPrices, { Kg: 65000, Con: 72000 });
});

test('building memory never mutates historical orders', () => {
  const historical = request({ items: [duck()] });
  const before = structuredClone(historical);
  getCustomerRecentOrderPreferences({
    requests: [historical], companyId: 'tenant-a', customerId: 'customer-a',
  });
  buildCustomerFixedProductMemoryPatch({
    customer: { id: 'customer-a' }, requests: [historical], validProductIds: ['duck'],
  });
  assert.deepEqual(historical, before);
});

test('different products do not overwrite each other', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: { id: 'customer-a' },
    requests: [request({ items: [
      duck(),
      duck({ productId: 'chicken', configurationId: 'chicken-1', sizeLabel: '1.5kg', unitPrice: 72000 }),
    ] })],
    validProductIds: ['duck', 'chicken'],
  });
  assert.equal(result.patch.priceOverrides.duck.unitPrice, 65000);
  assert.equal(result.patch.priceOverrides.chicken.unitPrice, 72000);
});

test('a new size creates a second variant and becomes default', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a',
      customerProductIds: ['duck'],
      priceOverrides: { duck: { sizeLabel: '2-3kg', price: 65000, unitPrice: 65000, billingUnit: 'Kg' } },
    },
    requests: [request({ id: 'large', createdAt: '2026-09-18T08:00:00.000Z', items: [duck({ configurationId: 'duck-3-4', sizeLabel: '3-4kg', unitPrice: 68000 })] })],
    validProductIds: ['duck'],
  });
  const config = result.patch.priceOverrides.duck;
  assert.equal(config.variants.length, 2);
  assert.equal(config.defaultConfigurationId, 'duck-3-4');
});

test('latest template is independent from order identity and transaction state', () => {
  const template = getLatestCustomerOrderTemplate({
    requests: [request({
      id: 'source-order', items: [duck()], status: 'delivered', debt: 500000,
      payment: { id: 'pay-1' }, upfrontPayment: 100000,
    })],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.equal(template.items.length, 1);
  for (const forbidden of ['id', 'orderId', 'status', 'debt', 'payment', 'upfrontPayment']) {
    assert.equal(Object.hasOwn(template, forbidden), false, forbidden);
  }
});

test('latest template items omit transaction and calculated fields', () => {
  const template = getLatestCustomerOrderTemplate({
    requests: [request({ items: [duck({ payment: 1, debt: 2, deliveryStatus: 'done', amount: 650000 })] })],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  for (const forbidden of ['payment', 'debt', 'deliveryStatus', 'amount', 'billingQuantity']) {
    assert.equal(Object.hasOwn(template.items[0], forbidden), false, forbidden);
  }
});

test('memory is deterministic after reload', () => {
  const requests = [request({ items: [duck()] })];
  const first = getCustomerRecentOrderPreferences({ requests, companyId: 'tenant-a', customerId: 'customer-a' });
  const reloaded = getCustomerRecentOrderPreferences({
    requests: structuredClone(requests), companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.deepEqual(reloaded, first);
});

test('persisted customer memory survives restart without another order', () => {
  const first = buildCustomerFixedProductMemoryPatch({
    customer: { id: 'customer-a' }, requests: [request({ items: [duck()] })], validProductIds: ['duck'],
  });
  const persistedCustomer = { id: 'customer-a', ...first.patch };
  assert.equal(persistedCustomer.priceOverrides.duck.unitPrice, 65000);
  assert.equal(buildCustomerFixedProductMemoryPatch({
    customer: structuredClone(persistedCustomer), requests: [], validProductIds: ['duck'],
  }).patch, null);
});

test('tenant and customer scopes are isolated', () => {
  assert.deepEqual(getCustomerRecentOrderPreferences({
    requests: [request({ companyId: 'tenant-b', items: [duck()] })],
    companyId: 'tenant-a', customerId: 'customer-a',
  }), []);
  assert.deepEqual(getCustomerRecentOrderPreferences({
    requests: [request({ customerId: 'customer-b', items: [duck()] })],
    companyId: 'tenant-a', customerId: 'customer-a',
  }), []);
});

test('branch memory is isolated from root memory', () => {
  const requests = [
    request({ id: 'root', items: [duck()] }),
    request({ id: 'branch', branchId: 'branch-a', items: [duck({ unitPrice: 70000 })] }),
  ];
  const root = getCustomerRecentOrderPreferences({ requests, companyId: 'tenant-a', customerId: 'customer-a' });
  const branch = getCustomerRecentOrderPreferences({ requests, companyId: 'tenant-a', customerId: 'customer-a', branchId: 'branch-a' });
  assert.equal(root[0].unitPrice, 65000);
  assert.equal(branch[0].unitPrice, 70000);
});

test('archived orders are not suggested', () => {
  assert.deepEqual(getCustomerRecentOrderPreferences({
    requests: [request({ items: [duck()], isArchived: true })],
    companyId: 'tenant-a', customerId: 'customer-a',
  }), []);
});

test('editing an old order later does not outrank a newer order', () => {
  const [preference] = getCustomerRecentOrderPreferences({
    requests: [
      request({ id: 'old', createdAt: '2026-09-17T08:00:00.000Z', updatedAt: '2026-09-20T08:00:00.000Z', items: [duck({ unitPrice: 60000 })] }),
      request({ id: 'new', createdAt: '2026-09-18T08:00:00.000Z', items: [duck({ unitPrice: 68000 })] }),
    ],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.equal(preference.lastOrderId, 'new');
});

test('history merge replaces a saved copy without dropping other orders', () => {
  const merged = mergeCustomerOrderMemoryHistory({
    existingRequests: [
      request({ id: 'old', items: [duck({ unitPrice: 60000 })] }),
      request({ id: 'keep', createdAt: '2026-09-16T08:00:00.000Z', items: [duck({ productId: 'chicken' })] }),
    ],
    savedRequests: [request({ id: 'old', items: [duck({ unitPrice: 62000 })] })],
    companyId: 'tenant-a', customerId: 'customer-a',
  });
  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.id === 'old').items[0].unitPrice, 62000);
});

test('an omitted older product is retained', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a', customerProductIds: ['duck', 'chicken'],
      priceOverrides: { chicken: { unitPrice: 72000, price: 72000 } },
    },
    requests: [request({ items: [duck({ unitPrice: 68000 })] })],
    validProductIds: ['duck', 'chicken'],
  });
  assert.equal(result.patch.customerProductIds, undefined);
  assert.equal(result.patch.priceOverrides.chicken.unitPrice, 72000);
});

test('preference key uses variant attributes rather than price or order UOM', () => {
  assert.equal(
    buildCustomerOrderPreferenceKey(duck({ unitPrice: 68000, quantityUnit: 'Bo' })),
    buildCustomerOrderPreferenceKey(duck({ unitPrice: 65000, quantityUnit: 'Con' })),
  );
  assert.notEqual(
    buildCustomerOrderPreferenceKey(duck({ sizeLabel: '3-4kg' })),
    buildCustomerOrderPreferenceKey(duck({ sizeLabel: '2-3kg' })),
  );
});

test('order request UI exposes only configured customer products before the plus picker', () => {
  assert.match(appSource, />SP khách lấy<\/label>/);
  assert.match(appSource, /manualFixedProductVariantOptions\.map/);
  assert.match(appSource, /manualFixedProductIdSet\.has\(product\.id\)/);
  assert.match(appSource, /aria-label="Thêm sản phẩm khác"/);
  assert.doesNotMatch(appSource, /Sản phẩm đặt gần đây/);
  assert.doesNotMatch(appSource, /Dùng thông tin đơn gần nhất/);
});

test('successful save records the new order ID before updating memory', () => {
  assert.match(appSource, /const savedRequestId = await onAddOrderRequest/);
  assert.match(appSource, /await persistOrderRequestMemories\(savedRequests\)/);
  assert.match(appSource, /mergeCustomerOrderMemoryHistory\(/);
});
