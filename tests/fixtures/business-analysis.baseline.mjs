// Frozen from the measured 85616cf1 source; evaluated only in differential tests.
export default function(source, finance, profitability = {}) {
    const customersById = new Map();
    source.customers.forEach(customer => {
      if (customer.id) customersById.set(customer.id, customer);
      if (customer.id) customersById.set(String(customer.id), customer);
      if (customer.customerId) customersById.set(String(customer.customerId), customer);
    });
    const customersByName = new Map();
    source.customers.forEach(customer => {
      const nameKey = normalizeText(customer.name || customer.displayName || customer.customerName);
      if (nameKey && !customersByName.has(nameKey)) customersByName.set(nameKey, customer);
    });
    const productsById = new Map(source.products.map(product => [product.id, product]));
    const employeesById = new Map();
    source.employees.forEach(employee => {
      if (employee.id) employeesById.set(employee.id, employee);
      if (employee.id) employeesById.set(String(employee.id), employee);
      if (employee.employeeId) employeesById.set(String(employee.employeeId), employee);
    });
    const customerRevenue = new Map();
    const customerProfit = new Map();
    const customerDebt = new Map();
    const customerDebtFromProfile = new Map();
    const productRevenue = new Map();
    const productRevenueMonth = new Map();
    const productProfit = new Map();
    const productProfitMonth = new Map();
    const productProfitByDay = new Map();
    const employeeRevenue = new Map();
    const employeeProfit = new Map();
    const salesEmployees = source.employees.filter(isSalesEmployeeRecord);
    const salesEmployeeIds = new Set(salesEmployees.map(employee => String(employee.id || employee.employeeId || '')));
    const salesEmployeeOrders = [];
    const productPerformanceRows = [];
    const customerPerformanceRows = [];
    salesEmployees.forEach(employee => {
      const employeeId = String(employee.id || employee.employeeId || employeeDisplayNameOf(employee));
      const employeeName = employeeDisplayNameOf(employee);
      employeeRevenue.set(employeeId, { id: employeeId, name: employeeName, revenue: 0, orders: 0 });
      employeeProfit.set(employeeId, { id: employeeId, name: employeeName, profit: 0, orders: 0 });
    });
    const customerOfOrder = (order = {}) => {
      const customerId = order.customerId || order.customer?.id || order.customer?.customerId || '';
      const customerNameKey = normalizeText(order.customerName || order.customer?.name || order.name);
      return (
        (customerId ? customersById.get(customerId) || customersById.get(String(customerId)) : null) ||
        (customerNameKey ? customersByName.get(customerNameKey) : null) ||
        null
      );
    };
    const salesOwnerOfOrder = (order = {}) => {
      const customer = customerOfOrder(order);
      const customerSalesEmpId = customerSalesEmployeeIdOf(customer || {});
      const customerSalesEmployee = customerSalesEmpId ? employeesById.get(customerSalesEmpId) : null;
      if (customerSalesEmployee) {
        const employeeId = String(customerSalesEmployee.id || customerSalesEmpId);
        return { id: employeeId, name: employeeDisplayNameOf(customerSalesEmployee) };
      }
      const orderSalesEmpId = String(
        order.salesEmpId ||
        order.assignedSalesEmpId ||
        order.responsibleEmployeeId ||
        order.employeeId ||
        order.empId ||
        ''
      );
      const orderSalesEmployee = orderSalesEmpId ? employeesById.get(orderSalesEmpId) : null;
      if (orderSalesEmployee) {
        const employeeId = String(orderSalesEmployee.id || orderSalesEmpId);
        return { id: employeeId, name: employeeDisplayNameOf(orderSalesEmployee) };
      }
      const fallbackName = customer?.managerName || customer?.salesName || employeeNameOf(order, employeesById);
      return { id: normalizeText(fallbackName), name: fallbackName };
    };
    const profitabilityProductRows = toArray(profitability.productRows);
    const profitabilityCostByKey = new Map();
    const rememberProfitabilityCost = (key, row) => {
      const normalizedKey = normalizeText(key);
      if (!normalizedKey || profitabilityCostByKey.has(normalizedKey)) return;
      profitabilityCostByKey.set(normalizedKey, row);
    };

    profitabilityProductRows.forEach(row => {
      rememberProfitabilityCost(row.id, row);
      rememberProfitabilityCost(row.name, row);
      rememberProfitabilityCost(row.groupName, row);
    });

    const costRowForItem = (item = {}) => {
      const product = item.productId ? productsById.get(item.productId) : null;
      return (
        profitabilityCostByKey.get(inventoryCostKeyOf(item, productsById)) ||
        profitabilityCostByKey.get(normalizeText(item.productName || item.name || product?.name || product?.shortName)) ||
        profitabilityCostByKey.get(normalizeText(item.groupName || item.productGroup || product?.groupName || product?.productGroup))
      );
    };

    const itemProfitFromProfitability = (item = {}) => {
      const revenue = itemLineTotal(item);
      const quantity = itemQuantity(item);
      const costRow = costRowForItem(item);
      const averageCost = toNumber(costRow?.averageInputCost, NaN);
      if (quantity > 0 && Number.isFinite(averageCost) && averageCost > 0) {
        return { profit: revenue - quantity * averageCost, hasCost: true };
      }
      const fallbackCost = itemCost(item);
      if (quantity > 0 && fallbackCost > 0) {
        return { profit: revenue - quantity * fallbackCost, hasCost: true };
      }
      return { profit: revenue, hasCost: false };
    };

    const orderProfitFromProfitability = (order = {}) => {
      let hasCost = false;
      const profit = getItems(order).reduce((sum, item) => {
        const itemProfit = itemProfitFromProfitability(item);
        hasCost = hasCost || itemProfit.hasCost;
        return sum + itemProfit.profit;
      }, 0);
      return hasCost ? profit : orderProfit(order);
    };

    source.customers.forEach(customer => {
      const name = customer.name || customer.displayName || 'Khách chưa rõ';
      const debt = Math.max(0, toNumber(customer.currentDebt ?? customer.debt ?? customer.balanceDue));
      const key = normalizeText(name);
      if (key && debt > 0) {
        customerDebtFromProfile.set(key, {
          id: customer.id || customer.customerId || key,
          name,
          debt,
          value: debt
        });
      }
    });

    source.orders.forEach(order => {
      const customerName = customerNameOf(order, customersById);
      const salesOwner = salesOwnerOfOrder(order);
      const employeeKey = salesOwner.id || normalizeText(salesOwner.name);
      const revenue = orderTotal(order);
      const profit = orderProfitFromProfitability(order);
      const debt = outstandingOfOrder(order);
      const currentCustomerRevenue = customerRevenue.get(customerName) || { revenue: 0, orders: 0 };
      customerRevenue.set(customerName, { revenue: currentCustomerRevenue.revenue + revenue, orders: currentCustomerRevenue.orders + 1 });
      customerProfit.set(customerName, { profit: (customerProfit.get(customerName)?.profit || 0) + profit });
      if (debt > 0) {
        const debtKey = normalizeText(customerName);
        const currentDebt = customerDebt.get(debtKey);
        const nextDebt = (currentDebt?.debt || 0) + debt;
        customerDebt.set(debtKey, {
          id: order.customerId || currentDebt?.id || debtKey,
          name: currentDebt?.name || customerName,
          debt: nextDebt,
          value: nextDebt
        });
      }
      const currentEmployeeRevenue = employeeRevenue.get(employeeKey) || { id: employeeKey, name: salesOwner.name, revenue: 0, orders: 0 };
      employeeRevenue.set(employeeKey, {
        ...currentEmployeeRevenue,
        revenue: currentEmployeeRevenue.revenue + revenue,
        orders: currentEmployeeRevenue.orders + 1
      });
      const currentEmployeeProfit = employeeProfit.get(employeeKey) || { id: employeeKey, name: salesOwner.name, profit: 0, orders: 0 };
      employeeProfit.set(employeeKey, {
        ...currentEmployeeProfit,
        profit: currentEmployeeProfit.profit + profit,
        orders: currentEmployeeProfit.orders + 1
      });
      const orderDay = dateKey(getDateValue(order));
      if (salesEmployeeIds.has(employeeKey) && orderDay && orderDay <= finance.todayKey) {
        salesEmployeeOrders.push({ date: orderDay, id: employeeKey, name: salesOwner.name, revenue, orders: 1,
          orderId: order.id || '', orderCode: order.code || order.orderCode || order.id || '',
          customerName, salesEmployeeName: salesOwner.name });
      }

      if (orderDay && orderDay <= finance.todayKey) {
        customerPerformanceRows.push({
          orderId: order.id || '',
          orderCode: order.code || order.orderCode || order.id || '',
          customerName,
          salesEmployeeName: salesOwner.name,
          date: orderDay,
          id: String(order.customerId || order.customer?.id || normalizeText(customerName)),
          name: customerName,
          revenue,
          profit,
          orders: 1
        });
        const reportItems = getItems(order);
        const rawItemRevenue = reportItems.reduce((sum, item) => sum + Math.max(0, itemLineTotal(item)), 0);
        const orderRevenueScale = rawItemRevenue > 0 ? revenue / rawItemRevenue : 0;
        const itemProfitRows = reportItems.map(item => ({
          item,
          revenue: rawItemRevenue > 0
            ? Math.max(0, itemLineTotal(item)) * orderRevenueScale
            : revenue / Math.max(1, reportItems.length),
          profit: itemProfitFromProfitability(item).profit,
          weight: rawItemRevenue > 0 ? Math.max(0, itemLineTotal(item)) / rawItemRevenue : 1 / Math.max(1, reportItems.length)
        }));
        const itemProfitTotal = itemProfitRows.reduce((sum, row) => sum + row.profit, 0);
        itemProfitRows.forEach(({ item, revenue: itemRevenue, profit: baseProfit, weight }) => {
          const productName = productNameOf(item, productsById);
          productPerformanceRows.push({
            date: orderDay,
            id: String(item.productId || normalizeText(productName)),
            name: productName,
            revenue: itemRevenue,
            profit: baseProfit + (profit - itemProfitTotal) * weight,
            quantity: itemQuantity(item)
          });
        });
        if (!reportItems.length && revenue > 0) productPerformanceRows.push({
          date: orderDay,
          id: 'unassigned-product',
          name: 'Chưa có chi tiết mặt hàng',
          revenue,
          profit,
          quantity: 0
        });
      }

      getItems(order).forEach(item => {
        const productName = productNameOf(item, productsById);
        const itemRevenue = itemLineTotal(item);
        const itemQty = itemQuantity(item);
        const itemProfit = itemProfitFromProfitability(item).profit;
        const productRevenueRow = productRevenue.get(productName) || { revenue: 0, quantity: 0 };
        productRevenue.set(productName, { revenue: productRevenueRow.revenue + itemRevenue, quantity: productRevenueRow.quantity + itemQty });
        if (monthKey(getDateValue(order)) === finance.currentMonthKey) {
          const monthRevenueRow = productRevenueMonth.get(productName) || {
            id: item.productId || normalizeText(productName),
            name: productName,
            revenue: 0,
            quantity: 0
          };
          productRevenueMonth.set(productName, {
            ...monthRevenueRow,
            revenue: monthRevenueRow.revenue + itemRevenue,
            quantity: monthRevenueRow.quantity + itemQty
          });
        }
        const productProfitRow = productProfit.get(productName) || { profit: 0, revenue: 0, quantity: 0 };
        productProfit.set(productName, { profit: productProfitRow.profit + itemProfit, revenue: productProfitRow.revenue + itemRevenue, quantity: productProfitRow.quantity + itemQty });
        if (monthKey(getDateValue(order)) === finance.currentMonthKey) {
          const monthProfitRow = productProfitMonth.get(productName) || {
            id: item.productId || normalizeText(productName),
            name: productName,
            profit: 0,
            revenue: 0,
            quantity: 0
          };
          productProfitMonth.set(productName, {
            ...monthProfitRow,
            profit: monthProfitRow.profit + itemProfit,
            revenue: monthProfitRow.revenue + itemRevenue,
            quantity: monthProfitRow.quantity + itemQty
          });
        }
        // The daily ranking must use product-level revenue and cost, not the
        // aggregate profitability row (which is grouped by inventory cost).
        if (monthKey(getDateValue(order)) === finance.currentMonthKey) {
          if (!productProfitByDay.has(productName)) productProfitByDay.set(productName, new Map());
          const dayMap = productProfitByDay.get(productName);
          const currentDay = dayMap.get(orderDay) || { revenue: 0, profit: 0 };
          dayMap.set(orderDay, {
            revenue: currentDay.revenue + itemRevenue,
            profit: currentDay.profit + itemProfit
          });
        }
      });
    });

    // The profile debt is a fallback for legacy/old-debt records. When an
    // order has an outstanding balance, use that order total instead of
    // adding it to the profile total a second time.
    customerDebtFromProfile.forEach((profileDebt, key) => {
      if (!customerDebt.has(key)) customerDebt.set(key, profileDebt);
    });

    const topProductsByAverageDailyProfit = [...productProfitByDay.entries()]
      .map(([name, dayMap]) => {
        const dailyRows = [...dayMap.values()];
        const totalRevenue = dailyRows.reduce((sum, value) => sum + toNumber(value?.revenue), 0);
        const totalProfit = dailyRows.reduce((sum, value) => sum + toNumber(value?.profit), 0);
        const totalCost = totalRevenue - totalProfit;
        const activeDays = Math.max(1, dayMap.size);
        return {
          id: normalizeText(name),
          name,
          revenue: totalRevenue,
          cost: totalCost,
          profit: totalProfit,
          activeDays,
          averageDailyRevenue: totalRevenue / activeDays,
          averageDailyCost: totalCost / activeDays,
          averageDailyProfit: totalProfit / activeDays,
          value: totalProfit / activeDays
        };
      })
      .filter(row => row.averageDailyProfit > 0)
      .sort((a, b) => b.averageDailyProfit - a.averageDailyProfit)
      .slice(0, 10);

    const topProductsByRevenueFromMonth = topRows(productRevenueMonth, 'revenue', productRevenueMonth.size || 10);
    const topProductsByProfitFromMonth = topRows(productProfitMonth, 'profit', productProfitMonth.size || 10);
    const daysPassed = Math.max(1, source.now.getDate());
    return {
      topCustomersByRevenue: topRows(customerRevenue, 'revenue'),
      topCustomersByProfit: topRows(customerProfit, 'profit'),
      topProductsByRevenue: topProductsByRevenueFromMonth,
      topProductsByProfit: topProductsByProfitFromMonth,
      topProductsByAverageDailyProfit,
      topEmployeesByRevenue: topRows(employeeRevenue, 'revenue', employeeRevenue.size || 10),
      topEmployeesByProfit: topRows(employeeProfit, 'profit', employeeProfit.size || 10),
      topCustomersByDebt: source.hasDebtLedger
        ? source.debtLedger.filter(row => toNumber(row.debt) > 0)
          .map(row => ({ ...row, value: toNumber(row.debt), debt: toNumber(row.debt) }))
          .sort((a, b) => b.debt - a.debt).slice(0, 30)
        : topRows(customerDebt, 'debt', 30),
      debtCustomerCount: source.hasDebtLedger
        ? source.debtLedger.filter(row => toNumber(row.debt) > 0).length
        : [...customerDebt.values()].filter(row => toNumber(row.debt) > 0).length,
      productPerformanceRows,
      customerPerformanceRows,
      salesEmployeeOrders,
      revenuePerDay: finance.revenueMonth / daysPassed,
      profitPerDay: finance.profitMonth / daysPassed,
      profitMarginPct: finance.revenueMonth > 0 ? (finance.profitMonth / finance.revenueMonth) * 100 : 0
    };
  };
