export function customerHistoryItemLabel(item = {}, products = []) {
  const product = products.find(row => row.id === item.productId);
  const name = item.description || item.productName || item.productNameSnapshot || product?.name || 'Hàng hóa';
  return `${name} x${item.quantity ?? item.billingQuantity ?? 0}`;
}
