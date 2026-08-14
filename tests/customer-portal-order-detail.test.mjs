import assert from 'node:assert/strict';
import {
  getCustomerPortalLineConversion,
  getCustomerPortalOrderLines,
  getCustomerPortalOrderSelection,
  getCustomerPortalOrderTotal,
  resolveCustomerPortalOrderSelection,
} from '../src/utils/customerPortalOrderDetail.js';

const order40 = {
  id: 'HDQ2NUPQ',
  total: 310000,
  status: 'unpaid',
  items: [
    {
      productNameSnapshot: 'Chân Vịt',
      quantity: 5,
      quantityUnit: 'Cái',
      unitPrice: 8000,
    },
    {
      productNameSnapshot: 'Thùng Xốp',
      quantity: 3,
      quantityUnit: 'Thùng',
      unitPrice: 90000,
    },
  ],
};

const order40Lines = getCustomerPortalOrderLines(order40);
assert.equal(order40Lines.length, 2, '1. order #40 keeps two independent product lines');
assert.equal(order40Lines[0].productName, 'Chân Vịt', '2. first product uses its line snapshot name');
assert.equal(order40Lines[0].quantity, 5, '3. first product keeps its own quantity');
assert.equal(order40Lines[0].unit, 'Cái', '4. first product keeps its own unit');
assert.equal(order40Lines[0].unitPrice, 8000, '5. first product keeps its own unit price');
assert.equal(order40Lines[0].lineTotal, 40000, '6. first product calculates 5 x 8,000');
assert.equal(order40Lines[1].productName, 'Thùng Xốp', '7. second product uses its line snapshot name');
assert.equal(order40Lines[1].quantity, 3, '8. second product keeps its own quantity');
assert.equal(order40Lines[1].unit, 'Thùng', '9. second product keeps its own unit');
assert.equal(order40Lines[1].unitPrice, 90000, '10. second product keeps its own unit price');
assert.equal(order40Lines[1].lineTotal, 270000, '11. second product calculates 3 x 90,000');
assert.notEqual(order40Lines[0].lineTotal, order40.total, '12. parent total never leaks into first line');
assert.notEqual(order40Lines[1].lineTotal, order40.total, '13. parent total never leaks into second line');
assert.equal(getCustomerPortalOrderTotal(order40), 310000, '14. stored order total remains unchanged');

const paidOrder = {
  ...order40,
  status: 'paid',
  total: 310000,
};
assert.deepEqual(
  getCustomerPortalOrderLines(paidOrder).map(line => line.lineTotal),
  [40000, 270000],
  '15. payment status does not change line presentation'
);

const weightPricedDuck = {
  id: 'duck-weight-priced',
  totalAmount: 285000,
  items: [{
    productNameSnapshot: 'Vịt Không Móc',
    actualQuantity: 2,
    actualUnit: 'Con',
    billingQuantity: 5,
    billingUnit: 'Kg',
    unitPrice: 57000,
    conversionFactor: 2.5,
    billingSnapshotVersion: 1,
    billingSnapshotSource: 'warehouse_dispatch',
    amount: 285000,
  }],
};
const duckLine = getCustomerPortalOrderLines(weightPricedDuck)[0];
assert.equal(duckLine.quantity, 2, '16. weight-priced duck preserves actual count');
assert.equal(duckLine.unit, 'Con', '17. weight-priced duck displays count unit');
assert.equal(duckLine.billingQuantity, 5, '18. weight-priced duck keeps billable Kg');
assert.equal(duckLine.billingUnit, 'Kg', '19. weight-priced duck keeps price unit');
assert.equal(duckLine.unitPrice, 57000, '20. weight-priced duck keeps frozen Kg price');
assert.equal(duckLine.lineTotal, 285000, '21. weight-priced duck keeps frozen line amount');
assert.deepEqual(
  getCustomerPortalLineConversion(duckLine),
  { fromUnit: 'Con', toUnit: 'Kg', factor: 2.5 },
  '22. conversion is exposed for customer detail display'
);

const legacySingleLine = {
  productName: 'Bao bì',
  quantity: 4,
  quantityUnit: 'Bao',
  unitPrice: 12000,
  total: 48000,
};
const legacyLine = getCustomerPortalOrderLines(legacySingleLine)[0];
assert.equal(legacyLine.productName, 'Bao bì', '23. legacy single-line order keeps its existing name');
assert.equal(legacyLine.lineTotal, 48000, '24. legacy single-line order may safely use its parent total');

const legacyPrimaryItem = {
  total: 999999,
  primaryItem: {
    productNameSnapshot: 'Lồng gà',
    quantity: 2,
    quantityUnit: 'Bộ',
    unitPrice: 55000,
  },
};
const legacyPrimaryLine = getCustomerPortalOrderLines(legacyPrimaryItem)[0];
assert.equal(legacyPrimaryLine.productName, 'Lồng gà', '25. primary-item keeps its own snapshot name');
assert.equal(legacyPrimaryLine.lineTotal, 110000, '26. primary-item never inherits its parent order total');

const productUnits = ['Kg', 'Con', 'Cái', 'Thùng', 'Bao'];
productUnits.forEach((unit, index) => {
  const quantity = index + 2;
  const unitPrice = (index + 1) * 10000;
  const line = getCustomerPortalOrderLines({
    items: [{ productName: `Sản phẩm ${unit}`, quantity, quantityUnit: unit, unitPrice }],
  })[0];
  assert.equal(line.unit, unit, `27.${index}. line keeps ${unit} as its actual unit`);
  assert.equal(line.lineTotal, quantity * unitPrice, `28.${index}. line calculates ${unit} correctly`);
});

const incompleteHistoricalLine = getCustomerPortalOrderLines({
  total: 999999,
  items: [{ quantity: 1, quantityUnit: 'Con', unitPrice: 10000 }],
})[0];
assert.equal(incompleteHistoricalLine.productName, 'Sản phẩm chưa có tên', '29. missing history is explicit instead of a generic false name');
assert.equal(incompleteHistoricalLine.lineTotal, 10000, '30. incomplete multi-line history still never reuses the parent total');

const order39 = {
  id: 'HDQ2NUPR',
  total: 40000,
  items: [{ productNameSnapshot: 'Duck leg', quantity: 5, quantityUnit: 'Piece', unitPrice: 8000 }],
};
const requestWithSameId = {
  id: order40.id,
  type: 'request',
  total: 100000,
  items: [{ productNameSnapshot: 'Different request', quantity: 1, quantityUnit: 'Piece', unitPrice: 100000 }],
};
const portalItems = [
  { ...order40, type: 'order' },
  { ...order39, type: 'order' },
  requestWithSameId,
];
const selectedOrder40 = getCustomerPortalOrderSelection(portalItems[0]);
assert.deepEqual(selectedOrder40, { type: 'order', id: 'HDQ2NUPQ' }, '31. selection uses order type and stable id');
assert.equal(resolveCustomerPortalOrderSelection(portalItems, selectedOrder40)?.id, 'HDQ2NUPQ', '32. selected order #40 resolves exactly');
assert.equal(resolveCustomerPortalOrderSelection(portalItems, getCustomerPortalOrderSelection(portalItems[1]))?.id, 'HDQ2NUPR', '33. selected order #39 resolves independently');
assert.equal(resolveCustomerPortalOrderSelection(portalItems, getCustomerPortalOrderSelection(requestWithSameId))?.type, 'request', '34. request and invoice with the same id do not collide');
const refreshedOrder40 = {
  ...portalItems[0],
  total: 315000,
  items: [
    ...portalItems[0].items,
    { productNameSnapshot: 'Packaging fee', quantity: 1, quantityUnit: 'Piece', unitPrice: 5000 },
  ],
};
assert.equal(
  getCustomerPortalOrderTotal(resolveCustomerPortalOrderSelection([refreshedOrder40, ...portalItems.slice(1)], selectedOrder40)),
  315000,
  '35. current realtime order snapshot replaces stale values'
);
assert.equal(resolveCustomerPortalOrderSelection(portalItems, { type: 'order', id: 'missing' }), null, '36. missing selection never falls back to a previous order');

console.log('Customer portal order detail tests: PASS (36 assertions)');
