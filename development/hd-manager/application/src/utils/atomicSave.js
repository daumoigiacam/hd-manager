import { coalescePendingWrite, isReplayableJson } from './localFirstSave.js';
export const ATOMIC_SAVE_COLLECTION = '__atomicSave';
const allowed = new Set(['orders', 'payments', 'expenses', 'financials', 'warehouseImports', 'deliveryReports', 'assetCostLogs', 'notifications', 'zalo_campaign_queue']);
export function validateAtomicWrites(writes, companyId) {
  if (!companyId || !Array.isArray(writes) || !writes.length || writes.length > 20) throw new Error('Invalid atomic save');
  const keys = new Set();
  for (const write of writes) {
    const key = `${write.collectionName}:${write.documentId}`;
    if (!allowed.has(write.collectionName) || !write.documentId || write.documentId.includes('/')
      || write.payload?.companyId !== companyId || !isReplayableJson(write.payload)
      || keys.has(key) || (write.ifAbsent !== undefined && write.ifAbsent !== true)
      || (write.ifAbsent && !['payments', 'financials', 'notifications', 'zalo_campaign_queue'].includes(write.collectionName))
      || (write.resolveOnce !== undefined && (write.resolveOnce !== true || write.collectionName !== 'deliveryReports'
        || !['accepted', 'rejected', 'lost_charged'].includes(write.payload.resolutionStatus)))
      || Object.keys(write.options || {}).some(name => name !== 'merge')
      || (write.options?.merge !== undefined && typeof write.options.merge !== 'boolean')) {
      throw new Error('Invalid or cross-company atomic write');
    }
    keys.add(key);
  }
  return writes;
}
export function mergeAtomicWrites(previous = [], next = []) {
  const merged = new Map(previous.map(write => [`${write.collectionName}:${write.documentId}`, write]));
  for (const write of next) {
    const key = `${write.collectionName}:${write.documentId}`;
    merged.set(key, { ...write, ...coalescePendingWrite(merged.get(key), write.payload, write.options) });
  }
  return [...merged.values()];
}
export const expandPendingWrites = writes => writes.flatMap(write => (
  write.collectionName === ATOMIC_SAVE_COLLECTION ? (write.payload?.writes || []) : [write]
));
export async function commitAtomicWrites({ writes, companyId, transaction, reference }) {
  validateAtomicWrites(writes, companyId);
  return transaction(async tx => {
    const resolution = writes.findIndex(write => write.resolveOnce);
    const existing = await Promise.all(writes.map(write => write.ifAbsent || resolution >= 0 ? tx.get(reference(write)) : null));
    if (resolution >= 0) {
      const snapshot = existing[resolution];
      const data = snapshot?.exists() ? snapshot.data() : null;
      if (!data || data.companyId !== companyId) throw new Error('Không tìm thấy báo cáo giao hàng của công ty này.');
      if (['accepted', 'rejected', 'lost_charged'].includes(data.resolutionStatus)) {
        const patch = writes[resolution].payload;
        if (['resolutionStatus', 'linkedOrderId', 'penaltyEmpId', 'penaltyAmount'].some(field => String(data[field] ?? '') !== String(patch[field] ?? ''))) {
          const error = new Error('Báo cáo đã được xử lý với quyết định khác. Hãy kiểm tra dữ liệu mới.');
          error.code = 'firestore/delivery-resolution-conflict';
          throw error;
        }
        // Replaying a completed resolution must not overwrite an order edited later.
        return { existingDocuments: writes.flatMap((write, i) => existing[i]?.exists() ? [{ ...write, payload: existing[i].data() }] : []) };
      }
    }
    const existingDocuments = [];
    for (const [index, write] of writes.entries()) {
      if (write.ifAbsent && existing[index]?.exists()) {
        const data = existing[index].data();
        if (data.companyId !== companyId) throw new Error('Cross-company command collision');
        if (write.collectionName === 'payments'
          && ['amount', 'customerId', 'method', 'orderId', 'date', 'relatedDeliveryReportId', 'sourceDeliveryReportId', 'sourceWarehouseImportId'].some(field => String(data[field] ?? '') !== String(write.payload[field] ?? ''))) {
          const error = new Error('Mã khoản thu đã được sử dụng với thông tin khác. Hãy kiểm tra khoản đã lưu trước khi tạo khoản mới.');
          error.code = 'firestore/payment-command-conflict';
          throw error;
        }
        if (write.collectionName === 'financials'
          && ['empId', 'type', 'amount', 'date', 'sourceDeliveryReportId'].some(field => String(data[field] ?? '') !== String(write.payload[field] ?? ''))) {
          const error = new Error('Khoản lương/thưởng/phạt này đã được lưu với thông tin khác.');
          error.code = 'firestore/financial-command-conflict';
          throw error;
        }
        existingDocuments.push({ ...write, payload: data });
      } else tx.set(reference(write), write.payload, write.options || {});
    }
    return { existingDocuments };
  });
}
