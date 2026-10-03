import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoundedCollationCompare } from '../src/services/collationCompareCache.js';

test('Vietnamese numeric ordering matches Intl for every ordered pair and repeated sorts', () => {
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  let calls = 0;
  const compare = createBoundedCollationCompare({ compare: (a, b) => {
    calls += 1;
    return collator.compare(a, b);
  } });
  const labels = ['', 'Gà 2', 'Gà 10', 'ga 2', 'Đức', 'Duc', '01', '1', '1,5', 'Vịt', '💬', 'a__b', 'a'];
  for (const a of labels) for (const b of labels) assert.equal(compare(a, b), collator.compare(a, b));
  const firstCalls = calls;
  assert.equal(firstCalls, labels.length ** 2);
  for (let n = 0; n < 5; n += 1) {
    const rows = Array.from({ length: 4500 }, (_, i) => ({ label: labels[i % labels.length], i }));
    assert.deepEqual(rows.slice().sort((a, b) => compare(a.label, b.label)),
      rows.slice().sort((a, b) => collator.compare(a.label, b.label)));
  }
  assert.equal(calls, firstCalls, 'Repeated comparisons perform no additional collation work');
});

test('ordered pair keys cannot collide, including delimiters and empty strings', () => {
  let calls = 0;
  const compare = createBoundedCollationCompare({ compare: () => ++calls });
  assert.equal(compare('a__b', 'c'), 1);
  assert.equal(compare('a', 'b__c'), 2);
  assert.equal(compare('', '__'), 3);
  assert.equal(compare('__', ''), 4);
  assert.equal(compare('a__b', 'c'), 1);
  assert.equal(compare('c', 'a__b'), 5, 'Do not infer reverse result magnitude');
});

test('pair bound stops admission without changing results; long and coercible inputs bypass caching', () => {
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  let calls = 0;
  const compare = createBoundedCollationCompare({ compare: (a, b) => {
    calls += 1;
    return collator.compare(a, b);
  } }, 2, 8);
  compare('a', 'b'); compare('a', 'c'); compare('a', 'd'); compare('a', 'b');
  assert.equal(calls, 3, 'Saturation preserves the first cached pair instead of flushing it');
  let conversions = 0;
  const coercible = { toString() { conversions += 1; return conversions % 2 ? 'a' : 'z'; } };
  assert.equal(compare(coercible, 'm'), collator.compare('a', 'm'));
  assert.equal(compare(coercible, 'm'), collator.compare('z', 'm'));
  assert.equal(conversions, 2);
  compare('long label', 'x'); compare('long label', 'x');
  assert.equal(calls, 7);
  assert.throws(() => compare(Symbol('a'), 'm'), TypeError);
  assert.throws(() => createBoundedCollationCompare(null), TypeError);
});

test('long-tail sorting cannot evict hot pairs or grow the bounded cache', () => {
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  let calls = 0;
  const compare = createBoundedCollationCompare({ compare: (a, b) => {
    calls += 1;
    return collator.compare(a, b);
  } }, 2);
  compare('hot 1', 'hot 2');
  compare('hot 2', 'hot 1');
  for (let i = 0; i < 4500; i++) {
    assert.equal(compare(`Customer ${i}`, `Product ${i}`), collator.compare(`Customer ${i}`, `Product ${i}`));
    assert.equal(compare('hot 1', 'hot 2'), collator.compare('hot 1', 'hot 2'));
  }
  assert.equal(calls, 4502, 'One direct miss per long-tail pair; hot pairs still hit at capacity');
  compare('Customer 4499', 'Product 4499');
  assert.equal(calls, 4503, 'An uncached pair remains uncached after saturation');
});

test('a new lifetime has no shared pair cache', () => {
  let calls = 0;
  const collator = { compare: () => ++calls };
  const first = createBoundedCollationCompare(collator);
  const second = createBoundedCollationCompare(collator);
  assert.equal(first('a', 'b'), 1);
  assert.equal(second('a', 'b'), 2);
  assert.equal(first('a', 'b'), 1);
});
