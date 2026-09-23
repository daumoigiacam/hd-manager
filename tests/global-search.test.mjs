import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildGlobalSearchSections,
  GLOBAL_SEARCH_HISTORY_KEY,
  readGlobalSearchHistory,
  writeGlobalSearchHistory,
} from '../src/utils/globalSearch.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

const customer = {
  id: 'customer-visible',
  name: 'Cửa hàng Đồng Xoài',
  phone: '0901 234 567',
  address: 'Bình Dương',
  customerGroup: 'Đại lý',
};
const hiddenCustomer = { id: 'customer-hidden', name: 'Khách ngoài phạm vi', phone: '0909 000 111' };
const product = { id: 'product-1', name: 'Vịt Móc Sạch', shortName: 'VMS', code: 'VMS-01', category: 'Vịt', unit: 'Con' };
const order = {
  id: 'order-2026-01',
  invoiceCode: 'HD-2026-01',
  customerId: customer.id,
  customerName: customer.name,
  customerPhone: customer.phone,
  date: '2026-09-20',
  items: [{ productName: product.name }],
};
const employee = { id: 'employee-1', name: 'Nguyễn An', phone: '0912 333 444', position: 'Kế toán', department: 'Tài chính' };
const transaction = { id: 'payment-1', title: 'Khoản thu', note: 'Thu đơn HD-2026-01', customerName: customer.name, amount: 125000, date: '2026-09-20', formattedAmount: '125.000 đ' };
const supplier = { id: 'supplier-1', name: 'Công ty Thực phẩm Xanh', phone: '0988 111 222' };
const document = { id: 'doc-1', fileName: 'Dang-kiem-HINO.pdf', assetName: 'HINO 300', plateNumber: '51A-12345', dataUrl: 'must-not-be-rendered' };

const allSections = buildGlobalSearchSections({
  query: 'dong xoai',
  customers: [customer, hiddenCustomer],
  visibleCustomers: [customer],
  products: [product],
  orders: [order],
  permissions: { customers: true, products: true, orders: true },
});
assert.deepEqual(allSections.map(section => section.id), ['customers', 'orders']);
assert.equal(allSections[0].items[0].id, customer.id);
assert.equal(allSections[0].items[0].detail, 'Đại lý');
assert.equal(allSections[1].items[0].id, order.id);
assert.ok(!JSON.stringify(allSections).includes(customer.phone), 'customer phone is not shown in result text');

const outOfScopeCustomer = buildGlobalSearchSections({
  query: 'khach ngoai pham vi',
  customers: [customer, hiddenCustomer],
  visibleCustomers: [customer],
  permissions: { customers: true },
});
assert.deepEqual(outOfScopeCustomer, [], 'customer matches must respect the module visibility scope');

const phoneWithoutPermission = buildGlobalSearchSections({
  query: '0901 234',
  customers: [customer],
  permissions: { customers: true },
  customerVisibility: { phone: false },
});
assert.deepEqual(phoneWithoutPermission, [], 'phone lookup cannot reveal a customer without phone permission');

const phoneWithPermission = buildGlobalSearchSections({
  query: '0901 234',
  customers: [customer],
  permissions: { customers: true },
  customerVisibility: { phone: true },
});
assert.equal(phoneWithPermission[0].items[0].id, customer.id);
assert.ok(!JSON.stringify(phoneWithPermission).includes(customer.phone), 'matched phone numbers stay hidden in the result UI');

const hiddenLocationInDetails = buildGlobalSearchSections({
  query: 'cua hang dong xoai',
  customers: [customer],
  permissions: { customers: true },
  customerVisibility: { location: false },
});
assert.ok(!JSON.stringify(hiddenLocationInDetails).includes('Bình Dương'), 'customer location is not shown without location permission');

const addressWithoutPermission = buildGlobalSearchSections({
  query: 'binh duong',
  customers: [customer],
  permissions: { customers: true },
  customerVisibility: { location: false },
});
assert.deepEqual(addressWithoutPermission, [], 'address lookup cannot reveal a customer without location permission');

const entities = buildGlobalSearchSections({
  query: 'vit moc',
  customers: [customer],
  products: [product],
  orders: [order],
  permissions: { customers: false, products: true, orders: true },
});
assert.deepEqual(entities.map(section => section.id), ['products', 'orders']);
assert.equal(entities[0].items[0].id, product.id);
assert.equal(entities[1].items[0].id, order.id);
assert.equal(entities[0].items[0].route, 'products');
assert.equal(entities[1].items[0].searchText, 'HD-2026-01');

const orderPhoneWithoutPermission = buildGlobalSearchSections({
  query: '0901 234',
  orders: [order],
  permissions: { orders: true },
});
assert.deepEqual(orderPhoneWithoutPermission, [], 'order search does not use phone fields without customer phone permission');

assert.deepEqual(buildGlobalSearchSections({ query: '   ', customers: [customer], permissions: { customers: true } }), []);
assert.equal(customer.name, 'Cửa hàng Đồng Xoài', 'search does not mutate source records');

const employeeResults = buildGlobalSearchSections({ query: 'ke toan', employees: [employee], permissions: { employees: true } });
assert.equal(employeeResults[0].items[0].id, employee.id);
assert.ok(!JSON.stringify(employeeResults).includes(employee.phone), 'employee phone is not searched or displayed');

const transactionResults = buildGlobalSearchSections({ query: 'hd-2026-01', transactions: [transaction], permissions: { transactions: true } });
assert.equal(transactionResults[0].items[0].id, transaction.id);
assert.ok(!JSON.stringify(transactionResults).includes(customer.phone), 'transaction results do not include customer phone');

const supplierResults = buildGlobalSearchSections({ query: 'thuc pham xanh', suppliers: [supplier], permissions: { suppliers: true } });
assert.equal(supplierResults[0].items[0].id, supplier.id);
assert.ok(!JSON.stringify(supplierResults).includes(supplier.phone), 'supplier phone is excluded');

const documentResults = buildGlobalSearchSections({ query: 'dang kiem hino', documents: [document], permissions: { documents: true } });
assert.equal(documentResults[0].items[0].id, document.id);
assert.ok(!JSON.stringify(documentResults).includes(document.dataUrl), 'document contents are never copied into search results');

assert.deepEqual(buildGlobalSearchSections({
  query: 'thuc pham xanh', suppliers: [supplier], permissions: { suppliers: false },
}), [], 'categories must stay hidden without module permission');

const mockStorage = {
  value: '',
  getItem(key) { assert.equal(key, GLOBAL_SEARCH_HISTORY_KEY); return this.value; },
  setItem(key, value) { assert.equal(key, GLOBAL_SEARCH_HISTORY_KEY); this.value = value; },
};
assert.deepEqual(writeGlobalSearchHistory(['khách hàng', 'đơn hàng', 'khách hàng'], mockStorage), ['khách hàng', 'đơn hàng']);
assert.deepEqual(readGlobalSearchHistory(mockStorage), ['khách hàng', 'đơn hàng']);

assert.match(appSource, /const renderShellSearchDialog = \(\) => shellSearchOpen &&/);
assert.match(appSource, /className="hd-shell-search-overlay"[\s\S]*?aria-modal="true"/);
assert.match(appSource, /\{renderShellSearchDialog\(\)\}/, 'the global dialog is rendered outside the desktop-only sidebar');
assert.match(appSource, /className="hd-header-global-search-button"[\s\S]*?aria-label="Tìm kiếm toàn ứng dụng"/);
assert.match(appSource, /useDebouncedValue\(shellSearchKeyword, 180\)/, 'global search is debounced');
assert.match(appSource, /Tìm kiếm gần đây/);
assert.match(appSource, /aria-busy=\{isShellSearchLoading\}/);
assert.match(appSource, /role="status"[^>]*>Đang tìm trong dữ liệu được phép xem/);
for (const category of ['suppliers', 'transactions', 'employees', 'documents']) {
  assert.match(appSource, new RegExp(`${category}:`), `${category} search must be permission-gated`);
}
assert.match(appStyles, /\.hd-shell-search-overlay\s*\{[^}]*position:\s*fixed/s, 'the shared dialog must stay available outside the sidebar on mobile');
const sidebarSearchStart = appSource.indexOf('className="hd-shell-search"');
const sidebarSearchEnd = appSource.indexOf('className="hd-sidebar-groups"', sidebarSearchStart);
assert.ok(sidebarSearchStart >= 0 && sidebarSearchEnd > sidebarSearchStart);
assert.ok(!appSource.slice(sidebarSearchStart, sidebarSearchEnd).includes('hd-shell-search-popover'), 'the dialog must not be clipped by sidebar/mobile navigation');

console.log('Global search tests passed.');
