const {createHash}=require('node:crypto');
const deny=()=>Object.assign(Error('Original Core actor denied'),{code:'permission-denied'});
async function readOriginalCoreActor({db,reader,appId,uid,hasAction}){
 const get=ref=>reader?reader.get(ref):ref.get();
 const id=value=>typeof value==='string'&&value.length>0&&!value.includes('/');
 if(!id(uid))throw deny();
 const policy=(await get(db.doc('offlineHomeActors/'+uid))).data();if(!policy?.active||!id(policy.tenantId)||!id(policy.employeeId)||policy.sourceArchiveSha256)throw deny();
 const [c,e]=await Promise.all([get(db.doc('artifacts/'+appId+'/public/data/companies/'+policy.tenantId)),get(db.doc('artifacts/'+appId+'/public/data/employees/'+policy.employeeId))]);
 const company=c.data(),employee=e.data();if(!company||company.isArchived||!employee||employee.isArchived||employee.companyId!==policy.tenantId||['blocked','inactive'].includes(employee.status))throw deny();
 const subject={company:{...company,id:policy.tenantId},employee:{...employee,id:policy.employeeId},currentUser:{...employee,id:policy.employeeId}};
 const permissionRevision=createHash('sha256').update(JSON.stringify([company.rolePermissions,company.rolePermissionActions,company.employeeRolePermissionActions,company.employeeRolePermissions,employee.role,employee.position,employee.positions,employee.additionalPositions,employee.rolePermissions,employee.rolePermissionActions,employee.permissionOverrides,employee.isArchived])).digest('hex');
 return {uid,tenantId:policy.tenantId,permissionRevision,subject};
}
// The server-owned access snapshot and ORIGINAL role/binding must agree in the
// same read-only transaction immediately before signing. Client fields never
// determine employee, tenant, revision or capabilities.
async function authorizeOriginalCoreGrant({db,reader,appId,actor,access,deriveCapabilities}){
 const fresh=await readOriginalCoreActor({db,reader,appId,uid:actor.uid});
 const saved=(await reader.get(db.doc('offlineCustomerAccess/'+actor.uid))).data();
 const allowed=deriveCapabilities(fresh.subject);
 if(!saved?.active||saved.readScope!=='tenant'||saved.readScope!==access.readScope||saved.tenantId!==fresh.tenantId||actor.tenantId!==fresh.tenantId||access.tenantId!==fresh.tenantId
  ||saved.permissionRevision!==fresh.permissionRevision||actor.permissionRevision!==fresh.permissionRevision||access.permissionRevision!==fresh.permissionRevision
  ||access.appIdentity?.id!==fresh.subject.employee.id||access.appIdentity?.companyId!==fresh.tenantId
  ||!Array.isArray(access.capabilities)||access.capabilities.some(cap=>typeof cap!=='string'||!allowed.includes(cap))
  ||JSON.stringify(saved.capabilities)!==JSON.stringify(access.capabilities)||JSON.stringify(saved.appIdentity)!==JSON.stringify(access.appIdentity))throw deny();
 return fresh;
}
function originalCoreCapabilities(subject,{hasAction,mapping,extra=[]}){
 const yes=(module,action)=>hasAction(subject,module,action);
 // Current Customer API serves tenant-wide pages; assigned-only CRM is not
 // silently promoted. No new partial Home-feed protocol is claimed here.
 const crm=yes('customers','view_customers')&&yes('customers','view_all_customers');
 const fullHome=[['home','view_dashboard'],['home','view_quick_report'],...Object.values(mapping)].every(([m,a])=>yes(m,a));
 const caps=[];
 if(crm){caps.push('customers.read');if(['view_customer_order_history','view_customer_payment_history'].some(a=>yes('customers',a)))caps.push('customers.history.read');
  if(yes('customers','view_customer_order_history'))caps.push('customers.history.orders.read');if(yes('customers','view_customer_payment_history'))caps.push('customers.history.payments.read');
  if(yes('customers','add_edit_customer'))caps.push('customers.create','customers.update');if(yes('customers','delete_customer'))caps.push('customers.archive');if(yes('customers','reassign_customer_manager'))caps.push('customers.assign');}
 if(fullHome)caps.push('home.read');
 for(const [cap,m,a] of [['home.orders.read','orders','view_orders'],['home.cashflow.read','finance','view_all_cashflow'],['home.payroll.read','payroll','view_all_payroll'],['home.debt.read','debt','view_all_debt'],['home.imports.read','warehouse_import','view_warehouse_import'],['home.dispatches.read','warehouse_dispatch','view_warehouse_dispatch'],['home.stock.read','warehouse_import','view_actual_inventory_stock'],['home.quick-report.read','home','view_quick_report']])if(yes(m,a))caps.push(cap);
 if(yes('orders','view_orders'))caps.push('orders.read');
 if(fullHome){if(yes('orders','create_manual_order'))caps.push('orders.create');if(yes('orders','edit_order_items'))caps.push('orders.update');if(yes('orders','delete_order'))caps.push('orders.archive');caps.push(...extra);}
 return [...new Set(caps)];
}
module.exports={readOriginalCoreActor,originalCoreCapabilities,authorizeOriginalCoreGrant};
