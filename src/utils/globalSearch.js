import {
  getOrderSearchFields,
  rankSearchRecords,
} from '../services/searchEngine.js';

const asText = (value) => `${value ?? ''}`.trim();

const getCustomerName = (customer = {}) => (
  asText(customer.displayName)
  || asText(customer.name)
  || asText(customer.shopName)
  || asText(customer.storeName)
  || asText(customer.companyName)
  || 'Khách hàng'
);

const getProductName = (product = {}) => (
  asText(product.shortName)
  || asText(product.productShortName)
  || asText(product.name)
  || asText(product.productName)
  || 'Sản phẩm'
);

const getOrderCode = (order = {}) => (
  asText(order.orderCode)
  || asText(order.invoiceCode)
  || asText(order.code)
  || asText(order.paymentCode)
  || (order.id ? `HD${`${order.id}`.slice(-6).toUpperCase()}` : 'Đơn hàng')
);

const compactDetail = (values) => values.map(asText).filter(Boolean).join(' · ');

export const GLOBAL_SEARCH_HISTORY_KEY = 'hd-manager-global-search-history-v1';

export const readGlobalSearchHistory = (storage) => {
  try {
    const targetStorage = storage || globalThis.localStorage;
    const value = JSON.parse(targetStorage?.getItem(GLOBAL_SEARCH_HISTORY_KEY) || '[]');
    return Array.isArray(value)
      ? [...new Set(value.map(asText).filter(Boolean))].slice(0, 6)
      : [];
  } catch {
    return [];
  }
};

export const writeGlobalSearchHistory = (queries, storage) => {
  const normalized = [...new Set((queries || []).map(asText).filter(Boolean))].slice(0, 6);
  try {
    const targetStorage = storage || globalThis.localStorage;
    targetStorage?.setItem(GLOBAL_SEARCH_HISTORY_KEY, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable in private browsing or embedded webviews.
  }
  return normalized;
};

const makeSection = (id, label, rankedResults, createItem, limit) => {
  const items = rankedResults.slice(0, limit).map(({ record }) => createItem(record));
  return items.length > 0 ? { id, label, items } : null;
};

export const buildGlobalSearchSections = ({
  query = '',
  customers = [],
  products = [],
  orders = [],
  employees = [],
  transactions = [],
  suppliers = [],
  documents = [],
  visibleCustomers = customers,
  permissions = {},
  customerVisibility = {},
  limitPerSection = 4,
} = {}) => {
  if (!asText(query)) return [];

  const sections = [];
  const customerById = new Map(visibleCustomers.map(customer => [`${customer?.id || ''}`, customer]));

  if (permissions.customers) {
    const rankedCustomers = rankSearchRecords(visibleCustomers, query, (customer = {}) => {
      const fields = [
        { key: 'primary', priority: 100, values: [customer.name, customer.displayName, customer.plainName, customer.shopName, customer.storeName, customer.companyName, customer.contactName] },
        { key: 'code', priority: 78, values: [customer.code, customer.customerCode] },
        { key: 'other', priority: 25, values: [customer.customerGroup, customer.group, customer.groupName] },
      ];
      if (customerVisibility.phone) {
        fields.push({ key: 'phone', priority: 82, values: [customer.phone, customer.phoneNumber] });
      }
      if (customerVisibility.location) {
        fields.push({ key: 'address', priority: 42, values: [customer.address, customer.locationInput, customer.area, customer.region, customer.route, customer.routeName] });
      }
      return fields;
    });
    sections.push(makeSection('customers', 'Khách hàng', rankedCustomers, (customer) => ({
      id: customer.id,
      kind: 'customer',
      route: 'customers',
      searchText: getCustomerName(customer),
      title: getCustomerName(customer),
      detail: compactDetail([
        customer.customerGroup || customer.groupName,
        customerVisibility.location ? customer.area || customer.region : '',
      ]),
    }), limitPerSection));
  }

  if (permissions.products) {
    const rankedProducts = rankSearchRecords(products, query, (product = {}) => [
      { key: 'primary', priority: 100, values: [product.name, product.productName, product.shortName, product.productShortName, product.alias, product.abbreviation] },
      { key: 'code', priority: 82, values: [product.code, product.sku, product.barcode] },
      { key: 'other', priority: 35, values: [product.category, product.mainGroup, product.unit, product.attributes, product.productAttributes, product.variants, product.attributeOptions] },
    ]);
    sections.push(makeSection('products', 'Sản phẩm', rankedProducts, (product) => ({
      id: product.id,
      kind: 'product',
      route: 'products',
      searchText: getProductName(product),
      title: getProductName(product),
      detail: compactDetail([product.category || product.mainGroup, product.unit, product.code || product.sku]),
    }), limitPerSection));
  }

  if (permissions.orders) {
    const rankedOrders = rankSearchRecords(orders, query, (order = {}) => {
      const fields = getOrderSearchFields(order, {
        getItemText: (record) => (record.items || []).flatMap(item => [
          item?.description,
          item?.productName,
          item?.productNameSnapshot,
          item?.productCode,
          item?.sku,
        ]),
        getCustomerText: (record) => {
          const customer = customerById.get(`${record.customerId || ''}`);
          return [customer?.name, customer?.displayName, customer?.plainName];
        },
      });
      return fields.map((field) => {
        if (field.key !== 'customer') return field;
        const customer = customerById.get(`${order.customerId || ''}`);
        return {
          ...field,
          values: [order.customerName, order.branchName, order.customerBranchName, customer?.name, customer?.displayName, customer?.plainName],
        };
      });
    });
    sections.push(makeSection('orders', 'Đơn hàng', rankedOrders, (order) => {
      const customer = customerById.get(`${order.customerId || ''}`);
      return {
        id: order.id,
        kind: 'order',
        route: 'orders',
        searchText: getOrderCode(order),
        title: getOrderCode(order),
        detail: compactDetail([order.customerName || customer?.name || customer?.displayName, order.date]),
      };
    }, limitPerSection));
  }

  if (permissions.suppliers) {
    const rankedSuppliers = rankSearchRecords(suppliers, query, (supplier = {}) => [
      { key: 'primary', priority: 100, values: [supplier.name, supplier.supplier, supplier.supplierName, supplier.customerName] },
      { key: 'code', priority: 75, values: [supplier.code, supplier.supplierCode, supplier.customerCode] },
      { key: 'other', priority: 30, values: [supplier.companyName, supplier.address, supplier.region] },
    ]);
    sections.push(makeSection('suppliers', 'Nhà cung cấp', rankedSuppliers, (supplier) => ({
      id: supplier.id || supplier.key || asText(supplier.name || supplier.supplierName),
      kind: 'supplier',
      route: 'warehouse_import',
      searchText: asText(supplier.name || supplier.supplier || supplier.supplierName || supplier.customerName),
      title: asText(supplier.name || supplier.supplier || supplier.supplierName || supplier.customerName) || 'Nhà cung cấp',
      detail: compactDetail([supplier.code || supplier.supplierCode, supplier.companyName || supplier.region]),
    }), limitPerSection));
  }

  if (permissions.transactions) {
    const rankedTransactions = rankSearchRecords(transactions, query, (transaction = {}) => [
      { key: 'primary', priority: 100, values: [transaction.title, transaction.note, transaction.category, transaction.customerName, transaction.customerNameSnapshot, transaction.reference, transaction.code] },
      { key: 'amount', priority: 72, values: [transaction.amount, transaction.formattedAmount] },
      { key: 'other', priority: 35, values: [transaction.date, transaction.method, transaction.sourceLabel, transaction.employeeName] },
    ]);
    sections.push(makeSection('transactions', 'Giao dịch', rankedTransactions, (transaction) => ({
      id: transaction.id,
      kind: 'transaction',
      route: 'finance',
      date: transaction.date,
      searchText: asText(transaction.title || transaction.note || transaction.category),
      title: asText(transaction.title || transaction.note || transaction.category) || 'Giao dịch',
      detail: compactDetail([transaction.date, transaction.formattedAmount]),
    }), limitPerSection));
  }

  if (permissions.employees) {
    const rankedEmployees = rankSearchRecords(employees, query, (employee = {}) => [
      { key: 'primary', priority: 100, values: [employee.name, employee.fullName, employee.displayName] },
      { key: 'code', priority: 75, values: [employee.employeeCode, employee.staffCode, employee.code] },
      { key: 'other', priority: 32, values: [employee.position, employee.role, employee.department, employee.departmentName, employee.branchName] },
    ]);
    sections.push(makeSection('employees', 'Nhân sự', rankedEmployees, (employee) => ({
      id: employee.id,
      kind: 'employee',
      route: 'employees',
      searchText: asText(employee.name || employee.fullName || employee.displayName),
      title: asText(employee.name || employee.fullName || employee.displayName) || 'Nhân sự',
      detail: compactDetail([employee.position || employee.role, employee.departmentName || employee.department || employee.branchName]),
    }), limitPerSection));
  }

  if (permissions.documents) {
    const rankedDocuments = rankSearchRecords(documents, query, (document = {}) => [
      { key: 'primary', priority: 100, values: [document.fileName, document.name, document.title, document.typeLabel, document.assetName] },
      { key: 'code', priority: 72, values: [document.plateNumber, document.assetCode, document.employeeName] },
      { key: 'other', priority: 30, values: [document.documentType, document.expiry, document.registrationNumber] },
    ]);
    sections.push(makeSection('documents', 'Chứng từ', rankedDocuments, (document) => ({
      id: document.id || document.key || asText(document.fileName || document.name),
      kind: 'document',
      route: document.route || 'asset_management',
      searchText: asText(document.fileName || document.name || document.title),
      title: asText(document.fileName || document.name || document.title) || 'Chứng từ',
      detail: compactDetail([document.assetName || document.employeeName, document.typeLabel || document.documentType, document.expiry]),
    }), limitPerSection));
  }

  return sections.filter(Boolean);
};
