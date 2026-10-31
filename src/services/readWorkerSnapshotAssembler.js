const abort = () => Object.assign(new Error('Read-worker subscription was closed.'), { name: 'AbortError' });
const invalid = () => { throw new Error('Invalid or incomplete read-worker snapshot.'); };

// A stream publishes complete snapshots only. Incoming chunks cannot mutate the
// committed array or a record already used by a view/pending local save.
export function createReadWorkerSnapshotAssembler({ decode, retain, initialItems = [],
  yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)), now = () => performance.now(), budgetMs = 4,
} = {}) {
  if (typeof decode !== 'function' || typeof retain !== 'function' || !Array.isArray(initialItems)
    || !Number.isFinite(budgetMs) || budgetMs <= 0) throw new TypeError('Invalid read-worker assembler configuration.');
  let committed = initialItems, revision = 0, current = null, active = true;
  const check = transfer => { if (!active || (transfer && current !== transfer)) throw abort(); };
  const work = async (values, apply, transfer) => {
    let deadline = now() + budgetMs;
    for (const value of values) {
      check(transfer);apply(value);
      if (now() >= deadline) { await yieldWork();check(transfer);deadline = now() + budgetMs; }
    }
  };
  return {
    async begin(message) {
      check();
      if (current || !Number.isSafeInteger(message.revision) || message.revision <= revision
        || !Number.isSafeInteger(message.count) || message.count < 0
        || !(Number.isSafeInteger(message.changeCount) && message.changeCount >= 0
          || message.mode === 'full' && message.changeCount === null)
        || !['full','delta','metadata'].includes(message.mode)
        || typeof message.metadata?.fromCache !== 'boolean' || typeof message.metadata?.hasPendingWrites !== 'boolean') return invalid();
      if (message.mode !== 'full' && (message.revision !== revision + 1 || revision === 0)) return invalid();
      if (message.mode === 'metadata' && (message.count !== committed.length || message.changeCount !== 0)) return invalid();
      const transfer = { ...message, nextChunk: 0, seen: new Set(), byId: new Map(),
        rows: message.mode === 'full' ? [] : message.mode === 'metadata' ? committed : committed.slice() };
      current = transfer;
      if (message.mode !== 'metadata') await work(committed, item => {
        if (!item || typeof item.id !== 'string' || transfer.byId.has(item.id)) return invalid();
        transfer.byId.set(item.id,item);
      }, transfer);
    },
    async chunk(message) {
      const transfer = current;check(transfer);
      if (!transfer || message.revision !== transfer.revision || message.index !== transfer.nextChunk
        || !Array.isArray(message.rows) || message.rows.length > 64 || transfer.mode === 'metadata') return invalid();
      await work(message.rows, row => {
        if (!row || typeof row.id !== 'string' || !row.id || transfer.seen.has(row.id)) return invalid();
        transfer.seen.add(row.id);
        let item;
        if (row.type !== 'removed') {
          const data = decode(row.value), old = transfer.byId.get(row.id);
          const retained = old ? retain(old.data,data) : data;
          item = old && retained === old.data ? old : { id: row.id, data: retained };
        }
        if (transfer.mode === 'full') {
          if (row.type !== 'full') return invalid();
          transfer.rows.push(item);return;
        }
        if (!Number.isInteger(row.oldIndex) || !Number.isInteger(row.newIndex)) return invalid();
        if (row.type === 'modified' || row.type === 'removed') {
          if (row.oldIndex < 0 || transfer.rows[row.oldIndex]?.id !== row.id) return invalid();
          transfer.rows.splice(row.oldIndex,1);
        } else if (row.type !== 'added' || row.oldIndex !== -1 || transfer.rows.some(item=>item.id===row.id)) return invalid();
        if (row.type === 'removed') { if (row.newIndex !== -1) return invalid(); }
        else {
          if (row.newIndex < 0 || row.newIndex > transfer.rows.length) return invalid();
          transfer.rows.splice(row.newIndex,0,item);
        }
      },transfer);
      check(transfer);transfer.nextChunk++;
    },
    finish(message) {
      const transfer = current;check(transfer);
      if (!transfer || message.revision !== transfer.revision || message.chunks !== transfer.nextChunk
        || transfer.rows.length !== transfer.count
        || (transfer.mode === 'delta' && transfer.seen.size !== transfer.changeCount)) return invalid();
      const next = transfer.rows;
      if (next.length !== committed.length || next.some((item,index)=>item!==committed[index])) committed=next;
      revision=transfer.revision;current=null;
      return { items: committed, snapshot: { kind:'hd-firestore-worker-snapshot-v1',
        metadata:transfer.metadata, dataChangeCount:transfer.changeCount, revision } };
    },
    close() { active=false;current=null;committed=[]; },
  };
}
