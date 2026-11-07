import './legacyRuntime.js';
import {buildDashboardPayrollCostRows,getDateKeyFromAnyValue,normalizeEmployeeReviewMonthKey} from '@hd/online-home-payroll';
import {createHomePrimarySnapshotIterator,createExecutiveDashboardSnapshotIterator} from './executiveDashboardService.js';
import {withSalesRevenueIndex} from '../utils/salesRevenuePeriod.js';
// Uses the Firebase screen's already-authorized inputs. No reads, writes, auth,
// offline database or second data authority exist in this calculation worker.
let inputs={},payroll=null;
const monthRows=new Map(),changedMonths=new Map();
const monthlySources=new Set(['orders','attendance','financials','deliveryReports','employeeReviews','customerComplaints']);
const payrollKeys=new Set(['company','employees','attendance','financials','performance','customers','orders','payments','holidays','now','dashboardDayKey','dashboardClockScope','payrollPeriods','lockedPayroll','employeeReviews','deliveryReports','customerComplaints','attendanceLoaded','complaintsLoaded']);
const invalidate=key=>{
 if(!payrollKeys.has(key))return;
 payroll=null;
 if(monthlySources.has(key)){if(!changedMonths.has(key))changedMonths.set(key,inputs[key]);}
 else{monthRows.clear();changedMonths.clear();}
};
const monthIndex=(source,value)=>{
 const grouped=new Map();const entries=source==='attendance'?Object.entries(value||{}):(value||[]).map(row=>[null,row]);
 for(const [key,row]of entries){const date=source==='attendance'?key.slice(0,10):source==='orders'?getDateKeyFromAnyValue(row.date||row.orderDate||row.createdAt):source==='financials'?getDateKeyFromAnyValue(row?.date):normalizeEmployeeReviewMonthKey((source==='employeeReviews'||source==='customerComplaints')?(row.monthKey||row.date||row.createdAt):(row.date||row.createdAt));
  // Use the exact existing business date helpers, including Timestamp and
  // timezone handling. Undated money belongs to every payroll month.
  if(!date){if(source==='financials')return null;continue;}
  const month=date.slice(0,7);if(!monthRows.has(month))continue;
  if(!grouped.has(month))grouped.set(month,[]);grouped.get(month).push(source==='attendance'?[key,row]:row);
 }
 return grouped;
};
self.onmessage=({data})=>{try{
 if(data.reset){inputs={};payroll=null;monthRows.clear();changedMonths.clear();}
 for(const key of Object.keys(data.patch)){invalidate(key);inputs[key]=data.patch[key];}
 if(data.append){const {key,rows,object}=data.append;invalidate(key);if(object)Object.assign(inputs[key],Object.fromEntries(rows));else inputs[key].push(...rows);}
 if(data.prepare)return;
 const started=performance.now();
 for(const [key,before]of changedMonths){const previous=monthIndex(key,before),next=monthIndex(key,inputs[key]);if(!previous||!next){monthRows.clear();break;}for(const month of monthRows.keys())if(JSON.stringify(previous.get(month)||[])!==JSON.stringify(next.get(month)||[]))monthRows.delete(month);}
 changedMonths.clear();
 if(!payroll)payroll=withSalesRevenueIndex(()=>buildDashboardPayrollCostRows({...inputs,monthRowsCache:monthRows}));
 const payrollMs=performance.now()-started,snapshotStart=performance.now();
 const iterator=(data.mode==='full'?createExecutiveDashboardSnapshotIterator:createHomePrimarySnapshotIterator)({...inputs,payrollCosts:payroll});
 for(;;){const step=iterator.next();if(step.done){self.postMessage({id:data.id,snapshot:step.value,payrollCosts:payroll,timings:{payrollMs,snapshotMs:performance.now()-snapshotStart,totalMs:performance.now()-started}});break;}}
 }catch(error){self.postMessage({id:data.id,error:error.message});}};
