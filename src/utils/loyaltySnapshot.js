const auditFields = new Set(['lastSyncedAt', 'updatedAt', 'updatedBy', 'pendingRewardCheckedAt', 'history']);

export function hasLoyaltySnapshotChanges(existing = {}, next = {}) {
  return Object.keys(next).some(key => !auditFields.has(key)
    && JSON.stringify(existing[key]) !== JSON.stringify(next[key]));
}
