const normalizeTenantId = (value) => `${value || ''}`.trim();

export const getWorkflowDataReadiness = ({
  activeTenantId = '',
  readinessTenantId = '',
  serverConfirmedCollections = {},
} = {}) => {
  const normalizedActiveTenantId = normalizeTenantId(activeTenantId);
  const tenantMatches = Boolean(
    normalizedActiveTenantId
    && normalizedActiveTenantId === normalizeTenantId(readinessTenantId)
  );
  const confirmed = serverConfirmedCollections && typeof serverConfirmedCollections === 'object'
    ? serverConfirmedCollections
    : {};

  const customers = tenantMatches && confirmed.customers === true;
  const products = tenantMatches && confirmed.products === true;

  return {
    tenantMatches,
    customers,
    products,
    sales: customers && products,
  };
};

export const shouldShowMissingWorkflowSetup = ({
  canCreate = false,
  dataReady = false,
  hasCustomers = false,
  hasProducts = false,
  requiresCustomers = true,
  requiresProducts = true,
} = {}) => Boolean(
  canCreate
  && dataReady
  && (
    (requiresCustomers && !hasCustomers)
    || (requiresProducts && !hasProducts)
  )
);
