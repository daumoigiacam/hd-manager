// Retain ordering, never old row values. Equal comparisons use the current input
// position so stable-sort semantics survive insertions and source reordering.
export function createIncrementalStableSorter(compare, keyOf) {
  let previous = [];
  let byKey = new Map();
  return rows => {
    const current = new Map();
    let duplicate = false;
    const entries = rows.map((row, index) => {
      const key = keyOf(row);
      if (current.has(key)) duplicate = true;
      const entry = { key, row, index };
      current.set(key, entry);
      return entry;
    });
    const order = (a, b) => compare(a.row, b.row) || a.index - b.index;
    let result;
    if (duplicate || !previous.length) {
      result = entries.sort(order);
    } else {
      const kept = [];
      const changed = [];
      for (const entry of entries) {
        const old = byKey.get(entry.key);
        if (!old || (old.row !== entry.row && compare(old.row, entry.row) !== 0)) changed.push(entry);
      }
      const changedKeys = new Set(changed.map(entry => entry.key));
      for (const old of previous) {
        const entry = current.get(old.key);
        if (entry && !changedKeys.has(entry.key)) kept.push(entry);
      }
      // Reordered equal-key rows must follow the new source order, not history.
      if (kept.some((entry, index) => index && order(kept[index - 1], entry) > 0)) kept.sort(order);
      changed.sort(order);
      result = [];
      let left = 0;
      let right = 0;
      while (left < kept.length && right < changed.length) {
        result.push(order(kept[left], changed[right]) <= 0 ? kept[left++] : changed[right++]);
      }
      while (left < kept.length) result.push(kept[left++]);
      while (right < changed.length) result.push(changed[right++]);
    }
    previous = duplicate ? [] : result;
    byKey = duplicate ? new Map() : current;
    return result.map(entry => entry.row);
  };
}
