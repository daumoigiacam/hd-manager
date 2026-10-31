import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeferredNavigation } from './fixtures/deferredNavigation.js';
test('a pending route can retain its permitted old screen while history uses the requested route', () => {
  const requested = { tab: 'customers', scope: 'company-a:employee-a' };
  assert.equal(resolveDeferredNavigation(requested, { tab: 'more', scope: requested.scope }, () => true), 'more');
  assert.equal(resolveDeferredNavigation(requested, requested, () => true), 'customers');
  assert.equal(requested.tab, 'customers');
});
test('a tenant/user change or revoked permission never reveals the deferred screen', () => {
  const requested = { tab: 'home', scope: 'company-b:employee-b' };
  assert.equal(resolveDeferredNavigation(requested, { tab: 'customers', scope: 'company-a:employee-a' }, () => true), 'home');
  assert.equal(resolveDeferredNavigation(requested, { tab: 'customers', scope: requested.scope }, () => false), 'home');
  assert.equal(resolveDeferredNavigation(requested, null, () => true), 'home');
});
