import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupSubscriptionBarrier } from '../src/services/startupSubscriptionPlan.js';

function fixture() {
  let current = true, time = 0, next = 0;
  const timers = new Map(), events = [];
  const barrier = createStartupSubscriptionBarrier({
    start: reason => events.push(['start', reason]), isCurrent: () => current,
    onPending: value => events.push(['pending', value]), now: () => time,
    schedule: (callback, delay) => { timers.set(++next, { callback, at: time + delay }); return next; },
    cancel: id => timers.delete(id),
  });
  const advance = ms => {
    time += ms;
    for (const [id, job] of [...timers]) if (job.at <= time) { timers.delete(id); job.callback(); }
  };
  return { barrier, events, timers, advance, revoke: () => { current = false; } };
}

test('large notification subscription waits for every first-screen confirmed collection', () => {
  const h = fixture();
  h.barrier.confirm('orders'); h.barrier.activate(['orders', 'customers', 'payments']);
  h.advance(100); h.barrier.confirm('customers');
  assert.deepEqual(h.events, [['pending', true]]);
  h.barrier.confirm('payments');
  assert.deepEqual(h.events, [['pending', true], ['start', 'foreground-confirmed'], ['pending', false]]);
  assert.equal(h.timers.size, 0);
  h.barrier.confirm('payments'); h.barrier.activate(['expenses']); h.advance(60000);
  assert.equal(h.events.filter(([name]) => name === 'start').length, 1);
});

test('a missing/denied collection cannot permanently suppress notifications or pretend it confirmed', () => {
  const h = fixture(); h.advance(8000); h.barrier.activate(['orders', 'unavailable']); h.barrier.confirm('orders');
  h.advance(14999); assert.equal(h.events.length, 1);
  h.advance(1); assert.deepEqual(h.events[1], ['start', 'foreground-deadline']);
  assert.equal(h.timers.size, 0);
});

test('no first-screen activation has a bounded bootstrap deadline; later activation cannot extend it', () => {
  const h = fixture(); h.advance(29000); h.barrier.activate(['orders']); h.advance(1000);
  assert.deepEqual(h.events[1], ['start', 'foreground-deadline']);
  const absent = fixture(); absent.advance(30000); assert.deepEqual(absent.events[1], ['start', 'bootstrap-deadline']);
  const empty = fixture(); empty.barrier.activate([]); assert.deepEqual(empty.events[1], ['start', 'foreground-confirmed']);
});

test('logout/tenant replacement cancels pending work and stale callbacks cannot start a listener', () => {
  const h = fixture(), stale = [...h.timers.values()][0].callback;
  h.barrier.activate(['orders']); h.barrier.dispose(); h.barrier.confirm('orders'); stale(); h.advance(60000);
  assert.deepEqual(h.events, [['pending', true], ['pending', false]]); assert.equal(h.timers.size, 0);
  const revoked = fixture(); revoked.revoke(); revoked.barrier.activate([]); revoked.advance(60000);
  assert.equal(revoked.events.filter(([name]) => name === 'start').length, 0);
  revoked.barrier.dispose(); assert.equal(revoked.events.at(-1)[1], false);
});
