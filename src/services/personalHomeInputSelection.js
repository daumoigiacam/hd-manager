// A calculation input slice, never a collection snapshot/readiness claim.
// Keep every historical debt row of the employee's customers, every potential
// direct/downline revenue row and every review row. Dates/amounts/names are not
// deduplication keys. Preserve source order, duplicate IDs and original records.
export function* selectPersonalHomeProjectionInput(input,policy) {
 const {employee,employees,customers,orders,payments}=input;
 const employeeId=employee?.id;
 if(!employeeId||!Array.isArray(employees)||!Array.isArray(customers)||!Array.isArray(orders)||!Array.isArray(payments))
  throw new TypeError('Missing complete personal Home inputs.');
 const revenueEmployees=new Set([`${employeeId}`.trim()]);
 for(const row of employees){
  yield;
  if(row&&!row.isArchived&&row.id!==`${employeeId}`.trim()&&policy.isSales(row)&&policy.leaderId(row)===`${employeeId}`.trim())
   revenueEmployees.add(`${row.id||''}`.trim());
 }
 const debtCustomers=new Set(),revenueCustomers=new Set();
 for(const customer of customers){
  yield;
  if(!customer)continue;
  // Malformed legacy identities cannot safely be reduced. Preserve the exact
  // original calculation (including its error behavior) instead of guessing.
  if(customer.empId===employeeId&&(typeof customer.id!=='string'||!customer.id))return input;
  // buildSalaryDetails uses strict ownership and buildCustomerLedger uses
  // customer.id || customer, not a guessed name/phone relationship.
  if(customer.empId===employeeId&&customer.id)debtCustomers.add(customer.id);
  // A conservative union handles both first/last duplicate-customer lookups
  // used by the existing Home count and salary revenue calculations.
  if(revenueEmployees.has(`${customer.empId||''}`.trim())&&customer.id)
   revenueCustomers.add(`${customer.id}`.trim());
 }
 const selectedOrders=[],selectedPayments=[];
 for(const order of orders){
  yield;
  if(!order){selectedOrders.push(order);continue}
  if(debtCustomers.has(order.customerId)||revenueCustomers.has(`${order.customerId||''}`.trim())
   ||[order.salesEmpId,order.createdByEmpId,order.empId].some(id=>revenueEmployees.has(`${id||''}`.trim()))
   ||policy.reviewOrder(order,employeeId))selectedOrders.push(order);
 }
 for(const payment of payments){yield;if(payment&&debtCustomers.has(payment.customerId))selectedPayments.push(payment)}
 return {...input,orders:selectedOrders,payments:selectedPayments};
}
