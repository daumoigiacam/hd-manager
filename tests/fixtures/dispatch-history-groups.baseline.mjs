// Frozen6aadaa23 complete dispatch history calculation.
export default function frozenHistory(ports){const {warehouseDispatches,customerLookup,productLookup,resolveEntityDateKey,getTodayString,getProductShortName,getDispatchRowQuantityUnit,getDispatchDriverId,getDispatchDriverName,normalizeLookupText,getDispatchRowQuantity,parseLooseQuantityValue}=ports;const useMemo=f=>f();
const historyDispatchGroups = useMemo(() => {
    const groups = (warehouseDispatches || []).reduce((acc, item) => {
      if (item.isArchived) return acc;
      const dateKey = resolveEntityDateKey(item, item.date || item.createdAt || getTodayString());
      if (!dateKey) return acc;
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(item);
      return acc;
    }, {});

    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, items]) => {
        const mergedRows = items.reduce((acc, item) => {
          const customer = customerLookup.get(item.customerId);
          const product = productLookup.get(item.productId);
          const customerName = item.customerNameSnapshot || customer?.name || 'Khách hàng';
          const productName = item.productNameSnapshot || product?.name || 'Hàng hóa';
          const productShortName = getProductShortName(product) || `${item.productShortName || item.productShortNameSnapshot || item.shortName || ''}`.trim().toUpperCase();
          const quantityUnit = getDispatchRowQuantityUnit(item);
          const driverId = getDispatchDriverId(item);
          const driverName = getDispatchDriverName(item);
          const driverKey = driverId || normalizeLookupText(driverName || '');
          const mergeKey = `${item.customerId || customerName}__${item.productId || productName}__${normalizeLookupText(quantityUnit)}__${driverKey}`;
          const weightKg = parseFloat(item.weightKg) || 0;
          const pieceCount = getDispatchRowQuantity(item);
          const current = acc.get(mergeKey);
          if (current) {
            current.weightKg += weightKg;
            current.pieceCount += pieceCount;
            return acc;
          }
          acc.set(mergeKey, {
            customerName,
            productName,
            productShortName,
            weightKg,
            pieceCount,
            quantityUnit,
            assignedDriverId: driverId,
            assignedDriverNameSnapshot: driverName,
            driverId,
            driverNameSnapshot: driverName
          });
          return acc;
        }, new Map());

        const mergedValues = Array.from(mergedRows.values());
        return {
          dateKey,
          items,
          mergedRows: mergedValues,
          totalLines: mergedValues.length,
          totalCustomers: new Set(items.map(item => item.customerId || item.customerNameSnapshot).filter(Boolean)).size,
          totalWeight: mergedValues.reduce((sum, item) => sum + (parseFloat(item.weightKg) || 0), 0),
          totalQuantity: mergedValues.reduce((sum, item) => sum + (parseLooseQuantityValue(item.pieceCount) || 0), 0)
        };
      });
  }, [warehouseDispatches, customerLookup, productLookup]);
return historyDispatchGroups;}
