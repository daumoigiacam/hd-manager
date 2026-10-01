import assert from 'node:assert/strict';
import { calculateLoyaltyPoints } from '../functions/loyaltyRewards.mjs';
const percent = { earnMode: 'revenue_percent', revenuePercent: 1, redeemValuePerPoint: 1000 };
assert.equal(calculateLoyaltyPoints(1000000, percent), 10);
assert.equal(calculateLoyaltyPoints(99999, percent), 0);
assert.equal(calculateLoyaltyPoints(-1000, percent), 0);
assert.equal(calculateLoyaltyPoints(1000000, { earnAmountPerPoint: 100000 }), 10);
assert.equal(calculateLoyaltyPoints(1000000, { ...percent, revenuePercent: 0 }), 0);
console.log('PASS fixed and revenue-percent reward calculation');
