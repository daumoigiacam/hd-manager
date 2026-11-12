// Exact ordered pairs only; locale, options and lifetime belong to the caller.
export function createBoundedCollationCompare(collator, limit = 2048, maxLength = 256) {
  if (typeof collator?.compare !== 'function') throw new TypeError('A collator is required.');
  const compare = collator.compare.bind(collator);
  const pairs = new Map();
  let size = 0;
  return (left, right) => {
    const cacheable = typeof left === 'string' && typeof right === 'string'
      && left.length <= maxLength && right.length <= maxLength && limit > 0;
    if (cacheable) {
      const rights = pairs.get(left);
      if (rights?.has(right)) return rights.get(right);
    }
    const result = compare(left, right);
    // Keep hot pairs when saturated; long-tail misses must not churn the cache.
    if (cacheable && size < limit) {
      let rights = pairs.get(left);
      if (!rights) { rights = new Map(); pairs.set(left, rights); }
      rights.set(right, result);
      size += 1;
    }
    return result;
  };
}
