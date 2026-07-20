import assert from 'node:assert/strict';
import { extractZaloOrderRequest } from '../src/zaloOrderRequestAi.js';

const products = [
  { id: 'p_ga_ta', name: 'Gà ta', shortName: 'GT' },
  { id: 'p_vit', name: 'Vịt', shortName: 'V' },
  { id: 'p_ga', name: 'Gà', shortName: 'G' }
];

const fixedNow = new Date('2026-06-03T08:00:00+07:00');

function expectCreated(messageText, expected) {
  const result = extractZaloOrderRequest({ messageText, products, now: fixedNow });
  assert.equal(result.shouldCreateRequest, true, messageText);
  assert.equal(result.status, 'new');
  assert.equal(result.aiIntent, 'place_order');
  assert.ok(result.aiConfidence >= 0.8);
  assert.equal(result.items[0].productId, expected.productId);
  assert.equal(result.items[0].quantity, expected.quantity);
  assert.equal(result.items[0].unit, expected.unit);
  if (expected.requestedDeliveryDate !== undefined) {
    assert.equal(result.requestedDeliveryDate, expected.requestedDeliveryDate);
  }
  assert.match(result.aiReplyText, /Nhân viên kinh doanh sẽ xác nhận/);
}

expectCreated('Cho anh 50kg gà ta', { productId: 'p_ga_ta', quantity: 50, unit: 'kg' });
expectCreated('Mai giao anh 100kg vịt', { productId: 'p_vit', quantity: 100, unit: 'kg', requestedDeliveryDate: '2026-06-04' });
expectCreated('Lấy giúp anh 20kg gà', { productId: 'p_ga', quantity: 20, unit: 'kg' });
expectCreated('Đặt 30kg gà ta', { productId: 'p_ga_ta', quantity: 30, unit: 'kg' });

[
  'Như hôm qua nhé',
  'Tăng thêm',
  'Giống lần trước',
  'Lấy thêm ít',
  'Giao sớm giúp anh',
  'Có hàng không?',
  'Sao hôm nay giá cao thế?'
].forEach((messageText) => {
  const result = extractZaloOrderRequest({ messageText, products, now: fixedNow });
  assert.equal(result.shouldCreateRequest, false, messageText);
  assert.equal(result.status, 'need_human');
});

const unknownProduct = extractZaloOrderRequest({
  messageText: 'Cho anh 50kg bò tơ',
  products,
  now: fixedNow
});
assert.equal(unknownProduct.shouldCreateRequest, false);
assert.equal(unknownProduct.status, 'need_human');

console.log('AI Zalo order request tests passed');
