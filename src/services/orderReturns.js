import { getFirebaseFunctionsOrigin as getFunctionsOrigin } from '../config/firebase-endpoints.js';

const RETURN_ERROR_MESSAGES = Object.freeze({
  business_rule_required: 'Chưa thể ghi giảm tiền hàng: quy tắc giảm giá, thuế và phí của hàng trả chưa được xác nhận.',
  return_delivery_evidence_required: 'Đơn hàng chưa có phiếu xuất kho để xác minh số lượng đã giao.',
  return_delivery_confirmation_required: 'Đơn hàng chưa có xác nhận giao hàng.',
  return_quantity_exceeds_delivered: 'Số lượng trả vượt quá số đã giao còn có thể trả.',
  return_inventory_evidence_required: 'Phiếu xuất thiếu bằng chứng tồn kho và cần được đối soát.',
  return_inventory_evidence_invalid: 'Dữ liệu xuất kho không khớp và cần được đối soát.',
  return_state_reconciliation_required: 'Lịch sử hàng trả cần được đối soát trước khi tiếp tục.',
  return_balance_reconciliation_required: 'Tồn kho bán được cần được đối soát trước khi nhập hàng trả.',
  return_permission_denied: 'Hiện chỉ Chủ doanh nghiệp được duyệt hàng trả.',
});

export const commitOrderReturnTransaction = async ({
  projectId,
  firebaseUser,
  appId,
  request,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = 20_000,
} = {}) => {
  if (!firebaseUser?.getIdToken) throw new Error('Phiên đăng nhập Firebase không hợp lệ.');
  if (typeof fetchImpl !== 'function') throw new Error('Thiết bị không hỗ trợ kết nối máy chủ.');
  const token = await firebaseUser.getIdToken();
  let response;
  try {
    response = await fetchImpl(`${getFunctionsOrigin(projectId)}/orderReturnTransaction`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appId, ...request }),
    });
  } catch (cause) {
    throw Object.assign(new Error('Chưa nhận được xác nhận trả hàng. Giữ nguyên nội dung và thử lại để kiểm tra kết quả.', { cause }), {
      code: 'return_confirmation_unavailable', outcome: 'NETWORK_ERROR',
    });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    const code = payload?.code || 'order_return_failed';
    const error = new Error(RETURN_ERROR_MESSAGES[code] || payload?.message || 'Không thể ghi nhận hàng trả an toàn.');
    error.code = code;
    error.status = response.status;
    error.details = payload?.details || null;
    error.outcome = response.status === 404 && !payload?.code ? 'BACKEND_ENDPOINT_NOT_FOUND'
      : [401, 403].includes(response.status) ? 'PERMISSION_DENIED'
        : response.status >= 500 ? 'SERVER_ERROR' : 'BUSINESS_RULE_REJECTED';
    throw error;
  }
  if (!payload.data?.returnId || payload.data.orderId !== request?.orderId) {
    throw Object.assign(new Error('Phản hồi trả hàng không khớp. Giữ nguyên nội dung để kiểm tra lại.'), {
      code: 'return_confirmation_invalid', outcome: 'NETWORK_ERROR',
    });
  }
  return payload.data;
};
