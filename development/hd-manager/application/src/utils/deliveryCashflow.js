import { isReplayableJson } from './localFirstSave.js';

const guardedFields = ['amount', 'customerId', 'method', 'date', 'approvalStatus', 'requiresApproval', 'handoverStatus', 'isArchived', 'relatedDeliveryReportId'];
const pendingStatuses = ['pending', 'pending_handover', 'pending_approval'];
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
const nonemptyString = value => typeof value === 'string' && value.trim().length > 0;
const money = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const plainRecord = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function isDeliveryCashflowRevision(value) {
  return plainRecord(value) && Reflect.ownKeys(value).length === guardedFields.length
    && guardedFields.every(field => Object.hasOwn(value, field)
      && Object.getOwnPropertyDescriptor(value, field).enumerable
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), 'value'))
    && money(value.amount)
    && (value.customerId === null || identifier(value.customerId))
    && (value.method === null || nonemptyString(value.method))
    && date(value.date)
    && [...pendingStatuses, 'approved', 'rejected'].includes(value.approvalStatus)
    && typeof value.requiresApproval === 'boolean'
    && (value.handoverStatus === null || ['pending', 'handed_over', 'confirmed', 'rejected'].includes(value.handoverStatus))
    && (value.isArchived === null || typeof value.isArchived === 'boolean')
    && identifier(value.relatedDeliveryReportId);
}

export function deliveryCashflowRevision(record) {
  const revision = Object.fromEntries(guardedFields.map(field => [field, record?.[field] ?? null]));
  if (!isDeliveryCashflowRevision(revision)) throw new Error('Invalid delivery cashflow revision');
  return revision;
}

export function isPendingDeliveryCashflow(record) {
  return record?.requiresApproval === true
    && pendingStatuses.includes(record.approvalStatus)
    && (record.handoverStatus == null || ['pending', 'handed_over'].includes(record.handoverStatus));
}

export function planDeliveryCashflowChange({ records = [], reportId, recordId = '', amount, customerId, method, date, details = {}, permitted = true, label = 'Khoản thu' }) {
  if (!plainRecord(details) || !isReplayableJson(details)) throw new Error('Invalid delivery cashflow details');
  const linked = records.filter(record => record && (record.id === recordId || record.relatedDeliveryReportId === reportId));
  if (linked.length > 1) throw new Error(`${label} có nhiều chứng từ liên kết. Cần đối soát trước khi sửa báo cáo.`);
  const previous = linked[0];
  const desired = { ...details, amount, ...(customerId === undefined ? {} : { customerId }), ...(method === undefined ? {} : { method }), date };
  const changed = previous
    ? Object.entries(desired).some(([field, value]) => String(previous[field] ?? '') !== String(value ?? '')) || (Boolean(previous.isArchived) !== (amount <= 0))
    : amount > 0;
  if (changed && !permitted) throw new Error(`Tài khoản chưa có quyền sửa ${label.toLowerCase()} liên quan.`);
  if (previous && !changed) return { type: 'none', previous };
  if (previous && !isPendingDeliveryCashflow(previous)) {
    throw new Error(`${label} đã được xử lý. Hãy đối soát trong Thu chi trước khi thay đổi số tiền báo cáo.`);
  }
  if (!previous) return { type: amount > 0 && permitted ? 'create' : 'none' };
  return { type: amount > 0 ? 'edit' : 'archive', previous, expectedDeliveryCashflow: deliveryCashflowRevision(previous) };
}

export function assertDeliveryCashflowWrite(previous, patch) {
  if (!previous?.relatedDeliveryReportId || !isPendingDeliveryCashflow(previous)
    || !plainRecord(patch) || !isReplayableJson(patch)
    || ['relatedDeliveryReportId', 'approvalStatus', 'requiresApproval', 'handoverStatus', 'companyId'].some(field => (
      Object.hasOwn(patch, field) && patch[field] !== previous[field]
    ))
    || (Object.hasOwn(patch, 'amount') && !money(patch.amount))
    || (Object.hasOwn(patch, 'customerId') && !identifier(patch.customerId))
    || (Object.hasOwn(patch, 'method') && !nonemptyString(patch.method))
    || (Object.hasOwn(patch, 'date') && !date(patch.date))
    || (Object.hasOwn(patch, 'isArchived') && typeof patch.isArchived !== 'boolean')) {
    throw new Error('Chứng từ giao hàng đã được xử lý hoặc thay đổi. Hãy tải dữ liệu mới để đối soát.');
  }
  return deliveryCashflowRevision(previous);
}
