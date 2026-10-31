// Frozen candidate9b6f622a complete synchronous shortage summary.
export default ({
  orderRequests = [],
  warehouseDispatches = [],
  customers = [],
  products = [],
  dateKey = getTodayString(),
  dispatchDateKey = dateKey,
  autoCancelAfterDays = 0,
  includePreviousOpenOrders = false,
  fromDateKey = '',
  statusesOnly = false,
  notificationOnly = false,
  dispatchIndexCache = null
} = {}) => {
  const customerLookup = new Map((customers || []).map(customer => [customer.id, customer]));
  const productLookup = new Map((products || []).map(product => [product.id, product]));
  const normalizedAutoCancelDays = Math.max(0, parseInt(autoCancelAfterDays, 10) || 0);
  const normalizedDateKey = dateKey || getTodayString();
  const normalizedDispatchDateKey = dispatchDateKey || normalizedDateKey;
  const normalizedFromDateKey = /^\d{4}-\d{2}-\d{2}$/.test(`${fromDateKey || ''}`) ? fromDateKey : '';
  const shouldUseBacklog = Boolean(includePreviousOpenOrders);
  const shortageDateTimestamps = new Map();
  // Cache labels only within this calculation; quantities/statuses stay live.
  const normalizedLabels = new Map();
  const lineVariantCache = new Map();
  let cachedLineVariantCount = 0;
  const normalizeShortageLabel = (value = '') => {
    const text = `${value}`;
    if (normalizedLabels.has(text)) return normalizedLabels.get(text);
    const normalized = normalizeLookupText(text);
    if (text.length <= 256 && normalizedLabels.size < 2048) normalizedLabels.set(text, normalized);
    return normalized;
  };
  const buildLineKeyVariants = ({
    customerId = '',
    customerName = '',
    productId = '',
    productName = '',
    productShortName = '',
    cacheRecord = null
  } = {}) => {
    const values = [customerId, customerName, productId, productName, productShortName];
    const cacheable = values.every(value => typeof value === 'string' && value.length <= 256);
    const hasCacheRecord = cacheRecord && typeof cacheRecord === 'object';
    const cachedRecord = hasCacheRecord && warehouseShortageKeyCache.get(cacheRecord);
    if (cacheable && cachedRecord && values.every((value, index) => Object.is(value, cachedRecord.values[index]))) {
      return cachedRecord.keys.slice();
    }
    if (cacheable) {
      let cached = lineVariantCache;
      for (const value of values) cached = cached?.get(value);
      if (cached) {
        if (hasCacheRecord) warehouseShortageKeyCache.set(cacheRecord, { values, keys: cached });
        return cached.slice();
      }
    }
    const customerKeys = Array.from(new Set([
      customerId,
      normalizeShortageLabel(customerName || '')
    ].filter(Boolean)));
    const productKeys = Array.from(new Set([
      productId,
      normalizeShortageLabel(productName || ''),
      normalizeShortageLabel(productShortName || '')
    ].filter(Boolean)));
    const variants = [];
    customerKeys.forEach(customerKey => {
      productKeys.forEach(productKey => {
        variants.push([customerKey, productKey].join('__'));
      });
    });
    const result = variants.length > 0 ? Array.from(new Set(variants)) : ['__'];
    if (cacheable && hasCacheRecord) warehouseShortageKeyCache.set(cacheRecord, { values, keys: result.slice() });
    if (cacheable && cachedLineVariantCount < 2048) {
      let node = lineVariantCache;
      values.slice(0, -1).forEach(value => {
        if (!node.has(value)) node.set(value, new Map());
        node = node.get(value);
      });
      node.set(values.at(-1), result.slice());
      cachedLineVariantCount += 1;
    }
    return result;
  };
  const shouldIncludeOrderRequestDate = (requestDate = '') => {
    const targetDate = requestDate || normalizedDateKey;
    if (!shouldUseBacklog) {
      if (targetDate !== normalizedDateKey) return false;
      if (normalizedAutoCancelDays <= 0) return true;
      return getDaysBetweenDateKeys(targetDate, normalizedDispatchDateKey) <= normalizedAutoCancelDays;
    }
    if (targetDate > normalizedDispatchDateKey) return false;
    if (normalizedFromDateKey && targetDate < normalizedFromDateKey) return false;
    if (normalizedAutoCancelDays <= 0) return true;
    return getDaysBetweenDateKeys(targetDate, normalizedDispatchDateKey) <= normalizedAutoCancelDays;
  };
  const resolveDispatchSourceOrderDate = (dispatch = {}) => `${dispatch.sourceOrderRequestDate
    || dispatch.orderRequestDate
    || dispatch.requestDate
    || dispatch.requestDateKey
    || dispatch.sourceOrderDate
    || ''}`.trim();
  const shouldIncludeDispatchForShortage = (dispatch = {}) => {
    const sourceOrderDate = resolveDispatchSourceOrderDate(dispatch);
    const dispatchDate = resolveEntityDateKey(dispatch, normalizedDispatchDateKey);
    if (dispatchDate && dispatchDate > normalizedDispatchDateKey) return false;
    if (sourceOrderDate) return shouldIncludeOrderRequestDate(sourceOrderDate);
    if (shouldUseBacklog) {
      if (dispatchDate > normalizedDispatchDateKey) return false;
      if (normalizedFromDateKey && dispatchDate < normalizedFromDateKey) return false;
      return true;
    }
    return dispatchDate === normalizedDateKey;
  };
  const buildShortageDateTimestamp = (targetDate = '', endOfDay = false) => {
    const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(`${targetDate || ''}`) ? targetDate : '';
    if (!dateValue) return 0;
    const cacheKey = `${dateValue}:${endOfDay ? 'end' : 'start'}`;
    if (shortageDateTimestamps.has(cacheKey)) return shortageDateTimestamps.get(cacheKey);
    const parsed = new Date(`${dateValue}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).getTime();
    const timestamp = Number.isFinite(parsed) ? parsed : 0;
    if (shortageDateTimestamps.size < 256) shortageDateTimestamps.set(cacheKey, timestamp);
    return timestamp;
  };
  const resolveRequestLineTimestamp = (request = {}, requestDate = '') => (
    getEntityTimestamp(request) || buildShortageDateTimestamp(requestDate || normalizedDateKey, false)
  );
  const resolveDispatchLineTimestamp = (dispatch = {}, dispatchDate = '') => (
    getEntityTimestamp(dispatch) || buildShortageDateTimestamp(dispatchDate || normalizedDispatchDateKey, true)
  );

  const requestedLineMap = new Map();
  const emptyClosedShortItemKeys = new Set();
  const appendRequestLines = (request, requestedLineMap) => {
      const requestDate = resolveEntityDateKey(request, normalizedDateKey);
      const requestTimestamp = resolveRequestLineTimestamp(request, requestDate);
      const customer = customerLookup.get(request.customerId);
      const customerName = customer?.name || request.customerName || request.customerNameSnapshot || 'Khách hàng';
      const items = Array.isArray(request.items) && request.items.length > 0
        ? request.items
        : (request.primaryItem ? [request.primaryItem] : []);
      const closedShortItems = request.closedShortItems && typeof request.closedShortItems === 'object' && !Array.isArray(request.closedShortItems)
        ? request.closedShortItems
        : {};
      const closedShortKeys = [
        ...(Array.isArray(request.closedShortItemKeys) ? request.closedShortItemKeys : []),
        ...Object.keys(closedShortItems)
      ].filter(Boolean);
      const closedShortItemKeys = closedShortKeys.length > 0
        ? new Set(closedShortKeys)
        : emptyClosedShortItemKeys;

      items.forEach((item, itemIndex) => {
        const product = productLookup.get(item.productId);
        const productName = product?.name || item.description || item.productName || item.productNameSnapshot || 'Hàng hóa';
        const productShortName = getProductShortName(product) || `${item.productShortName || item.shortName || item.productCode || ''}`.trim().toUpperCase();
        const itemRowKey = item.rowKey
          || item.id
          || item.lineId
          || item.itemId
          || `${request.id || 'request'}_${item.productId || normalizeShortageLabel(productName) || itemIndex}_${itemIndex}`;
        const closedShortMeta = closedShortItems[itemRowKey] || closedShortItems[item.productId] || closedShortItems[normalizeShortageLabel(productName)] || null;
        if (
          item.status === 'closed_short'
          || item.dispatchStatus === 'closed_short'
          || Boolean(closedShortMeta)
          || closedShortItemKeys.has(itemRowKey)
          || closedShortItemKeys.has(item.productId)
          || closedShortItemKeys.has(normalizeShortageLabel(productName))
        ) {
          return;
        }
        const lineKeyVariants = buildLineKeyVariants({
          cacheRecord: item,
          customerId: request.customerId,
          customerName,
          productId: item.productId,
          productName,
          productShortName
        });
        const lineKey = lineKeyVariants[0];
        const quantityValue = notificationOnly ? 0 : parseLooseQuantityValue(item.quantity ?? item.quantityValue ?? item.qty);
        const quantityUnit = `${item.quantityUnit || product?.unit || ''}`.trim();
        const normalizedDisplayUnit = notificationOnly ? '' : normalizeWarehouseMeasureUnit(quantityUnit || 'Đơn vị');
        const current = requestedLineMap.get(lineKey) || {
          key: lineKey,
          aliasKeys: lineKeyVariants,
          customerId: request.customerId || '',
          productId: item.productId || '',
          customerName,
          productName,
          productShortName,
          requestCount: 0,
          requiredKg: 0,
          quantityByUnit: {},
          requestLines: [],
          latestTimestamp: 0
        };

        for (const alias of lineKeyVariants) {
          if (!current.aliasKeys.includes(alias)) current.aliasKeys.push(alias);
        }
        current.requestCount += 1;
        current.latestTimestamp = Math.max(current.latestTimestamp || 0, requestTimestamp || 0);
        if (quantityValue > 0) {
          addWarehouseShortageQuantity(current.quantityByUnit, normalizedDisplayUnit, quantityValue);
          if (isKgQuantityUnit(quantityUnit)) current.requiredKg += quantityValue;
        }
        current.requestLines.push(notificationOnly ? { requestTimestamp } : {
          rowKey: itemRowKey,
          itemIndex,
          requestId: request.id || '',
          requestDate,
          requestTimestamp,
          customerId: request.customerId || '',
          customerName,
          productId: item.productId || '',
          productName,
          productShortName,
          attributeLabel: `${item.attributeLabel || item.productAttribute || item.attribute || ''}`.trim(),
          sizeLabel: `${item.sizeLabel || item.weightKg || item.size || ''}`.trim(),
          quantity: quantityValue,
          quantityUnit: normalizedDisplayUnit,
          unitPrice: parseLooseMoneyValue(item.unitPrice ?? item.unit_price_vnd ?? item.price),
          note: request.note || '',
          totalAmount: request.totalAmount || 0,
          salesEmpId: request.salesEmpId || '',
          createdByEmpId: request.createdByEmpId || request.empId || ''
        });
        requestedLineMap.set(lineKey, current);
      });
  };
  // Only status/notification projections reuse immutable request preparation.
  // Full quantity reconciliation keeps its original accumulation order.
  const requestContext = [customers, products, normalizedDateKey, statusesOnly, notificationOnly];
  let requestCache = dispatchIndexCache?.requestProjection;
  if (dispatchIndexCache && (statusesOnly || notificationOnly)
    && (!requestCache || !requestContext.every((value, index) => Object.is(value, requestCache.context[index])))) {
    requestCache = { context: requestContext, records: new WeakMap() };
    dispatchIndexCache.requestProjection = requestCache;
  }
  for (const request of orderRequests || []) {
    if (request?.isArchived || !shouldIncludeOrderRequestDate(resolveEntityDateKey(request, normalizedDateKey))) continue;
    if (!requestCache || !(statusesOnly || notificationOnly)) {
      appendRequestLines(request, requestedLineMap);
      continue;
    }
    let prepared = requestCache.records.get(request);
    if (!prepared) {
      prepared = new Map();
      appendRequestLines(request, prepared);
      requestCache.records.set(request, prepared);
    }
    for (const [key, line] of prepared) {
      const current = requestedLineMap.get(key);
      if (!current) {
        requestedLineMap.set(key, { ...line, aliasKeys: line.aliasKeys.slice(), requestLines: line.requestLines.slice() });
        continue;
      }
      for (const alias of line.aliasKeys) if (!current.aliasKeys.includes(alias)) current.aliasKeys.push(alias);
      current.requestCount += line.requestCount;
      current.latestTimestamp = Math.max(current.latestTimestamp || 0, line.latestTimestamp || 0);
      current.requestLines.push(...line.requestLines);
    }
  }

  const dispatchIndexContext = [warehouseDispatches, customers, products, normalizedDateKey,
    normalizedDispatchDateKey, normalizedFromDateKey, normalizedAutoCancelDays,
    shouldUseBacklog, statusesOnly, notificationOnly];
  const cachedDispatchIndex = dispatchIndexCache?.current;
  const reuseDispatchIndex = cachedDispatchIndex
    && dispatchIndexContext.every((value, index) => Object.is(value, cachedDispatchIndex.context[index]));
  const dispatchedLineMap = reuseDispatchIndex ? cachedDispatchIndex.value : new Map();
  if (!reuseDispatchIndex) (warehouseDispatches || [])
    .filter(dispatch => !dispatch?.isArchived)
    .filter(dispatch => shouldIncludeDispatchForShortage(dispatch))
    .forEach(dispatch => {
      const customer = customerLookup.get(dispatch.customerId);
      const product = productLookup.get(dispatch.productId);
      const customerName = customer?.name || dispatch.customerNameSnapshot || 'Khách hàng';
      const productName = product?.name || dispatch.productNameSnapshot || 'Hàng hóa';
      const productShortName = getProductShortName(product) || `${dispatch.productShortName || dispatch.shortName || dispatch.productCode || ''}`.trim().toUpperCase();
      const lineKeyVariants = buildLineKeyVariants({
        cacheRecord: dispatch,
        customerId: dispatch.customerId,
        customerName,
        productId: dispatch.productId,
        productName,
        productShortName
      });
      const dispatchDate = resolveEntityDateKey(dispatch, normalizedDispatchDateKey);
      const dispatchTimestamp = resolveDispatchLineTimestamp(dispatch, dispatchDate);
      const dispatchMeasures = statusesOnly || notificationOnly ? [] : buildWarehouseDispatchMeasureEntries(dispatch, product);
      const dispatchQuantityByUnit = {};
      dispatchMeasures.forEach(measure => {
        addWarehouseShortageQuantity(dispatchQuantityByUnit, measure.unit, measure.quantity);
      });
      const dispatchLine = {
        dispatchId: dispatch.id || '',
        dispatchDate,
        dispatchTimestamp,
        sourceOrderRequestId: `${dispatch.sourceOrderRequestId || dispatch.orderRequestId || ''}`.trim(),
        sourceOrderRequestRowKey: `${dispatch.sourceOrderRequestRowKey || dispatch.orderRequestRowKey || dispatch.requestRowKey || ''}`.trim(),
        aliasKeys: lineKeyVariants,
        quantityByUnit: dispatchQuantityByUnit
      };
      lineKeyVariants.forEach(lineKey => {
        const current = dispatchedLineMap.get(lineKey) || { dispatchLines: [] };
        current.dispatchLines.push(dispatchLine);
        dispatchedLineMap.set(lineKey, current);
      });
    });

  if (dispatchIndexCache && !reuseDispatchIndex) {
    dispatchIndexCache.current = { context: dispatchIndexContext, value: dispatchedLineMap };
  }
  const lines = Array.from(requestedLineMap.values()).map(line => {
    const requestLinesSorted = notificationOnly ? line.requestLines : (line.requestLines || [])
      .slice()
      .sort((a, b) => (a.requestTimestamp || 0) - (b.requestTimestamp || 0) || (a.itemIndex || 0) - (b.itemIndex || 0));
    const dispatchLineCandidateMap = new Map();
    (line.aliasKeys || [line.key]).forEach(aliasKey => {
      const dispatched = dispatchedLineMap.get(aliasKey);
      (dispatched?.dispatchLines || []).forEach((dispatchLine, index) => {
        const candidateKey = dispatchLine.dispatchId
          || [
            aliasKey,
            dispatchLine.dispatchDate || '',
            dispatchLine.sourceOrderRequestId || '',
            dispatchLine.sourceOrderRequestRowKey || '',
            index
          ].join('__');
        if (!dispatchLineCandidateMap.has(candidateKey)) {
          dispatchLineCandidateMap.set(candidateKey, dispatchLine);
        }
      });
    });
    const dispatchLines = Array.from(dispatchLineCandidateMap.values());
    if (notificationOnly) {
      let hasUntimedDispatch = false;
      let latestDispatchTimestamp = 0;
      for (const dispatch of dispatchLines) {
        if (!dispatch.dispatchTimestamp) hasUntimedDispatch = true;
        latestDispatchTimestamp = Math.max(latestDispatchTimestamp, dispatch.dispatchTimestamp || 0);
      }
      const missing = !hasUntimedDispatch && line.requestLines.some(request => (
        !dispatchLines.length || (request.requestTimestamp && request.requestTimestamp > latestDispatchTimestamp)
      ));
      return { status: missing ? 'missing' : 'done', latestTimestamp: line.latestTimestamp };
    }
    const dispatchLinesSorted = dispatchLines.sort((a, b) => (a.dispatchTimestamp || 0) - (b.dispatchTimestamp || 0));
    const untimedDispatchLines = dispatchLinesSorted.filter(dispatchLine => !dispatchLine.dispatchTimestamp);
    const dispatchedQuantityByUnit = statusesOnly ? {} : dispatchLinesSorted.reduce((acc, dispatchLine) => {
      Object.entries(dispatchLine.quantityByUnit || {}).forEach(([unit, value]) => {
        addWarehouseShortageQuantity(acc, unit, value);
      });
      return acc;
    }, {});
    const dispatchedKg = getWarehouseShortageQuantityValue(dispatchedQuantityByUnit, 'Kg');
    let lastRequestTimestamp;
    let lastDispatchMatch = null;
    const getDispatchMatch = (requestTimestamp = 0) => {
      if (lastDispatchMatch && Object.is(lastRequestTimestamp, requestTimestamp)) return lastDispatchMatch;
      let lower = 0;
      let upper = dispatchLinesSorted.length;
      while (lower < upper) {
        const middle = (lower + upper) >>> 1;
        if ((dispatchLinesSorted[middle].dispatchTimestamp || 0) < requestTimestamp) lower = middle + 1;
        else upper = middle;
      }
      // Untimed rows always match, even when a request has a timestamp.
      const matchedDispatchLines = requestTimestamp > 0
        ? untimedDispatchLines.concat(dispatchLinesSorted.slice(lower))
        : (requestTimestamp ? dispatchLinesSorted.slice(lower) : dispatchLinesSorted);
      // Keep the first candidate at a tied timestamp, as the stable sort did.
      let latestDispatchLine = null;
      matchedDispatchLines.forEach(dispatchLine => {
        if (!latestDispatchLine || (dispatchLine.dispatchTimestamp || 0) > (latestDispatchLine.dispatchTimestamp || 0)) {
          latestDispatchLine = dispatchLine;
        }
      });
      const match = {
        status: matchedDispatchLines.length > 0 ? 'dispatched' : 'missing',
        dispatchedAt: latestDispatchLine?.dispatchTimestamp || 0,
        dispatchedDate: latestDispatchLine?.dispatchDate || '',
        dispatchIds: matchedDispatchLines.map(dispatchLine => dispatchLine.dispatchId).filter(Boolean)
      };
      lastRequestTimestamp = requestTimestamp;
      lastDispatchMatch = match;
      return match;
    };
    const requestLineStatuses = requestLinesSorted.map(requestLine => {
      const match = getDispatchMatch(requestLine.requestTimestamp || 0);
      return {
        ...requestLine,
        ...match,
        dispatchIds: match.dispatchIds.slice()
      };
    });

    if (statusesOnly) return { requestLineStatuses };
    const missingRequestLines = requestLineStatuses.filter(requestLine => requestLine.status !== 'dispatched');
    const latestMissingTimestamp = Math.max(...missingRequestLines.map(requestLine => requestLine.requestTimestamp || 0), 0);
    const remainingQuantityByUnit = missingRequestLines.reduce((acc, requestLine) => {
      if (requestLine.quantity > 0) addWarehouseShortageQuantity(acc, requestLine.quantityUnit || 'Đơn vị', requestLine.quantity);
      return acc;
    }, {});
    const remainingKg = getWarehouseShortageQuantityValue(remainingQuantityByUnit, 'Kg');
    const isMissing = missingRequestLines.length > 0;
    return {
      ...line,
      allRequestLines: line.requestLines || [],
      requestLineStatuses,
      requestLines: missingRequestLines,
      requestCount: missingRequestLines.length,
      requestedLabel: formatWarehouseShortageQuantityLabel(line.quantityByUnit),
      latestMissingTimestamp,
      dispatchedLineCount: dispatchLinesSorted.length,
      dispatchedKg,
      dispatchedQuantityByUnit,
      remainingQuantityByUnit,
      remainingLabel: formatWarehouseShortageQuantityLabel(remainingQuantityByUnit),
      remainingKg,
      status: isMissing ? 'missing' : 'done'
    };
  });

  if (notificationOnly) return {
    issueLines: lines.filter(line => line.status !== 'done'),
    latestTimestamp: Math.max(...lines.map(line => line.latestTimestamp || 0), 0)
  };
  if (statusesOnly) return { requestLineStatuses: lines.flatMap(line => line.requestLineStatuses) };
  const issueLines = lines
    .filter(line => line.status !== 'done')
    .sort((a, b) => {
      const statusScore = (status) => (status === 'missing' ? 0 : 1);
      return statusScore(a.status) - statusScore(b.status)
        || (b.latestMissingTimestamp || 0) - (a.latestMissingTimestamp || 0)
        || a.customerName.localeCompare(b.customerName, 'vi')
        || (a.productShortName || a.productName).localeCompare(b.productShortName || b.productName, 'vi');
    });

  return {
    dateKey: normalizedDateKey,
    dispatchDateKey: normalizedDispatchDateKey,
    fromDateKey: normalizedFromDateKey,
    includePreviousOpenOrders: shouldUseBacklog,
    totalRequiredLines: lines.length,
    coveredLines: lines.filter(line => line.status === 'done').length,
    missingLines: issueLines.filter(line => line.status === 'missing'),
    partialLines: issueLines.filter(line => line.status === 'partial'),
    issueLines,
    requestLineStatuses: lines.flatMap(line => line.requestLineStatuses || []),
    latestTimestamp: Math.max(...lines.map(line => line.latestTimestamp || 0), 0)
  };
}