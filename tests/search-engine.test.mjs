import assert from 'node:assert/strict';
import {
  buildSearchIndexTokens,
  normalizeSearchText,
  searchCustomers,
  searchEmployees,
  searchInvoices,
  searchProducts,
} from '../src/services/searchEngine.js';

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

const employee = { id: 'emp-1', name: 'Nguy\u1ec5n V\u0103n \u0110\u1ee9c', phone: '0901 111 222', position: 'Kinh doanh' };
assert.equal(searchEmployees([employee], 'duc nguyen')[0]?.id, employee.id);
assert.equal(searchEmployees([employee], '090111')[0]?.id, employee.id);

assert.deepEqual(buildSearchIndexTokens(customer, () => [{ key: 'primary', values: [customer.name] }]), ['anh', 'tam', 'dong', 'xoai']);

console.log('Search engine tests passed.');
