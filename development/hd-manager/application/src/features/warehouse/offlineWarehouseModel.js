import {resolveWarehouseDispatchDeliveryStatus} from '../../utils/warehouseDispatchGrouping.js';

export const WAREHOUSE_SOURCES = Object.freeze({
  warehouseImports: {label: 'Nhập kho', singular: 'Phiếu nhập kho', action: 'Thêm phiếu nhập', route: 'warehouse_import', capability:'home.imports.read'},
  warehouseDispatches: {label: 'Xuất kho', singular: 'Phiếu xuất kho', action: 'Thêm phiếu xuất', route: 'warehouse_dispatch', capability:'home.dispatches.read'},
  warehouseStockCounts: {label: 'Kiểm tồn thực tế', singular: 'Phiếu kiểm tồn', action: 'Lưu kiểm tồn', route: 'warehouse_stock_count', capability:'home.stock.read'},
});
export const WAREHOUSE_IMPORT_TYPES = Object.freeze([
  {value: 'purchase_resale', label: 'Mua ngoài bán lại'},
  {value: 'production_input', label: 'Nguyên liệu sản xuất'},
  {value: 'internal_production', label: 'Thành phẩm sản xuất'},
  {value: 'opening_balance', label: 'Tồn đầu kỳ'},
  {value: 'adjustment', label: 'Điều chỉnh tồn'},
]);
export const WAREHOUSE_WRITE_GAP = Object.freeze({
  code: 'WAREHOUSE_ATOMIC_OFFLINE_PROTOCOL_UNAVAILABLE',
  message: 'Chỉ xem chứng từ kho đã đồng bộ. Chưa thể thêm, sửa hoặc xóa phiếu kho trên thiết bị vì chưa có giao thức ghi kho Offline được cấp quyền và xác nhận bởi máy chủ.',
  requirements: [
    'Quyền ký riêng cho nhập kho, xuất kho và kiểm tồn trong offlineCustomerGrant.js / chính sách máy chủ.',
    'Lệnh kho có SQLite + Outbox nguyên tử; kiểm tra phiên bản tồn, đơn vị và quan hệ chứng từ.',
    'Máy chủ xử lý lệnh kho idempotent, kiểm tra quyền và tồn trong giao dịch, trả receipt có phạm vi và digest.',
    'Nhập kho phải giữ nguyên liên kết chi phí; phiếu sửa/xóa phải đối chiếu các bút toán liên quan.',
  ],
});

export function warehouseSource(value) {
  if(Object.hasOwn(WAREHOUSE_SOURCES, value)) return value;
  return Object.keys(WAREHOUSE_SOURCES).find(key => WAREHOUSE_SOURCES[key].route === value) || 'warehouseImports';
}

const text = value => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
export const warehouseStoredValue = value => value === null || value === undefined || value === '' ? 'Chưa ghi nhận' : text(value) || 'Dữ liệu không hợp lệ';

// This is a read presentation of the stored record, never a financial/stock calculation.
// In particular orderedUnit, quantityUnit, pricingUnit and unitPrice are independent.
export function warehouseProductLines(document) {
  const field = ['items', 'lines', 'products'].find(key => Array.isArray(document?.[key]));
  return field ? document[field].filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [document];
}

export function warehouseLineFields(line = {}) {
  return [
    ['Sản phẩm', line.productName ?? line.productNameSnapshot ?? line.name],
    ['Mã sản phẩm', line.productCode ?? line.productId],
    ['Số lượng', line.quantity],
    ['Số con / cái', line.pieceCount ?? line.quantityCount],
    ['Đơn vị đặt', line.orderedUnit],
    ['Đơn vị số lượng', line.quantityUnit],
    ['Đơn vị nguồn', line.unit],
    ['Khối lượng (Kg)', line.totalKg ?? line.weightKg],
    ['Đơn vị tính giá', line.pricingUnit],
    ['Đơn vị thanh toán', line.billingUnit],
    ['Đơn vị mua', line.purchaseUnit],
    ['Số lượng tính giá', line.pricingQuantity ?? line.billingQuantity],
    ['Đơn giá đã lưu', line.unitPrice],
    ['Giá nguồn', line.price],
    ['Thành tiền đã lưu', line.amount],
    ['Thành tiền dòng đã lưu', line.lineTotal],
    ['Giá trị tính giá đã lưu', line.pricingAmount],
  ];
}

// Directory SQL owns business-date resolution. Date controls are inclusive;
// convert only the upper bound to the directory's [from,to) contract, in UTC.
export function warehouseDateRange(from = '', through = '') {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
  if((from && !valid(from)) || (through && !valid(through)) || (from && through && from > through)) throw Error('Khoảng ngày chưa hợp lệ.');
  const next = through ? new Date(Date.parse(through+'T00:00:00Z')+86400000).toISOString().slice(0,10) : null;
  if(next && !valid(next)) throw Error('Ngày kết thúc vượt giới hạn hỗ trợ.');
  return {from:from || null,to:next};
}

export function warehouseStatus(source, record) {
  if(record.isArchived === true || record.isArchived === 1) return {key: 'archived', label: 'Đã lưu trữ'};
  if(source === 'warehouseDispatches') {
    if(![record.deliveryStatus,record.trackingStatus,record.fulfillmentStatus,record.status,record.deliveryStatusKey].some(Boolean)) return {key:'unknown',label:'Chưa ghi trạng thái giao trên phiếu'};
    return resolveWarehouseDispatchDeliveryStatus(record);
  }
  const status = text(record.status);
  if(status) return {key: status, label: status};
  return {key: 'active', label: source === 'warehouseStockCounts' ? 'Đã ghi nhận kiểm tồn' : 'Đang sử dụng'};
}

export function warehouseImportLabel(record) {
  // The original module treats absent/unsupported sourceType as purchase_resale.
  return WAREHOUSE_IMPORT_TYPES.find(item => item.value === record.sourceType)?.label || 'Mua ngoài bán lại';
}

export function assertWarehouseRuntime(runtime) {
  if(!runtime?.isCurrent?.() || (!runtime.capabilities?.includes('home.read')&&!runtime.business?.readSources?.includes('warehouseImports')) ||
    !runtime.scope?.tenantId || !runtime.scope?.principalId || !runtime.scope?.permissionRevision ||
    !Number.isFinite(runtime.expiresAtMs) || Date.now() >= runtime.expiresAtMs ||
    runtime.appSession?.currentUser?.accountType !== 'employee' ||
    runtime.appSession.currentCompany?.id !== runtime.scope.tenantId ||
    runtime.appSession.currentUser.companyId !== runtime.scope.tenantId ||
    runtime.appSession.currentUser.firebaseUid !== runtime.scope.principalId) {
    throw Object.assign(Error('Phiên xem kho không còn hiệu lực. Vui lòng mở lại khu vực làm việc.'), {code: 'permission-denied'});
  }
}

export function assertWarehouseDocument(runtime, row) {
  assertWarehouseRuntime(runtime);
  if(!row || typeof row.id !== 'string' || !row.id || row.companyId !== runtime.scope.tenantId) {
    // Do not include row IDs, names, tenant IDs or raw errors in cross-scope failures.
    throw Object.assign(Error('Không thể hiển thị chứng từ ngoài phạm vi đã được cấp quyền.'), {code: 'permission-denied'});
  }
  return row;
}

export function warehouseErrorMessage(error) {
  if(error?.code==='offline-page-unavailable')return 'Trang máy chủ này chưa lưu. Tải lại danh sách để xem phạm vi đã lưu trên thiết bị.';
  if(error?.code==='filter-not-authorized')return 'Phiên hiện tại chưa được cấp hành động lọc nhập kho.';
  if(error?.code === 'permission-denied' || error?.code === 'unauthenticated') return 'Phiên hoặc quyền xem kho đã thay đổi. Vui lòng mở lại khu vực làm việc.';
  if(error?.code === 'stale-checkpoint') return 'Nguồn kho đã thay đổi hoặc chưa hoàn tất. Hãy tải lại danh sách từ trang đầu.';
  if(error?.code === 'source-unavailable') return 'Nguồn chứng từ kho này chưa có trong bản đồng bộ hoàn tất trên thiết bị.';
  return 'Chưa đọc được chứng từ kho đã lưu. Hãy tải lại danh sách sau khi nguồn dữ liệu đồng bộ đầy đủ.';
}
