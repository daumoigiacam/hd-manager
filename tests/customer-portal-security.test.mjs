import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildPointRedemptionId,
  calculateCustomerOutstandingDebt,
  calculatePointRedemption,
  sanitizeCompanyForCustomer,
  sanitizeCustomerAccountForClient,
  sanitizeCustomerProfileForClient,
  sanitizeProductForCustomer
} = require('../functions/customerPortalSecurity.js');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

test('customer company payload excludes backend secrets', () => {
  const payload = sanitizeCompanyForCustomer({
    name: 'HD Test',
    address: 'Vietnam',
    sepayApiKey: 'must-not-leak',
    payosClientSecret: 'must-not-leak',
    goongMapKey: 'must-not-leak'
  }, 'company-a');
  assert.deepEqual(payload, { id: 'company-a', name: 'HD Test', address: 'Vietnam' });
});

test('customer product payload excludes cost and sanitizes nested variants', () => {
  const payload = sanitizeProductForCustomer({
    name: 'Product A',
    sellingPrice: 70_000,
    costPrice: 50_000,
    supplierCost: 45_000,
    variants: [{ id: 'large', name: 'Large', price: 75_000, costPrice: 55_000 }]
  }, 'product-a');
  assert.equal(payload.costPrice, undefined);
  assert.equal(payload.supplierCost, undefined);
  assert.equal(payload.variants[0].costPrice, undefined);
  assert.equal(payload.variants[0].price, 75_000);
});

test('customer account payload excludes legacy credentials and recovery secrets', () => {
  const payload = sanitizeCustomerAccountForClient({
    customerId: 'customer-a',
    phone: '0900000001',
    username: 'customer-a',
    password_hash: 'must-not-leak',
    passwordSalt: 'must-not-leak',
    resetToken: 'must-not-leak'
  }, 'account-a');
  assert.equal(payload.password_hash, undefined);
  assert.equal(payload.passwordSalt, undefined);
  assert.equal(payload.resetToken, undefined);
});

test('customer profile payload exposes portal fields but excludes internal data', () => {
  const payload = sanitizeCustomerProfileForClient({
    companyId: 'company-a',
    name: 'Customer A',
    phone: '0900000001',
    address: 'Vietnam',
    fixedProducts: [{ productId: 'product-a', pricingUnit: 'kg' }],
    internalNote: 'must-not-leak',
    supplierCost: 45_000,
    password_hash: 'must-not-leak'
  }, 'customer-a');
  assert.equal(payload.id, 'customer-a');
  assert.equal(payload.companyId, 'company-a');
  assert.equal(payload.name, 'Customer A');
  assert.equal(payload.fixedProducts[0].pricingUnit, 'kg');
  assert.equal(payload.internalNote, undefined);
  assert.equal(payload.supplierCost, undefined);
  assert.equal(payload.password_hash, undefined);
});

test('point redemption uses server point value and caps amount to debt', () => {
  const result = calculatePointRedemption({
    pointsRecord: { available_points: 100, used_points: 20 },
    company: { loyaltyRedeemValuePerPoint: 1_000 },
    requestedPoints: 100,
    requestedAmount: 200_000,
    outstandingDebt: 60_000
  });
  assert.equal(result.amount, 60_000);
  assert.equal(result.pointsToUse, 100);
  assert.equal(result.nextAvailablePoints, 0);
  assert.equal(result.nextUsedPoints, 120);
});

test('point redemption cannot exceed available points', () => {
  const result = calculatePointRedemption({
    pointsRecord: { available_points: 25 },
    company: { loyaltyRedeemValuePerPoint: 1_000 },
    requestedPoints: 100,
    outstandingDebt: 100_000
  });
  assert.equal(result.pointsToUse, 25);
  assert.equal(result.amount, 25_000);
});

test('customer debt ignores archived orders and unapproved collections', () => {
  const debt = calculateCustomerOutstandingDebt({
    customer: { openingDebtAmount: 50_000 },
    orders: [
      { amount: 100_000 },
      { amount: 999_000, isArchived: true }
    ],
    payments: [
      { amount: 30_000, approvalStatus: 'approved' },
      { amount: 80_000, requiresApproval: true, approvalStatus: 'pending' }
    ]
  });
  assert.equal(debt, 120_000);
});

test('idempotency payment id is deterministic and rejects unsafe identifiers', () => {
  const first = buildPointRedemptionId({ customerId: 'customer-a', requestId: 'request-001' });
  const second = buildPointRedemptionId({ customerId: 'customer-a', requestId: 'request-001' });
  assert.equal(first, second);
  assert.equal(first, 'p_points_customer-a_request-001');
  assert.equal(buildPointRedemptionId({ customerId: 'customer-a', requestId: '' }), '');
});

console.log(`Customer portal security: ${passed} tests passed.`);
