// Deployment-neutral reuse of accepted command handlers. Identity Center is
// re-read inside every command transaction, including immutable receipt replay.
import {createHash} from 'node:crypto';
import cashDomain from './generated/offlineCashflowPolicy.cjs';
import order from './offlineOrderCommands.cjs';
import cashflow from './offlineCashflowCommands.cjs';
import stock from './offlineStockCountCommands.cjs';
import imports from './offlineWarehouseImportCommands.cjs';
import dispatch from './offlineWarehouseDispatchCommands.cjs';
import delivery from './offlineDeliveryCommands.cjs';
import employees from './offlineEmployeeProfileCommands.cjs';
import advances from './offlineSalaryAdvanceCommands.cjs';
import payroll from './offlinePayrollCommands.cjs';
import periods from './attendancePeriodConfirmations.cjs';
import requests from './attendanceAdjustmentRequests.cjs';
import authority from './offlineCommandAuthority.cjs';
import environmentPolicy from './offlineServerEnvironment.cjs';
import attendance from './offlineAttendanceCommands.cjs';
import attendanceContext from './offlineAttendanceTrustedContext.cjs';
import * as advanceDomain from '../development/hd-manager/application/src/features/payroll/salaryAdvanceProtocol.js';
import * as payrollDomain from '../development/hd-manager/application/src/features/payroll/offlinePayrollProtocol.js';
import {trustedBusinessCapabilities as acceptedBusinessCapabilities} from './generated/offlineBusinessPolicy.mjs';
import {createFirestorePayrollSettlements,deriveFirestoreSalaryAccess} from './offlineFirestorePayrollSettlements.mjs';
export function trustedBusinessCapabilities(subject){return acceptedBusinessCapabilities(subject).filter(cap=>cap!=='salarySettlement.pay'||deriveFirestoreSalaryAccess(subject,projectorPolicy).pay);}
// The same canonical RBAC resolver used by the generated capability policy.
import {hasCompanyRolePermissionAction as projectorPolicy} from './generated/offlineOriginalDomain.cjs';
import {bindPayrollTimesheets} from './payrollTimesheetBinding.cjs';
const deny=(message,code='permission-denied')=>{throw Object.assign(Error(message),{code});};
const entries={
 order:['create','update','archive'],cashflow:['income.create','income.update','expense.create','expense.update'],
 stockCount:['create','update','archive'],warehouseImport:['create','update','archive'],warehouseDispatch:['create','update','archive'],
 deliveryReport:['create','update','archive'],employeeProfile:['create','update','archive'],salaryAdvance:['create','approve','reject','archive'],
 payroll:['lock','adjust'],attendance:['check_in','check_out'],attendanceRequest:['create','approve','reject'],attendancePeriod:['assignWorkRole','employeeConfirm','managerConfirm'],salarySettlement:['pay','acknowledge','reconcile']
};
const capPrefix={order:'orders',stockCount:'stockCounts',warehouseImport:'warehouseImports',warehouseDispatch:'warehouseDispatches',deliveryReport:'deliveryReports'};
export const TRUSTED_COMMAND_CAPABILITIES=Object.freeze(Object.fromEntries(Object.entries(entries).flatMap(([prefix,actions])=>actions.map(action=>[prefix+'.'+action,(capPrefix[prefix]||prefix)+'.'+action]))));
const auxiliary=new Set(['customers.assign','stockCounts.reason','salaryAdvance.createForOthers','warehouseDispatches.createWithoutOrderRequest','warehouseDispatches.archiveHistory','deliveryReports.income','deliveryReports.expense','deliveryReports.returns','deliveryReports.assetCosts.create','deliveryReports.assetCosts.update']);
const granted=new Set([...Object.values(TRUSTED_COMMAND_CAPABILITIES),...auxiliary]);
export function supportsTrustedCapability(cap){return /\.(read|readAll)$/.test(cap)||cap.startsWith('home.')||cap.startsWith('customers.')||granted.has(cap);}
export function createTrustedBusinessCommands({environment,projector,readAuthority,identityCenter}){
 const {db,projectId,appId}=environment||{};
 if(!environmentPolicy.isTrustedOfflineServerEnvironment(environment,projectId,appId,db)||typeof readAuthority!=='function')throw Error('Verified business command authority required');
 const hasAction=projector.hasCompanyRolePermissionAction,read=authority.createOfflineCommandAuthority({db,projectId,appId,environment,readAuthority});
 const current=async(tx,actor,cap)=>{const a=await read(tx,actor);if(cap&&!a.capabilities.includes(cap))deny('Current business action denied');return {...a,tenantId:actor.tenantId};};
 const shared={db,projectId,appId,environment,readAuthority,hasCompanyRolePermissionAction:hasAction};
 const handlers={
  order:order.createOfflineOrderCommandService({...shared,duplicateSignature:projector.buildOrderDuplicateSignature,authorize:(tx,actor)=>current(tx,actor,'orders.create')}),
  cashflow:cashflow.createOfflineCashflowCommandService({...shared,domain:cashDomain,policy:{hasCompanyRolePermissionAction:hasAction,isOwnerAccountUser:cashDomain.isOwnerAccountUser},authorize:(tx,actor)=>current(tx,actor)}),
  stockCount:stock.createOfflineStockCountCommandService(shared),warehouseImport:imports.createOfflineWarehouseImportCommandService(shared),warehouseDispatch:dispatch.createOfflineWarehouseDispatchCommandService(shared),deliveryReport:delivery.createOfflineDeliveryCommandService(shared),
  employeeProfile:employees.createOfflineEmployeeProfileCommandService({...shared,loadDomain:()=>import('../development/hd-manager/application/src/features/hr/employeeProfileProtocol.js'),authorize:(tx,actor,kind)=>current(tx,actor,kind)}),
  salaryAdvance:advances.createOfflineSalaryAdvanceCommandService({...shared,loadDomain:async()=>advanceDomain,authorize:(tx,actor,kind)=>current(tx,actor,kind)})
 };
 const yes=(s,m,a)=>hasAction(s,m,a)===true;
 const periodFor=actor=>periods.createAttendancePeriods({...shared,authorize:async(tx,uid)=>{
  if(uid!==actor.uid)deny('Confirmation principal mismatch');const a=await current(tx,actor),s=a.subject;
  return {tenantId:a.tenantId,employeeId:a.employeeId,assignWorkRole:a.capabilities.includes('attendancePeriod.assignWorkRole'),readOwn:yes(s,'company_attendance','view_own_attendance'),readAll:yes(s,'company_attendance','view_all_attendance'),managerConfirm:a.capabilities.includes('attendancePeriod.managerConfirm')};
 },loadRoles:()=>Promise.all([import('../development/hd-manager/application/src/utils/attendanceWorkRoles.js'),import('../development/hd-manager/application/src/utils/payrollPolicyHistory.js'),import('../development/hd-manager/application/src/features/payroll/payrollOriginalShared.js')]).then(parts=>Object.assign({},...parts))});
 return Object.freeze({supports:cap=>supportsTrustedCapability(cap)&&(!cap.startsWith('attendance.')||typeof identityCenter?.resolveAttendanceContext==='function'),async apply(actor,command,request){
  const cap=TRUSTED_COMMAND_CAPABILITIES[command?.kind];if(!cap)deny('Write domain has not passed its server release gate','failed-precondition');
  if(!actor.capabilities.includes(cap))deny('Current command capability denied');
  const prefix=command.kind.split('.')[0];
  if(prefix==='attendance'){
   const input=request?.body?.attendanceContext;
   if(!input||Object.keys(input).some(k=>!['device','deviceSecret','method'].includes(k)))deny('Fresh enrolled device evidence required','failed-precondition');
   const getAttendanceContext=attendanceContext.createOfflineAttendanceTrustedContext({...shared,identityCenter,request:{authorization:'Bearer '+request.token,device:input.device,deviceSecret:input.deviceSecret,method:input.method}});
   return attendance.createOfflineAttendanceCommandService({...shared,authorize:(tx,a,kind)=>current(tx,a,kind),getAttendanceContext})(actor,command);
  }
  if(prefix==='attendancePeriod')return periodFor(actor).handle(actor.uid,{command});
  if(prefix==='salarySettlement')return createFirestorePayrollSettlements({...shared,authorize:async(tx,uid)=>{
   if(uid!==actor.uid)deny('Salary principal mismatch');const a=await current(tx,actor,cap);
   return {tenantId:a.tenantId,employeeId:a.employeeId,...deriveFirestoreSalaryAccess(a.subject,hasAction)};
  }})(actor.uid,{command});
  if(prefix==='attendanceRequest'){
   if(createHash('sha256').update(JSON.stringify(command.payload)).digest('hex')!==command.payloadDigest)deny('Adjustment digest mismatch','invalid-argument');
   const service=requests.createAttendanceAdjustmentRequests({...shared,authorize:async(tx,uid)=>{if(uid!==actor.uid)deny('Adjustment principal mismatch');const a=await current(tx,actor,cap);return {tenantId:a.tenantId,employeeId:a.employeeId,canRequest:yes(a.subject,'company_attendance','check_in_out'),canReview:yes(a.subject,'company_attendance','edit_attendance')};}});
   return service(actor.uid,{action:command.kind.slice('attendanceRequest.'.length),commandId:command.commandId,idempotencyKey:command.idempotencyKey,requestId:command.entityId,payload:command.payload,expectedRevision:command.baseRevision});
  }
  if(prefix==='payroll')return payroll.createOfflinePayrollCommandService({...shared,loadDomain:async()=>payrollDomain,verifyTimesheets:(tx,a,monthKey,snapshots)=>bindPayrollTimesheets({tx,actor:{tenantId:a.tenantId,readAll:true},monthKey,snapshots,readContext:periodFor(actor).readContext})})(actor,command);
  return handlers[prefix](actor,command);
 }});
}
