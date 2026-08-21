export const isUsableOrderRequestShareBlob = (blob) => (
  Boolean(blob)
  && typeof blob.arrayBuffer === 'function'
  && Number(blob.size || 0) > 0
);

export const hasCompleteOrderRequestShareBlobSet = (blobs, expectedCount) => (
  Array.isArray(blobs)
  && Number.isInteger(expectedCount)
  && expectedCount > 0
  && blobs.length === expectedCount
  && blobs.every(isUsableOrderRequestShareBlob)
);

export const buildOrderRequestShareFiles = (blobs, baseFilename, FileConstructor = globalThis.File) => {
  if (!hasCompleteOrderRequestShareBlobSet(blobs, blobs?.length || 0)) return [];
  if (typeof FileConstructor !== 'function') return [];
  return blobs.map((blob, index) => new FileConstructor(
    [blob],
    `${baseFilename}-trang-${index + 1}.png`,
    { type: blob.type || 'image/png', lastModified: Date.now() }
  ));
};
