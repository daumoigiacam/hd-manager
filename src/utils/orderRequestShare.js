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

export const prepareOrderRequestNativeFiles = async (blobs, baseFilename, writeFile) => {
  if (!hasCompleteOrderRequestShareBlobSet(blobs, blobs?.length || 0)) {
    throw new Error('Bộ ảnh đơn đặt hàng chưa đầy đủ. Hãy thử tạo lại ảnh.');
  }
  const uris = [];
  // Serialize base64 conversion to avoid retaining every page's encoded copy.
  const batch = globalThis.crypto.randomUUID();
  for (let index = 0; index < blobs.length; index += 1) {
    const file = await writeFile(`${batch}-${index + 1}-${baseFilename.slice(0, 65)}.png`, blobs[index]);
    if (!file?.uri || uris.includes(file.uri)) {
      throw new Error(`Không chuẩn bị được ảnh ${index + 1}/${blobs.length}. Chưa gửi bộ ảnh.`);
    }
    uris.push(file.uri);
  }
  return uris;
};
