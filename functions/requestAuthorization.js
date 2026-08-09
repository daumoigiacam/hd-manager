const normalizeText = (value = '') => `${value || ''}`.trim();

const getCustomerIdFromOrder = (order = {}) => normalizeText(
  order.customerId
  || order.customer_id
  || order.customer?.id
  || order.customer?.customerId
);

const authorizeTenantRequest = ({ claims = {}, appId = '', allowedAppId = '' } = {}) => {
  const companyId = normalizeText(claims.companyId);
  const identityId = normalizeText(claims.identityId);
  const accountType = normalizeText(claims.accountType).toLowerCase();
  const requestedAppId = normalizeText(appId);
  const configuredAppId = normalizeText(allowedAppId);
  const isAnonymous = Boolean(
    claims.firebase?.sign_in_provider === 'anonymous'
    || claims.isAnonymous
  );

  if (!identityId || !companyId || isAnonymous) {
    return {
      allowed: false,
      statusCode: 401,
      code: 'identity_session_required',
      message: 'Phien dang nhap khong thuoc Identity Center.'
    };
  }
  if (!requestedAppId || !configuredAppId || requestedAppId !== configuredAppId) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'app_scope_denied',
      message: 'Ung dung khong thuoc pham vi duoc phep.'
    };
  }
  return {
    allowed: true,
    companyId,
    identityId,
    accountType,
    customerId: normalizeText(claims.customerId),
    appUserId: normalizeText(claims.appUserId)
  };
};

const authorizeTenantOrderAccess = ({ claims = {}, appId = '', allowedAppId = '', order = {} } = {}) => {
  const tenantDecision = authorizeTenantRequest({ claims, appId, allowedAppId });
  if (!tenantDecision.allowed) return tenantDecision;

  const orderCompanyId = normalizeText(order.companyId || order.company_id);
  if (!orderCompanyId || orderCompanyId !== tenantDecision.companyId) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'cross_tenant_order_denied',
      message: 'Ban khong co quyen truy cap don hang nay.'
    };
  }

  if (tenantDecision.accountType === 'customer') {
    const orderCustomerId = getCustomerIdFromOrder(order);
    if (!tenantDecision.customerId || orderCustomerId !== tenantDecision.customerId) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'customer_order_denied',
        message: 'Ban khong co quyen truy cap don hang nay.'
      };
    }
  }

  return tenantDecision;
};

module.exports = {
  authorizeTenantRequest,
  authorizeTenantOrderAccess,
  getCustomerIdFromOrder
};
