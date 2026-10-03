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

// Match only unambiguous stored-record IDs; keep the incoming array's order.
// Other inputs retain the existing positional/conservative behavior.
export function retainCollectionRecordIdentity(previous, next) {
  if (!Array.isArray(previous) || !Array.isArray(next)) return retainCollectionIdentity(previous, next);
  const lookup = rows => {
    const byId = new Map();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row || typeof row !== 'object' || !isPlainRecord(row) || !Object.hasOwn(row, 'id')) return null;
      const id = row.id;
      if (!((typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && Number.isFinite(id)))) return null;
      if (byId.has(id)) return null;
      byId.set(id, row);
    }
    return byId;
  };
  const previousById = lookup(previous);
  if (!previousById || !lookup(next)) return retainCollectionIdentity(previous, next);
  let result = next;
  let unchanged = previous.length === next.length;
  next.forEach((row, index) => {
    const retained = previousById.has(row.id) ? retainCollectionIdentity(previousById.get(row.id), row) : row;
    if (!Object.is(retained, previous[index])) unchanged = false;
    if (!Object.is(retained, row)) {
      if (result === next) result = next.slice();
      result[index] = retained;
    }
  });
  return unchanged ? previous : result;
}
