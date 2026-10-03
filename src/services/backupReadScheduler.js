export async function collectBackupCollections({
  collectionNames, readCollection, normalizeRecord, includeRecord,
  isCurrent = () => true, yieldWork = () => new Promise(resolve => setTimeout(resolve, 0)),
  chunkSize = 100,
}) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new TypeError('Invalid backup chunk size.');
  const check = () => {
    if (!isCurrent()) throw Object.assign(new Error('Backup session changed.'), { name: 'AbortError' });
  };
  const checkpoint = async () => { check(); await yieldWork(); check(); };
  const entries = [];
  for (const name of collectionNames) {
    await checkpoint();
    const documents = await readCollection(name);
    check();
    const records = [];
    for (let index = 0; index < documents.length; index++) {
      if (index > 0 && index % chunkSize === 0) await checkpoint();
      const record = normalizeRecord(documents[index]);
      if (includeRecord(name, record)) records.push(record);
    }
    entries.push([name, records]);
  }
  check();
  return entries;
}
