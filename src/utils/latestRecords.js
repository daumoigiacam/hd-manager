// Same stable descending timestamp order as sort(...).slice(0, limit), retaining
// only `limit` decorated rows rather than sorting/decorating the full history.
export function selectLatestRecords(records, limit, timestamp) {
  if (!Array.isArray(records) || !Number.isSafeInteger(limit) || limit < 0 || typeof timestamp !== 'function') throw new TypeError('Invalid latest-record selection');
  if (limit === 0) return [];
  const heap = [];
  const compare = (a, b) => (b.time - a.time) || (a.index - b.index);
  const siftDown = () => {
    let parent = 0;
    for (;;) {
      let child = parent * 2 + 1;
      if (child >= heap.length) return;
      if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) > 0) child++;
      if (compare(heap[child], heap[parent]) <= 0) return;
      [heap[parent], heap[child]] = [heap[child], heap[parent]];
      parent = child;
    }
  };
  records.forEach((record, index) => {
    const entry = { record, index, time: timestamp(record) || 0 };
    if (heap.length < limit) {
      heap.push(entry);
      let child = heap.length - 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (compare(heap[child], heap[parent]) <= 0) break;
        [heap[parent], heap[child]] = [heap[child], heap[parent]];
        child = parent;
      }
    } else if (compare(entry, heap[0]) < 0) {
      heap[0] = entry;
      siftDown();
    }
  });
  return heap.sort(compare).map(entry => entry.record);
}
