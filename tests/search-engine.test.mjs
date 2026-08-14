import assert from 'node:assert/strict';
import {
  buildSearchIndexTokens,
  normalizeSearchText,
  searchCustomers,
  searchEmployees,
  searchInvoices,
  searchProducts,
} from '../src/services/searchEngine.js';
import {
  getOrderRecencyTimestamp,
  sortOrdersByNewest,
} from '../src/utils/orderRecency.js';

const customer = {
  id: 'cus-tam-xoai',
  name: 'Anh T\u00e2m \u0110\u1ed3ng Xo\u00e0i',
  phone: '0978 194 836',
  customerCode: 'KH-DX-01',
  storeName: 'C\u1eeda h\u00e0ng \u0110\u1ed3ng Xo\u00e0i',
  address: 'B\u00e0u B\u00e0ng, B\u00ecnh D\u01b0\u01a1ng',
  area: '\u0110\u1ed3ng Xo\u00e0i',
  note: 'Kh\u00e1ch giao bu\u1ed5i s\u00e1ng',
};
const similarCustomer = { id: 'cus-tam-binh-duong', name: 'Anh T\u00e2m B\u00ecnh D\u01b0\u01a1ng', phone: '0909 000 000' };
const customers = [similarCustomer, customer];

const firstCustomerId = (query) => searchCustomers(customers, query)[0]?.id;

assert.equal(normalizeSearchText('  T\u00c2M   XO\u00c0I  '), 'tam xoai');
assert.equal(normalizeSearchText('\u0110\u1ed3ng'), 'dong');

[
  'dong',
  '\u0111\u1ed3ng',
  'xoai',
  'xo\u00e0i',
  'tam xoai',
  'xoai tam',
  't\u00e2m \u0111\u1ed3ng',
  '\u0111\u1ed3ng t\u00e2m',
  '0978194836',
  'kh dx 01',
].forEach((query) => assert.equal(firstCustomerId(query), customer.id, `query ${query} should rank the matching customer first`));

[
  'tam',
  't\u00e2m',
  'TAM',
  'tam d',
  'anh tam',
].forEach((query) => assert.ok(searchCustomers(customers, query).some(item => item.id === customer.id), `query ${query} should include the matching customer`));

assert.equal(searchCustomers(customers, '  tam    xoai  ').length, 1);
assert.equal(searchCustomers(customers, 'khong ton tai').length, 0);
assert.equal(searchCustomers(customers, '').length, 2);
assert.equal(searchCustomers(customers, 't').length, 2);

const product = { id: 'product-1', name: 'V\u1ecbt M\u00f3c S\u1ea1ch', shortName: 'VMS', barcode: '893850000001', category: 'V\u1ecbt', unit: 'Con' };
assert.equal(searchProducts([product], 'moc vit')[0]?.id, product.id);
assert.equal(searchProducts([product], '89385')[0]?.id, product.id);

const invoice = { id: 'order-1', invoiceCode: 'HD-2026-0001', customerName: 'Anh T\u00e2m \u0110\u1ed3ng Xo\u00e0i', items: [{ productName: 'V\u1ecbt M\u00f3c S\u1ea1ch' }] };
assert.equal(searchInvoices([invoice], 'xoai vit')[0]?.id, invoice.id);
assert.equal(searchInvoices([invoice], '2026 0001')[0]?.id, invoice.id);

const customerOrders = [
  { id: 'order-july-19', customerName: 'Tu\u1ea5n Anh BigC', date: '19/07/2026 12:02' },
  { id: 'order-august-10', customerName: 'Tu\u1ea5n Anh BigC', date: '10/08/2026 15:57' },
  { id: 'order-july-29', customerName: 'Tu\u1ea5n Anh BigC', date: '29/07/2026 12:41' },
];
const rankedCustomerOrders = searchInvoices(customerOrders, 'tuan big');
assert.deepEqual(
  sortOrdersByNewest(rankedCustomerOrders).map(order => order.id),
  ['order-august-10', 'order-july-29', 'order-july-19'],
  'customer order search results should show the newest order first'
);
assert.deepEqual(
  customerOrders.map(order => order.id),
  ['order-july-19', 'order-august-10', 'order-july-29'],
  'sorting search results should not mutate the source order list'
);
assert.equal(
  getOrderRecencyTimestamp({ createdAt: { seconds: 1_786_329_600, nanoseconds: 0 } }),
  1_786_329_600_000,
  'Firestore timestamps should be supported'
);
assert.deepEqual(
  sortOrdersByNewest([
    { id: 'old-edited', createdAt: '2026-07-19T12:02:00+07:00', updatedAt: '2026-08-14T20:00:00+07:00' },
    { id: 'new-order', createdAt: '2026-08-10T15:57:00+07:00' },
  ]).map(order => order.id),
  ['new-order', 'old-edited'],
  'editing an old order should not make it look like the newest order'
);

const employee = { id: 'emp-1', name: 'Nguy\u1ec5n V\u0103n \u0110\u1ee9c', phone: '0901 111 222', position: 'Kinh doanh' };
assert.equal(searchEmployees([employee], 'duc nguyen')[0]?.id, employee.id);
assert.equal(searchEmployees([employee], '090111')[0]?.id, employee.id);

assert.deepEqual(buildSearchIndexTokens(customer, () => [{ key: 'primary', values: [customer.name] }]), ['anh', 'tam', 'dong', 'xoai']);

console.log('Search engine tests passed.');
