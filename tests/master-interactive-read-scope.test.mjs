import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { appObject } from './helpers/app-source-function.mjs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const evaluateLiteral = name => {
  const node = appObject(name);
  return new Function(`return (${source.slice(node.start, node.end)});`)();
};

test('unused pricing log is absent from every interactive activation and binding', () => {
  const foreground = evaluateLiteral('FOREGROUND_REALTIME_COLLECTIONS_BY_TAB');
  for (const [tab, collections] of Object.entries(foreground)) {
    assert.ok(!collections.includes('pricingChangeLogs'), `${tab} starts an unused log read`);
  }
  const bindings = appObject('allCollectionBindings');
  assert.equal(bindings.type, 'ArrayExpression');
  const names = bindings.elements.map(binding => binding.elements[0].value);
  assert.ok(!names.includes('pricingChangeLogs'));
  for (const required of ['pricingInputs', 'pricingRules', 'pricingScenarios', 'orders',
    'orderRequests', 'warehouseImports', 'warehouseDispatches', 'payments', 'customers']) {
    assert.ok(names.includes(required), `authoritative source was removed: ${required}`);
  }
});

test('removing an interactive read does not remove full backup and reset coverage', () => {
  const names = evaluateLiteral('DATA_COLLECTION_NAMES');
  assert.ok(names.includes('pricingChangeLogs'));
  const sections = evaluateLiteral('RESET_DATA_SCOPE_OPTIONS');
  assert.ok(sections.some(section => section.collections?.includes('pricingChangeLogs')));
  assert.match(source, /pricingChangeLogs:\s*setRawPricingChangeLogs/);
  assert.match(source, /pricingChangeLogs:\s*\[setRawPricingChangeLogs\]/);
  assert.match(source, /const BACKUP_DATA_COLLECTIONS = DATA_COLLECTION_NAMES\.filter\(name => name !== 'companies'\)/);
});

test('the active pricing route has no log consumer to starve', () => {
  const route = /case 'pricing': return ([\s\S]*?);/.exec(source);
  assert.ok(route);
  assert.match(route[1], /<SimplePricingEngineView\b/);
  assert.doesNotMatch(route[1], /pricingChangeLogs/);
  assert.ok(evaluateLiteral('FOREGROUND_REALTIME_COLLECTIONS_BY_TAB').pricing.includes('pricingRules'));
});
