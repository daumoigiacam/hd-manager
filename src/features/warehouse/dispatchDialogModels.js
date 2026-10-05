/**
 * @typedef {{requestId?: string, productId?: string, rowKey?: string, itemIndex?: number,
 * requestDate?: string, productShortName?: string, productName?: string, quantity?: number,
 * quantityUnit?: string, attributeLabel?: string, sizeLabel?: string}} ShortageLine
 */
/**
 * @template {ShortageLine} T
 * @param {readonly T[]} lines
 * @param {string} productName
 * @param {{formatDate: (value: string) => string, formatNumber: (value: number) => string, compactName: (value: string) => string}} format
 */
export function buildDispatchShortageTableRows(lines, productName, format) {
  return lines.map((line, index) => ({
    id: `${line.requestId || 'shortage'}_${line.productId || index}_${index}`,
    requestId: line.requestId || '', rowKey: line.rowKey || '',
    itemIndex: Number.isInteger(line.itemIndex) ? /** @type {number} */ (line.itemIndex) : index,
    requestDateLabel: format.formatDate(line.requestDate || ''),
    productLabel: line.productShortName || format.compactName(line.productName || productName || 'Hàng hóa'),
    quantityLabel: `${format.formatNumber(line.quantity || 0)} ${line.quantityUnit || ''}`.trim(),
    sizeLabel: line.attributeLabel || line.sizeLabel || '', rawLine: line,
  }));
}

/** @typedef {{id: string, customerId?: string, productId?: string, customerNameSnapshot?: string, productNameSnapshot?: string, productShortName?: string, productShortNameSnapshot?: string, shortName?: string, weightKg?: string | number | null, note?: string}} HistoryItem */
/**
 * @template {HistoryItem} T
 * @template {{name?: string}} P
 * @param {readonly T[]} items
 * @param {{customers: ReadonlyMap<string, {name?: string}>, products: ReadonlyMap<string, P>,
 * timestamp: (item: T) => number, productShortName: (product: P | undefined) => string,
 * quantity: (item: T) => number, unit: (item: T) => string}} context
 */
export function buildDispatchHistoryRows(items, context) {
  return [...items].sort((a, b) => (context.timestamp(a) || 0) - (context.timestamp(b) || 0)).map(item => {
    const customer = context.customers.get(item.customerId || '');
    const product = context.products.get(item.productId || '');
    return {
      id: item.id,
      customerName: item.customerNameSnapshot || customer?.name || 'Khach hang',
      productName: item.productNameSnapshot || product?.name || 'Hang hoa',
      productShortName: context.productShortName(product) || `${item.productShortName || item.productShortNameSnapshot || item.shortName || ''}`.trim().toUpperCase(),
      pieceCount: context.quantity(item), quantityUnit: context.unit(item),
      weightKg: parseFloat(String(item.weightKg)) || 0, note: item.note || '',
      createdAt: context.timestamp(item) || 0,
    };
  });
}
