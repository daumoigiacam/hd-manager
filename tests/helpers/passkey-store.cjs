function memoryStore(initial = {}) {
  const rows = new Map(Object.entries(initial));
  const snapshot = ref => ({ id: ref.id, ref, exists: rows.has(ref.path), data: () => rows.has(ref.path) ? structuredClone(rows.get(ref.path)) : undefined });
  const doc = path => ({
    path, id: path.split('/').at(-1), get: async () => snapshot(doc(path)),
    create: async value => { if (rows.has(path)) throw new Error('already exists'); rows.set(path, structuredClone(value)); },
  });
  const collection = (path, filters = []) => ({
    doc: id => doc(`${path}/${id}`),
    where: (field, op, value) => { if (op !== '==') throw new Error('unsupported query'); return collection(path, [...filters, [field, value]]); },
    get: async () => {
      const docs = [...rows.entries()].filter(([key, data]) => key.startsWith(`${path}/`) && filters.every(([field, value]) => data[field] === value)).map(([key]) => snapshot(doc(key)));
      return { docs, size: docs.length };
    },
  });
  let tail = Promise.resolve();
  return {
    rows, collection,
    runTransaction(callback) {
      const run = tail.then(async () => {
        const writes = [];
        const result = await callback({
          get: async ref => snapshot(ref),
          set: (ref, value) => writes.push(() => rows.set(ref.path, structuredClone(value))),
          create: (ref, value) => writes.push(() => { if (rows.has(ref.path)) throw new Error('already exists'); rows.set(ref.path, structuredClone(value)); }),
          update: (ref, value) => writes.push(() => rows.set(ref.path, { ...rows.get(ref.path), ...structuredClone(value) })),
          delete: ref => writes.push(() => rows.delete(ref.path)),
        });
        writes.forEach(write => write());
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}
module.exports = { memoryStore };
