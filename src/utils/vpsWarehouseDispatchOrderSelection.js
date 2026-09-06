const CLOSED_ORDER_STATUSES = new Set(['CANCELLED', 'CLOSED']);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const timestamp = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Produces only remaining VPS sales-order lines, newest first. It intentionally
 * does not invent a warehouse, UOM, or opening inventory balance.
 */
export const buildVpsPendingDispatchOrderRows = ({
  orders = [],
  customers = [],
  products = [],
} = {}) => {
  const customerById = new Map((customers || []).map((customer) => [customer.id, customer]));
  const productById = new Map((products || []).map((product) => [product.id, product]));

  return (orders || [])
    .filter((order) => order && !order.isArchived && !CLOSED_ORDER_STATUSES.has(`${order.status || ''}`.toUpperCase()))
    .slice()
    .sort((left, right) => (
      timestamp(right.createdAt || right.orderDate || right.updatedAt)
      - timestamp(left.createdAt || left.orderDate || left.updatedAt)
    ))
    .flatMap((order) => {
      const customer = customerById.get(order.customerId) || order.customer || null;
      const orderTimestamp = timestamp(order.createdAt || order.orderDate || order.updatedAt);
      return (Array.isArray(order.items) ? order.items : [])
        .map((line, index) => {
          const quantity = toNumber(line.quantity);
          const deliveredQuantity = toNumber(line.deliveredQuantity);
          const remainingQuantity = Math.max(0, quantity - deliveredQuantity);
          const product = productById.get(line.productId) || line.product || null;
          return {
            rowKey: `vps:${order.id || 'order'}:${line.id || index}`,
            requestId: order.id || '',
            requestDate: `${order.orderDate || order.createdAt || ''}`.slice(0, 10),
            requestTimestamp: orderTimestamp,
            orderId: order.id || '',
            orderNumber: order.orderNumber || order.code || '',
            orderLineId: line.id || '',
            reservationId: line.reservationId || '',
            customerId: order.customerId || customer?.id || '',
            customerName: customer?.name || order.customerName || '',
            productId: line.productId || product?.id || '',
            productName: product?.name || line.productName || '',
            productShortName: product?.shortName || line.productShortName || '',
            productUnit: product?.unit || line.unit || '',
            product,
            warehouseId: line.warehouseId || order.warehouseId || '',
            unitId: line.unitId || '',
            quantity: remainingQuantity,
            quantityUnit: line.unit || product?.unit || '',
            unitPrice: toNumber(line.unitPrice),
            item: {
              ...line,
              quantity: remainingQuantity,
              requestTimestamp: orderTimestamp,
            },
          };
        })
        .filter((line) => line.orderId && line.orderLineId && line.customerId && line.productId && line.quantity > 0);
    });
};
