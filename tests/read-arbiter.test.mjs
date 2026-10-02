import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadArbiter } from '../src/services/readArbiter.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('100 identical concurrent reads share one request and one apply', async () => {
  const arbiter = createReadArbiter();
  const gate = deferred();
  let requests = 0;
  let applies = 0;
  const task = async current => { requests++; await gate.promise; if (current()) applies++; };
  const pending = Array.from({ length: 100 }, () => arbiter.run('orders', task));
  await Promise.resolve();
  assert.equal(requests, 1);
  gate.resolve();
  await Promise.all(pending);
  assert.equal(applies, 1);
  await arbiter.run('orders', task);
  assert.equal(requests, 2);
});

test('forced post-write reads coalesce into one fresh trailing request', async () => {
  const arbiter = createReadArbiter();
  const gate = deferred();
  const applied = [];
  let requests = 0;
  const old = arbiter.run('orders', async current => {
    requests++; await gate.promise; if (current()) applied.push('old');
  });
  await Promise.resolve();
  const pending = Array.from({ length: 10 }, () => arbiter.run('orders', current => {
    requests++; if (current()) applied.push('fresh');
  }, { force: true }));
  gate.resolve();
  await Promise.all([old, ...pending]);
  assert.equal(requests, 2);
  assert.deepEqual(applied, ['fresh']);
});

test('new listener data prevents late REST apply or error publication', async () => {
  const arbiter = createReadArbiter();
  const gate = deferred();
  let stale = 0;
  const read = arbiter.run('orders', async current => {
    try { await gate.promise; } catch { if (current()) stale++; }
    if (current()) stale++;
  });
  await Promise.resolve();
  arbiter.invalidate('orders');
  gate.reject(new Error('late transport error'));
  await read;
  assert.equal(stale, 0);
});

test('different resources and tenant scopes do not share requests', async () => {
  const a = createReadArbiter();
  const b = createReadArbiter();
  let count = 0;
  await Promise.all([a.run('orders', () => count++), a.run('customers', () => count++), b.run('orders', () => count++)]);
  assert.equal(count, 3);
});

test('failed reads can retry and queued refresh survives prior failure', async () => {
  const arbiter = createReadArbiter();
  const gate = deferred();
  const old = arbiter.run('orders', () => gate.promise);
  const handled = assert.rejects(old, /offline/);
  const next = arbiter.run('orders', () => 'fresh', { force: true });
  gate.reject(new Error('offline'));
  await handled;
  assert.equal(await next, 'fresh');
  assert.equal(await arbiter.run('orders', () => 'retry'), 'retry');
});

test('50 remount cycles suppress late results and never start queued work after disposal', async () => {
  let stale = 0;
  for (let i = 0; i < 50; i++) {
    const arbiter = createReadArbiter();
    const gate = deferred();
    const old = arbiter.run('orders', async current => { await gate.promise; if (current()) stale++; });
    await Promise.resolve();
    const queued = arbiter.run('orders', () => stale++, { force: true });
    arbiter.dispose();
    gate.resolve();
    await Promise.all([old, queued]);
  }
  assert.equal(stale, 0);
});
