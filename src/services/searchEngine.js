/**
 * Shared, client-side search engine for HD Manager entities already loaded in
 * memory. It never mutates source records or causes Firestore reads.
 */

const isSearchableValue = (value) => value !== null && value !== undefined && `${value}`.trim() !== '';

export const normalizeSearchText = (value = '') => `${value}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0111/g, 'd')
  .replace(/\u0110/g, 'D')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const collapseSearchText = (value = '') => normalizeSearchText(value).replace(/\s+/g, '');

export const tokenizeSearchQuery = (value = '') => normalizeSearchText(value)
  .split(' ')
  .filter(Boolean);

export const hasSearchQuery = (value = '') => tokenizeSearchQuery(value).length > 0 || /\d/.test(`${value || ''}`);

const normalizeDigits = (value = '') => `${value || ''}`.replace(/\D/g, '');
const asList = (value) => Array.isArray(value) ? value : [value];
const unique = (values = []) => [...new Set(values.filter(isSearchableValue).map(value => `${value}`.trim()))];
const collectValues = (fields = []) => fields.flatMap((field) => asList(field?.value ?? field?.values ?? []));
const buildInitials = (value = '') => tokenizeSearchQuery(value).map(token => token.charAt(0)).join('');

const buildFieldIndex = (field = {}) => {
  const values = unique(asList(field?.value ?? field?.values ?? []));
  const normalizedValues = values.map(normalizeSearchText).filter(Boolean);
  const tokenSet = new Set(normalizedValues.flatMap(tokenizeSearchQuery));
  return {
    key: field?.key || 'other',
    priority: Number(field?.priority) || 10,
    values,
    normalizedValues,
    collapsedValues: normalizedValues.map(collapseSearchText).filter(Boolean),
    tokenSet,
    digits: normalizeDigits(values.join(' ')),
  };
};

const getBestTokenMatch = (token, fields) => {
  let best = null;

  fields.forEach((field) => {
    if (!token) return;
    if (/^\d+$/.test(token)) {
      if (field.digits.includes(token)) {
        const score = 55 + field.priority;
        if (!best || score > best.score) best = { field, kind: 'digits', score };
      }
      return;
    }

    if (field.tokenSet.has(token)) {
      const score = 70 + field.priority;
      if (!best || score > best.score) best = { field, kind: 'exact', score };
      return;
    }

    const hasPrefix = [...field.tokenSet].some(candidate => candidate.startsWith(token));
    if (hasPrefix) {
      const score = 45 + field.priority;
      if (!best || score > best.score) best = { field, kind: 'prefix', score };
    }
  });

  return best;
};

const buildSearchResult = (record, index, query, fields) => {
  const normalizedQuery = normalizeSearchText(query);
  const collapsedQuery = collapseSearchText(query);
  const tokens = tokenizeSearchQuery(query);
  const indexedFields = fields.map(buildFieldIndex).filter(field => field.normalizedValues.length > 0);

  if (!hasSearchQuery(query)) {
    return { record, index, score: 0, matchedFields: [], exact: false };
  }

  const tokenMatches = tokens.map(token => getBestTokenMatch(token, indexedFields));
  if (tokenMatches.some(match => !match)) return null;

  let score = 0;
  const primary = indexedFields.find(field => field.key === 'primary') || indexedFields[0];
  const directExact = indexedFields.some(field => (
    field.normalizedValues.includes(normalizedQuery)
    || (collapsedQuery && field.collapsedValues.includes(collapsedQuery))
  ));
  const primaryExact = Boolean(primary && (
    primary.normalizedValues.includes(normalizedQuery)
    || (collapsedQuery && primary.collapsedValues.includes(collapsedQuery))
  ));
  const primaryPrefix = Boolean(primary && normalizedQuery && primary.normalizedValues.some(value => value.startsWith(normalizedQuery)));

  if (primaryExact) score += 2000;
  else if (directExact) score += 1500;
  else if (primaryPrefix) score += 1100;
  else score += tokens.length > 1 ? 700 : 450;

  tokenMatches.forEach(match => {
    score += match.score;
    if (match.field.key === 'primary') score += match.kind === 'exact' ? 35 : 15;
  });

  const matchedFields = [...new Set(tokenMatches.map(match => match.field.key))];
  return { record, index, score, matchedFields, exact: primaryExact || directExact };
};

/**
 * Returns ranked records without modifying the records themselves. Ties retain
 * the original order so views stay stable while the user types.
 */
export const rankSearchRecords = (records = [], query = '', getFields = () => []) => {
  const source = Array.isArray(records) ? records : [];
  if (!hasSearchQuery(query)) return source.map((record, index) => ({ record, index, score: 0, matchedFields: [], exact: false }));

  return source
    .map((record, index) => buildSearchResult(record, index, query, getFields(record) || []))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index);
};

export const searchRecords = (records = [], query = '', getFields = () => []) => (
  rankSearchRecords(records, query, getFields).map(result => result.record)
);

const customerAliases = (customer = {}) => [
  customer?.name,
  customer?.plainName,
  customer?.displayName,
  customer?.customerHonorific,
  customer?.shopName,
  customer?.storeName,
  customer?.businessName,
  customer?.companyName,
  customer?.contactName,
  customer?.contactPerson,
  customer?.searchAliases,
];

const getCustomerBranchSearchValues = (customer = {}) => [
  ...(Array.isArray(customer?.branches) ? customer.branches : []),
  ...(Array.isArray(customer?.customerBranches) ? customer.customerBranches : []),
  ...(Array.isArray(customer?.deliveryBranches) ? customer.deliveryBranches : []),
].flatMap(branch => [branch?.name, branch?.branchName, branch?.label, branch?.code, branch?.phone, branch?.address, branch?.locationInput]);

export const getCustomerSearchFields = (customer = {}) => [
  { key: 'primary', priority: 100, values: customerAliases(customer) },
  { key: 'phone', priority: 82, values: [customer?.phone, customer?.phoneNumber, customer?.zaloContact, customer?.zaloPhone] },
  { key: 'code', priority: 78, values: [customer?.code, customer?.customerCode, customer?.id] },
  { key: 'address', priority: 42, values: [customer?.address, customer?.locationInput, customer?.area, customer?.region, customer?.route, customer?.routeName, ...getCustomerBranchSearchValues(customer)] },
  { key: 'other', priority: 25, values: [customer?.customerGroup, customer?.group, customer?.groupName, customer?.managerName, customer?.note, customer?.notes, customer?.searchText] },
];

export const searchCustomers = (customers = [], query = '') => searchRecords(customers, query, getCustomerSearchFields);
export const rankCustomerSearchResults = (customers = [], query = '') => rankSearchRecords(customers, query, getCustomerSearchFields);

export const getProductSearchFields = (product = {}) => [
  { key: 'primary', priority: 100, values: [product?.name, product?.productName, product?.shortName, product?.productShortName, product?.alias, product?.abbreviation, buildInitials(product?.name || product?.productName || '')] },
  { key: 'code', priority: 82, values: [product?.code, product?.sku, product?.barcode, product?.id] },
  { key: 'other', priority: 35, values: [product?.category, product?.mainGroup, product?.unit, product?.attributes, product?.productAttributes, product?.variants, product?.attributeOptions] },
];

export const searchProducts = (products = [], query = '') => searchRecords(products, query, getProductSearchFields);

const getOrderCode = (order = {}) => order?.orderCode || order?.invoiceCode || order?.code || order?.paymentCode || order?.id || '';

export const getOrderSearchFields = (order = {}, { getItemText } = {}) => {
  const itemText = typeof getItemText === 'function'
    ? getItemText(order)
    : (order?.items || []).flatMap(item => [item?.description, item?.productName, item?.productNameSnapshot, item?.productCode, item?.sku, item?.barcode]);
  return [
    { key: 'primary', priority: 100, values: [getOrderCode(order), order?.invoiceCode, order?.orderCode, order?.paymentCode] },
    { key: 'customer', priority: 78, values: [order?.customerName, order?.customer?.name, order?.customerPhone, order?.customer?.phone, order?.branchName, order?.customerBranchName] },
    { key: 'product', priority: 68, values: itemText },
    { key: 'other', priority: 30, values: [order?.date, order?.salesOwner?.name, order?.salesEmpName, order?.note, order?.notes] },
  ];
};

export const searchOrders = (orders = [], query = '', options = {}) => searchRecords(
  orders,
  query,
  order => getOrderSearchFields(order, options)
);

export const searchInvoices = searchOrders;

export const getEmployeeSearchFields = (employee = {}) => [
  { key: 'primary', priority: 100, values: [employee?.name, employee?.displayName, employee?.username, employee?.alias] },
  { key: 'phone', priority: 82, values: [employee?.phone, employee?.phoneNumber, employee?.email] },
  { key: 'code', priority: 75, values: [employee?.employeeCode, employee?.code, employee?.id] },
  { key: 'other', priority: 30, values: [employee?.position, employee?.role, employee?.department, employee?.address, employee?.searchText] },
];

export const searchEmployees = (employees = [], query = '') => searchRecords(employees, query, getEmployeeSearchFields);

export const buildSearchIndexTokens = (record = {}, getFields = () => []) => {
  const fields = getFields(record) || [];
  return [...new Set(tokenizeSearchQuery(collectValues(fields).join(' ')))];
};
