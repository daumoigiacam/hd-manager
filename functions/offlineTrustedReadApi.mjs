// Read adapters for the existing protocols. No grant persistence, business
// mutation or Production service registration occurs here.
import {createRequire} from 'node:module';
import {createScopedBusinessSource} from './offlineScopedBusinessSource.mjs';
import cashDomain from './generated/offlineCashflowPolicy.cjs';
import {deriveSalarySettlementAccess} from '../development/hd-manager/application/src/features/payroll/payrollSettlementPolicy.js';
const require=createRequire(import.meta.url);
const {Filter}=require('firebase-admin/firestore');
const {createAttendancePeriods}=require('./attendancePeriodConfirmations.cjs');
const {createAttendanceAdjustmentRequests}=require('./attendanceAdjustmentRequests.cjs');
const {createPayrollSettlements}=require('./payrollSettlements.cjs');
const {createOfflineWarehouseImportSource}=require('./offlineWarehouseImportSource.cjs');
const deny=()=>Object.assign(Error('Trusted read scope denied'),{code:'permission-denied'});
export const TRUSTED_READ_ACTIONS=Object.freeze(['business-source','attendance-period','payroll-settlement','attendance-adjustment','warehouse-import-head','warehouse-import-page']);
export function trustedReadCapabilities(subject,hasAction){
 const yes=(m,a)=>hasAction(subject,m,a)===true;
 return [...(yes('company_attendance','view_own_attendance')||yes('company_attendance','view_all_attendance')?['attendancePeriod.read']:[]),
  ...(yes('company_attendance','check_in_out')||yes('company_attendance','edit_attendance')?['attendanceRequest.read']:[]),
  ...(yes('payroll','view_own_payroll')||yes('payroll','view_all_payroll')?['salarySettlement.read']:[])];
}
// Request-bound verification is injected by the trusted actor resolver. Each
// DAO re-reads it in the same transaction as its business-source reads.
export function createTrustedReadApi({environment,db,projectId,appId,actor,readActor,projector}){
 const currentCore=async(tx,uid)=>{if(uid!==actor.uid)throw deny();return readActor(tx);};
 const authenticate=async()=>({uid:actor.uid,projectId});
 const hasAction=projector.hasCompanyRolePermissionAction,yes=(s,m,a)=>hasAction(s,m,a)===true;
 const shared={environment,db,projectId,appId,readOnly:true};
 const source=createScopedBusinessSource({db,appId,authenticate,currentCore,hasAction,domain:projector,cashDomain,Filter});
 const imports=createOfflineWarehouseImportSource({...shared,authenticate,resolveActor:currentCore,hasAction,Filter});
 const periods=createAttendancePeriods({...shared,authorize:async(tx,uid)=>{
  const a=await currentCore(tx,uid),s=a.subject;
  return {tenantId:a.tenantId,employeeId:s.employee.id,readOwn:yes(s,'company_attendance','view_own_attendance'),readAll:yes(s,'company_attendance','view_all_attendance')};
 },loadRoles:()=>Promise.all([import('../development/hd-manager/application/src/utils/attendanceWorkRoles.js'),import('../development/hd-manager/application/src/utils/payrollPolicyHistory.js'),import('../development/hd-manager/application/src/features/payroll/payrollOriginalShared.js')]).then(parts=>Object.assign({},...parts))});
 const requests=createAttendanceAdjustmentRequests({...shared,authorize:async(tx,uid)=>{
  const a=await currentCore(tx,uid),s=a.subject;
  return {tenantId:a.tenantId,employeeId:s.employee.id,canRequest:yes(s,'company_attendance','check_in_out'),canReview:yes(s,'company_attendance','edit_attendance')};
 }});
 const settlements=createPayrollSettlements({...shared,authorize:async(tx,uid)=>{
  const a=await currentCore(tx,uid);return {tenantId:a.tenantId,employeeId:a.subject.employee.id,...deriveSalarySettlementAccess(a.subject,hasAction)};
 },loadDomain:()=>Promise.all([import('../development/hd-manager/application/src/features/payroll/offlinePayrollProtocol.js'),import('../development/hd-manager/application/src/utils/payrollAdjustment.js'),import('../development/hd-manager/application/src/utils/payrollSnapshotIntegrity.js')]).then(([p,a,i])=>({plainPayroll:p.plainPayroll,applyPayrollAdjustmentsToSnapshots:a.applyPayrollAdjustmentsToSnapshots,inspectPayrollSnapshot:i.inspectPayrollSnapshot}))});
 return async request=>{
  if(request.action==='business-source')return source(request);
  if(request.action==='attendance-period'){if(!['catalog','read'].includes(request.body?.action))throw deny();return periods.handle(actor.uid,request.body);}
  if(request.action==='payroll-settlement'){if(!['catalog','read'].includes(request.body?.action))throw deny();return settlements(actor.uid,request.body);}
  if(request.action==='attendance-adjustment'){if(request.body?.action!=='list')throw deny();return requests(actor.uid,request.body);}
  if(['warehouse-import-head','warehouse-import-page'].includes(request.action))return imports(request);
  throw deny();
 };
}
