/** @typedef {{id: string, name: string}} NamedOption */
/** @typedef {'assignedDriverId' | 'customerId' | 'productId' | 'pieceCount' | 'weightKg'} DispatchField */
/** @typedef {{customerId?: string, customerName?: string, productId?: string, productName?: string, pieceCount?: number | string, quantityUnit?: string, weightKg?: number | string, weightEntries?: (string | number)[], assignedDriverId?: string, driverId?: string, note?: string, configurationId?: string, billingUnit?: string, pricingUnit?: string, billingQuantity?: number, pricingQuantity?: number, unitPrice?: number, price?: number, amount?: number, pricingAmount?: number, billingSnapshotVersion?: number, billingSnapshotSource?: string}} EditableDispatch */
/** @param {EditableDispatch} row */
export function buildDispatchEditorDraft(row) {
  return {
    customerId: row.customerId || '', customerSearch: row.customerName || '',
    productId: row.productId || '', productSearch: row.productName || '',
    pieceCount: row.pieceCount ?? '', quantityUnit: row.quantityUnit || 'Con', weightKg: row.weightKg ?? '',
    weightEntries: Array.isArray(row.weightEntries) ? [...row.weightEntries] : [],
    assignedDriverId: row.assignedDriverId || row.driverId || '', note: row.note || '',
    configurationId: row.configurationId || '', billingUnit: row.billingUnit || row.pricingUnit || '',
    billingQuantity: row.billingQuantity ?? row.pricingQuantity ?? 0, unitPrice: row.unitPrice ?? row.price ?? 0,
    amount: row.amount ?? row.pricingAmount ?? 0, billingSnapshotVersion: row.billingSnapshotVersion || 0,
    billingSnapshotSource: row.billingSnapshotSource || ''
  };
}
/** @param {string} field @param {boolean} canEdit @param {boolean} canAssignDriver */
export function canEditDispatchField(field, canEdit, canAssignDriver) {
  return canEdit && (field === 'assignedDriverId' ? canAssignDriver : ['customerId','productId','pieceCount','weightKg'].includes(field));
}
/**
 * @param {string | null | undefined} field
 * @param {ReturnType<typeof buildDispatchEditorDraft>} draft
 * @param {{drivers: readonly NamedOption[], customers: readonly NamedOption[], products: readonly NamedOption[]}} options
 * @returns {{label: string, title: string, type: 'select' | 'number', value: string | number, options?: {value: string, label: string}[], suffix?: string, placeholder?: string} | null}
 */
export function getDispatchEditorConfig(field, draft, {drivers, customers, products}) {
  if (field === 'pieceCount') return {label:'Số lượng',title:'Sửa số lượng',type:'number',value:draft.pieceCount,suffix:draft.quantityUnit || 'đơn vị',placeholder:'Nhập số lượng'};
  // Weight uses the separate multi-weighing editor, not a single-value input.
  if (field !== 'assignedDriverId' && field !== 'customerId' && field !== 'productId') return null;
  const labels = {assignedDriverId:['Người giao','Sửa người giao','Chưa giao'],customerId:['Khách hàng','Sửa khách hàng','-- Chọn khách hàng --'],productId:['Loại hàng','Sửa loại hàng','-- Chọn loại hàng --']};
  const items = field === 'assignedDriverId' ? drivers : field === 'customerId' ? customers : products;
  const [label,title,empty] = labels[field];
  return {label,title,type:'select',value:draft[field],options:[{value:'',label:empty},...items.map(item=>({value:item.id,label:item.name}))]};
}
