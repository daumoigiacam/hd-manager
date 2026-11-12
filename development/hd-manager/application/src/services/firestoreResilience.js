export const runResilientFirestoreWrite = async ({
  preferRest = false,
  sdkWrite,
  restWrite,
  isInternalError,
  onSdkInternalError
} = {}) => {
  if (typeof restWrite !== 'function') {
    throw new TypeError('restWrite must be a function');
  }
  if (preferRest) return restWrite();
  if (typeof sdkWrite !== 'function') {
    throw new TypeError('sdkWrite must be a function');
  }

  try {
    return await sdkWrite();
  } catch (error) {
    if (typeof isInternalError !== 'function' || !isInternalError(error)) throw error;
    onSdkInternalError?.(error);
    return restWrite();
  }
};

export const hasActiveRealtimeListener = (activeCollections, collectionName) => (
  Boolean(collectionName)
  && activeCollections instanceof Set
  && activeCollections.has(collectionName)
);
