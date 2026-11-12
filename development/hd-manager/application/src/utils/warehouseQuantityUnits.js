const normalizeUnitKey = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, '')
  .trim();

export const DEFAULT_WAREHOUSE_QUANTITY_UNIT_SUGGESTIONS = ['Con', 'Kg', 'Cái', 'Bộ', 'Thùng'];

export const normalizeWarehouseQuantityUnit = (value = '') => {
  const raw = `${value || ''}`.replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const knownUnits = {
    con: 'Con',
    kg: 'Kg',
    ky: 'Kg',
    ki: 'Kg',
    kilo: 'Kg',
    cai: 'Cái',
    bo: 'Bộ',
    boc: 'Bọc',
    bao: 'Bao',
    thung: 'Thùng',
    can: 'Can',
    tui: 'Túi',
    ro: 'Rổ'
  };
  return knownUnits[normalizeUnitKey(raw)] || raw;
};

export const dedupeWarehouseQuantityUnits = (units = []) => {
  const result = [];
  const seen = new Set();
  for (const unit of Array.isArray(units) ? units : []) {
    const normalized = normalizeWarehouseQuantityUnit(unit);
    const key = normalizeUnitKey(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
};

const getRecordTime = (record = {}) => {
  const raw = record?.createdAt || record?.updatedAt || record?.date || record?.createdDate || '';
  const timestamp = typeof raw === 'number' ? raw : Date.parse(`${raw}`);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const recordProductKey = (record = {}) => normalizeUnitKey(
  record?.productId
  || record?.productCode
  || record?.productBarcode
  || record?.productName
  || record?.productNameSnapshot
  || ''
);

const recordGroupKey = (record = {}) => normalizeUnitKey(
  record?.groupName || record?.productGroup || record?.productGroupName || ''
);

export const getRecentWarehouseQuantityUnits = (records = [], context = {}) => {
  const productKey = normalizeUnitKey(context.productId || context.productCode || context.productName || '');
  const groupKey = normalizeUnitKey(context.groupName || '');
  const matches = (Array.isArray(records) ? records : [])
    .filter(record => record && !record.isArchived)
    .filter(record => {
      const hasProductContext = Boolean(productKey);
      const productMatches = hasProductContext && recordProductKey(record) === productKey;
      const groupMatches = Boolean(groupKey) && recordGroupKey(record) === groupKey;
      return productMatches || (!hasProductContext && groupMatches) || (hasProductContext && groupMatches);
    })
    .sort((left, right) => getRecordTime(right) - getRecordTime(left));
  return dedupeWarehouseQuantityUnits(matches.map(record => record.quantityUnit || record.unit));
};

export const resolveRememberedWarehouseQuantityUnit = (records = [], context = {}) => {
  const productKey = normalizeUnitKey(context.productId || context.productCode || context.productName || '');
  const groupKey = normalizeUnitKey(context.groupName || '');
  const activeRecords = (Array.isArray(records) ? records : [])
    .filter(record => record && !record.isArchived)
    .sort((left, right) => getRecordTime(right) - getRecordTime(left));
  const productMatch = productKey
    ? activeRecords.find(record => recordProductKey(record) === productKey && (record.quantityUnit || record.unit))
    : null;
  const groupMatch = groupKey
    ? activeRecords.find(record => recordGroupKey(record) === groupKey && (record.quantityUnit || record.unit))
    : null;
  return normalizeWarehouseQuantityUnit((productMatch || groupMatch)?.quantityUnit || (productMatch || groupMatch)?.unit || '');
};

export const buildWarehouseQuantityUnitSuggestions = ({
  currentUnit = '',
  rememberedUnit = '',
  recentUnits = [],
  customUnits = [],
  defaultUnits = DEFAULT_WAREHOUSE_QUANTITY_UNIT_SUGGESTIONS,
  max = 5
} = {}) => dedupeWarehouseQuantityUnits([
  rememberedUnit,
  currentUnit,
  ...recentUnits,
  ...customUnits,
  ...defaultUnits
]).slice(0, Math.max(1, Number(max) || 5));

export const addWarehouseQuantityUnit = (units = [], unit = '') => (
  dedupeWarehouseQuantityUnits([...units, unit])
);
