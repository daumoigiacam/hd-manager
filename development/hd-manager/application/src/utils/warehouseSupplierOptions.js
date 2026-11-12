const normalizeSupplierName = (value = '') => `${value}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizeSupplierPhone = (value = '') => {
  const digits = `${value}`.replace(/\D/g, '');
  return digits.startsWith('84') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
};

export const getWarehouseSupplierOptionKey = (option = {}) => {
  const phone = normalizeSupplierPhone(option.phone || option.phoneNumber || '');
  if (phone) return `phone:${phone}`;
  const name = normalizeSupplierName(option.name || option.supplierName || option.customerName || '');
  if (name) return `name:${name}`;
  const id = `${option.id || ''}`.trim();
  return id ? `id:${id}` : '';
};

export const mergeWarehouseSupplierOptions = (recentOptions = [], customerOptions = []) => {
  const optionMap = new Map();
  recentOptions.forEach(option => {
    const key = getWarehouseSupplierOptionKey(option);
    if (key) optionMap.set(key, option);
  });
  customerOptions.forEach(option => {
    const key = getWarehouseSupplierOptionKey(option);
    if (key) optionMap.set(key, option);
  });
  return Array.from(optionMap.values());
};
