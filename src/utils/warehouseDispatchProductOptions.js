const dedupeActiveProducts = (products = []) => {
  const productMap = new Map();

  (Array.isArray(products) ? products : []).forEach((product) => {
    const productId = `${product?.id || ''}`.trim();
    if (!productId || product?.isArchived || productMap.has(productId)) return;
    productMap.set(productId, product);
  });

  return Array.from(productMap.values());
};

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
