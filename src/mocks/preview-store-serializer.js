// Mock mutations replace collections; unchanged identities retain their JSON.
// The final envelope stays one atomic localStorage value for legacy recovery.
export function createPreviewStoreSerializer() {
  const collections = new WeakMap();
  return store => {
    const fields = Object.entries(store).flatMap(([name, collection]) => {
      let encoded;
      if (collection && typeof collection === 'object') {
        if (!collections.has(collection)) collections.set(collection, JSON.stringify(collection));
        encoded = collections.get(collection);
      } else {
        encoded = JSON.stringify(collection);
      }
      return encoded === undefined ? [] : [`${JSON.stringify(name)}:${encoded}`];
    });
    return `{${fields.join(',')}}`;
  };
}
