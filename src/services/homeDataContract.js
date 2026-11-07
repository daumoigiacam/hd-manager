// These are the actual inputs of EmployeePersonalHomeView. A personal home
// does not need the company warehouse/product history used by executive reports.
// Salary/revenue/debt formulas still receive their complete original sources.
export const PERSONAL_HOME_COLLECTIONS=Object.freeze([
 'customers','orders','payments','expenses','financials','attendance','performance',
 'employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs',
]);
const empty=Object.freeze([]);
export function isPersonalHomeReadPlan(names) {
 return Array.isArray(names)&&names.length===PERSONAL_HOME_COLLECTIONS.length
  &&new Set(names).size===names.length&&PERSONAL_HOME_COLLECTIONS.every(name=>names.includes(name));
}
// Complete debt/payroll inputs remain primary. Dispatch history is a dependency
// of detailed costing/operations, not the four visible financial cards.
export const COMPANY_HOME_PRIMARY_COLLECTIONS=Object.freeze([
 'customers','payrollPeriods','employeeReviews','orders','payments','expenses','financials',
 'attendance','performance','warehouseImports','customerComplaints','holidays','deliveryReports',
]);
export function isCompanyPrimaryHomeReadPlan(names){
 return Array.isArray(names)&&names.length===COMPANY_HOME_PRIMARY_COLLECTIONS.length&&new Set(names).size===names.length
  &&COMPANY_HOME_PRIMARY_COLLECTIONS.every(name=>names.includes(name));
}
export function getForegroundReadCollections(tab,{companyHome,byTab,primaryHome=false,detailsRequested=false}) {
 if(tab==='home'&&!companyHome)return PERSONAL_HOME_COLLECTIONS;
 if(tab==='home'&&companyHome&&primaryHome&&!detailsRequested)return COMPANY_HOME_PRIMARY_COLLECTIONS;
 if(tab==='home'&&companyHome&&primaryHome&&detailsRequested)return byTab.executive_dashboard||byTab.home||empty;
 return byTab[tab]||empty;
}
export function areHomeSourcesCommitted({tenantId,state,collections}) {
 return Boolean(tenantId&&state?.tenantId===tenantId&&Array.isArray(collections)
  &&['companies','employees',...collections].every(name=>state.collections?.[name]===true));
}
