// Query descriptors only: App supplies its actual catalog evaluator and builds
// SDK queries. Partial grants must never fall back to a broader company inbox.
const freeze=queries=>Object.freeze(queries.map(query=>Object.freeze({
  ...query,filters:Object.freeze(query.filters.map(filter=>Object.freeze(filter)))
})));
const none=freeze([]);
const all=freeze([{kind:'all',filters:[]}]);
const internal=Object.freeze(['internal','internal_group']);
const support=Object.freeze(['support','customer_support']);
const both=Object.freeze(['internal','internal_group','support']);
const typed=(kind,types)=>({kind,filters:[['conversationType',types.length===1?'==':'in',types.length===1?types[0]:types]]});

export function planMessageReadQueries({company,employee,currentUser,customerId='',isManager=false},hasPermission){
  const companyId=currentUser?.companyId||'';
  if(!companyId||company?.id!==companyId)return none;
  if(currentUser?.accountType==='customer'||currentUser?.role==='customer'){
    if(!customerId||currentUser?.customerId!==customerId)return none;
    return freeze([{kind:'customer',filters:[['customerId','==',customerId],['conversationType','==','customer_support']]}]);
  }
  if(typeof employee?.id!=='string'||!employee.id||employee.id!==(currentUser?.employeeId||currentUser?.id)
    ||employee.companyId!==companyId||employee.isArchived===true||typeof hasPermission!=='function')return none;
  const subject={company,employee,currentUser};
  const readInternal=hasPermission(subject,'messages','view_internal_messages')===true;
  const readSupport=hasPermission(subject,'messages','view_support_messages')===true;
  if(!readInternal&&!readSupport)return none;
  if(isManager&&readInternal&&readSupport)return all;
  if(isManager)return freeze([readInternal?typed('internal',internal):typed('support',support)]);
  const queries=[];
  if(readInternal)queries.push(typed('internal',readSupport?both:internal));
  else if(readSupport)queries.push(typed('platform_support',['support']));
  if(readSupport)queries.push({kind:'assigned_support',filters:[['conversationType','==','customer_support'],
    ['assignedEmployeeId','==',employee.id],['assignmentState','==','assigned']]});
  return freeze(queries);
}

export function canUseMessageReadWorker(queries){
  // The current worker knows only the exact broad manager query. Every typed
  // or assigned plan stays on App's existing SDK path.
  return Array.isArray(queries)&&queries.length===1&&queries[0].kind==='all'&&queries[0].filters.length===0;
}
