// This metadata locates an existing encrypted database; it grants no access.
// A permission revision change requires explicit reconciliation, never a new
// empty database that hides immutable commands from the previous revision.
export function assertOfflineDatabaseBinding(binding, expected) {
  if (binding === null) return;
  if (!binding || binding.version !== 1 || typeof binding.databaseName !== 'string'
    || !/^hd_offline_[a-f0-9]{64}$/.test(binding.databaseName)
    || ['projectId','tenantId','principalId'].some(k => binding[k] !== expected[k])) {
    throw new Error('Invalid encrypted Offline database binding');
  }
  if (binding.permissionRevision !== expected.permissionRevision) {
    throw Object.assign(new Error('Phiên bản quyền đã thay đổi. Database và giao dịch cũ được giữ nguyên; cần đối soát quyền trước khi mở lại.'), {code:'offline-scope-reconciliation-required'});
  }
}
