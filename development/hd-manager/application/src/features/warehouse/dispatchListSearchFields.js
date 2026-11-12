/**
 * @typedef {import('./warehouseDispatchContracts.js').DispatchPresentationRow & {
 * productShortName?: string, productShortNameSnapshot?: string, shortName?: string,
 * code?: string, dispatchCode?: string, invoiceCode?: string, orderCode?: string,
 * note?: string, transcript?: string, weightEntries?: readonly (string | number | null | undefined)[],
 * sourceRows?: readonly DispatchSearchRow[]
 * }} DispatchSearchRow
 * @typedef {{name?: string, plainName?: string, displayName?: string, customerHonorific?: string,
 * shopName?: string, storeName?: string, contactName?: string, phone?: string,
 * address?: string, location?: string, code?: string, customerCode?: string}} SearchCustomer
 * @typedef {{name?: string, shortName?: string, code?: string, sku?: string, barcode?: string}} SearchProduct
 * @typedef {{name?: string, displayName?: string, phone?: string}} SearchEmployee
 * @typedef {'primary'|'product'|'driver'|'branch'|'phone'|'code'|'quantity'|'weight'|'date'|'note'} SearchKey
 * @typedef {{key: SearchKey, priority: number, values: (string | number | null | undefined)[], numericMatch?: 'tokens'}} DispatchSearchField
 * @typedef {{customers: ReadonlyMap<string, SearchCustomer>, products: ReadonlyMap<string, SearchProduct>,
 * employees: ReadonlyMap<string, SearchEmployee>, customerName: (customer: SearchCustomer) => string,
 * driverId: (row: DispatchSearchRow) => string, driverName: (row: DispatchSearchRow) => string,
 * quantity: (row: DispatchSearchRow) => number, unit: (row: DispatchSearchRow) => string,
 * weight: (row: DispatchSearchRow) => number, compactProductName: (name: string) => string,
 * formatNumber: (value: number) => string, formatDate: (date: string) => string}} DispatchSearchContext
 */

/**
 * Search the displayed values and original lines of a merged row. Field objects
 * are the shared search engine's contract; raw label strings are not fields.
 * @param {DispatchSearchRow} row
 * @param {DispatchSearchContext} context
 * @returns {DispatchSearchField[]}
 */
export function buildDispatchListSearchFields(row, context) {
  /** @type {Record<SearchKey, DispatchSearchField>} */
  const fields = {
    primary: { key: 'primary', priority: 100, numericMatch: 'tokens', values: [] },
    product: { key: 'product', priority: 90, numericMatch: 'tokens', values: [] },
    driver: { key: 'driver', priority: 80, numericMatch: 'tokens', values: [] },
    branch: { key: 'branch', priority: 70, numericMatch: 'tokens', values: [] },
    phone: { key: 'phone', priority: 65, values: [] },
    code: { key: 'code', priority: 60, numericMatch: 'tokens', values: [] },
    quantity: { key: 'quantity', priority: 45, numericMatch: 'tokens', values: [] },
    weight: { key: 'weight', priority: 45, numericMatch: 'tokens', values: [] },
    date: { key: 'date', priority: 30, numericMatch: 'tokens', values: [] },
    note: { key: 'note', priority: 20, numericMatch: 'tokens', values: [] },
  };
  const sources = row.sourceRows?.length ? [row, ...row.sourceRows] : [row];
  for (const source of sources) {
    const customer = context.customers.get(source.customerId || row.customerId || '');
    const product = context.products.get(source.productId || row.productId || '');
    const driverId = context.driverId(source) || context.driverId(row);
    const driver = context.employees.get(driverId);
    fields.primary.values.push(source.customerName, source.customerNameSnapshot,
      customer ? context.customerName(customer) : '', customer?.name, customer?.plainName,
      customer?.displayName, customer?.shopName, customer?.storeName, customer?.contactName);
    fields.product.values.push(source.productName, source.productNameSnapshot,
      source.productShortName, source.productShortNameSnapshot, source.shortName,
      product?.name, product?.shortName, product?.code, product?.sku, product?.barcode,
      context.compactProductName(source.productName || source.productNameSnapshot || product?.name || ''));
    fields.driver.values.push(context.driverName(source), source.assignedDriverName,
      source.assignedDriverNameSnapshot, source.driverNameSnapshot, source.driverName,
      driver?.name, driver?.displayName, source.deliveryStatusLabel);
    fields.branch.values.push(source.branchName, source.customerBranchName, customer?.address, customer?.location);
    fields.phone.values.push(customer?.phone, driver?.phone);
    fields.code.values.push(source.id, source.code, source.dispatchCode, source.invoiceCode,
      source.orderCode, customer?.code, customer?.customerCode);
    const quantity = context.quantity(source);
    const unit = context.unit(source);
    fields.quantity.values.push(quantity, unit, `${context.formatNumber(quantity)} ${unit}`);
    const weight = context.weight(source);
    fields.weight.values.push(weight, `${context.formatNumber(weight)} kg`, ...(source.weightEntries || []));
    fields.date.values.push(source.date, context.formatDate(source.date || ''));
    fields.note.values.push(source.note, source.transcript);
  }
  return Object.values(fields);
}
