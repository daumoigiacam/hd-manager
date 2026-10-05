/** @template {{ id?: string, isArchived?: boolean }} Product @param {Product[]} products @returns {Product[]} */
const dedupeActiveProducts = (products = []) => {
  /** @type {Map<string, Product>} */
  const productMap = new Map();

  (Array.isArray(products) ? products : []).forEach((product) => {
    const productId = `${product?.id || ''}`.trim();
    if (!productId || product?.isArchived || productMap.has(productId)) return;
    productMap.set(productId, product);
  });

  return Array.from(productMap.values());
};

/**
 * @template {{ id?: string, isArchived?: boolean }} Product
 * @param {{ orderedProducts?: Product[], fixedProducts?: Product[], catalogProducts?: Product[], canBrowseCatalog?: boolean, canCreateWithoutOrderRequest?: boolean }} input
 */
export const buildWarehouseDispatchProductOptions = ({
  orderedProducts = [],
  fixedProducts = [],
  catalogProducts = [],
  canBrowseCatalog = false,
  canCreateWithoutOrderRequest = false,
} = {}) => {
  const preferredProducts = dedupeActiveProducts([
    ...orderedProducts,
    ...fixedProducts,
  ]);

  if (!(canBrowseCatalog || canCreateWithoutOrderRequest)) {
    return preferredProducts;
  }

  return dedupeActiveProducts([
    ...preferredProducts,
    ...catalogProducts,
  ]);
};
