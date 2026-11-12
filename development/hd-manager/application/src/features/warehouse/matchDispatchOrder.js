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
              (requestLine.requestId && row.requestId === requestLine.requestId)
              || (requestLine.rowKey && (row.rowKey === requestLine.rowKey || row.item?.rowKey === requestLine.rowKey))
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

    return uniqueRows
      .map((row, index) => {
        const item = row.item || row;
        const rowQuantity = getOrderLineQuantityValue(item) || getOrderLineQuantityValue(row);
        const rowWeight = getOrderLineWeightKgValue(item) || getOrderLineWeightKgValue(row);
        const rowSizeKey = normalizeLookupText(row.sizeLabel || getOrderLineSizeLabel(item));
        const rowUnitKey = normalizeLookupText(row.quantityUnit || item?.quantityUnit || item?.unit || row.productUnit || '');
        const itemRowKey = `${item?.rowKey || item?.id || item?.lineId || item?.itemId || ''}`.trim();
        const legacyProductRowKey = `${row.requestId || 'request'}_${row.productId || productId}`;
        const rowTimestamp = item?.requestTimestamp || item?.timestamp || getEntityTimestamp(item) || 0;
        return {
          row,
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
        b.score - a.score
        || b.rowTimestamp - a.rowTimestamp
        || a.index - b.index
      ))[0]?.row || null;

}
