import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import * as integrity from '../../src/utils/settingsMutationIntegrity.js';
import {employeeReviewFeaturePatch} from '../../src/utils/companyEmployeeReviews.js';
import {canManageCompanyWifi, isUsableAttendanceBssid} from '../../src/utils/attendanceWifi.js';
import {hasCompanyRolePermissionAction} from '../../src/features/payroll/payrollOriginalDomain.js';
import {normalizeCompanyDepartments} from '../../src/utils/companyDepartments.js';
import {normalizeLoyaltyEligibilityConditions} from '../../src/utils/customerLoyaltyEligibility.js';

const source = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
let handler;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'handleUpdateCompanySettings') handler = node.init;
  for (const [key,value] of Object.entries(node)) {
    if (['loc','comments','extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(walk); else if (value?.type) walk(value);
  }
}
walk(parse(source,{sourceType:'module',plugins:['jsx']}));
assert.ok(handler,'Actual canonical settings callback');
const clone = value => structuredClone(value);
const companyId = 'settings-a';
const owner = {id:'owner-a',companyId,role:'owner',position:'Chủ doanh nghiệp'};
const staff = {id:'staff-a',companyId,role:'employee',position:'Kế toán'};
const metadata = (id, patch, base) => ({clientCommandId:id,clientMutationAt:'2026-11-22T01:02:03.000Z',
  expectedSettings:Object.fromEntries(Object.keys(patch).map(key => [key,Object.hasOwn(base,key) ? {exists:true,value:base[key]} : {exists:false}]))});
const tick = async () => { for(let i=0;i<20;i++) await new Promise(resolve=>setTimeout(resolve,1)); };
function fixture({actor=owner, company={}}={}) {
  const base = {id:companyId,name:'Original',customerLoyaltyEnabled:true,bankAccountNumber:'111',
    salaryAdvancePercent:null,employeeReviewsEnabled:true,...company};
  const docs = new Map([['companies/'+companyId,clone(base)],['employees/'+actor.id,clone(actor)]]);
  const writes=[],publications=[],acks=[];
  let visible=clone(base),raw=[clone(base)],defer=false,lostAck=false,denied=false;
  const identity = value=>value;
  const env = {...integrity,employeeReviewFeaturePatch,canManageCompanyWifi,isUsableAttendanceBssid,
    hasCompanyRolePermissionAction,firebaseUser:{uid:actor.id},myCompanyId:companyId,currentCompany:clone(base),appCurrentEmployee:actor,
    currentUser:{...actor,accountType:'employee'},employees:[actor],readOwnerKey:'scope-a',readOwnerRef:{current:'scope-a'},activeTenantScopeRef:{current:companyId},
    db:{},appId:'settings-unit',doc:(_db,...path)=>path.slice(-2).join('/'),serverTimestamp:()=>({serverTimestamp:true}),withTimeout:promise=>promise,
    normalizeLeadingLabel:value=>value.trim(),normalizePaymentAccountNumber:value=>value.replace(/\s/g,''),normalizeInvoiceTemplateId:identity,
    normalizeLoyaltyEligibilityConditions,normalizeProductGroups:value=>[...new Set(value.map(item=>item.trim()))],dedupeWarehouseQuantityUnits:identity,
    normalizeCompanyDepartments,normalizeEmployeeReviewCriteriaLabels:identity,normalizeWarehouseStockVisibilitySettings:identity,normalizeWifiName:value=>value.trim(),
    normalizeRolePermissions:identity,normalizeRolePermissionActions:identity,normalizeEmployeeRolePermissions:identity,normalizeEmployeeRolePermissionActions:identity,
    normalizeProcessingInventorySnapshots:identity,
    runTransaction:async(_db,callback)=>{
      if(denied)throw Object.assign(Error('Denied'),{code:'permission-denied'});
      const staged=[];
      const result=await callback({get:async ref=>({exists:()=>docs.has(ref),data:()=>clone(docs.get(ref))}),
        update:(ref,patch)=>staged.push([ref,{...docs.get(ref),...clone(patch)},clone(patch)]),
        set:(ref,payload)=>staged.push([ref,clone(payload),clone(payload)])});
      for(const[ref,payload,patch]of staged){docs.set(ref,payload);writes.push({ref,patch});}
      if(lostAck)throw Error('Lost ACK');
      if(defer)await new Promise((resolve,reject)=>acks.push({resolve,reject}));
      return result;
    },
    setCurrentCompany:update=>{visible=update(visible);publications.push(clone(visible));},
    setRawCompanies:update=>{raw=update(raw);}};
  const bind=()=>Function(...Object.keys(env),`return (${source.slice(handler.start,handler.end)});`)(...Object.values(env));
  return {env,docs,writes,publications,acks,base,call:(patch,options)=>bind()(patch,options),get visible(){return visible;},get raw(){return raw;},
    set defer(value){defer=value;},set lostAck(value){lostAck=value;},set denied(value){denied=value;}};
}


export {fixture, companyId, owner, staff, metadata, tick, clone};
