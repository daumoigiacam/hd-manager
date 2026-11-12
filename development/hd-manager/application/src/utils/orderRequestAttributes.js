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

// Keep configured sizes/prices intact and fill only missing catalog attributes.
export const expandOrderRequestAttributes = (attributes, variants, base) => {
  const normalize = value => `${value || ''}`.trim().normalize('NFC').toLocaleLowerCase('vi');
  const result = variants.filter(variant => variant.attributeLabel || !attributes.length);
  const existing = new Set(result.map(variant => normalize(variant.attributeLabel)));
  for (const label of attributes) {
    if (existing.has(normalize(label))) continue;
    existing.add(normalize(label));
    result.push({ ...base, id: `catalog:${normalize(label)}`, configurationId: '', attributeLabel: label });
  }
  return result;
};
