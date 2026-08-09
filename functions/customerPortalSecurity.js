const crypto = require('crypto');

const DEFAULT_POINT_VALUE = 1000;

const COMPANY_PUBLIC_FIELDS = [
  'name',
  'displayName',
  'logoUrl',
  'logo',
  'slogan',
  'companySlogan',
  'phone',
  'email',
  'address',
  'bankId',
  'invoiceBankId',
  'bankName',
  'invoiceBankName',
  'bankAccountName',
  'invoiceAccountName',
  'bankAccountNumber',
  'invoiceAccountNumber',
  'invoiceQrTemplate',
  'sepayVirtualAccountNumber',
  'sepayVaAccountNumber',
  'sepayVaNumber',
  'sepayVirtualAccount',
  'sepayReceivingAccountNumber',
  'bankVirtualAccountNumber',
  'virtualBankAccountNumber',
  'vaAccountNumber',
  'virtualAccountNumber',
  'sepayUseVirtualAccount',
  'customerLoyaltyEnabled',
  'loyaltyEarnAmountPerPoint',
  'loyaltyRedeemValuePerPoint'
];

const PRODUCT_PUBLIC_FIELDS = [
  'name',
  'shortName',
  'code',
  'barcode',
  'category',
  'description',
  'unit',
  'sellingPrice',
  'price',
  'unitPrice',
  'retailPrice',
  'pricingUnit',
  'pricingUnits',
  'allowedPricingUnits',
  'unitPrices',
  'pricingUnitPrices',
  'variants',
  'sizes',
  'attributes',
  'imageUrl',
  'image',
  'images',
  'status',
  'isArchived',
  'minOrderQuantity',
  'sortOrder'
];

const PRODUCT_VARIANT_PUBLIC_FIELDS = [
  'id',
  'name',
  'label',
  'size',
  'sizeLabel',
  'attribute',
  'attributeLabel',
  'unit',
  'pricingUnit',
  'sellingPrice',
  'price',
  'unitPrice',
  'status',
  'isArchived',
  'sortOrder'
];

const REWARD_PUBLIC_FIELDS = [
  'name',
  'title',
  'description',
  'points',
  'requiredPoints',
  'pointCost',
  'cost',
  'imageUrl',
  'image',
  'status',
  'isArchived',
  'startDate',
  'endDate',
  'sortOrder'
];

const PROMOTION_PUBLIC_FIELDS = [
  'name',
  'title',
  'description',
  'productIds',
  'discountType',
  'discountValue',
  'minimumAmount',
  'maximumDiscount',
  'startDate',
  'endDate',
  'status',
  'isArchived',
  'imageUrl',
  'image',
  'sortOrder'
];

const CUSTOMER_ACCOUNT_PUBLIC_FIELDS = [
  'customerId',
  'customer_id',
  'phone',
  'username',
  'status',
  'last_login',
  'created_at',
  'isArchived'
];

const CUSTOMER_PROFILE_PUBLIC_FIELDS = [
  'name',
  'customerHonorific',
  'phone',
  'avatarUrl',
  'avatar',
  'address',
  'location',
  'locationUrl',
  'locationInput',
  'locationLat',
  'locationLng',
  'mapLocation',
  'birthday',
  'dateOfBirth',
  'email',
  'zaloGroupLink',
  'zaloLink',
  'allowDebt',
  'creditLimit',
  'debtLimit',
  'debtLimitAmount',
  'debtLimitMode',
  'debtPolicy',
  'empId',
  'salesEmpId',
  'managerEmpId',
  'managerName',
  'managerPhone',
  'salesName',
  'salesPhone',
  'employeeName',
  'employeePhone',
  'salesOwnerName',
  'branches',
  'customerBranches',
  'fixedProducts',
  'customerProductIds',
  'quotedProductIds',
  'customerPrices',
  'priceOverrides',
  'productPrices',
  'productPriceOverrides',
  'customerProductPrices',
  'customerPriceOverrides'
];

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneJsonSafe = (value) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(cloneJsonSafe);
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonSafe(item)]));
  }
  return value;
};

const pickFields = (source = {}, fields = []) => fields.reduce((result, field) => {
  if (source[field] !== undefined) result[field] = cloneJsonSafe(source[field]);
  return result;
}, {});

const sanitizeCompanyForCustomer = (source = {}, id = '') => ({
  id: `${id || source.id || ''}`,
  ...pickFields(source, COMPANY_PUBLIC_FIELDS)
});

const sanitizeProductVariant = (source = {}) => pickFields(source, PRODUCT_VARIANT_PUBLIC_FIELDS);

const sanitizeProductForCustomer = (source = {}, id = '') => {
  const product = {
    id: `${id || source.id || ''}`,
    ...pickFields(source, PRODUCT_PUBLIC_FIELDS)
  };
  if (Array.isArray(product.variants)) product.variants = product.variants.map(sanitizeProductVariant);
  return product;
};

const sanitizeRewardForCustomer = (source = {}, id = '') => ({
  id: `${id || source.id || ''}`,
  ...pickFields(source, REWARD_PUBLIC_FIELDS)
});

const sanitizePromotionForCustomer = (source = {}, id = '') => ({
  id: `${id || source.id || ''}`,
  ...pickFields(source, PROMOTION_PUBLIC_FIELDS)
});

const sanitizeCustomerAccountForClient = (source = {}, id = '') => ({
  id: `${id || source.id || ''}`,
  ...pickFields(source, CUSTOMER_ACCOUNT_PUBLIC_FIELDS)
});

const sanitizeCustomerProfileForClient = (source = {}, id = '') => ({
  id: `${id || source.id || ''}`,
  companyId: `${source.companyId || source.company_id || ''}`,
  ...pickFields(source, CUSTOMER_PROFILE_PUBLIC_FIELDS)
});

const parsePositiveInteger = (value) => {
  const parsed = Number(`${value ?? ''}`.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const parseMoney = (value) => {
  const parsed = Number(`${value ?? ''}`.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const getAvailablePoints = (record = {}) => parsePositiveInteger(
  record.available_points
  ?? record.availablePoints
  ?? record.available
  ?? record.total_points
  ?? record.totalPoints
  ?? record.currentPoints
  ?? record.current_points
  ?? record.balance
  ?? record.points
  ?? record.pointBalance
  ?? record.point_balance
  ?? 0
);

const getUsedPoints = (record = {}) => parsePositiveInteger(record.used_points ?? record.usedPoints ?? 0);

const getCompanyPointValue = (company = {}) => {
  const configured = parseMoney(company.loyaltyRedeemValuePerPoint);
  return configured > 0 ? configured : DEFAULT_POINT_VALUE;
};

const normalizeRequestId = (value = '') => `${value || ''}`
  .trim()
  .replace(/[^a-zA-Z0-9_-]/g, '')
  .slice(0, 96);

const buildPointRedemptionId = ({ customerId = '', requestId = '' } = {}) => {
  const normalizedCustomerId = `${customerId || ''}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const normalizedRequestId = normalizeRequestId(requestId);
  if (!normalizedCustomerId || !normalizedRequestId) return '';
  return `p_points_${normalizedCustomerId}_${normalizedRequestId}`;
};

const calculatePointRedemption = ({
  pointsRecord = {},
  company = {},
  requestedPoints = 0,
  requestedAmount = 0,
  outstandingDebt = 0
} = {}) => {
  const availablePoints = getAvailablePoints(pointsRecord);
  const pointsToUse = Math.min(availablePoints, parsePositiveInteger(requestedPoints));
  const pointValue = getCompanyPointValue(company);
  const debt = parseMoney(outstandingDebt);
  const requested = parseMoney(requestedAmount);
  const amountCap = requested > 0 ? Math.min(requested, debt) : debt;
  const amount = Math.min(amountCap, pointsToUse * pointValue);
  return {
    availablePoints,
    pointsToUse,
    pointValue,
    outstandingDebt: debt,
    amount,
    nextAvailablePoints: Math.max(0, availablePoints - pointsToUse),
    nextUsedPoints: getUsedPoints(pointsRecord) + pointsToUse,
    valid: pointsToUse > 0 && amount > 0 && debt > 0
  };
};

const isOfficialPayment = (payment = {}) => {
  const requiresApproval = Boolean(
    payment.requiresApproval
    || ['pending_handover', 'rejected'].includes(payment.approvalStatus)
    || ['pending', 'handed_over'].includes(payment.handoverStatus)
    || ['driver_delivery_expense', 'employee_reported_expense', 'employee_reported_income'].includes(payment.sourceType)
    || (payment.sourceType === 'driver_cash' && payment.createdByRole === 'driver')
  );
  return !requiresApproval || payment.approvalStatus === 'approved';
};

const calculateCustomerOutstandingDebt = ({ customer = {}, orders = [], payments = [] } = {}) => {
  const openingDebt = parseMoney(customer.openingDebtAmount ?? customer.oldDebtAmount ?? customer.legacyDebtAmount ?? 0);
  const orderTotal = orders
    .filter(order => !order?.isArchived)
    .reduce((sum, order) => sum + parseMoney(order.amount ?? order.totalAmount ?? order.finalAmount ?? order.grandTotal ?? 0), 0);
  const paymentTotal = payments
    .filter(payment => !payment?.isArchived && isOfficialPayment(payment))
    .reduce((sum, payment) => sum + parseMoney(payment.amount ?? payment.paymentAmount ?? payment.actualAmount ?? 0), 0);
  return Math.max(0, openingDebt + orderTotal - paymentTotal);
};

const hashAuditValue = (value = '') => crypto.createHash('sha256').update(`${value || ''}`).digest('hex').slice(0, 16);

module.exports = {
  buildPointRedemptionId,
  calculateCustomerOutstandingDebt,
  calculatePointRedemption,
  cloneJsonSafe,
  getAvailablePoints,
  getCompanyPointValue,
  hashAuditValue,
  normalizeRequestId,
  sanitizeCompanyForCustomer,
  sanitizeCustomerAccountForClient,
  sanitizeCustomerProfileForClient,
  sanitizeProductForCustomer,
  sanitizePromotionForCustomer,
  sanitizeRewardForCustomer
};
