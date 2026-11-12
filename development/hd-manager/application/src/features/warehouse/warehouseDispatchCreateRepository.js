/** @typedef {{ exists: () => boolean, data: () => unknown }} DispatchSnapshot */
/** @template Reference @typedef {{ get: (reference: Reference) => Promise<DispatchSnapshot>, set: (reference: Reference, value: Record<string, unknown>) => unknown }} DispatchTransaction */
/** @typedef {{ id: string, replay: boolean, payload: Record<string, unknown> }} DispatchCreateResult */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Canonicalize plain command values so field ordering does not change replay identity. @param {unknown} item @returns {unknown} */
function canonicalize(item) {
  if (Array.isArray(item)) return item.map(canonicalize);
  if (isRecord(item)) {
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, canonicalize(item[key])]));
  }
  return item;
}

/**
 * Execute the authoritative idempotent Firestore create transaction.
 * Firebase SDK references are opaque here; the composition root injects its
 * transaction and reference factories while this repository owns validation
 * and replay semantics.
 * @template Reference
 * @param {{
 *   runTransaction: (callback: (transaction: DispatchTransaction<Reference>) => Promise<DispatchCreateResult>) => Promise<DispatchCreateResult>,
 *   reference: () => Reference,
 *   payload: Record<string, unknown>,
 *   companyId: string,
 *   documentId: string
 * }} input
 * @returns {Promise<DispatchCreateResult>}
 */
export function commitIdempotentWarehouseDispatchCreate({ runTransaction, reference, payload, companyId, documentId }) {
  const mutationId = payload.clientMutationId;
  if (typeof mutationId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(mutationId)
    || documentId !== `wd_${companyId}_${mutationId}` || payload.companyId !== companyId) {
    throw new TypeError('Invalid warehouse dispatch mutation identity.');
  }

  const documentReference = reference();
  return runTransaction(async transaction => {
    const snapshot = await transaction.get(documentReference);
    if (snapshot.exists()) {
      const value = snapshot.data();
      if (!isRecord(value)
        || typeof value.companyId !== 'string'
        || typeof value.clientMutationId !== 'string') {
        throw new Error('Warehouse dispatch mutation identity collision.');
      }
      if (value.companyId !== companyId || value.clientMutationId !== mutationId) {
        throw new Error('Warehouse dispatch mutation identity collision.');
      }
      if (JSON.stringify(canonicalize(value)) !== JSON.stringify(canonicalize(payload))) {
        throw new Error('Warehouse dispatch mutation ID was reused for different data.');
      }
      return { id: documentId, replay: true, payload: value };
    }
    transaction.set(documentReference, payload);
    return { id: documentId, replay: false, payload };
  });
}
