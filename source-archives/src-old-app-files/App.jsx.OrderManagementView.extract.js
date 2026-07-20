function OrderManagementView({ isAccounting, employee, employees, customers, orders, payments, products, onAddOrder, onToggleArchiveOrder, onDeleteOrder, onAddPayment, onAddCustomer, onAddExpense, searchKeyword: externalSearchKeyword, setSearchKeyword: setExternalSearchKeyword, showSearchBox: externalShowSearchBox, setShowSearchBox: setExternalShowSearchBox, showFilterPanel: externalShowFilterPanel, setShowFilterPanel: setExternalShowFilterPanel }) {
  const [showAddOrder, setShowAddOrder] = useState(false); 
  const [showQuickAddCus, setShowQuickAddCus] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderShareStatus, setOrderShareStatus] = useState('');
  const [tab, setTab] = useState('all');
  const [localOrderSearchKeyword, setLocalOrderSearchKeyword] = useState('');
  const [localShowSearchBox, setLocalShowSearchBox] = useState(false);
  const [localShowFilterPanel, setLocalShowFilterPanel] = useState(false);
  const [searchCus, setSearchCus] = useState('');
  const [showCusDropdown, setShowCusDropdown] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const isSales = isSalesPosition(employee?.position);
  const salesEmployees = employees ? employees.filter(e => isSalesPosition(e.position)) : [];
  const bulkOrderImageInputRef = useRef(null);
  const createEmptyOrderItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: '' });
  const getDefaultSalesEmpId = () => (isSales ? employee?.id || '' : salesEmployees[0]?.id || '');
  const createSingleOrderState = () => ({
    customerId: '',
    items: [createEmptyOrderItem()],
    discount: '',
    extraExpenseName: '',
    extraExpenseAmount: '',
    extraExpensePayer: 'buyer',
    date: getTodayString(),
    upfrontPayment: '',
    paymentMethod: 'Chuyển khoản'
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

  const activeOrders = orders.filter(o => !o.isArchived);
  const customerLedgerMap = useMemo(() => Object.fromEntries(
    customers.map(customer => [customer.id, buildCustomerLedger(customer.id, orders, payments)])
  ), [customers, orders, payments]);
  const filteredCustomers = customers.filter(c => (c.name || '').toLowerCase().includes(searchCus.toLowerCase()) || (c.phone || '').includes(searchCus));
  const activeProducts = useMemo(() => products.filter(product => !product.isArchived), [products]);
  const orderViewModels = useMemo(() => Object.fromEntries(
    activeOrders.map(order => {
      const customer = customers.find(c => c.id === order.customerId);
      const ledger = customerLedgerMap[order.customerId];
      const ledgerOrder = ledger?.orders.find(item => item.id === order.id);
      const createdBy = employees.find(e => e.id === (order.createdByEmpId || order.empId));
      const salesOwner = employees.find(e => e.id === getOrderSalesEmpId(order, customers));
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
  ), [activeOrders, customers, customerLedgerMap, employees]);
  const displayOrders = useMemo(() => {
    const keyword = orderSearchKeyword.trim().toLowerCase();
    const source = activeOrders
      .map(order => orderViewModels[order.id] || order)
      .filter(order => tab === 'pending' ? (order.outstandingAmount || 0) > 0 : true)
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
  }, [activeOrders, orderViewModels, orderSearchKeyword, products, tab]);
  const selectedOrder = useMemo(() => selectedOrderId ? orderViewModels[selectedOrderId] || null : null, [selectedOrderId, orderViewModels]);

  useEffect(() => {
    if (selectedOrderId && !orderViewModels[selectedOrderId]) {
      closeOrderDetail();
    }
  }, [selectedOrderId, orderViewModels]);
  
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
    setOrderShareStatus('');
  };

  const closeOrderDetail = () => {
    setSelectedOrderId(null);
    setOrderShareStatus('');
  };

  const getOrderStatusMeta = (order) => {
    if ((order?.outstandingAmount || 0) > 0) {
      return {
        label: 'Còn nợ',
        chipClasses: 'bg-amber-50 text-amber-700',
        amountClasses: 'text-orange-600'
      };
    }

    return {
      label: 'Đã thanh toán',
      chipClasses: 'bg-emerald-50 text-emerald-700',
      amountClasses: 'text-emerald-600'
    };
  };

  const buildOrderShareText = (order) => {
    if (!order) return '';

    const itemLines = (order.items || []).map((item, index) => {
      const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
      return `${index + 1}. ${item.description || 'Sản phẩm'} - ${formatNumber(parseFloat(item.quantity) || 0)} x ${formatCurrency(parseFloat(item.unitPrice) || 0)} đ = ${formatCurrency(lineTotal)} đ`;
    });

    const textLines = [
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `Khách hàng: ${order.customer?.name || 'Khách lẻ'}`,
      `Ngày lập: ${formatDateTimeLabel(order.date)}`,
      `Nhân viên kinh doanh: ${order.salesOwner?.name || 'Chưa gán'}`,
      `Tạo bởi: ${order.createdBy?.name || 'Hệ thống'}`,
      '',
      'Danh sách hàng hóa:'
    ];

    if (itemLines.length > 0) textLines.push(...itemLines);
    else textLines.push('- Chưa có chi tiết sản phẩm');

    textLines.push(
      '',
      `Tổng tiền hàng: ${formatCurrency((order.items || []).reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0))} đ`,
      `Giảm giá: ${formatCurrency(order.discount || 0)} đ`
    );

    if (order.customerExtraExpense > 0 || order.extraExpenseName) {
      textLines.push(`Phụ phí khách chịu${order.extraExpenseName ? ` (${order.extraExpenseName})` : ''}: ${formatCurrency(order.customerExtraExpense || 0)} đ`);
    }

    textLines.push(
      `Tổng hóa đơn: ${formatCurrency(order.amount || 0)} đ`,
      `Đã thanh toán: ${formatCurrency(order.appliedAmount || 0)} đ`,
      `Còn nợ: ${formatCurrency(order.outstandingAmount || 0)} đ`
    );

    if ((order.paymentHistory || []).length > 0) {
      textLines.push('', 'Lịch sử thanh toán gắn với đơn:');
      order.paymentHistory.forEach((payment, index) => {
        textLines.push(`${index + 1}. ${formatDateLabel(payment.date)} - ${getPaymentMethodLabel(payment)} - ${formatCurrency(payment.allocatedToOrder || 0)} đ`);
      });
    }

    return textLines.join('\n');
  };

  const resolveShareStatusMessage = (result, channel) => {
    if (result.status === 'shared') {
      if (channel === 'native') return 'Đã mở bảng chia sẻ của máy. Bạn có thể chọn ứng dụng muốn gửi cho khách.';
      return `Đã mở bảng chia sẻ. Hãy chọn ${getShareChannelLabel(channel)} nếu máy đã cài ứng dụng đó.`;
    }
    if (result.status === 'copied') {
      if (channel === 'native') return 'Máy chưa hỗ trợ mở bảng chia sẻ trực tiếp. Nội dung đã được sao chép để bạn gửi thủ công.';
      return `Nội dung đã được sao chép. Bạn có thể dán vào ${getShareChannelLabel(channel)} để gửi cho khách.`;
    }
    if (result.status === 'cancelled') return 'Bạn đã đóng bảng chia sẻ.';
    return 'Thiết bị này chưa hỗ trợ chia sẻ trực tiếp. Bạn có thể dùng nút sao chép hoặc lưu file.';
  };

  const handleShareOrder = async (channel = 'native') => {
    if (!selectedOrder) return;
    const title = `${formatOrderCode(selectedOrder.id)} - ${selectedOrder.customer?.name || 'Hóa đơn'}`;
    const result = await shareTextContent({
      title,
      text: buildOrderShareText(selectedOrder),
      dialogTitle: channel === 'native' ? 'Chia sẻ hóa đơn' : `Chia sẻ qua ${getShareChannelLabel(channel)}`
    });
    setOrderShareStatus(resolveShareStatusMessage(result, channel));
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
        const quantity = parseLooseQuantityValue(item.quantity);
        const unitPrice = parseLooseMoneyValue(item.unitPrice);
        return {
          ...item,
          productId: item.productId || '',
          description,
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
    const selectedCustomer = draft.customerId ? customers.find((customer) => customer.id === draft.customerId) : null;
    if (selectedCustomer) {
      return { customerId: selectedCustomer.id, customer: selectedCustomer };
    }

    const matchedCustomer = typedCustomerName
      ? findBestEntityMatch(typedCustomerName, customers, (customer) => customer.name)
      : null;
    if (matchedCustomer) {
      return { customerId: matchedCustomer.id, customer: matchedCustomer };
    }

    if (!typedCustomerName) {
      throw new Error('Vui lòng nhập tên khách hàng cho đơn nháp này.');
    }

    const salesEmpId = draft.salesEmpId || getDefaultSalesEmpId();
    if (!salesEmpId) {
      throw new Error(`Khách "${typedCustomerName}" chưa có nhân viên kinh doanh phụ trách. Bạn hãy chọn NVKD trước khi tạo đơn.`);
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

  const submitOrderDraft = async (draft, { allowDescriptionOnly = false } = {}) => {
    const validItems = normalizeOrderItemsForSubmit(draft.items, { allowDescriptionOnly });
    if (validItems.length === 0) {
      throw new Error(allowDescriptionOnly
        ? 'Mỗi đơn nháp cần ít nhất 1 dòng hàng có tên/mặt hàng, số lượng và đơn giá.'
        : 'Vui lòng nhập ít nhất 1 sản phẩm hợp lệ.');
    }

    const { customerId, customer } = await resolveCustomerForOrderDraft(draft);
    const empId = employee?.id || 'admin';
    const salesEmpId = customer?.empId || draft.salesEmpId || (isSales ? employee?.id : null);
    if (!salesEmpId) {
      throw new Error('Khách hàng này chưa có nhân viên kinh doanh phụ trách.');
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

    await onAddOrder(empId, {
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
    });

    const upfront = parseLooseMoneyValue(draft.upfrontPayment);
    if (upfront > 0 && onAddPayment) {
      await onAddPayment({
        customerId,
        amount: upfront,
        note: `Khách thanh toán trước - ${draft.paymentMethod || 'Chuyển khoản'}`,
        date: draft.date || getTodayString(),
        method: draft.paymentMethod || 'Chuyển khoản',
        sourceType: 'order_upfront',
        sourceLabel: 'Khách thanh toán khi lên đơn'
      });
    }

    if (sellerDraftExpense > 0 && onAddExpense) {
      await onAddExpense({
        sourceType: 'order_extra_expense',
        category: 'Chi phí khác',
        amount: sellerDraftExpense,
        note: `Phụ phí đơn hàng (${capitalizeFirst(draft.extraExpenseName) || 'Không tên'}) - Khách: ${customer?.name || draft.customerName || 'Khách hàng'}`,
        date: draft.date || getTodayString()
      });
    }

    return { customerId, salesEmpId, amount: orderTotal };
  };

  const handleAddBulkDraft = () => {
    setBulkOrderStatus('');
    setBulkOrderDrafts((prev) => [...prev, createBulkOrderDraft()]);
  };

  const handleBulkDraftChange = (draftId, field, value) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => draft.localId === draftId ? { ...draft, [field]: value } : draft));
  };

  const handleBulkDraftItemChange = (draftId, itemIndex, field, value) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => {
      if (draft.localId !== draftId) return draft;
      const items = [...draft.items];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
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
      setBulkOrderStatus('Chưa cấu hình Gemini API key cho tính năng này.');
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setBulkOrderStatus('Ảnh quá lớn. Bạn hãy chọn ảnh nhỏ hơn 8MB để AI xử lý ổn định.');
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
      setBulkOrderStatus(`AI đã tách ${mappedDrafts.length} đơn nháp từ ảnh ${file.name}. Bạn rẠ soát lại rồi bấm tạo hàng loạt.`);
    } catch (error) {
      setBulkOrderStatus(error?.message || 'AI chưa đọc được ảnh sổ sách này. Bạn hãy thử lại.');
    } finally {
      setIsBulkOrderScanning(false);
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
    }
  };

  const handleSubmitBulkOrders = async () => {
    if (bulkOrderDrafts.length === 0) {
      setBulkOrderStatus('Chưa có đơn nháp để tạo hàng loạt.');
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
      setBulkOrderStatus(`Dừng ở đơn nháp ${createdCount + 1}: ${error?.message || 'Không thể tạo đơn.'}`);
    } finally {
      setIsBulkOrderSubmitting(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      await submitOrderDraft(newOrder, { allowDescriptionOnly: false });
      setShowAddOrder(false);
      setSearchCus('');
      setNewOrder(createSingleOrderState());
    } catch (error) {
      setErrorMsg(error?.message || 'Không thể tạo đơn hàng này.');
    }
  };

  const openAddOrderModal = () => {
    setErrorMsg('');
    setBulkOrderStatus('');
    setShowAddOrder(true);
  };

  const closeAddOrderModal = () => {
    setShowAddOrder(false);
    setErrorMsg('');
    setBulkOrderStatus('');
    setBulkOrderDrafts([]);
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
                placeholder="Tìm theo mã đơn, khách hàng, sản phẩm..."
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
                <button type="button" onClick={() => setTab('pending')} className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${tab === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Chờ xác nhận</button>
              </div>
              <p className="text-[11px] text-gray-500">Đang hiển thị {displayOrders.length} đơn phù hợp với bộ lọc hiện tại.</p>
            </div>
          )}
        </div>
      )}
      
      <div className="space-y-3">
        {displayOrders.length === 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center text-sm text-gray-400">
            Chưa có đơn hàng nào phù hợp với bộ lọc hiện tại.
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
            ? `${primaryItem.description || 'Mặt hàng'}${extraItemCount > 0 ? ` +${extraItemCount} loại` : ''}`
            : 'Chưa có mặt hàng';
          const unitPriceLabel = uniquePriceValues.length === 0
            ? 'Chưa có'
            : uniquePriceValues.length === 1
              ? `${formatCurrency(uniquePriceValues[0])} đ/kg`
              : `${formatCurrency(Math.min(...uniquePriceValues))} - ${formatCurrency(Math.max(...uniquePriceValues))} đ/kg`;

          return (
            <div key={`detail_${order.id}`} className="relative">
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
                    <p className="text-xs text-gray-500 mt-1">{formatDateTimeLabel(order.date)} • {formatOrderCode(order.id)}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${statusMeta.chipClasses}`}>{statusMeta.label}</span>
                </div>

                <div className="mt-3 text-[11px]">
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-gray-400 font-bold mb-1">Loại hàng</p>
                        <p className="font-semibold text-gray-700 leading-5">{itemTypeLabel}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-gray-400 font-bold mb-1">Số kg</p>
                        <p className="font-semibold text-gray-700 leading-5">{formatNumber(itemCount || 0)} kg</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-gray-400 font-bold mb-1">Đơn giá</p>
                        <p className="font-semibold text-gray-700 leading-5">{unitPriceLabel}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tổng đơn</p>
                    <p className="text-sm font-black text-gray-800">{formatCurrency(order.amount || 0)} đ</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                    <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Đã thu</p>
                    <p className="text-sm font-black text-emerald-700">{formatCurrency(order.appliedAmount || 0)} đ</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                    <p className="text-[10px] uppercase font-bold text-amber-600 mb-1">Còn nợ</p>
                    <p className={`text-sm font-black ${statusMeta.amountClasses}`}>{formatCurrency(order.outstandingAmount || 0)} đ</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-sm">
                  <div className="text-gray-500">
                    {itemCount > 0 ? `${formatNumber(itemCount)} sản phẩm` : `${(order.items || []).length} dòng hàng`}
                    {order.extraExpenseName && (order.customerExtraExpense || 0) > 0 && (
                      <span className="block mt-1 text-blue-600 font-medium">+ {order.extraExpenseName} ({formatCurrency(order.customerExtraExpense || 0)} đ)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                    <span>Mở chi tiết</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
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
                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-bold">Đã giao</span>
              </div>
              <div className="text-xs text-gray-500 mb-3 border-b border-gray-50 pb-3">
                {formatTime(o.date)} {new Date(o.date).toLocaleDateString('vi-VN')} - HD{o.id.substring(o.id.length-6).toUpperCase()}<br/>
                Tạo bởi {createdBy?.name || 'Admin'}
                <span className="block mt-1">NVKD phụ trách: {salesOwner?.name || 'Chưa gán'}</span>
                {o.extraExpenseName && o.customerExtraExpense > 0 && <span className="block mt-1 text-blue-600 font-medium">+ {o.extraExpenseName} ({formatCurrency(o.customerExtraExpense)})</span>}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Tổng cộng</span>
                <div className="text-right">
                  <span className="text-base font-black text-gray-800 block">{formatCurrency(o.amount)} đ</span>
                  <span className="text-[10px] text-orange-500 font-medium">Ghi nhận nợ</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="fixed bottom-[70px] right-4 left-4 pointer-events-none flex justify-center">
         <button onClick={openAddOrderModal} className="pointer-events-auto bg-blue-600 text-white rounded-full px-6 py-3 font-bold shadow-lg flex items-center gap-2 hover:bg-blue-700">
            <Plus size={18}/> Bán hàng
         </button>
      </div>

      {selectedOrder && (() => {
        const statusMeta = getOrderStatusMeta(selectedOrder);
        const itemSubtotal = (selectedOrder.items || []).reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0);

        return (
          <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col animate-in slide-in-from-right">
            <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeOrderDetail} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                  <ChevronLeft size={22} />
                </button>
                <div>
                  <h2 className="text-[17px] font-extrabold tracking-tight text-slate-900">Chi tiết hóa đơn</h2>
                  <p className="mt-0.5 text-[12px] font-semibold text-slate-500">{formatOrderCode(selectedOrder.id)}</p>
                </div>
              </div>
              <button type="button" aria-label="Chia sẻ hóa đơn" onClick={() => handleShareOrder()} className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm shrink-0 hover:bg-emerald-100">
                <Send size={18} />
              </button>
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

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 min-h-[88px]">
                    <p className="mb-1 text-[10px] uppercase font-extrabold tracking-[0.14em] text-slate-400">Tổng hóa đơn</p>
                    <p className="text-[22px] leading-7 font-extrabold tracking-tight text-slate-900">{formatCurrency(selectedOrder.amount || 0)} đ</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 min-h-[88px]">
                    <p className="mb-1 text-[10px] uppercase font-extrabold tracking-[0.14em] text-emerald-600">Đã thanh toán</p>
                    <p className="text-[22px] leading-7 font-extrabold tracking-tight text-emerald-700">{formatCurrency(selectedOrder.appliedAmount || 0)} đ</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 min-h-[88px]">
                    <p className="mb-1 text-[10px] uppercase font-extrabold tracking-[0.14em] text-amber-600">Còn nợ</p>
                    <p className={`text-[22px] leading-7 font-extrabold tracking-tight ${statusMeta.amountClasses}`}>{formatCurrency(selectedOrder.outstandingAmount || 0)} đ</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 min-h-[88px]">
                    <p className="mb-1 text-[10px] uppercase font-extrabold tracking-[0.14em] text-blue-600">Ngày lập</p>
                    <p className="text-[14px] leading-5 font-extrabold tracking-tight text-blue-700">{formatDateTimeLabel(selectedOrder.date)}</p>
                  </div>
                </div>

                <div className="space-y-2 mt-4 pt-4 border-t border-gray-100 text-[14px] leading-6 font-medium text-slate-600">
                  <p><span className="font-bold text-slate-900">NVKD:</span> {selectedOrder.salesOwner?.name || 'Chưa gán'}</p>
                  <p><span className="font-bold text-slate-900">Tạo bởi:</span> {selectedOrder.createdBy?.name || 'Hệ thống'}</p>
                  <p><span className="font-bold text-slate-900">Số dòng hàng:</span> {(selectedOrder.items || []).length}</p>
                  {selectedOrder.extraExpenseName && (selectedOrder.customerExtraExpense || 0) > 0 && (
                    <p><span className="font-bold text-slate-900">Phụ phí khách chịu:</span> {selectedOrder.extraExpenseName} - {formatCurrency(selectedOrder.customerExtraExpense || 0)} đ</p>
                  )}
                </div>
              </div>

              {orderShareStatus && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] leading-5 font-semibold text-emerald-700" role="status">
                  {orderShareStatus}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-[16px] font-extrabold tracking-tight text-slate-900">Danh sách hàng hóa</h3>
                  <span className="text-[12px] font-semibold text-slate-400">{(selectedOrder.items || []).length} dòng</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(selectedOrder.items || []).length === 0 && (
                    <p className="p-4 text-center text-sm text-gray-400">Chưa có chi tiết mặt hàng trong đơn này.</p>
                  )}
                  {(selectedOrder.items || []).map((item, index) => (
                    <div key={`${selectedOrder.id}_${index}`} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] leading-5 font-bold tracking-tight text-slate-900">{item.description || `Sản phẩm ${index + 1}`}</p>
                          <p className="mt-1 text-[12px] leading-5 font-medium text-slate-500">{formatNumber(parseFloat(item.quantity) || 0)} x {formatCurrency(parseFloat(item.unitPrice) || 0)} đ</p>
                        </div>
                        <p className="text-[15px] leading-5 font-extrabold tracking-tight text-slate-900">{formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))} đ</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <h3 className="mb-3 text-[16px] font-extrabold tracking-tight text-slate-900">Tổng hợp thanh toán</h3>
                <div className="space-y-3 text-[14px] leading-6 font-medium text-slate-600">
                  <div className="flex items-center justify-between"><span>Tiền hàng</span><strong className="text-gray-800">{formatCurrency(itemSubtotal)} đ</strong></div>
                  <div className="flex items-center justify-between"><span>Giảm giá</span><strong className="text-gray-800">-{formatCurrency(selectedOrder.discount || 0)} đ</strong></div>
                  <div className="flex items-center justify-between"><span>Phụ phí khách chịu</span><strong className="text-gray-800">{formatCurrency(selectedOrder.customerExtraExpense || 0)} đ</strong></div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100"><span className="text-[15px] font-extrabold tracking-tight text-slate-900">Tổng hóa đơn</span><strong className="text-[15px] font-extrabold tracking-tight text-gray-900">{formatCurrency(selectedOrder.amount || 0)} đ</strong></div>
                  <div className="flex items-center justify-between"><span>Đã thu</span><strong className="text-emerald-600">{formatCurrency(selectedOrder.appliedAmount || 0)} đ</strong></div>
                  <div className="flex items-center justify-between"><span>Còn nợ</span><strong className={`text-[15px] font-extrabold tracking-tight ${statusMeta.amountClasses}`}>{formatCurrency(selectedOrder.outstandingAmount || 0)} đ</strong></div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-[16px] font-extrabold tracking-tight text-slate-900">Lịch sử thanh toán gắn với đơn</h3>
                  <span className="text-[12px] font-semibold text-slate-400">{(selectedOrder.paymentHistory || []).length} lần</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(selectedOrder.paymentHistory || []).length === 0 && (
                    <p className="p-4 text-center text-sm text-gray-400">Đơn hàng này chưa có khoản thanh toán nào được gắn vào.</p>
                  )}
                  {(selectedOrder.paymentHistory || []).map(payment => (
                    <div key={payment.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] leading-5 font-bold tracking-tight text-slate-900">{payment.note || 'Thu tiền hóa đơn'}</p>
                          <p className="mt-1 text-[12px] leading-5 font-medium text-slate-500">{formatDateLabel(payment.date)} • {getPaymentMethodLabel(payment)} • {getPaymentSourceLabel(payment)}</p>
                        </div>
                        <p className="text-[15px] leading-5 font-extrabold tracking-tight text-emerald-600">{formatCurrency(payment.allocatedToOrder || 0)} đ</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showAddOrder && (
         <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col animate-in slide-in-from-bottom">
            <header className="bg-blue-600 text-white p-4 flex items-center justify-between shrink-0 shadow-sm">
               <h2 className="font-bold text-lg">Tạo Đơn Hàng Mới</h2>
               <button onClick={closeAddOrderModal} className="hover:bg-blue-700 p-1 rounded-full"><X size={24}/></button>
            </header>
            
            <div className="p-4 flex-1 overflow-y-auto">
               <form id="order-form" onSubmit={handleAddSubmit} className="space-y-4 max-w-lg mx-auto pb-6">
                {errorMsg && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 font-medium border border-red-100">{errorMsg}</div>}
                <input ref={bulkOrderImageInputRef} type="file" accept="image/*" capture="environment" onChange={handleNotebookImageUpload} className="hidden" />

                <div className="bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-extrabold tracking-[0.22em] uppercase text-indigo-600">AI nhập nhanh</p>
                      <h3 className="text-base font-bold text-slate-900 mt-1">Tạo đơn hàng loạt từ ảnh sổ sách</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-5">
                        Chụp ảnh sổ bán hàng, AI sẽ tạch tên khách, mặt hàng, số kg và đơn giá thành từng đơn nháp để kế toán rẠ soát rồi tạo hàng loạt.
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
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-60"
                    >
                      <Plus size={16} />
                      Thêm nháp tay
                    </button>
                  </div>

                  {bulkOrderStatus && (
                    <div
                      className={`rounded-2xl border px-3 py-2 text-xs leading-5 font-medium ${
                        /dừng|không|chưa/i.test(bulkOrderStatus)
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
                          <p className="text-sm font-bold text-slate-900">{bulkOrderDrafts.length} đơn nháp chờ rẠ soát</p>
                          <p className="text-[11px] text-slate-500 mt-1">Sửa trực tiếp tên khách, mặt hàng, số kg và đơn giá rồi bấm tạo hàng loạt.</p>
                        </div>
                        <button
                          type="button"
                          disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                          onClick={handleSubmitBulkOrders}
                          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 disabled:opacity-60"
                        >
                          {isBulkOrderSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          Tạo {bulkOrderDrafts.length} đơn
                        </button>
                      </div>

                      {bulkOrderDrafts.map((draft, draftIndex) => {
                        const draftTotal = (draft.items || []).reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseLooseMoneyValue(item.unitPrice) || 0)), 0);
                        const matchedCustomer = draft.customerId ? customers.find((customer) => customer.id === draft.customerId) : null;
                        return (
                          <div key={draft.localId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-slate-900">Đơn nháp {draftIndex + 1}</p>
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
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Tên khách hàng</label>
                                <input
                                  type="text"
                                  value={draft.customerName}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'customerName', capitalizeFirst(e.target.value))}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                  placeholder="Ví dụ: Cửa hàng Lan Anh"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Khách trong hệ thống</label>
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
                                  <option value="">Tạo khách mới theo tên đã nhập</option>
                                  {customers.map((customer) => (
                                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {!isSales && (
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">NVKD phụ trách nếu tạo khách mới</label>
                                <select
                                  value={draft.salesEmpId}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'salesEmpId', e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                >
                                  <option value="">-- Chọn nhân viên kinh doanh --</option>
                                  {salesEmployees.map((salesEmployee) => (
                                    <option key={salesEmployee.id} value={salesEmployee.id}>{salesEmployee.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Mặt hàng</label>
                                <button
                                  type="button"
                                  onClick={() => handleAddBulkDraftItem(draft.localId)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600"
                                >
                                  <Plus size={12} />
                                  Thêm dòng
                                </button>
                              </div>

                              {(draft.items || []).map((item, itemIndex) => (
                                <div key={`${draft.localId}_${itemIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-slate-500">Dòng {itemIndex + 1}</span>
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
                                    <option value="">-- Khớp với sản phẩm trong kho (nếu có) --</option>
                                    {activeProducts.map((product) => (
                                      <option key={product.id} value={product.id}>{product.name} ({formatCurrency(product.sellingPrice)} đ)</option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={item.description || ''}
                                    onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'description', capitalizeFirst(e.target.value))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Tên hàng hóa / loại hàng"
                                  />
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={item.quantity}
                                      onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'quantity', e.target.value)}
                                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                      placeholder="Số kg / số lượng"
                                    />
                                    <input
                                      type="tel"
                                      value={formatInputCurrency(item.unitPrice)}
                                      onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'unitPrice', parseInputCurrency(e.target.value))}
                                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                      placeholder="Đơn giá"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Ngày đơn</label>
                                <input
                                  type="date"
                                  value={draft.date}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'date', e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Ghi chú</label>
                                <input
                                  type="text"
                                  value={draft.note || ''}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'note', capitalizeFirst(e.target.value))}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500"
                                  placeholder="Ghi chú từ sổ nếu có"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                              <span>Tạm tính đơn nháp</span>
                              <strong className="text-sm font-extrabold text-slate-900">{formatCurrency(draftTotal)} đ</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">1. Khách hàng *</label>
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
                        <span className="text-sm font-semibold text-blue-800 flex items-center gap-2"><CheckCircle size={16}/> Đã chọn: {customers.find(c => c.id === newOrder.customerId)?.name}</span>
                        <button type="button" onClick={() => {setNewOrder({...newOrder, customerId: ''}); setSearchCus('');}}><X size={16} className="text-blue-500 hover:text-blue-700"/></button>
                     </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase">2. Sản phẩm</label>
                    <button type="button" onClick={handleAddItem} className="text-xs text-blue-600 font-semibold flex items-center bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"><Plus size={14} className="mr-1"/> Thêm dòng</button>
                  </div>
                  <div className="space-y-3">
                    {newOrder.items.map((item, index) => (
                      <div key={index} className="relative bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {newOrder.items.length > 1 && <button type="button" onClick={() => handleRemoveItem(index)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1.5 hover:bg-red-200 shadow-sm"><X size={14}/></button>}
                        <select value={item.productId || ''} onChange={e=>handleItemProductChange(index, e.target.value)} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none bg-white mb-2 focus:ring-2 focus:ring-blue-500">
                          <option value="">-- Chọn nhanh từ kho --</option>
                          {activeProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.sellingPrice)})</option>)}
                        </select>
                        {item.description && <p className="text-sm font-semibold text-gray-700 mb-2">{item.description}</p>}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input required type="number" step="0.01" placeholder="Số lượng" value={item.quantity} onChange={e=>handleItemChange(index, 'quantity', e.target.value)} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                          <input required type="tel" placeholder="Giá bán (VNĐ)" value={formatInputCurrency(item.unitPrice)} onChange={e=>handleItemChange(index, 'unitPrice', parseInputCurrency(e.target.value))} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="text-right text-xs text-blue-600 font-semibold mt-3 pt-3 border-t border-dashed border-gray-200">Tạm tính: {formatCurrency((parseFloat(item.quantity)||0) * (parseFloat(item.unitPrice)||0))} đ</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-3">3. Thanh toán & Phụ phí</label>
                  <div className="flex justify-between items-center mb-2"><span className="text-sm text-gray-600">Tổng tiền hàng:</span><span className="font-semibold">{formatCurrency(subTotal)} đ</span></div>
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Giảm giá / C.Khấu:</span>
                    <input type="tel" value={formatInputCurrency(newOrder.discount)} onChange={e=>setNewOrder({...newOrder, discount: parseInputCurrency(e.target.value)})} className="w-1/2 border border-gray-200 p-2 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-blue-500" placeholder="0 ₫" />
                  </div>

                  <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <p className="text-xs font-bold text-gray-700 mb-2">Chi phí khác (Vận chuyển, thùng xốp...)</p>
                    <div className="flex gap-2 mb-2">
                      <input type="text" placeholder="Tên phí (VD: Ship...)" value={newOrder.extraExpenseName} onChange={e=>setNewOrder({...newOrder, extraExpenseName: capitalizeFirst(e.target.value)})} className="flex-1 border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                      <input type="tel" placeholder="Số tiền" value={formatInputCurrency(newOrder.extraExpenseAmount)} onChange={e=>setNewOrder({...newOrder, extraExpenseAmount: parseInputCurrency(e.target.value)})} className="w-1/3 border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    {parseFloat(newOrder.extraExpenseAmount) > 0 && (
                      <select value={newOrder.extraExpensePayer} onChange={e=>setNewOrder({...newOrder, extraExpensePayer: e.target.value})} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none bg-white text-emerald-700 font-medium focus:ring-2 focus:ring-emerald-500">
                        <option value="buyer">Khách chịu phí (+100% vào hóa đơn)</option>
                        <option value="shared">Chia đôi phí (+50% hóa đơn, 50% vào Chi phí)</option>
                        <option value="seller">Shop chịu phí (Tự động hạch toán Chi phí)</option>
                      </select>
                    )}
                  </div>

                  <div className="flex justify-between items-center mb-5 bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <span className="text-sm font-bold text-blue-800">Khách Cần Trả:</span>
                    <span className="text-2xl font-black text-blue-600">{formatCurrency(totalAmount)} đ</span>
                  </div>
                  
                  <div className="bg-orange-50 p-3.5 rounded-xl border border-orange-100 mb-4">
                    <p className="text-xs font-bold text-orange-700 mb-2 flex items-center"><DollarSign size={14} className="mr-1"/> Khách trả trước / Đặt cọc</p>
                    <input type="tel" value={formatInputCurrency(newOrder.upfrontPayment)} onChange={e=>setNewOrder({...newOrder, upfrontPayment: parseInputCurrency(e.target.value)})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm mb-2 outline-none focus:ring-2 focus:ring-orange-400 bg-white" placeholder="Nhập số tiền đã nhận..." />
                    {parseFloat(newOrder.upfrontPayment) > 0 && (
                      <select value={newOrder.paymentMethod} onChange={e=>setNewOrder({...newOrder, paymentMethod: e.target.value})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                        <option>Chuyển khoản</option><option>Tiền mặt</option><option>Tài xế thu hộ</option>
                      </select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 font-bold uppercase">Ngày lập đơn</span>
                    <input required type="date" value={newOrder.date} onChange={e=>setNewOrder({...newOrder, date: e.target.value})} className="w-full border border-gray-300 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  </div>
                </div>
               </form>
            </div>

            <div className="bg-white p-4 border-t border-gray-100 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] shrink-0 pb-safe">
              <div className="max-w-lg mx-auto">
                <button type="submit" form="order-form" className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all active:scale-[0.98]">Xác Nhận Tạo Đơn Hàng</button>
              </div>
            </div>

            {showQuickAddCus && (
              <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
                  <h3 className="font-bold text-lg mb-4 text-gray-800">Thêm Khách Hàng Nhanh</h3>
                  <form onSubmit={handleQuickAddCustomer} className="space-y-4">
                    <input required type="text" value={newCus.name} onChange={e=>setNewCus({...newCus, name: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Tên khách hàng / Công ty *" />
                    <input required type="tel" value={newCus.phone} onChange={e=>setNewCus({...newCus, phone: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Số điện thoại *" />
                    <input type="text" value={newCus.address} onChange={e=>setNewCus({...newCus, address: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Địa chỉ giao hàng" />
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                      <input type="text" value={newCus.customerGroup} onChange={e=>setNewCus({...newCus, customerGroup: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Ví dụ: Đại lý, VIP, Tạp hóa" />
                    </div>
                    {!isSales && (
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Nhân viên kinh doanh phụ trách</label>
                        <select required value={newCus.empId} onChange={e=>setNewCus({...newCus, empId: e.target.value})} className="w-full border p-3 rounded-xl outline-none bg-white text-sm">
                          <option value="">-- Chọn nhân viên kinh doanh --</option>
                          {salesEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={()=>setShowQuickAddCus(false)} className="flex-1 bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold transition-colors">Hủy</button>
                      <button type="submit" className="flex-[2] bg-emerald-500 text-white py-3.5 rounded-xl font-bold transition-colors shadow-md shadow-emerald-500/30">Lưu Khách Hàng</button>
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