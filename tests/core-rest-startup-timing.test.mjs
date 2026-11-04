import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {armRestStartupTiming} from '../scripts/helpers/rest-startup-timing.mjs';

const endpoint = 'http://127.0.0.1:8185/v1/projects/demo-hdm-perf-verification/databases/(default)/documents/artifacts/verification-fixture/public/data:runQuery';
const secret = 'PRIVATE_TOKEN_ROW_CURSOR_TENANT';
function request(collection = 'warehouseDispatches', cursor = false) {
  return {method: 'POST', headers: {Authorization: secret}, body: JSON.stringify({
    structuredQuery: {from: [{collectionId: collection}], limit: 200,
      where: {private: secret}, ...(cursor ? {startAt: {values: [secret]}} : {})},
    ...(cursor ? {readTime: secret} : {}),
  })};
}
function harness(options = {}) {
  let clock = 0, fetchImpl;
  const timers = new Map(), listeners = new Map(), created = [], calls = [];
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.listeners = new Map(); this.sent = []; created.push(this); }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    postMessage(...args) { this.sent.push(args); if (this.fail) throw this.fail; return 'posted'; }
    emit(type, data) { for (const fn of this.listeners.get(type) || []) fn({data}); }
  }
  const fetch = function (...args) { calls.push({receiver: this, args}); return fetchImpl(...args); };
  const scope = {location: {hostname: 'localhost'}, performance: {now: () => clock}, fetch, Worker,
    setTimeout(fn) { timers.set(1, fn); return 1; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const context = vm.createContext({window: scope});
  function arm(extra = {}) {
    context.options = {ownedSyntheticApk: true, ...options, ...extra};
    return vm.runInContext(`(${armRestStartupTiming.toString()})(options)`, context);
  }
  return {scope, fetch, Worker, timers, listeners, created, calls, arm,
    tick(ms) { clock += ms; }, setFetch(fn) { fetchImpl = fn; },
    response(value = secret, status = 200) { return {status, text() { return Promise.resolve(value); }}; },
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('injection is standalone ES2019 and requires explicit synthetic APK ownership', () => {
  const require = createRequire(import.meta.url);
  require('acorn').parse(`(${armRestStartupTiming.toString()})({ownedSyntheticApk:true})`, {ecmaVersion: 2019});
  const h = harness();
  assert.throws(() => h.arm({ownedSyntheticApk: false}), /owned synthetic APK/);
  h.scope.location.hostname = 'example.com';
  assert.throws(() => h.arm(), /owned synthetic APK/);
  assert.equal(h.scope.fetch, h.fetch);
  assert.equal(h.timers.size, 0);
});

test('exact loopback scope and metadata allowlist exclude production, lookalikes and malformed queries', async () => {
  const h = harness(); h.setFetch(() => Promise.resolve(h.response()));
  const api = h.arm();
  for (const url of [endpoint.replace('127.0.0.1', 'localhost'), endpoint + '?x=1', endpoint.replace('8185', '8186'),
    endpoint.replace('http://127.0.0.1:8185', 'https://firestore.googleapis.com'), endpoint.replace('verification-fixture', 'other')]) {
    await h.scope.fetch(url, request());
  }
  await h.scope.fetch({url: endpoint}, request());
  await h.scope.fetch(endpoint, {...request(), body: '{'});
  await h.scope.fetch(endpoint, request(secret + '/invalid'));
  const response = await h.scope.fetch(endpoint, request('warehouseDispatches', true));
  assert.equal(await response.text(), secret);
  const state = api.read();
  assert.equal(state.pages.length, 1);
  assert.equal(state.pages[0].collection, 'warehouseDispatches');
  assert.equal(state.pages[0].limit, 200);
  assert.equal(state.pages[0].hasCursor, true);
  assert.equal(state.pages[0].hasReadTime, true);
  assert.ok(!JSON.stringify(state).includes(secret));
  api.restore();
});

test('separates headers and body time, correlates 31 pages, and measures chunk-to-ACK delay without payloads', async () => {
  const h = harness(); let response;
  h.setFetch(() => { h.tick(10); response = h.response(); response.text = () => { h.tick(20); return Promise.resolve(secret); }; return Promise.resolve(response); });
  const api = h.arm(), worker = new h.scope.Worker('/assets/jsonParseWorker-fixture.js');
  const transfer = [];
  for (let id = 1; id <= 31; id++) {
    const r = await h.scope.fetch(endpoint, request('warehouseDispatches', id > 1));
    const text = await r.text();
    assert.equal(worker.postMessage({id, text}, transfer), 'posted');
    worker.emit('message', {id, type: 'parsed-json-start', count: id === 31 ? 1 : 200});
    worker.emit('message', {id, type: 'parsed-json-chunk', rows: [secret], index: 0});
    h.tick(7); worker.postMessage({id, type: 'ack-json', nextIndex: 1});
    worker.emit('message', {id, type: 'parsed-json-complete', count: 1});
  }
  const state = api.read();
  assert.equal(state.pages.length, 31); assert.equal(state.jobs.length, 31);
  for (let i = 0; i < 31; i++) {
    assert.equal(state.pages[i].headersMs, 10); assert.equal(state.pages[i].textMs, 20);
    assert.equal(state.jobs[i].page, i + 1); assert.equal(state.jobs[i].acks, 1);
    assert.equal(state.jobs[i].chunks, 1); assert.equal(state.jobs[i].maxAckDelayMs, 7);
    assert.equal(state.jobs[i].ackDelayMs, 7); assert.equal(state.jobs[i].textLength, secret.length);
  }
  assert.equal(worker.sent[0][1], transfer);
  assert.ok(!JSON.stringify(state).includes(secret));
  state.pages[0].limit = 9; assert.equal(api.read().pages[0].limit, 200);
  api.restore();
});

test('ambiguous equal-length bodies are explicitly uncorrelated; pages, jobs and workers stay bounded', async () => {
  const h = harness({maxPages: 2}); h.setFetch(() => Promise.resolve(h.response()));
  const api = h.arm(), worker = new h.scope.Worker('/assets/jsonParseWorker-test.js');
  for (let i = 0; i < 3; i++) await (await h.scope.fetch(endpoint, request())).text();
  worker.postMessage({id: 1, text: secret});
  worker.postMessage({id: 2, text: secret});
  worker.postMessage({id: 3, text: secret});
  for (let i = 0; i < 12; i++) new h.scope.Worker('/assets/jsonParseWorker-test.js');
  const state = api.read();
  assert.equal(state.pages.length, 2); assert.equal(state.jobs.length, 2);
  assert.equal(state.jobs[0].page, 0); assert.equal(state.ambiguousJobs, 1);
  assert.equal(state.droppedPages, 1); assert.equal(state.droppedJobs, 1);
  assert.equal(h.created.filter(w => w.listeners.get('message')?.size).length, 8);
  api.restore();
});

test('preserves response identity, rejection identity and receivers; finally restores all descriptors and listeners', async () => {
  const h = harness(), failure = new Error(secret), response = h.response();
  const textDescriptor = Object.getOwnPropertyDescriptor(response, 'text');
  let mode = 'ok'; h.setFetch(() => { if (mode === 'sync') throw failure; if (mode === 'reject') return Promise.reject(failure); return Promise.resolve(response); });
  const api = h.arm(), worker = new h.scope.Worker('/assets/jsonParseWorker-test.js');
  try {
    const receiver = {};
    assert.equal(await h.scope.fetch.call(receiver, endpoint, request()), response);
    assert.equal(h.calls[0].receiver, receiver);
    await response.text();
    worker.postMessage({id: 1, text: secret});
    worker.emit('error');
    mode = 'sync'; assert.throws(() => h.scope.fetch(endpoint, request()), e => e === failure);
    mode = 'reject'; await assert.rejects(h.scope.fetch(endpoint, request()), e => e === failure);
    assert.ok(api.read().jobs[0].errorAt !== undefined);
  } finally { api.restore(); }
  assert.equal(h.scope.fetch, h.fetch); assert.equal(h.scope.Worker, h.Worker);
  assert.deepEqual(Object.getOwnPropertyDescriptor(response, 'text'), textDescriptor);
  assert.equal(Object.hasOwn(worker, 'postMessage'), false);
  assert.equal(worker.listeners.get('message').size, 0); assert.equal(worker.listeners.get('error').size, 0);
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  assert.deepEqual(plain(api.restore()), plain(api.read()));
  assert.ok(!JSON.stringify(api.read()).includes(secret));
});

test('body failures, cancellation and post failures are numeric/boolean only; watchdog/pagehide/rearm clean up', async () => {
  const h = harness(), failure = new Error(secret);
  h.setFetch(() => Promise.resolve({status: 200, text: () => Promise.reject(failure)}));
  let api = h.arm();
  await assert.rejects((await h.scope.fetch(endpoint, request())).text(), e => e === failure);
  const worker = new h.scope.Worker('/assets/jsonParseWorker-test.js');
  worker.postMessage({id: 1, text: secret}); worker.postMessage({id: 1, type: 'cancel-json'});
  worker.fail = failure; assert.throws(() => worker.postMessage({id: 2, text: secret}), e => e === failure);
  assert.equal(api.read().pages[0].textFailed, true);
  assert.ok(api.read().jobs[0].cancelAt !== undefined);
  assert.ok(api.read().jobs[1].postFailedAt !== undefined);
  h.timers.get(1)(); assert.equal(api.read().stopped, true); assert.equal(h.scope.fetch, h.fetch);
  api = h.arm(); h.listeners.get('pagehide')(); assert.equal(api.read().stopped, true);
  const previous = h.arm(); api = h.arm(); assert.equal(previous.read().stopped, true);
  api.restore(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('restoring during fetch or body consumption prevents late instrumentation and leaves unrelated workers untouched', async () => {
  for (const phase of ['fetch', 'body']) {
    const h = harness(); let resolve;
    const pending = new Promise(r => { resolve = r; });
    const response = h.response();
    if (phase === 'fetch') h.setFetch(() => pending);
    else { response.text = () => pending; h.setFetch(() => Promise.resolve(response)); }
    const originalText = response.text;
    const api = h.arm();
    const other = new h.scope.Worker('/assets/firestoreReadWorker-test.js', {name: 'fixture'});
    assert.equal(other instanceof h.Worker, true);
    assert.equal(Object.hasOwn(other, 'postMessage'), false);
    assert.equal(other.listeners.size, 0);
    let result = h.scope.fetch(endpoint, request());
    if (phase === 'body') result = (await result).text();
    api.restore(); const snapshot = plain(api.read());
    resolve(phase === 'fetch' ? response : secret);
    assert.equal(await result, phase === 'fetch' ? response : secret);
    assert.deepEqual(plain(api.read()), snapshot);
    assert.equal(response.text, originalText);
    assert.equal(h.timers.size, 0);
  }
});
