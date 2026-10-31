import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBrowserInteraction,normalizeTrustedInputTimestamp } from '../scripts/helpers/browser-interaction-timing.mjs';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import vm from 'node:vm';
import { resolveAccessibleAuditRoutes } from '../scripts/helpers/android-audit-routes.mjs';

test('trusted input clocks preserve queueing and reject missing, future, stale or untrusted values rather than inventing zero',()=>{
  const origin=1793459889811;
  assert.equal(normalizeTrustedInputTimestamp(90,100,origin,true),90);
  assert.equal(normalizeTrustedInputTimestamp(origin+90,100,origin,true),90);
  for(const [stamp,now,trusted] of [[undefined,100,true],[NaN,100,true],[-1,100,true],[101,100,true],[0,60000,true],[90,100,false]]){
    assert.equal(normalizeTrustedInputTimestamp(stamp,now,origin,trusted),null);
  }
});
test('browser timing retains the slowest pointer event instead of reporting only a fast click', () => {
  const events = [
    { name: 'pointerdown', interactionId: 7, duration: 192, processingStart: 20 },
    { name: 'click', interactionId: 7, duration: 32, processingStart: 50 },
    { name: 'click', interactionId: 6, duration: 800, processingStart: 1 },
  ];
  const result = extractBrowserInteraction(events, 51);
  assert.equal(result.durationMs, 192);
  assert.equal(result.events.length, 2);
  assert.equal(result.status, 'MEASURED');
});
test('missing and malformed browser samples cannot become zero latency or PASS', () => {
  assert.equal(extractBrowserInteraction([], 20).durationMs, null);
  assert.equal(extractBrowserInteraction([], null).status, 'MISSING_EVENT_TIMING');
  assert.equal(extractBrowserInteraction([{ name: 'click', interactionId: 1, processingStart: 20, duration: NaN }], 20).status, 'INVALID_EVENT_TIMING');
});

test('actual Android multi-round plan keeps route location separate from the round number', () => {
  const source = readFileSync(new URL('../scripts/audit-android-webview.mjs', import.meta.url), 'utf8');
  let initializer;
  simple(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), {
    VariableDeclarator(node) { if (node.id.name === 'visits') initializer = source.slice(node.init.start, node.init.end); },
  });
  assert.ok(initializer);
  const routes = [['home', 'Home', true], ['report', 'Report'], ['settings', 'Settings', false]];
  const result = JSON.parse(JSON.stringify(vm.runInNewContext(initializer, { eligibleRoutes: routes, rounds: 3 })));
  assert.equal(result.length, 9);
  for (let round = 1; round <= 3; round++) {
    assert.deepEqual(result.slice((round - 1) * 3, round * 3), [
      ['home', 'Home', true, round], ['report', 'Report', false, round], ['settings', 'Settings', false, round],
    ]);
  }
  assert.deepEqual(routes, [['home', 'Home', true], ['report', 'Report'], ['settings', 'Settings', false]]);
});

test('employee module audit uses the observed button location and does not call inaccessible modules PASS', () => {
  const routes = Object.freeze([
    Object.freeze(['home', 'Home', true]), Object.freeze(['orders', 'Orders', true]), Object.freeze(['admin', 'Admin']),
  ]);
  const actual = resolveAccessibleAuditRoutes(routes, { bottom: ['Home'], more: ['Orders'] });
  assert.deepEqual(actual.eligibleRoutes, [['home', 'Home', true], ['orders', 'Orders', false]]);
  assert.equal(actual.skippedModules.length, 1);
  assert.equal(actual.skippedModules[0].module, 'admin');
  assert.match(actual.skippedModules[0].reason, /not tested, not PASS/);
  assert.equal(routes[1][2], true, 'default owner inventory is not mutated');
});
