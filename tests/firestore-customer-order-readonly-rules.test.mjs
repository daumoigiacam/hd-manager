import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const writableCollectionBlock = rules.match(
  /function isCustomerWritableCollection\(collectionId\)\s*\{([\s\S]*?)\n\s*\}/
)?.[1] || '';

assert.ok(writableCollectionBlock, '1. customer writable collection allowlist exists');
assert.doesNotMatch(writableCollectionBlock, /['"]orders['"]/, '2. customers cannot update sales orders');
assert.doesNotMatch(writableCollectionBlock, /['"]orderItems['"]/, '3. customers cannot update order items');
assert.match(
  rules,
  /canCustomerUpdateDocument\(collectionId, docId, oldData, newData\)[\s\S]*?isCustomerWritableCollection\(collectionId\)/,
  '4. customer updates use the scoped allowlist'
);

console.log('Customer order read-only Firestore rules: PASS (4 assertions)');
