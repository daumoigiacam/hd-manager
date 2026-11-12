// Original pure helpers and import/expense planner statements, extracted from App.
// Only the clock is injected and saveAtomicDocuments is replaced with returning
// its unchanged write plan. No App/Firebase import and no initialization side effect.
import {purchaseAmount} from '../../utils/productMeasures.js';
import {normalizeLeadingLabel,parseLooseQuantityValue,buildWarehouseImportMeasureEntries} from './stockCountProtocol.js';
export {purchaseAmount,normalizeLeadingLabel,parseLooseQuantityValue,buildWarehouseImportMeasureEntries};
export const parseLooseMoneyValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const digits = `${value}`.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
};
export const WAREHOUSE_IMPORT_SOURCE_OPTIONS = [
  { value: 'purchase_resale', label: 'Mua ngoài bán lại' },
  { value: 'production_input', label: 'Nguyên liệu sản xuất' },
  { value: 'internal_production', label: 'Thành phẩm sản xuất' },
  { value: 'opening_balance', label: 'Tồn đầu kỳ' },
  { value: 'adjustment', label: 'Điều chỉnh tồn' }
];
export const normalizeWarehouseImportSourceType = (sourceType = '') => {
  const normalized = `${sourceType || ''}`.trim();
  return WAREHOUSE_IMPORT_SOURCE_OPTIONS.some(option => option.value === normalized)
    ? normalized
    : 'purchase_resale';
};
export const getWarehouseImportSourceLabel = (sourceType = '') => (
  WAREHOUSE_IMPORT_SOURCE_OPTIONS.find(option => option.value === normalizeWarehouseImportSourceType(sourceType))?.label
  || 'Mua ngoài bán lại'
);
export const CASHFLOW_APPROVAL_STATUS = {
  pending: 'pending_handover',
  approved: 'approved',
  rejected: 'rejected'
};
export function originalImportCreate(importData,{id,employeeId,tenantId,editedAt}) {
 const empId=employeeId, employeeInfo={id:employeeId},currentUser={id:employeeId},myCompanyId=tenantId,importId=id,getTodayString=()=>importData.date;
    const quantity = parseLooseQuantityValue(importData.quantity ?? importData.totalQuantity);
    const totalKg = parseLooseQuantityValue(importData.totalKg ?? importData.weightKg);
    const unitPrice = parseLooseMoneyValue(importData.unitPrice);
    const amount = importData.amount != null || importData.totalAmount != null
      ? parseLooseMoneyValue(importData.amount ?? importData.totalAmount)
      : purchaseAmount({ ...importData, totalKg, quantity, unitPrice }, importData.purchaseUnit || 'Kg');
    const groupName = normalizeLeadingLabel(importData.groupName || importData.productGroup || 'Nhóm hàng');
    const quantityUnit = normalizeLeadingLabel(importData.quantityUnit || importData.unit || 'Con');
    const sourceType = normalizeWarehouseImportSourceType(importData.sourceType);
    const productName = `${importData.productName || importData.productNameSnapshot || ''}`.trim();
    const productCode = `${importData.productCode || importData.barcode || importData.productBarcode || ''}`.trim();
    const productBarcode = `${importData.productBarcode || importData.barcode || productCode || ''}`.trim();
    const importDate = importData.date || getTodayString();
    const createdAt = editedAt;
    const measures = buildWarehouseImportMeasureEntries({
      totalKg,
      quantity,
      quantityUnit,
      extraMeasures: importData.extraMeasures || []
    });
    const payload = {
      ...importData,
      id,
      empId,
      createdByEmpId: empId,
      productId: `${importData.productId || ''}`.trim(),
      productName,
      productNameSnapshot: productName,
      productCode,
      productBarcode,
      barcode: productBarcode || productCode,
      groupName,
      totalKg,
      quantity,
      quantityUnit,
      sourceType,
      sourceLabel: importData.sourceLabel || getWarehouseImportSourceLabel(sourceType),
      supplier: `${importData.supplier || ''}`.trim(),
      supplierCustomerId: `${importData.supplierCustomerId || ''}`.trim(),
      supplierPhone: `${importData.supplierPhone || ''}`.trim(),
      supplierType: importData.supplierCustomerId ? 'customer' : 'manual',
      measures,
      unitPrice,
      amount,
      date: importDate,
      companyId: myCompanyId,
      isArchived: false,
      createdAt
    };
    const writes = [{ collectionName: 'warehouseImports', documentId: id, payload, options: {} }];
    if (amount > 0) {
      const expenseId = `exp_warehouse_import_${id}`;
      const expensePayload = {
        id: expenseId,
        companyId: myCompanyId,
        empId: empId || employeeInfo?.id || currentUser?.id || '',
        amount,
        category: 'Mua hàng',
        note: `Chi phí ${getWarehouseImportSourceLabel(sourceType).toLowerCase()} nhập kho: ${groupName}`,
        sourceType: 'warehouse_import_purchase',
        sourceLabel: 'Tự động từ nhập kho',
        sourceWarehouseImportId: id,
        date: importDate,
        requiresApproval: false,
        approvalStatus: CASHFLOW_APPROVAL_STATUS.approved,
        handoverStatus: 'confirmed',
        isArchived: false,
        createdAt
      };
      writes.push({ collectionName: 'expenses', documentId: expenseId, payload: expensePayload, options: { merge: true } });
    }
    return writes;
  
}
export function originalImportUpdate(importData,{id,employeeId,tenantId,editedAt}) {
 const empId=employeeId, employeeInfo={id:employeeId},currentUser={id:employeeId},myCompanyId=tenantId,importId=id,getTodayString=()=>importData.date;
    const quantity = parseLooseQuantityValue(importData.quantity ?? importData.totalQuantity);
    const totalKg = parseLooseQuantityValue(importData.totalKg ?? importData.weightKg);
    const unitPrice = parseLooseMoneyValue(importData.unitPrice);
    const amount = importData.amount != null || importData.totalAmount != null
      ? parseLooseMoneyValue(importData.amount ?? importData.totalAmount)
      : purchaseAmount({ ...importData, totalKg, quantity, unitPrice }, importData.purchaseUnit || 'Kg');
    const groupName = normalizeLeadingLabel(importData.groupName || importData.productGroup || 'Nhóm hàng');
    const quantityUnit = normalizeLeadingLabel(importData.quantityUnit || importData.unit || 'Con');
    const sourceType = normalizeWarehouseImportSourceType(importData.sourceType);
    const productName = `${importData.productName || importData.productNameSnapshot || ''}`.trim();
    const productCode = `${importData.productCode || importData.barcode || importData.productBarcode || ''}`.trim();
    const productBarcode = `${importData.productBarcode || importData.barcode || productCode || ''}`.trim();
    const importDate = importData.date || getTodayString();
    const updatedAt = editedAt;
    const measures = buildWarehouseImportMeasureEntries({
      totalKg,
      quantity,
      quantityUnit,
      extraMeasures: importData.extraMeasures || []
    });
    const payload = {
      ...importData,
      id: importId,
      productId: `${importData.productId || ''}`.trim(),
      productName,
      productNameSnapshot: productName,
      productCode,
      productBarcode,
      barcode: productBarcode || productCode,
      groupName,
      totalKg,
      quantity,
      quantityUnit,
      sourceType,
      sourceLabel: importData.sourceLabel || getWarehouseImportSourceLabel(sourceType),
      supplier: `${importData.supplier || ''}`.trim(),
      supplierCustomerId: `${importData.supplierCustomerId || ''}`.trim(),
      supplierPhone: `${importData.supplierPhone || ''}`.trim(),
      supplierType: importData.supplierCustomerId ? 'customer' : 'manual',
      measures,
      unitPrice,
      amount,
      date: importDate,
      updatedAt,
      updatedByEmpId: employeeInfo?.id || currentUser?.id || ''
    };
    const writes = [{ collectionName: 'warehouseImports', documentId: importId, payload, options: { merge: true } }];
    const expenseId = `exp_warehouse_import_${importId}`;
    if (amount > 0) {
      const expensePayload = {
        id: expenseId,
        companyId: myCompanyId,
        empId: importData.empId || importData.createdByEmpId || employeeInfo?.id || currentUser?.id || '',
        amount,
        category: 'Mua hàng',
        note: `Chi phí ${getWarehouseImportSourceLabel(sourceType).toLowerCase()} nhập kho: ${groupName}`,
        sourceType: 'warehouse_import_purchase',
        sourceLabel: 'Tự động từ nhập kho',
        sourceWarehouseImportId: importId,
        date: importDate,
        requiresApproval: false,
        approvalStatus: CASHFLOW_APPROVAL_STATUS.approved,
        handoverStatus: 'confirmed',
        isArchived: false,
        updatedAt,
        updatedByEmpId: employeeInfo?.id || currentUser?.id || ''
      };
      writes.push({ collectionName: 'expenses', documentId: expenseId, payload: expensePayload, options: { merge: true } });
    } else {
      const archivedExpensePayload = {
        id: expenseId,
        companyId: myCompanyId,
        sourceWarehouseImportId: importId,
        isArchived: true,
        archivedAt: updatedAt,
        archivedByEmpId: employeeInfo?.id || currentUser?.id || ''
      };
      writes.push({ collectionName: 'expenses', documentId: expenseId, payload: archivedExpensePayload, options: { merge: true } });
    }
    return writes;
  
}
export function originalImportArchive(importData,{id,employeeId,tenantId,editedAt}) {
 const empId=employeeId, employeeInfo={id:employeeId},currentUser={id:employeeId},myCompanyId=tenantId,importId=id,getTodayString=()=>importData.date;
    const archivedAt = editedAt;
    const archivedPayload = {
      id: importId,
      isArchived: true,
      archivedAt,
      archivedByEmpId: employeeInfo?.id || currentUser?.id || ''
    };
    const expenseId = `exp_warehouse_import_${importId}`;
    const archivedExpensePayload = {
      id: `exp_warehouse_import_${importId}`,
      companyId: myCompanyId,
      sourceWarehouseImportId: importId,
      isArchived: true,
      archivedAt,
      archivedByEmpId: employeeInfo?.id || currentUser?.id || ''
    };
    return [
      { collectionName: 'warehouseImports', documentId: importId, payload: archivedPayload, options: { merge: true } },
      { collectionName: 'expenses', documentId: expenseId, payload: archivedExpensePayload, options: { merge: true } },
    ];
}
