import {getCashExpenseFinance,getReportPeriod} from '../features/business-report/reportViewModel.js';

// Projection only: use the original report calculator, retain the full snapshot
// separately, and never substitute absent transactions or balances with zeros.
export function buildOfflineHomeOverview(snapshot,preparedFinance){
 if(!snapshot?.finance)throw Error('Complete Home finance required');
 const finance=preparedFinance||getCashExpenseFinance(snapshot.finance);
 const calendar=Object.fromEntries(Object.entries(finance).filter(([key,value])=>
  value===null||typeof value!=='object'||['series7Days','series30Days','series12Months'].includes(key)));
 // These exact report objects include cash/payroll basis, previous period and
 // chart rows. Removing source detail must not make the UI recalculate totals.
 const periodReports=Object.fromEntries(['today','week','month','quarter','year'].map(period=>[period,getReportPeriod(finance,period)]));
 return {overviewVersion:1,snapshot:{kind:'home-primary-v1',generatedAt:snapshot.generatedAt,finance:calendar,sourceCounts:snapshot.sourceCounts},periodReports};
}
