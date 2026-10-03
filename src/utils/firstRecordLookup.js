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
