import { coalescePendingWrite, isReplayableJson } from './localFirstSave.js';
import { assertDeliveryCashflowWrite, deliveryCashflowRevision, isDeliveryCashflowRevision, isPendingDeliveryCashflow } from './deliveryCashflow.js';
import {commitAssetAtomicWrites,isAssetCommand,isAssetDocumentRevision,validateAssetAtomicWrites} from './assetMutationIntegrity.js';
import {commitOrderCreationWrites,isOrderCreationCommand,validateOrderCreationWrites} from './orderCreationCommand.js';
export const ATOMIC_SAVE_COLLECTION = '__atomicSave';
const allowed = new Set(['orders', 'payments', 'expenses', 'financials', 'warehouseImports', 'deliveryReports', 'assets', 'assetCostLogs', 'notifications', 'zalo_campaign_queue']);
const plainRecord = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isDeliveryCommand = value => plainRecord(value) && Reflect.ownKeys(value).length === 2
  && ['id', 'fingerprint'].every(field => Object.hasOwn(value, field)
    && Object.getOwnPropertyDescriptor(value, field).enumerable
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), 'value'))
  && typeof value.id === 'string' && /^[A-Za-z0-9_-]+$/.test(value.id)
  && typeof value.fingerprint === 'string' && value.fingerprint.length > 0
  && value.fingerprint.trim() === value.fingerprint;
const sameMetadata = (left, right) => Object.keys(left).length === Object.keys(right).length
  && Object.keys(left).every(field => Object.hasOwn(right, field) && left[field] === right[field]);
const commandMatches = (value, command) => isDeliveryCommand(value) && sameMetadata(value, command);
const cashflowConflict = () => Object.assign(new Error('Khoản thu/chi giao hàng đã thay đổi hoặc đã được duyệt. Hãy tải dữ liệu mới để đối soát trước khi lưu.'), {
  code: 'firestore/delivery-cashflow-conflict',
});

export function validateAtomicWrites(writes, companyId) {
  if (!companyId || !Array.isArray(writes) || !writes.length || writes.length > 20) throw new Error('Invalid atomic save');
  const hasAssetCommand=writes.some(write=>write&&Object.hasOwn(write,'assetCommand'));
  if(hasAssetCommand)validateAssetAtomicWrites(writes,companyId);
  const hasOrderCommand=writes.some(write=>write&&Object.hasOwn(write,'orderCreationCommand'));
  if(hasOrderCommand)validateOrderCreationWrites(writes,companyId);
  const keys = new Set();
  const command = writes.find(write => write && Object.hasOwn(write, 'deliveryCommand'))?.deliveryCommand;
  const hasCommand = writes.some(write => write && Object.hasOwn(write, 'deliveryCommand'));
  if (hasCommand && !isDeliveryCommand(command)) throw new Error('Invalid delivery command metadata');
  for (const write of writes) {
    if (!plainRecord(write)) throw new Error('Invalid atomic write');
    const key = `${write.collectionName}:${write.documentId}`;
    if (!allowed.has(write.collectionName) || typeof write.documentId !== 'string' || !write.documentId || write.documentId.includes('/')
      || !plainRecord(write.payload) || write.payload.companyId !== companyId || !isReplayableJson(write.payload)
      || keys.has(key) || (write.ifAbsent !== undefined && write.ifAbsent !== true)
      || (write.ifAbsent && !['payments', 'financials', 'notifications', 'zalo_campaign_queue'].includes(write.collectionName))
      || (Object.hasOwn(write, 'expectedDeliveryCashflow') && (!['payments', 'expenses'].includes(write.collectionName)
        || !isDeliveryCashflowRevision(write.expectedDeliveryCashflow)))
      || (hasCommand && !commandMatches(write.deliveryCommand, command))
      || (write.collectionName==='assets'&&!hasAssetCommand)
      || (!hasAssetCommand&&(Object.hasOwn(write,'expectedAssetDocument')||Object.hasOwn(write.payload,'lastAssetCommand')))
      || (Object.hasOwn(write.payload, 'lastDeliveryCommand') && (!isDeliveryCommand(write.payload.lastDeliveryCommand)
        || (hasCommand && !commandMatches(write.payload.lastDeliveryCommand, command))))
      || (write.resolveOnce !== undefined && (write.resolveOnce !== true || write.collectionName !== 'deliveryReports'
        || !['accepted', 'rejected', 'lost_charged'].includes(write.payload.resolutionStatus)))
      || Object.keys(write.options || {}).some(name => name !== 'merge')
      || (write.options?.merge !== undefined && typeof write.options.merge !== 'boolean')) {
      throw new Error('Invalid or cross-company atomic write');
    }
    if (write.expectedDeliveryCashflow) {
      assertDeliveryCashflowWrite({ ...write.expectedDeliveryCashflow, companyId }, write.payload);
      if (write.options?.merge !== true
        && ['relatedDeliveryReportId', 'approvalStatus', 'requiresApproval', 'handoverStatus'].some(field => !Object.hasOwn(write.payload, field))) {
        throw new Error('A guarded replacement must preserve delivery approval metadata');
      }
    }
    keys.add(key);
  }
  return writes;
}
export function mergeAtomicWrites(previous = [], next = []) {
  const merged = new Map();
  for (const write of [...previous, ...next]) {
    const key = `${write.collectionName}:${write.documentId}`;
    const prior = merged.get(key);
    for (const [field, valid] of [['expectedDeliveryCashflow', isDeliveryCashflowRevision], ['deliveryCommand', isDeliveryCommand],
      ['expectedAssetDocument',isAssetDocumentRevision],['assetCommand',isAssetCommand],['orderCreationCommand',isOrderCreationCommand]]) {
      if (Object.hasOwn(write, field) && !valid(write[field])) throw new Error(`Invalid ${field} metadata`);
      if (prior && Object.hasOwn(prior, field) && Object.hasOwn(write, field) && !sameMetadata(prior[field], write[field])) {
        throw new Error(`Conflicting ${field} metadata`);
      }
    }
    merged.set(key, { ...prior, ...write, ...coalescePendingWrite(prior, write.payload, write.options) });
  }
  return [...merged.values()];
}
export const expandPendingWrites = writes => writes.flatMap(write => (
  write.collectionName === ATOMIC_SAVE_COLLECTION ? (write.payload?.writes || []) : [write]
));
export async function commitAtomicWrites({ writes, companyId, transaction, reference }) {
  validateAtomicWrites(writes, companyId);
  if(writes[0].orderCreationCommand)return commitOrderCreationWrites({writes,companyId,transaction,reference});
  if(writes[0].assetCommand)return commitAssetAtomicWrites({writes,companyId,transaction,reference});
  return transaction(async tx => {
    const command = writes[0].deliveryCommand;
    const resolution = writes.findIndex(write => write.resolveOnce);
    const existing = await Promise.all(writes.map(write => command || write.ifAbsent || write.expectedDeliveryCashflow || resolution >= 0 ? tx.get(reference(write)) : null));
    if (command) {
      for (const snapshot of existing) {
        if (!snapshot?.exists()) continue;
        const data = snapshot.data();
        if (data.companyId !== companyId) throw new Error('Cross-company command collision');
        if (Object.hasOwn(data, 'lastDeliveryCommand') && (!isDeliveryCommand(data.lastDeliveryCommand)
          || (data.lastDeliveryCommand.id === command.id && !commandMatches(data.lastDeliveryCommand, command)))) {
          throw Object.assign(new Error('Delivery command identity reused with another fingerprint'), { code: 'firestore/delivery-command-conflict' });
        }
      }
      // A lost acknowledgement may be retried after finance approved or edited
      // these documents. The saved command marker proves the whole prior commit.
      if (existing.every(snapshot => snapshot?.exists() && commandMatches(snapshot.data().lastDeliveryCommand, command))) {
        return { existingDocuments: writes.map((write, index) => ({ ...write, payload: existing[index].data() })) };
      }
    }
    for (const [index, write] of writes.entries()) {
      if (!write.expectedDeliveryCashflow) continue;
      const data = existing[index]?.exists() ? existing[index].data() : null;
      if (!data || data.companyId !== companyId || !isPendingDeliveryCashflow(data)) throw cashflowConflict();
      let revision;
      try { revision = deliveryCashflowRevision(data); } catch { throw cashflowConflict(); }
      if (!sameMetadata(revision, write.expectedDeliveryCashflow)) throw cashflowConflict();
      assertDeliveryCashflowWrite(data, write.payload);
    }
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
    const pendingSets = [];
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
        if (command) {
          // Record participation without replaying an existing payment's
          // pending approval, amount, notification or delivery state.
          pendingSets.push({ write, payload: { lastDeliveryCommand: command }, options: { merge: true } });
        }
        existingDocuments.push({ ...write, payload: command ? { ...data, lastDeliveryCommand: command } : data });
      } else {
        pendingSets.push({ write, payload: command ? { ...write.payload, lastDeliveryCommand: command } : write.payload, options: write.options || {} });
      }
    }
    // Validate all guarded and ifAbsent writes before staging any mutation.
    for (const { write, payload, options } of pendingSets) tx.set(reference(write), payload, options);
    return { existingDocuments };
  });
}
