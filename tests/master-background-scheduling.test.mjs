import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { createCooperativeTaskQueue } from '../src/services/cooperativeTaskQueue.js';

function fakeTimers() {
  let now = 0;
  let nextId = 0;
  const pending = new Map();
  const cancelled = [];
  const schedule = (callback, delay = 250) => {
    const id = nextId++;
    pending.set(id, { callback, time: now + delay });
    return id;
  };
  const cancel = (id) => { cancelled.push(id); pending.delete(id); };
  function startNext() {
    const [id, entry] = [...pending].sort((left, right) => left[1].time - right[1].time || left[0] - right[0])[0] || [];
    assert.notEqual(entry, undefined, 'a timer must be scheduled');
    pending.delete(id);
    now = Math.max(now, entry.time);
    return { id, callback: entry.callback, completion: entry.callback() };
  }
  return {
    schedule, cancel, pending, cancelled, startNext,
    get now() { return now; },
    async tick() { await startNext().completion; },
    async advance(milliseconds) {
      const until = now + milliseconds;
      while ([...pending.values()].some(entry => entry.time <= until)) await startNext().completion;
      now = until;
    },
  };
}

function harness(options = {}) {
  const timers = fakeTimers();
  const queue = createCooperativeTaskQueue({ ...options, schedule: timers.schedule, cancel: timers.cancel });
  return { queue, timers };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function activityHarness(run) {
  const activity = new EventTarget();
  const state = { visible: true, online: true, focused: false, inputPending: false, lastInput: -Infinity };
  const { queue, timers } = harness({
    run,
    isPaused: () => !state.visible || !state.online || state.focused || state.inputPending || timers.now - state.lastInput < 1000,
  });
  const updateAvailability = () => {
    if (!state.visible || !state.online) queue.pause();
    else queue.resume();
  };
  const noteInput = () => { state.lastInput = timers.now; };
  activity.addEventListener('visibilitychange', updateAvailability);
  activity.addEventListener('online', updateAvailability);
  activity.addEventListener('offline', updateAvailability);
  activity.addEventListener('input', noteInput);
  return { queue, timers, state,
    emit: type => activity.dispatchEvent(new Event(type)),
    dispose() {
      activity.removeEventListener('visibilitychange', updateAvailability);
      activity.removeEventListener('online', updateAvailability);
      activity.removeEventListener('offline', updateAvailability);
      activity.removeEventListener('input', noteInput);
      queue.dispose();
    },
  };
}

// Parse the complete App, but execute only scheduling helpers/effects and the
// fingerprint callback. Firebase, React rendering and native file APIs stay out.
const appRuntime = (() => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const names = new Set([
    'isNativeAppShellRuntime', 'getIdleScheduler', 'cancelIdleScheduler',
    'scheduleMaintenanceWork', 'cancelMaintenanceWork', 'AUTO_BACKUP_DELAY_MS',
    'LOYALTY_ELIGIBILITY_SCAN_KEY', 'loyaltyMaintenanceDataReady',
    'LOYALTY_MAINTENANCE_COLLECTION_NAMES', 'loyaltyMissingCollectionNames', 'loyaltyMissingCollectionKey',
    'handleRunDailyAutoBackup', 'saveAutomaticBackupFile', 'FOREGROUND_REALTIME_COLLECTIONS_BY_TAB',
  ]);
  const declarations = new Map();
  const assignments = new Map();
  const effects = [];
  let refreshCollectionExpression;
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const textOf = node => source.slice(node.start, node.end);
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && names.has(node.id?.name)) declarations.set(node.id.name, textOf(node.init));
    if (node.type === 'AssignmentExpression') {
      const target = textOf(node.left);
      if (target === 'forceRefreshCollectionRef.current' && node.right.async && textOf(node.right).includes('collectionBindingMap.get')) {
        refreshCollectionExpression = textOf(node.right);
      }
      if (/^(loyaltyActivityRef|loyaltySyncCallbackRef|loyaltyFingerprintCallbackRef|autoBackupCallbackRef)\.current/.test(target)) {
        assignments.set(target, textOf(node.right));
      }
    }
    if (node.type === 'CallExpression' && node.callee?.name === 'useEffect') {
      effects.push({ callback: textOf(node.arguments[0]), dependencies: node.arguments[1] ? textOf(node.arguments[1]) : 'undefined' });
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  }
  visit(tree);
  const selectEffect = (anchor) => {
    const matches = effects.filter(effect => effect.callback.includes(anchor));
    assert.equal(matches.length, 1, `one App effect must contain ${anchor}`);
    return matches[0];
  };
  const evaluate = (expression, bindings) => new Function(...Object.keys(bindings), `return (${expression});`)(...Object.values(bindings));
  return {
    declaration: (name, bindings) => {
      assert.ok(declarations.has(name), `App declaration ${name}`);
      return evaluate(declarations.get(name), bindings);
    },
    assignment: (name, bindings) => {
      assert.ok(assignments.has(name), `App assignment ${name}`);
      return evaluate(assignments.get(name), bindings);
    },
    effect: (anchor, bindings) => evaluate(selectEffect(anchor).callback, bindings)(),
    dependencies: (anchor, bindings) => evaluate(selectEffect(anchor).dependencies, bindings),
    forceRefresh: (bindings) => {
      assert.ok(refreshCollectionExpression, 'App forceRefreshCollectionRef implementation');
      return evaluate(refreshCollectionExpression, bindings);
    },
  };
})();

function appHarness({ idle = false } = {}) {
  const timers = fakeTimers();
  const calls = [];
  const errors = [];
  const queues = [];
  const states = new Map();
  const clockStart = Date.parse('2026-10-03T00:00:00Z');
  class RuntimeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clockStart + timers.now])); }
    static now() { return clockStart + timers.now; }
  }
  class Surface extends EventTarget {
    listeners = new Map();
    addEventListener(name, callback, options) {
      const capture = options === true || Boolean(options?.capture);
      const listeners = this.listeners.get(name) || [];
      if (!listeners.some(listener => listener.callback === callback && listener.capture === capture)) {
        this.listeners.set(name, [...listeners, { callback, capture }]);
      }
      super.addEventListener(name, callback, { capture });
    }
    removeEventListener(name, callback, options) {
      const capture = options === true || Boolean(options?.capture);
      super.removeEventListener(name, callback, { capture });
      const remaining = (this.listeners.get(name) || []).filter(listener => listener.callback !== callback || listener.capture !== capture);
      if (remaining.length) this.listeners.set(name, remaining);
      else this.listeners.delete(name);
    }
  }
  const browser = new Surface();
  browser.setTimeout = timers.schedule;
  browser.clearTimeout = timers.cancel;
  browser.open = () => { throw new Error('automatic downloads are forbidden in this harness'); };
  if (idle) {
    browser.requestIdleCallback = (callback, options) => {
      assert.deepEqual(options, { timeout: 2500 });
      return timers.schedule(() => callback({ didTimeout: false, timeRemaining: () => 20 }), 50);
    };
    browser.cancelIdleCallback = timers.cancel;
  }
  const document = new Surface();
  document.visibilityState = 'visible';
  document.activeElement = null;
  document.createElement = () => { throw new Error('automatic downloads are forbidden in this harness'); };
  const bindings = {
    window: browser, document, navigator: { onLine: true }, Date: RuntimeDate,
    console: { warn: (...args) => errors.push(args) },
    Capacitor: { getPlatform: () => 'web' },
    createCooperativeTaskQueue: options => {
      const queue = createCooperativeTaskQueue(options);
      queues.push(queue);
      return queue;
    },
    firebaseUser: { uid: 'user-a' }, myCompanyId: 'tenant-a', activeTab: 'orders',
    activeTenantScopeRef: { current: 'tenant-a' }, currentCompany: { enabled: true, name: 'Company A' },
    getCustomerLoyaltySettings: company => ({ enabled: company.enabled, earnAmountPerPoint: company.earnAmountPerPoint || 2000 }),
    serverConfirmedCollectionState: { tenantId: 'tenant-a', collections: Object.fromEntries(
      ['customers', 'orders', 'payments', 'orderRequests', 'warehouseDispatches', 'customer_points'].map(name => [name, true])
    ) },
    loyaltyMaintenanceRef: { current: null }, loyaltySyncCallbackRef: { current: null },
    loyaltyFingerprintCallbackRef: { current: null }, loyaltyActivityRef: { current: { lastInputAt: 0 } },
    loyaltyEligibilitySyncFingerprintRef: { current: new Map() }, loyaltyEligibilitySyncPrimedRef: { current: false },
    autoBackupInFlightRef: { current: new Set() }, autoBackupCallbackRef: { current: null },
    customers: [{ id: 'c1' }, { id: 'c2' }],
    orders: [{ id: 'o1', customerId: 'c1', finalTotal: 10 }, { id: 'o2', customerId: 'c2', finalTotal: 20 }],
    payments: [], orderRequests: [], warehouseDispatches: [],
    syncCustomerLoyaltyPoints: (key, options) => calls.push(['loyalty', key, options.reason]),
    handleRunDailyAutoBackup: () => calls.push(['backup']),
    forceRefreshCollectionRef: { current: () => Promise.resolve(false) },
    getTodayString: () => '2026-10-03',
    buildAutoBackupStateKey: (company, date) => `${company}:${date}`,
    getAutoBackupStateForCompany: (company, date) => states.get(`${company}:${date}`),
    setAutoBackupStateForCompany: (company, date, state) => states.set(`${company}:${date}`, state),
    getFriendlyFirebaseErrorMessage: error => error.message,
  };
  for (const name of [
    'isNativeAppShellRuntime', 'getIdleScheduler', 'cancelIdleScheduler', 'scheduleMaintenanceWork',
    'cancelMaintenanceWork', 'AUTO_BACKUP_DELAY_MS', 'LOYALTY_ELIGIBILITY_SCAN_KEY', 'LOYALTY_MAINTENANCE_COLLECTION_NAMES',
  ]) bindings[name] = appRuntime.declaration(name, bindings);
  const render = (patch = {}) => {
    Object.assign(bindings, patch);
    bindings.loyaltyMissingCollectionNames = appRuntime.declaration('loyaltyMissingCollectionNames', bindings);
    bindings.loyaltyMissingCollectionKey = appRuntime.declaration('loyaltyMissingCollectionKey', bindings);
    bindings.loyaltyMaintenanceDataReady = appRuntime.declaration('loyaltyMaintenanceDataReady', bindings);
    for (const property of ['tab', 'ready', 'enabled', 'missingCollections']) {
      bindings.loyaltyActivityRef.current[property] = appRuntime.assignment(`loyaltyActivityRef.current.${property}`, bindings);
    }
    bindings.loyaltySyncCallbackRef.current = appRuntime.assignment('loyaltySyncCallbackRef.current', bindings);
    bindings.loyaltyFingerprintCallbackRef.current = appRuntime.assignment('loyaltyFingerprintCallbackRef.current', bindings);
    bindings.autoBackupCallbackRef.current = appRuntime.assignment('autoBackupCallbackRef.current', bindings);
  };
  render();
  return { timers, browser, document, bindings, calls, errors, queues, states, render,
    startLoyalty: () => appRuntime.effect('loyaltyMaintenanceRef.current = queue', bindings),
    enqueueFingerprint: () => appRuntime.effect('enqueue(LOYALTY_ELIGIBILITY_SCAN_KEY)', bindings),
    startBackup: () => appRuntime.effect('const backupQueue = createCooperativeTaskQueue', bindings),
    startSources: () => appRuntime.effect('loyaltyMissingCollectionKey.split', bindings),
    visibility(state) { document.visibilityState = state; document.dispatchEvent(new Event('visibilitychange')); },
    online(value) {
      bindings.navigator.onLine = value;
      browser.dispatchEvent(new Event(value ? 'online' : 'offline'));
    },
  };
}

function mountSourceEffect(h) {
  const anchor = 'loyaltyMissingCollectionKey.split';
  let previous;
  let cleanup;
  const update = () => {
    const next = appRuntime.dependencies(anchor, h.bindings);
    if (previous && next.every((value, index) => Object.is(value, previous[index]))) return;
    cleanup?.();
    previous = next;
    cleanup = appRuntime.effect(anchor, h.bindings);
  };
  update();
  return { update, dispose() { cleanup?.(); cleanup = undefined; } };
}

function missingSources(h, names, tenantId = h.bindings.myCompanyId) {
  const missing = new Set(names);
  h.render({ serverConfirmedCollectionState: { tenantId, collections: Object.fromEntries(
    h.bindings.LOYALTY_MAINTENANCE_COLLECTION_NAMES.map(name => [name, !missing.has(name)])
  ) } });
}

test('legacy FIFO, latest pending value, callback arity and size remain unchanged', async () => {
  const calls = [];
  const latest = Object.freeze({ reason: 'latest' });
  const { queue, timers } = harness({ run: function (key, value) { calls.push([key, value, arguments.length]); } });
  queue.enqueue('customer-a', 'old');
  queue.enqueue('customer-b', 'payment');
  queue.enqueue('customer-a', latest);
  assert.equal(queue.size, 2);
  assert.equal(timers.pending.size, 1);
  await timers.tick();
  assert.deepEqual(calls, [['customer-a', latest, 2]]);
  assert.strictEqual(calls[0][1], latest);
  assert.equal(queue.size, 1);
  assert.equal(timers.pending.size, 1);
  await timers.tick();
  assert.deepEqual(calls, [['customer-a', latest, 2], ['customer-b', 'payment', 2]]);
  assert.equal(queue.size, 0);
  assert.equal(timers.pending.size, 0);
});

test('default scheduler yields 250ms per job without requiring browser globals', async () => {
  const timers = fakeTimers();
  const source = readFileSync(new URL('../src/services/cooperativeTaskQueue.js', import.meta.url), 'utf8');
  const createQueue = vm.runInNewContext(`${source.replace('export function', 'function')}\ncreateCooperativeTaskQueue;`, {
    setTimeout: timers.schedule,
    clearTimeout: timers.cancel,
  });
  const calls = [];
  const queue = createQueue({ run: key => calls.push([key, timers.now]) });
  queue.enqueue('a', 1);
  queue.enqueue('b', 2);
  await timers.advance(249);
  assert.deepEqual(calls, []);
  await timers.advance(1);
  assert.deepEqual(calls, [['a', 250]]);
  await timers.advance(250);
  assert.deepEqual(calls, [['a', 250], ['b', 500]]);
  queue.enqueue('cancelled', 3);
  queue.dispose();
  assert.equal(timers.pending.size, 0);
});

test('active promises serialize jobs and retain the latest replacement for an active key', async () => {
  const first = deferred();
  const calls = [];
  const { queue, timers } = harness({ run: (key, value) => {
    calls.push([key, value]);
    if (calls.length === 1) return first.promise;
  } });
  queue.enqueue('a', 'active');
  queue.enqueue('b', 'old b');
  const running = timers.startNext();
  assert.equal(queue.size, 1, 'size counts only pending jobs');
  queue.enqueue('a', 'replacement 1');
  queue.enqueue('a', 'replacement 2');
  queue.enqueue('b', 'latest b');
  assert.equal(queue.size, 2);
  assert.equal(timers.pending.size, 0);
  first.resolve();
  await running.completion;
  assert.equal(timers.pending.size, 1);
  await timers.tick();
  await timers.tick();
  assert.deepEqual(calls, [['a', 'active'], ['b', 'latest b'], ['a', 'replacement 2']]);
  assert.equal(timers.pending.size, 0);
});

test('legacy pause predicates keep polling and resume without re-enqueueing work', async () => {
  let paused = true;
  const calls = [];
  const { queue, timers } = harness({ run: key => calls.push(key), isPaused: () => paused });
  queue.enqueue('a', 1);
  await timers.advance(1000);
  assert.deepEqual(calls, []);
  assert.equal(queue.size, 1);
  assert.equal(timers.pending.size, 1);
  paused = false;
  await timers.tick();
  assert.deepEqual(calls, ['a']);
  assert.equal(queue.size, 0);
  assert.equal(timers.pending.size, 0);
});

test('explicit pause cancels timers without polling or losing pending replacements', async () => {
  const calls = [];
  const { queue, timers } = harness({ run: (key, value) => calls.push([key, value]) });
  queue.enqueue('a', 'old');
  const obsolete = timers.pending.get(0).callback;
  queue.pause();
  queue.pause();
  queue.enqueue('a', 'latest');
  queue.enqueue('b', 'next');
  await timers.advance(1000000);
  await obsolete();
  assert.deepEqual(calls, []);
  assert.equal(queue.size, 2);
  assert.equal(timers.pending.size, 0);
  assert.deepEqual(timers.cancelled, [0], 'handle zero is cancelled exactly once');
  queue.resume();
  queue.resume();
  assert.equal(timers.pending.size, 1);
  await timers.tick();
  await timers.tick();
  assert.deepEqual(calls, [['a', 'latest'], ['b', 'next']]);
});

test('visibility and connectivity events park work and resume even without new data', async () => {
  const calls = [];
  const h = activityHarness((key, value) => calls.push([key, value]));
  h.queue.enqueue('backup', 'daily');
  h.state.visible = false;
  h.emit('visibilitychange');
  await h.timers.advance(10000);
  assert.equal(h.queue.size, 1);
  assert.equal(h.timers.pending.size, 0);
  h.state.online = false;
  h.state.visible = true;
  h.emit('visibilitychange');
  assert.equal(h.timers.pending.size, 0, 'visible but offline remains parked');
  h.state.online = true;
  h.emit('online');
  h.emit('online');
  assert.equal(h.timers.pending.size, 1);
  await h.timers.tick();
  assert.deepEqual(calls, [['backup', 'daily']]);
  h.queue.enqueue('loyalty', 'latest');
  h.state.online = false;
  h.emit('offline');
  assert.equal(h.timers.pending.size, 0);
  h.state.online = true;
  h.emit('online');
  await h.timers.tick();
  assert.deepEqual(calls, [['backup', 'daily'], ['loyalty', 'latest']]);
  h.dispose();
  h.emit('online');
  h.emit('input');
  assert.equal(h.timers.pending.size, 0);
});

test('typing refreshes the quiet window; focused editors and pending input defer admission', async () => {
  const calls = [];
  const h = activityHarness(key => calls.push([key, h.timers.now]));
  h.queue.enqueue('a', 1);
  h.emit('input');
  await h.timers.advance(750);
  h.emit('input');
  await h.timers.advance(750);
  assert.deepEqual(calls, []);
  h.state.focused = true;
  await h.timers.advance(500);
  assert.deepEqual(calls, [], 'quiet but still focused remains deferred');
  h.state.focused = false;
  h.state.inputPending = true;
  await h.timers.tick();
  assert.deepEqual(calls, []);
  h.state.inputPending = false;
  await h.timers.tick();
  assert.deepEqual(calls, [['a', 2500]]);
  assert.equal(h.queue.size, 0);
  h.dispose();
});

test('idle scheduler timeout callbacks still recheck input and visibility before running', async () => {
  const timers = fakeTimers();
  let paused = false;
  const calls = [];
  const queue = createCooperativeTaskQueue({
    run: key => calls.push(key),
    isPaused: () => paused,
    schedule: callback => timers.schedule(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 2500),
    cancel: timers.cancel,
  });
  queue.enqueue('backup', 1);
  paused = true;
  await timers.tick();
  assert.deepEqual(calls, []);
  assert.equal(queue.size, 1);
  paused = false;
  await timers.tick();
  assert.deepEqual(calls, ['backup']);
  assert.equal(timers.now, 5000);
});

test('pause/resume during an active job never overlaps work or strands its replacement', async () => {
  const first = deferred();
  const calls = [];
  const { queue, timers } = harness({ run: (key, value) => {
    calls.push([key, value]);
    return calls.length === 1 ? first.promise : undefined;
  } });
  queue.enqueue('a', 'active');
  const running = timers.startNext();
  queue.pause();
  queue.enqueue('a', 'latest');
  queue.enqueue('b', 2);
  first.resolve();
  await running.completion;
  assert.equal(timers.pending.size, 0);
  assert.equal(queue.size, 2);
  queue.resume();
  const replacement = timers.startNext();
  queue.pause();
  queue.resume();
  queue.resume();
  assert.equal(timers.pending.size, 0, 'resume while running waits for completion');
  await replacement.completion;
  await timers.tick();
  assert.deepEqual(calls, [['a', 'active'], ['a', 'latest'], ['b', 2]]);
});

test('stale cancelled callbacks cannot consume jobs or clear a replacement timer', async () => {
  const calls = [];
  const { queue, timers } = harness({ run: key => calls.push(key) });
  queue.enqueue('a', 1);
  const obsolete = timers.pending.get(0).callback;
  queue.pause();
  queue.resume();
  await obsolete();
  assert.equal(timers.pending.size, 1);
  assert.deepEqual(calls, []);
  assert.equal(queue.size, 1);
  await timers.tick();
  await obsolete();
  assert.deepEqual(calls, ['a']);
});

test('duplicate timer callbacks cannot start a second job while one promise is pending', async () => {
  const first = deferred();
  const calls = [];
  const { queue, timers } = harness({ run: key => {
    calls.push(key);
    return calls.length === 1 ? first.promise : undefined;
  } });
  queue.enqueue('a', 1);
  queue.enqueue('b', 2);
  const running = timers.startNext();
  await running.callback();
  assert.deepEqual(calls, ['a']);
  assert.equal(queue.size, 1);
  first.resolve();
  await running.completion;
  await running.callback();
  assert.equal(timers.pending.size, 1);
  await timers.tick();
  assert.deepEqual(calls, ['a', 'b']);
});

test('dispose is terminal and invalidates cancelled callbacks and pending work', async () => {
  const calls = [];
  const { queue, timers } = harness({ run: key => calls.push(key) });
  queue.enqueue('old tenant', 1);
  const obsolete = timers.pending.get(0).callback;
  queue.dispose();
  queue.dispose();
  queue.enqueue('ignored', 2);
  queue.pause();
  queue.resume();
  await obsolete();
  assert.deepEqual(calls, []);
  assert.equal(queue.size, 0);
  assert.equal(timers.pending.size, 0);
  assert.deepEqual(timers.cancelled, [0]);
});

test('tenant disposal drops pending work while active acknowledgements finish under caller guards', async () => {
  let tenant = 'old';
  const first = deferred();
  const acknowledgements = [];
  const uiUpdates = [];
  const old = harness({ run: async (key, value) => {
    await first.promise;
    acknowledgements.push(['old', key, value]);
    if (tenant === 'old') uiUpdates.push(['old', key]);
  } });
  old.queue.enqueue('same customer', 'old active');
  old.queue.enqueue('old pending', 2);
  const active = old.timers.startNext();
  tenant = 'new';
  old.queue.dispose();
  const current = harness({ run: (key, value) => uiUpdates.push(['new', key, value]) });
  current.queue.enqueue('same customer', 'new value');
  await current.timers.tick();
  first.resolve();
  await active.completion;
  old.queue.resume();
  old.queue.enqueue('old late enqueue', 3);
  assert.deepEqual(acknowledgements, [['old', 'same customer', 'old active']], 'active runs are not aborted');
  assert.deepEqual(uiUpdates, [['new', 'same customer', 'new value']]);
  assert.equal(old.queue.size, 0);
  assert.equal(old.timers.pending.size, 0);
});

test('sync throws and rejected jobs are reported once and do not starve subsequent work', async () => {
  const calls = [];
  const errors = [];
  const { queue, timers } = harness({
    run: key => {
      calls.push(key);
      if (key === 'throw') throw new Error('sync failure');
      if (key === 'reject') return Promise.reject(new Error('async failure'));
    },
    onError: function (error) { errors.push([error.message, arguments.length]); },
  });
  for (const key of ['throw', 'reject', 'ok']) queue.enqueue(key, 1);
  await timers.tick();
  await timers.tick();
  await timers.tick();
  assert.deepEqual(calls, ['throw', 'reject', 'ok']);
  assert.deepEqual(errors, [['sync failure', 1], ['async failure', 1]]);
  assert.equal(queue.size, 0);
});

test('throwing or rejecting error observers never reject scheduler callbacks or block progress', async () => {
  for (const onError of [() => { throw new Error('observer throw'); }, () => Promise.reject(new Error('observer rejection'))]) {
    const calls = [];
    const { queue, timers } = harness({ run: key => {
      calls.push(key);
      if (key === 'bad') throw new Error('job failure');
    }, onError });
    queue.enqueue('bad', 1);
    queue.enqueue('good', 2);
    await timers.tick();
    await timers.tick();
    assert.deepEqual(calls, ['bad', 'good']);
    assert.equal(timers.pending.size, 0);
  }
});

test('an async error observer does not hold the worker lock while waiting', async () => {
  const observer = deferred();
  const calls = [];
  const { queue, timers } = harness({ run: key => {
    calls.push(key);
    if (key === 'bad') throw new Error('job failure');
  }, onError: () => observer.promise });
  queue.enqueue('bad', 1);
  queue.enqueue('good', 2);
  await timers.tick();
  await timers.tick();
  observer.reject(new Error('late observer rejection'));
  await Promise.resolve();
  assert.deepEqual(calls, ['bad', 'good']);
});

test('pause predicate errors leave work pending and recover on the next scheduled check', async () => {
  let checks = 0;
  const calls = [];
  const errors = [];
  const { queue, timers } = harness({ run: key => calls.push(key),
    isPaused: () => { if (++checks === 1) throw new Error('predicate failure'); return false; },
    onError: error => errors.push(error.message),
  });
  queue.enqueue('a', 1);
  queue.enqueue('b', 2);
  await timers.tick();
  assert.deepEqual(calls, []);
  assert.equal(queue.size, 2);
  assert.equal(timers.pending.size, 1);
  await timers.tick();
  await timers.tick();
  assert.deepEqual(calls, ['a', 'b']);
  assert.deepEqual(errors, ['predicate failure']);
});

test('pause or disposal inside the admission predicate prevents the selected job from starting', async () => {
  for (const action of ['pause', 'dispose']) {
    const calls = [];
    let firstCheck = true;
    const { queue, timers } = harness({ run: key => calls.push(key), isPaused: () => {
      if (firstCheck) { firstCheck = false; queue[action](); }
      return false;
    } });
    queue.enqueue('a', 1);
    await timers.tick();
    assert.deepEqual(calls, []);
    assert.equal(timers.pending.size, 0);
    assert.equal(queue.size, action === 'pause' ? 1 : 0);
    queue.resume();
    if (action === 'pause') { await timers.tick(); assert.deepEqual(calls, ['a']); }
    else assert.equal(timers.pending.size, 0);
  }
});

test('scheduler exceptions still reach the caller but leave pending work recoverable', async () => {
  const timers = fakeTimers();
  let fail = true;
  const calls = [];
  const queue = createCooperativeTaskQueue({ run: (key, value) => calls.push([key, value]),
    schedule: callback => { if (fail) throw new Error('schedule failed'); return timers.schedule(callback); },
    cancel: timers.cancel,
  });
  assert.throws(() => queue.enqueue('a', 'old'), /schedule failed/);
  assert.equal(queue.size, 1);
  fail = false;
  queue.enqueue('a', 'latest');
  queue.resume();
  await timers.tick();
  assert.deepEqual(calls, [['a', 'latest']]);
});

test('retry decisions belong to callers and an explicit retry retains queued newer work', async () => {
  const calls = [];
  let failed = false;
  const { queue, timers } = harness({ run: (key, value) => {
    calls.push([key, value]);
    if (!failed) {
      failed = true;
      queue.enqueue(key, 'newer');
      throw new Error('retryable');
    }
  }, onError: () => queue.resume() });
  queue.enqueue('a', 'old');
  queue.enqueue('b', 'next');
  await timers.tick();
  await timers.tick();
  await timers.tick();
  assert.deepEqual(calls, [['a', 'old'], ['b', 'next'], ['a', 'newer']]);
  assert.equal(queue.size, 0);
});

test('critical saves execute directly while maintenance is parked or awaiting acknowledgement', async () => {
  const first = deferred();
  const calls = [];
  const { queue, timers } = harness({ run: async key => {
    calls.push(key);
    await first.promise;
  } });
  const criticalSave = async value => { calls.push(value); return { confirmed: true }; };
  queue.pause();
  queue.enqueue('maintenance', 1);
  assert.deepEqual(await criticalSave('save while paused'), { confirmed: true });
  queue.resume();
  const active = timers.startNext();
  assert.deepEqual(await criticalSave('save while active'), { confirmed: true });
  first.resolve();
  await active.completion;
  assert.deepEqual(calls, ['save while paused', 'maintenance', 'save while active']);
});

test('App scheduler factory actually invokes fallback/native idle callbacks and cancels both phases', async () => {
  for (const idle of [false, true]) {
    const h = appHarness({ idle });
    let ran = 0;
    h.bindings.scheduleMaintenanceWork(() => { ran++; });
    await h.timers.advance(499);
    assert.equal(ran, 0);
    await h.timers.advance(1);
    assert.equal(ran, 0, '500ms eligibility delay is followed by an idle callback');
    await h.timers.advance(idle ? 50 : 1200);
    assert.equal(ran, 1, 'returned idle scheduler is actually invoked');
    const beforeTimer = h.bindings.scheduleMaintenanceWork(() => { ran++; });
    h.bindings.cancelMaintenanceWork(beforeTimer);
    const beforeIdle = h.bindings.scheduleMaintenanceWork(() => { ran++; });
    await h.timers.advance(500);
    h.bindings.cancelMaintenanceWork(beforeIdle);
    await h.timers.advance(3000);
    assert.equal(ran, 1);
    assert.equal(h.timers.pending.size, 0);
  }
});

test('App defers/coalesces fingerprint scans, keeps latest render callbacks, and resyncs edited fields', async () => {
  const h = appHarness();
  const cleanup = h.startLoyalty();
  h.enqueueFingerprint();
  h.enqueueFingerprint();
  h.enqueueFingerprint();
  assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 1);
  assert.equal(h.bindings.loyaltyEligibilitySyncPrimedRef.current, false, 'no fingerprint scan runs in the enqueue effect');
  await h.timers.advance(1700);
  assert.equal(h.bindings.loyaltyEligibilitySyncPrimedRef.current, true);
  assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 2);
  assert.deepEqual(h.calls, []);
  h.render({ orders: [{ id: 'o1', customerId: 'c1', finalTotal: 99 }, { id: 'o2', customerId: 'c2', finalTotal: 20 }],
    syncCustomerLoyaltyPoints: (key, options) => h.calls.push(['latest', key, options.reason]),
  });
  h.enqueueFingerprint();
  await h.timers.advance(1700 * 4);
  assert.deepEqual(h.calls, [
    ['latest', 'c1', 'eligibility_policy_sync'], ['latest', 'c2', 'eligibility_policy_sync'], ['latest', 'c1', 'eligibility_sync'],
  ]);
  assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 0);
  cleanup();
});

test('App readiness, warehouse entry, editable focus and recent input defer rather than discard loyalty work', async () => {
  const h = appHarness();
  h.bindings.serverConfirmedCollectionState.collections.customer_points = false;
  h.render();
  const cleanup = h.startLoyalty();
  h.enqueueFingerprint();
  await h.timers.advance(1700);
  assert.equal(h.bindings.loyaltyEligibilitySyncPrimedRef.current, false);
  h.bindings.serverConfirmedCollectionState.collections.customer_points = true;
  h.render({ activeTab: 'warehouse_dispatch' });
  await h.timers.advance(1700);
  assert.equal(h.bindings.loyaltyEligibilitySyncPrimedRef.current, false);
  h.render({ activeTab: 'orders' });
  h.document.activeElement = { matches: selector => { assert.match(selector, /textarea/); return true; } };
  await h.timers.advance(1700);
  assert.equal(h.bindings.loyaltyEligibilitySyncPrimedRef.current, false);
  h.document.activeElement = null;
  await h.timers.advance(1699);
  h.browser.dispatchEvent(new Event('input'));
  await h.timers.advance(1);
  assert.equal(h.bindings.loyaltyEligibilitySyncPrimedRef.current, false, 'interaction immediately before idle admission still pauses');
  await h.timers.advance(1700 * 3);
  assert.deepEqual(h.calls.map(call => call[1]), ['c1', 'c2']);
  const lastInput = h.bindings.loyaltyActivityRef.current.lastInputAt;
  cleanup();
  h.browser.dispatchEvent(new Event('input'));
  assert.equal(h.bindings.loyaltyActivityRef.current.lastInputAt, lastInput, 'cleanup removes activity listeners');
});

test('App hidden/offline work resumes with no new data effect and cleanup invalidates late callbacks', async () => {
  const h = appHarness();
  const cleanup = h.startLoyalty();
  h.enqueueFingerprint();
  const obsolete = [...h.timers.pending.values()][0].callback;
  h.visibility('hidden');
  await h.timers.advance(10000);
  assert.equal(h.timers.pending.size, 0);
  assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 1);
  h.online(false);
  h.visibility('visible');
  await h.timers.advance(1700);
  assert.deepEqual(h.calls, []);
  assert.equal(h.timers.pending.size, 0, 'visible/offline work stays parked without polling');
  h.online(true);
  await h.timers.advance(1700 * 3);
  assert.deepEqual(h.calls.map(call => call[1]), ['c1', 'c2']);
  cleanup();
  obsolete();
  await h.timers.advance(2000);
  h.visibility('visible');
  assert.equal(h.bindings.loyaltyMaintenanceRef.current, null);
  assert.equal(h.timers.pending.size, 0);
  assert.equal(h.document.listeners.size, 0);
  h.online(false);
  h.online(true);
  assert.equal(h.timers.pending.size, 0, 'cleanup removes online/offline listeners');
});

test('App offline events cancel scheduled maintenance and reconnection waits for visibility', async () => {
  for (const elapsed of [0, 500]) {
    const h = appHarness();
    const cleanup = h.startLoyalty();
    h.enqueueFingerprint();
    await h.timers.advance(elapsed);
    assert.equal(h.timers.pending.size, 1);
    h.online(false);
    await h.timers.advance(10000);
    assert.equal(h.timers.pending.size, 0, 'offline cancels either scheduler phase and never polls');
    assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 1);
    assert.equal(h.bindings.loyaltyEligibilitySyncPrimedRef.current, false);
    h.visibility('hidden');
    h.online(true);
    h.online(true);
    await h.timers.advance(10000);
    assert.equal(h.timers.pending.size, 0, 'online while hidden does not resume');
    h.visibility('visible');
    assert.equal(h.timers.pending.size, 1);
    await h.timers.advance(1700 * 3);
    assert.deepEqual(h.calls.map(call => call[1]), ['c1', 'c2']);
    cleanup();
    h.online(false);
    h.online(true);
    h.visibility('visible');
    assert.equal(h.timers.pending.size, 0);
    assert.equal(h.browser.listeners.size, 0);
    assert.equal(h.document.listeners.size, 0);
  }
});

test('App disabled loyalty parks work; re-enabled policy resumes and reports errors without losing other keys', async () => {
  const h = appHarness();
  const cleanup = h.startLoyalty();
  h.enqueueFingerprint();
  h.render({ currentCompany: { enabled: false } });
  h.enqueueFingerprint();
  await h.timers.advance(1700);
  assert.deepEqual(h.calls, []);
  assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 1);
  h.render({ currentCompany: { enabled: true }, syncCustomerLoyaltyPoints: key => {
    h.calls.push(['attempt', key]);
    if (key === 'c1') throw new Error('customer failure');
  } });
  await h.timers.advance(1700 * 3);
  assert.deepEqual(h.calls, [['attempt', 'c1'], ['attempt', 'c2']]);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0][1].message, 'customer failure');
  cleanup();
});

test('App delayed backup uses latest callback, parks hidden/offline, and yields to pending loyalty work', async () => {
  const h = appHarness();
  const cleanupLoyalty = h.startLoyalty();
  const cleanupBackup = h.startBackup();
  const backupQueue = h.queues.at(-1);
  assert.equal(h.bindings.AUTO_BACKUP_DELAY_MS, 45000);
  h.visibility('hidden');
  await h.timers.advance(45000);
  assert.equal(backupQueue.size, 1);
  assert.deepEqual(h.calls, []);
  h.render({ handleRunDailyAutoBackup: () => h.calls.push(['latest backup']) });
  h.online(false);
  h.visibility('visible');
  await h.timers.advance(1700);
  assert.deepEqual(h.calls, []);
  assert.equal(h.timers.pending.size, 0, 'offline backup remains parked without polling');
  assert.equal(backupQueue.size, 1);
  h.online(true);
  const loyaltyQueue = h.bindings.loyaltyMaintenanceRef.current;
  loyaltyQueue.pause();
  loyaltyQueue.enqueue('c1', 'eligibility_sync');
  await h.timers.advance(1700);
  assert.deepEqual(h.calls, [], 'backup yields while higher-priority maintenance is pending');
  loyaltyQueue.resume();
  await h.timers.advance(1700 * 2);
  assert.deepEqual(h.calls, [['loyalty', 'c1', 'eligibility_sync'], ['latest backup']]);
  assert.equal(h.bindings.autoBackupInFlightRef.current.size, 0);
  cleanupBackup();
  cleanupLoyalty();
});

test('App backup admission is rechecked during typing and preserves its original delay', async () => {
  const h = appHarness();
  const cleanupLoyalty = h.startLoyalty();
  const cleanupBackup = h.startBackup();
  await h.timers.advance(44999);
  assert.deepEqual(h.calls, []);
  await h.timers.advance(1);
  h.document.activeElement = { matches: () => true };
  await h.timers.advance(1700);
  assert.deepEqual(h.calls, []);
  h.document.activeElement = null;
  await h.timers.advance(1699);
  h.browser.dispatchEvent(new Event('keydown'));
  await h.timers.advance(1);
  assert.deepEqual(h.calls, []);
  await h.timers.advance(1700);
  assert.deepEqual(h.calls, [['backup']]);
  cleanupBackup();
  cleanupLoyalty();
});

test('App disabled loyalty cannot starve backup and its parked scan resumes after re-enablement', async () => {
  const h = appHarness();
  const cleanupLoyalty = h.startLoyalty();
  h.enqueueFingerprint();
  h.render({ currentCompany: { enabled: false } });
  h.enqueueFingerprint();
  assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 1);
  const cleanupBackup = h.startBackup();
  await h.timers.advance(45000 + 1700);
  assert.deepEqual(h.calls, [['backup']], 'disabled pending loyalty work must not block backup');
  assert.equal(h.bindings.loyaltyMaintenanceRef.current.size, 1, 'parked reconciliation is retained');
  h.render({ currentCompany: { enabled: true } });
  await h.timers.advance(1700 * 3);
  assert.deepEqual(h.calls, [
    ['backup'], ['loyalty', 'c1', 'eligibility_policy_sync'], ['loyalty', 'c2', 'eligibility_policy_sync'],
  ]);
  cleanupBackup();
  cleanupLoyalty();
});

test('App tenant guards and cleanup stop old queued callbacks from using new tenant refs', async () => {
  const h = appHarness();
  const cleanupLoyalty = h.startLoyalty();
  const cleanupBackup = h.startBackup();
  h.enqueueFingerprint();
  h.bindings.activeTenantScopeRef.current = 'tenant-b';
  h.render({ myCompanyId: 'tenant-b', syncCustomerLoyaltyPoints: () => h.calls.push(['new tenant loyalty']),
    handleRunDailyAutoBackup: () => h.calls.push(['new tenant backup']) });
  await h.timers.advance(45000 + 1700);
  assert.deepEqual(h.calls, [], 'old queues reject new tenant callback refs');
  cleanupBackup();
  cleanupLoyalty();
  h.visibility('visible');
  assert.equal(h.timers.pending.size, 0);
  assert.equal(h.bindings.loyaltyMaintenanceRef.current, null);
  assert.equal(h.document.listeners.size, 0);
});

test('App backup failures clear in-flight flags; completed/manual states skip scheduling', async () => {
  const h = appHarness();
  h.render({ handleRunDailyAutoBackup: () => { throw new Error('backup failure'); } });
  const cleanup = h.startBackup();
  await h.timers.advance(45000 + 1700);
  const key = 'tenant-a:2026-10-03';
  assert.equal(h.states.get(key).status, 'failed');
  assert.equal(h.states.get(key).message, 'backup failure');
  assert.equal(h.bindings.autoBackupInFlightRef.current.size, 0);
  cleanup();
  for (const status of ['saved', 'manual_required']) {
    h.states.set(key, { status });
    assert.equal(h.startBackup(), undefined);
    assert.equal(h.timers.pending.size, 0);
  }
  h.states.delete(key);
  h.render({ activeTab: 'warehouse_dispatch' });
  assert.equal(h.startBackup(), undefined);
  h.render({ activeTab: 'orders', firebaseUser: null });
  assert.equal(h.startBackup(), undefined);
});

test('App web automatic backup returns manual_required without triggering a file download', async () => {
  const h = appHarness();
  let reads = 0;
  const bindings = { ...h.bindings,
    handleCreateCompanyBackup: async options => {
      assert.deepEqual(options, { background: true });
      reads++;
      return { success: true, backup: { collections: { orders: [] } }, filename: 'company.json', count: 0 };
    },
    buildBackupFilename: () => 'company.json',
    Filesystem: { writeFile: () => { throw new Error('native file writes must not run on web'); } },
  };
  bindings.saveAutomaticBackupFile = appRuntime.declaration('saveAutomaticBackupFile', bindings);
  const run = appRuntime.declaration('handleRunDailyAutoBackup', bindings);
  const result = await run();
  assert.equal(result.status, 'manual_required');
  assert.equal(result.success, false);
  assert.equal(result.filename, 'auto-company.json');
  assert.equal(h.states.get('tenant-a:2026-10-03').status, 'manual_required');
  await run();
  assert.equal(reads, 1, 'terminal daily state skips duplicate reads');
});

test('App automatic backup rejects late tenant acknowledgements before saving or recording their result', async () => {
  for (const result of [
    { success: true, backup: { collections: { orders: [] } }, filename: 'company.json', count: 0 },
    { success: false, message: 'old tenant read failed' },
  ]) {
    const h = appHarness();
    const pending = deferred();
    let reads = 0;
    let saves = 0;
    const bindings = { ...h.bindings,
      handleCreateCompanyBackup: options => {
        assert.deepEqual(options, { background: true });
        reads++;
        return pending.promise;
      },
      saveAutomaticBackupFile: () => { saves++; throw new Error('obsolete tenant must not save'); },
      buildBackupFilename: () => 'company.json',
    };
    const run = appRuntime.declaration('handleRunDailyAutoBackup', bindings);
    const completion = run();
    const rejected = assert.rejects(completion, { name: 'AbortError' });
    h.bindings.activeTenantScopeRef.current = 'tenant-b';
    pending.resolve(result);
    await rejected;
    assert.equal(reads, 1);
    assert.equal(saves, 0);
    assert.equal(h.states.size, 0, 'neither obsolete success nor failure records a daily result');
  }
});

test('App home/customers missing-source reads unblock loyalty without visiting another module', async () => {
  for (const activeTab of ['home', 'customers']) {
    const h = appHarness();
    h.render({ activeTab });
    const foreground = appRuntime.declaration('FOREGROUND_REALTIME_COLLECTIONS_BY_TAB', h.bindings)[activeTab];
    const missing = h.bindings.LOYALTY_MAINTENANCE_COLLECTION_NAMES.filter(name => !foreground.includes(name));
    assert.deepEqual(missing, activeTab === 'home' ? ['orderRequests', 'customer_points'] : ['orderRequests']);
    missingSources(h, missing);
    const cleanupLoyalty = h.startLoyalty();
    h.enqueueFingerprint();
    const reads = [];
    let sources;
    h.bindings.forceRefreshCollectionRef.current = async (name, options) => {
      reads.push([name, options]);
      assert.equal(h.bindings.loyaltyActivityRef.current.ready, false);
      assert.deepEqual(h.calls, [], 'no loyalty writes before every source is confirmed');
      // Confirmation arrives separately from the refresh acknowledgement, as in App's batched marks.
      h.timers.schedule(() => {
        const state = h.bindings.serverConfirmedCollectionState;
        h.render({ serverConfirmedCollectionState: {
          tenantId: state.tenantId, collections: { ...state.collections, [name]: true },
        } });
        sources.update();
      }, 40);
      return true;
    };
    sources = mountSourceEffect(h);
    await h.timers.advance(10000);
    assert.deepEqual(reads, missing.map(name => [name, { serverOnly: true }]));
    assert.equal(h.bindings.loyaltyActivityRef.current.ready, true, 'confirmed empty source arrays are ready');
    assert.equal(h.bindings.activeTab, activeTab);
    assert.deepEqual(h.calls, [
      ['loyalty', 'c1', 'eligibility_policy_sync'], ['loyalty', 'c2', 'eligibility_policy_sync'],
    ]);
    sources.dispose();
    cleanupLoyalty();
    assert.equal(h.timers.pending.size, 0);
    assert.equal(h.document.listeners.size, 0);
    assert.equal(h.browser.listeners.size, 0);
  }
});

test('App missing-source effect gates admission by session, settings, warehouse and actual missing names', () => {
  for (const patch of [
    { firebaseUser: null }, { myCompanyId: '' }, { currentCompany: { enabled: false } },
    { activeTab: 'warehouse_dispatch' },
  ]) {
    const h = appHarness();
    missingSources(h, ['customer_points']);
    h.render(patch);
    assert.equal(h.startSources(), undefined);
    assert.equal(h.queues.length, 0);
    assert.equal(h.timers.pending.size, 0);
    assert.equal(h.document.listeners.size, 0);
    assert.equal(h.browser.listeners.size, 0);
  }
  const h = appHarness();
  assert.equal(h.startSources(), undefined, 'all server-confirmed sources need no reads');
  missingSources(h, [], 'previous-tenant');
  assert.equal(h.bindings.loyaltyActivityRef.current.ready, false);
  assert.deepEqual(h.bindings.loyaltyMissingCollectionNames, h.bindings.LOYALTY_MAINTENANCE_COLLECTION_NAMES,
    'previous tenant confirmation cannot satisfy any current tenant source');
  const cleanup = h.startSources();
  assert.equal(h.queues[0].size, 6);
  cleanup();
});

test('App forceRefresh acknowledgements are not server confirmation and preserve server-only read options', async () => {
  const h = appHarness();
  missingSources(h, ['customer_points']);
  const reads = [];
  const setter = () => {};
  const parser = value => value;
  const bindings = {
    cancelled: false,
    activeRealtimeCollectionsRef: { current: new Set() },
    hasActiveRealtimeListener: (names, name) => names.has(name),
    collectionBindingMap: new Map([['customer_points', ['customer_points', setter, false, parser]]]),
    readCollection: async (...args) => { reads.push(args); },
  };
  const refresh = appRuntime.forceRefresh(bindings);
  assert.equal(await refresh('customer_points', { serverOnly: true }), true);
  assert.deepEqual(reads, [['customer_points', setter, false, parser, { force: true, serverOnly: true }]]);
  bindings.activeRealtimeCollectionsRef.current.add('customer_points');
  assert.equal(await refresh('customer_points', { serverOnly: true }), true);
  assert.equal(reads.length, 1, 'active listener acknowledgement does not invoke another read');
  assert.equal(await refresh('missing-binding', { serverOnly: true }), false);
  assert.equal(await appRuntime.forceRefresh({ ...bindings, cancelled: true })('customer_points'), false);
  assert.equal(h.bindings.loyaltyActivityRef.current.ready, false);
  h.bindings.forceRefreshCollectionRef.current = refresh;
  const cleanup = h.startSources();
  await h.timers.advance(1700);
  assert.equal(h.bindings.loyaltyActivityRef.current.ready, false, 'an acknowledged listener still needs its server mark');
  assert.equal(h.timers.pending.size, 1, 'unconfirmed acknowledgement schedules a retry');
  cleanup();
  assert.equal(h.timers.pending.size, 0);
});

test('App unconfirmed refreshes retry from five seconds exponentially up to five minutes without dropping work', async () => {
  const h = appHarness();
  missingSources(h, ['customer_points']);
  const reads = [];
  h.bindings.forceRefreshCollectionRef.current = async (name, options) => {
    reads.push([name, options, h.timers.now]);
    if (reads.length === 3) throw new Error('transient source failure');
    return reads.length % 2 === 0;
  };
  const cleanup = h.startSources();
  await h.timers.advance(1700);
  assert.equal(reads.length, 1);
  for (const [index, delay] of [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000].entries()) {
    assert.equal(h.timers.pending.size, 1, 'one retry timer per unconfirmed source');
    assert.equal([...h.timers.pending.values()][0].time - h.timers.now, delay);
    await h.timers.advance(delay - 1);
    assert.equal(reads.length, index + 1);
    await h.timers.advance(1 + 1699);
    assert.equal(reads.length, index + 1, 'retry still waits for delayed idle admission');
    await h.timers.advance(1);
    assert.equal(reads.length, index + 2);
  }
  assert.ok(reads.every(([name, options]) => name === 'customer_points' && options.serverOnly === true));
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0][1].message, 'transient source failure');
  assert.equal(h.bindings.loyaltyActivityRef.current.ready, false, 'true, false and errors never fabricate readiness');
  cleanup();
  assert.equal(h.timers.pending.size, 0);
});

test('App missing-source reads explicitly park offline/hidden with no polling and resume only online plus visible', async () => {
  const h = appHarness();
  missingSources(h, ['orderRequests', 'customer_points']);
  const reads = [];
  h.bindings.forceRefreshCollectionRef.current = async name => { reads.push(name); };
  h.online(false);
  const cleanup = h.startSources();
  assert.equal(h.queues[0].size, 2);
  assert.equal(h.timers.pending.size, 0);
  await h.timers.advance(600000);
  h.visibility('visible');
  assert.equal(h.timers.pending.size, 0, 'visibility cannot resume while offline');
  h.visibility('hidden');
  h.online(true);
  assert.equal(h.timers.pending.size, 0, 'online cannot resume while hidden');
  h.visibility('visible');
  await h.timers.advance(1700);
  assert.deepEqual(reads, ['orderRequests']);
  h.online(false);
  await h.timers.advance(600000);
  assert.deepEqual(reads, ['orderRequests']);
  assert.equal(h.timers.pending.size, 0, 'existing backoff expires once into the parked queue, without polling');
  assert.equal(h.queues[0].size, 2);
  h.online(true);
  await h.timers.advance(3400);
  assert.deepEqual(reads, ['orderRequests', 'customer_points', 'orderRequests']);
  cleanup();
  assert.equal(h.timers.pending.size, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.browser.listeners.size, 0);
});

test('App source admission shares focused-editor/input cooldown while deliberately ignoring reconciliation readiness', async () => {
  const h = appHarness();
  missingSources(h, ['customer_points']);
  const reads = [];
  h.bindings.forceRefreshCollectionRef.current = async name => { reads.push(name); };
  const cleanupLoyalty = h.startLoyalty();
  const cleanupSources = h.startSources();
  h.document.activeElement = { matches: selector => {
    assert.equal(selector, 'input, textarea, select, [contenteditable="true"]');
    return true;
  } };
  await h.timers.advance(1700);
  assert.deepEqual(reads, []);
  h.document.activeElement = null;
  await h.timers.advance(1699);
  h.browser.dispatchEvent(new Event('input'));
  await h.timers.advance(1);
  assert.deepEqual(reads, [], 'recent input is rechecked at admission');
  await h.timers.advance(1700);
  assert.deepEqual(reads, ['customer_points']);
  assert.equal(h.bindings.loyaltyActivityRef.current.ready, false, 'the loading queue must not require its own output');
  cleanupSources();
  cleanupLoyalty();
});

test('App unchanged missing key coalesces renders and rechecks latest callbacks/confirmation before reading', async () => {
  const h = appHarness();
  missingSources(h, ['orderRequests', 'customer_points']);
  h.bindings.forceRefreshCollectionRef.current = () => { throw new Error('obsolete refresh'); };
  const sources = mountSourceEffect(h);
  for (let i = 0; i < 4; i++) {
    h.render({ orders: [...h.bindings.orders] });
    sources.update();
  }
  assert.equal(h.queues.length, 1);
  assert.equal(h.queues[0].size, 2);
  const reads = [];
  h.bindings.forceRefreshCollectionRef.current = async name => { reads.push(name); };
  // Simulate a listener's render before passive-effect cleanup: the queued read must use the live Set.
  missingSources(h, ['customer_points']);
  await h.timers.advance(3400);
  assert.deepEqual(reads, ['customer_points']);
  assert.equal(h.errors.length, 0);
  missingSources(h, []);
  sources.update();
  assert.equal(h.timers.pending.size, 0, 'confirmation cleanup cancels obsolete backoff');
  await h.timers.advance(600000);
  assert.deepEqual(reads, ['customer_points']);
  sources.dispose();
});

test('App source failures do not lose other names; active reads serialize and disposal prevents late retries', async () => {
  const h = appHarness();
  missingSources(h, ['orderRequests', 'customer_points']);
  const first = deferred();
  const reads = [];
  h.bindings.forceRefreshCollectionRef.current = name => {
    reads.push(name);
    return reads.length === 1 ? first.promise : Promise.resolve(true);
  };
  const cleanup = h.startSources();
  await h.timers.tick();
  const active = h.timers.startNext();
  assert.deepEqual(reads, ['orderRequests']);
  assert.equal(h.timers.pending.size, 0);
  assert.equal(h.queues[0].size, 1);
  h.online(false);
  h.online(true);
  assert.equal(h.timers.pending.size, 0, 'resume cannot overlap the active read');
  first.reject(new Error('source read failed'));
  await active.completion;
  await h.timers.advance(1700);
  assert.deepEqual(reads, ['orderRequests', 'customer_points']);
  assert.equal(h.errors.length, 1);
  cleanup();
  await h.timers.advance(600000);
  assert.deepEqual(reads, ['orderRequests', 'customer_points']);
  assert.equal(h.timers.pending.size, 0);
});

test('App source tenant cleanup drops queued old reads and suppresses retry after an already-active read completes', async () => {
  const h = appHarness();
  missingSources(h, ['orderRequests', 'customer_points']);
  const first = deferred();
  const reads = [];
  h.bindings.forceRefreshCollectionRef.current = name => { reads.push(['tenant-a', name]); return first.promise; };
  const sources = mountSourceEffect(h);
  await h.timers.tick();
  const active = h.timers.startNext();
  h.bindings.activeTenantScopeRef.current = 'tenant-b';
  h.render({ myCompanyId: 'tenant-b' });
  assert.deepEqual(h.bindings.loyaltyMissingCollectionNames, h.bindings.LOYALTY_MAINTENANCE_COLLECTION_NAMES);
  h.bindings.forceRefreshCollectionRef.current = async name => { reads.push(['tenant-b', name]); };
  sources.update();
  first.resolve(true);
  await active.completion;
  assert.equal(h.queues[0].size, 0);
  assert.equal(h.timers.pending.size, 1, 'only the replacement tenant scheduler remains, not an old retry');
  await h.timers.advance(1700 * 6);
  assert.deepEqual(reads, [['tenant-a', 'orderRequests'],
    ...h.bindings.LOYALTY_MAINTENANCE_COLLECTION_NAMES.map(name => ['tenant-b', name])]);
  sources.dispose();
  await h.timers.advance(600000);
  assert.equal(h.timers.pending.size, 0);
  assert.equal(h.browser.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);
});

test('App source gate changes dispose pending/retry work and re-enablement loads retained missing sources', async () => {
  for (const patch of [{ currentCompany: { enabled: false } }, { activeTab: 'warehouse_dispatch' }]) {
    const h = appHarness();
    missingSources(h, ['customer_points']);
    const reads = [];
    h.bindings.forceRefreshCollectionRef.current = async name => { reads.push(name); };
    const sources = mountSourceEffect(h);
    await h.timers.advance(1700);
    assert.deepEqual(reads, ['customer_points']);
    h.render(patch);
    sources.update();
    assert.equal(h.timers.pending.size, 0);
    await h.timers.advance(600000);
    assert.deepEqual(reads, ['customer_points']);
    h.render({ currentCompany: { enabled: true }, activeTab: 'home' });
    sources.update();
    await h.timers.advance(1700);
    assert.deepEqual(reads, ['customer_points', 'customer_points']);
    sources.dispose();
    assert.equal(h.timers.pending.size, 0);
  }
});
