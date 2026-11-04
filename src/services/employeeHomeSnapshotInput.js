const names=['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs'];
const invalid=()=>{throw new TypeError('Incomplete private employee Home snapshot.');};

// SERVER-SIDE adapter groundwork, not an HTTP response. All histories stay
// private. Preserve the exact existing App source filtering and normalization;
// financial formulas are supplied from the original, build-time-extracted App.
export function buildEmployeeHomeSnapshotInput(snapshot,scope,helpers){
 if(!snapshot?.sources||!snapshot.counts||!scope?.employeeId||!scope.companyId||!scope.date
  ||snapshot.company?.documentId!==scope.companyId||snapshot.employee?.documentId!==scope.employeeId
  ||snapshot.employee.data?.companyId!==scope.companyId)invalid();
 const normalized=Object.create(null);
 for(const name of names){
  const source=snapshot.sources[name];if(!Array.isArray(source)||snapshot.counts[name]!==source.length)invalid();
  normalized[name]=source.map(row=>{
   if(!row||typeof row.documentId!=='string'||!row.documentId||!row.data||row.data.companyId!==scope.companyId)invalid();
   const record=Object.fromEntries(Object.entries(row.data).map(([key,value])=>[key,value&&typeof value.toDate==='function'?value.toDate().toISOString():value]));
   return {...record,id:row.documentId};
  });
 }
 const projectSourceRecord=helpers.projectSourceRecord||((_name,row)=>row);
 if(typeof projectSourceRecord!=='function')invalid();
 const active=name=>normalized[name].filter(row=>!row.isArchived).map(row=>projectSourceRecord(name,row));
 const employees=active('employees'),employee=employees.find(row=>row.id===scope.employeeId);if(!employee)invalid();
 const customers=active('customers'),orders=active('orders');
 const attendance=Object.create(null),performanceRecords=Object.create(null);
 for(const row of normalized.attendance)attendance[row.id]={...row,checkIn:row.checkIn?new Date(row.checkIn):null,checkOut:row.checkOut?new Date(row.checkOut):null};
 for(const row of normalized.performance)performanceRecords[row.id]=row;
 const performance=helpers.withSalesRevenueIndex(()=>{
  const agg={...performanceRecords};
  employees.forEach(emp=>{agg[emp.id]={...(agg[emp.id]||{overtime:0}),revenue:helpers.calculateMonthRevenue(emp.id,orders,customers)}});
  return agg;
 });
 return {employee,employees,date:scope.date,attendance,performance,customers,orders,
  financials:normalized.financials,payments:active('payments').filter(helpers.isCashflowOfficial),expenses:active('expenses').filter(helpers.isCashflowOfficial),
  holidays:active('holidays'),employeeReviews:active('employeeReviews'),deliveryReports:active('deliveryReports'),
  advanceRequests:active('advances'),assets:active('assets'),assetCostLogs:active('assetCostLogs'),
  record:helpers.resolveAttendanceAnomalyForDate(employee,attendance,scope.date)?.record||null};
}
