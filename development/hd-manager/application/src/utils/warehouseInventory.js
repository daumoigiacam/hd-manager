const toFiniteQuantity = (value) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const compareSnapshots = (left = {}, right = {}) => {
  const dateDiff = `${left.dateKey || ''}`.localeCompare(`${right.dateKey || ''}`);
  if (dateDiff !== 0) return dateDiff;
  const timestampDiff = (left.timestamp || 0) - (right.timestamp || 0);
  if (timestampDiff !== 0) return timestampDiff;
  return (left.sourceIndex || 0) - (right.sourceIndex || 0);
};

export const buildWarehouseStockChecklistRows = (rows = [], limit = Number.POSITIVE_INFINITY) => {
  const checklistRows = (Array.isArray(rows) ? rows : [])
    .map((row = {}) => {
      const positiveMeasures = (Array.isArray(row.measureRows) ? row.measureRows : [])
        .filter(measure => toFiniteQuantity(measure?.remaining) > 0);
      const primaryMeasures = positiveMeasures.filter(measure => measure?.isPrimaryStockUnit !== false);
      const referenceMeasures = positiveMeasures.filter(measure => measure?.isPrimaryStockUnit === false);
      return {
        key: row.key,
        groupName: row.groupName,
        measureRows: [...primaryMeasures, ...referenceMeasures]
      };
    })
    .filter(row => row.measureRows.length > 0);
  const numericLimit = Number(limit);
  return Number.isFinite(numericLimit)
    ? checklistRows.slice(0, Math.max(0, numericLimit))
    : checklistRows;
};

export const resolveWarehouseStockCountStatus = (measureRows = [], hasSnapshot = false) => {
  if (!hasSnapshot) return 'uncounted';
  const rows = Array.isArray(measureRows) ? measureRows : [];
  if (rows.some(measure => measure?.status === 'loss')) return 'loss';
  if (rows.some(measure => measure?.status === 'surplus')) return 'surplus';
  if (rows.some(measure => measure?.status === 'uncounted')) return 'uncounted';
  return 'ok';
};

export const hasRecordedWarehouseStockMeasure = (measure = null) => (
  Boolean(measure) && measure?.status !== 'uncounted'
);

export const resolveWarehouseStockChecklistDisplayValue = (measure = null, expected = 0) => {
  const rawValue = hasRecordedWarehouseStockMeasure(measure)
    ? measure?.actual
    : expected;
  const value = toFiniteQuantity(rawValue);
  return Number.isFinite(value) ? value : 0;
};

export const selectLatestWarehouseStockCountMeasures = (records = [], options = {}) => {
  const {
    getGroupKey = item => `${item?.groupKey || item?.groupName || ''}`,
    getGroupName = item => `${item?.groupName || ''}`,
    getDateKey = item => `${item?.date || ''}`.slice(0, 10),
    getTimestamp = () => 0,
    getMeasures = item => item?.measures || [],
    getUnitKey = measure => `${measure?.unit || ''}`.trim().toLocaleLowerCase('vi'),
    targetDate = '',
    excludeTargetDate = false
  } = options;
  const latestByGroupAndUnit = new Map();

  (Array.isArray(records) ? records : []).forEach((item, sourceIndex) => {
    const groupKey = `${getGroupKey(item) || ''}`.trim();
    const groupName = `${getGroupName(item) || ''}`.trim();
    const dateKey = `${getDateKey(item) || ''}`.slice(0, 10);
    if (
      !groupKey
      || !dateKey
      || (targetDate && dateKey > targetDate)
      || (targetDate && excludeTargetDate && dateKey === targetDate)
    ) return;
    const timestamp = Number(getTimestamp(item)) || 0;

    const measures = getMeasures(item);
    (Array.isArray(measures) ? measures : []).forEach((measure) => {
      const unitKey = `${getUnitKey(measure) || ''}`.trim();
      const quantity = toFiniteQuantity(measure?.quantity);
      if (!unitKey || !Number.isFinite(quantity) || quantity < 0) return;
      const snapshot = {
        groupKey,
        groupName,
        unitKey,
        unit: measure?.unit || '',
        quantity,
        item,
        itemId: item?.id || '',
        dateKey,
        timestamp,
        sourceIndex
      };
      const snapshotKey = `${groupKey}::${unitKey}`;
      const current = latestByGroupAndUnit.get(snapshotKey);
      if (!current || compareSnapshots(current, snapshot) < 0) {
        latestByGroupAndUnit.set(snapshotKey, snapshot);
      }
    });
  });

  const groups = new Map();
  latestByGroupAndUnit.forEach((snapshot) => {
    if (!groups.has(snapshot.groupKey)) {
      groups.set(snapshot.groupKey, {
        key: snapshot.groupKey,
        groupName: snapshot.groupName,
        measures: [],
        items: [],
        latestItem: null,
        latestAt: 0
      });
    }
    const group = groups.get(snapshot.groupKey);
    group.measures.push(snapshot);
    if (!group.items.includes(snapshot.item)) group.items.push(snapshot.item);
    const currentLatest = {
      dateKey: `${group.latestItemDateKey || ''}`,
      timestamp: group.latestAt || 0,
      sourceIndex: group.latestItemSourceIndex || 0
    };
    if (!group.latestItem || compareSnapshots(currentLatest, snapshot) < 0) {
      group.latestItem = snapshot.item;
      group.latestItemDateKey = snapshot.dateKey;
      group.latestItemSourceIndex = snapshot.sourceIndex;
      group.latestAt = snapshot.timestamp;
    }
  });

  return groups;
};
