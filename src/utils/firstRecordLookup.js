// Match Array.find's first record, including legacy duplicate IDs.
export function buildFirstRecordLookup(records = []) {
  const lookup = new Map();
  for (const record of records) {
    const id = record.id;
    if (typeof id === 'number' && Number.isNaN(id)) continue;
    if (!lookup.has(id)) lookup.set(id, record);
  }
  return lookup;
}

// Opt in only for immutable snapshot arrays. Weak keys release the lookup with
// its source; no cross-source/ID/name heuristics and no mutable default cache.
export function createImmutableFirstRecordLookupSelector() {
  const snapshots=new WeakMap();
  return records=>{
    if(!snapshots.has(records))snapshots.set(records,buildFirstRecordLookup(records));
    return snapshots.get(records);
  };
}
