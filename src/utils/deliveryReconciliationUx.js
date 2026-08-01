export const DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT = 5;

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDispatchId = (row = {}) => `${row?.dispatch?.id || row?.dispatchId || ''}`.trim();

export function buildPendingDeliveryReconciliationGroups(groups = [], optimisticReportedDispatchIds = new Set()) {
  const reportedIds = optimisticReportedDispatchIds instanceof Set
    ? optimisticReportedDispatchIds
    : new Set(optimisticReportedDispatchIds || []);

  return (groups || []).reduce((pendingGroups, group, groupIndex) => {
    const pendingRows = (group?.rows || []).filter((row) => {
      const dispatchId = getDispatchId(row);
      return !row?.report && (!dispatchId || !reportedIds.has(dispatchId));
    });
    if (pendingRows.length === 0) return pendingGroups;

    const productLines = new Map();
    pendingRows.forEach((row) => {
      const productLabel = row?.productLabel || 'Hàng hóa';
      const unitPrice = toFiniteNumber(row?.unitPrice);
      const dispatchWeight = toFiniteNumber(row?.dispatchWeight);
      const lineKey = unitPrice > 0 ? `${productLabel}__${Math.round(unitPrice)}` : productLabel;
      if (!productLines.has(lineKey)) {
        productLines.set(lineKey, {
          productLabel,
          weight: 0,
          unitPrice,
          totalAmount: 0,
        });
      }
      const line = productLines.get(lineKey);
      line.weight += dispatchWeight;
      line.totalAmount += toFiniteNumber(row?.totalAmount)
        || (unitPrice > 0 && dispatchWeight > 0 ? unitPrice * dispatchWeight : 0);
    });

    const productWeightLines = Array.from(productLines.values());
    const paymentSummaryTotal = productWeightLines.reduce(
      (sum, line) => sum + toFiniteNumber(line.totalAmount),
      0,
    );
    const dispatchIds = pendingRows.map(getDispatchId).filter(Boolean);

    pendingGroups.push({
      ...group,
      rows: pendingRows,
      pendingCount: pendingRows.length,
      productWeightLines,
      paymentSummaryTotal,
      reconciliationOrder: groupIndex,
      renderSignature: [
        group?.key || '',
        group?.customerName || '',
        dispatchIds.join(','),
        productWeightLines.map((line) => (
          `${line.productLabel}:${line.weight}:${line.unitPrice}:${line.totalAmount}`
        )).join('|'),
      ].join('::'),
    });
    return pendingGroups;
  }, []);
}

export function countPendingDeliveryReconciliationDispatches(groups = []) {
  return (groups || []).reduce((sum, group) => sum + toFiniteNumber(group?.pendingCount), 0);
}

export function getVisibleDeliveryReconciliationGroups(
  groups = [],
  expanded = false,
  limit = DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT,
) {
  if (expanded) return groups;
  return (groups || []).slice(0, Math.max(0, limit));
}
