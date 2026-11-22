import assert from 'node:assert/strict';
import test from 'node:test';
import { appObject,appFunction,applicationSource as source } from './helpers/app-source-function.mjs';
import {QUOTE_PRIMARY_COLLECTIONS} from '../src/services/quoteWorkspaceReadPlan.js';
import {getMessageWorkspaceReadCollections} from '../src/services/messageWorkspaceReadPlan.js';

const evaluateLiteral = name => appFunction(name,{QUOTE_PRIMARY_COLLECTIONS,getMessageWorkspaceReadCollections});

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
  const reset=appFunction('handleResetCompanyDemoData');
  assert.match(reset.toString(),/RESET_DATA_SCOPE_OPTIONS\.filter/);
  assert.match(reset.toString(),/for \(const name of selectedCollections\)/);
  assert.match(source, /const BACKUP_DATA_COLLECTIONS = DATA_COLLECTION_NAMES\.filter\(name => name !== 'companies'\)/);
});

test('the active pricing route has no log consumer to starve', () => {
  const route = /<SimplePricingEngineView\b[^>]+>/.exec(source);
  assert.ok(route);
  assert.match(route[0], /<SimplePricingEngineView\b/);
  assert.doesNotMatch(route[0], /pricingChangeLogs/);
  assert.ok(evaluateLiteral('FOREGROUND_REALTIME_COLLECTIONS_BY_TAB').pricing.includes('pricingRules'));
});
