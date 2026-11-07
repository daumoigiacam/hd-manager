import './legacyRuntime.js';
import {buildDashboardPayrollCostRows} from '@hd/online-home-payroll';
import {createHomePrimarySnapshotIterator,createExecutiveDashboardSnapshotIterator} from './executiveDashboardService.js';
import {withSalesRevenueIndex} from '../utils/salesRevenuePeriod.js';
// Uses the Firebase screen's already-authorized inputs. No reads, writes, auth,
// offline database or second data authority exist in this calculation worker.
let inputs={},payroll=null;
const payrollKeys=new Set(['company','employees','attendance','financials','performance','customers','orders','payments','holidays','now','dashboardDayKey','dashboardClockScope','payrollPeriods','lockedPayroll','employeeReviews','deliveryReports','customerComplaints','attendanceLoaded','complaintsLoaded']);
self.onmessage=({data})=>{try{
 if(data.reset){inputs={};payroll=null;}
 for(const key of Object.keys(data.patch)){if(payrollKeys.has(key))payroll=null;inputs[key]=data.patch[key];}
 if(data.append){const {key,rows,object}=data.append;if(payrollKeys.has(key))payroll=null;if(object)Object.assign(inputs[key],Object.fromEntries(rows));else inputs[key].push(...rows);}
 if(data.prepare)return;
 if(!payroll)payroll=withSalesRevenueIndex(()=>buildDashboardPayrollCostRows(inputs));
 const iterator=(data.mode==='full'?createExecutiveDashboardSnapshotIterator:createHomePrimarySnapshotIterator)({...inputs,payrollCosts:payroll});
 for(;;){const step=iterator.next();if(step.done){self.postMessage({id:data.id,snapshot:step.value,payrollCosts:payroll});break;}}
 }catch(error){self.postMessage({id:data.id,error:error.message});}};
