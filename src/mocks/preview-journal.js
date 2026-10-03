// Preview-only durable patches. The baseline remains compatible with old fixtures.
export function previewJournalPrefix(key, raw = '') {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b, 33) ^ code;
  }
  return `${key}:patch:${raw.length}:${a >>> 0}:${b >>> 0}:`;
}

export function readPreviewJournal(storage, key, baseline) {
  const raw = storage.getItem(key) || '';
  const prefix = previewJournalPrefix(key, raw);
  const names = [];
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (name?.startsWith(prefix)) names.push(name);
  }
  names.sort();
  const result = { ...baseline };
  const copied = new Set();
  for (const name of names) {
    const patches = JSON.parse(storage.getItem(name));
    if (!Array.isArray(patches)) throw new Error('Invalid preview journal');
    for (const { collection, id, value } of patches) {
      if (!copied.has(collection)) {
        result[collection] = { ...(result[collection] || {}) };
        copied.add(collection);
      }
      if (value === null) delete result[collection][id];
      else result[collection][id] = value;
    }
  }
  return result;
}

export function createPreviewJournal(storage, key) {
  const raw = storage.getItem(key) || '';
  const prefix = previewJournalPrefix(key, raw);
  const writer = Math.random().toString(36).slice(2);
  let sequence = 0;
  // Monotonic stamps order several commits in one millisecond and tab reloads.
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (name?.startsWith(prefix)) sequence = Math.max(sequence, Number(name.slice(prefix.length).split(':')[0]) || 0);
  }
  let previous = null;
  let previousKey = null;
  return patches => {
    const serialized = JSON.stringify(patches);
    if (serialized === previous && storage.getItem(previousKey) === serialized && storage.getItem(key) === raw) return;
    if ((storage.getItem(key) || '') !== raw) throw new Error('Preview baseline changed; reload before saving');
    sequence = Math.max(Date.now(), sequence + 1);
    const name = `${prefix}${String(sequence).padStart(16, '0')}:${writer}`;
    // One atomic setItem includes every document in a transaction. Failure rejects.
    storage.setItem(name, serialized);
    previous = serialized;
    previousKey = name;
  };
}
