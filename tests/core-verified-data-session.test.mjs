import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVerifiedDataSession, getVerifiedDataSessionKey } from '../src/data/verifiedDataSession.js';

const scope = Object.freeze({ principalId: 'actor-a', tenantId: 'tenant-a', permissionRevision: 'permissions-1', sessionId: 'login-1' });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const page = value => ({ items: [{ id: 'row', companyId: scope.tenantId, value }], hasMore: false,
  nextCursor: null, source: 'server', coverage: 'all-query-matches' });
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// Exercise the actual hook module with a deterministic effect/ref dispatcher.
// No bundler, DOM, Firebase initialization, auth, or network is involved. This
// models cleanup/setup replay; it is not a browser/React renderer acceptance test.
const reactUrl = dataModule(`
let active;
export function useRef(initial) {
  const index = active.index++;
  return active.refs[index] ??= {current: initial};
}
export function useEffect(setup, dependencies) {
  const index = active.index++, old = active.effects[index];
  if (!old || dependencies.some((value, i) => !Object.is(value, old.dependencies[i]))) {
    active.effects[index] = {setup, dependencies, cleanup: old?.cleanup, pending: true};
  }
}
export function createHarness() {
  const state = {refs: [], effects: [], index: 0};
  return {
    render(callback) { active = state; state.index = 0; try { return callback(); } finally { active = null; } },
    commit() { for (const effect of state.effects) if (effect?.pending) {
      effect.cleanup?.(); effect.cleanup = effect.setup(); effect.pending = false;
    } },
    replay() { for (const effect of state.effects) if (effect) { effect.cleanup?.(); effect.cleanup = effect.setup(); } },
    unmount() { for (const effect of state.effects) effect?.cleanup?.(); },
  };
}`);
const { createHarness } = await import(reactUrl);
const hookSource = (await readFile(new URL('../src/data/useInstantDataEngine.js', import.meta.url), 'utf8'))
  .replace("from 'react'", `from '${reactUrl}'`)
  .replace("from './instantDataEngine.js'", `from '${new URL('../src/data/instantDataEngine.js', import.meta.url).href}'`)
  .replace("from './verifiedDataSession.js'", `from '${new URL('../src/data/verifiedDataSession.js', import.meta.url).href}'`)
  .replace("from '../services/adaptivePerformance.js'", `from '${new URL('../src/services/adaptivePerformance.js', import.meta.url).href}'`);
const { useInstantDataEngine } = await import(dataModule(hookSource));
const transport = () => ({ readPage: async () => page('current') });

test('all four verified strings are required, uid is an alias, and input is never repaired or mutated', () => {
  for (const field of Object.keys(scope)) {
    for (const value of [undefined, null, '', '   ', 1, {}, false]) {
      assert.throws(() => createVerifiedDataSession({ ...scope, [field]: value }), TypeError);
      assert.throws(() => getVerifiedDataSessionKey({ ...scope, [field]: value }), TypeError);
    }
  }
  for (const value of [undefined, null, 'cached-user']) assert.throws(() => createVerifiedDataSession(value), TypeError);
  const { principalId, ...rest } = scope;
  const session = createVerifiedDataSession({ ...rest, uid: principalId });
  assert.deepEqual(session.scope, scope);
  assert.throws(() => createVerifiedDataSession({ ...scope, uid: 'other' }), /Conflicting/);
  assert.equal(scope.sessionId, 'login-1');
  assert.ok(Object.isFrozen(session.scope));
  assert.ok(Object.isFrozen(session.getSnapshot()));
  assert.equal(session.isCurrent({ ...scope, sessionId: undefined }), false);
  session.close();
});

test('session keys isolate principal, tenant, permissions and same-UID relogin without delimiter collisions', () => {
  const key = getVerifiedDataSessionKey(scope);
  for (const field of Object.keys(scope)) {
    assert.notEqual(getVerifiedDataSessionKey({ ...scope, [field]: `${scope[field]}:next` }), key);
  }
  assert.notEqual(getVerifiedDataSessionKey({ ...scope, principalId: 'a|b', tenantId: 'c' }),
    getVerifiedDataSessionKey({ ...scope, principalId: 'a', tenantId: 'b|c' }));
  assert.equal(getVerifiedDataSessionKey({ sessionId: scope.sessionId, ...scope }), key);
});

test('closing is immediately observable, idempotent and cannot be blocked by a subscriber', () => {
  let cleanup = 0, observed = 0;
  const session = createVerifiedDataSession(scope, { onClose: () => {
    cleanup++;
    assert.equal(session.getSnapshot().closed, true);
    assert.equal(session.isCurrent(), false);
  } });
  const initial = session.getSnapshot();
  assert.equal(initial, session.getSnapshot());
  session.subscribe(() => { throw Error('observer failure'); });
  const remove = session.subscribe(() => { observed += 100; });
  remove();
  session.subscribe(() => { observed++; assert.equal(session.getSnapshot().closed, true); });
  session.close();
  const closed = session.getSnapshot();
  session.close();
  assert.notEqual(initial, closed);
  assert.equal(closed, session.getSnapshot());
  assert.equal(cleanup, 1);
  assert.equal(observed, 1);
  assert.throws(() => session.retain(), { code: 'cancelled' });
});

test('effect cleanup/setup replay retains one owner; duplicate release cannot close a retained owner', async () => {
  let closes = 0;
  const session = createVerifiedDataSession(scope, { onClose: () => closes++ });
  const release = session.retain();
  release(); release();
  const finalRelease = session.retain();
  await tick();
  assert.equal(session.isCurrent(), true);
  assert.equal(closes, 0);
  finalRelease();
  await tick();
  assert.equal(session.getSnapshot().closed, true);
  assert.equal(closes, 1);
});

test('hook requires sessionId without changing the legacy pure engine scope contract', async () => {
  const harness = createHarness();
  const { sessionId, ...legacyScope } = scope;
  assert.throws(() => harness.render(() => useInstantDataEngine({ scope: legacyScope, transport: transport() })), TypeError);
  const { createInstantDataEngine } = await import('../src/data/instantDataEngine.js');
  const engine = createInstantDataEngine({ scope: legacyScope, transport: transport() });
  await engine.openQuery({ collection: 'orders' }).load();
  engine.close();
});

test('each epoch field and transport replacement synchronously closes the previous cached/live owner', async () => {
  for (const field of [...Object.keys(scope), 'transport']) {
    const harness = createHarness(), watches = [];
    const firstTransport = { ...transport(), subscribePage(input) {
      const watch = { input, stopped: false }; watches.push(watch);
      return () => { watch.stopped = true; };
    } };
    const old = harness.render(() => useInstantDataEngine({ scope, transport: firstTransport }));
    harness.commit();
    const resource = old.openQuery({ collection: 'orders' });
    await resource.load();
    old.observePage({ collection: 'orders' });
    assert.equal(old.getDiagnostics().cachedPages, 1);
    const nextScope = field === 'transport' ? scope : { ...scope, [field]: `${scope[field]}-next` };
    const next = harness.render(() => useInstantDataEngine({ scope: nextScope,
      transport: field === 'transport' ? transport() : firstTransport }));
    // Assert before committing effects or yielding a task.
    assert.notEqual(next, old);
    assert.equal(old.getDiagnostics().closed, true, field);
    assert.equal(old.getDiagnostics().cachedPages, 0, field);
    assert.equal(resource.getSnapshot().items.length, 0, field);
    assert.equal(watches[0].stopped, true, field);
    assert.equal(next.getDiagnostics().cachedPages, 0, field);
    watches[0].input.onData(page('obsolete live callback'));
    assert.equal(resource.getSnapshot().items.length, 0);
    harness.commit(); harness.unmount(); await tick();
    assert.equal(next.getDiagnostics().closed, true);
  }
});

test('hook replay and same-epoch rerender reuse the engine; real unmount closes it', async () => {
  const harness = createHarness(), adapter = transport();
  const render = () => harness.render(() => useInstantDataEngine({ scope, transport: adapter }));
  const first = render();
  assert.equal(render(), first);
  harness.commit(); harness.replay();
  await tick();
  assert.equal(first.getDiagnostics().closed, false);
  harness.unmount(); await tick();
  assert.equal(first.getDiagnostics().closed, true);
});

test('replacement cancels reads and rejects obsolete results after transport awaits', async () => {
  const harness = createHarness();
  let finish, request;
  const adapter = { readPage: input => { request = input; return new Promise(resolve => { finish = resolve; }); } };
  const old = harness.render(() => useInstantDataEngine({ scope, transport: adapter }));
  harness.commit();
  const resource = old.openQuery({ collection: 'orders' });
  const result = resource.load();
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await tick(); // Admission starts the physical adapter in a microtask.
  const next = harness.render(() => useInstantDataEngine({ scope: { ...scope, sessionId: 'login-2' }, transport: adapter }));
  assert.equal(request.signal.aborted, true);
  finish(page('old login'));
  await rejected; await tick();
  assert.equal(resource.getSnapshot().items.length, 0);
  assert.equal(next.getDiagnostics().cachedPages, 0);
  harness.commit(); harness.unmount(); await tick();
});

test('latest external authorization guard is checked after awaits without recreating the owner', async () => {
  const harness = createHarness();
  let finish;
  const adapter = { readPage: () => new Promise(resolve => { finish = resolve; }) };
  const engine = harness.render(() => useInstantDataEngine({ scope, transport: adapter, isCurrent: () => true }));
  harness.commit();
  const resource = engine.openQuery({ collection: 'orders' });
  const rejected = assert.rejects(resource.load(), { name: 'AbortError' });
  await tick();
  assert.equal(harness.render(() => useInstantDataEngine({ scope, transport: adapter, isCurrent: () => false })), engine);
  finish(page('revoked'));
  await rejected;
  assert.equal(resource.getSnapshot().items.length, 0);
  assert.equal(engine.getDiagnostics().cachedPages, 0);
  harness.unmount(); await tick();
});

test('old owner is closed before the replacement transport is inspected or created', async () => {
  const harness = createHarness();
  const old = harness.render(() => useInstantDataEngine({ scope, transport: transport() }));
  harness.commit();
  let inspections = 0;
  const adapter = { get readPage() {
    inspections++;
    assert.equal(old.getDiagnostics().closed, true);
    return async () => page('new');
  } };
  harness.render(() => useInstantDataEngine({ scope: { ...scope, sessionId: 'login-2' }, transport: adapter }));
  assert.ok(inspections > 0);
  harness.commit(); harness.unmount(); await tick();
});

test('invalid replacement scope or transport fails closed before a replacement can be used', async () => {
  for (const replacement of [{ scope: { ...scope, sessionId: '' }, transport: transport() },
    { scope: { ...scope, sessionId: 'login-2' }, transport: null }]) {
    const harness = createHarness();
    const old = harness.render(() => useInstantDataEngine({ scope, transport: transport() }));
    harness.commit();
    assert.throws(() => harness.render(() => useInstantDataEngine(replacement)), TypeError);
    assert.equal(old.getDiagnostics().closed, true);
    harness.unmount(); await tick();
  }
});
