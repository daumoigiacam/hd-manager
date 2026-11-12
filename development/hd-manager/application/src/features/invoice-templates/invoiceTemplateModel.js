export const INVOICE_TEMPLATES = Object.freeze([
  { id: 'template-01', name: 'Hiện đại tối giản', description: 'Rõ ràng, gọn và dễ đọc', tone: 'blue' },
  { id: 'template-02', name: 'Nổi bật tổng tiền', description: 'Ưu tiên tổng cộng và thanh toán', tone: 'green' },
  { id: 'template-03', name: 'Thanh toán nhanh', description: 'QR và thao tác thanh toán nổi bật', tone: 'coral' },
  { id: 'template-04', name: 'Timeline & trạng thái', description: 'Theo dõi đơn và giao hàng', tone: 'orange' },
  { id: 'template-05', name: 'Ngân hàng / Clean', description: 'Bố cục thanh toán hiện đại', tone: 'teal' },
  { id: 'template-06', name: 'Phiếu đẹp in A5', description: 'Tối ưu cho bản in nhỏ', tone: 'paper' },
  { id: 'template-07', name: 'Premium Sang trọng', description: 'Tông vàng trang trọng', tone: 'gold' },
  { id: 'template-08', name: 'Hiện đại hình ảnh', description: 'Hình sản phẩm và hóa đơn song song', tone: 'navy' },
  { id: 'template-09', name: 'Tối giản cao cấp', description: 'Typography và khoảng trắng', tone: 'minimal' },
  { id: 'template-10', name: 'Corporate chuyên nghiệp', description: 'Nhận diện doanh nghiệp', tone: 'corporate' },
]);

export const DEFAULT_INVOICE_TEMPLATE_ID = 'template-01';
const templateIds = new Set(INVOICE_TEMPLATES.map((template) => template.id));

export function normalizeInvoiceTemplateId(value) {
  return templateIds.has(value) ? value : DEFAULT_INVOICE_TEMPLATE_ID;
}

export function resolveInvoiceTemplateId(company = {}, order = {}) {
  return normalizeInvoiceTemplateId(order?.invoiceTemplateOverride || company?.invoiceTemplateId);
}

const nonnegative = (value) => Math.max(0, Number(value) || 0);
const text = (value) => `${value ?? ''}`.trim();

// The order/ledger owns every monetary result. This adapter only names and displays it.
export function buildInvoiceViewModel(input = {}) {
  const order = input.order || {};
  const company = input.company || {};
  const customer = input.customer || order.customer || {};
  const payment = input.payment || {};
  const items = (input.items || order.items || []).map((item, index) => ({
    id: item.id || `${index}`,
    productId: item.productId || '',
    productName: text(item.productName || item.description || item.name) || 'Sản phẩm',
    image: text(item.image || item.imageUrl || item.productImage),
    unit: text(item.unit || item.billingUnit || item.quantityUnit) || 'ĐVT',
    quantity: nonnegative(item.quantity ?? item.billingQuantity),
    unitPrice: nonnegative(item.unitPrice),
    amount: nonnegative(item.amount),
  }));
  const subtotal = nonnegative(input.subtotal ?? order.subtotal ?? items.reduce((sum, item) => sum + item.amount, 0));
  const discountAmount = nonnegative(order.discountAmount ?? order.discount);
  const promotionAmount = nonnegative(order.promotionAmount ?? order.promotionDiscountAmount);
  const fees = (input.fees || order.fees || []).filter((fee) => nonnegative(fee.amount) > 0).map((fee) => ({
    name: text(fee.name || fee.label) || 'Phụ phí',
    amount: nonnegative(fee.amount),
  }));
  const grandTotal = nonnegative(input.grandTotal ?? order.amount ?? order.grandTotal ?? order.totalAmount ?? subtotal);
  const paid = nonnegative(payment.paid ?? order.appliedAmount ?? order.paidAmount);
  const invoiceDebt = nonnegative(payment.invoiceDebt ?? order.outstandingAmount ?? (grandTotal - paid));
  const oldDebt = nonnegative(payment.oldDebt);
  const totalReceivable = nonnegative(payment.totalReceivable ?? (invoiceDebt + oldDebt));
  const status = invoiceDebt <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

  return {
    invoiceId: text(order.id),
    invoiceCode: text(input.invoiceCode || order.code || order.invoiceCode || order.id),
    createdAt: order.createdAt || order.date || input.createdAt || '',
    templateId: resolveInvoiceTemplateId(company, order),
    company: {
      name: text(company.displayName || company.name) || 'Công ty',
      logo: text(company.logoUrl || company.logo),
      phone: text(company.companyPhone || company.phone || company.ownerPhone),
      address: text(company.companyAddress || company.address),
      email: text(company.email),
      slogan: text(company.slogan) || 'Chất lượng tạo nên giá trị',
    },
    customer: {
      name: text(customer.name || customer.customerName || order.customerNameSnapshot) || 'Khách lẻ',
      phone: text(customer.phone || customer.phoneNumber || order.customerPhoneSnapshot),
      address: text(customer.address || customer.shippingAddress || order.customerAddressSnapshot),
      avatar: text(customer.avatar || customer.avatarUrl),
    },
    employee: { name: text(input.employee?.name || order.salesOwner?.name || order.createdBy?.name || order.salesEmpName) },
    delivery: {
      status: text(order.deliveryStatus || order.status),
      driver: text(order.driverName || order.deliveryPersonName),
      deliveredAt: order.deliveredAt || '',
    },
    items,
    pricing: {
      subtotal,
      discountType: text(order.discountType),
      discountValue: nonnegative(order.discountValue),
      discountAmount,
      promotionName: text(order.promotionName || order.promotionLabel),
      promotionAmount,
      fees,
      totalFees: fees.reduce((sum, fee) => sum + fee.amount, 0),
      grandTotal,
    },
    payment: {
      paid,
      oldDebt,
      invoiceDebt,
      totalReceivable,
      bankName: text(payment.bankName),
      accountName: text(payment.accountName),
      accountNumber: text(payment.accountNumber),
      qr: text(payment.qr),
      transferContent: text(payment.transferContent),
    },
    status: {
      paymentStatus: text(order.paymentStatus) || status,
      orderStatus: text(order.status),
      deliveryStatus: text(order.deliveryStatus),
    },
    note: text(order.note || order.notes),
    signature: text(order.signature || company.signature),
  };
}

export function buildInvoiceDemo(scenario = 'base', templateId = DEFAULT_INVOICE_TEMPLATE_ID) {
  const discount = ['discount', 'combined'].includes(scenario) ? 100000 : 0;
  const promotion = ['promotion', 'combined'].includes(scenario) ? 50000 : 0;
  const fee = ['fee', 'combined'].includes(scenario) ? 30000 : 0;
  const grandTotal = 1818000 - discount - promotion + fee;
  const paid = scenario === 'partial' || scenario === 'combined' ? 500000 : scenario === 'paid' ? grandTotal : 0;
  const oldDebt = scenario === 'old-debt' || scenario === 'combined' ? 200000 : 0;
  return buildInvoiceViewModel({
    company: { name: 'HD CO., LTD', displayName: 'Đầu Mối Gia Cầm HD', logoUrl: '/brand/hd-manager-logo.png', companyPhone: '0888 999 506', companyAddress: 'Bình Dương', slogan: 'Chất lượng · Uy tín · Đồng hành cùng phát triển', invoiceTemplateId: templateId },
    customer: { name: 'Anh/chị - Gà 36 Cn8', phone: '0888 999 506', address: 'Bình Dương' },
    employee: { name: 'Hoàng Văn Đức' },
    order: {
      id: 'HDGH4Q6D', code: 'HDGH4Q6D', date: '2026-09-26T13:52:00+07:00', amount: grandTotal,
      discount, promotionAmount: promotion, promotionName: 'Khách hàng thân thiết',
      fees: fee ? [{ name: 'Phí giao hàng', amount: fee }] : [],
      deliveryStatus: 'delivered', status: 'confirmed',
    },
    items: [{ productName: 'Gà Móc Sạch Cắt Chân', image: '/invoice/white-chicken-farm.webp', unit: 'kg', quantity: 30.3, unitPrice: 60000, amount: 1818000 }],
    payment: { paid, invoiceDebt: grandTotal - paid, oldDebt, totalReceivable: grandTotal - paid + oldDebt, bankName: 'Sacombank', accountName: 'HOANG VAN DUC', accountNumber: '050086470672', transferContent: 'TT HDGH4Q6D', qr: '' },
  });
}
