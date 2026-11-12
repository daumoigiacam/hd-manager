import * as original from './payrollOriginalDomain.js';
import {getEntityTimestamp} from './payrollOriginalShared.js';
import {applyEmployeePayrollPolicyForMonth} from '../../utils/payrollPolicyHistory.js';
import {buildPayrollPeriodId,createPayrollEmployeeSnapshot,createPayrollPeriodRecord,getLockedPayrollPeriod,isPayrollPeriodLocked,canLockPayrollPeriodAtDate,getVietnamPayrollDateKey,mapPayrollSnapshotsToRows,getPayrollLockBlockers} from '../../utils/payrollPeriodLock.js';
import {inspectPayrollSnapshot} from '../../utils/payrollSnapshotIntegrity.js';
import {createPayrollDebtCarryovers,createPayrollPeriodLockJournalEntry,buildPayrollDebtCarryoverId,getNextPayrollMonthKey} from '../../utils/payrollDebtCarryover.js';
import {createPayrollAdjustment,createPayrollAdjustmentAuditLog,buildAdjustedDebtCarryoverPatch,getLatestPayrollAdjustmentsBySnapshot} from '../../utils/payrollAdjustment.js';
export const PAYROLL_INPUT_SOURCES=Object.freeze(['companies','employees','attendance','financials','performance','customers','orders','payments','holidays','employeeReviews','deliveryReports','customerComplaints','payrollPeriods','payrollSnapshots','payrollDebtCarryovers','payrollAdjustments']);
export const PAYROLL_COMMAND_CAPS=Object.freeze({'payroll.lock':'payroll.lock','payroll.adjust':'payroll.adjust'});
export const PAYROLL_COMPANY_READ='payroll.company.read';
export const payrollId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
export const payrollMonth=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const payrollFail=(message,code='payroll-unsupported-contract')=>{throw Object.assign(Error(message),{code});};
export const canonicalPayroll=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonicalPayroll).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalPayroll(v[k])).join(',')+'}';
// The existing feed removes credentials. Strip the same non-payroll fields from
// authoritative reads; never mutate the stored company/employee documents.
export function plainPayroll(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return v;
 if(typeof v==='number'&&Number.isFinite(v))return v;
 // Match the existing Home feed JSON codec exactly, retaining nanoseconds for
 // whole-body CAS instead of collapsing distinct timestamps to milliseconds.
 if(v&&typeof v.toDate==='function'&&typeof v.toJSON==='function')return plainPayroll(v.toJSON());
 if(v instanceof Date)return v.toISOString();
 if(Array.isArray(v))return v.map(plainPayroll);
 if(v&&typeof v==='object'){const out={};for(const [k,value]of Object.entries(v)){if(/(password|token|secret|apikey|map.*key)$/i.test(k))continue;if(value!==undefined)Object.defineProperty(out,k,{value:plainPayroll(value),enumerable:true,writable:true,configurable:true});}return out;}
 payrollFail('Dữ liệu lương không phải JSON đầy đủ.');
}
export function payrollManager(employee,user){return !!employee&&(original.isOwnerAccountUser(employee,user)||user?.role==='super_admin'||original.isAccountingPosition(employee.position));}
export function payrollCapabilities(subject){
 if(!subject?.employee||subject.employee.isArchived||subject.employee.companyId!==subject.company?.id)return [];
 const manage=payrollManager(subject.employee,subject.currentUser);
 return [...(manage||original.hasCompanyRolePermissionAction(subject,'payroll','view_all_payroll')?[PAYROLL_COMPANY_READ]:[]),...(manage?['payroll.lock','payroll.adjust']:[])];
}
export function validatePayrollSources(sources,tenant){
 const result={};
 for(const source of PAYROLL_INPUT_SOURCES){
  if(!Array.isArray(sources?.[source]))payrollFail('Thiếu nguồn lương hoàn tất '+source,'source-catchup');
  const ids=new Set();result[source]=sources[source].map(input=>{const d=plainPayroll(input);if(!payrollId(d?.id)||ids.has(d.id)||(source==='companies'?d.id!==tenant:d.companyId!==tenant)||d.__pendingFirebaseSync||d.__pendingLocalSync||d.sourceSystem==='hd-connect-vps'||d.readOnlyLedger||d.sourceArchiveSha256)payrollFail('Nguồn lương ngoài phạm vi, trùng hoặc cần hợp đồng VPS riêng.','permission-denied');ids.add(d.id);return d;}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 }
 if(result.companies.length!==1||result.companies[0].isArchived)payrollFail('Cần đúng công ty nguồn còn hiệu lực đã cấp quyền.');return result;
}
export function payrollCalculationInput(sources,tenant,monthKey){
 const data=validatePayrollSources(sources,tenant);if(!payrollMonth(monthKey))payrollFail('Tháng lương không hợp lệ.','invalid-argument');
 const active=name=>data[name].filter(x=>!x.isArchived),employees=active('employees');
 const attendance=Object.fromEntries(data.attendance.map(x=>[x.id,x])),performance=Object.fromEntries(data.performance.map(x=>[x.id,x]));
 original.withSalesRevenueIndex(()=>{for(const emp of employees)performance[emp.id]={...(performance[emp.id]||{overtime:0}),revenue:original.calculateMonthRevenue(emp.id,active('orders'),active('customers'))};});
 const payrollPolicyEmployees=employees.map(emp=>applyEmployeePayrollPolicyForMonth(emp,monthKey)),visibleSalaryEmployees=payrollPolicyEmployees.filter(emp=>emp.id&&emp.role!=='super_admin'&&!original.isOwnerPosition(emp.position));
 return {data,currentMonth:monthKey,isPayrollLocked:false,employeeReviews:active('employeeReviews'),orders:active('orders'),deliveryReports:active('deliveryReports'),complaintsLoaded:true,customerComplaints:active('customerComplaints'),payrollCompanyId:tenant,attendance,attendanceLoaded:true,currentCompany:data.companies[0],employees,visibleSalaryEmployees,payrollDebtCarryovers:active('payrollDebtCarryovers'),payrollPolicyEmployees,financials:active('financials'),performance,customers:active('customers'),payments:active('payments'),holidays:active('holidays')};
}
export function* payrollProjectionSteps(input){return yield* original.buildPayrollViewProjectionSteps(input);}
export function payrollRows(input){const iterator=payrollProjectionSteps(input);let step;do{step=iterator.next();}while(!step.done);return step.value.rows;}
// Same reducer and avgDaily expression as SalaryView.aggregateData; no rounding.
export function originalPayrollTotals(rows){
 const totals=rows.reduce((acc,row)=>{acc.totalSalary+=row.details.netSalary;acc.totalDays+=row.details.workDays;acc.totalAdvance+=row.details.totalAdvance;acc.totalEmployeePurchase+=row.details.totalEmployeePurchase||0;acc.totalPenalty+=row.details.totalPenalty;acc.totalBonus+=row.details.totalBonus||0;acc.totalEvaluationBonus+=row.details.evaluationBonus||0;acc.totalOpeningDebt+=row.details.openingDebt||0;acc.totalOpeningDebtApplied+=row.details.openingDebtApplied||0;acc.totalEndingDebt+=row.details.endingDebt||0;return acc;},{totalSalary:0,totalDays:0,totalAdvance:0,totalEmployeePurchase:0,totalPenalty:0,totalBonus:0,totalEvaluationBonus:0,totalOpeningDebt:0,totalOpeningDebtApplied:0,totalEndingDebt:0});
 return {...totals,avgDaily:totals.totalDays>0?totals.totalSalary/totals.totalDays:0};
}
export function planPayroll(sources,kind,values,actor,{editedAt,mutationId}={}){
 const data=validatePayrollSources(sources,actor.tenantId),employee=data.employees.find(e=>e.id===actor.employeeId);
 if(!PAYROLL_COMMAND_CAPS[kind]||!payrollManager(employee,{...employee,id:actor.employeeId})||employee?.isArchived||!payrollId(mutationId)||!Number.isFinite(Date.parse(editedAt)))payrollFail('Chỉ chủ doanh nghiệp hoặc kế toán được chốt/điều chỉnh kỳ lương.','permission-denied');
 if(!payrollMonth(values?.monthKey)||Object.keys(values).some(k=>!(kind==='payroll.lock'?['monthKey']:['monthKey','snapshotId','nextNetSalary','nextEndingDebt','reason']).includes(k)))payrollFail('Giá trị thao tác lương không hợp lệ.','invalid-argument');
 // Audit logs are OUTPUT-only. Their new deterministic IDs have an explicit
 // expected-absence precondition, independently read by the server transaction.
 // This never invents an empty audit feed or exposes unrelated security logs.
 const tenant=actor.tenantId,monthKey=values.monthKey,periodId=buildPayrollPeriodId(tenant,monthKey),by=(s,id)=>s==='activityLogs'?null:data[s].find(d=>d.id===id)||null,writes=[];
 const put=(source,body)=>{if(!body||body.companyId!==tenant||!payrollId(body.id)||writes.some(w=>w.source===source&&w.id===body.id))payrollFail('Kế hoạch lương trùng hoặc ngoài công ty.');writes.push({source,id:body.id,body:plainPayroll(body)});};
 const period=by('payrollPeriods',periodId);
 if(kind==='payroll.lock'){
  if(isPayrollPeriodLocked(period)||!canLockPayrollPeriodAtDate(monthKey,getVietnamPayrollDateKey(new Date(editedAt))))payrollFail('Kỳ đã chốt hoặc chưa đến ngày cuối tháng.');
  const rows=payrollRows(payrollCalculationInput(data,tenant,monthKey));
  const snapshots=rows.map((row,orderIndex)=>createPayrollEmployeeSnapshot({companyId:tenant,monthKey,employee:row.emp,salaryDetails:row.details,orderIndex,lockedAt:editedAt,lockedByEmployeeId:employee.id}));
  const blockers=getPayrollLockBlockers(snapshots);if(blockers.length)payrollFail('Snapshot chưa đủ điều kiện. '+blockers.join(' '));
  const locked=createPayrollPeriodRecord({companyId:tenant,monthKey,snapshots,totals:originalPayrollTotals(rows),lockedAt:editedAt,lockedByEmployeeId:employee.id,lockedByName:employee.name||employee.displayName||'',lockedByRole:employee.position||employee.role||''});
  const carryovers=createPayrollDebtCarryovers({companyId:tenant,monthKey,snapshots,employees:data.employees,lockedAt:editedAt}),totalEndingDebt=carryovers.reduce((sum,r)=>sum+(Number(r.carryover.amount)||0),0),journal=createPayrollPeriodLockJournalEntry({companyId:tenant,periodId,monthKey,lockedAt:editedAt,lockedByEmployeeId:employee.id,lockedByName:locked.lockedByName,employeeCount:snapshots.length,totalEndingDebt,totalPayroll:snapshots.reduce((sum,s)=>sum+(Number(s.salaryDetails.netSalary)||0),0),negativeEmployeeCount:carryovers.length});
  for(const s of snapshots){if(by('payrollSnapshots',s.id))payrollFail('Snapshot đã tồn tại; không ghi đè.');put('payrollSnapshots',s);}
  for(const {carryover,journalEntry}of carryovers){if(by('payrollDebtCarryovers',carryover.id))payrollFail('Dư nợ chuyển kỳ đã tồn tại; không ghi đè.');put('payrollDebtCarryovers',carryover);put('activityLogs',journalEntry);}
  if(journal)put('activityLogs',journal);
  put('payrollPeriods',{...locked,debtRolloverStatus:'complete',debtRolloverCompletedAt:editedAt,debtCarryoverIds:carryovers.map(r=>r.carryover.id),debtTransferCount:carryovers.length,totalEndingDebt});
 }else{
  if(!period||!isPayrollPeriodLocked(period)||!payrollId(values.snapshotId)||typeof values.reason!=='string'||!values.reason.trim()||values.reason.length>4000||![values.nextNetSalary,values.nextEndingDebt].every(n=>Number.isFinite(n)&&n>=0&&n<=1e12))payrollFail('Cần kỳ đã chốt, snapshot và lý do điều chỉnh hợp lệ.');
  const snapshot=by('payrollSnapshots',values.snapshotId);if(!snapshot||snapshot.periodId!==periodId||snapshot.monthKey!==monthKey||!inspectPayrollSnapshot(snapshot).isComplete)payrollFail('Snapshot không thuộc kỳ hoặc thiếu bản gốc toàn vẹn.');
  const nextMonth=getNextPayrollMonthKey(monthKey);if(getLockedPayrollPeriod(data.payrollPeriods,tenant,nextMonth))payrollFail('Kỳ lương kế tiếp đã khóa; không thay chuỗi lịch sử.');
  const previousId=period.latestAdjustmentBySnapshot?.[snapshot.id],previous=previousId?by('payrollAdjustments',previousId):null;if(previousId&&!previous)payrollFail('Thiếu phiếu điều chỉnh trước; không suy số gốc.');
  const carryoverId=buildPayrollDebtCarryoverId(tenant,nextMonth,snapshot.employeeId),existingCarryover=by('payrollDebtCarryovers',carryoverId),adjustment=createPayrollAdjustment({period,snapshot,previousAdjustment:previous,nextNetSalary:values.nextNetSalary,nextEndingDebt:values.nextEndingDebt,reason:values.reason,adjustedAt:editedAt,adjustedByEmployeeId:employee.id,adjustedByName:employee.name||employee.displayName||'',adjustedByRole:employee.position||employee.role||''});
  if(!adjustment||by('payrollAdjustments',adjustment.id))payrollFail('Mã điều chỉnh đã tồn tại; không ghi đè.');
  const audit=createPayrollAdjustmentAuditLog(adjustment),carryover=buildAdjustedDebtCarryoverPatch({adjustment,existingCarryover}),totals={...period.totals,totalSalary:Number(period.totals?.totalSalary||0)+Number(adjustment.differences.netSalary||0),totalEndingDebt:Math.max(0,Number(period.totals?.totalEndingDebt||0)+Number(adjustment.differences.endingDebt||0))},oldIds=Array.isArray(period.debtCarryoverIds)?period.debtCarryoverIds:[],ids=carryover?.id&&!oldIds.includes(carryover.id)?[...oldIds,carryover.id]:oldIds;
  put('payrollAdjustments',adjustment);if(audit)put('activityLogs',audit);if(carryover)put('payrollDebtCarryovers',carryover);
  put('payrollPeriods',{...period,status:'ADJUSTED',totals,totalEndingDebt:totals.totalEndingDebt,debtCarryoverIds:ids,debtTransferCount:ids.length,adjustmentCount:Math.max(0,Number(period.adjustmentCount||0))+1,latestAdjustmentBySnapshot:{...period.latestAdjustmentBySnapshot,[snapshot.id]:adjustment.id},lastAdjustmentId:adjustment.id,lastAdjustedAt:editedAt,lastAdjustedByEmployeeId:adjustment.adjustedByEmployeeId,updatedAt:editedAt});
 }
 if(writes.length>450)payrollFail('Quá giới hạn chốt nguyên tử 450 bản ghi; chưa thay dữ liệu.');
 const base=writes.map(w=>({source:w.source,id:w.id,body:by(w.source,w.id)}));
 return plainPayroll({periodId,monthKey,writes,base});
}
export function validatePayrollPayload(kind,p){
 if(!PAYROLL_COMMAND_CAPS[kind]||!p||Object.keys(p).sort().join(',')!=='baseFingerprint,checkpoint,editedAt,employeeId,inputFingerprint,plan,resolvesConflictId,values,version'||p.version!==1||!(p.resolvesConflictId===null||payrollId(p.resolvesConflictId))||!payrollId(p.employeeId)||!/^\d{4}-\d{2}-\d{2}T/.test(p.editedAt)||!Number.isFinite(Date.parse(p.editedAt))||![p.baseFingerprint,p.inputFingerprint].every(x=>/^[a-f0-9]{64}$/.test(x))||!payrollMonth(p.values?.monthKey)||!payrollId(p.plan?.periodId)||p.plan.monthKey!==p.values.monthKey||!Array.isArray(p.plan.base)||!Array.isArray(p.plan.writes)||p.plan.writes.length<1||p.plan.writes.length>450||p.plan.base.length!==p.plan.writes.length||!payrollId(p.checkpoint?.generation)||!Number.isSafeInteger(p.checkpoint.seq)||p.checkpoint.seq<0)payrollFail('Payload lương không hợp lệ.','invalid-argument');
 const allowed=kind==='payroll.lock'?['payrollPeriods','payrollSnapshots','payrollDebtCarryovers','activityLogs']:['payrollAdjustments','payrollPeriods','payrollDebtCarryovers','activityLogs'];
 const keys=new Set();for(let i=0;i<p.plan.writes.length;i++){const w=p.plan.writes[i],b=p.plan.base[i],key=w.source+'/'+w.id;if(!allowed.includes(w.source)||!payrollId(w.id)||keys.has(key)||b.source!==w.source||b.id!==w.id||w.body?.id!==w.id)payrollFail('Kế hoạch compound lương không hợp lệ.');keys.add(key);}
 plainPayroll(p);if(JSON.stringify(p).length>512000)payrollFail('Kỳ lương vượt giới hạn 512000 ký tự của Outbox hiện có; cần hợp đồng gói nguyên tử lớn hơn, không chia kỳ tùy tiện.');return p;
}
export function acceptedPayrollWrites(receipt){return receipt.writes.map(w=>({...w,body:receipt.kind==='payroll.lock'&&(w.source==='payrollPeriods'||w.source==='activityLogs'&&w.body.type==='payroll_period_lock')?{...w.body,closedAtServer:receipt.closedAtServer}:w.body}));}
export const validPayrollServerTime=value=>getEntityTimestamp({timestamp:value})>0;
export {buildPayrollPeriodId,getLockedPayrollPeriod,mapPayrollSnapshotsToRows,getLatestPayrollAdjustmentsBySnapshot,isPayrollPeriodLocked,canLockPayrollPeriodAtDate,getVietnamPayrollDateKey};
