import{PAYROLL_INPUT_SOURCES,validatePayrollSources,payrollCalculationInput,payrollProjectionSteps,canonicalPayroll,plainPayroll,payrollId,payrollMonth,payrollManager,getLockedPayrollPeriod,getVietnamPayrollDateKey}from'./offlinePayrollProtocol.js';
import{hasCompanyRolePermissionAction,isOwnerPosition}from'./payrollOriginalDomain.js';import{parseLooseMoneyValue,roundMoneyValue}from'./payrollOriginalShared.js';
import{getEmployeeSalaryAdvanceLimitConfig,getEmployeeSalaryAdvancePercent}from'./advanceOriginalPolicy.js';import{getSalaryAdvanceMonth,isSalaryAdvanceInMonth}from'../../utils/salaryAdvancePeriod.js';
export{canonicalPayroll as canonicalAdvance};
export const ADVANCE_SOURCES=Object.freeze([...PAYROLL_INPUT_SOURCES,'advances']);
export const ADVANCE_KINDS=Object.freeze(['salaryAdvance.create','salaryAdvance.approve','salaryAdvance.reject','salaryAdvance.archive']);
const fail=(message,code='invalid-argument')=>{throw Object.assign(Error(message),{code});};
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};
export function salaryAdvanceCapabilities(subject){
 const yes=a=>hasCompanyRolePermissionAction(subject,'payroll',a),manage=payrollManager(subject.employee,subject.currentUser);
 return [...(yes('create_salary_advance_request')?['salaryAdvance.create']:[]),...(yes('create_salary_advance_for_others')?['salaryAdvance.createForOthers']:[]),...(manage||yes('approve_salary_advance')||yes('approve_advance')?['salaryAdvance.approve']:[]),...(manage||yes('reject_salary_advance')||yes('approve_advance')?['salaryAdvance.reject']:[]),...(manage||yes('delete_salary_advance')||yes('approve_advance')?['salaryAdvance.archive']:[])];
}
export function validateAdvanceSources(input,tenant){
 const result=validatePayrollSources(input,tenant);if(!Array.isArray(input.advances))fail('Thiếu nguồn lệnh ứng đã lưu.');const ids=new Set();result.advances=input.advances.map(raw=>{const d=plainPayroll(raw);if(!payrollId(d.id)||ids.has(d.id)||d.companyId!==tenant||d.__pendingLocalSync||d.__pendingFirebaseSync)fail('Nguồn ứng trùng hoặc sai tenant.');ids.add(d.id);return d;}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);return result;
}
export function validateAdvanceValues(kind,values){
 if(!ADVANCE_KINDS.includes(kind)||!values||Array.isArray(values)||Object.keys(values).some(k=>!(kind==='salaryAdvance.create'?['employeeId','amount','reason','monthKey']:['requestId']).includes(k)))fail('Thao tác ứng không hợp lệ.');
 if(kind==='salaryAdvance.create'){if(!payrollId(values.employeeId)||!Number.isSafeInteger(values.amount)||values.amount<=0||values.amount>1e12||typeof values.reason!=='string'||values.reason.length>2000||!payrollMonth(values.monthKey))fail('Nhập nhân sự, số tiền VND và kỳ ứng hợp lệ.');}
 else if(!payrollId(values.requestId))fail('Mã lệnh ứng không hợp lệ.');return plainPayroll(values);
}
export async function planSalaryAdvance(input,kind,rawValues,actor,{editedAt,mutationId,yieldToHost=()=>Promise.resolve()}={}){
 const values=validateAdvanceValues(kind,rawValues),data=validateAdvanceSources(input,actor.tenantId),employee=data.employees.find(e=>e.id===actor.employeeId),subject={company:data.companies[0],employee,currentUser:employee};
 if(!employee||employee.isArchived||!payrollId(mutationId)||!Number.isFinite(Date.parse(editedAt))||!salaryAdvanceCapabilities(subject).includes(kind))fail('Thiếu quyền thao tác ứng theo vai trò gốc.','permission-denied');
 const by=(s,id)=>data[s]?.find(d=>d.id===id)||null,writes=[],tenant=actor.tenantId;
 const put=(source,body)=>{if(!payrollId(body.id)||body.companyId!==tenant||writes.some(w=>w.source===source&&w.id===body.id))fail('Phiếu ứng sai công ty hoặc trùng.');writes.push({source,id:body.id,body:plainPayroll(body)});};
 let monthKey,summary=null;
 if(kind==='salaryAdvance.create'){
  monthKey=values.monthKey;const targetEmployee=by('employees',values.employeeId),own=values.employeeId===employee.id;
  if(!targetEmployee||targetEmployee.isArchived||!own&&(isOwnerPosition(targetEmployee.position)||targetEmployee.role==='super_admin'||!salaryAdvanceCapabilities(subject).includes('salaryAdvance.createForOthers')))fail('Không có quyền tạo lệnh ứng cho nhân sự này.','permission-denied');
  if(getLockedPayrollPeriod(data.payrollPeriods,tenant,monthKey))fail('Kỳ lương đã khóa; không thêm ứng.');
  const iterator=payrollProjectionSteps(payrollCalculationInput(data,tenant,monthKey));let step;do{step=iterator.next();if(!step.done)await yieldToHost();}while(!step.done);
  const details=step.value.rows.find(row=>row.emp.id===targetEmployee.id)?.details;if(!details)fail('Chưa có chi tiết lương gốc để kiểm tra hạn mức.');
  const config=getEmployeeSalaryAdvanceLimitConfig(data.companies[0],targetEmployee,null),percent=config.percent??getEmployeeSalaryAdvancePercent(data.companies[0],targetEmployee,null),pending=data.advances.filter(req=>!req.isArchived&&req.empId===targetEmployee.id&&req.status==='pending'&&isSalaryAdvanceInMonth(req,monthKey)),pendingAmount=pending.reduce((sum,req)=>sum+parseLooseMoneyValue(req.amount),0),baseAmount=Math.max(0,roundMoneyValue(details.grossSalary||details.netSalary||0)),limit=config.isUnlimited?null:roundMoneyValue(baseAmount*(percent/100)),used=roundMoneyValue((details.totalAdvance||0)+pendingAmount),remaining=config.isUnlimited?null:Math.max(0,roundMoneyValue(limit-used));
  if(!config.isUnlimited&&values.amount>remaining)fail('Số tiền ứng vượt hạn mức còn lại.');summary={baseAmount,limit,used,remaining,isUnlimited:config.isUnlimited,percent:config.isUnlimited?null:percent};
  const id='adv_'+mutationId;if(by('advances',id))fail('Mã yêu cầu ứng đã tồn tại.');
  // Original handleAddAdvanceRequest payload, with immutable mutation identity.
  put('advances',{id,companyId:tenant,empId:values.employeeId,amount:parseLooseMoneyValue(values.amount),reason:capitalizeFirst(values.reason||'Ứng lương'),date:getVietnamPayrollDateKey(new Date(editedAt)),status:'pending',createdAt:editedAt,createdBy:employee.id,salaryMonth:monthKey,salaryAdvancePercent:summary.percent,salaryAdvanceLimitMode:summary.isUnlimited?'unlimited':'percent',salaryAdvanceBaseAmount:summary.baseAmount,salaryAdvanceLimitAmount:summary.limit,salaryAdvanceRemainingBeforeRequest:summary.remaining,createdOnBehalf:!own,createdByEmployeeId:employee.id});
 }else{
  const req=by('advances',values.requestId);if(!req||req.isArchived)fail('Không tìm thấy lệnh ứng còn hiệu lực.');monthKey=getSalaryAdvanceMonth(req);if(!payrollMonth(monthKey))fail('Lệnh ứng chưa có kỳ hợp lệ.');
  if(kind==='salaryAdvance.approve'){
   if(req.status!=='pending'||getLockedPayrollPeriod(data.payrollPeriods,tenant,monthKey))fail('Lệnh không còn chờ hoặc kỳ đã khóa.');
   const linked=data.financials.filter(record=>record.companyId===tenant&&!record.isArchived&&record.type==='advance'&&(record.linkedAdvanceRequestId===req.id||record.id===req.linkedFinancialRecordId||record.id===req.financialRecordId));if(linked.length>1)fail('Nhiều phiếu ứng liên kết; cần đối soát trước.');
   const existingLinkedFinancial=linked[0],linkedFinancialRecordId=req.linkedFinancialRecordId||req.financialRecordId||existingLinkedFinancial?.id||`fin_${req.id}`;if(by('financials',linkedFinancialRecordId)&&by('financials',linkedFinancialRecordId)!==existingLinkedFinancial)fail('Mã phiếu tài chính đã dùng cho nghiệp vụ khác.');
   const patch={status:'approved',approvedAt:editedAt,approvedBy:employee.id,reviewedByEmpId:employee.id,salaryMonth:monthKey,linkedFinancialRecordId,financialRecordId:linkedFinancialRecordId};
   const financialPayload={...(existingLinkedFinancial||{}),id:linkedFinancialRecordId,companyId:tenant,empId:req.empId,type:'advance',amount:parseLooseMoneyValue(req.amount),reason:capitalizeFirst(req.reason||'Ứng lương'),date:req.date||getVietnamPayrollDateKey(new Date(editedAt)),salaryMonth:monthKey,isArchived:false,sourceType:'salary_advance_request',linkedAdvanceRequestId:req.id,reviewedByEmpId:employee.id,createdAt:existingLinkedFinancial?.createdAt||req.createdAt||editedAt,updatedAt:editedAt};
   if(!Number.isSafeInteger(financialPayload.amount)||financialPayload.amount<=0)fail('Số tiền nguồn cần đối soát.');put('advances',{...req,...patch});put('financials',financialPayload);
  }else if(kind==='salaryAdvance.reject'){
   if(req.status!=='pending')fail('Chỉ từ chối lệnh chờ; không hoàn tác khoản đã duyệt.');put('advances',{...req,status:'rejected',rejectedAt:editedAt,rejectedBy:employee.id,reviewedByEmpId:employee.id});
  }else{
   if(getLockedPayrollPeriod(data.payrollPeriods,tenant,monthKey))fail('Kỳ đã khóa; cần phiếu điều chỉnh, không sửa lịch sử.');
   put('advances',{...req,isArchived:true,archivedAt:editedAt,archivedByEmpId:employee.id,deletedAt:editedAt,deletedByEmpId:employee.id});
   for(const record of data.financials.filter(r=>r.companyId===tenant&&!r.isArchived&&r.type==='advance'&&r.linkedAdvanceRequestId===req.id))put('financials',{...record,isArchived:true,archivedAt:editedAt,archivedByEmpId:employee.id,archivedReason:'Xóa lệnh ứng lương liên quan'});
  }
 }
 return{monthKey,summary,writes,base:writes.map(w=>({source:w.source,id:w.id,body:by(w.source,w.id)}))};
}
