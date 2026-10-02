import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadLifecycle } from '../src/services/readLifecycle.js';

test('successful reads and errors release their scope', async () => {
  const scope = createReadLifecycle();
  assert.equal(await scope.run(() => 42), 42);
  await assert.rejects(scope.run(() => { throw new Error('bad JSON'); }), /bad JSON/);
  assert.equal(await scope.run(() => 43), 43);
  scope.dispose();
  await assert.rejects(scope.run(() => 44), { name: 'AbortError' });
});

test('timeout aborts underlying transport', async () => {
  const scope = createReadLifecycle();
  let signal;
  await assert.rejects(scope.run(s => { signal = s; return new Promise(() => {}); }, 5), { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  scope.dispose();
});

test('50 session cleanup cycles abort every active read', async () => {
  for (let i = 0; i < 50; i++) {
    const scope = createReadLifecycle();
    let signal;
    const read = scope.run(s => { signal = s; return new Promise(() => {}); });
    await Promise.resolve();
    scope.dispose();
    await assert.rejects(read, { name: 'AbortError' });
    assert.equal(signal.aborted, true);
  }
});
