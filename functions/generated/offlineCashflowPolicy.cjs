// Generated from canonical source by scripts/build-offline-cashflow-policy.mjs.
const LEGACY_POSITION_MAP = {
  'Kế toán nhân sự': 'Kế toán & nhân sự',
  'Kế toán': 'Kế toán & nhân sự',
  'Admin': 'Kế toán & nhân sự',
  'Bán hàng': 'Kinh doanh',
  'CTV kinh doanh': 'Cộng tác viên kinh doanh',
  'Cộng tác viên': 'Cộng tác viên kinh doanh'
};
const WAREHOUSE_EXPORT_POSITION = 'Xuất kho';
const SALES_COLLABORATOR_POSITION = 'Cộng tác viên kinh doanh';
const normalizeEmployeePosition = (position = '') => {
  const rawPosition = `${position || ''}`.trim();
  const normalizedLookup = normalizeLookupText(rawPosition);
  if (['chu doanh nghiep', 'chu cua hang', 'giam doc', 'quan ly doanh nghiep', 'owner', 'business owner'].includes(normalizedLookup)) return 'Chủ doanh nghiệp';
  if (['ke toan nhan su', 'ke toan va nhan su', 'ke toan nhan vien', 'ke toan', 'nhan su', 'hanh chinh nhan su', 'hr', 'admin'].includes(normalizedLookup)) return 'Kế toán & nhân sự';
  if (['can hang xuat kho', 'xuat kho', 'nhan vien kho', 'kho'].includes(normalizedLookup)) return WAREHOUSE_EXPORT_POSITION;
  if (['cong tac vien kinh doanh', 'ctv kinh doanh', 'cong tac vien ban hang', 'ctv ban hang'].includes(normalizedLookup)) return SALES_COLLABORATOR_POSITION;
  if (['ban hang', 'sales', 'nhan vien kinh doanh'].includes(normalizedLookup)) return 'Kinh doanh';
  if (['tai xe', 'lai xe', 'giao hang', 'shipper', 'driver'].includes(normalizedLookup)) return 'Tài xế';
  if (['san xuat', 'nhan vien san xuat', 'production'].includes(normalizedLookup)) return 'Sản xuất';
  return LEGACY_POSITION_MAP[rawPosition] || rawPosition;
};
const isOwnerPosition = (position = '') => normalizeEmployeePosition(position) === 'Chủ doanh nghiệp';
const isOwnerRoleValue = (value = '') => {
  const normalized = normalizeLookupText(value || '');
  const compact = normalized.replace(/\s+/g, '');
  if (!normalized) return false;
  return normalized === 'super admin'
    || normalizeEmployeePosition(value) === 'Chủ doanh nghiệp'
    || ['superadmin', 'owner', 'companyowner', 'businessowner', 'owneraccount', 'accountowner'].includes(compact)
    || ['business owner', 'company owner', 'owner account', 'account owner', 'chu doanh nghiep', 'chu cong ty', 'chu cua hang', 'giam doc', 'quan ly doanh nghiep'].includes(normalized);
};
const isOwnerAccountUser = (employee = null, currentUser = null) => (
  currentUser?.role === 'super_admin'
  || employee?.role === 'super_admin'
  || currentUser?.isOwner === true
  || currentUser?.isCompanyOwner === true
  || employee?.isOwner === true
  || employee?.isCompanyOwner === true
  || isOwnerRoleValue(currentUser?.role)
  || isOwnerRoleValue(currentUser?.position)
  || isOwnerRoleValue(currentUser?.userRole)
  || isOwnerRoleValue(currentUser?.accountRole)
  || isOwnerRoleValue(employee?.role)
  || isOwnerPosition(employee?.position)
);
const parseEmployeeRoleSalaryAmount = (value) => {
  return parseLooseMoneyValue(value);
};
const normalizeEmployeePositionList = (positions = []) => Array.from(new Set(
  (Array.isArray(positions) ? positions : [])
    .map(normalizeEmployeePosition)
    .filter(Boolean)
));
const normalizeEmployeeRoleSalaryComponents = (components = [], { keepEmpty = false } = {}) => (
  (Array.isArray(components) ? components : [])
    .map((row, index) => {
      const position = normalizeEmployeePosition(row?.position || row?.department || row?.role || '');
      const amount = parseEmployeeRoleSalaryAmount(row?.amount ?? row?.salary ?? row?.monthlySalary ?? 0);
      return {
        id: `${row?.id || position || `role_${index}`}`,
        position,
        amount,
        note: `${row?.note || ''}`.trim()
      };
    })
    .filter(row => row.position && (keepEmpty || row.amount > 0 || row.note))
);
const getEmployeePositionValues = (employee = {}) => normalizeEmployeePositionList([
  employee?.position,
  employee?.primaryPosition,
  ...(Array.isArray(employee?.secondaryPositions) ? employee.secondaryPositions : []),
  ...(Array.isArray(employee?.additionalPositions) ? employee.additionalPositions : []),
  ...(Array.isArray(employee?.departments) ? employee.departments : []),
  ...normalizeEmployeeRoleSalaryComponents(employee?.roleSalaryComponents, { keepEmpty: true }).map(row => row.position)
]);
const employeeHasPosition = (employee = {}, predicateOrPosition) => {
  const positions = getEmployeePositionValues(employee);
  if (typeof predicateOrPosition === 'function') return positions.some(position => predicateOrPosition(position));
  const normalized = normalizeEmployeePosition(predicateOrPosition);
  return positions.includes(normalized);
};
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};
const LOOKUP_NORMALIZATION_CACHE_LIMIT = 2048;
const LOOKUP_NORMALIZATION_MAX_LENGTH = 256;
const lookupNormalizationCache = new Map();
const normalizeLookupText = (value = '') => {
  const cacheable = typeof value === 'string' && value.length <= LOOKUP_NORMALIZATION_MAX_LENGTH;
  if (cacheable) {
    const cached = lookupNormalizationCache.get(value);
    if (cached !== undefined) return cached;
  }
  const normalized = `${value}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (cacheable) {
    // FIFO hits keep insertion order; only primitive short strings are retained.
    if (lookupNormalizationCache.size >= LOOKUP_NORMALIZATION_CACHE_LIMIT) {
      lookupNormalizationCache.delete(lookupNormalizationCache.keys().next().value);
    }
    lookupNormalizationCache.set(value, normalized);
  }
  return normalized;
};
const parseLooseMoneyValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const digits = `${value}`.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
};
const CASHFLOW_APPROVAL_STATUS = {
  pending: 'pending_handover',
  approved: 'approved',
  rejected: 'rejected'
};
const requiresCashflowApproval = (item = {}) => Boolean(
  item.requiresApproval ||
  item.approvalStatus === CASHFLOW_APPROVAL_STATUS.pending ||
  item.approvalStatus === CASHFLOW_APPROVAL_STATUS.rejected ||
  item.handoverStatus === 'pending' ||
  item.handoverStatus === 'handed_over' ||
  item.sourceType === 'driver_delivery_expense' ||
  item.sourceType === 'employee_reported_expense' ||
  item.sourceType === 'employee_reported_income' ||
  (item.sourceType === 'driver_cash' && item.createdByRole === 'driver')
);
const isDriverPosition = (position = '') => normalizeEmployeePosition(position) === 'Tài xế';
const isEmployeeDriverPosition = (employee = {}) => employeeHasPosition(employee, isDriverPosition);
const normalizeLeadingLabel = (str = '') => capitalizeFirst(`${str}`.trim());
const normalizeExpenseCategoryLabel = (str = '') => normalizeLeadingLabel(str);
const isOrderCodeAutoMatchEnabled = (company = null) => company?.autoReconcileByOrderCode !== false;
module.exports={isOwnerAccountUser,parseLooseMoneyValue,capitalizeFirst,CASHFLOW_APPROVAL_STATUS,normalizeLeadingLabel,normalizeExpenseCategoryLabel,isOrderCodeAutoMatchEnabled,isEmployeeDriverPosition,requiresCashflowApproval};
