import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'acorn';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createTwoLaneReadWorker } from '../performance/upgrade-20261103/pilots/read-worker-lanes.js';
import { createReadWorkerSnapshotAssembler } from '../src/services/readWorkerSnapshotAssembler.js';
import { createWorkerAuthEnvelope } from '../src/services/workerAuthSession.js';
import { createInitialReadAdmission } from '../src/services/initialReadAdmission.js';

const serverMetadata = { fromCache: false, hasPendingWrites: false };

function fixture(options = {}) {
  const children = [], events = [], errors = [];
  const initialAdmission = createInitialReadAdmission({ concurrency: 2, maxPending: 16 });
  const proxy = createTwoLaneReadWorker({ createWorker() {
    const child = { messages: [], terminated: 0, postMessage(message) { this.messages.push(message); }, terminate() { this.terminated++; } };
    children.push(child); return child;
  }, initialAdmission, ...options });
  proxy.onmessage = event => events.push(event.data);
  proxy.onerror = event => { assert.ok(children.every(child => child.terminated === 1), 'teardown precedes failure delivery'); errors.push(event.code); };
  const post = message => proxy.postMessage({ scopeId: 'scope-A', ...message });
  const receive = (lane, message) => children[lane].onmessage({ data: { scopeId: 'scope-A', ...message } });
  const init = () => post({ type: 'init', persistentCache: false, envelope: { test: 'synthetic' } });
  const ready = () => { init(); receive(0, { type: 'ready' }); receive(1, { type: 'ready' }); };
  const subscribe = (id, collectionName) => post({ type: 'subscribe', streamId: String(id), collectionName });
  return { proxy, children, events, errors, post, receive, init, ready, subscribe, admission: options.initialAdmission || initialAdmission };
}

test('raw function is standalone ES2019 and creates exactly two workers only at init', () => {
  const source = '(' + createTwoLaneReadWorker.toString() + ')';
  assert.doesNotThrow(() => parse(source, { ecmaVersion: 2019 }));
  const factory = vm.runInNewContext('Object.hasOwn = undefined; Object.fromEntries = undefined; ' + source);
  let count = 0;
  const admissionSource = '(' + createInitialReadAdmission.toString() + ')';
  assert.doesNotThrow(() => parse(admissionSource, { ecmaVersion: 2019 }));
  const makeAdmission = vm.runInNewContext(admissionSource);
  const proxy = factory({ createWorker() { count++; return { postMessage() {}, terminate() {} }; }, initialAdmission: makeAdmission({ concurrency: 2, maxPending: 16 }) });
  assert.equal(count, 0);
  proxy.postMessage({ type: 'init', scopeId: 'scope', persistentCache: false });
  assert.equal(count, 2);
  proxy.terminate(); proxy.terminate();
});

test('aggregate readiness waits for both children exactly once; static collections have disjoint ownership', () => {
  const f = fixture(); f.init();
  f.receive(1, { type: 'ready' }); f.receive(1, { type: 'ready' });
  assert.equal(f.events.length, 0);
  f.receive(0, { type: 'ready' }); f.receive(0, { type: 'ready' });
  assert.equal(f.events.length, 1);
  const names = [['companies', 'employees', 'orders', 'expenses', 'financials'], ['customers', 'payments', 'attendance', 'performance', 'notifications']];
  let id = 0;
  for (let lane = 0; lane < 2; lane++) for (const name of names[lane]) f.subscribe(++id, name);
  assert.equal(f.children.reduce((sum, child) => sum + child.messages.filter(m => m.type === 'subscribe').length, 0), 2);
  // Cancellation returns admission slots; every collection is then routed to
  // its exact lane without permitting more than two initial starts at once.
  for (let streamId = 1; streamId <= id; streamId++) f.post({ type: 'unsubscribe', streamId: String(streamId) });
  for (let lane = 0; lane < 2; lane++) assert.deepEqual(f.children[lane].messages.filter(m => m.type === 'subscribe').map(m => m.collectionName), names[lane]);
  assert.equal(f.errors.length, 0); f.proxy.terminate();
});

test('colliding child packet IDs remap globally; out-of-order client ACK routes original IDs only', () => {
  const f = fixture(); f.ready(); f.subscribe(1, 'orders'); f.subscribe(2, 'customers');
  f.receive(0, { type: 'begin', streamId: '1', packetId: 1, revision: 8, metadata: serverMetadata });
  f.receive(1, { type: 'begin', streamId: '2', packetId: 1, revision: 12, metadata: serverMetadata });
  const packets = f.events.filter(m => m.type === 'begin');
  assert.notEqual(packets[0].packetId, packets[1].packetId);
  assert.ok(f.children.every(c => !c.messages.some(m => m.type === 'ack')));
  for (const packet of packets.slice().reverse()) f.post({ type: 'ack', streamId: packet.streamId, packetId: packet.packetId });
  for (let lane = 0; lane < 2; lane++) assert.deepEqual(f.children[lane].messages.filter(m => m.type === 'ack'), [{ type: 'ack', scopeId: 'scope-A', streamId: String(lane + 1), packetId: 1 }]);
  f.post({ type: 'ack', streamId: '1', packetId: packets[0].packetId });
  assert.equal(f.children[0].messages.filter(m => m.type === 'ack').length, 1);
  f.proxy.terminate();
});

test('ACK with a different stream rejects the run without forwarding', () => {
  const f = fixture(); f.ready(); f.subscribe(1, 'orders'); f.subscribe(2, 'customers');
  f.receive(0, { type: 'chunk', streamId: '1', packetId: 3, rows: [] });
  f.post({ type: 'ack', streamId: '2', packetId: f.events.at(-1).packetId });
  assert.deepEqual(f.errors, ['qa-lanes-ack-stream']);
  assert.ok(f.children.every(c => !c.messages.some(m => m.type === 'ack')));
});

test('unsubscribe cancels only its lane and pending ACKs; reopens require a fresh stream ID', () => {
  const f = fixture(); f.ready(); f.subscribe(1, 'orders'); f.subscribe(2, 'customers');
  f.receive(0, { type: 'cache', streamId: '1', packetId: 1 });
  const packet = f.events.at(-1);
  const oldHandler = f.children[0].onmessage;
  f.post({ type: 'unsubscribe', streamId: '1' });
  oldHandler({ data: { type: 'chunk', scopeId: 'scope-A', streamId: '1', packetId: 2 } });
  f.post({ type: 'ack', streamId: '1', packetId: packet.packetId });
  assert.equal(f.events.at(-1), packet);
  assert.equal(f.children[0].messages.filter(m => m.type === 'unsubscribe').length, 1);
  assert.equal(f.children[1].messages.filter(m => m.type === 'unsubscribe').length, 0);
  assert.ok(!f.children[0].messages.some(m => m.type === 'ack'));
  f.subscribe(3, 'orders'); assert.equal(f.errors.length, 0);
  f.post({ type: 'unsubscribe', streamId: '3' }); f.subscribe(3, 'orders');
  assert.deepEqual(f.errors, ['qa-lanes-stream-id']);
});

test('persistent-cache request refuses before any worker is created or initialized', () => {
  const f = fixture(); f.post({ type: 'init', persistentCache: true });
  assert.equal(f.children.length, 0);
  assert.equal(f.events[0].type, 'init-failed');
  assert.equal(f.events[0].code, 'qa-lanes-persistence-refused');
  assert.equal(f.events[0].qaRejected, true);
  f.init(); assert.equal(f.children.length, 0);
});

for (const type of ['init-failed', 'auth-invalid', 'worker-error', 'message-error']) {
  test(`${type} tears down both contexts before notifying client and ignores late traffic`, () => {
    const f = fixture(); f.init();
    const oldMessage = f.children[0].onmessage, oldError = f.children[1].onerror;
    f.proxy.onmessage = event => { assert.ok(f.children.every(c => c.terminated === 1)); f.events.push(event.data); };
    if (type === 'worker-error') f.children[1].onerror({});
    else if (type === 'message-error') f.children[1].onmessageerror({});
    else f.receive(1, { type });
    const total = f.events.length + f.errors.length;
    oldMessage({ data: { type: 'ready', scopeId: 'scope-A' } }); oldError({});
    f.proxy.terminate(); f.post({ type: 'close' });
    assert.equal(f.events.length + f.errors.length, total);
    assert.ok(f.children.every(c => c.terminated === 1));
  });
}

test('scope mismatch cannot emit readiness, subscribe, ACK or terminate the bound session', () => {
  const f = fixture(); f.init();
  f.receive(0, { type: 'ready', scopeId: 'other' }); f.receive(1, { type: 'ready' });
  assert.equal(f.events.length, 0); f.receive(0, { type: 'ready' });
  f.post({ type: 'subscribe', streamId: '1', collectionName: 'orders', scopeId: 'other' });
  assert.equal(f.children[0].messages.length, 1);
  f.subscribe(1, 'orders'); f.receive(0, { type: 'begin', streamId: '1', packetId: 1, revision: 1, metadata: serverMetadata });
  f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId, scopeId: 'other' });
  f.post({ type: 'close', scopeId: 'other' });
  assert.ok(f.children.every(c => c.terminated === 0));
  f.post({ type: 'init', scopeId: 'other' });
  assert.deepEqual(f.errors, ['qa-lanes-reinit']);
});

for (const [name, action, code] of [
  ['duplicate collection', f => { f.subscribe(1, 'orders'); f.subscribe(2, 'orders'); }, 'duplicate-collection'],
  ['unsupported collection', f => f.subscribe(1, 'products'), 'unsupported-collection'],
  ['prototype collection', f => f.subscribe(1, 'toString'), 'unsupported-collection'],
  ['nonstring collection', f => f.subscribe(1, ['orders']), 'unsupported-collection'],
  ['duplicate stream', f => { f.subscribe(1, 'orders'); f.subscribe(1, 'customers'); }, 'stream-id'],
  ['stream bound', f => { f.subscribe(1, 'orders'); f.subscribe(2, 'customers'); }, 'stream-limit'],
  ['pending bound', f => { f.subscribe(1, 'orders'); f.receive(0, { type: 'begin', streamId: '1', packetId: 1, revision: 1, metadata: serverMetadata }); f.receive(0, { type: 'chunk', streamId: '1', packetId: 2 }); }, 'pending-limit'],
  ['duplicate packet', f => { f.subscribe(1, 'orders'); f.receive(0, { type: 'begin', streamId: '1', packetId: 1, revision: 1, metadata: serverMetadata }); f.receive(0, { type: 'begin', streamId: '1', packetId: 1 }); }, 'packet-id'],
  ['wrong lane', f => { f.subscribe(1, 'orders'); f.receive(1, { type: 'begin', streamId: '1', packetId: 1 }); }, 'wrong-lane'],
  ['child fallback', f => { f.subscribe(1, 'orders'); f.receive(0, { type: 'fallback', streamId: '1' }); }, 'child-fallback'],
]) {
  test(`${name} rejects the QA run without duplicating a listener`, () => {
    const f = fixture({ maxStreams: name === 'stream bound' ? 1 : 16, maxPending: name === 'pending bound' ? 1 : 64 });
    f.ready(); action(f);
    assert.deepEqual(f.errors, ['qa-lanes-' + code]);
    f.proxy.terminate(); assert.ok(f.children.every(c => c.terminated === 1));
  });
}

test('close/terminate before init and after ready are idempotent; instrumentation supports remove and once', () => {
  const never = fixture(); never.proxy.terminate(); never.init(); assert.equal(never.children.length, 0);
  const f = fixture(); let count = 0;
  const callback = () => count++;
  f.proxy.addEventListener('message', callback); f.proxy.removeEventListener('message', callback);
  f.proxy.addEventListener('message', callback, { once: true });
  f.ready(); f.subscribe(1, 'orders'); f.receive(0, { type: 'source-started', streamId: '1' });
  assert.equal(count, 1);
  const late = f.children[0].onmessage;
  f.post({ type: 'close' }); f.proxy.terminate(); f.proxy.terminate();
  late({ data: { scopeId: 'scope-A', type: 'auth-invalid' } });
  assert.equal(f.errors.length, 0); assert.ok(f.children.every(c => c.terminated === 1));
  assert.equal(f.proxy.onmessage, null); assert.equal(f.proxy.onerror, null);
});

test('partial creation and child post failures clean up every created context', () => {
  let stopped = 0, calls = 0, failure;
  const proxy = createTwoLaneReadWorker({ createWorker() {
    if (++calls === 2) throw Error('synthetic creation failure');
    return { postMessage() {}, terminate() { stopped++; } };
  }, initialAdmission: createInitialReadAdmission({ concurrency: 2, maxPending: 16 }) });
  proxy.onmessage = e => { assert.equal(stopped, 1); failure = e.data; };
  proxy.postMessage({ type: 'init', scopeId: 'scope' });
  assert.equal(failure.type, 'init-failed');
  const f = fixture(); f.ready(); f.children[0].postMessage = () => { throw Error('synthetic send failure'); };
  f.subscribe(1, 'orders'); assert.deepEqual(f.errors, ['qa-lanes-post-failed']);
});

test('ACK and unsubscribe reclaim bounded capacity without a hidden packet queue', () => {
  const f = fixture({ maxPending: 1, maxStreams: 1 }); f.ready(); f.subscribe(1, 'orders');
  f.receive(0, { type: 'begin', streamId: '1', packetId: 1, revision: 1, metadata: serverMetadata });
  f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
  f.receive(0, { type: 'chunk', streamId: '1', packetId: 2 });
  f.post({ type: 'unsubscribe', streamId: '1' });
  f.subscribe(2, 'customers'); f.receive(1, { type: 'begin', streamId: '2', packetId: 1, revision: 1, metadata: serverMetadata });
  assert.equal(f.events.at(-1).packetId, 3);
  assert.equal(f.errors.length, 0); f.proxy.terminate();
});

test('invalid bounds and reused child worker cannot create an unbounded or shared transport', () => {
  for (const key of ['maxPending', 'maxStreams']) for (const value of [0, -1, 1.5, Infinity, 1025]) {
    assert.throws(() => createTwoLaneReadWorker({ createWorker() {}, [key]: value }), /Invalid QA lane bounds/);
  }
  let stops = 0, failure;
  const child = { postMessage() { assert.fail('reused worker must never initialize'); }, terminate() { stops++; } };
  const proxy = createTwoLaneReadWorker({ createWorker: () => child, initialAdmission: createInitialReadAdmission({ concurrency: 2, maxPending: 16 }) });
  proxy.onmessage = event => { failure = event.data; };
  proxy.postMessage({ type: 'init', scopeId: 'scope' });
  assert.equal(stops, 1); assert.equal(failure.code, 'qa-lanes-create-failed');
});

test('existing admission dependency is mandatory, fresh and owned by proxy cleanup', () => {
  assert.throws(() => createTwoLaneReadWorker({ createWorker() {} }), /Required existing initialAdmission/);
  const initialAdmission = createInitialReadAdmission({ concurrency: 2, maxPending: 16 });
  initialAdmission.enqueue('existing', { start() {}, onError() {} });
  assert.throws(() => createTwoLaneReadWorker({ createWorker() {}, initialAdmission }), /fresh and exclusively owned/);
  initialAdmission.close();
  assert.throws(() => createTwoLaneReadWorker({ createWorker() {}, initialAdmission }), /fresh and exclusively owned/);
  const f = fixture(); f.proxy.terminate();
  assert.deepEqual(f.admission.getSnapshot(), { active: 0, queued: 0, closed: true });
});

function transferDriver(f) {
  const nextPacket = [0, 0];
  return (lane, streamId, revision, metadata, ackComplete = true) => {
    f.receive(lane, { type: 'begin', streamId, packetId: ++nextPacket[lane], revision, metadata });
    f.post({ type: 'ack', streamId, packetId: f.events.at(-1).packetId });
    f.receive(lane, { type: 'complete', streamId, packetId: ++nextPacket[lane], revision });
    const complete = f.events.at(-1);
    if (ackComplete) f.post({ type: 'ack', streamId, packetId: complete.packetId });
    return complete;
  };
}
const startedCollections = f => f.children.flatMap(child => child.messages.filter(m => m.type === 'subscribe').map(m => m.collectionName));

for (const expenseLane of [0, 1]) test(`static expense policy ${expenseLane}: ACK routing, global admission and cancellation`, () => {
  const f = fixture({ expenseLane }); f.ready(); f.subscribe(1, 'expenses'); f.subscribe(2, 'orders'); f.subscribe(3, 'payments');
  assert.equal(startedCollections(f).length, 2);
  assert.equal(f.children[expenseLane].messages.filter(m => m.type === 'subscribe' && m.collectionName === 'expenses').length, 1);
  assert.equal(f.children[1 - expenseLane].messages.filter(m => m.type === 'subscribe' && m.collectionName === 'expenses').length, 0);
  f.receive(expenseLane, { type: 'begin', streamId: '1', packetId: 71, revision: 1, metadata: serverMetadata });
  f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
  assert.equal(startedCollections(f).length, 2);
  f.receive(expenseLane, { type: 'complete', streamId: '1', packetId: 72, revision: 1 });
  const complete = f.events.at(-1);
  assert.equal(startedCollections(f).length, 2);
  f.post({ type: 'ack', streamId: '1', packetId: complete.packetId });
  assert.deepEqual(f.children[expenseLane].messages.filter(m => m.type === 'ack').map(m => m.packetId), [71, 72]);
  assert.equal(f.children[1 - expenseLane].messages.filter(m => m.type === 'ack').length, 0);
  assert.equal(startedCollections(f).length, 3);
  assert.deepEqual(f.admission.getSnapshot(), { active: 2, queued: 0, closed: false });
  f.receive(expenseLane, { type: 'begin', streamId: '1', packetId: 73, revision: 2, metadata: serverMetadata });
  const cancelled = f.events.at(-1);
  f.post({ type: 'unsubscribe', streamId: '1' });
  f.post({ type: 'ack', streamId: '1', packetId: cancelled.packetId });
  assert.equal(f.children[expenseLane].messages.filter(m => m.type === 'unsubscribe').length, 1);
  assert.equal(f.children[1 - expenseLane].messages.filter(m => m.type === 'unsubscribe').length, 0);
  assert.equal(f.children[expenseLane].messages.filter(m => m.type === 'ack').length, 2);
  assert.equal(f.errors.length, 0); f.proxy.terminate();
});

test('expenseLane rejects invalid enum before creating workers or owning admission', () => {
  for (const expenseLane of [-1, 2, 0.5, '0', '1', false, null, NaN, Infinity]) {
    let created = 0;
    const initialAdmission = createInitialReadAdmission({ concurrency: 2, maxPending: 16 });
    assert.throws(() => createTwoLaneReadWorker({ createWorker() { created++; }, initialAdmission, expenseLane }), /Invalid QA expenseLane/);
    assert.equal(created, 0);
    assert.deepEqual(initialAdmission.getSnapshot(), { active: 0, queued: 0, closed: false });
  }
});

test('expense policies preserve identical client payloads and default remains policy zero', () => {
  const run = policy => {
    const f = fixture(policy); f.ready(); f.subscribe(1, 'expenses');
    const lane = policy.expenseLane || 0;
    const packets = [
      { type: 'begin', packetId: 91, revision: 1, count: 1, mode: 'full', changeCount: null, metadata: serverMetadata },
      { type: 'chunk', packetId: 92, revision: 1, index: 0, rows: [{ id: 'fictional-expense', type: 'full', value: { amount: 123.25, date: '2026-11-04', sourceType: 'expense' } }] },
      { type: 'complete', packetId: 93, revision: 1, chunks: 1, baselineId: 'fictional-baseline' },
    ];
    for (const packet of packets) {
      f.receive(lane, { ...packet, streamId: '1' });
      f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
    }
    const result = { events: f.events, admission: f.admission.getSnapshot(),
      acks: f.children[lane].messages.filter(m => m.type === 'ack') };
    f.proxy.terminate(); return result;
  };
  const defaultPolicy = run({});
  assert.deepEqual(defaultPolicy, run({ expenseLane: 0 }));
  assert.deepEqual(defaultPolicy, run({ expenseLane: 1 }));
});

test('global initial concurrency stays two across lanes until first confirmed complete client ACK', () => {
  const f = fixture(); f.ready();
  for (const [id, name] of [[1, 'orders'], [2, 'customers'], [3, 'payments'], [4, 'financials']]) f.subscribe(id, name);
  assert.deepEqual(startedCollections(f).sort(), ['customers', 'orders']);
  assert.deepEqual(f.admission.getSnapshot(), { active: 2, queued: 2, closed: false });
  const transfer = transferDriver(f);
  const first = transfer(0, '1', 1, serverMetadata, false);
  assert.equal(startedCollections(f).length, 2, 'begin ACK and receiving complete do not release admission');
  f.post({ type: 'ack', streamId: '1', packetId: first.packetId, scopeId: 'other' });
  assert.equal(startedCollections(f).length, 2, 'wrong scope ACK cannot release a slot');
  f.post({ type: 'ack', streamId: '1', packetId: first.packetId });
  assert.equal(startedCollections(f).length, 3);
  assert.ok(startedCollections(f).includes('payments'));
  assert.deepEqual(f.admission.getSnapshot(), { active: 2, queued: 1, closed: false });
  transfer(0, '1', 2, serverMetadata);
  f.post({ type: 'ack', streamId: '1', packetId: first.packetId });
  assert.equal(startedCollections(f).length, 3, 'realtime complete and duplicate ACK cannot release an extra initial slot');
  transfer(1, '2', 1, serverMetadata);
  assert.equal(startedCollections(f).length, 4);
  assert.deepEqual(f.admission.getSnapshot(), { active: 2, queued: 0, closed: false });
  f.proxy.terminate();
  assert.deepEqual(f.admission.getSnapshot(), { active: 0, queued: 0, closed: true });
});

function fourSlotFixture() {
  // Literal construction mirrors the QA driver contract; the intent argument
  // does not select or modify the injected queue's actual configuration.
  const f = fixture({ initialConcurrency: 4, initialAdmission: createInitialReadAdmission({ concurrency: 4, maxPending: 16 }) });
  f.ready();
  for (const [id, name] of [[1, 'orders'], [2, 'expenses'], [3, 'customers'], [4, 'payments'], [5, 'financials']]) f.subscribe(id, name);
  return f;
}

test('initialConcurrency validates 2|4 before any worker creation; default intent does not reconfigure admission', () => {
  for (const initialConcurrency of [0, 1, 3, 8, 2.5, '2', '4', false, null, NaN, Infinity]) {
    let created = 0;
    const initialAdmission = createInitialReadAdmission({ concurrency: 2, maxPending: 16 });
    assert.throws(() => createTwoLaneReadWorker({ createWorker() { created++; }, initialAdmission, initialConcurrency }), /Invalid QA initialConcurrency/);
    assert.equal(created, 0);
    assert.deepEqual(initialAdmission.getSnapshot(), { active: 0, queued: 0, closed: false });
  }
  const intentOnly = fixture({ initialConcurrency: 4 });
  intentOnly.ready(); intentOnly.subscribe(1, 'orders'); intentOnly.subscribe(2, 'customers'); intentOnly.subscribe(3, 'payments');
  assert.deepEqual(intentOnly.admission.getSnapshot(), { active: 2, queued: 1, closed: false }, 'factory cannot introspect/reconfigure an actual queue of two');
  intentOnly.proxy.terminate();
});

test('four-slot global admission: fifth waits for complete ACK; collisions and reversed ACKs keep exact routes', () => {
  const f = fourSlotFixture();
  assert.equal(startedCollections(f).length, 4);
  assert.deepEqual(f.admission.getSnapshot(), { active: 4, queued: 1, closed: false });
  for (const [lane, streamId] of [[0, '1'], [1, '3']]) f.receive(lane, { type: 'begin', streamId, packetId: 1, revision: 1, metadata: serverMetadata });
  const begins = f.events.filter(m => m.type === 'begin');
  assert.notEqual(begins[0].packetId, begins[1].packetId);
  for (const packet of begins.slice().reverse()) f.post({ type: 'ack', streamId: packet.streamId, packetId: packet.packetId });
  assert.equal(startedCollections(f).length, 4, 'begin ACKs cannot admit fifth source');
  for (const [lane, streamId] of [[0, '1'], [1, '3']]) f.receive(lane, { type: 'complete', streamId, packetId: 2, revision: 1 });
  const completes = f.events.filter(m => m.type === 'complete');
  assert.equal(startedCollections(f).length, 4, 'receiving completes cannot admit fifth source');
  f.post({ type: 'ack', streamId: '3', packetId: completes[1].packetId });
  assert.equal(startedCollections(f).length, 5);
  assert.deepEqual(f.admission.getSnapshot(), { active: 4, queued: 0, closed: false });
  f.post({ type: 'ack', streamId: '1', packetId: completes[0].packetId });
  assert.deepEqual(f.admission.getSnapshot(), { active: 3, queued: 0, closed: false });
  for (const [lane, streamId] of [[0, '1'], [1, '3']]) assert.deepEqual(
    f.children[lane].messages.filter(m => m.type === 'ack').map(m => [m.streamId, m.packetId]), [[streamId, 1], [streamId, 2]]);
  f.receive(1, { type: 'begin', streamId: '3', packetId: 3, revision: 2, metadata: serverMetadata });
  f.post({ type: 'ack', streamId: '3', packetId: f.events.at(-1).packetId });
  f.receive(1, { type: 'complete', streamId: '3', packetId: 4, revision: 2 });
  f.post({ type: 'ack', streamId: '3', packetId: f.events.at(-1).packetId });
  assert.equal(f.admission.getSnapshot().active, 3, 'ongoing realtime completion does not settle twice');
  assert.equal(f.errors.length, 0);
  f.post({ type: 'close' });
  assert.deepEqual(f.admission.getSnapshot(), { active: 0, queued: 0, closed: true });
  assert.ok(f.children.every(child => child.terminated === 1));
});

for (const metadata of [{ fromCache: true, hasPendingWrites: false }, { fromCache: false, hasPendingWrites: true }]) {
  test(`four slots retain cache/pending-write transfer: ${JSON.stringify(metadata)}`, () => {
    const f = fourSlotFixture();
    f.receive(0, { type: 'cache', streamId: '1', packetId: 1, metadata: { fromCache: true, hasPendingWrites: false } });
    f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
    assert.equal(startedCollections(f).length, 4, 'cache notice ACK cannot release a slot');
    f.receive(0, { type: 'begin', streamId: '1', packetId: 2, revision: 1, metadata });
    f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
    f.receive(0, { type: 'complete', streamId: '1', packetId: 3, revision: 1 });
    f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
    assert.deepEqual(f.admission.getSnapshot(), { active: 4, queued: 1, closed: false });
    assert.equal(startedCollections(f).length, 4);
    f.receive(0, { type: 'begin', streamId: '1', packetId: 4, revision: 2, metadata: serverMetadata });
    f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
    f.receive(0, { type: 'complete', streamId: '1', packetId: 5, revision: 2 });
    f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
    assert.equal(startedCollections(f).length, 5);
    assert.equal(f.errors.length, 0); f.proxy.terminate();
  });
}

test('four-slot cancellation removes queued work and stale ACKs; active cancel admits next source only once', () => {
  const f = fourSlotFixture();
  f.post({ type: 'unsubscribe', streamId: '5' });
  assert.equal(f.children[0].messages.filter(m => m.type === 'unsubscribe').length, 0);
  assert.deepEqual(f.admission.getSnapshot(), { active: 4, queued: 0, closed: false });
  f.subscribe(6, 'financials');
  f.receive(0, { type: 'begin', streamId: '2', packetId: 1, revision: 1, metadata: serverMetadata });
  const stale = f.events.at(-1);
  f.post({ type: 'unsubscribe', streamId: '2' });
  f.post({ type: 'ack', streamId: '2', packetId: stale.packetId });
  assert.equal(f.children[0].messages.filter(m => m.type === 'unsubscribe').length, 1);
  assert.ok(!f.children[0].messages.some(m => m.type === 'ack'));
  assert.equal(startedCollections(f).length, 5);
  assert.deepEqual(f.admission.getSnapshot(), { active: 4, queued: 0, closed: false });
  f.proxy.terminate(); f.proxy.terminate();
  assert.deepEqual(f.admission.getSnapshot(), { active: 0, queued: 0, closed: true });
  assert.ok(f.children.every(child => child.terminated === 1));
});

for (const metadata of [{ fromCache: true, hasPendingWrites: false }, { fromCache: false, hasPendingWrites: true }]) {
  test(`unconfirmed transfer ACK does not release admission: ${JSON.stringify(metadata)}`, () => {
    const f = fixture(); f.ready(); f.subscribe(1, 'orders'); f.subscribe(2, 'customers'); f.subscribe(3, 'payments');
    const transfer = transferDriver(f);
    transfer(0, '1', 1, metadata);
    assert.equal(startedCollections(f).length, 2);
    transfer(0, '1', 2, serverMetadata);
    assert.equal(startedCollections(f).length, 3);
    assert.equal(f.errors.length, 0); f.proxy.terminate();
  });
}

test('cache ACK holds admission; cancellation removes queued jobs without child unsubscribe', () => {
  const f = fixture(); f.ready(); f.subscribe(1, 'orders'); f.subscribe(2, 'customers'); f.subscribe(3, 'payments'); f.subscribe(4, 'financials');
  f.receive(0, { type: 'cache', streamId: '1', packetId: 1, metadata: { fromCache: true, hasPendingWrites: false } });
  f.post({ type: 'ack', streamId: '1', packetId: f.events.at(-1).packetId });
  assert.equal(startedCollections(f).length, 2);
  f.post({ type: 'unsubscribe', streamId: '3' });
  assert.equal(f.children[1].messages.filter(m => m.type === 'unsubscribe').length, 0);
  assert.deepEqual(f.admission.getSnapshot(), { active: 2, queued: 1, closed: false });
  f.post({ type: 'unsubscribe', streamId: '1' });
  assert.ok(startedCollections(f).includes('financials'));
  assert.ok(!startedCollections(f).includes('payments'));
  assert.equal(f.children[0].messages.filter(m => m.type === 'unsubscribe').length, 1);
  f.proxy.terminate();
});

test('invalid transfer metadata/revision rejects rather than guessing a completion boundary', () => {
  for (const missingMetadata of [false, true]) {
    const f = fixture(); f.ready(); f.subscribe(1, 'orders');
    f.receive(0, { type: 'begin', streamId: '1', packetId: 1, revision: 1, metadata: missingMetadata ? undefined : serverMetadata });
    if (!missingMetadata) f.receive(0, { type: 'complete', streamId: '1', packetId: 2, revision: 2 });
    assert.deepEqual(f.errors, ['qa-lanes-transfer']);
    assert.deepEqual(f.admission.getSnapshot(), { active: 0, queued: 0, closed: true });
  }
});

test('admission queue overflow and start failure tear down both children and close existing admission', () => {
  const small = fixture({ initialAdmission: createInitialReadAdmission({ concurrency: 2, maxPending: 2 }) });
  small.ready(); small.subscribe(1, 'orders'); small.subscribe(2, 'customers'); small.subscribe(3, 'payments');
  assert.deepEqual(small.errors, ['qa-lanes-admission-enqueue-failed']);
  assert.deepEqual(small.admission.getSnapshot(), { active: 0, queued: 0, closed: true });
  const real = createInitialReadAdmission({ concurrency: 2, maxPending: 16 });
  const injected = { ...real, enqueue(key, job) { real.enqueue(key, { ...job, start() { throw Error('synthetic admission start failure'); } }); } };
  const f = fixture({ initialAdmission: injected }); f.ready(); f.subscribe(1, 'orders');
  assert.deepEqual(f.errors, ['qa-lanes-admission-start-failed']);
  assert.deepEqual(real.getSnapshot(), { active: 0, queued: 0, closed: true });
});

test('queued stream data cannot bypass the global gate; auth failure closes queued work without starting it', () => {
  for (const authFailure of [false, true]) {
    const f = fixture(); f.ready(); f.subscribe(1, 'orders'); f.subscribe(2, 'customers'); f.subscribe(3, 'payments');
    if (authFailure) f.receive(1, { type: 'auth-invalid' });
    else f.receive(1, { type: 'begin', streamId: '3', packetId: 1, revision: 1, metadata: serverMetadata });
    assert.equal(startedCollections(f).length, 2);
    assert.deepEqual(f.admission.getSnapshot(), { active: 0, queued: 0, closed: true });
    if (authFailure) assert.equal(f.events.at(-1).type, 'auth-invalid');
    else assert.deepEqual(f.errors, ['qa-lanes-unadmitted-stream']);
  }
});

for (const cancelDuringPublication of [false, true]) test(`actual client/assembler ACK timing without a bundle/build; cancel=${cancelDuringPublication}`, async () => {
  // Strip import/export declarations only, execute the unchanged client body,
  // inject the real assembler/auth helper and a synthetic no-storage transport.
  const source = readFileSync(new URL('../src/services/firestoreReadWorkerClient.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export \{[^\n]*\r?\n/gm, '').replace(/^export /gm, '');
  const f = fixture(); let release, publishes = 0, fallback = 0;
  const context = vm.createContext({ setTimeout, clearTimeout, crypto: globalThis.crypto,
    createFirestoreReadWorker: () => f.proxy, decodeFirestoreNativeValue: x => x, decodeFirestoreWorkerValue: x => x,
    retainFirestoreWorkerValue: (a, b) => a === b ? a : b, createWorkerAuthEnvelope, createReadWorkerSnapshotAssembler });
  const createClient = vm.runInContext(source + '\ncreateFirestoreReadWorkerClient;', context);
  const user = { uid: 'u', auth: { app: { name: '[DEFAULT]' } }, getIdToken: async () => {}, toJSON: () => ({ uid: 'u', apiKey: 'key', appName: '[DEFAULT]',
    emailVerified: false, isAnonymous: false, stsTokenManager: { accessToken: 'synthetic', refreshToken: 'synthetic', expirationTime: Date.now() + 60000 } }) };
  const client = createClient({ user, config: { apiKey: 'key', projectId: 'demo' }, appId: 'qa', companyId: 'tenant', accountType: 'employee',
    decode: x => x, retain: (a, b) => b, yieldWork: async () => {}, persistentCache: false, onFallback: () => fallback++ });
  const off = client.subscribe('orders', { publish: () => { publishes++; return new Promise(resolve => { release = resolve; }); }, error: assert.fail, fallback: () => () => {} });
  for (const name of ['customers', 'payments']) client.subscribe(name, { publish() {}, error: assert.fail, fallback: () => () => {} });
  const turn = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    await turn();
    const scopeId = f.children[0].messages[0].scopeId;
    const receive = (lane, message) => f.children[lane].onmessage({ data: { scopeId, ...message } });
    receive(0, { type: 'ready' }); receive(1, { type: 'ready' });
    assert.equal(startedCollections(f).length, 2);
    assert.deepEqual(f.admission.getSnapshot(), { active: 2, queued: 1, closed: false });
    const streamId = f.children[0].messages.find(m => m.type === 'subscribe').streamId;
    receive(0, { type: 'begin', streamId, packetId: 71, revision: 1, mode: 'full', count: 1, changeCount: null, metadata: { fromCache: false, hasPendingWrites: false } });
    await turn();
    assert.equal(f.children[0].messages.filter(m => m.type === 'ack')[0].packetId, 71);
    receive(0, { type: 'chunk', streamId, packetId: 72, revision: 1, index: 0, rows: [{ id: 'fictional-order', type: 'full', value: { amount: 123 } }] });
    await turn();
    assert.equal(f.children[0].messages.filter(m => m.type === 'ack')[1].packetId, 72);
    receive(0, { type: 'complete', streamId, packetId: 73, revision: 1, chunks: 1 });
    await turn(); assert.equal(publishes, 1);
    assert.equal(f.children[0].messages.filter(m => m.type === 'ack').length, 2);
    assert.equal(startedCollections(f).length, 2, 'third initial listener waits throughout publication');
    if (cancelDuringPublication) off();
    release(); await turn();
    const acks = f.children[0].messages.filter(m => m.type === 'ack');
    assert.equal(acks.length, cancelDuringPublication ? 2 : 3);
    if (!cancelDuringPublication) assert.equal(acks[2].packetId, 73);
    assert.equal(startedCollections(f).length, 3, 'only publication ACK or cancellation admits the next initial listener');
    assert.equal(fallback, 0);
    off();
  } finally { if (release) release(); client.close(); }
});
