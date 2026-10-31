export function canUseFirestoreReadWorker(collectionName, sourceCount, customerSession) {
  return !customerSession && sourceCount === 1 && typeof collectionName === 'string'
    && /^[A-Za-z_]+$/.test(collectionName)
    && !['companies','employees','messages'].includes(collectionName);
}
