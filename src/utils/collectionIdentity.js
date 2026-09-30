const isPlainRecord = value => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

// Repeated server/cache snapshots must not invalidate every derived view.
// Compare every field, including deletion and local sync markers. Unknown SDK
// instances remain changed rather than risking a false equality decision.
export function retainCollectionIdentity(previous, next, depth = 0) {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || depth > 64) return next;
  const array = Array.isArray(next);
  if (array !== Array.isArray(previous)) return next;
  if (array) {
    if (previous.length !== next.length) return next;
  } else if (!isPlainRecord(previous) || !isPlainRecord(next)
    || Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next)) return next;

  const keys = Object.keys(next);
  let equal = keys.length === Object.keys(previous).length;
  let result = next;
  for (const key of keys) {
    if (!Object.hasOwn(previous, key)) { equal = false; continue; }
    const value = retainCollectionIdentity(previous[key], next[key], depth + 1);
    if (!Object.is(value, previous[key])) equal = false;
    if (!Object.is(value, next[key])) {
      if (result === next) result = array ? next.slice() : Object.setPrototypeOf({ ...next }, Object.getPrototypeOf(next));
      Object.defineProperty(result, key, { value, writable: true, enumerable: true, configurable: true });
    }
  }
  return equal ? previous : result;
}
