import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function createMonitor(enabled = true) {
  let clock = 0;
  const listeners = new Map();
  const win = {
    location: { origin: 'http://127.0.0.1', pathname: '/', search: `?perfMonitor=${enabled}`, hash: '' },
    localStorage: { getItem: () => null },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatchEvent(event) { listeners.get(event.type)?.forEach(callback => callback(event)); },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  };
  const source = readFileSync(new URL('../src/services/performanceMonitor.js', import.meta.url), 'utf8')
    .replace(/import\.meta\.env\.[A-Z_]+/g, 'undefined')
    .replace(/export const /g, 'const ');
  const scope = vm.createContext({ window: win, performance: { now: () => clock }, Date, URL, URLSearchParams, JSON, Set, Map, Object, Number, String, Math, navigator: {}, document: { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} }, setInterval: () => 1, clearInterval: () => {}, queueMicrotask, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(`${source}\nglobalThis.api = {initPerformanceMonitor,stopPerformanceMonitor,createPerformanceSpan,recordFirestoreOperation,recordReactRender,trackRealtimeSubscription};`, scope);
  scope.api.initPerformanceMonitor();
  return { ...scope.api, debug: win.hdPerformanceMonitor, win, listeners, tick: value => { clock += value; } };
}

test('monitor is no-op unless explicitly enabled', () => {
  const monitor = createMonitor(false);
  assert.equal(monitor.debug.beginInteraction('save', 'products'), null);
  monitor.createPerformanceSpan('save').end();
  assert.equal(monitor.debug.events().length, 0);
});

test('async span keeps its originating interaction, including unattributed background work', () => {
  const monitor = createMonitor();
  const background = monitor.createPerformanceSpan('background');
  const first = monitor.debug.beginInteraction('save', 'products');
  const save = monitor.createPerformanceSpan('save');
  monitor.tick(12.25);
  monitor.debug.beginInteraction('open', 'orders');
  save.end();
  background.end();
  const events = monitor.debug.events();
  assert.equal(events.find(row => row.type === 'save').interactionId, first);
  assert.equal(events.find(row => row.type === 'save').detail.durationMs, 12.25);
  assert.equal(events.find(row => row.type === 'background').interactionId, null);
  assert.equal(monitor.debug.finishInteraction('observed', first), null, 'stale completion cannot end newer interaction');
});

test('SDK wall time is never reported as database time', async () => {
  const monitor = createMonitor();
  await monitor.recordFirestoreOperation('setDoc', {}, async () => { monitor.tick(185); });
  const event = monitor.debug.events().find(row => row.type === 'firestore.operation');
  assert.equal(event.detail.durationMs, 185);
  assert.equal(event.detail.databaseDurationMs, null);
  assert.ok(!monitor.debug.events().some(row => row.type === 'database.query'));
});

test('subscriptions close idempotently and short renders are retained', () => {
  const monitor = createMonitor();
  const close = monitor.trackRealtimeSubscription({ path: 'products' });
  assert.equal(monitor.debug.subscriptions().length, 1);
  close(); close();
  assert.equal(monitor.debug.subscriptions().length, 0);
  monitor.recordReactRender('Products', 'update', 2.25, 4, 0, 6);
  assert.equal(monitor.debug.events().find(row => row.type === 'render.react').detail.actualDurationMs, 2.25);
});

test('input measurement records no typed content; teardown can restart without duplicate listeners', () => {
  const monitor = createMonitor();
  monitor.debug.beginInteraction('input', 'employees');
  monitor.win.dispatchEvent({ type: 'input', isTrusted: true, target: { tagName: 'INPUT', type: 'password', value: 'private-credential' } });
  assert.ok(!JSON.stringify(monitor.debug.events()).includes('private-credential'));
  monitor.stopPerformanceMonitor();
  assert.equal(monitor.listeners.get('input').size, 0);
  monitor.initPerformanceMonitor();
  assert.equal(monitor.listeners.get('input').size, 1);
  monitor.stopPerformanceMonitor();
});
