const isTrueLike = (value) => value === true
  || value === 1
  || `${value || ''}`.trim().toLowerCase() === 'true';

const isFalseLike = (value) => value === false
  || value === 0
  || `${value || ''}`.trim().toLowerCase() === 'false';

// The company archive action is the canonical way to hide a product. The
// compatibility flags keep old/imported records from leaking into the portal.
export const isCustomerVisibleProduct = (product = {}) => {
  if (!product || typeof product !== 'object') return false;

  const hidden = [
    product.isArchived,
    product.isHidden,
    product.hidden,
    product.hiddenFromCustomers,
    product.customerHidden,
  ].some(isTrueLike);
  if (hidden) return false;

  return ![
    product.isVisible,
    product.visible,
    product.visibleToCustomer,
    product.visibleToCustomers,
    product.customerVisible,
    product.showToCustomers,
  ].some(isFalseLike);
};

export const filterCustomerVisibleProducts = (products = []) => (
  Array.isArray(products) ? products.filter(isCustomerVisibleProduct) : []
);
