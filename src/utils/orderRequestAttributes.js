export const getOrderRequestAttributeOptions = (attributes, variants, base, size = '') => {
  const key = value => `${value || ''}`.trim().normalize('NFC').toLocaleLowerCase('vi');
  const options = new Map();
  for (const variant of variants) {
    const attribute = key(variant.attributeLabel);
    if (!attribute) continue;
    if (!options.has(attribute) || key(variant.size) === key(size)) options.set(attribute, variant);
  }
  for (const attributeLabel of attributes) {
    if (!options.has(key(attributeLabel))) {
      options.set(key(attributeLabel), { ...base, id: `catalog:${key(attributeLabel)}`, configurationId: '', attributeLabel });
    }
  }
  return [...options.values()];
};
