import {createProjectionCache} from './cooperativeProjection.js';
export const EMPTY_MODULE_PROJECTION_SOURCE=Object.freeze({});
const counts=Object.freeze({requestVisible:5,requestStatuses:6,orderViews:11,orderDirectory:3,orderLedgerIndex:1,orderPaymentIndex:1,orderSorted:3,payroll:15});
const caches=Object.fromEntries(Object.keys(counts).map(kind=>[kind,createProjectionCache({maxScopes:4})]));

// Complete immutable read projections only. Forms, drafts, commands, network
// acknowledgements and locked-payroll snapshots never enter this cache.
export function getReadOnlyModuleProjectionEntry(kind,sources,context){
 if(!Object.hasOwn(counts,kind)||!Array.isArray(sources)||sources.length!==counts[kind])throw new TypeError('Invalid module projection source contract.');
 if(!context||typeof context.companyId!=='string'||!context.companyId||typeof context.employeeId!=='string'||!context.employeeId
  ||typeof context.permissionKey!=='string'||!context.permissionKey||typeof context.periodKey!=='string'
  ||typeof context.clockKey!=='string'||!context.clockKey||sources.some(value=>!value||typeof value!=='object'))return undefined;
 return caches[kind](sources,JSON.stringify([context.companyId,context.employeeId,context.permissionKey,context.periodKey,context.clockKey]));
}

export function getLocalProjectionClockScope(dayKey){
 return JSON.stringify([dayKey,Intl.DateTimeFormat().resolvedOptions().timeZone,new Date().getTimezoneOffset()]);
}

export function readCompletedModuleProjection(entry,calculate){
 if(entry?.complete)return entry.value;
 const value=calculate();
 if(value&&typeof value.then==='function')throw new TypeError('Synchronous read projection required.');
 if(entry){entry.value=value;entry.complete=true}
 return value;
}
