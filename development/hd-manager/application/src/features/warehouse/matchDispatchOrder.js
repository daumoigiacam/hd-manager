/** @param {import('./dispatchWorkflowContracts.js').OrderRow} row
 * @param {(row: import('./dispatchWorkflowContracts.js').OrderRow) => number} [getEntityTimestamp] */
const requestRecency = (row, getEntityTimestamp = () => 0) => {
  const item = row.item || row;
  return Number(row.requestTimestamp || item.requestTimestamp || item.timestamp
    || getEntityTimestamp(item) || getEntityTimestamp(row)) || 0;
};

// Backlog rows remain available, but never become the default just because an
// old order happens to have the same physical quantity as today's dispatch.
/** @param {readonly import('./dispatchWorkflowContracts.js').OrderRow[]} rows
 * @param {(row: import('./dispatchWorkflowContracts.js').OrderRow) => number} [getEntityTimestamp] */
export function selectPreferredDispatchOrderRow(rows = [], getEntityTimestamp) {
  return [...rows].sort((a, b) => String(b.requestDate || '').localeCompare(String(a.requestDate || ''))
    || requestRecency(b, getEntityTimestamp) - requestRecency(a, getEntityTimestamp))[0] || null;
}

/** @param {import('./dispatchWorkflowContracts.js').OrderRow} row @param {string} [productId] */
export function getDispatchOrderSourceRowKeys(row, productId = '') {
  const item = row.item || row;
  const requestId = row.requestId || 'request';
  const productKey = row.productId || productId;
  return [row.rowKey, item.rowKey, item.id, item.lineId, item.itemId,
    `${requestId}_${productKey}`,
    ...(row.itemIndex !== undefined ? [`${requestId}_${row.itemIndex}`, `${requestId}_${productKey}_${row.itemIndex}`] : [])
  ].filter(Boolean);
}

/**
 * @param {string} customerId
 * @param {string} productId
 * @param {import('./dispatchWorkflowContracts.js').OrderRow} dispatchLike
 * @param {import('./dispatchWorkflowContracts.js').MatchingPorts} ports
 */
export function matchDispatchOrder(customerId = '', productId = '', dispatchLike = {}, {dispatchShortageSummary, dispatchOrderRows, buildDispatchOrderRowFromShortageLine, getDispatchRowQuantity, getDispatchRowWeight, normalizeLookupText, getOrderLineQuantityValue, getOrderLineWeightKgValue, getOrderLineSizeLabel, getOrderLineUnitPriceValue, getEntityTimestamp, areLooseQuantityValuesClose}) {
    if (!customerId || !productId) return null;
    /** @type {import('./dispatchWorkflowContracts.js').OrderRow[]} */
    const candidateRows = [];
    (dispatchShortageSummary?.issueLines || [])
      .filter(line => (
        line.customerId === customerId
        && line.productId === productId
        && Array.isArray(line.requestLines)
        && line.requestLines.length > 0
      ))
      .forEach((line) => {
        line.requestLines.forEach((requestLine) => {
          const matchedOpenRow = dispatchOrderRows.find(row => (
            row.customerId === customerId
            && row.productId === productId
            && (
              (requestLine.requestId && row.requestId === requestLine.requestId
                && (requestLine.itemIndex === undefined || row.itemIndex === requestLine.itemIndex))
              || (!requestLine.requestId && requestLine.rowKey && (row.rowKey === requestLine.rowKey || row.item?.rowKey === requestLine.rowKey))
            )
          ));
          candidateRows.push(matchedOpenRow || buildDispatchOrderRowFromShortageLine(line, requestLine));
        });
      });
    dispatchOrderRows
      .filter(row => row.customerId === customerId && row.productId === productId)
      .forEach(row => candidateRows.push(row));

    const uniqueRows = Array.from(candidateRows.reduce((rowMap, row) => {
      const key = row?.rowKey || `${row?.requestId || ''}_${row?.productId || ''}_${row?.item?.requestTimestamp || row?.item?.createdAt || row?.item?.updatedAt || rowMap.size}`;
      if (row && !rowMap.has(key)) rowMap.set(key, row);
      return rowMap;
    }, new Map(/** @type {[string, import('./dispatchWorkflowContracts.js').OrderRow][]} */ ([]))).values());
    if (!uniqueRows.length) return null;

    const dispatchQuantity = getDispatchRowQuantity(dispatchLike);
    const dispatchWeight = getDispatchRowWeight(dispatchLike);
    const dispatchSizeKey = normalizeLookupText(dispatchLike.size || dispatchLike.sizeLabel || dispatchLike.productSize || '');
    const dispatchUnitKey = normalizeLookupText(dispatchLike.quantityUnit || dispatchLike.unit || '');
    const sourceRowKey = `${dispatchLike.sourceOrderRequestRowKey || dispatchLike.orderRequestRowKey || dispatchLike.requestRowKey || ''}`.trim();
    const sourceRequestId = `${dispatchLike.sourceOrderRequestId || dispatchLike.orderRequestId || dispatchLike.requestId || ''}`.trim();
    const sourceDate = `${dispatchLike.sourceOrderRequestDate || dispatchLike.orderRequestDate || dispatchLike.requestDate || dispatchLike.requestDateKey || ''}`.trim();
    const branchId = dispatchLike.branchId ?? dispatchLike.customerBranchId;
    const attributeKey = normalizeLookupText(dispatchLike.attributeLabel || dispatchLike.productAttribute || '');

    return uniqueRows
      .filter(row => {
        if (branchId !== undefined && `${row.branchId || row.customerBranchId || row.item?.branchId || row.item?.customerBranchId || ''}` !== `${branchId}`) return false;
        if (sourceRequestId && row.requestId !== sourceRequestId) return false;
        if (!sourceRowKey) return true;
        return getDispatchOrderSourceRowKeys(row, productId).includes(sourceRowKey);
      })
      .map((row, index) => {
        const item = row.item || row;
        const rowQuantity = getOrderLineQuantityValue(item) || getOrderLineQuantityValue(row);
        const rowWeight = getOrderLineWeightKgValue(item) || getOrderLineWeightKgValue(row);
        const rowSizeKey = normalizeLookupText(row.sizeLabel || getOrderLineSizeLabel(item));
        const rowUnitKey = normalizeLookupText(row.quantityUnit || item?.quantityUnit || item?.unit || row.productUnit || '');
        const itemRowKey = `${item?.rowKey || item?.id || item?.lineId || item?.itemId || ''}`.trim();
        const legacyProductRowKey = `${row.requestId || 'request'}_${row.productId || productId}`;
        const rowTimestamp = requestRecency(row, getEntityTimestamp);
        return {
          row,
          sizeMatch: dispatchSizeKey && rowSizeKey === dispatchSizeKey ? 1 : 0,
          attributeMatch: attributeKey && normalizeLookupText(row.attributeLabel || item.attributeLabel || item.productAttribute || '') === attributeKey ? 1 : 0,
          unitMatch: dispatchUnitKey && rowUnitKey === dispatchUnitKey ? 1 : 0,
          score: (
            (sourceRowKey && (row.rowKey === sourceRowKey || itemRowKey === sourceRowKey || legacyProductRowKey === sourceRowKey) ? 10000 : 0)
            + (sourceRequestId && row.requestId === sourceRequestId ? 6000 : 0)
            + (sourceDate && row.requestDate === sourceDate ? 1200 : 0)
            + (dispatchQuantity > 0 && areLooseQuantityValuesClose(dispatchQuantity, rowQuantity, 0.001) ? 500 : 0)
            + (dispatchWeight > 0 && areLooseQuantityValuesClose(dispatchWeight, rowWeight) ? 450 : 0)
            + (dispatchSizeKey && rowSizeKey && dispatchSizeKey === rowSizeKey ? 120 : 0)
            + (dispatchUnitKey && rowUnitKey && dispatchUnitKey === rowUnitKey ? 80 : 0)
            + (getOrderLineUnitPriceValue(item) > 0 || getOrderLineUnitPriceValue(row) > 0 ? 20 : 0)
          ),
          rowTimestamp,
          index
        };
      })
      .sort((a, b) => (
        b.sizeMatch - a.sizeMatch
        || b.attributeMatch - a.attributeMatch
        || b.unitMatch - a.unitMatch
        || String(b.row.requestDate || '').localeCompare(String(a.row.requestDate || ''))
        || b.rowTimestamp - a.rowTimestamp
        || b.score - a.score
        || a.index - b.index
      ))[0]?.row || null;

}
