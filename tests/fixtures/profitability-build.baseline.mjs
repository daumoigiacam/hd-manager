// Frozen from the measured bcf08c67 source; differential oracle in the original lexical scope.
export default function(source, finance) {
    const todayKey = finance.todayKey || dateKey(source.now);
    const productsById = new Map(source.products.map(product => [product.id, product]));
    const dispatchSummaryMap = new Map();
    const dispatchUsageKeysByDate = new Set();
    const events = [];

    source.warehouseDispatches.forEach(dispatch => {
      const eventDateKey = dateKey(getDateValue(dispatch));
      if (!eventDateKey || eventDateKey > todayKey) return;
      const quantity = dispatchQuantityOf(dispatch);
      const kg = dispatchKgOf(dispatch);
      if (quantity <= 0 && kg <= 0) return;
      const key = inventoryCostKeyOf(dispatch, productsById);
      dispatchUsageKeysByDate.add(`${eventDateKey}__${key}`);
      events.push({
        type: 'dispatch',
        dateKey: eventDateKey,
        key,
        name: productNameOf(dispatch, productsById),
        groupName: productGroupOf(dispatch, productsById),
        unit: quantity > 0 ? quantityUnitOf(dispatch, 'Con') : 'Kg',
        quantity: quantity > 0 ? quantity : kg,
        kg,
        fallbackCostPerUnit: itemCost(dispatch)
      });
      if (eventDateKey !== todayKey) return;
      const summary = dispatchSummaryMap.get(key) || {
        key,
        name: productNameOf(dispatch, productsById),
        groupName: productGroupOf(dispatch, productsById),
        unit: quantityUnitOf(dispatch, kg > 0 ? 'Kg' : 'Con'),
        dispatchQuantitiesByUnit: {}
      };
      if (quantity > 0) addQuantityByUnit(summary.dispatchQuantitiesByUnit, quantityUnitOf(dispatch, 'Con'), quantity);
      if (kg > 0) addQuantityByUnit(summary.dispatchQuantitiesByUnit, 'Kg', kg);
      dispatchSummaryMap.set(key, summary);
    });

    source.warehouseImports.forEach(item => {
      const eventDateKey = dateKey(getDateValue(item));
      if (!eventDateKey || eventDateKey > todayKey) return;
      const quantity = importQuantityOf(item);
      const kg = importKgOf(item);
      const value = importValueOf(item);
      const primaryQuantity = quantity > 0 ? quantity : kg;
      if (primaryQuantity <= 0 && value <= 0) return;
      const key = inventoryCostKeyOf(item, productsById);
      const name = item.productName || item.name || item.groupName || item.productGroup || productNameOf(item, productsById);
      events.push({
        type: 'import',
        dateKey: eventDateKey,
        key,
        name,
        groupName: productGroupOf(item, productsById),
        unit: quantity > 0 ? quantityUnitOf(item, 'con') : 'kg',
        quantity: primaryQuantity,
        kg,
        value
      });
    });

    source.orders.forEach(order => {
      const eventDateKey = dateKey(getDateValue(order));
      if (!eventDateKey || eventDateKey > todayKey) return;
      getItems(order).forEach(item => {
        const quantity = itemQuantity(item);
        const revenue = itemLineTotal(item);
        if (quantity <= 0 && revenue <= 0) return;
        const key = inventoryCostKeyOf(item, productsById);
        events.push({
          type: 'revenue',
          dateKey: eventDateKey,
          key,
          name: productNameOf(item, productsById),
          groupName: productGroupOf(item, productsById),
          unit: quantityUnitOf(item, productsById.get(item.productId)?.unit || 'đơn vị'),
          quantity,
          revenue,
          fallbackCostPerUnit: itemCost(item)
        });
        if (dispatchUsageKeysByDate.has(`${eventDateKey}__${key}`)) return;
        events.push({
          type: 'sale',
          dateKey: eventDateKey,
          key,
          name: productNameOf(item, productsById),
          groupName: productGroupOf(item, productsById),
          unit: quantityUnitOf(item, productsById.get(item.productId)?.unit || 'dv'),
          quantity,
          fallbackCostPerUnit: itemCost(item)
        });
      });
    });

    const stateMap = new Map();
    const ensureState = (event) => {
      if (!stateMap.has(event.key)) {
        stateMap.set(event.key, {
          key: event.key,
          name: event.name,
          groupName: event.groupName,
          unit: event.unit,
          carryQty: 0,
          carryValue: 0,
          todayInputQty: 0,
          todayInputKg: 0,
          todayInputValue: 0,
          todaySoldQty: 0,
          todayRevenue: 0,
          todayCost: 0,
          dispatchQuantitiesByUnit: {}
        });
      }
      const state = stateMap.get(event.key);
      state.name = state.name || event.name;
      state.groupName = state.groupName || event.groupName;
      state.unit = state.unit || event.unit;
      return state;
    };

    events.sort(sortProfitEvents).forEach(event => {
      const state = ensureState(event);
      if (event.type === 'import') {
        state.carryQty += event.quantity;
        state.carryValue += event.value;
        if (event.dateKey === todayKey) {
          state.todayInputQty += event.quantity;
          state.todayInputKg += event.kg || 0;
          state.todayInputValue += event.value;
        }
        return;
      }

      if (event.type === 'revenue') {
        if (event.dateKey === todayKey) {
          state.todayRevenue += event.revenue || 0;
        }
        return;
      }

      const quantity = event.quantity || 0;
      const averageCost = state.carryQty > 0
        ? state.carryValue / state.carryQty
        : toNumber(event.fallbackCostPerUnit);
      const saleCost = quantity * averageCost;
      state.carryQty = Math.max(0, state.carryQty - quantity);
      state.carryValue = Math.max(0, state.carryValue - saleCost);
      if (event.dateKey === todayKey) {
        state.todaySoldQty += quantity;
        state.todayCost += saleCost;
      }
    });

    dispatchSummaryMap.forEach(summary => {
      const state = ensureState(summary);
      mergeQuantityByUnit(state.dispatchQuantitiesByUnit, summary.dispatchQuantitiesByUnit);
    });

    const productRows = [...stateMap.values()]
      .map(buildProfitRow)
      .filter(row => (
        row.inputQuantity > 0 ||
        row.soldQuantity > 0 ||
        row.carryoverQuantity > 0 ||
        row.revenue > 0 ||
        Object.keys(row.dispatchQuantitiesByUnit || {}).length > 0
      ))
      .sort((a, b) => b.profit - a.profit);
    const groupRows = aggregateProfitRowsByGroup(productRows);
    const totals = productRows.reduce((sum, row) => ({
      revenue: sum.revenue + row.revenue,
      inputCost: sum.inputCost + row.inputCost,
      profit: sum.profit + row.profit,
      soldQuantity: sum.soldQuantity + row.soldQuantity,
      carryoverQuantity: sum.carryoverQuantity + row.carryoverQuantity,
      carryoverValue: sum.carryoverValue + row.carryoverValue
    }), { revenue: 0, inputCost: 0, profit: 0, soldQuantity: 0, carryoverQuantity: 0, carryoverValue: 0 });

    return {
      todayKey,
      totals,
      productRows,
      groupRows,
      topProduct: productRows.find(row => row.profit > 0) || productRows[0] || null,
      topGroup: groupRows.find(row => row.profit > 0) || groupRows[0] || null
    };
  };
