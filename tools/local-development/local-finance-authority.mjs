// Server-derived authority for the Local-only direct-Firestore finance fence.
// The private access document is never writable by a client. Rules compare the
// exact permission inputs to live company/employee documents on every request.
const value=(object,key)=>object?.[key]===undefined?null:object[key];
const individual=(object,id)=>object&&typeof object==='object'&&!Array.isArray(object)?value(object,id):null;
export function localFinanceAuthority({actor,subject,projectId,appId,hasAction,now=Date.now()}){
 if(!/^demo-hdmanager-/.test(projectId)||actor.tenantId!==subject.company.id||!actor.uid||!subject.employee.id)throw Error('Local authority binding required');
 const c=subject.company,e=subject.employee;
 return {version:1,environment:'local',projectId,appId,principalId:actor.uid,tenantId:actor.tenantId,employeeId:e.id,identityId:actor.identityId,expiresAtMs:now+3600000,
  finance:{readAll:hasAction(subject,'finance','view_all_cashflow')===true,readOwn:hasAction(subject,'finance','view_own_cashflow')===true},
  payroll:{readAll:hasAction(subject,'payroll','view_all_payroll')===true,readOwn:hasAction(subject,'payroll','view_own_payroll')===true},
  companyInputs:{rolePermissions:value(c,'rolePermissions'),rolePermissionActions:value(c,'rolePermissionActions'),individualPermissions:individual(c.employeeRolePermissions,e.id),individualActions:individual(c.employeeRolePermissionActions,e.id)},
  employeeInputs:Object.fromEntries(['role','position','positions','additionalPositions','rolePermissions','rolePermissionActions','permissionOverrides','isArchived','status'].map(k=>[k,value(e,k)]))};
}
