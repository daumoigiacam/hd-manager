// Navigation identity is part of the server-signed grant, never a cached role
// or a fabricated Firebase User. Modules require explicit signed source scopes.
export function restoreOfflineAppSession(grant, scope) {
  if (!grant.appSession) return null; // older grants require explicit online upgrade
  const {user, company} = grant.appSession;
  if(!Array.isArray(grant.capabilities)||grant.capabilities.some(cap=>typeof cap!=='string'||!cap))throw Error('Invalid signed App capabilities');
  if (!user || !company || typeof user.id !== 'string' || !user.id
    || user.firebaseUid !== scope.principalId || user.companyId !== scope.tenantId
    || company.id !== scope.tenantId || user.accountType !== 'employee'
    || user.role !== 'employee') {
    throw new Error('Signed Offline App identity mismatch');
  }
  const directory=grant.appSession.employees||[];if(!Array.isArray(directory)||directory.some(row=>typeof row.id!=='string'||!row.id||row.companyId!==scope.tenantId)||directory.length&&!grant.capabilities.includes('customers.read')&&!grant.capabilities.includes('home.payroll.read'))throw Error('Signed employee lookup tenant mismatch');
  const sourceProfile=grant.appSession.sourceProfile;
  if(sourceProfile!==undefined&&sourceProfile!=='native-isolation-v1')throw Error('Unknown signed App source profile');
  const crm=grant.capabilities.includes('customers.read'); // Each route requires its own signed source capability.
  return Object.freeze({currentUser:Object.freeze({...user}),currentCompany:Object.freeze({...company}),employees:Object.freeze(directory.map(row=>Object.freeze({...row}))),sourceProfile,
    activeTab:'home',allowedTabs:Object.freeze(sourceProfile==='native-isolation-v1'?['home']:['home','more',...(grant.capabilities.includes('attendancePeriod.read')?['attendancePeriods']:[]),...(grant.capabilities.includes('salarySettlement.read')?['salarySettlements']:[]),...(grant.capabilities.includes('attendanceRequest.read')?['attendanceRequests']:[]),...(crm?['customers']:[]),...(grant.capabilities.includes('orders.read')?['orders']:[]),...(grant.capabilities.includes('home.cashflow.read')?['finance']:[]),...(grant.capabilities.includes('home.imports.read')?['warehouseImports']:[]),...(grant.capabilities.includes('home.dispatches.read')?['warehouseDispatches']:[]),...(grant.capabilities.includes('home.stock.read')?['stockCounts']:[]),...((grant.capabilities.includes('home.payroll.read')||grant.capabilities.includes('employees.directory.read'))?['hr']:[]),...((grant.capabilities.includes('home.quick-report.read')||grant.capabilities.includes('deliveryReports.read'))?['delivery']:[])])});
}

export function createOfflineRuntimeOwner() {
  let current = null, tail = Promise.resolve(), closed = false;
  const exclusive = work => {const task = tail.then(work);tail = task.catch(()=>{});return task;};
  return Object.freeze({
    replace(create) {return exclusive(async () => {
      if (closed) throw new Error('App runtime owner disposed');
      const old = current;current = null;await old?.close();
      if (closed) throw new Error('App runtime owner disposed');
      const next = await create();
      if (closed) {await next.close();throw new Error('App runtime owner disposed');}
      current = next;return next;
    });},
    close(expected) {return exclusive(async () => {if(expected&&current!==expected)return;const old=current;current=null;await old?.close();});},
    dispose() {closed=true;return this.close();},
  });
}

export function offlineAppAction(runtime, module, action) {
  if (!runtime?.isCurrent() || !runtime.appSession || module !== 'customers') return false;
  const caps = runtime.capabilities;
  if (['view_customers','view_all_customers','view_assigned_customers','view_customer_phone','view_customer_location'].includes(action)) return caps.includes('customers.read');
  if (action === 'add_edit_customer') return caps.includes('customers.create') && caps.includes('customers.update');
  if (action === 'delete_customer') return caps.includes('customers.archive');
  if (['edit_customer_phone_address','edit_customer_location'].includes(action)) return caps.includes('customers.update');
  if (['view_customer_order_history','view_customer_payment_history'].includes(action)) return caps.includes('customers.history.read');
  return false;
}
