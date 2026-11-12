export function canUseFirestoreReadWorker(collectionName, sourceCount, customerSession) {
  return !customerSession && sourceCount === 1 && typeof collectionName === 'string'
    && /^[A-Za-z_]+$/.test(collectionName);
}

// Preserve required sources and listener bound. A persistent history should not
// fall onto a complete REST scan while a tiny directory occupies its live slot.
export function prioritizePersistentReadSources(names,canPersist) {
  return [...names.filter(name=>canPersist(name)),...names.filter(name=>!canPersist(name))];
}
