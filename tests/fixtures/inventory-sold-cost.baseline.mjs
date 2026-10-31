// Frozen from the measured 85616cf1 source; evaluated only in differential tests.
export default (source = {}, endDateKey = '') => {
  const productsById = new Map(source.products.map(product => [product.id, product]));
  const dispatchUsageKeysByDate = new Set();
  const events = [];

  source.warehouseDispatches.forEach(dispatch => {
    const eventDateKey = dateKey(getDateValue(dispatch));
    if (!eventDateKey || (endDateKey && eventDateKey > endDateKey)) return;
    const quantity = dispatchQuantityOf(dispatch);
    const kg = dispatchKgOf(dispatch);
    const primaryQuantity = quantity > 0 ? quantity : kg;
    if (primaryQuantity <= 0) return;
    const key = inventoryCostKeyOf(dispatch, productsById);
    dispatchUsageKeysByDate.add(`${eventDateKey}__${key}`);
    events.push({
      type: 'sale',
      dateKey: eventDateKey,
      key,
      quantity: primaryQuantity,
      fallbackCostPerUnit: itemCost(dispatch)
    });
  });

  source.warehouseImports.forEach(item => {
    const eventDateKey = dateKey(getDateValue(item));
    if (!eventDateKey || (endDateKey && eventDateKey > endDateKey)) return;
    const quantity = importQuantityOf(item);
    const kg = importKgOf(item);
    const value = importValueOf(item);
    const primaryQuantity = quantity > 0 ? quantity : kg;
    if (primaryQuantity <= 0 && value <= 0) return;
    events.push({
      type: 'import',
      dateKey: eventDateKey,
      key: inventoryCostKeyOf(item, productsById),
      quantity: primaryQuantity,
      value
    });
  });

  source.orders.forEach(order => {
    const eventDateKey = dateKey(getDateValue(order));
    if (!eventDateKey || (endDateKey && eventDateKey > endDateKey)) return;
    getItems(order).forEach(item => {
      const quantity = itemQuantity(item);
      const revenue = itemLineTotal(item);
      if (quantity <= 0 && revenue <= 0) return;
      const key = inventoryCostKeyOf(item, productsById);
      if (dispatchUsageKeysByDate.has(`${eventDateKey}__${key}`)) return;
      events.push({
        type: 'sale',
        dateKey: eventDateKey,
        key,
        quantity,
        fallbackCostPerUnit: itemCost(item)
      });
    });
  });

  const stateMap = new Map();
  const costByDate = new Map();
  events.sort(sortProfitEvents).forEach(event => {
    const state = stateMap.get(event.key) || { carryQty: 0, carryValue: 0 };
    if (event.type === 'import') {
      state.carryQty += event.quantity || 0;
      state.carryValue += event.value || 0;
      stateMap.set(event.key, state);
      return;
    }

    const quantity = event.quantity || 0;
    const averageCost = state.carryQty > 0
      ? state.carryValue / state.carryQty
      : toNumber(event.fallbackCostPerUnit);
    const saleCost = quantity * averageCost;
    state.carryQty = Math.max(0, state.carryQty - quantity);
    state.carryValue = Math.max(0, state.carryValue - saleCost);
    stateMap.set(event.key, state);
    costByDate.set(event.dateKey, (costByDate.get(event.dateKey) || 0) + saleCost);
  });

  return costByDate;
};
