const orderFields = ['empId','employeeId','salesEmployeeId','createdByEmpId','createdBy','ownerEmpId','salesPersonId'];
const reportFields = ['empId','employeeId','driverId','createdByEmpId','createdBy'];

function indexRecords(records, fields) {
  const index = new Map();
  for (const record of records || []) {
    const ids = new Set(fields.map(field => `${record === undefined ? '' : record[field] || ''}`).filter(Boolean));
    for (const id of ids) {
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(record);
    }
  }
  return index;
}

// Build once for an evaluation batch, never cache against mutable array identity.
// Keep source order and all relationship aliases. Full month/company predicates
// still run on candidates; this index does not grant access or compute money.
export function buildEmployeeReviewSourceIndexes(orders, deliveryReports) {
  return { reviewOrdersByEmployee:indexRecords(orders,orderFields), reviewReportsByEmployee:indexRecords(deliveryReports,reportFields) };
}
