const normalizeMarginNumber = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProductKeyText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const getPricingProductMarginKey = (product = {}) => {
  const explicitKey = `${product?.id || product?.docId || product?.productId || ''}`.trim();
  if (explicitKey) return explicitKey;
  const name = `${product?.name || product?.productName || product?.title || ''}`.trim();
  return name ? `name:${normalizeProductKeyText(name)}` : '';
};

export const normalizePricingMarginByProduct = (marginByProduct = {}) => {
  if (!marginByProduct || typeof marginByProduct !== 'object' || Array.isArray(marginByProduct)) return {};
  return Object.fromEntries(Object.entries(marginByProduct)
    .map(([productKey, saved]) => {
      const source = saved && typeof saved === 'object' && !Array.isArray(saved)
        ? saved
        : { targetMargin: saved };
      const key = `${productKey || ''}`.trim();
      if (!key) return null;
      return [key, {
        minMargin: normalizeMarginNumber(source.minMargin, 0),
        targetMargin: normalizeMarginNumber(source.targetMargin ?? source.margin, 0),
        maxMargin: normalizeMarginNumber(source.maxMargin, 0),
      }];
    })
    .filter(Boolean));
};

export const getPricingProductTargetMargin = (marginByProduct = {}, productKey = '', fallback = 0) => {
  const key = `${productKey || ''}`.trim();
  if (!key) return normalizeMarginNumber(fallback, 0);
  const saved = marginByProduct?.[key];
  if (saved === undefined || saved === null) return normalizeMarginNumber(fallback, 0);
  const source = saved && typeof saved === 'object' ? saved : { targetMargin: saved };
  return normalizeMarginNumber(source.targetMargin ?? source.margin, 0);
};

export const buildPricingProductMarginRows = ({
  products = [],
  getGroupKey,
  getGroupLabel,
  marginByProduct = {},
  legacyMarginByGroup = {},
} = {}) => {
  const normalizedMargins = normalizePricingMarginByProduct(marginByProduct);
  const hasProductMargins = Object.keys(normalizedMargins).length > 0;
  return (Array.isArray(products) ? products : [])
    .filter(product => product && !product.isArchived)
    .map(product => {
      const productKey = getPricingProductMarginKey(product);
      const groupKey = `${getGroupKey?.(product) || ''}`.trim();
      const groupMargin = normalizeMarginNumber(legacyMarginByGroup?.[groupKey]?.targetMargin, 0);
      const hasSavedProductMargin = Object.prototype.hasOwnProperty.call(normalizedMargins, productKey);
      return {
        productKey,
        product,
        productName: `${product?.name || product?.productName || product?.title || 'Sản phẩm'}`.trim(),
        groupKey,
        groupLabel: getGroupLabel?.(product) || 'Nhóm hàng',
        targetMargin: hasSavedProductMargin
          ? getPricingProductTargetMargin(normalizedMargins, productKey, 0)
          : (hasProductMargins ? 0 : groupMargin),
        inheritedFromGroup: !hasSavedProductMargin && !hasProductMargins && groupMargin > 0,
      };
    })
    .filter(row => row.productKey && row.groupKey)
    .sort((left, right) => `${left.groupLabel}${left.productName}`.localeCompare(`${right.groupLabel}${right.productName}`, 'vi'));
};
