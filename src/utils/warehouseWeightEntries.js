export const WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE = 5;

export const createWarehouseWeightEntryRow = () => Array.from(
  { length: WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE },
  () => ''
);

export const parseWarehouseWeightEntryNumber = (value = '') => {
  const parsed = Number.parseFloat(`${value ?? ''}`.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const normalizeWarehouseWeightEntries = (entries = []) => entries
  .flatMap(entry => {
    const matches = [...`${entry ?? ''}`.matchAll(/\d+(?:[.,]\d+)?/g)].map(match => match[0]);
    return matches.length > 0 ? matches : [`${entry ?? ''}`];
  })
  .map(entry => parseWarehouseWeightEntryNumber(entry))
  .filter(value => value > 0);

export const getWarehouseWeightEntryTotal = (entries = []) => normalizeWarehouseWeightEntries(entries)
  .reduce((sum, value) => sum + value, 0);

export const ensureWarehouseWeightEntryRows = (entries = [], appendEmptyRowWhenFull = false) => {
  const cleanedEntries = (Array.isArray(entries) ? entries : []).map(entry => `${entry ?? ''}`);
  const baseEntries = cleanedEntries.length > 0 ? cleanedEntries : [''];
  const rowCount = Math.max(1, Math.ceil(baseEntries.length / WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE));
  const paddedEntries = [
    ...baseEntries,
    ...Array.from({ length: (rowCount * WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE) - baseEntries.length }, () => '')
  ];
  const lastRow = paddedEntries.slice(-WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE);
  if (appendEmptyRowWhenFull && lastRow.every(entry => `${entry}`.trim())) {
    return [...paddedEntries, ...createWarehouseWeightEntryRow()];
  }
  return paddedEntries;
};

export const sanitizeWarehouseWeightEntryValue = (value = '') => {
  const rawValue = `${value ?? ''}`.replace(/[^\d.,]/g, '');
  const separatorMatch = rawValue.match(/[.,]/);
  if (!separatorMatch) return rawValue;
  const separator = separatorMatch[0];
  const separatorIndex = rawValue.indexOf(separator);
  const integerPart = rawValue.slice(0, separatorIndex);
  const decimalPart = rawValue.slice(separatorIndex + 1).replace(/[^\d]/g, '').slice(0, 3);
  return `${integerPart}${separator}${decimalPart}`;
};

export const resolveWarehouseWeightEntryChange = (previousValue = '', incomingValue = '') => {
  const previousSanitized = sanitizeWarehouseWeightEntryValue(previousValue);
  const incomingRaw = `${incomingValue ?? ''}`.replace(/[^\d.,]/g, '');
  if (previousSanitized.length >= 2 && incomingRaw === `${previousSanitized}${previousSanitized}`) {
    return previousSanitized;
  }
  return sanitizeWarehouseWeightEntryValue(incomingValue);
};

export const updateWarehouseWeightEntryRows = (
  entries = [],
  index = 0,
  incomingValue = '',
  appendEmptyRowWhenFull = false
) => {
  const normalizedRows = ensureWarehouseWeightEntryRows(entries);
  const cleanedValue = resolveWarehouseWeightEntryChange(normalizedRows[index], incomingValue);
  if (normalizedRows[index] === cleanedValue) return entries;
  const nextEntries = [...normalizedRows];
  nextEntries[index] = cleanedValue;
  const isLastCellInRow = (index + 1) % WAREHOUSE_WEIGHT_ENTRY_ROW_SIZE === 0;
  const hasNextRow = nextEntries.length > index + 1;
  if (appendEmptyRowWhenFull && isLastCellInRow && cleanedValue.trim() && !hasNextRow) {
    return [...nextEntries, ...createWarehouseWeightEntryRow()];
  }
  return nextEntries;
};
