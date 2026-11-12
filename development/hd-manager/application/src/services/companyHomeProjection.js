import {buildDashboardPayrollCostRows,buildCustomerReconciledLedgerMap,isCashflowOfficial,resolveCashflowDateKey,getLockedPayrollPeriod} from '@hd/company-home-domain';
import {buildExecutiveDashboardSnapshot,buildHomePeriodProduction} from './executiveDashboardService.js';
import {getCashExpenseFinance,getReportPeriod} from '../features/business-report/reportViewModel.js';
import {HOME_FEED_SOURCES} from '../data/homeFeedContract.js';
import {BusinessDate as Date} from '../utils/businessDate.js';
import {withSalesRevenueIndex} from '../utils/salesRevenuePeriod.js';
import {buildOfflineHomeOverview} from '../data/offlineHomeOverview.js';
export {HOME_FEED_SOURCES};
export function projectCompanyHome({sources,tenantId,asOfDay,payrollMonthCache}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOfDay)||HOME_FEED_SOURCES.some(name=>!Array.isArray(sources[name])))throw Error('Incomplete Home source manifest');
 for(const [name,rows]of Object.entries(sources))for(const row of rows){if(name==='companies'?row.id!==tenantId:row.companyId!==tenantId)throw Error('Home projection tenant mismatch');}
 const company=sources.companies.find(row=>row.id===tenantId);if(!company)throw Error('Company source missing');
 const now=new Date(asOfDay+'T12:00:00+07:00');
 if(now.getDate()!==Number(asOfDay.slice(8)))throw Error('Invalid business report day');
 const attendance=Object.fromEntries(sources.attendance.map(row=>[row.id,row]));
 const performance=Object.fromEntries(sources.performance.map(row=>[row.id,row]));
 const lockedPayroll={};
 for(const period of sources.payrollPeriods){if(!getLockedPayrollPeriod([period],tenantId,period.monthKey))continue;const snapshots=sources.payrollSnapshots.filter(row=>row.periodId===period.id||row.monthKey===period.monthKey);if(!snapshots.length)throw Error('Locked payroll snapshots not downloaded: '+period.monthKey);lockedPayroll[period.monthKey]={snapshots};}
 const ledgers=buildCustomerReconciledLedgerMap(sources.customers,sources.orders,sources.payments,sources.warehouseImports,sources.expenses);
 const debtLedger=sources.customers.filter(row=>!row.isArchived).map(row=>({id:row.id,name:row.name,debt:ledgers[row.id]?.currentDebt||0}));
 const cashExpenseRecords=sources.expenses.filter(isCashflowOfficial).map(row=>({...row,date:resolveCashflowDateKey(row)}));
 const inputs={...sources,company,now,attendance,performance,lockedPayroll,debtLedger,cashExpenseRecords,attendanceLoaded:true,complaintsLoaded:true,dashboardDayKey:asOfDay};
 const payrollCosts=withSalesRevenueIndex(()=>buildDashboardPayrollCostRows({...inputs,monthRowsCache:payrollMonthCache}));
 const snapshot=buildExecutiveDashboardSnapshot({...inputs,payrollCosts});
 const finance=getCashExpenseFinance(snapshot.finance);
 const reports=Object.fromEntries(['today','week','month','quarter','year'].map(period=>{const r=getReportPeriod(finance,period);const rows=(snapshot.finance.expenseDetailRows||[]).filter(x=>x.date>=r.startDate&&x.date<=r.endDate);return [period,{start:r.startDate,end:r.endDate,revenue:r.revenue,expense:r.expense,profit:r.profit,receivables:r.receivables,payables:finance.payables,salary:(finance.reportExpenseRows||[]).filter(x=>x.sourceType==='payroll'&&x.date>=r.startDate&&x.date<=r.endDate).reduce((s,x)=>s+x.value,0),costOfGoods:rows.filter(x=>x.sourceType==='costOfGoods').reduce((s,x)=>s+x.value,0),income:finance[{today:'incomeToday',week:'incomeWeek',month:'incomeMonth',quarter:'incomeQuarter',year:'incomeYear'}[period]],inventoryValue:snapshot.operations.inventoryValue,inventoryQuantity:snapshot.operations.inventoryQuantity}];}));
 const production=buildHomePeriodProduction(inputs,reports);for(const period of Object.keys(reports))reports[period].production=production[period];
 return {inputs,payrollCosts,snapshot,reports,overview:buildOfflineHomeOverview(snapshot,finance)};
}
