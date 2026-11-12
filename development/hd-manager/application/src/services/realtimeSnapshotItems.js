const getUniqueIds = docs => {
  const ids = docs.map(doc => doc?.id);
  return ids.every(id => typeof id === 'string' && id.length > 0)
    && new Set(ids).size === ids.length ? ids : null;
};

const getChangedIds = (snapshot, previousIds, finalIds) => {
  if (typeof snapshot.docChanges !== 'function') return null;
  try {
    // Indexes are relative to the result after all preceding changes, not the
    // original snapshot. Default options intentionally exclude metadata changes.
    const changes = snapshot.docChanges();
    if (!Array.isArray(changes)) return null;
    const order = previousIds.slice();
    const present = new Set(order);
    const seen = new Set();
    const changed = new Set();
    for (const change of changes) {
      const id = change?.doc?.id;
      const { type, oldIndex, newIndex } = change || {};
      if (typeof id !== 'string' || !id || seen.has(id)
        || typeof change.doc.data !== 'function'
        || !Number.isInteger(oldIndex) || !Number.isInteger(newIndex)) return null;
      seen.add(id);
      if (type === 'added') {
        if (oldIndex !== -1 || present.has(id)) return null;
      } else if (type === 'modified' || type === 'removed') {
        if (oldIndex < 0 || oldIndex >= order.length || order[oldIndex] !== id) return null;
        order.splice(oldIndex, 1);
        present.delete(id);
      } else {
        return null;
      }
      if (type === 'removed') {
        if (newIndex !== -1) return null;
      } else {
        if (newIndex < 0 || newIndex > order.length) return null;
        order.splice(newIndex, 0, id);
        present.add(id);
        changed.add(id);
      }
    }
    return order.length === finalIds.length
      && order.every((id, index) => id === finalIds[index]) ? changed : null;
  } catch {
    return null;
  }
};

/**
 * Create one collector per query listener source and tenant/lifetime. Feed every
 * snapshot BEFORE shouldApply/cache/metadata early returns, even when its result
 * is not published. If an event is skipped, reset BEFORE processing the next one;
 * docChanges cannot detect skipped data-only events with unchanged IDs/order.
 * collect(snapshot, sourceToken) accepts the captured listener source reference
 * (e.g. collectionRefs[sourceIndex]). Its default is snapshot.query; different
 * default query wrappers conservatively trigger a full mapping. Explicit tokens
 * must identify one source/tenant/listener, never a shared collection name.
 * normalizeData must be pure and independent of snapshot metadata. Unchanged
 * normalized data is reused and must be treated as read-only by callers.
 * Document snapshots retain full-mapping behavior and reset query state.
 */
export const createRealtimeSnapshotItemsCollector = (normalizeData = data => data) => {
  if (typeof normalizeData !== 'function') throw new TypeError('normalizeData must be a function.');
  let previous = null;
  let mappingAsync = false;
  const reset = () => { previous = null; };
  const collect = (snapshot, sourceToken = snapshot?.query) => {
    if (mappingAsync) throw new Error('Concurrent snapshot mapping is not supported.');
    try {
      // The SDK docs getter creates wrappers; access it only once per snapshot.
      const docs = snapshot?.docs;
      if (!Array.isArray(docs)) {
        reset();
        return snapshot?.exists?.()
          ? [{ id: snapshot.id, data: normalizeData(snapshot.data()) }] : [];
      }
      const ids = getUniqueIds(docs);
      const changed = ids && previous && sourceToken === previous.sourceToken
        ? getChangedIds(snapshot, previous.ids, ids) : null;
      const items = docs.map(snapshotDoc => ({
        id: snapshotDoc.id,
        data: changed && !changed.has(snapshotDoc.id)
          ? previous.byId.get(snapshotDoc.id)
          : normalizeData(snapshotDoc.data()),
      }));
      // Commit only after the entire mapping succeeds. Fresh record wrappers
      // keep array/id edits and subsequent updates from mutating old results.
      previous = ids ? {
        ids,
        sourceToken,
        byId: new Map(items.map(item => [item.id, item.data])),
      } : null;
      return items;
    } catch (error) {
      // The next delta is relative to the failed event, so it needs a full read.
      reset();
      throw error;
    }
  };
  collect.collect = collect;
  collect.reset = reset;
  // Only one async mapping may run for a source. Its caller serializes events
  // and aborts on unsubscribe/tenant changes. Never publish a partial snapshot.
  collect.collectAsync = async (snapshot, sourceToken = snapshot?.query, {
    isCurrent = () => true,
    yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)),
    now = () => performance.now(), budgetMs = 4, batchSize = 64,
  } = {}) => {
    if (mappingAsync) throw new Error('Concurrent snapshot mapping is not supported.');
    if (!(budgetMs > 0) || !Number.isFinite(budgetMs) || !Number.isSafeInteger(batchSize) || batchSize < 1) {
      throw new TypeError('Invalid snapshot work budget.');
    }
    mappingAsync = true;
    const check = () => { if (!isCurrent()) throw Object.assign(new Error('Snapshot source changed.'), { name: 'AbortError' }); };
    try {
      check();
      const docs = snapshot?.docs;
      if (!Array.isArray(docs)) {
        reset();
        const items = snapshot?.exists?.() ? [{ id: snapshot.id, data: normalizeData(snapshot.data()) }] : [];
        check();return items;
      }
      const ids = getUniqueIds(docs);
      const changed = ids && previous && sourceToken === previous.sourceToken
        ? getChangedIds(snapshot, previous.ids, ids) : null;
      const items = new Array(docs.length);
      const byId = new Map();
      let deadline = now() + budgetMs;
      for (let index = 0; index < docs.length; index++) {
        check();
        const doc = docs[index];
        const data = changed && !changed.has(doc.id) ? previous.byId.get(doc.id) : normalizeData(doc.data());
        items[index] = { id: doc.id, data };
        byId.set(doc.id, data);
        if (index + 1 < docs.length && ((index + 1) % batchSize === 0 || now() >= deadline)) {
          await yieldWork();check();deadline = now() + budgetMs;
        }
      }
      check();
      previous = ids ? { ids, sourceToken, byId } : null;
      return items;
    } catch (error) { reset();throw error; }
    finally { mappingAsync = false; }
  };
  return collect;
};

/** Bound backpressure to one active + one latest pending SDK snapshot. Dropping
 * an intermediate event invalidates delta reuse, even with identical IDs/order.
 * Metadata/ACK processing runs only after complete mapping and scope validation.
 */
export function createRealtimeSnapshotPipeline({ collect, publish, onError = () => {},
  isCurrent = () => true, yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)),
  now, budgetMs = 4, batchSize = 64 }) {
  let pending = null, running = false, disposed = false;
  const valid = () => !disposed && isCurrent();
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending && valid()) {
        const event = pending;pending = null;
        if (event.reset) collect.reset();
        try {
          // Yield before the first data() clone so a navigation/input event
          // already in progress can finish before bulk hydration begins.
          await yieldWork();
          if (!valid()) break;
          const items = await collect.collectAsync(event.snapshot, event.sourceToken,
            { isCurrent: valid, yieldWork, now, budgetMs, batchSize });
          if (valid()) await publish(event.snapshot, items);
        } catch (error) {
          collect.reset();
          if (pending) pending.reset = true;
          if (valid()) {
            try { await onError(error); } catch { /* Do not leak an event callback rejection. */ }
          }
        }
      }
    } finally { running = false;if (!valid()) pending = null; }
  }
  return {
    enqueue(snapshot, sourceToken) {
      if (!valid()) return;
      const reset = Boolean(pending);
      pending = { snapshot, sourceToken, reset };
      void drain();
    },
    dispose() { disposed = true;pending = null;collect.reset(); },
    get pendingCount() { return pending ? 1 : 0; },
  };
}

/** Normalized snapshot objects are immutable within one tenant/read lifetime.
 * Reusing unchanged record wrappers avoids deep-comparing/cloning all fields on
 * every metadata ACK. Parser/source/id changes always materialize a new record.
 * Weak keys do not retain removed snapshots, and no cache crosses tenants.
 */
export function createSnapshotRecordMaterializer() {
  const records = new WeakMap();
  return (id, data, parser = null) => {
    const cacheable = data !== null && typeof data === 'object';
    const cached = cacheable ? records.get(data) : null;
    if (cached && cached.id === id && cached.parser === parser) return cached.record;
    const record = { id, ...(parser ? parser(data) : data) };
    if (cacheable) records.set(data, { id, parser, record });
    return record;
  };
}

// Prepare complete immutable records outside React's state updater. Returning
// a partial array/object would expose incomplete totals, so only return at end.
export async function materializeSnapshotRecords(items, materialize, {
  isObject = false, isCurrent = () => true,
  yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)),
  now = () => performance.now(), budgetMs = 4, batchSize = 64,
} = {}) {
  if (!Array.isArray(items) || typeof materialize !== 'function' || !(budgetMs > 0)
    || !Number.isFinite(budgetMs) || !Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new TypeError('Invalid record materialization budget.');
  }
  const check = () => { if (!isCurrent()) throw Object.assign(new Error('Record materialization superseded.'), {name:'AbortError'}); };
  check();
  await yieldWork();check();
  const result = isObject ? {} : [];
  let deadline = now() + budgetMs, count = 0;
  for (const {id,data} of items) {
    check();const record = materialize(id,data);
    if (isObject) Object.defineProperty(result,id,{value:record,writable:true,enumerable:true,configurable:true});
    else result.push(record);
    if (++count >= batchSize || now() >= deadline) {
      await yieldWork();check();count = 0;deadline = now() + budgetMs;
    }
  }
  check();return result;
}
