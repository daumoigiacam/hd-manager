// Only independent, replayable document writes belong in this policy.
const localFirstCollections = new Set([
  'products', 'orderRequests', 'warehouseDispatches', 'warehouseStockCounts',
  'pricingInputs', 'pricingRules', 'pricingScenarios', 'deliveryReports',
  'customers', 'assets', 'holidays',
]);

const isMap = value => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export const isReplayableJson = (value, parents = new Set()) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) && !isMap(value)) return false;
  if (parents.has(value)) return false;
  parents.add(value);
  const valid = Object.values(value).every(item => isReplayableJson(item, parents));
  parents.delete(value);
  return valid;
};

export const canSaveLocallyFirst = (collection, payload, options = {}) => (
  localFirstCollections.has(collection) && isReplayableJson(payload)
  && !payload.account && !Object.hasOwn(payload, 'password')
  && Object.keys(options).every(key => key === 'merge')
  && (options.merge === undefined || typeof options.merge === 'boolean')
);

// Firestore merge:true merges map leaves, but an explicit empty map replaces it.
export const mergePendingPayload = (previous, patch) => Object.fromEntries([
  ...Object.entries(previous || {}).filter(([key]) => !Object.hasOwn(patch, key)),
  ...Object.entries(patch).map(([key, value]) => [key,
    isMap(value) && Object.keys(value).length > 0 && isMap(previous?.[key])
      ? mergePendingPayload(previous[key], value)
      : value,
  ]),
]);

export const coalescePendingWrite = (previous, payload, options = {}) => {
  if (!previous || options.merge !== true) return { payload, options };
  if (previous.options?.mergeFields || options.mergeFields) {
    throw new Error('Cannot combine field-mask writes in the local queue.');
  }
  const changesReplacedMap = (before, after) => Object.entries(after).some(([key, value]) => (
    isMap(value) && Object.keys(value).length > 0 && Object.hasOwn(before || {}, key)
    && (!isMap(before[key]) || Object.keys(before[key]).length === 0
      || changesReplacedMap(before[key], value))
  ));
  if (previous.options?.merge === true && changesReplacedMap(previous.payload, payload)) {
    // Replaying just the merged leaves could resurrect fields cleared by the first write.
    throw new Error('Please sync the previous map replacement before editing it again.');
  }
  return {
    payload: mergePendingPayload(previous.payload, payload),
    options: previous.options?.merge === true ? { merge: true } : { merge: false },
  };
};
