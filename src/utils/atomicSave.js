import { coalescePendingWrite, isReplayableJson } from './localFirstSave.js';
export const ATOMIC_SAVE_COLLECTION = '__atomicSave';
const allowed = new Set(['orders', 'payments', 'expenses', 'warehouseImports']);
export function validateAtomicWrites(writes, companyId) {
  if (!companyId || !Array.isArray(writes) || !writes.length || writes.length > 20) throw new Error('Invalid atomic save');
  const keys = new Set();
  for (const write of writes) {
    const key = `${write.collectionName}:${write.documentId}`;
    if (!allowed.has(write.collectionName) || !write.documentId || write.documentId.includes('/')
      || write.payload?.companyId !== companyId || !isReplayableJson(write.payload)
      || keys.has(key) || Object.keys(write.options || {}).some(name => name !== 'merge')
      || (write.options?.merge !== undefined && typeof write.options.merge !== 'boolean')) {
      throw new Error('Invalid or cross-company atomic write');
    }
    keys.add(key);
  }
  return writes;
}
export function mergeAtomicWrites(previous = [], next = []) {
  const merged = new Map(previous.map(write => [`${write.collectionName}:${write.documentId}`, write]));
  for (const write of next) {
    const key = `${write.collectionName}:${write.documentId}`;
    merged.set(key, { ...write, ...coalescePendingWrite(merged.get(key), write.payload, write.options) });
  }
  return [...merged.values()];
}
export const expandPendingWrites = writes => writes.flatMap(write => (
  write.collectionName === ATOMIC_SAVE_COLLECTION ? (write.payload?.writes || []) : [write]
));
export async function commitAtomicWrites({ writes, companyId, transaction, reference }) {
  validateAtomicWrites(writes, companyId);
  await transaction(async tx => {
    for (const write of writes) tx.set(reference(write), write.payload, write.options || {});
  });
}
