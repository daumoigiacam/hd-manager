import assert from 'node:assert/strict';
import {
  AI_ZALO_ASSISTANT_SYSTEM_PROMPT,
  buildAiZaloGuardrailResponse
} from '../src/aiZaloAssistant.js';

const productData = {
  name: 'Gà Ta',
  compactName: 'Gà Ta',
  unit: 'kg',
  price: 63000,
  stock: 120
};

const baseContext = {
  customerName: 'Anh Nam',
  companyName: 'HD Manager',
  senderName: 'Nhân viên kinh doanh',
  product: productData,
  price: productData.price,
  stock: productData.stock,
  unpaidPayment: {
    orderCode: 'DH2506010001',
    checkoutUrl: 'https://pay.example/DH2506010001'
  }
};

function expectJsonShape(result) {
  assert.equal(typeof result.intent, 'string');
  assert.equal(typeof result.confidence, 'number');
  assert.equal(typeof result.autoReplyAllowed, 'boolean');
  assert.equal(typeof result.replyText, 'string');
  assert.equal(typeof result.reason, 'string');
}

const cases = [
  {
    name: 'Khách hỏi giá gà ta',
    messageText: 'hôm nay gà ta bao nhiêu?',
    expectedIntent: 'ask_price',
    expectedAuto: true,
    includes: '63.000'
  },
  {
    name: 'Khách hỏi còn vịt không',
    messageText: 'còn vịt không?',
    expectedIntent: 'ask_stock',
    expectedAuto: true,
    includes: 'còn 120'
  },
  {
    name: 'Khách xin lại mã QR',
    messageText: 'gửi lại mã QR cho anh',
    expectedIntent: 'ask_payment_qr',
    expectedAuto: true,
    includes: 'DH2506010001'
  },
  {
    name: 'Khách đặt hàng',
    messageText: 'mai cho anh 50kg gà',
    expectedIntent: 'place_order',
    expectedAuto: false,
    includes: 'nhân viên'
  },
  {
    name: 'Khách báo giao thiếu',
    messageText: 'sao hôm nay giao thiếu?',
    expectedIntent: 'complaint',
    expectedAuto: false,
    includes: 'khiếu nại'
  },
  {
    name: 'Khách xin bớt giá',
    messageText: 'bớt giá cho anh đi',
    expectedIntent: 'negotiate_price',
    expectedAuto: false,
    includes: 'giảm giá'
  },
  {
    name: 'Khách hỏi công nợ',
    messageText: 'nợ anh còn bao nhiêu?',
    expectedIntent: 'ask_debt',
    expectedAuto: false,
    includes: 'công nợ'
  }
];

assert.match(AI_ZALO_ASSISTANT_SYSTEM_PROMPT, /Không bịa giá/);
assert.match(AI_ZALO_ASSISTANT_SYSTEM_PROMPT, /Output bắt buộc là JSON/);

for (const item of cases) {
  const result = buildAiZaloGuardrailResponse({
    ...baseContext,
    messageText: item.messageText
  });
  expectJsonShape(result);
  assert.equal(result.intent, item.expectedIntent, item.name);
  assert.equal(result.autoReplyAllowed, item.expectedAuto, item.name);
  assert.match(`${result.replyText}\n${result.reason}`.toLowerCase(), new RegExp(item.includes.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), item.name);
}

const missingPrice = buildAiZaloGuardrailResponse({
  ...baseContext,
  product: { name: 'Gà Ta', compactName: 'Gà Ta', unit: 'kg' },
  price: 0,
  messageText: 'hôm nay gà ta bao nhiêu?'
});
expectJsonShape(missingPrice);
assert.equal(missingPrice.intent, 'ask_price');
assert.equal(missingPrice.autoReplyAllowed, false);
assert.match(missingPrice.reason, /bảng giá/i);

console.log('AI Zalo Assistant guardrails tests passed.');
