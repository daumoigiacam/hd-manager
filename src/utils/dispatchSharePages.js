export function splitDispatchSharePages(rows, customersPerPage = 15) {
  const groups = new Map();
  for (const [index, row] of rows.entries()) {
    const key = row.customerId || row.customerName || `row-${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const pages = [];
  let count = 0;
  for (const group of groups.values()) {
    if (count % customersPerPage === 0) pages.push([]);
    pages.at(-1).push(...group);
    count += 1;
  }
  return pages;
}
