/** Write the existing JSON backup schema without retaining the whole company or
 * passing one large JSON string through the native bridge. Sink.commit publishes
 * a completed pending file (MediaStore or rename); sink.abort removes only its own
 * unpublished output.
 */
export async function writeAutomaticBackupStream({
  metadata, companyRecords, collectionNames, readPages, includeRecord,
  sink, isCurrent = () => true, yieldWork = async () => {}, chunkCharacters = 65536,
}) {
  if (!Number.isSafeInteger(chunkCharacters) || chunkCharacters < 1) throw new TypeError('Invalid backup chunk size.');
  if (!Array.isArray(collectionNames) || new Set(collectionNames).size !== collectionNames.length
    || collectionNames.some(name => typeof name !== 'string' || !name || name === 'companies')) {
    throw new TypeError('Invalid backup collections.');
  }
  const check = () => {
    if (!isCurrent()) throw Object.assign(new Error('Backup session changed.'), { name: 'AbortError' });
  };
  const checkpoint = async () => { check(); await yieldWork(); check(); };
  let recordCount = 0;
  try {
    await checkpoint();
    const header = JSON.stringify(metadata);
    if (!header?.startsWith('{') || Object.hasOwn(metadata, 'collections')) throw new TypeError('Invalid backup metadata.');
    await sink.write(`${header.slice(0, -1)},"collections":{"companies":${JSON.stringify(companyRecords)}`);
    check();
    for (const name of collectionNames) {
      await checkpoint();
      await sink.append(`,${JSON.stringify(name)}:[`);
      check();
      let first = true;
      await readPages(name, async items => {
        await checkpoint();
        let buffer = '';
        for (const item of items) {
          check();
          const record = { id: item.id, ...item.data };
          if (!includeRecord(name, record)) continue;
          const serialized = JSON.stringify(record);
          buffer += `${first ? '' : ','}${serialized}`;
          first = false;
          recordCount++;
          // A single Firestore record can exceed the chunk target. Its string
          // remains intact, including escaped/supplementary Unicode characters.
          if (buffer.length >= chunkCharacters) {
            await sink.append(buffer);
            check();
            buffer = '';
          }
        }
        if (buffer) { await sink.append(buffer); check(); }
      });
      check();
      await sink.append(']');
    }
    check();
    await sink.append('}}');
    check();
    const saved = await sink.commit();
    check();
    return { ...saved, recordCount };
  } catch (error) {
    try { await sink.abort(); } catch { /* Preserve the read/write/tenant error. */ }
    throw error;
  }
}
