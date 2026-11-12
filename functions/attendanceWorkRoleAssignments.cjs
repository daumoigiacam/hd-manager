// A work assignment changes the original versioned payroll policy, never RBAC.
// It is a business command with live authorization, CAS, audit and old receipts.
const {assignedRoles}=require('./attendanceManual.js');
const fail=(message,code='invalid-argument')=>{throw Object.assign(Error(message),{code});};
async function prepareWorkRoleAssignment({db,tx,appId,actor,payload,loadRoles,hashRecord,now}){
 if(!actor.assignWorkRole)fail('Current employee policy permissions denied','permission-denied');
 const reference=db.doc(`artifacts/${appId}/public/data/employees/${payload.employeeId}`),snapshot=await tx.get(reference),before=snapshot.data();
 const d=await loadRoles();
 if(!before||before.companyId!==actor.tenantId||before.isArchived||d.isOwnerPosition(before.position))fail('Employee policy outside editable scope','permission-denied');
 const fp=hashRecord({policy:d.captureEmployeePayrollPolicy(before),history:d.getStoredEmployeePayrollPolicyHistory(before)});
 if(fp!==payload.employeePolicyFingerprint)return{sourceMatches:false};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 if(payload.effectiveFrom!==today||payload.monthKey!==today.slice(0,7))fail('Work assignment must use the current unlocked period','failed-precondition');
 const workRole=d.normalizeEmployeePosition(payload.workRole);
 if(!['Xuất kho','Sản xuất','Tài xế','Kinh doanh','Kế toán & nhân sự'].includes(workRole)||workRole!==payload.workRole||assignedRoles(before).some(role=>d.normalizeEmployeePosition(role)===workRole))fail('Choose a new supported assigned work role');
 if(!Number.isSafeInteger(payload.amountVnd)||payload.amountVnd<0)fail('Invalid work role salary amount');
 const added=d.normalizeEmployeeRoleSalaryComponents([{position:workRole,amount:payload.amountVnd,note:payload.reason}],{keepEmpty:true});
 if(added.length!==1||added[0].amount!==payload.amountVnd)fail('Work role normalization changed salary value');
 const next={...before,roleSalaryComponents:[...(before.roleSalaryComponents||[]),...added]},at=new Date(now).toISOString();
 Object.assign(next,d.buildEmployeePayrollPolicyUpdate({employee:before,nextEmployee:next,effectiveFrom:payload.effectiveFrom,changedAt:at,changedByEmployeeId:actor.employeeId,changedByName:actor.name||actor.employeeId}));
 return{reference,before,after:next,sourceMatches:true,at,workRole};
}
module.exports={prepareWorkRoleAssignment};
