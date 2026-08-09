import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildCustomerProductPreferenceCacheKey,
  buildCustomerProductPreferenceId,
  buildCustomerProductPreferenceWrite,
  calculatePricingAmount,
  getOrderInputUnitOptions,
  normalizeCustomerProductPreference,
  resolvePricingQuantity,
  resolveRememberedInputUnit,
  shouldOfferDefaultInputUnitUpdate,
} from '../src/services/smartCustomerOrdering.js';
import { PRODUCT_PRICING_UNIT_OPTIONS } from '../src/services/productPricingUnits.js';

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const identity = { companyId: 'company-1', customerId: 'customer-a', productId: 'duck-1' };

test('preference id is deterministic for one company, customer and product', () => {
  assert.equal(buildCustomerProductPreferenceId(identity), buildCustomerProductPreferenceId(identity));
});

test('preference id changes for another customer', () => {
  assert.notEqual(
    buildCustomerProductPreferenceId(identity),
    buildCustomerProductPreferenceId({ ...identity, customerId: 'customer-b' }),
  );
});

test('preference id changes for another product', () => {
  assert.notEqual(
    buildCustomerProductPreferenceId(identity),
    buildCustomerProductPreferenceId({ ...identity, productId: 'chicken-1' }),
  );
});

test('cache key uses the same exact identity as the Firestore document', () => {
  assert.equal(buildCustomerProductPreferenceCacheKey(identity), buildCustomerProductPreferenceId(identity));
});

test('legacy defaultUnit remains readable without migration', () => {
  const preference = normalizeCustomerProductPreference({ defaultUnit: 'Con', lastUnit: 'Kg' });
  assert.equal(preference.defaultInputUnit, 'Con');
  assert.equal(preference.lastInputUnit, 'Kg');
});

test('first order establishes both default and last input units', () => {
  const preference = buildCustomerProductPreferenceWrite({ identity, inputUnit: 'Con' });
  assert.equal(preference.defaultInputUnit, 'Con');
  assert.equal(preference.lastInputUnit, 'Con');
});

test('a changed unit offers an explicit default-update confirmation', () => {
  assert.equal(shouldOfferDefaultInputUnitUpdate({
    preference: { defaultInputUnit: 'Con' },
    nextInputUnit: 'Kg',
  }), true);
});

test('the same unit does not display a redundant confirmation', () => {
  assert.equal(shouldOfferDefaultInputUnitUpdate({
    preference: { defaultInputUnit: 'Con' },
    nextInputUnit: 'Con',
  }), false);
});

test('choosing No keeps default but records the latest input unit', () => {
  const preference = buildCustomerProductPreferenceWrite({
    identity,
    existingPreference: { ...identity, defaultInputUnit: 'Con', lastInputUnit: 'Con' },
    inputUnit: 'Kg',
    updateDefault: false,
  });
  assert.equal(preference.defaultInputUnit, 'Con');
  assert.equal(preference.lastInputUnit, 'Kg');
});

test('choosing Yes updates the remembered default', () => {
  const preference = buildCustomerProductPreferenceWrite({
    identity,
    existingPreference: { ...identity, defaultInputUnit: 'Con', lastInputUnit: 'Con' },
    inputUnit: 'Kg',
    updateDefault: true,
  });
  assert.equal(preference.defaultInputUnit, 'Kg');
  assert.equal(preference.lastInputUnit, 'Kg');
});

test('remembered default is preferred when it is available', () => {
  assert.equal(resolveRememberedInputUnit({
    preference: { defaultInputUnit: 'Con', lastInputUnit: 'Kg' },
    availableUnits: ['Kg', 'Con'],
    pricingUnit: 'Kg',
  }), 'Con');
});

test('pricing unit is a safe fallback when no preference exists', () => {
  assert.equal(resolveRememberedInputUnit({
    availableUnits: ['Kg', 'Con'],
    pricingUnit: 'Kg',
  }), 'Kg');
});

test('standard pricing catalog contains all requested units', () => {
  assert.deepEqual(PRODUCT_PRICING_UNIT_OPTIONS, [
    'Kg', 'Con', 'Cái', 'Bộ', 'Thùng', 'Bao', 'Khay', 'Lốc', 'Gói', 'Chai', 'Khác',
  ]);
});

test('Kg pricing keeps order input units independent from the billing unit', () => {
  const units = getOrderInputUnitOptions({
    product: { unit: 'Con' },
    pricingUnit: 'Kg',
    currentUnit: 'Con',
    catalogUnits: ['Con', 'Kg', 'Thùng'],
  });
  assert.equal(units[0], 'Con');
  assert.ok(units.includes('Kg'));
  assert.ok(units.includes('Thùng'));
});

test('order unit suggestions exclude standard units unused by the product catalog', () => {
  const units = getOrderInputUnitOptions({
    product: { unit: 'Con' },
    pricingUnit: 'Kg',
    catalogUnits: ['Con', 'Kg'],
  });
  assert.deepEqual(units, ['Con', 'Kg']);
  assert.equal(units.includes('Thùng'), false);
});

test('a newly typed order unit remains selectable without changing the pricing unit', () => {
  const units = getOrderInputUnitOptions({
    product: { unit: 'Con' },
    pricingUnit: 'Kg',
    currentUnit: 'Rổ',
    catalogUnits: ['Con', 'Kg'],
  });
  assert.deepEqual(units, ['Rổ', 'Con', 'Kg']);
});

test('count pricing does not expose incompatible weight input', () => {
  assert.deepEqual(getOrderInputUnitOptions({
    product: { unit: 'Con' },
    pricingUnit: 'Con',
  }), ['Con']);
});

test('50 Con ordered with Kg pricing waits for warehouse weight then bills by Kg', () => {
  const pending = calculatePricingAmount({
    pricingUnit: 'Kg', inputUnit: 'Con', inputQuantity: 50, unitPrice: 50_000,
  });
  assert.equal(pending.isPending, true);
  assert.equal(pending.amount, 0);

  const weighed = calculatePricingAmount({
    pricingUnit: 'Kg', inputUnit: 'Con', inputQuantity: 50, actualWeightKg: 125, unitPrice: 50_000,
  });
  assert.equal(weighed.quantity, 125);
  assert.equal(weighed.amount, 6_250_000);
});

test('Kg pricing uses actual delivered weight', () => {
  assert.deepEqual(calculatePricingAmount({
    pricingUnit: 'Kg', inputUnit: 'Con', inputQuantity: 100, actualWeightKg: 318, unitPrice: 65_000,
  }), {
    quantity: 318, source: 'actualWeightKg', isPending: false, unitPrice: 65_000, amount: 20_670_000,
  });
});

test('Kg pricing can use an entered Kg quantity before delivery', () => {
  const result = calculatePricingAmount({ pricingUnit: 'Kg', inputUnit: 'Kg', inputQuantity: 2.5, unitPrice: 50_000 });
  assert.equal(result.quantity, 2.5);
  assert.equal(result.amount, 125_000);
  assert.equal(result.isPending, false);
});

test('Kg pricing waits for actual weight when order was entered by Con', () => {
  const result = resolvePricingQuantity({ pricingUnit: 'Kg', inputUnit: 'Con', inputQuantity: 5 });
  assert.equal(result.quantity, 0);
  assert.equal(result.isPending, true);
  assert.equal(result.source, 'missingActualWeightKg');
});

test('Con pricing uses count instead of weight', () => {
  const result = calculatePricingAmount({
    pricingUnit: 'Con', inputUnit: 'Con', inputQuantity: 5, actualWeightKg: 12.5, unitPrice: 100_000,
  });
  assert.equal(result.quantity, 5);
  assert.equal(result.amount, 500_000);
});

test('actual Con quantity overrides the requested quantity', () => {
  const result = calculatePricingAmount({
    pricingUnit: 'Con', inputUnit: 'Con', inputQuantity: 5,
    actualQuantity: 4, actualQuantityUnit: 'Con', unitPrice: 100_000,
  });
  assert.equal(result.quantity, 4);
  assert.equal(result.amount, 400_000);
  assert.equal(result.source, 'actualQuantity');
});

test('Con pricing does not accidentally multiply Kg input', () => {
  const result = calculatePricingAmount({
    pricingUnit: 'Con', inputUnit: 'Kg', inputQuantity: 12.5,
    actualQuantity: 12.5, actualQuantityUnit: 'Kg', unitPrice: 100_000,
  });
  assert.equal(result.amount, 0);
  assert.equal(result.isPending, true);
});

test('Thùng pricing uses actual Thùng quantity', () => {
  const result = calculatePricingAmount({
    pricingUnit: 'Thùng', inputUnit: 'Thùng', inputQuantity: 3,
    actualQuantity: 2, actualQuantityUnit: 'Thùng', unitPrice: 450_000,
  });
  assert.equal(result.amount, 900_000);
});

test('Bao pricing uses requested Bao quantity before delivery', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Bao', inputUnit: 'Bao', inputQuantity: 8, unitPrice: 250_000,
  }).amount, 2_000_000);
});

test('Cái pricing remains quantity based', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Cái', inputUnit: 'Cái', inputQuantity: 10, unitPrice: 8_000,
  }).amount, 80_000);
});

test('Bộ pricing remains quantity based', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Bộ', inputUnit: 'Bộ', inputQuantity: 4, unitPrice: 120_000,
  }).amount, 480_000);
});

test('Khay pricing remains quantity based', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Khay', inputUnit: 'Khay', inputQuantity: 6, unitPrice: 75_000,
  }).amount, 450_000);
});

test('Lốc pricing remains quantity based', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Lốc', inputUnit: 'Lốc', inputQuantity: 6, unitPrice: 60_000,
  }).amount, 360_000);
});

test('Gói pricing remains quantity based', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Gói', inputUnit: 'Gói', inputQuantity: 12, unitPrice: 15_000,
  }).amount, 180_000);
});

test('Chai pricing remains quantity based', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Chai', inputUnit: 'Chai', inputQuantity: 24, unitPrice: 20_000,
  }).amount, 480_000);
});

test('Khác remains usable as an explicit pricing unit', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Khác', inputUnit: 'Khác', inputQuantity: 2, unitPrice: 99_000,
  }).amount, 198_000);
});

test('Vietnamese comma decimals are parsed accurately', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Kg', inputUnit: 'Kg', inputQuantity: '2,5', unitPrice: 50_000,
  }).amount, 125_000);
});

test('Vietnamese formatted money is parsed accurately', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Kg', inputUnit: 'Kg', inputQuantity: 2, unitPrice: '65.000 đ',
  }).amount, 130_000);
});

test('zero price never creates revenue', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Con', inputUnit: 'Con', inputQuantity: 10, unitPrice: 0,
  }).amount, 0);
});

test('negative quantity is safely normalized to zero', () => {
  assert.equal(calculatePricingAmount({
    pricingUnit: 'Con', inputUnit: 'Con', inputQuantity: -5, unitPrice: 100_000,
  }).amount, 0);
});

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('Firestore integration reads one deterministic preference document', () => {
  assert.match(appSource, /customerProductPreferences/);
  assert.match(appSource, /const snapshot = await getDoc\(preferenceRef\)/);
  assert.match(appSource, /buildCustomerProductPreferenceId/);
});

test('order requests persist Smart Memory after successful writes', () => {
  assert.match(appSource, /await persistSmartOrderingPreferences\(normalizedRequests\)/);
  assert.match(appSource, /await persistSmartOrderingPreferences\(\[normalizedRequest\]\)/);
});

test('order form keeps the selected input unit separate from the pricing unit', () => {
  assert.match(appSource, /onClick=\{\(\) => openDraftItemUnitEditor\(draft, item\)\}/);
  assert.match(appSource, /handleDraftItemQuantityUnitChange\(\s*orderUnitEditor\.draftLocalId/);
  assert.match(appSource, /item\.quantityUnit \|\| item\.actualUnit \|\| billingUnit/);
  assert.doesNotMatch(appSource, /Đơn vị số lượng của .* được cố định là/);
});

test('delivery reports persist the authoritative pricing result', () => {
  assert.match(appSource, /pricingUnit: normalizeProductPricingUnit\(row\.pricingUnit/);
  assert.match(appSource, /pricingAmount: parseLooseMoneyValue\(row\.pricingAmount\)/);
});

console.log(`\n${passed} Smart Customer Ordering tests passed.`);
