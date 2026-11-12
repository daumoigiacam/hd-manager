import { getFirebaseFunctionsOrigin } from '../config/firebase-endpoints.js';

export const classifyInventoryOutcome = (code, status = 0) => {
  if ([10, '10', 'aborted', 'ABORTED'].includes(code)) return 'CONFLICT_RETRY';
  if (['inventory_connection_unavailable', 'inventory_confirmation_timeout'].includes(code)) return 'NETWORK_ERROR';
  if (code === 'inventory_endpoint_unavailable') return 'BACKEND_ENDPOINT_NOT_FOUND';
  if ([401, 403].includes(status)) return 'PERMISSION_DENIED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'BUSINESS_RULE_REJECTED';
};

const getInventoryErrorMessage = (code = '', fallback = '') => {
  const messages = {
    inventory_balance_not_initialized: 'Tồn kho chưa được khởi tạo. Hãy nhập kho hoặc kiểm kho trước khi xuất.',
    inventory_insufficient_stock: 'Số lượng xuất vượt quá tồn kho khả dụng.',
    inventory_idempotency_conflict: 'Mã thao tác đã thuộc một nghiệp vụ khác. Vui lòng tải lại dữ liệu.',
    inventory_operation_record_missing: 'Chứng từ cần được đối soát trước khi thử lại.',
    inventory_employee_required: 'Tài khoản hiện tại không có quyền ghi tồn kho.',
    inventory_identity_not_found: 'Không tìm thấy hồ sơ nhân sự để xác minh quyền tồn kho.',
    inventory_permission_denied: 'Tài khoản chưa được cấp quyền thực hiện nghiệp vụ tồn kho này.',
    inventory_endpoint_unavailable: 'Chức năng lưu tồn kho trên máy chủ chưa sẵn sàng. Phiếu chưa được máy chủ xác nhận.',
    inventory_connection_unavailable: 'Không kết nối được máy chủ lưu tồn kho. Hãy giữ nguyên dữ liệu và thử lại; phiếu chưa được xác nhận.',
    inventory_confirmation_timeout: 'Máy chủ chưa xác nhận lưu tồn kho kịp thời. Hãy giữ nguyên dữ liệu và thử lại để kiểm tra kết quả.',
  };
  return messages[code] || fallback || 'Không thể ghi nghiệp vụ tồn kho an toàn.';
};

export const commitAtomicInventoryOperation = async ({
  projectId,
  firebaseUser,
  appId,
  operation,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = 15_000,
} = {}) => {
  if (!firebaseUser?.getIdToken) throw new Error('Phiên đăng nhập Firebase không hợp lệ.');
  if (typeof fetchImpl !== 'function') throw new Error('Thiết bị không hỗ trợ kết nối máy chủ.');

  const token = await firebaseUser.getIdToken();
  const endpoint = `${getFirebaseFunctionsOrigin(projectId)}/inventoryAtomicOperation`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ appId, ...operation }),
    });
  } catch (cause) {
    const code = ['TimeoutError', 'AbortError'].includes(cause?.name)
      ? 'inventory_confirmation_timeout'
      : 'inventory_connection_unavailable';
    const error = new Error(getInventoryErrorMessage(code), { cause });
    error.code = code;
    error.outcome = classifyInventoryOutcome(code);
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    const code = payload?.code || (response.status === 404
      ? 'inventory_endpoint_unavailable'
      : 'inventory_operation_failed');
    const outcome = classifyInventoryOutcome(code, response.status);
    const fallback = outcome === 'CONFLICT_RETRY'
      ? 'Có thao tác đồng thời. Hãy giữ nguyên phiếu và thử lại với cùng mã thao tác.'
      : outcome === 'PERMISSION_DENIED'
        ? 'Phiên đăng nhập hoặc quyền lưu tồn kho không hợp lệ. Phiếu chưa được xác nhận.'
        : payload?.message;
    const error = new Error(getInventoryErrorMessage(code, fallback));
    error.code = code;
    error.status = response.status;
    error.outcome = outcome;
    error.details = payload?.details || null;
    throw error;
  }
  if (!payload.data?.operationId || payload.data.documentId !== operation?.documentId) {
    throw Object.assign(new Error('Phản hồi lưu tồn kho không hợp lệ. Hãy giữ nguyên dữ liệu để kiểm tra lại.'), {
      code: 'inventory_confirmation_invalid', outcome: 'NETWORK_ERROR',
    });
  }
  return { ...payload.data, outcome: 'CONFIRMED' };
};

export const buildInventoryProductKey = (record = {}, fallback = '') => `${
  record.productId
  || record.productKey
  || record.groupName
  || record.productGroup
  || record.productName
  || fallback
  || ''
}`.trim();

export const buildInventoryMovements = ({
  record = {},
  measures = [],
  defaultWarehouseId = 'default',
  fallbackProductKey = '',
} = {}) => {
  const warehouseId = `${record.warehouseId || defaultWarehouseId}`.trim() || defaultWarehouseId;
  const productId = buildInventoryProductKey(record, fallbackProductKey);
  if (!productId) throw new Error('Chưa xác định được sản phẩm cần ghi tồn kho.');
  const merged = new Map();
  (Array.isArray(measures) ? measures : []).forEach((measure = {}) => {
    const unit = `${measure.unit || measure.quantityUnit || ''}`.trim();
    const quantity = Number(measure.quantity);
    if (!unit || !Number.isFinite(quantity) || quantity <= 0) return;
    const key = unit.toLocaleLowerCase('vi');
    const current = merged.get(key) || { warehouseId, productId, unit, quantity: 0 };
    current.quantity += quantity;
    merged.set(key, current);
  });
  const movements = Array.from(merged.values());
  if (!movements.length) throw new Error('Số lượng nhập/xuất kho phải lớn hơn 0.');
  return movements;
};
