const normalizeGroupText = (value) => `${value ?? ''}`
  .trim()
  .toLocaleLowerCase('vi');

export const getOrderRequestShareCustomerKey = (row = {}, index = 0) => {
  const customerKey = row.customerId
    || normalizeGroupText(row.customerName)
    || `customer_${index}`;
  const branchKey = row.branchId
    || row.customerBranchId
    || normalizeGroupText(row.branchName || row.customerBranchName)
    || 'main';

  return `${customerKey}__${branchKey}`;
};

export const groupOrderRequestShareRowsByCustomer = (
  rows = [],
  { compareRows } = {},
) => {
  const groupsByCustomer = new Map();

  rows.forEach((row, index) => {
    const key = getOrderRequestShareCustomerKey(row, index);
    if (!groupsByCustomer.has(key)) {
      groupsByCustomer.set(key, {
        key,
        customerId: row.customerId || '',
        customerName: row.customerName || '',
        branchId: row.branchId || row.customerBranchId || '',
        branchName: row.branchName || row.customerBranchName || '',
        sortIndex: index,
        rows: [],
      });
    }

    groupsByCustomer.get(key).rows.push(row);
  });

  return Array.from(groupsByCustomer.values())
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((group) => ({
      ...group,
      rows: typeof compareRows === 'function'
        ? group.rows.slice().sort(compareRows)
        : group.rows.slice(),
    }));
};

export const buildOrderRequestSharePagesByCustomer = (
  customerGroups = [],
  rowsPerPage = 12,
) => {
  const safeRowsPerPage = Math.max(1, Number(rowsPerPage) || 12);
  const pages = [];
  let currentPageRows = [];

  customerGroups.forEach((group) => {
    const groupRows = Array.isArray(group?.rows) ? group.rows : [];
    if (groupRows.length === 0) return;

    if (
      currentPageRows.length > 0
      && currentPageRows.length + groupRows.length > safeRowsPerPage
    ) {
      pages.push(currentPageRows);
      currentPageRows = [];
    }

    // A customer's products stay together even when the group exceeds the target.
    currentPageRows.push(...groupRows);
  });

  if (currentPageRows.length > 0) pages.push(currentPageRows);
  return pages;
};
