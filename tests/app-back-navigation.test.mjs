import assert from 'node:assert/strict';
import { getAppBackTab } from '../src/utils/appBackNavigation.js';

assert.equal(getAppBackTab({ currentTab: 'debt', tabHistory: ['home', 'more'] }), 'more');
assert.equal(getAppBackTab({ currentTab: 'debt', tabHistory: ['more', 'customers'] }), 'customers');
assert.equal(getAppBackTab({ currentTab: 'debt', lastNonDebtTab: 'customers' }), 'customers');
assert.equal(getAppBackTab({ currentTab: 'debt', lastNonDebtTab: 'customers', canAccess: () => false }), 'more');
assert.equal(getAppBackTab({ currentTab: 'debt', lastNonDebtTab: 'debt' }), 'more');
assert.equal(getAppBackTab({ currentTab: 'orders' }), 'home');
assert.equal(getAppBackTab({ currentTab: 'home' }), null);

console.log('App back navigation tests passed.');
