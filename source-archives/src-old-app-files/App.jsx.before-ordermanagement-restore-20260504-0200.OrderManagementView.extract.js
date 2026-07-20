function OrderManagementView({ isAccounting, employee, currentCompany, employees, customers, orders, orderRequests, warehouseDispatches, payments, products, onAddOrder, onEditOrder, onToggleArchiveOrder, onDeleteOrder, onAddPayment, onAddCustomer, onAddExpense, searchKeyword: externalSearchKeyword, setSearchKeyword: setExternalSearchKeyword, showSearchBox: externalShowSearchBox, setShowSearchBox: setExternalShowSearchBox, showFilterPanel: externalShowFilterPanel, setShowFilterPanel: setExternalShowFilterPanel }) {
  const [showAddOrder, setShowAddOrder] = useState(false); 
  const [showQuickAddCus, setShowQuickAddCus] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [showOrderSharePreview, setShowOrderSharePreview] = useState(false);
  const [showOrderShareLogo, setShowOrderShareLogo] = useState(true);
  const [orderShareFileType, setOrderShareFileType] = useState('image');
  const [orderShareStatus, setOrderShareStatus] = useState('');
  const [isOrderShareExporting, setIsOrderShareExporting] = useState(false);
  const [resolvedOrderShareQrUrl, setResolvedOrderShareQrUrl] = useState('');
  const [resolvedOrderShareLogoUrl, setResolvedOrderShareLogoUrl] = useState('');
  const [tab, setTab] = useState('all');
  const [orderTimeFilter, setOrderTimeFilter] = useState('all');
  const [orderSpecificDate, setOrderSpecificDate] = useState(getTodayString());
  const [localOrderSearchKeyword, setLocalOrderSearchKeyword] = useState('');
  const [localShowSearchBox, setLocalShowSearchBox] = useState(false);
  const [localShowFilterPanel, setLocalShowFilterPanel] = useState(false);
  const [searchCus, setSearchCus] = useState('');
  const [showCusDropdown, setShowCusDropdown] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const isEditingOrder = Boolean(editingOrderId);
  const isSales = isSalesPosition(employee?.position);
  const salesEmployees = employees ? employees.filter(e => isSalesPosition(e.position)) : [];
  const bulkOrderImageInputRef = useRef(null);
  const orderShareCardRef = useRef(null);
  const createEmptyOrderItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: '', dispatchWeight: '', shrinkageKg: '', sourceDispatchIds: [] });
  const getDefaultSalesEmpId = () => (isSales ? employee?.id || '' : salesEmployees[0]?.id || '');
  const createSingleOrderState = (seed = {}) => ({
    customerId: seed.customerId || '',
    items: Array.isArray(seed.items) && seed.items.length > 0 ? seed.items : [createEmptyOrderItem()],
    discount: seed.discount ?? '',
    extraExpenseName: seed.extraExpenseName || '',
    extraExpenseAmount: seed.extraExpenseAmount ?? '',
    extraExpensePayer: seed.extraExpensePayer || 'buyer',
    date: seed.date || getTodayString(),
    upfrontPayment: seed.upfrontPayment ?? '',
    paymentMethod: seed.paymentMethod || 'Chuy⬚¡�⬚»�⬠�����n kho⬚¡�⬚º�⬚£n',
    note: seed.note || '',
    editableCollectedPaymentId: seed.editableCollectedPaymentId || '',
    editableCollectedPaymentSourceType: seed.editableCollectedPaymentSourceType || '',
    lockedCollectedAmount: seed.lockedCollectedAmount || 0
  });
  const createBulkOrderDraft = (seed = {}) => ({
    localId: seed.localId || `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    customerId: seed.customerId || '',
    customerName: seed.customerName || '',
    salesEmpId: seed.salesEmpId || getDefaultSalesEmpId(),
    items: Array.isArray(seed.items) && seed.items.length > 0 ? seed.items : [createEmptyOrderItem()],
    date: seed.date || getTodayString(),
    note: seed.note || '',
    discount: seed.discount || '',
    upfrontPayment: seed.upfrontPayment || '',
    paymentMethod: seed.paymentMethod || 'Chuyển khoản'
  });
  const orderSearchKeyword = externalSearchKeyword ?? localOrderSearchKeyword;
  const setOrderSearchKeyword = setExternalSearchKeyword ?? setLocalOrderSearchKeyword;
  const showSearchBox = externalShowSearchBox ?? localShowSearchBox;
  const setShowSearchBox = setExternalShowSearchBox ?? setLocalShowSearchBox;
  const showFilterPanel = externalShowFilterPanel ?? localShowFilterPanel;
  const setShowFilterPanel = setExternalShowFilterPanel ?? setLocalShowFilterPanel;

  const [newOrder, setNewOrder] = useState(createSingleOrderState);
  const [bulkOrderDrafts, setBulkOrderDrafts] = useState([]);
  const [bulkOrderStatus, setBulkOrderStatus] = useState('');
  const [isBulkOrderScanning, setIsBulkOrderScanning] = useState(false);
  const [isBulkOrderSubmitting, setIsBulkOrderSubmitting] = useState(false);
  
  const [newCus, setNewCus] = useState({ name: '', phone: '', address: '', customerGroup: '', empId: isSales ? employee?.id || '' : '' });
  const accessibleCustomers = useMemo(
    () => (isSales ? customers.filter(customer => customer.empId === employee?.id) : customers),
    [customers, employee?.id, isSales]
  );
  const accessibleCustomerIds = useMemo(
    () => new Set(accessibleCustomers.map(customer => customer.id).filter(Boolean)),
    [accessibleCustomers]
  );
  const scopedOrders = useMemo(
    () => (isSales ? orders.filter(order => accessibleCustomerIds.has(order.customerId)) : orders),
    [orders, isSales, accessibleCustomerIds]
  );
  const scopedPayments = useMemo(
    () => (isSales ? payments.filter(payment => accessibleCustomerIds.has(payment.customerId)) : payments),
    [payments, isSales, accessibleCustomerIds]
  );
  const activeOrders = scopedOrders.filter(o => !o.isArchived);
  const usedWarehouseDispatchIds = useMemo(() => new Set(
    activeOrders.flatMap((order) => (
      Array.isArray(order.items)
        ? order.items.flatMap((item) => Array.isArray(item?.sourceDispatchIds) ? item.sourceDispatchIds : [])
        : []
    )).filter(Boolean)
  ), [activeOrders]);
  const customerLedgerMap = useMemo(() => Object.fromEntries(
    accessibleCustomers.map(customer => [customer.id, buildCustomerLedger(customer.id, scopedOrders, scopedPayments)])
  ), [accessibleCustomers, scopedOrders, scopedPayments]);
  const filteredCustomers = accessibleCustomers.filter(c => (c.name || '').toLowerCase().includes(searchCus.toLowerCase()) || (c.phone || '').includes(searchCus));
  const activeProducts = useMemo(() => products.filter(product => !product.isArchived), [products]);
  const todayDispatchDate = getTodayString();
  const todayWarehouseDispatchRows = useMemo(
    () => (warehouseDispatches || [])
      .filter((item) => !item.isArchived && `${item.date || ''}` === todayDispatchDate && (!isSales || accessibleCustomerIds.has(item.customerId)))
      .sort((a, b) => (getEntityTimestamp(a) || 0) - (getEntityTimestamp(b) || 0)),
    [warehouseDispatches, todayDispatchDate, isSales, accessibleCustomerIds]
  );
  const availableWarehouseDispatchRows = useMemo(
    () => todayWarehouseDispatchRows.filter((item) => item?.id && !usedWarehouseDispatchIds.has(item.id)),
    [todayWarehouseDispatchRows, usedWarehouseDispatchIds]
  );
  const buildBulkOrderDraftsFromDispatchRows = (dispatchRows = []) => {
    const groupedCustomers = new Map();

    dispatchRows.forEach((row) => {
      const customer = accessibleCustomers.find((item) => item.id === row.customerId) || null;
      const product = activeProducts.find((item) => item.id === row.productId) || null;
      const customerKey = row.customerId || `snapshot_customer_${normalizeLookupText(row.customerNameSnapshot || '')}`;
      const productKey = row.productId || `snapshot_product_${normalizeLookupText(row.productNameSnapshot || '')}`;
      const resolvedCustomerName = row.customerNameSnapshot || customer?.name || 'Kh�⬞����⬚¡ch h�⬞����⬚ ng';
      const resolvedProductName = row.productNameSnapshot || product?.name || 'H�⬞����⬚ ng h�⬞����⬚³a';
      const resolvedWeight = parseLooseQuantityValue(row.weightKg);

      if (!groupedCustomers.has(customerKey)) {
        groupedCustomers.set(customerKey, {
          localId: `dispatch_bulk_${customerKey}_${row.date || todayDispatchDate}`,
          customerId: customer?.id || row.customerId || '',
          customerName: resolvedCustomerName,
          salesEmpId: customer?.empId || getDefaultSalesEmpId(),
          date: row.date || todayDispatchDate,
          note: capitalizeFirst(row.note || ''),
          upfrontPayment: '',
          paymentMethod: 'Chuy⬚¡�⬚»�⬠�����n kho⬚¡�⬚º�⬚£n',
          itemsMap: new Map()
        });
      }

      const draft = groupedCustomers.get(customerKey);
      const currentItem = draft.itemsMap.get(productKey);
      if (!currentItem) {
        draft.itemsMap.set(productKey, {
          productId: product?.id || row.productId || '',
          description: resolvedProductName,
          dispatchWeight: resolvedWeight > 0 ? resolvedWeight : '',
          shrinkageKg: '',
          quantity: resolvedWeight > 0 ? resolvedWeight : '',
          unitPrice: product?.sellingPrice || '',
          sourceDispatchIds: row.id ? [row.id] : []
        });
      } else {
        const nextDispatchWeight = (parseLooseQuantityValue(currentItem.dispatchWeight) || 0) + resolvedWeight;
        currentItem.dispatchWeight = nextDispatchWeight > 0 ? nextDispatchWeight : '';
        currentItem.quantity = nextDispatchWeight > 0 ? nextDispatchWeight : currentItem.quantity;
        currentItem.sourceDispatchIds = Array.from(new Set([
          ...(Array.isArray(currentItem.sourceDispatchIds) ? currentItem.sourceDispatchIds : []),
          ...(row.id ? [row.id] : [])
        ]));
        if (!currentItem.productId && (product?.id || row.productId)) currentItem.productId = product?.id || row.productId || '';
        if (!currentItem.description && resolvedProductName) currentItem.description = resolvedProductName;
      }

      if (!draft.note && row.note) {
        draft.note = capitalizeFirst(row.note || '');
      }
    });

    return Array.from(groupedCustomers.values()).map((draft) => createBulkOrderDraft({
      localId: draft.localId,
      customerId: draft.customerId,
      customerName: draft.customerName,
      salesEmpId: draft.salesEmpId,
      date: draft.date,
      note: draft.note,
      upfrontPayment: draft.upfrontPayment,
      paymentMethod: draft.paymentMethod,
      items: Array.from(draft.itemsMap.values()).length > 0
        ? Array.from(draft.itemsMap.values())
        : [createEmptyOrderItem()]
    }));
  };
  const orderTimeRange = useMemo(() => {
    if (orderTimeFilter === 'day') return getDateRangeForPeriod(getTodayString(), 'day');
    if (orderTimeFilter === 'week') return getDateRangeForPeriod(getTodayString(), 'week');
    if (orderTimeFilter === 'month') return getDateRangeForPeriod(getTodayString(), 'month');
    if (orderTimeFilter === 'specific') return getDateRangeForPeriod(orderSpecificDate, 'day');
    return null;
  }, [orderSpecificDate, orderTimeFilter]);
  const orderTimeFilterLabel = useMemo(() => {
    if (orderTimeFilter === 'day') return `H�⬞����⬚´m nay: ${formatDateLabel(getTodayString())}`;
    if (orderTimeFilter === 'week' && orderTimeRange) return buildPeriodLabel('week', orderTimeRange);
    if (orderTimeFilter === 'month' && orderTimeRange) return buildPeriodLabel('month', orderTimeRange);
    if (orderTimeFilter === 'specific') return `Ng�⬞����⬚ y c⬚¡�⬚»�⬚¥ th⬚¡�⬚»�⬠�����: ${formatDateLabel(orderSpecificDate)}`;
    return 'web';
  }, [orderSpecificDate, orderTimeFilter, orderTimeRange]);
  const orderViewModels = useMemo(() => Object.fromEntries(
    activeOrders.map(order => {
      const customer = accessibleCustomers.find(c => c.id === order.customerId);
      const ledger = customerLedgerMap[order.customerId];
      const ledgerOrder = ledger?.orders.find(item => item.id === order.id);
      const createdBy = employees.find(e => e.id === (order.createdByEmpId || order.empId));
      const salesOwner = employees.find(e => e.id === getOrderSalesEmpId(order, accessibleCustomers));
      const paymentHistory = (ledger?.payments || [])
        .filter(payment => (payment.allocations || []).some(allocation => allocation.orderId === order.id))
        .map(payment => ({
          ...payment,
          allocatedToOrder: (payment.allocations || [])
            .filter(allocation => allocation.orderId === order.id)
            .reduce((sum, allocation) => sum + (allocation.amount || 0), 0)
        }));

      return [order.id, {
        ...order,
        customer,
        createdBy,
        salesOwner,
        paymentHistory,
        appliedAmount: ledgerOrder?.appliedAmount || 0,
        outstandingAmount: ledgerOrder?.outstandingAmount || Math.max(0, order.amount || 0),
        status: ledgerOrder?.status || 'unpaid'
      }];
    })
  ), [activeOrders, accessibleCustomers, customerLedgerMap, employees]);
  const findEditableCollectedPayment = (order) => {
    const paymentHistory = order?.paymentHistory || [];
    if (paymentHistory.length === 0) return null;
    const explicitLinkedPayment = paymentHistory.find((payment) => (
      payment?.sourceOrderId === order?.id ||
      payment?.matchedOrderId === order?.id ||
      payment?.sourceType === 'order_upfront'
    ));
    return explicitLinkedPayment || (paymentHistory.length === 1 ? paymentHistory[0] : null);
  };
  const displayOrders = useMemo(() => {
    const keyword = orderSearchKeyword.trim().toLowerCase();
    const source = activeOrders
      .map(order => orderViewModels[order.id] || order)
      .filter(order => tab === 'pending' ? (order.outstandingAmount || 0) > 0 : true)
      .filter(order => {
        if (!orderTimeRange) return true;
        const orderDate = `${order.date || ''}`.slice(0, 10);
        if (!orderDate) return false;
        return orderDate >= orderTimeRange.startDate && orderDate <= orderTimeRange.endDate;
      })
      .filter(order => {
        if (!keyword) return true;
        const orderCode = formatOrderCode(order.id);
        const itemSummary = (order.items || [])
          .map(item => item.description || products.find(product => product.id === item.productId)?.name || '')
          .join(' ');
        const haystack = [
          orderCode,
          order.customer?.name,
          order.customer?.phone,
          order.date,
          order.salesOwner?.name,
          itemSummary
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return source;
  }, [activeOrders, orderSearchKeyword, orderTimeRange, orderViewModels, products, tab]);
  const selectedOrder = useMemo(() => selectedOrderId ? orderViewModels[selectedOrderId] || null : null, [selectedOrderId, orderViewModels]);
  const orderSharePreviewMeta = useMemo(() => {
    if (!selectedOrder) return null;
    const customerLedger = customerLedgerMap[selectedOrder.customerId];
    const totalQuantity = (selectedOrder.items || []).reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const previousDebt = Math.max(0, (customerLedger?.currentDebt || 0) - (selectedOrder.outstandingAmount || 0));
    const totalReceivable = Math.max(0, previousDebt + (selectedOrder.outstandingAmount || 0));
    const transferProfile = getInvoiceTransferProfile(currentCompany);
    const transferMemo = buildOrderTransferMemo(selectedOrder);
    const companyName = currentCompany?.name || 'HD Manager';
    return {
      totalQuantity,
      previousDebt,
      totalReceivable,
      transferProfile,
      transferMemo,
      qrUrl: buildVietQrImageUrl({
        bankId: transferProfile.bankId,
        accountNumber: transferProfile.accountNumber,
        accountName: transferProfile.accountName,
        amount: totalReceivable || selectedOrder.outstandingAmount || selectedOrder.amount || 0,
        addInfo: transferMemo,
        template: transferProfile.template
      }),
      companyName,
      companyMark: buildCompanyMonogram(companyName),
      companyLogoUrl: currentCompany?.logoUrl || currentCompany?.logo || '',
      buyerAddress: selectedOrder.customer?.address || 'Ch⬚��� �⬚°a c�⬞����⬚³ ⬚����¢�⬚¬9�⬚¡�⬚»�¢�⬚¬¹a ch⬚¡�⬚»�¢�⬚¬°'
    };
  }, [selectedOrder, customerLedgerMap, currentCompany]);
  const isOrderShareReady = useMemo(() => {
    if (!showOrderSharePreview || !orderSharePreviewMeta) return true;
    if (!resolvedOrderShareQrUrl) return false;
    if (showOrderShareLogo && orderSharePreviewMeta.companyLogoUrl && !resolvedOrderShareLogoUrl) return false;
    return true;
  }, [showOrderSharePreview, orderSharePreviewMeta, resolvedOrderShareQrUrl, resolvedOrderShareLogoUrl, showOrderShareLogo]);

  useEffect(() => {
    if (selectedOrderId && !orderViewModels[selectedOrderId]) {
      closeOrderDetail();
    }
  }, [selectedOrderId, orderViewModels]);

  useEffect(() => {
    if (!showOrderSharePreview || !orderSharePreviewMeta) {
      setResolvedOrderShareQrUrl('');
      setResolvedOrderShareLogoUrl('');
      return undefined;
    }

    let cancelled = false;
    const loadAssets = async () => {
      try {
        const [qrDataUrl, logoDataUrl] = await Promise.all([
          fetchImageAsDataUrl(orderSharePreviewMeta.qrUrl),
          orderSharePreviewMeta.companyLogoUrl && showOrderShareLogo
            ? fetchImageAsDataUrl(orderSharePreviewMeta.companyLogoUrl).catch(() => '')
            : Promise.resolve('')
        ]);

        if (!cancelled) {
          setResolvedOrderShareQrUrl(qrDataUrl);
          setResolvedOrderShareLogoUrl(logoDataUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setResolvedOrderShareQrUrl('');
          setResolvedOrderShareLogoUrl('');
          setOrderShareStatus(error?.message || 'Kh�⬞����⬚´ng th⬚¡�⬚»�⬠����� t⬚¡�⬚º�⬚£i m⬚¡�⬚º�⬚«u QR ⬚����¢�⬚¬9�⬚¡�⬚»�⬠����� chia s⬚¡�⬚º�⬚» h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n.');
        }
      }
    };

    loadAssets();
    return () => {
      cancelled = true;
    };
  }, [showOrderSharePreview, orderSharePreviewMeta, showOrderShareLogo]);
  
  const subTotal = newOrder.items.reduce((sum, item) => sum + (parseFloat(item.quantity)||0) * (parseFloat(item.unitPrice)||0), 0);
  const discountAmount = parseFloat(newOrder.discount) || 0;
  const extraExpense = parseFloat(newOrder.extraExpenseAmount) || 0;
  
  let customerExtraExpense = 0;
  let sellerExtraExpense = 0;
  
  if (newOrder.extraExpensePayer === 'buyer') {
    customerExtraExpense = extraExpense;
  } else if (newOrder.extraExpensePayer === 'shared') {
    customerExtraExpense = extraExpense / 2;
    sellerExtraExpense = extraExpense / 2;
  } else if (newOrder.extraExpensePayer === 'seller') {
    sellerExtraExpense = extraExpense;
  }

  const totalAmount = Math.max(0, subTotal - discountAmount + customerExtraExpense);

  const openOrderDetail = (orderId) => {
    setSelectedOrderId(orderId);
    setShowOrderSharePreview(false);
    setOrderShareFileType('image');
    setOrderShareStatus('');
  };

  const closeOrderDetail = () => {
    setSelectedOrderId(null);
    setShowOrderSharePreview(false);
    setOrderShareFileType('image');
    setOrderShareStatus('');
    setResolvedOrderShareQrUrl('');
    setResolvedOrderShareLogoUrl('');
  };

  function buildOrderTransferMemo(order) {
    if (!order) return '';
    return `TT ${formatOrderCode(order.id)}`.slice(0, 25);
  }

  const buildOrderShareBaseFilename = (order) => {
    const safeCustomerName = (order?.customer?.name || 'khach-hang')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'khach-hang';
    return `${x},${y}`;
  };

  const buildOrderShareFilename = (order) => `${buildOrderShareBaseFilename(order)}.html`;

  const getOrderShareFormatLabel = (format = orderShareFileType) => (
    format === 'image' ? 'h�⬞����⬚¬nh ⬚¡�⬚º�⬚£nh' : 'PDF'
  );

  const buildOrderShareHtml = (order) => {
    if (!order) return '';
    const customerLedger = customerLedgerMap[order.customerId];
    const totalQuantity = (order.items || []).reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const previousDebt = Math.max(0, (customerLedger?.currentDebt || 0) - (order.outstandingAmount || 0));
    const totalReceivable = Math.max(0, previousDebt + (order.outstandingAmount || 0));
    const transferProfile = getInvoiceTransferProfile(currentCompany);
    const transferMemo = buildOrderTransferMemo(order);
    const qrUrl = buildVietQrImageUrl({
      bankId: transferProfile.bankId,
      accountNumber: transferProfile.accountNumber,
      accountName: transferProfile.accountName,
      amount: totalReceivable || order.outstandingAmount || order.amount || 0,
      addInfo: transferMemo,
      template: transferProfile.template
    });
    const companyName = currentCompany?.name || 'HD Manager';
    const companyMark = buildCompanyMonogram(companyName);
    const companyLogoUrl = currentCompany?.logoUrl || currentCompany?.logo || '';
    const buyerAddress = order.customer?.address || 'Ch⬚��� �⬚°a c�⬞����⬚³ ⬚����¢�⬚¬9�⬚¡�⬚»�¢�⬚¬¹a ch⬚¡�⬚»�¢�⬚¬°';
    const logoMarkup = showOrderShareLogo
      ? (companyLogoUrl
              ? `${formatCurrency(uniquePriceValues[0])} đ/kg`
          : `<div style="width:92px;height:92px;border:2px solid #e5e7eb;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#059669;background:#f8fafc;">${escapeHtml(companyMark)}</div>`)
      : '';
    const itemRows = (order.items || []).map((item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const lineTotal = quantity * unitPrice;
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px dashed #d4d4d8;vertical-align:top;font-weight:600;text-align:center;">${escapeHtml(item.description || 'S⬚¡�⬚º�⬚£n ph⬚¡�⬚º�⬚©m')}</td>
          <td style="padding:10px 8px;border-bottom:1px dashed #d4d4d8;text-align:center;">${escapeHtml(formatCurrency(unitPrice))}</td>
          <td style="padding:10px 8px;border-bottom:1px dashed #d4d4d8;text-align:center;">${escapeHtml(formatNumber(quantity))}</td>
          <td style="padding:10px 8px;border-bottom:1px dashed #d4d4d8;text-align:center;font-weight:700;">${escapeHtml(formatCurrency(lineTotal))}</td>
        </tr>
      `;
    }).join('');

    return `
      <!doctype html>
      <html lang="vi">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(formatOrderCode(order.id))} - ${escapeHtml(order.customer?.name || 'H�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n')}</title>
        </head>
        <body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
          <div style="max-width:760px;margin:0 auto;padding:24px 16px;">
            <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:28px;padding:28px 22px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
              <div style="display:grid;grid-template-columns:minmax(0,0.95fr) minmax(0,1.2fr);gap:16px;align-items:stretch;">
                <div style="background:#f8fafc;border-radius:24px;padding:18px 16px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:168px;">
                  ${showOrderShareLogo ? `<div style="margin-bottom:12px;">${logoMarkup}</div>` : ''}
                  <div style="font-size:28px;font-weight:900;letter-spacing:0.02em;line-height:1.25;">${escapeHtml(companyName)}</div>
                </div>
                <div style="background:#f8fafc;border-radius:24px;padding:18px 16px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:168px;">
                  <div style="font-size:34px;font-weight:900;letter-spacing:0.02em;line-height:1.15;">H�⬞����¢�⬚¬&�SA ⬚����⬚⬚��� �⬚ N B�⬞����⬚N H�⬞����¢���¬NG</div>
                  <div style="margin-top:12px;font-size:22px;font-weight:700;line-height:1.5;">${escapeHtml(formatOrderCode(order.id))} - ${escapeHtml(formatDateTimeLabel(order.date))}</div>
                </div>
              </div>

              <div style="margin-top:18px;font-size:22px;line-height:1.65;">
                <div><strong>Kh�⬞����⬚¡ch:</strong> ${escapeHtml(order.customer?.name || 'Kh�⬞����⬚¡ch l⬚¡�⬚º�⬚»')}</div>
                <div><strong>⬚����⬚T:</strong> ${escapeHtml(order.customer?.phone || 'Ch⬚��� �⬚°a c�⬞����⬚³ s⬚¡�⬚»�¢�⬚¬9� ⬚����¢�⬚¬9�i⬚¡�⬚»�¢�⬚¬¡n tho⬚¡�⬚º�⬚¡i')}</div>
                <div><strong>⬚����⬚⬚¡�⬚»�¢�⬚¬¹a ch⬚¡�⬚»�¢�⬚¬°:</strong> ${escapeHtml(buyerAddress)}</div>
              </div>

              <table style="width:100%;margin-top:18px;border-collapse:collapse;border:2px solid #3f3f46;font-size:20px;">
                <thead>
                  <tr style="background:#fafafa;">
                  <th style="padding:10px;text-align:left;">Ngày</th>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                    <th style="padding:10px 8px;border-right:1px dashed #3f3f46;text-align:center;">SL</th>
                    <th style="padding:10px 8px;text-align:center;">TT</th>
                  </tr>
                </thead>
                <tbody>${itemRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;">Ch⬚��� �⬚°a c�⬞����⬚³ h�⬞����⬚ ng h�⬞����⬚³a</td></tr>'}</tbody>
              </table>

              <div style="margin-top:18px;font-size:20px;line-height:1.8;">
                <div style="display:flex;justify-content:space-between;gap:12px;"><strong>Tr⬚¡�⬚º�⬚£ tr⬚��� �⬚°⬚¡�⬚»�¢�⬚¬ºc</strong><strong>${escapeHtml(formatCurrency(order.appliedAmount || 0))} ⬚����¢�⬚¬9�</strong></div>
                <div style="display:flex;justify-content:space-between;gap:12px;"><span>C�⬞����⬚²n n⬚¡�⬚»�⬚£ ⬚����¢�⬚¬9�⬚��� �⬚¡n n�⬞����⬚ y</span><strong>${escapeHtml(formatCurrency(order.outstandingAmount || 0))} ⬚����¢�⬚¬9�</strong></div>
                <div style="display:flex;justify-content:space-between;gap:12px;"><span>C�⬞����⬚´ng n⬚¡�⬚»�⬚£ c⬚���¦�⬚©</span><strong>${escapeHtml(formatCurrency(previousDebt))} ⬚����¢�⬚¬9�</strong></div>
                <div style="display:flex;justify-content:space-between;gap:12px;"><strong>C�⬞����⬚²n ph⬚¡�⬚º�⬚£i thu</strong><strong>${escapeHtml(formatCurrency(totalReceivable))} ⬚����¢�⬚¬9�</strong></div>
              </div>

              <div style="margin:20px 0 14px;border-top:2px solid #111827;"></div>
              <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;align-items:start;">
                <div>
                  <img src="${qrUrl}" alt="QR chuy⬚¡�⬚»�⬠�����n kho⬚¡�⬚º�⬚£n" style="width:100%;max-width:280px;border:1px solid #e5e7eb;border-radius:16px;display:block;" />
                </div>
                <div style="font-size:20px;line-height:1.8;text-align:right;">
                  <div style="font-weight:900;font-size:24px;">${escapeHtml(transferProfile.bankName)}</div>
                  <div style="font-weight:800;margin-top:6px;">${escapeHtml(transferProfile.accountName)}</div>
                  <div style="font-weight:800;">${escapeHtml(transferProfile.accountNumber)}</div>
                  <div style="margin-top:26px;text-align:left;">
                    <div style="font-size:16px;color:#6b7280;">N⬚¡�⬚»�¢���¢i dung</div>
                    <div style="font-weight:900;font-size:26px;letter-spacing:0.04em;">${escapeHtml(transferMemo)}</div>
                  </div>
                </div>
              </div>

              <div style="margin:22px 0 16px;border-top:2px dashed #3f3f46;"></div>
              <div style="text-align:center;font-size:18px;line-height:1.6;color:#374151;">
                <p style="margin:0;font-weight:900;font-size:20px;">C⬚¡�⬚º�⬚£m ⬚��� �⬚¡n qu�⬞����⬚½ kh�⬞����⬚¡ch v�⬞����⬚  h⬚¡�⬚º�⬚¹n g⬚¡�⬚º�⬚·p l⬚¡�⬚º�⬚¡i!</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const getOrderStatusMeta = (order) => {
    if ((order?.outstandingAmount || 0) > 0) {
      return {
    label: 'GPS vi tri',
        chipClasses: 'bg-amber-50 text-amber-700',
        amountClasses: 'text-orange-600'
      };
    }

    return {
    label: 'GPS vi tri',
      chipClasses: 'bg-emerald-50 text-emerald-700',
      amountClasses: 'text-emerald-600'
    };
  };

  const buildOrderShareText = (order) => {
    if (!order) return '';
    const customerLedger = customerLedgerMap[order.customerId];
    const previousDebt = Math.max(0, (customerLedger?.currentDebt || 0) - (order.outstandingAmount || 0));

    const itemLines = (order.items || []).map((item, index) => {
      const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    return `${x},${y}`;
    });

    const textLines = [
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      '',
      'Danh sách hàng hóa:'
    ];

    if (itemLines.length > 0) textLines.push(...itemLines);
    else textLines.push('- Chưa có chi tiết sản phẩm');

    textLines.push(
      '',
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `Giảm giá: ${formatCurrency(order.discount || 0)} đ`
    );

    if (order.customerExtraExpense > 0 || order.extraExpenseName) {
      textLines.push(`Phụ phí khách chịu${order.extraExpenseName ? ` (${order.extraExpenseName})` : ''}: ${formatCurrency(order.customerExtraExpense || 0)} đ`);
    }

    textLines.push(
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `Giảm giá: ${formatCurrency(order.discount || 0)} đ`
    );

    if ((order.paymentHistory || []).length > 0) {
      textLines.push('', 'Lịch sử thanh toán gắn với đơn:');
      order.paymentHistory.forEach((payment, index) => {
        textLines.push(`${index + 1}. ${formatDateLabel(payment.date)} - ${getPaymentMethodLabel(payment)} - ${formatCurrency(payment.allocatedToOrder || 0)} đ`);
      });
    }

    return textLines.join('\n');
  };

  const renderOrderShareCanvas = async () => {
    if (!selectedOrder || !orderSharePreviewMeta) {
      throw new Error('permission_denied');
    }
    if (!resolvedOrderShareQrUrl) {
      throw new Error('permission_denied');
    }
    const qrImage = await loadImageElement(resolvedOrderShareQrUrl);
    const logoImage = showOrderShareLogo && resolvedOrderShareLogoUrl
      ? await loadImageElement(resolvedOrderShareLogoUrl).catch(() => null)
      : null;

    const items = (selectedOrder.items || []).length > 0
      ? selectedOrder.items
      : [{ description: 'Ch⬚��� �⬚°a c�⬞����⬚³ h�⬞����⬚ ng h�⬞����⬚³a', quantity: 0, unitPrice: 0 }];

    const canvasWidth = 1080;
    const padding = 56;
    const cardX = 48;
    const cardY = 36;
    const cardWidth = canvasWidth - cardX * 2;
    const itemRowHeight = 62;
    const tableX = cardX + padding;
    const tableWidth = cardWidth - padding * 2;
    const headerTop = cardY + 30;
    const headerHeight = 170;
    const headerGap = 18;
    const leftHeaderWidth = 296;
    const rightHeaderWidth = tableWidth - leftHeaderWidth - headerGap;
    const leftHeaderX = tableX;
    const rightHeaderX = leftHeaderX + leftHeaderWidth + headerGap;
    const headerBottom = headerTop + headerHeight;
    const customerInfoTop = headerBottom + 48;
    const customerLineHeight = 34;
    const tableTop = customerInfoTop + (customerLineHeight * 3) + 28;
    const totalsTop = tableTop + 62 + items.length * itemRowHeight + 28;
    const qrSectionTop = totalsTop + 170;
    const footerTop = qrSectionTop + 320;
    const cardHeight = footerTop + 170;
    const canvasHeight = cardHeight + 48;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('permission_denied');
    }

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 34);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#dbe2ea';
    ctx.lineWidth = 2;
    ctx.stroke();

    const centerX = canvasWidth / 2;
    const leftHeaderCenterX = leftHeaderX + (leftHeaderWidth / 2);
    const rightHeaderCenterX = rightHeaderX + (rightHeaderWidth / 2);
    const leftX = tableX;

    drawRoundedRect(ctx, leftHeaderX, headerTop, leftHeaderWidth, headerHeight, 28);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    drawRoundedRect(ctx, rightHeaderX, headerTop, rightHeaderWidth, headerHeight, 28);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    ctx.textBaseline = 'alphabetic';
    if (showOrderShareLogo) {
      if (logoImage) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(leftHeaderCenterX, headerTop + 52, 34, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logoImage, leftHeaderCenterX - 34, headerTop + 18, 68, 68);
        ctx.restore();
        ctx.strokeStyle = '#dbe2ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(leftHeaderCenterX, headerTop + 52, 34, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(leftHeaderCenterX, headerTop + 52, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#dbe2ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(leftHeaderCenterX, headerTop + 52, 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#059669';
        ctx.font = '900 22px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(orderSharePreviewMeta.companyMark, leftHeaderCenterX, headerTop + 52);
      }
    }

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '900 26px Arial';
    const companyNameLines = wrapCanvasText(ctx, orderSharePreviewMeta.companyName, leftHeaderWidth - 40).slice(0, 2);
    const companyNameStartY = headerTop + (showOrderShareLogo ? 116 : 88);
    companyNameLines.forEach((line, index) => {
      ctx.fillText(line, leftHeaderCenterX, companyNameStartY + (index * 30));
    });

    ctx.font = '900 30px Arial';
    ctx.fillText('H�⬞����¢�⬚¬&�SA ⬚����⬚⬚��� �⬚ N B�⬞����⬚N H�⬞����¢���¬NG', rightHeaderCenterX, headerTop + 74);
    ctx.font = '700 18px Arial';
    ctx.fillStyle = '#475569';
    const orderMetaLines = wrapCanvasText(ctx, `${formatOrderCode(selectedOrder.id)} - ${formatDateTimeLabel(selectedOrder.date)}`, rightHeaderWidth - 40).slice(0, 2);
    orderMetaLines.forEach((line, index) => {
      ctx.fillText(line, rightHeaderCenterX, headerTop + 116 + (index * 26));
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 24px Arial';
    ctx.fillText(`Kh�⬞����⬚¡ch: ${selectedOrder.customer?.name || 'Kh�⬞����⬚¡ch l⬚¡�⬚º�⬚»'}`, leftX, customerInfoTop);
    ctx.fillText(`⬚����⬚T: ${selectedOrder.customer?.phone || 'Ch⬚��� �⬚°a c�⬞����⬚³ s⬚¡�⬚»�¢�⬚¬9� ⬚����¢�⬚¬9�i⬚¡�⬚»�¢�⬚¬¡n tho⬚¡�⬚º�⬚¡i'}`, leftX, customerInfoTop + customerLineHeight);
    ctx.fillText(`⬚����⬚⬚¡�⬚»�¢�⬚¬¹a ch⬚¡�⬚»�¢�⬚¬°: ${orderSharePreviewMeta.buyerAddress}`, leftX, customerInfoTop + (customerLineHeight * 2));

    const columnWidths = [430, 160, 110, tableWidth - 430 - 160 - 110];
    const columnX = [
      tableX,
      tableX + columnWidths[0],
      tableX + columnWidths[0] + columnWidths[1],
      tableX + columnWidths[0] + columnWidths[1] + columnWidths[2]
    ];

    drawRoundedRect(ctx, tableX, tableTop, tableWidth, 62 + items.length * itemRowHeight, 24);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    drawRoundedRect(ctx, tableX, tableTop, tableWidth, 62, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('S⬚¡�⬚º�⬚£n ph⬚¡�⬚º�⬚©m', tableX + (columnWidths[0] / 2), tableTop + 38);
    ctx.fillText('Gi�⬞����⬚¡', columnX[1] + (columnWidths[1] / 2), tableTop + 38);
    ctx.fillText('SL', columnX[2] + (columnWidths[2] / 2), tableTop + 38);
    ctx.fillText('TT', columnX[3] + ((tableWidth - columnWidths[0] - columnWidths[1] - columnWidths[2]) / 2), tableTop + 38);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    for (let rowIndex = 0; rowIndex < items.length; rowIndex += 1) {
      const rowTop = tableTop + 62 + rowIndex * itemRowHeight;
      ctx.beginPath();
      ctx.moveTo(tableX, rowTop);
      ctx.lineTo(tableX + tableWidth, rowTop);
      ctx.stroke();

      const item = items[rowIndex];
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const lineTotal = quantity * unitPrice;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.font = '600 18px Arial';
      ctx.fillText(item.description || `S⬚¡�⬚º�⬚£n ph⬚¡�⬚º�⬚©m ${rowIndex + 1}`, tableX + (columnWidths[0] / 2), rowTop + 38);
      ctx.font = '500 18px Arial';
      ctx.fillText(formatCurrency(unitPrice), columnX[1] + (columnWidths[1] / 2), rowTop + 38);
      ctx.fillText(formatNumber(quantity), columnX[2] + (columnWidths[2] / 2), rowTop + 38);
      ctx.font = '700 18px Arial';
      ctx.fillText(formatCurrency(lineTotal), columnX[3] + ((tableWidth - columnWidths[0] - columnWidths[1] - columnWidths[2]) / 2), rowTop + 38);
    }

    const summaryLeft = leftX;
    const summaryRight = cardX + cardWidth - padding;
    const summaryLines = [
      ['Tr⬚¡�⬚º�⬚£ tr⬚��� �⬚°⬚¡�⬚»�¢�⬚¬ºc', `${formatCurrency(selectedOrder.appliedAmount || 0)} ⬚����¢�⬚¬9�`, true],
      ['C�⬞����⬚²n n⬚¡�⬚»�⬚£ ⬚����¢�⬚¬9�⬚��� �⬚¡n n�⬞����⬚ y', `${formatCurrency(selectedOrder.outstandingAmount || 0)} ⬚����¢�⬚¬9�`, false],
      ['C�⬞����⬚´ng n⬚¡�⬚»�⬚£ c⬚���¦�⬚©', `${formatCurrency(orderSharePreviewMeta.previousDebt)} ⬚����¢�⬚¬9�`, false],
      ['C�⬞����⬚²n ph⬚¡�⬚º�⬚£i thu', `${formatCurrency(orderSharePreviewMeta.totalReceivable)} ⬚����¢�⬚¬9�`, true]
    ];
    summaryLines.forEach(([label, value, strong], index) => {
      const y = totalsTop + index * 38;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = strong ? '900 24px Arial' : '500 22px Arial';
      ctx.fillText(label, summaryLeft, y);
      ctx.textAlign = 'right';
      ctx.fillText(value, summaryRight, y);
    });

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cardX + padding, qrSectionTop - 40);
    ctx.lineTo(cardX + cardWidth - padding, qrSectionTop - 40);
    ctx.stroke();

    if (qrImage) {
      ctx.drawImage(qrImage, leftX, qrSectionTop, 260, 260);
      ctx.strokeStyle = '#dbe2ea';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(leftX, qrSectionTop, 260, 260);
    }

    const infoX = leftX + 300;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 30px Arial';
    ctx.fillText(orderSharePreviewMeta.transferProfile.bankName, infoX, qrSectionTop + 34);
    ctx.font = '700 24px Arial';
    ctx.fillText(orderSharePreviewMeta.transferProfile.accountName, infoX, qrSectionTop + 82);
    ctx.fillText(orderSharePreviewMeta.transferProfile.accountNumber, infoX, qrSectionTop + 118);
    ctx.font = '500 18px Arial';
    ctx.fillStyle = '#64748b';
    ctx.fillText('N⬚¡�⬚»�¢���¢i dung', infoX, qrSectionTop + 182);
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 28px Arial';
    ctx.fillText(orderSharePreviewMeta.transferMemo, infoX, qrSectionTop + 224);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + padding, footerTop - 28);
    ctx.lineTo(cardX + cardWidth - padding, footerTop - 28);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 24px Arial';
    ctx.fillText('C⬚¡�⬚º�⬚£m ⬚��� �⬚¡n qu�⬞����⬚½ kh�⬞����⬚¡ch v�⬞����⬚  h⬚¡�⬚º�⬚¹n g⬚¡�⬚º�⬚·p l⬚¡�⬚º�⬚¡i!', centerX, footerTop + 36);

    return canvas;
  };

  const exportOrderShareAsset = async (format = orderShareFileType) => {
    if (!selectedOrder) throw new Error('Ch⬚��� �⬚°a c�⬞����⬚³ h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n ⬚����¢�⬚¬9�⬚¡�⬚»�⬠����� chia s⬚¡�⬚º�⬚».');
    const canvas = await renderOrderShareCanvas();
    const dataUrl = canvas.toDataURL('image/png');

    if (format === 'image') {
      const imageBlob = await canvasToBlob(canvas, 'image/png');
      return {
        filename: `${buildOrderShareBaseFilename(selectedOrder)}.png`,
        blob: imageBlob,
        label: '⬚¡�⬚º�⬚£nh PNG'
      };
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4',
      hotfixes: ['px_scaling'],
      compress: true
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageProps = pdf.getImageProperties(dataUrl);
    const ratio = Math.min(pageWidth / imageProps.width, pageHeight / imageProps.height);
    const renderWidth = imageProps.width * ratio;
    const renderHeight = imageProps.height * ratio;
    const offsetX = (pageWidth - renderWidth) / 2;
    const offsetY = 0;
    pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, renderWidth, renderHeight);

    return {
      filename: `${buildOrderShareBaseFilename(selectedOrder)}.pdf`,
      blob: pdf.output('blob'),
      label: 'file PDF'
    };
  };

  const resolveShareStatusMessage = (result, channel, assetLabel = 't⬚¡�⬚»�¢�⬚¬¡p') => {
    if (result.status === 'shared') {
      if (channel === 'native') return `⬚����⬚�⬞����⬚£ m⬚¡�⬚»�⬦¸ b⬚¡�⬚º�⬚£ng chia s⬚¡�⬚º�⬚» c⬚¡�⬚»�⬚§a m�⬞����⬚¡y k�⬞����⬚¨m ${assetLabel} h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n. B⬚¡�⬚º�⬚¡n c�⬞����⬚³ th⬚¡�⬚»�⬠����� ch⬚¡�⬚»�⬚n ⬚¡�⬚»�⬚©ng d⬚¡�⬚»�⬚¥ng mu⬚¡�⬚»�¢�⬚¬9�n g⬚¡�⬚»�⬚­i cho kh�⬞����⬚¡ch.`;
    return `${x},${y}`;
    }
    if (result.status === 'copied') {
  if (channel === 'zalo') return 'Zalo';
    return `${x},${y}`;
    }
    if (result.status === 'saved') return `⬚����⬚�⬞����⬚£ l⬚��� �⬚°u ${assetLabel} h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n v�⬞����⬚ o b⬚¡�⬚»�¢���¢ nh⬚¡�⬚»�¢�⬚¬º m�⬞����⬚¡y. B⬚¡�⬚º�⬚¡n c�⬞����⬚³ th⬚¡�⬚»�⬠����� m⬚¡�⬚»�⬦¸ file r⬚¡�⬚»�¢�⬚¬&�Si g⬚¡�⬚»�⬚­i ti⬚¡�⬚º�⬚¿p cho kh�⬞����⬚¡ch.`;
    if (result.status === 'downloaded') return `⬚����⬚�⬞����⬚£ t⬚¡�⬚º�⬚£i ${assetLabel} h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n v⬚¡�⬚»�⬚ m�⬞����⬚¡y ⬚����¢�⬚¬9�⬚¡�⬚»�⬠����� b⬚¡�⬚º�⬚¡n g⬚¡�⬚»�⬚­i cho kh�⬞����⬚¡ch.`;
    if (result.status === 'cancelled') return 'Bạn đã đóng bảng chia sẻ.';
    return 'web';
  };

  const handleShareOrder = async (channel = 'native') => {
    if (!selectedOrder) return;
    if (!isOrderShareReady) {
      setOrderShareStatus(`⬚����⬚ang chu⬚¡�⬚º�⬚©n b⬚¡�⬚»�¢�⬚¬¹ ${getOrderShareFormatLabel(orderShareFileType)} ⬚����¢�⬚¬9�⬚¡�⬚»�⬠����� chia s⬚¡�⬚º�⬚». B⬚¡�⬚º�⬚¡n ch⬚¡�⬚»�⬚ th�⬞����⬚ªm m⬚¡�⬚»�¢���¢t ch�⬞����⬚ºt r⬚¡�⬚»�¢�⬚¬&�Si th⬚¡�⬚»�⬚­ l⬚¡�⬚º�⬚¡i.`);
      return;
    }
    setIsOrderShareExporting(true);
    try {
    const title = `${formatOrderCode(selectedOrder.id)} - ${selectedOrder.customer?.name || 'Hóa đơn'}`;
      const shareAsset = await exportOrderShareAsset(orderShareFileType);
      const result = channel === 'native'
        ? await shareBlobFile({
            filename: shareAsset.filename,
            blob: shareAsset.blob,
            title,
            text: buildOrderShareText(selectedOrder),
            dialogTitle: 'Chia s⬚¡�⬚º�⬚» h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n'
          })
        : await shareTextContent({
            title,
            text: buildOrderShareText(selectedOrder),
            dialogTitle: `Chia s⬚¡�⬚º�⬚» qua ${getShareChannelLabel(channel)}`
          });
      setOrderShareStatus(resolveShareStatusMessage(result, channel, shareAsset.label));
    } catch (error) {
      setOrderShareStatus(error?.message || 'Kh�⬞����⬚´ng th⬚¡�⬚»�⬠����� xu⬚¡�⬚º�⬚¥t h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n sang ⬚����¢�⬚¬9�⬚¡�⬚»�¢�⬚¬¹nh d⬚¡�⬚º�⬚¡ng b⬚¡�⬚º�⬚¡n ⬚����¢�⬚¬9��⬞����⬚£ ch⬚¡�⬚»�⬚n.');
    } finally {
      setIsOrderShareExporting(false);
    }
  };

  const handleDownloadOrderTemplate = async () => {
    if (!selectedOrder) return;
    if (!isOrderShareReady) {
      setOrderShareStatus(`⬚����⬚ang chu⬚¡�⬚º�⬚©n b⬚¡�⬚»�¢�⬚¬¹ ${getOrderShareFormatLabel(orderShareFileType)} ⬚����¢�⬚¬9�⬚¡�⬚»�⬠����� l⬚��� �⬚°u file. B⬚¡�⬚º�⬚¡n ch⬚¡�⬚»�⬚ th�⬞����⬚ªm m⬚¡�⬚»�¢���¢t ch�⬞����⬚ºt r⬚¡�⬚»�¢�⬚¬&�Si th⬚¡�⬚»�⬚­ l⬚¡�⬚º�⬚¡i.`);
      return;
    }
    setIsOrderShareExporting(true);
    try {
      const shareAsset = await exportOrderShareAsset(orderShareFileType);
      const result = await saveBlobFile(shareAsset.filename, shareAsset.blob);
      setOrderShareStatus(resolveShareStatusMessage(result, 'native', shareAsset.label));
    } catch (error) {
      setOrderShareStatus(error?.message || 'Kh�⬞����⬚´ng th⬚¡�⬚»�⬠����� l⬚��� �⬚°u file h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n theo ⬚����¢�⬚¬9�⬚¡�⬚»�¢�⬚¬¹nh d⬚¡�⬚º�⬚¡ng ⬚����¢�⬚¬9��⬞����⬚£ ch⬚¡�⬚»�⬚n.');
    } finally {
      setIsOrderShareExporting(false);
    }
  };

  const handleAddItem = () => setNewOrder({...newOrder, items: [...newOrder.items, createEmptyOrderItem()]});
  const handleRemoveItem = (index) => {
    const newItems = [...newOrder.items]; newItems.splice(index, 1);
    setNewOrder({...newOrder, items: newItems});
  };
  const handleItemChange = (index, field, value) => {
    const newItems = [...newOrder.items];
    newItems[index][field] = value;
    setNewOrder({...newOrder, items: newItems});
  };
  const handleItemProductChange = (index, prodId) => {
    const prod = activeProducts.find(p => p.id === prodId);
    const newItems = [...newOrder.items]; 
    if(prod) {
      newItems[index].productId = prod.id;
      newItems[index].description = prod.name;
      newItems[index].unitPrice = prod.sellingPrice;
    } 
    else {
      newItems[index].productId = '';
      newItems[index].description = '';
      newItems[index].unitPrice = '';
    }
    setNewOrder({...newOrder, items: newItems});
  };

  const handleQuickAddCustomer = (e) => {
    e.preventDefault();
    const finalEmpId = isSales ? employee.id : newCus.empId;
    if (!finalEmpId) return setErrorMsg("Vui lòng chọn nhân viên phụ trách khách hàng này!");
    
    onAddCustomer(finalEmpId, { name: newCus.name, phone: newCus.phone, address: newCus.address, customerGroup: newCus.customerGroup });
    setSearchCus(newCus.name);
    setShowQuickAddCus(false);
    setNewCus({name:'', phone:'', address:'', customerGroup: '', empId: isSales ? employee?.id || '' : ''});
  };

  const normalizeOrderItemsForSubmit = (items = [], { allowDescriptionOnly = false } = {}) => {
    return items
      .map((item) => {
        const matchedProduct = item.productId ? activeProducts.find((product) => product.id === item.productId) : null;
        const description = capitalizeFirst(`${item.description || matchedProduct?.name || ''}`.trim());
        const dispatchWeight = parseLooseQuantityValue(item.dispatchWeight);
        const shrinkageKg = Math.max(0, parseLooseQuantityValue(item.shrinkageKg));
        const manualQuantity = parseLooseQuantityValue(item.quantity);
        const quantity = dispatchWeight > 0
          ? Math.max(0, Number((dispatchWeight - shrinkageKg).toFixed(2)))
          : manualQuantity;
        const unitPrice = parseLooseMoneyValue(item.unitPrice);
        return {
          ...item,
          productId: item.productId || '',
          description,
          dispatchWeight,
          shrinkageKg,
          quantity,
          unitPrice
        };
      })
      .filter((item) => {
        const hasIdentity = allowDescriptionOnly ? Boolean(item.productId || item.description) : Boolean(item.productId);
        return hasIdentity && item.quantity > 0 && item.unitPrice > 0;
      });
  };

  const resolveCustomerForOrderDraft = async (draft) => {
    const typedCustomerName = capitalizeFirst(`${draft.customerName || ''}`.trim());
    const selectedCustomer = draft.customerId ? accessibleCustomers.find((customer) => customer.id === draft.customerId) : null;
    if (selectedCustomer) {
      return { customerId: selectedCustomer.id, customer: selectedCustomer };
    }

    const matchedCustomer = typedCustomerName
      ? findBestEntityMatch(typedCustomerName, accessibleCustomers, (customer) => customer.name)
      : null;
    if (matchedCustomer) {
      return { customerId: matchedCustomer.id, customer: matchedCustomer };
    }

    if (!typedCustomerName) {
      throw new Error('permission_denied');
    }

    const salesEmpId = draft.salesEmpId || getDefaultSalesEmpId();
    if (!salesEmpId) {
      throw new Error(`Không thể tạo khách hàng "${typedCustomerName}" trên hệ thống.`);
    }

    const createdCustomerId = await onAddCustomer(salesEmpId, {
      name: typedCustomerName,
      phone: '',
      address: '',
      customerGroup: ''
    });

    if (!createdCustomerId) {
      throw new Error(`Không thể tạo khách hàng "${typedCustomerName}" trên hệ thống.`);
    }

    return {
      customerId: createdCustomerId,
      customer: {
        id: createdCustomerId,
        name: typedCustomerName,
        empId: salesEmpId
      }
    };
  };

  const prepareOrderDraftPayload = async (draft, { allowDescriptionOnly = false } = {}) => {
    const validItems = normalizeOrderItemsForSubmit(draft.items, { allowDescriptionOnly });
    if (validItems.length === 0) {
      throw new Error(allowDescriptionOnly
            ? 'Chưa có'
        : 'Vui lòng nhập ít nhất 1 sản phẩm hợp lệ.');
    }

    const { customerId, customer } = await resolveCustomerForOrderDraft(draft);
    const salesEmpId = customer?.empId || draft.salesEmpId || (isSales ? employee?.id : null);
    if (!salesEmpId) {
      throw new Error('permission_denied');
    }

    const discount = parseLooseMoneyValue(draft.discount);
    const extraExpenseAmount = parseLooseMoneyValue(draft.extraExpenseAmount);
    let customerDraftExpense = 0;
    let sellerDraftExpense = 0;

    if (draft.extraExpensePayer === 'buyer') {
      customerDraftExpense = extraExpenseAmount;
    } else if (draft.extraExpensePayer === 'shared') {
      customerDraftExpense = extraExpenseAmount / 2;
      sellerDraftExpense = extraExpenseAmount / 2;
    } else if (draft.extraExpensePayer === 'seller') {
      sellerDraftExpense = extraExpenseAmount;
    }

    const orderSubtotal = validItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0);
    const orderTotal = Math.max(0, orderSubtotal - discount + customerDraftExpense);

    return {
      payload: {
        customerId,
        salesEmpId,
        items: validItems,
        discount,
        extraExpenseName: capitalizeFirst(draft.extraExpenseName || ''),
        extraExpenseAmount,
        extraExpensePayer: draft.extraExpensePayer || 'buyer',
        customerExtraExpense: customerDraftExpense,
        sellerExtraExpense: sellerDraftExpense,
        amount: orderTotal,
        date: draft.date || getTodayString(),
        note: capitalizeFirst(draft.note || '')
      },
      customerId,
      customer,
      salesEmpId,
      orderTotal,
      sellerDraftExpense
    };
  };

  const submitOrderDraft = async (draft, { allowDescriptionOnly = false } = {}) => {
    const empId = employee?.id || 'admin';
    const { payload, customerId, customer, salesEmpId, orderTotal, sellerDraftExpense } = await prepareOrderDraftPayload(draft, { allowDescriptionOnly });

    const createdOrderId = await onAddOrder(empId, payload);

    const upfront = parseLooseMoneyValue(draft.upfrontPayment);
    if (upfront > 0 && onAddPayment) {
      await onAddPayment({
        customerId,
        orderId: createdOrderId,
        matchedOrderId: createdOrderId,
        matchedOrderCode: formatOrderCode(createdOrderId),
        amount: upfront,
        note: `Khách thanh toán trước - ${draft.paymentMethod || 'Chuyển khoản'}`,
        date: draft.date || getTodayString(),
        method: draft.paymentMethod || 'Chuyển khoản',
        sourceType: 'order_upfront',
        sourceLabel: 'Kh�⬞����⬚¡ch thanh to�⬞����⬚¡n khi l�⬞����⬚ªn ⬚����¢�⬚¬9�⬚��� �⬚¡n',
        sourceOrderId: createdOrderId
      });
    }

    if (sellerDraftExpense > 0 && onAddExpense) {
      await onAddExpense({
        sourceType: 'order_extra_expense',
        category: 'Chi phí khác',
        amount: sellerDraftExpense,
        note: `Khách thanh toán trước - ${draft.paymentMethod || 'Chuyển khoản'}`,
        date: payload.date
      });
    }

    return { orderId: createdOrderId, customerId, salesEmpId, amount: orderTotal };
  };

  const handleAddBulkDraft = () => {
    setBulkOrderStatus('');
    setBulkOrderDrafts((prev) => [...prev, createBulkOrderDraft()]);
  };

  const mergeBulkOrderDraftCollections = (existingDrafts = [], incomingDrafts = []) => {
    const getDraftKey = (draft) => draft.customerId || `customer_${normalizeLookupText(draft.customerName || '')}`;
    const getItemKey = (item) => item.productId || `item_${normalizeLookupText(item.description || '')}`;
    const draftMap = new Map();
    const draftOrder = [];

    existingDrafts.forEach((draft) => {
      const draftKey = getDraftKey(draft);
      draftOrder.push(draftKey);
      draftMap.set(draftKey, {
        ...draft,
        items: (draft.items || []).map((item) => ({
          ...item,
          sourceDispatchIds: Array.isArray(item?.sourceDispatchIds) ? [...item.sourceDispatchIds] : []
        }))
      });
    });

    incomingDrafts.forEach((incomingDraft) => {
      const draftKey = getDraftKey(incomingDraft);
      const clonedIncomingItems = (incomingDraft.items || []).map((item) => ({
        ...item,
        sourceDispatchIds: Array.isArray(item?.sourceDispatchIds) ? [...item.sourceDispatchIds] : []
      }));

      if (!draftMap.has(draftKey)) {
        draftOrder.push(draftKey);
        draftMap.set(draftKey, { ...incomingDraft, items: clonedIncomingItems });
        return;
      }

      const currentDraft = draftMap.get(draftKey);
      const itemMap = new Map((currentDraft.items || []).map((item) => [getItemKey(item), item]));

      clonedIncomingItems.forEach((incomingItem) => {
        const itemKey = getItemKey(incomingItem);
        const currentItem = itemMap.get(itemKey);
        if (!currentItem) {
          currentDraft.items = [...(currentDraft.items || []), incomingItem];
          itemMap.set(itemKey, incomingItem);
          return;
        }

        const nextDispatchWeight = (parseLooseQuantityValue(currentItem.dispatchWeight) || 0) + (parseLooseQuantityValue(incomingItem.dispatchWeight) || 0);
        const shrinkageKg = Math.max(0, parseLooseQuantityValue(currentItem.shrinkageKg));
        currentItem.dispatchWeight = nextDispatchWeight > 0 ? nextDispatchWeight : currentItem.dispatchWeight || incomingItem.dispatchWeight || '';
        if (nextDispatchWeight > 0) {
          currentItem.quantity = Math.max(0, Number((nextDispatchWeight - shrinkageKg).toFixed(2)));
        }
        currentItem.sourceDispatchIds = Array.from(new Set([
          ...(Array.isArray(currentItem.sourceDispatchIds) ? currentItem.sourceDispatchIds : []),
          ...(Array.isArray(incomingItem.sourceDispatchIds) ? incomingItem.sourceDispatchIds : [])
        ]));
        if (!currentItem.productId && incomingItem.productId) currentItem.productId = incomingItem.productId;
        if (!currentItem.description && incomingItem.description) currentItem.description = incomingItem.description;
        if (!currentItem.unitPrice && incomingItem.unitPrice) currentItem.unitPrice = incomingItem.unitPrice;
      });

      if (!currentDraft.note && incomingDraft.note) currentDraft.note = incomingDraft.note;
      if (!currentDraft.customerName && incomingDraft.customerName) currentDraft.customerName = incomingDraft.customerName;
      if (!currentDraft.salesEmpId && incomingDraft.salesEmpId) currentDraft.salesEmpId = incomingDraft.salesEmpId;
    });

    return draftOrder.map((draftKey) => draftMap.get(draftKey)).filter(Boolean);
  };

  const handleLoadBulkDraftsFromDispatch = () => {
    setBulkOrderStatus('');
    if (availableWarehouseDispatchRows.length === 0) {
    setBulkOrderStatus('');
      return;
    }

    const loadedDispatchIds = new Set(
      bulkOrderDrafts.flatMap((draft) => (
        Array.isArray(draft.items)
          ? draft.items.flatMap((item) => Array.isArray(item?.sourceDispatchIds) ? item.sourceDispatchIds : [])
          : []
      )).filter(Boolean)
    );
    const rowsToImport = availableWarehouseDispatchRows.filter((row) => !loadedDispatchIds.has(row.id));

    if (rowsToImport.length === 0) {
    setBulkOrderStatus('');
      return;
    }

    const nextImportedDrafts = buildBulkOrderDraftsFromDispatchRows(rowsToImport);
    setBulkOrderDrafts((prev) => (
      prev.length > 0
        ? mergeBulkOrderDraftCollections(prev, nextImportedDrafts)
        : nextImportedDrafts
    ));
      setBulkOrderStatus(`Đã tạo ${createdCount} đơn hàng từ ảnh sổ sách. Bạn có thể tiếp tục chọn ảnh khác hoặc tạo tay.`);
  };

  const handleBulkDraftChange = (draftId, field, value) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => draft.localId === draftId ? { ...draft, [field]: value } : draft));
  };

  const handleBulkDraftItemChange = (draftId, itemIndex, field, value) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => {
      if (draft.localId !== draftId) return draft;
      const items = [...draft.items];
      const nextItem = { ...items[itemIndex], [field]: value };
      const dispatchWeight = parseLooseQuantityValue(nextItem.dispatchWeight);
        if (dispatchWeight > 0) {
          if (field === 'shrinkageKg') {
            const shrinkageKg = Math.max(0, parseLooseQuantityValue(value));
            nextItem.shrinkageKg = shrinkageKg;
            nextItem.quantity = Math.max(0, Number((dispatchWeight - shrinkageKg).toFixed(2)));
          } else if (field === 'quantity') {
            const quantity = Math.max(0, parseLooseQuantityValue(value));
            nextItem.quantity = quantity;
            nextItem.shrinkageKg = Math.max(0, Number((dispatchWeight - quantity).toFixed(2)));
          }
        }
      items[itemIndex] = nextItem;
      return { ...draft, items };
    }));
  };

  const handleBulkDraftItemProductChange = (draftId, itemIndex, productId) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => {
      if (draft.localId !== draftId) return draft;
      const product = activeProducts.find((item) => item.id === productId);
      const items = [...draft.items];
      items[itemIndex] = product ? {
        ...items[itemIndex],
        productId: product.id,
        description: product.name,
        unitPrice: items[itemIndex].unitPrice || product.sellingPrice
      } : {
        ...items[itemIndex],
        productId: ''
      };
      return { ...draft, items };
    }));
  };

  const handleAddBulkDraftItem = (draftId) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => draft.localId === draftId ? { ...draft, items: [...draft.items, createEmptyOrderItem()] } : draft));
  };

  const handleRemoveBulkDraftItem = (draftId, itemIndex) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => {
      if (draft.localId !== draftId) return draft;
      const items = draft.items.filter((_, index) => index !== itemIndex);
      return { ...draft, items: items.length > 0 ? items : [createEmptyOrderItem()] };
    }));
  };

  const handleRemoveBulkDraft = (draftId) => {
    setBulkOrderDrafts((prev) => prev.filter((draft) => draft.localId !== draftId));
  };

  const handleNotebookImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkOrderStatus('');
    if (!GEMINI_API_KEY) {
    setBulkOrderStatus('');
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
    setBulkOrderStatus('');
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
      return;
    }

    setIsBulkOrderScanning(true);
    try {
      const aiOrders = await requestNotebookOrderDraftsFromGemini(file);
      const mappedDrafts = aiOrders.map((rawOrder, draftIndex) => {
        const matchedCustomer = findBestEntityMatch(rawOrder?.customer_name, customers, (customer) => customer.name);
        const items = Array.isArray(rawOrder?.items) ? rawOrder.items.map((rawItem) => {
          const matchedProduct = findBestEntityMatch(rawItem?.description, activeProducts, (product) => product.name);
          const parsedQuantity = parseLooseQuantityValue(rawItem?.quantity_kg ?? rawItem?.quantity ?? rawItem?.qty);
          const parsedUnitPrice = parseLooseMoneyValue(rawItem?.unit_price_vnd ?? rawItem?.unit_price ?? rawItem?.price);
          return {
            productId: matchedProduct?.id || '',
            description: matchedProduct?.name || capitalizeFirst(rawItem?.description || ''),
            quantity: parsedQuantity > 0 ? parsedQuantity : '',
            unitPrice: parsedUnitPrice > 0 ? parsedUnitPrice : (matchedProduct?.sellingPrice || '')
          };
        }).filter((item) => item.description || item.productId) : [];

        return createBulkOrderDraft({
          localId: `bulk_ai_${Date.now()}_${draftIndex}`,
          customerId: matchedCustomer?.id || '',
          customerName: matchedCustomer?.name || capitalizeFirst(rawOrder?.customer_name || ''),
          salesEmpId: matchedCustomer?.empId || getDefaultSalesEmpId(),
          date: normalizeAiOrderDate(rawOrder?.date),
          note: capitalizeFirst(rawOrder?.note || ''),
          items: items.length > 0 ? items : [createEmptyOrderItem()]
        });
      });

      setBulkOrderDrafts(mappedDrafts);
      setBulkOrderStatus(`Đã tạo ${createdCount} đơn hàng từ ảnh sổ sách. Bạn có thể tiếp tục chọn ảnh khác hoặc tạo tay.`);
    } catch (error) {
      setBulkOrderStatus(error?.message || 'AI chưa đọc được ảnh sổ sách này. Bạn hãy thử lại.');
    } finally {
      setIsBulkOrderScanning(false);
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
    }
  };

  const handleSubmitBulkOrders = async () => {
    if (bulkOrderDrafts.length === 0) {
    setBulkOrderStatus('');
      return;
    }

    setErrorMsg('');
    setBulkOrderStatus('');
    setIsBulkOrderSubmitting(true);
    let createdCount = 0;

    try {
      for (let index = 0; index < bulkOrderDrafts.length; index += 1) {
        await submitOrderDraft(bulkOrderDrafts[index], { allowDescriptionOnly: true });
        createdCount += 1;
      }
      setBulkOrderDrafts([]);
      setBulkOrderStatus(`Đã tạo ${createdCount} đơn hàng từ ảnh sổ sách. Bạn có thể tiếp tục chọn ảnh khác hoặc tạo tay.`);
    } catch (error) {
      setBulkOrderStatus(`Đã tạo ${createdCount} đơn hàng từ ảnh sổ sách. Bạn có thể tiếp tục chọn ảnh khác hoặc tạo tay.`);
    } finally {
      setIsBulkOrderSubmitting(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      if (isEditingOrder) {
        const { payload } = await prepareOrderDraftPayload(newOrder, { allowDescriptionOnly: false });
        const result = await onEditOrder(editingOrderId, payload, {
          amount: parseLooseMoneyValue(newOrder.upfrontPayment),
          method: newOrder.paymentMethod || 'Chuy⬚¡�⬚»�⬠�����n kho⬚¡�⬚º�⬚£n',
          existingPaymentId: newOrder.editableCollectedPaymentId || '',
          existingSourceType: newOrder.editableCollectedPaymentSourceType || '',
          note: `Kh�⬞����⬚¡ch thanh to�⬞����⬚¡n tr⬚��� �⬚°⬚¡�⬚»�¢�⬚¬ºc - ${newOrder.paymentMethod || 'Chuy⬚¡�⬚»�⬠�����n kho⬚¡�⬚º�⬚£n'}`
        });
        if (result?.success === false) {
          throw new Error(result.message || 'Kh�⬞����⬚´ng th⬚¡�⬚»�⬠����� c⬚¡�⬚º�⬚­p nh⬚¡�⬚º�⬚­t ⬚����¢�⬚¬9�⬚��� �⬚¡n h�⬞����⬚ ng n�⬞����⬚ y.');
        }
      } else {
        await submitOrderDraft(newOrder, { allowDescriptionOnly: false });
      }
      closeAddOrderModal();
    } catch (error) {
      setErrorMsg(error?.message || (isEditingOrder ? 'Kh�⬞����⬚´ng th⬚¡�⬚»�⬠����� c⬚¡�⬚º�⬚­p nh⬚¡�⬚º�⬚­t ⬚����¢�⬚¬9�⬚��� �⬚¡n h�⬞����⬚ ng n�⬞����⬚ y.' : 'Kh�⬞����⬚´ng th⬚¡�⬚»�⬠����� t⬚¡�⬚º�⬚¡o ⬚����¢�⬚¬9�⬚��� �⬚¡n h�⬞����⬚ ng n�⬞����⬚ y.'));
    }
  };

  const openAddOrderModal = () => {
    setEditingOrderId(null);
    setNewOrder(createSingleOrderState());
    setSearchCus('');
    setErrorMsg('');
    setBulkOrderStatus('');
    setShowAddOrder(true);
  };

  const openEditOrderModal = (order) => {
    if (!order) return;
    const editableCollectedPayment = findEditableCollectedPayment(order);
    const editableCollectedAmount = roundMoneyValue(
      editableCollectedPayment?.amount || editableCollectedPayment?.allocatedToOrder || 0
    );
    const lockedCollectedAmount = Math.max(0, roundMoneyValue(order.appliedAmount || 0) - editableCollectedAmount);
    const seededItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items.map((item) => ({
          productId: item.productId || '',
          description: item.description || activeProducts.find((product) => product.id === item.productId)?.name || '',
          quantity: item.quantity ?? 1,
          unitPrice: item.unitPrice ?? ''
        }))
      : [createEmptyOrderItem()];

    setEditingOrderId(order.id);
    setNewOrder(createSingleOrderState({
      customerId: order.customerId || '',
      items: seededItems,
      discount: order.discount ?? '',
      extraExpenseName: order.extraExpenseName || '',
      extraExpenseAmount: order.extraExpenseAmount ?? '',
      extraExpensePayer: order.extraExpensePayer || 'buyer',
      date: order.date || getTodayString(),
      upfrontPayment: editableCollectedAmount,
      paymentMethod: editableCollectedPayment?.method || editableCollectedPayment?.paymentMethod || 'Chuy⬚¡�⬚»�⬠�����n kho⬚¡�⬚º�⬚£n',
      note: order.note || '',
      editableCollectedPaymentId: editableCollectedPayment?.id || '',
      editableCollectedPaymentSourceType: editableCollectedPayment?.sourceType || '',
      lockedCollectedAmount
    }));
    setSearchCus(order.customer?.name || '');
    setErrorMsg('');
    setBulkOrderStatus('');
    setBulkOrderDrafts([]);
    setShowOrderSharePreview(false);
    setShowAddOrder(true);
  };

  const closeAddOrderModal = () => {
    setShowAddOrder(false);
    setEditingOrderId(null);
    setNewOrder(createSingleOrderState());
    setSearchCus('');
    setErrorMsg('');
    setBulkOrderStatus('');
    setBulkOrderDrafts([]);
    if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 animate-in fade-in pb-16">
      {(showSearchBox || orderSearchKeyword || showFilterPanel) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          {(showSearchBox || orderSearchKeyword) && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2 flex items-center gap-2">
              <Search size={16} className="text-gray-400 shrink-0" />
              <input
                type="text"
                value={orderSearchKeyword}
                onChange={(e) => setOrderSearchKeyword(e.target.value)}
                  placeholder="Nhập hoặc chọn loại chi phí"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {orderSearchKeyword && (
                <button type="button" onClick={() => setOrderSearchKeyword('')} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {showFilterPanel && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setTab('all')} className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${tab === 'all' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Tất cả đơn</button>
                <button type="button" onClick={() => setTab('all')} className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${tab === 'all' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Tất cả đơn</button>
              </div>
              <p className="text-[11px] text-gray-500">⬚����⬚ang hi⬚¡�⬚»�⬠�����n th⬚¡�⬚»�¢�⬚¬¹ {displayOrders.length} ⬚����¢�⬚¬9�⬚��� �⬚¡n ph�⬞����⬚¹ h⬚¡�⬚»�⬚£p v⬚¡�⬚»�¢�⬚¬ºi b⬚¡�⬚»�¢���¢ l⬚¡�⬚»�⬚c hi⬚¡�⬚»�¢�⬚¬¡n t⬚¡�⬚º�⬚¡i.</p>
            </div>
          )}
        </div>
      )}

      {showFilterPanel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" onClick={() => setOrderTimeFilter('day')} className={`rounded-xl border px-3 py-3 text-xs font-bold transition-colors ${orderTimeFilter === 'day' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>H�⬞����⬚´m nay</button>
            <button type="button" onClick={() => setOrderTimeFilter('week')} className={`rounded-xl border px-3 py-3 text-xs font-bold transition-colors ${orderTimeFilter === 'week' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Tu⬚¡�⬚º�⬚§n n�⬞����⬚ y</button>
            <button type="button" onClick={() => setOrderTimeFilter('month')} className={`rounded-xl border px-3 py-3 text-xs font-bold transition-colors ${orderTimeFilter === 'month' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Th�⬞����⬚¡ng n�⬞����⬚ y</button>
            <button type="button" onClick={() => setOrderTimeFilter('specific')} className={`rounded-xl border px-3 py-3 text-xs font-bold transition-colors ${orderTimeFilter === 'specific' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Ng�⬞����⬚ y c⬚¡�⬚»�⬚¥ th⬚¡�⬚»�⬠�����</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-500">Ph⬚¡�⬚º�⬚¡m vi ⬚����¢�⬚¬9�ang xem: {orderTimeFilterLabel}.</p>
              {orderTimeFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    setOrderTimeFilter('all');
                    setOrderSpecificDate(getTodayString());
                  }}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700"
                >
                  X�⬞����⬚³a l⬚¡�⬚»�⬚c ng�⬞����⬚ y
                </button>
              )}
            </div>
            {orderTimeFilter === 'specific' && (
              <input
                type="date"
                value={orderSpecificDate}
                onChange={(e) => setOrderSpecificDate(e.target.value || getTodayString())}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-300"
              />
            )}
          </div>
        </div>
      )}
      
      <div className="space-y-3">
        {displayOrders.length === 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center text-sm text-gray-400">
            Ch⬚��� �⬚°a c�⬞����⬚³ ⬚����¢�⬚¬9�⬚��� �⬚¡n h�⬞����⬚ ng n�⬞����⬚ o ph�⬞����⬚¹ h⬚¡�⬚»�⬚£p v⬚¡�⬚»�¢�⬚¬ºi b⬚¡�⬚»�¢���¢ l⬚¡�⬚»�⬚c hi⬚¡�⬚»�¢�⬚¬¡n t⬚¡�⬚º�⬚¡i.
          </div>
        )}

        {displayOrders.map(order => {
          const statusMeta = getOrderStatusMeta(order);
          const itemCount = (order.items || []).reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
          const primaryItem = (order.items || [])[0] || null;
          const extraItemCount = Math.max(0, (order.items || []).length - 1);
          const priceValues = (order.items || [])
            .map(item => parseFloat(item.unitPrice) || 0)
            .filter(value => value > 0);
          const uniquePriceValues = [...new Set(priceValues)];
          const itemTypeLabel = primaryItem
            ? `${primaryItem.description || 'M⬚¡�⬚º�⬚·t h�⬞����⬚ ng'}${extraItemCount > 0 ? ` +${extraItemCount} lo⬚¡�⬚º�⬚¡i` : ''}`
            : 'Chưa có mặt hàng';
          const unitPriceLabel = uniquePriceValues.length === 0
            ? 'Chưa có'
            : uniquePriceValues.length === 1
              ? `${formatCurrency(uniquePriceValues[0])} đ/kg`
              : `${formatCurrency(Math.min(...uniquePriceValues))} - ${formatCurrency(Math.max(...uniquePriceValues))} đ/kg`;

          return (
            <div key={`detail_${order.id}`} className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openEditOrderModal(order);
                }}
                className={`absolute top-3 z-10 text-gray-300 hover:text-blue-500 ${isAccounting ? 'right-10' : 'right-3'}`}
              >
                <Edit3 size={14} />
              </button>
              {isAccounting && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (window.confirm('Xóa vĩnh viễn đơn hàng này?')) onDeleteOrder(order.id);
                  }}
                  className="absolute top-3 right-3 z-10 text-gray-300 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              )}

              <button
                type="button"
                onClick={() => openOrderDetail(order.id)}
                className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-left hover:border-emerald-200 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start gap-3 pr-7">
                  <div>
                    <h3 className="font-bold text-gray-800">{order.customer?.name || 'Khách lẻ'}</h3>
                    <p className="text-xs text-gray-500 mt-1">{formatDateTimeLabel(order.date)} ⬚¢�¢���¬�⬚¢ {formatOrderCode(order.id)}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${statusMeta.chipClasses}`}>{statusMeta.label}</span>
                </div>

                <div className="mt-3 text-[11px]">
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                        <p className="font-semibold text-gray-700 leading-5">{itemTypeLabel}</p>
                      </div>
                      <div>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                        <p className="font-semibold text-gray-700 leading-5">{formatNumber(itemCount || 0)} kg</p>
                      </div>
                      <div>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                        <p className="font-semibold text-gray-700 leading-5">{unitPriceLabel}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                    <p className="text-sm font-black text-gray-800">{formatCurrency(order.amount || 0)} ⬚����¢�⬚¬9�</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                    <p className="text-sm font-black text-emerald-700">{formatCurrency(order.appliedAmount || 0)} ⬚����¢�⬚¬9�</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                    <p className={`text-sm font-black ${statusMeta.amountClasses}`}>{formatCurrency(order.outstandingAmount || 0)} ⬚����¢�⬚¬9�</p>
                  </div>
                </div>

                {order.extraExpenseName && (order.customerExtraExpense || 0) > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-blue-600 font-medium">
                    + {order.extraExpenseName} ({formatCurrency(order.customerExtraExpense || 0)} ⬚����¢�⬚¬9�)
                  </div>
                )}
              </button>
            </div>
          );
        })}

        {false && activeOrders.reverse().map(o => {
          const cus = customers.find(c => c.id === o.customerId);
          const createdBy = employees.find(e => e.id === (o.createdByEmpId || o.empId));
          const salesOwner = employees.find(e => e.id === getOrderSalesEmpId(o, customers));
          return (
            <div key={o.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-50 relative group">
              {isAccounting && <button onClick={() => { if(window.confirm('Xóa vĩnh viễn đơn hàng này?')) onDeleteOrder(o.id); }} className="absolute top-3 right-3 text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>}
              <div className="flex justify-between items-start mb-2 pr-6">
                <h3 className="font-bold text-gray-800">{cus?.name}</h3>
                <span className="text-sm text-gray-600">Tổng cộng</span>
              </div>
              <div className="text-xs text-gray-500 mb-3 border-b border-gray-50 pb-3">
                {formatTime(o.date)} {new Date(o.date).toLocaleDateString('vi-VN')} - HD{o.id.substring(o.id.length-6).toUpperCase()}<br/>
                T⬚¡�⬚º�⬚¡o b⬚¡�⬚»�⬦¸i {createdBy?.name || 'Admin'}
                <span className="block mt-1">NVKD ph⬚¡�⬚»�⬚¥ tr�⬞����⬚¡ch: {salesOwner?.name || 'Ch⬚��� �⬚°a g�⬞����⬚¡n'}</span>
                {o.extraExpenseName && o.customerExtraExpense > 0 && <span className="block mt-1 text-blue-600 font-medium">+ {o.extraExpenseName} ({formatCurrency(o.customerExtraExpense)})</span>}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Tổng cộng</span>
                <div className="text-right">
                  <span className="text-base font-black text-gray-800 block">{formatCurrency(o.amount)} ⬚����¢�⬚¬9�</span>
                <span className="text-sm text-gray-600">Tổng cộng</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="fixed bottom-[70px] right-4 left-4 pointer-events-none flex justify-center">
         <button onClick={openAddOrderModal} className="pointer-events-auto bg-blue-600 text-white rounded-full px-6 py-3 font-bold shadow-lg flex items-center gap-2 hover:bg-blue-700">
            <Plus size={18}/> B�⬞����⬚¡n h�⬞����⬚ ng
         </button>
      </div>

⬚¯�⬚»�⬚¿      {selectedOrder && (() => {
        const statusMeta = getOrderStatusMeta(selectedOrder);
        const totalReceivable = orderSharePreviewMeta?.totalReceivable || 0;
        const previousDebt = orderSharePreviewMeta?.previousDebt || 0;
        const transferProfile = orderSharePreviewMeta?.transferProfile || getInvoiceTransferProfile(currentCompany);
        const transferMemo = orderSharePreviewMeta?.transferMemo || buildOrderTransferMemo(selectedOrder);
        const qrUrl = resolvedOrderShareQrUrl || orderSharePreviewMeta?.qrUrl || '';
        const companyName = orderSharePreviewMeta?.companyName || currentCompany?.name || 'HD Manager';
        const companyMark = orderSharePreviewMeta?.companyMark || buildCompanyMonogram(companyName);
        const companyLogoUrl = resolvedOrderShareLogoUrl || orderSharePreviewMeta?.companyLogoUrl || '';
        const buyerAddress = orderSharePreviewMeta?.buyerAddress || selectedOrder.customer?.address || 'Ch⬚��� �⬚°a c�⬞����⬚³ ⬚����¢�⬚¬9�⬚¡�⬚»�¢�⬚¬¹a ch⬚¡�⬚»�¢�⬚¬°';
        const totalQuantity = orderSharePreviewMeta?.totalQuantity || (selectedOrder.items || []).reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        const sharePreviewCard = (
          <div ref={orderShareCardRef} className="mx-auto max-w-[430px] rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-[0.95fr_1.2fr] gap-3 items-stretch">
              <div className="min-h-[152px] rounded-[22px] bg-slate-50 px-4 py-4 flex flex-col items-center justify-center text-center">
                {showOrderShareLogo && (
                  companyLogoUrl ? (
                    <img crossOrigin="anonymous" src={companyLogoUrl} alt="Logo doanh nghi⬚¡�⬚»�¢�⬚¬¡p" className="mb-3 w-[72px] h-[72px] rounded-full border-2 border-slate-200 bg-white object-cover" />
                  ) : (
                    <div className="mb-3 w-[72px] h-[72px] rounded-full border-2 border-slate-200 bg-slate-50 flex items-center justify-center text-[24px] font-black text-emerald-600">
                      {companyMark}
                    </div>
                  )
                )}
                <p className="text-[22px] leading-7 font-black tracking-tight text-slate-900">{companyName}</p>
              </div>
              <div className="min-h-[152px] rounded-[22px] bg-slate-50 px-4 py-4 flex flex-col items-center justify-center text-center">
                      <h4 className="font-bold text-gray-800">Chi tiết các phần lương</h4>
                <p className="mt-3 text-[15px] leading-6 font-bold text-slate-700">{formatOrderCode(selectedOrder.id)} - {formatDateTimeLabel(selectedOrder.date)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-1 text-[16px] leading-6 text-slate-900">
              <p><span className="font-bold">Kh�⬞����⬚¡ch:</span> {selectedOrder.customer?.name || 'Kh�⬞����⬚¡ch l⬚¡�⬚º�⬚»'}</p>
              <p><span className="font-bold">⬚����⬚T:</span> {selectedOrder.customer?.phone || 'Ch⬚��� �⬚°a c�⬞����⬚³ s⬚¡�⬚»�¢�⬚¬9� ⬚����¢�⬚¬9�i⬚¡�⬚»�¢�⬚¬¡n tho⬚¡�⬚º�⬚¡i'}</p>
              <p><span className="font-bold">⬚����⬚⬚¡�⬚»�¢�⬚¬¹a ch⬚¡�⬚»�¢�⬚¬°:</span> {buyerAddress}</p>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-400">
              <div className="grid grid-cols-[1.6fr_0.8fr_0.5fr_0.9fr] bg-slate-50 text-[13px] font-black text-slate-900">
                  <div className="w-full border border-amber-200 bg-amber-50 px-3 py-3 rounded-xl text-sm font-bold text-amber-700 flex items-center">Chủ doanh nghiệp</div>
                  <div className="w-full border border-amber-200 bg-amber-50 px-3 py-3 rounded-xl text-sm font-bold text-amber-700 flex items-center">Chủ doanh nghiệp</div>
                <div className="border-r border-dashed border-slate-400 px-3 py-2 text-center">SL</div>
                <div className="px-3 py-2 text-center">TT</div>
              </div>
              {(selectedOrder.items || []).map((item, index) => (
                <div key={`share_preview_${selectedOrder.id}_${index}`} className="grid grid-cols-[1.6fr_0.8fr_0.5fr_0.9fr] text-[13px] text-slate-900 border-t border-dashed border-slate-300">
                  <div className="border-r border-dashed border-slate-400 px-3 py-3 font-semibold text-center">{item.description || `S⬚¡�⬚º�⬚£n ph⬚¡�⬚º�⬚©m ${index + 1}`}</div>
                  <div className="border-r border-dashed border-slate-400 px-3 py-3 text-center">{formatCurrency(parseFloat(item.unitPrice) || 0)}</div>
                  <div className="border-r border-dashed border-slate-400 px-3 py-3 text-center">{formatNumber(parseFloat(item.quantity) || 0)}</div>
                  <div className="px-3 py-3 text-center font-bold">{formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 text-[15px] text-slate-900">
              <div className="flex items-center justify-between"><span className="font-bold">Tr⬚¡�⬚º�⬚£ tr⬚��� �⬚°⬚¡�⬚»�¢�⬚¬ºc</span><span className="font-black">{formatCurrency(selectedOrder.appliedAmount || 0)} ⬚����¢�⬚¬9�</span></div>
              <div className="flex items-center justify-between"><span>C�⬞����⬚²n n⬚¡�⬚»�⬚£ ⬚����¢�⬚¬9�⬚��� �⬚¡n n�⬞����⬚ y</span><span className="font-bold">{formatCurrency(selectedOrder.outstandingAmount || 0)} ⬚����¢�⬚¬9�</span></div>
              <div className="flex items-center justify-between"><span>C�⬞����⬚´ng n⬚¡�⬚»�⬚£ c⬚���¦�⬚©</span><span className="font-bold">{formatCurrency(previousDebt)} ⬚����¢�⬚¬9�</span></div>
              <div className="flex items-center justify-between text-[16px]"><span className="font-black">C�⬞����⬚²n ph⬚¡�⬚º�⬚£i thu</span><span className="font-black">{formatCurrency(totalReceivable)} ⬚����¢�⬚¬9�</span></div>
            </div>

            <div className="my-4 border-t-2 border-slate-900" />

            <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
              <img crossOrigin="anonymous" src={qrUrl} alt="QR chuy⬚¡�⬚»�⬠�����n kho⬚¡�⬚º�⬚£n" className="w-full rounded-2xl border border-slate-200 bg-white" />
              <div className="text-right text-[14px] leading-6 text-slate-900">
                <p className="text-[18px] font-black">{transferProfile.bankName}</p>
                <p className="mt-1 font-bold">{transferProfile.accountName}</p>
                <p className="font-bold">{transferProfile.accountNumber}</p>
                <div className="mt-4 text-left">
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                  <p className="text-[18px] font-black tracking-[0.08em] text-slate-900">{transferMemo}</p>
                </div>
              </div>
            </div>

            <div className="my-4 border-t border-dashed border-slate-400" />

            <div className="text-center text-[13px] leading-6 text-slate-700">
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
            </div>
          </div>
        );

        return (
          <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col animate-in slide-in-from-right">
            <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeOrderDetail} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                  <ChevronLeft size={22} />
                </button>
                <div>
               <h2 className="font-bold text-lg">Tạo Đơn Hàng Mới</h2>
                  <p className="mt-0.5 text-[12px] font-semibold text-slate-500">{formatOrderCode(selectedOrder.id)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Ch⬚¡�⬚»�¢�⬚¬°nh s⬚¡�⬚»�⬚­a h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n"
                  onClick={() => openEditOrderModal(selectedOrder)}
                  className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm shrink-0 hover:bg-blue-100"
                >
                  <Edit3 size={18} />
                </button>
                <button
                  type="button"
                  aria-label="L⬚��� �⬚°u m⬚¡�⬚º�⬚«u h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n"
                  onClick={() => {
                    setOrderShareFileType('image');
                    setOrderShareStatus('');
                    setShowOrderSharePreview(true);
                  }}
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shadow-sm shrink-0 hover:bg-slate-200"
                >
                  <Download size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Chia s⬚¡�⬚º�⬚» h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n"
                  onClick={() => {
                    setOrderShareStatus('');
                    setShowOrderSharePreview(true);
                  }}
                  className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm shrink-0 hover:bg-emerald-100"
                >
                  <Send size={18} />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[20px] leading-6 font-extrabold tracking-tight text-slate-900">{selectedOrder.customer?.name || 'Khách lẻ'}</h3>
                    <p className="mt-1 text-[13px] font-medium leading-5 text-slate-500">{selectedOrder.customer?.phone || 'Chưa có số điện thoại'}</p>
                    <p className="mt-1 text-[13px] font-medium leading-5 text-slate-500">{selectedOrder.customer?.address || 'Chưa có địa chỉ'}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] ${statusMeta.chipClasses}`}>{statusMeta.label}</span>
                </div>
              </div>

              {orderShareStatus && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] leading-5 font-semibold text-emerald-700" role="status">
                  {orderShareStatus}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-lg mb-4">Tạo Khoản Chi</h3>
                  <span className="text-[12px] font-semibold text-slate-400">{(selectedOrder.items || []).length} d�⬞����⬚²ng</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(selectedOrder.items || []).length === 0 && (
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                  )}
                  {(selectedOrder.items || []).map((item, index) => (
                    <div key={`${selectedOrder.id}_${index}`} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] leading-5 font-bold tracking-tight text-slate-900">{item.description || `Sản phẩm ${index + 1}`}</p>
                          <p className="mt-1 text-[12px] leading-5 font-medium text-slate-500">{formatNumber(parseFloat(item.quantity) || 0)} x {formatCurrency(parseFloat(item.unitPrice) || 0)} ⬚����¢�⬚¬9�</p>
                        </div>
                        <p className="text-[15px] leading-5 font-extrabold tracking-tight text-slate-900">{formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))} ⬚����¢�⬚¬9�</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="space-y-3 text-[14px] leading-6 font-medium text-slate-600">
                  <div className="flex items-center justify-between"><span>Gi⬚¡�⬚º�⬚£m gi�⬞����⬚¡</span><strong className="text-gray-800">-{formatCurrency(selectedOrder.discount || 0)} ⬚����¢�⬚¬9�</strong></div>
                  <div className="flex items-center justify-between"><span>Ph⬚¡�⬚»�⬚¥ ph�⬞����⬚­ kh�⬞����⬚¡ch ch⬚¡�⬚»�¢�⬚¬¹u</span><strong className="text-gray-800">{formatCurrency(selectedOrder.customerExtraExpense || 0)} ⬚����¢�⬚¬9�</strong></div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100"><span className="text-[15px] font-extrabold tracking-tight text-slate-900">T⬚¡�⬚»�¢�⬚¬¢ng h�⬞����⬚³a ⬚����¢�⬚¬9�⬚��� �⬚¡n</span><strong className="text-[15px] font-extrabold tracking-tight text-gray-900">{formatCurrency(selectedOrder.amount || 0)} ⬚����¢�⬚¬9�</strong></div>
                  <div className="flex items-center justify-between"><span>⬚����⬚�⬞����⬚£ thu</span><strong className="text-emerald-600">{formatCurrency(selectedOrder.appliedAmount || 0)} ⬚����¢�⬚¬9�</strong></div>
                  <div className="flex items-center justify-between"><span>C�⬞����⬚²n n⬚¡�⬚»�⬚£</span><strong className={`text-[15px] font-extrabold tracking-tight ${statusMeta.amountClasses}`}>{formatCurrency(selectedOrder.outstandingAmount || 0)} ⬚����¢�⬚¬9�</strong></div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-lg mb-4">Tạo Khoản Chi</h3>
                  <span className="text-[12px] font-semibold text-slate-400">{(selectedOrder.paymentHistory || []).length} l⬚¡�⬚º�⬚§n</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(selectedOrder.paymentHistory || []).length === 0 && (
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                  )}
                  {(selectedOrder.paymentHistory || []).map(payment => (
                    <div key={payment.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                  <p className="font-semibold text-gray-800">{payment.note || 'Thu nợ'}</p>
                          <p className="mt-1 text-[12px] leading-5 font-medium text-slate-500">{formatDateLabel(payment.date)} ⬚¢�¢���¬�⬚¢ {getPaymentMethodLabel(payment)} ⬚¢�¢���¬�⬚¢ {getPaymentSourceLabel(payment)}</p>
                        </div>
                        <p className="text-[15px] leading-5 font-extrabold tracking-tight text-emerald-600">{formatCurrency(payment.allocatedToOrder || 0)} ⬚����¢�⬚¬9�</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {showOrderSharePreview && (
              <div className="absolute inset-0 z-20 bg-slate-950/45 backdrop-blur-[1px] flex items-end sm:items-center justify-center px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+96px)] sm:pb-3" onClick={() => setShowOrderSharePreview(false)}>
                <div className="w-full max-w-[480px] max-h-[92vh] overflow-hidden rounded-[28px] border border-white/60 bg-slate-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
                    <div>
            <h3 className="font-bold text-lg mb-4">Tạo Khoản Chi</h3>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                    </div>
                    <button type="button" onClick={() => setShowOrderSharePreview(false)} className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="max-h-[calc(92vh-74px)] overflow-y-auto p-3 sm:p-4 space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowOrderShareLogo((value) => !value)}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-bold transition-colors ${showOrderShareLogo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${showOrderShareLogo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {showOrderShareLogo ? '⬚����⬚ang hi⬚¡�⬚»�¢�⬚¬¡n logo' : '⬚����⬚ang ⬚¡�⬚º�⬚©n logo'}
                        </button>
                      </div>
                      <div className="inline-flex items-center gap-1 self-start rounded-2xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setOrderShareStatus('');
                            setOrderShareFileType('pdf');
                          }}
                          className={`rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${orderShareFileType === 'pdf' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOrderShareStatus('');
                            setOrderShareFileType('image');
                          }}
                          className={`rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${orderShareFileType === 'image' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                        >
                          H�⬞����⬚¬nh ⬚¡�⬚º�⬚£nh
                        </button>
                      </div>
                    </div>

                    {sharePreviewCard}

                    {orderShareStatus && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] leading-5 font-semibold text-emerald-700" role="status">
                        {orderShareStatus}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pb-[calc(env(safe-area-inset-bottom)+8px)]">
                      <button
                        type="button"
                        onClick={() => handleShareOrder()}
                        disabled={isOrderShareExporting || !isOrderShareReady}
                        className="rounded-2xl bg-emerald-500 text-white px-4 py-3 text-sm font-bold hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {!isOrderShareReady ? `⬚����⬚ang chu⬚¡�⬚º�⬚©n b⬚¡�⬚»�¢�⬚¬¹ ${getOrderShareFormatLabel(orderShareFileType)}...` : isOrderShareExporting ? '⬚����⬚ang xu⬚¡�⬚º�⬚¥t...' : `Chia s⬚¡�⬚º�⬚» ${getOrderShareFormatLabel(orderShareFileType)}`}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadOrderTemplate}
                        disabled={isOrderShareExporting || !isOrderShareReady}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {!isOrderShareReady ? `⬚����⬚ang chu⬚¡�⬚º�⬚©n b⬚¡�⬚»�¢�⬚¬¹ ${getOrderShareFormatLabel(orderShareFileType)}...` : isOrderShareExporting ? '⬚����⬚ang xu⬚¡�⬚º�⬚¥t...' : `L⬚��� �⬚°u ${getOrderShareFormatLabel(orderShareFileType)}`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {showAddOrder && (
         <div className="fixed inset-0 bg-gray-50 z-[80] flex flex-col animate-in slide-in-from-bottom">
            <header className="bg-blue-600 text-white p-4 flex items-center justify-between shrink-0 shadow-sm">
               <h2 className="font-bold text-lg">{isEditingOrder ? 'Ch⬚¡�⬚»�¢�⬚¬°nh s⬚¡�⬚»�⬚­a ⬚����¢�⬚¬9�⬚��� �⬚¡n h�⬞����⬚ ng' : 'T⬚¡�⬚º�⬚¡o ⬚����⬚⬚��� �⬚¡n H�⬞����⬚ ng M⬚¡�⬚»�¢�⬚¬ºi'}</h2>
               <button onClick={closeAddOrderModal} className="hover:bg-blue-700 p-1 rounded-full"><X size={24}/></button>
            </header>
            
            <div className="p-4 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+128px)]">
               <form id="order-form" onSubmit={handleAddSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
                {errorMsg && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 font-medium border border-red-100">{errorMsg}</div>}
                <input ref={bulkOrderImageInputRef} type="file" accept="image/*" capture="environment" onChange={handleNotebookImageUpload} className="hidden" />

                {isEditingOrder && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                    <p className="text-sm font-bold text-amber-800">B⬚¡�⬚º�⬚¡n ⬚����¢�⬚¬9�ang ch⬚¡�⬚»�¢�⬚¬°nh s⬚¡�⬚»�⬚­a {formatOrderCode(editingOrderId)}</p>
                    <p className="text-xs leading-5 font-medium text-amber-700">
                      B⬚¡�⬚º�⬚¡n c�⬞����⬚³ th⬚¡�⬚»�⬠����� ch⬚¡�⬚»�¢�⬚¬°nh l⬚¡�⬚º�⬚¡i c⬚¡�⬚º�⬚£ th�⬞����⬚´ng tin ⬚����¢�⬚¬9�⬚��� �⬚¡n h�⬞����⬚ ng v�⬞����⬚  kho⬚¡�⬚º�⬚£n ⬚����¢�⬚¬9��⬞����⬚£ thu g⬚¡�⬚º�⬚¯n v⬚¡�⬚»�¢�⬚¬ºi ⬚����¢�⬚¬9�⬚��� �⬚¡n n�⬞����⬚ y. Nh⬚¡�⬚»�⬚¯ng kho⬚¡�⬚º�⬚£n thu kh�⬞����⬚¡c trong l⬚¡�⬚»�¢�⬚¬¹ch s⬚¡�⬚»�⬚­ v⬚¡�⬚º�⬚«n ⬚����¢�⬚¬9�⬚��� �⬚°⬚¡�⬚»�⬚£c gi⬚¡�⬚»�⬚¯ nguy�⬞����⬚ªn.
                    </p>
                  </div>
                )}

                {!isEditingOrder && (
                <div className="bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
            <h3 className="font-bold text-lg mb-4">Tạo Khoản Chi</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-5">
                        Ch⬚¡�⬚»�⬚¥p ⬚¡�⬚º�⬚£nh s⬚¡�⬚»�¢�⬚¬¢ b�⬞����⬚¡n h�⬞����⬚ ng, AI s⬚¡�⬚º�⬚½ t⬚¡�⬚º�⬚¡ch t�⬞����⬚ªn kh�⬞����⬚¡ch, m⬚¡�⬚º�⬚·t h�⬞����⬚ ng, s⬚¡�⬚»�¢�⬚¬9� kg v�⬞����⬚  ⬚����¢�⬚¬9�⬚��� �⬚¡n gi�⬞����⬚¡ th�⬞����⬚ nh t⬚¡�⬚»�⬚«ng ⬚����¢�⬚¬9�⬚��� �⬚¡n nh�⬞����⬚¡p ⬚����¢�⬚¬9�⬚¡�⬚»�⬠����� k⬚¡�⬚º�⬚¿ to�⬞����⬚¡n r⬚¡�⬚º�⬚  so�⬞����⬚¡t r⬚¡�⬚»�¢�⬚¬&�Si t⬚¡�⬚º�⬚¡o h�⬞����⬚ ng lo⬚¡�⬚º�⬚¡t.
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                      {isBulkOrderScanning ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                      onClick={() => bulkOrderImageInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
                    >
                      {isBulkOrderScanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                      {isBulkOrderScanning ? 'AI đang đọc ảnh...' : 'Chụp / chọn ảnh sổ sách'}
                    </button>
                    <button
                      type="button"
                      disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                      onClick={handleAddBulkDraft}
                      className="hidden"
                    >
                      <Plus size={16} />
                      Th�⬞����⬚ªm nh�⬞����⬚¡p tay
                    </button>
                    <button
                      type="button"
                      disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                      onClick={handleLoadBulkDraftsFromDispatch}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 disabled:opacity-60"
                    >
                      <ClipboardList size={16} />
                      L⬚¡�⬚º�⬚¥y t⬚¡�⬚»�⬚« phi⬚¡�⬚º�⬚¿u xu⬚¡�⬚º�⬚¥t kho
                    </button>
                  </div>

                  {bulkOrderStatus && (
                    <div
                      className={`rounded-2xl border px-3 py-2 text-xs leading-5 font-medium ${
                        /d⬚¡�⬚»�⬚«ng|kh�⬞����⬚´ng|ch⬚��� �⬚°a/i.test(bulkOrderStatus)
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {bulkOrderStatus}
                    </div>
                  )}

                  {bulkOrderDrafts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{bulkOrderDrafts.length} ⬚����¢�⬚¬9�⬚��� �⬚¡n nh�⬞����⬚¡p ch⬚¡�⬚»�⬚ r⬚¡�⬚º�⬚  so�⬞����⬚¡t</p>
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                        </div>
                        <button
                          type="button"
                          disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                          onClick={handleSubmitBulkOrders}
                          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 disabled:opacity-60"
                        >
                          {isBulkOrderSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          T⬚¡�⬚º�⬚¡o {bulkOrderDrafts.length} ⬚����¢�⬚¬9�⬚��� �⬚¡n
                        </button>
                      </div>

                      {bulkOrderDrafts.map((draft, draftIndex) => {
                        const draftTotal = (draft.items || []).reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseLooseMoneyValue(item.unitPrice) || 0)), 0);
                        const matchedCustomer = draft.customerId ? customers.find((customer) => customer.id === draft.customerId) : null;
                        return (
                          <div key={draft.localId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-slate-900">⬚����⬚⬚��� �⬚¡n nh�⬞����⬚¡p {draftIndex + 1}</p>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  {matchedCustomer ? `Đã khớp khách cũ: ${matchedCustomer.name}` : 'Có thể tạo khách mới nếu chưa có trong hệ thống.'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveBulkDraft(draft.localId)}
                                className="rounded-full bg-rose-50 p-2 text-rose-500 hover:bg-rose-100"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <input
                                  type="text"
                                  value={draft.customerName}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'customerName', capitalizeFirst(e.target.value))}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                />
                              </div>
                              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <select
                                  value={draft.customerId}
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    const selectedCustomer = customers.find((customer) => customer.id === selectedId);
                                    setBulkOrderDrafts((prev) => prev.map((item) => item.localId === draft.localId ? {
                                      ...item,
                                      customerId: selectedId,
                                      customerName: selectedCustomer?.name || item.customerName,
                                      salesEmpId: selectedCustomer?.empId || item.salesEmpId
                                    } : item));
                                  }}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                >
          <option value="">Tất cả</option>
                                  {customers.map((customer) => (
                                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {!isSales && (
                              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <select
                                  value={draft.salesEmpId}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'salesEmpId', e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                >
          <option value="">Tất cả</option>
                                  {salesEmployees.map((salesEmployee) => (
                                    <option key={salesEmployee.id} value={salesEmployee.id}>{salesEmployee.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <button
                                  type="button"
                                  onClick={() => handleAddBulkDraftItem(draft.localId)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600"
                                >
                                  <Plus size={12} />
                                  Th�⬞����⬚ªm d�⬞����⬚²ng
                                </button>
                              </div>

                              {(draft.items || []).map((item, itemIndex) => (
                                <div key={`${draft.localId}_${itemIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-slate-500">D�⬞����⬚²ng {itemIndex + 1}</span>
                                    {(draft.items || []).length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveBulkDraftItem(draft.localId, itemIndex)}
                                        className="rounded-full bg-rose-100 p-1.5 text-rose-500"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                  <select
                                    value={item.productId || ''}
                                    onChange={(e) => handleBulkDraftItemProductChange(draft.localId, itemIndex, e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                  >
          <option value="">Tất cả</option>
                                    {activeProducts.map((product) => (
                                      <option key={product.id} value={product.id}>{product.name} ({formatCurrency(product.sellingPrice)} ⬚����¢�⬚¬9�)</option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={item.description || ''}
                                    onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'description', capitalizeFirst(e.target.value))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                  />
                                  {parseLooseQuantityValue(item.dispatchWeight) > 0 ? (
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                                          <p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(parseLooseQuantityValue(item.dispatchWeight))} kg</p>
                                        </div>
                                        <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={item.shrinkageKg ?? ''}
                                            onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'shrinkageKg', e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                            placeholder="0"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={item.quantity}
                                            onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'quantity', e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                          />
                                        </div>
                                        <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                          <input
                                            type="tel"
                                            value={formatInputCurrency(item.unitPrice)}
                                            onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'unitPrice', parseInputCurrency(e.target.value))}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.quantity}
                                        onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'quantity', e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                      />
                                      <input
                                        type="tel"
                                        value={formatInputCurrency(item.unitPrice)}
                                        onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'unitPrice', parseInputCurrency(e.target.value))}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <input
                                  type="date"
                                  value={draft.date}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'date', e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <input
                                  type="text"
                                  value={draft.note || ''}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'note', capitalizeFirst(e.target.value))}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <input
                                  type="tel"
                                  value={formatInputCurrency(draft.upfrontPayment)}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'upfrontPayment', parseInputCurrency(e.target.value))}
                                  className="w-full rounded-xl border border-orange-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-orange-400"
                  placeholder="Nhập hoặc chọn loại chi phí"
                                />
                              </div>
                              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                                <select
                                  value={draft.paymentMethod}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'paymentMethod', e.target.value)}
                                  className="w-full rounded-xl border border-orange-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-orange-400"
                                >
          <option value="">Tất cả</option>
          <option value="">Tất cả</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                    <span>Mở chi tiết</span>
                              <strong className="text-sm font-extrabold text-slate-900">{formatCurrency(draftTotal)} ⬚����¢�⬚¬9�</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}
                
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                      <input type="text" value={searchCus} onChange={e => { setSearchCus(e.target.value); setShowCusDropdown(true); setNewOrder({...newOrder, customerId: ''}); }} onFocus={() => setShowCusDropdown(true)} className="w-full border border-gray-300 p-2.5 pl-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Tìm tên khách hàng..." />
                      {showCusDropdown && (
                        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {filteredCustomers.map(c => (
                            <li key={c.id} onClick={() => { setNewOrder({...newOrder, customerId: c.id}); setSearchCus(c.name); setShowCusDropdown(false); }} className="p-3 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-50">
                              <span className="font-semibold block text-gray-800">{c.name}</span><span className="text-[10px] text-gray-500">{c.phone || c.address}</span>
                            </li>
                          ))}
                          {filteredCustomers.length === 0 && <li className="p-3 text-sm text-gray-500 text-center">Không tìm thấy</li>}
                        </ul>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowQuickAddCus(true)} className="bg-emerald-50 text-emerald-600 px-3.5 py-2.5 rounded-xl border border-emerald-200 flex items-center justify-center font-bold hover:bg-emerald-100 transition-colors shrink-0">
                      <Plus size={20} />
                    </button>
                  </div>
                  {newOrder.customerId && (
                     <div className="mt-3 p-2.5 bg-blue-50 border border-blue-100 rounded-lg flex justify-between items-center">
                        <span className="text-sm font-semibold text-blue-800 flex items-center gap-2"><CheckCircle size={16}/> ⬚����⬚�⬞����⬚£ ch⬚¡�⬚»�⬚n: {customers.find(c => c.id === newOrder.customerId)?.name}</span>
                        <button type="button" onClick={() => {setNewOrder({...newOrder, customerId: ''}); setSearchCus('');}}><X size={16} className="text-blue-500 hover:text-blue-700"/></button>
                     </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-3">
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                    <button type="button" onClick={handleAddItem} className="text-xs text-blue-600 font-semibold flex items-center bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"><Plus size={14} className="mr-1"/> Thêm dòng</button>
                  </div>
                  <div className="space-y-3">
                    {newOrder.items.map((item, index) => (
                      <div key={index} className="relative bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {newOrder.items.length > 1 && <button type="button" onClick={() => handleRemoveItem(index)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1.5 hover:bg-red-200 shadow-sm"><X size={14}/></button>}
                        <select value={item.productId || ''} onChange={e=>handleItemProductChange(index, e.target.value)} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none bg-white mb-2 focus:ring-2 focus:ring-blue-500">
          <option value="">Tất cả</option>
                          {activeProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.sellingPrice)})</option>)}
                        </select>
                        {item.description && <p className="text-sm font-semibold text-gray-700 mb-2">{item.description}</p>}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input required type="number" step="0.01" placeholder="Số lượng" value={item.quantity} onChange={e=>handleItemChange(index, 'quantity', e.target.value)} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                          <input required type="tel" placeholder="Giá bán (VNĐ)" value={formatInputCurrency(item.unitPrice)} onChange={e=>handleItemChange(index, 'unitPrice', parseInputCurrency(e.target.value))} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="text-right text-xs text-blue-600 font-semibold mt-3 pt-3 border-t border-dashed border-gray-200">T⬚¡�⬚º�⬚¡m t�⬞����⬚­nh: {formatCurrency((parseFloat(item.quantity)||0) * (parseFloat(item.unitPrice)||0))} ⬚����¢�⬚¬9�</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                  <div className="flex justify-between items-center mb-2"><span className="text-sm text-gray-600">T⬚¡�⬚»�¢�⬚¬¢ng ti⬚¡�⬚»�⬚n h�⬞����⬚ ng:</span><span className="font-semibold">{formatCurrency(subTotal)} ⬚����¢�⬚¬9�</span></div>
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100">
                <span className="text-sm text-gray-600">Tổng cộng</span>
                    <input type="tel" value={formatInputCurrency(newOrder.discount)} onChange={e=>setNewOrder({...newOrder, discount: parseInputCurrency(e.target.value)})} className="w-1/2 border border-gray-200 p-2 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-blue-500" placeholder="0 ₫" />
                  </div>

                  <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs font-bold uppercase mb-1">Nhắc chấm công</p>
                    <div className="flex gap-2 mb-2">
                      <input type="text" placeholder="Tên phí (VD: Ship...)" value={newOrder.extraExpenseName} onChange={e=>setNewOrder({...newOrder, extraExpenseName: capitalizeFirst(e.target.value)})} className="flex-1 border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                      <input type="tel" placeholder="Số tiền" value={formatInputCurrency(newOrder.extraExpenseAmount)} onChange={e=>setNewOrder({...newOrder, extraExpenseAmount: parseInputCurrency(e.target.value)})} className="w-1/3 border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    {parseFloat(newOrder.extraExpenseAmount) > 0 && (
                      <select value={newOrder.extraExpensePayer} onChange={e=>setNewOrder({...newOrder, extraExpensePayer: e.target.value})} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none bg-white text-emerald-700 font-medium focus:ring-2 focus:ring-emerald-500">
          <option value="">Tất cả</option>
          <option value="">Tất cả</option>
          <option value="">Tất cả</option>
                      </select>
                    )}
                  </div>

                  <div className="flex justify-between items-center mb-5 bg-blue-50 p-3 rounded-xl border border-blue-100">
                <span className="text-sm text-gray-600">Tổng cộng</span>
                    <span className="text-2xl font-black text-blue-600">{formatCurrency(totalAmount)} ⬚����¢�⬚¬9�</span>
                  </div>

                  {isEditingOrder ? (
                    <div className="bg-orange-50 p-3.5 rounded-xl border border-orange-100 mb-4">
                    <p className="text-xs font-bold text-orange-700 mb-2 flex items-center"><DollarSign size={14} className="mr-1"/> Khách trả trước / Đặt cọc</p>
                    <input type="tel" value={formatInputCurrency(newOrder.upfrontPayment)} onChange={e=>setNewOrder({...newOrder, upfrontPayment: parseInputCurrency(e.target.value)})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm mb-2 outline-none focus:ring-2 focus:ring-orange-400 bg-white" placeholder="Nhập số tiền đã nhận..." />
                      {parseFloat(newOrder.upfrontPayment) > 0 && (
                        <select value={newOrder.paymentMethod} onChange={e=>setNewOrder({...newOrder, paymentMethod: e.target.value})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                        <option>Chuyển khoản</option><option>Tiền mặt</option><option>Tài xế thu hộ</option>
                        </select>
                      )}
                      {parseLooseMoneyValue(newOrder.lockedCollectedAmount) > 0 && (
                        <p className="mt-2 text-[11px] leading-5 text-orange-700">
                          ⬚����⬚⬚��� �⬚¡n n�⬞����⬚ y ⬚����¢�⬚¬9�ang c�⬞����⬚³ th�⬞����⬚ªm {formatCurrency(newOrder.lockedCollectedAmount)} ⬚����¢�⬚¬9� t⬚¡�⬚»�⬚« c�⬞����⬚¡c kho⬚¡�⬚º�⬚£n thu kh�⬞����⬚¡c trong l⬚¡�⬚»�¢�⬚¬¹ch s⬚¡�⬚»�⬚­. Ph⬚¡�⬚º�⬚§n ⬚����¢�⬚¬9��⬞����⬚³ v⬚¡�⬚º�⬚«n ⬚����¢�⬚¬9�⬚��� �⬚°⬚¡�⬚»�⬚£c gi⬚¡�⬚»�⬚¯ nguy�⬞����⬚ªn.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-orange-50 p-3.5 rounded-xl border border-orange-100 mb-4">
                    <p className="text-xs font-bold text-orange-700 mb-2 flex items-center"><DollarSign size={14} className="mr-1"/> Khách trả trước / Đặt cọc</p>
                    <input type="tel" value={formatInputCurrency(newOrder.upfrontPayment)} onChange={e=>setNewOrder({...newOrder, upfrontPayment: parseInputCurrency(e.target.value)})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm mb-2 outline-none focus:ring-2 focus:ring-orange-400 bg-white" placeholder="Nhập số tiền đã nhận..." />
                      {parseFloat(newOrder.upfrontPayment) > 0 && (
                        <select value={newOrder.paymentMethod} onChange={e=>setNewOrder({...newOrder, paymentMethod: e.target.value})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                        <option>Chuyển khoản</option><option>Tiền mặt</option><option>Tài xế thu hộ</option>
                        </select>
                      )}
                    </div>
                  )}
                  <div className="space-y-1">
                <span className="text-sm text-gray-600">Tổng cộng</span>
                    <input required type="date" value={newOrder.date} onChange={e=>setNewOrder({...newOrder, date: e.target.value})} className="w-full border border-gray-300 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  </div>
                </div>
               </form>
            </div>

            <div className="bg-white p-4 border-t border-gray-100 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] shrink-0 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              <div className="max-w-lg mx-auto">
                <button type="submit" form="order-form" className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all active:scale-[0.98]">{isEditingOrder ? 'L⬚��� �⬚°u thay ⬚����¢�⬚¬9�⬚¡�⬚»�¢�⬚¬¢i' : 'X�⬞����⬚¡c Nh⬚¡�⬚º�⬚­n T⬚¡�⬚º�⬚¡o ⬚����⬚⬚��� �⬚¡n H�⬞����⬚ ng'}</button>
              </div>
            </div>

            {showQuickAddCus && (
              <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-lg mb-4">Tạo Khoản Chi</h3>
                  <form onSubmit={handleQuickAddCustomer} className="space-y-4">
              <input required type="text" value={newCus.name} onChange={e=>setNewCus({...newCus, name: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Tên khách hàng/Công ty" />
              <input required type="tel" value={newCus.phone} onChange={e=>setNewCus({...newCus, phone: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Số điện thoại" />
              <input type="text" value={newCus.address} onChange={e=>setNewCus({...newCus, address: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Địa chỉ giao hàng" />
                    <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                <input type="text" value={newCus.customerGroup} onChange={e=>setNewCus({...newCus, customerGroup: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Ví dụ: Đại lý, VIP, Tạp hóa" />
                    </div>
                    {!isSales && (
                      <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                        <select required value={newCus.empId} onChange={e=>setNewCus({...newCus, empId: e.target.value})} className="w-full border p-3 rounded-xl outline-none bg-white text-sm">
          <option value="">Tất cả</option>
                          {salesEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={()=>setShowQuickAddCus(false)} className="flex-1 bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold transition-colors">Hủy</button>
                <button type="submit" className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold">Lưu</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
         </div>
      )}
    </div>
  );
}