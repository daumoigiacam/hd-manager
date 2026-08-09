const normalizeTextValue = (value = '') => `${value ?? ''}`.trim();

export const applyOrderRequestClassificationEdit = (
  item = {},
  { sizeLabel = '', attributeLabel = '' } = {}
) => {
  const normalizedSizeLabel = normalizeTextValue(sizeLabel);
  const normalizedAttributeLabel = normalizeTextValue(attributeLabel);

  return {
    ...item,
    sizeLabel: normalizedSizeLabel,
    attributeLabel: normalizedAttributeLabel,
    productAttribute: normalizedAttributeLabel,
  };
};

export const getOrderRequestSizeDisplayValue = (row = {}) => {
  const sizeLabel = normalizeTextValue(
    row.sizeLabel ?? row.size ?? row.productSize ?? row.variantSize ?? row.weightKg ?? ''
  );
  if (sizeLabel) return sizeLabel;

  return normalizeTextValue(
    row.attributeLabel ?? row.productAttribute ?? row.attribute ?? row.variant ?? ''
  );
};
