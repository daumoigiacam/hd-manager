import {isCustomerDebtRepayment} from '../../utils/expenseClassification.js';
import {businessDayKey} from '../../utils/businessDate.js';

export function createFinanceFilters(now = Date.now()) {
  const today = businessDayKey(now);
  return {search: '', dateFrom: today, dateTo: today, employeeId: '', status: 'all'};
}

export function financeSearchInputTime(eventTimestamp, now) {
  // DOM timestamps are normally relative to performance.timeOrigin; older
  // WebViews may supply epoch timestamps. Never mix those clock domains.
  return Number.isFinite(eventTimestamp) && eventTimestamp >= 0 && eventTimestamp <= now
    && now - eventTimestamp < 60000 ? eventTimestamp : now;
}

export const FINANCE_PAGE_SIZE = 40;
export const FINANCE_WRITE_UNAVAILABLE = 'Giao thức Thu chi Development chưa được nối hoặc phiên chưa có quyền ghi tương ứng có chữ ký. Mặc định chỉ đọc; không tạo, sửa hay xác nhận phiếu khi thiếu quyền.';
export const FINANCE_APPROVAL_FIELDS = Object.freeze(['requiresApproval', 'handoverStatus', 'createdByRole',
  'isPaymentIntent', 'paymentIntent', 'isCustomerDebtPaymentIntent', 'paymentStatus', 'settlementStatus', 'reconciliationStatus']);

// Inject the existing product functions. No alternate accounting/date parser,
// ledger calculation, role inference or pending-write store belongs here.
export function createFinancePresentation(rules) {
  const {getDateKeyFromAnyValue, isPayosPaymentRecord, getPaymentDateSource,
    getEntityTimestamp, requiresCashflowApproval, isCashflowOfficial,
    CASHFLOW_APPROVAL_STATUS} = rules;

  // Same priority as App.resolveCashflowDateKey. Do not use creation date in
  // place of a bank transaction date, or today's date for an absent date.
  const dateKey = (item = {}) => getDateKeyFromAnyValue(
    (isPayosPaymentRecord(item) ? getPaymentDateSource(item) : '')
      || item.cashflowDate || item.paymentDate || item.paidDate
      || item.transactionDate || item.transactionDateTime || item.bankTransactionDate
      || item.paidAt || item.transactionAt || item.transactedAt || item.transactionTime
      || item.bankTransactionTime || item.paymentTime || item.completedTime || item.completedAt
      || item.date || item.approvedAt || item.createdAt || item.updatedAt || getEntityTimestamp(item)
  );
  const approval = (item = {}) => {
    if (!requiresCashflowApproval(item) || item.approvalStatus === CASHFLOW_APPROVAL_STATUS.approved) {
      return {value: 'approved', label: 'Đã xác nhận'};
    }
    if (item.approvalStatus === CASHFLOW_APPROVAL_STATUS.rejected) return {value: 'rejected', label: 'Không duyệt'};
    return {value: 'pending', label: 'Chờ xác nhận'};
  };
  return Object.freeze({
    dateKey, approval,
    present(source, row) {
      if (!['payments', 'expenses'].includes(source) || !row?.document || !row.id) throw Error('Phiếu thu chi không hợp lệ.');
      const item = row.document;
      const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null;
      const localPending = item.__pendingFirebaseSync === true || item.__pendingLocalSync === true
        || ['LOCAL_ONLY', 'PENDING_SYNC', 'SYNCING', 'SYNC_FAILED', 'CONFLICT', 'CONFLICT_REQUIRES_REVIEW'].includes(item.localSyncState);
      const serverConfirmed = row.state === 'SERVER_CONFIRMED' && !localPending;
      const completeApproval = FINANCE_APPROVAL_FIELDS.every(field => Object.prototype.hasOwnProperty.call(item, field));
      const approvalKnown = completeApproval || ['pending', 'approved', 'rejected'].includes(item.approvalStatus);
      const expense = source === 'expenses';
      return {
        id: row.id, source, document: item, expense, dateKey: row.businessDate ?? dateKey(item), amount,
        // Preserve stored sign; a negative expense is an expense reversal.
        signedAmount: amount === null ? null : expense ? -amount : amount,
        approval: approvalKnown ? approval(item) : {value: 'unknown', label: 'Chưa đủ dữ liệu phê duyệt'}, serverConfirmed,
        official: !serverConfirmed ? false : completeApproval ? isCashflowOfficial(item) : null,
        debtRepayment: expense && isCustomerDebtRepayment(item),
        syncLabel: localPending ? 'Chưa đồng bộ máy chủ'
          : row.state === 'SERVER_CONFIRMED' ? 'Máy chủ đã xác nhận'
          : row.state === 'SERVER_SOURCE_COPY' ? 'Bản nguồn đã lưu' : 'Chưa rõ trạng thái đồng bộ',
      };
    },
  });
}

export function financeReadAccess(runtime, directory) {
  const scope = runtime?.scope, user = runtime?.appSession?.currentUser;
  if (!runtime?.isCurrent?.() || !scope || !user || user.firebaseUid !== scope.principalId
    || user.companyId !== scope.tenantId || runtime.appSession.currentCompany?.id !== scope.tenantId
    || !Number.isFinite(runtime.expiresAtMs) || Date.now() >= runtime.expiresAtMs) {
    return 'Phiên Offline đã kết thúc hoặc không khớp tài khoản/công ty.';
  }
  if (!runtime.capabilities?.includes('home.read')&&directory?.sourceScope!=='module-pages-v1') return 'Phiên này chưa có quyền đọc nguồn Thu chi Offline có chữ ký.';
  if (!runtime.capabilities.includes('home.cashflow.read')) return 'Phiên Offline chưa có quyền home.cashflow.read có chữ ký.';
  if (runtime.appSession.sourceProfile === 'native-isolation-v1') return 'Nguồn native hiện tại chưa có ánh xạ phiếu thu/chi của sản phẩm.';
  if (!directory || typeof directory.page !== 'function' || typeof directory.lookup !== 'function') return 'Nguồn Thu chi SQLite chưa được kết nối.';
  return '';
}

const headKey = head => JSON.stringify([head?.generation, head?.seq, head?.capturedAt, head?.dayKey, head?.sourceProfile]);
export function validateFinanceHead(runtime, head) {
  if (!runtime?.scope || !head || typeof head.generation !== 'string' || !head.generation
    || !Number.isSafeInteger(head.seq) || head.seq < 0 || !Number.isFinite(head.capturedAt)
    || head.sourceProfile !== 'legacy-v1' || !/^\d{4}-\d{2}-\d{2}$/.test(head.dayKey || '')) {
    throw Error('Nguồn Thu chi chưa có bản hoàn tất khớp quyền Offline.');
  }
}

function validateRow(runtime, row) {
  if (!row || typeof row.id !== 'string' || !row.id || !row.document || (row.document.id && row.document.id !== row.id)
    || row.document.companyId !== runtime.scope.tenantId
    || !['SERVER_CONFIRMED', 'SERVER_SOURCE_COPY'].includes(row.state)) {
    throw Error('Phiếu thu chi không khớp nguồn hoặc công ty.');
  }
}

export function supportsFinanceApprovalFilter(directory, source) {
  // Raw source.status is not the product's requiresApproval/approvalStatus.
  return directory?.sources?.[source]?.statusFilter === 'cashflow-approval-v1';
}

export function financeDirectoryOptions(directory, source, filters) {
  if (filters.status !== 'all' && !supportsFinanceApprovalFilter(directory, source)) {
    throw Error('Nguồn SQLite chưa hỗ trợ lọc trạng thái phê duyệt thu chi.');
  }
  let to = null;
  for (const key of ['dateFrom', 'dateTo']) {
    if (!filters[key]) continue;
    const date = new Date(filters[key] + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key]) || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== filters[key]) throw Error('Ngày tài chính không hợp lệ.');
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw Error('Khoảng ngày tài chính không hợp lệ.');
  if (filters.dateTo) {
    const date = new Date(filters.dateTo + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime())) throw Error('Ngày kết thúc không hợp lệ.');
    date.setUTCDate(date.getUTCDate() + 1);
    to = date.toISOString().slice(0, 10);
  }
  return {from: filters.dateFrom || null, to, text: filters.search || '',
    employeeId: filters.employeeId || null, status: filters.status === 'all' ? null : filters.status};
}

function unpackPage(runtime, source, result) {
  const metadata = result?.metadata;
  if (metadata?.source !== source || metadata.serverConfirmedOnly !== true
    || metadata.financialCalculationAllowed !== false || metadata.projection !== 'bounded-directory-scalars-v1'
    || metadata.timeZone !== 'Asia/Ho_Chi_Minh') throw Error('Nguồn Thu chi SQLite không hợp lệ.');
  validateFinanceHead(runtime, metadata.checkpoint);
  return {rows: result.items, head: metadata.checkpoint, nextCursor: result.nextCursor, hasMore: result.hasMore};
}

// Only read the directory owned by the existing runtime. Never open SQLite,
// register a listener, call a remote endpoint or enqueue a generic mutation.
export async function readFinancePage({runtime, directory, source, filters, after = null, head = null}) {
  const denied = financeReadAccess(runtime, directory);
  if (denied) throw Error(denied);
  if (!['payments', 'expenses'].includes(source)) throw Error('Nguồn Thu chi không hợp lệ.');
  const result = unpackPage(runtime, source, await directory.page(source, {
    ...financeDirectoryOptions(directory, source, filters), cursor: after, limit: FINANCE_PAGE_SIZE,
    ...(head ? {checkpoint: head} : {}),
  }));
  if (!runtime.isCurrent() || Date.now() >= runtime.expiresAtMs) throw Error('Phiên Offline đã thay đổi.');
  validateFinanceHead(runtime, result?.head);
  if (head && headKey(head) !== headKey(result.head)) throw Error('Nguồn Thu chi đã thay đổi. Hãy tải lại danh sách.');
  if (!Array.isArray(result.rows) || result.rows.length > FINANCE_PAGE_SIZE
    || !(result.nextCursor === null || typeof result.nextCursor === 'string' && result.nextCursor.length > 0)
    || result.hasMore !== (result.nextCursor !== null)
    || result.nextCursor !== null && (result.nextCursor === after || result.rows.length === 0)) {
    throw Error('Trang Thu chi SQLite không hợp lệ.');
  }
  const ids = new Set();
  for (const row of result.rows) {
    validateRow(runtime, row);
    if (ids.has(row.id)) throw Error('Nguồn Thu chi trả về phiếu trùng lặp.');
    ids.add(row.id);
  }
  // Same product archive predicate. Keep the SQL cursor, including when a
  // bounded page contains only archived rows; the caller can still load more.
  return {...result, rows: result.rows.filter(row => !row.document.isArchived)};
}

export async function readFinanceDetail({runtime, directory, source, id, head}) {
  const denied = financeReadAccess(runtime, directory);
  if (denied) throw Error(denied);
  if (!['payments', 'expenses'].includes(source)) throw Error('Nguồn Thu chi không hợp lệ.');
  validateFinanceHead(runtime, head);
  const result = unpackPage(runtime, source, await directory.lookup(source, [id], {checkpoint: head}));
  if (!runtime.isCurrent() || Date.now() >= runtime.expiresAtMs) throw Error('Phiên Offline đã thay đổi.');
  validateFinanceHead(runtime, result?.head);
  if (headKey(head) !== headKey(result.head)) throw Error('Nguồn Thu chi đã thay đổi. Hãy tải lại danh sách.');
  if (!Array.isArray(result.rows) || result.rows.length === 0) throw Error('Phiếu không còn trong bản dữ liệu đã chọn.');
  if (result.rows.length !== 1) throw Error('Nguồn Thu chi trả về sai phiếu.');
  validateRow(runtime, result.rows[0]);
  if (result.rows[0].id !== id) throw Error('Nguồn Thu chi trả về sai phiếu.');
  if (result.rows[0].document.isArchived) throw Error('Phiếu đã được lưu trữ. Hãy tải lại danh sách.');
  return result.rows[0];
}
