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
  const reset = () => { previous = null; };
  const collect = (snapshot, sourceToken = snapshot?.query) => {
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
  return collect;
};
