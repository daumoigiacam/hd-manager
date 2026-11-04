// Frozen actual directory callback before collation/date-key optimization.
export default () => {
    const rawKeyword = `${debouncedCustomerSearch || ''}`.trim();
    const hasKeyword = hasTokenSearchQuery(rawKeyword);
    const getCustomerDateActivityTime = (cus) => {
      const targetDate = customerDateFilter || getTodayString();
      const activityItems = [
        ...(Array.isArray(cus.orders) ? cus.orders : []),
        ...(Array.isArray(cus.payments) ? cus.payments : []),
        cus
      ];
      return activityItems.reduce((latest, item) => {
        const dateKey = getDateKeyFromAnyValue(item?.date || item?.createdAt || item?.createdDate || item?.updatedAt || getEntityTimestamp(item));
        if (dateKey !== targetDate) return latest;
        const timeValue = getEntityTimestamp(item) || new Date(item?.createdAt || item?.updatedAt || item?.date || `${targetDate}T12:00:00`).getTime() || 0;
        return Math.max(latest, timeValue);
      }, 0);
    };
    const customerSearchRankById = new Map(
      hasKeyword
        ? rankCustomerSearchResults(customerSummaries.map((cus) => {
          const manager = employees.find(emp => emp.id === cus.empId) || {};
          const fixedProductNames = (Array.isArray(cus.customerProductIds) ? cus.customerProductIds : [])
            .map(productId => activeProductForPricingLookup.get(productId)?.name)
            .filter(Boolean);
          return {
            ...cus,
            searchAliases: buildCustomerNameAliases(cus),
            // Supplemental fields stay ephemeral so private source data is never changed.
            searchText: [
              manager.name,
              manager.phone,
              ...(Array.isArray(cus.allowedDriverNames) ? cus.allowedDriverNames : []),
              ...fixedProductNames,
              canSeeCustomerLocation ? getCustomerLocationShareText(cus) : '',
            ].filter(Boolean).join(' '),
          };
        }), rawKeyword).map(result => [result.record.id, result.score])
        : []
    );
    const matchesCustomerKeyword = (cus) => !hasKeyword || customerSearchRankById.has(cus.id);
    const filteredList = customerSummaries.filter(cus => {
      if (!matchesCustomerKeyword(cus)) return false;
      if (!hasKeyword) {
        if (canSeeCustomerDebt) {
          if (customerStatusFilter === 'debt' && !(cus.currentDebt > 0)) return false;
          if (customerStatusFilter === 'credit' && !(cus.creditBalance > 0)) return false;
          if (customerStatusFilter === 'balanced' && (cus.currentDebt > 0 || cus.creditBalance > 0)) return false;
        }
        if (customerSortFilter === 'date' && customerDateFilter && getCustomerDateActivityTime(cus) <= 0) return false;
        if (customerManagerFilter !== 'all' && cus.empId !== customerManagerFilter) return false;
      }
      return true;
    });
    return filteredList.sort((a, b) => {
      if (hasKeyword) {
        const scoreDiff = (customerSearchRankById.get(b.id) || 0) - (customerSearchRankById.get(a.id) || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }
      if ((customerSortFilter === 'revenue' || customerSortFilter === 'revenue_desc') && canSeeCustomerStats) {
        if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      }
      if (customerSortFilter === 'revenue_asc' && canSeeCustomerStats) {
        if (a.totalRevenue !== b.totalRevenue) return a.totalRevenue - b.totalRevenue;
      }
      if (customerSortFilter === 'date') {
        const timeDiff = getCustomerDateActivityTime(b) - getCustomerDateActivityTime(a);
        if (timeDiff !== 0) return timeDiff;
      }
      return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '', 'vi');
    });
  };
