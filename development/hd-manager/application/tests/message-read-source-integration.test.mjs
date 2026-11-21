import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {planMessageReadQueries,canUseMessageReadWorker} from '../src/services/messageReadAccessPlan.js';
import {canUseFirestoreReadWorker} from '../src/services/readWorkerPolicy.js';
import {roleDomain} from './helpers/role-permission-domain.mjs';

const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),nodes=new Map();
function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='VariableDeclarator'&&node.id?.name)nodes.set(node.id.name,node.init);
  if(node.type==='AssignmentExpression'&&node.left?.object?.name==='messageReadSubjectRef'&&node.left?.property?.name==='current')nodes.set('messageReadSubject',node.right);
  for(const[key,value]of Object.entries(node)){
    if(['loc','comments','extra'].includes(key))continue;
    if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);
  }
}
walk(parse(source,{sourceType:'module',plugins:['jsx']}));
const bind=(name,env)=>{
  const node=nodes.get(name);assert.ok(node,'Actual App '+name);
  return Function(...Object.keys(env),`return (${source.slice(node.start,node.end)});`)(...Object.values(env));
};
const companyId='tenant',actorId='actor';
const override=actions=>({id:companyId,employeeRolePermissions:{[actorId]:{messages:true}},employeeRolePermissionActions:{[actorId]:{messages:actions}}});
function fixture({actions={view_internal_messages:true,view_support_messages:true},manager=true,customer=false}={}){
  const actor={id:actorId,companyId,role:manager?'accounting':'employee',position:manager?'Kế toán & nhân sự':'Tài xế'};
  const currentUser=customer?{id:'portal',companyId,customerId:'customer',accountType:'customer',role:'customer'}:{...actor,accountType:'employee'};
  const env={db:{},appId:'read-integration',tenantCompanyId:companyId,readOwnerKey:'owner-key',currentUser,
    customerSession:customer,sessionCustomerId:'customer',customerOwnedCollections:new Set(['messages','notifications','orders']),
    messageReadSubjectRef:{current:{ownerKey:'owner-key',company:override(actions),employee:actor,currentUser}},
    planMessageReadQueries,canUseMessageReadWorker,hasCompanyRolePermissionAction:roleDomain.hasCompanyRolePermissionAction,
    isOwnerRoleValue:value=>['owner','super_admin','company_owner','business_owner'].includes(value),
    doc:(_db,...path)=>({doc:path.join('/')}),collection:(_db,...path)=>({collection:path.join('/')}),
    firebaseWhere:(...args)=>['where',...args],firebaseOrderBy:(...args)=>['orderBy',...args],firebaseLimit:value=>['limit',value],
    firebaseQuery:(collection,...constraints)=>({collection,constraints}),firebaseQueryEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    readWorker:{},CORE_DATA_COLLECTION_NAMES:['companies','employees'],activeTabForSyncRef:{current:'messages'},canUseFirestoreReadWorker};
  env.getMessageReadPlan=bind('getMessageReadPlan',env);
  env.getTenantCollectionSources=bind('getTenantCollectionSources',env);
  return {env,queries:()=>env.getTenantCollectionSources('messages'),worker:queries=>bind('workerEligible',{...env,colName:'messages',collectionRefs:queries})};
}
const filters=source=>source.constraints.filter(item=>item[0]==='where').map(item=>item.slice(1));

test('actual App keeps the manager query/worker only for both grants and falls back to typed SDK queries for partial grants',()=>{
  const full=fixture(),queries=full.queries();assert.equal(queries.length,1);assert.deepEqual(filters(queries[0]),[['companyId','==',companyId]]);assert.equal(full.worker(queries),true);
  for(const[actions,types]of [[{view_internal_messages:true,view_support_messages:false},['internal','internal_group']],
    [{view_internal_messages:false,view_support_messages:true},['support','customer_support']]]){
    const f=fixture({actions}),sources=f.queries();assert.equal(sources.length,1);assert.deepEqual(filters(sources[0]),[['companyId','==',companyId],['conversationType','in',types]]);
    assert.equal(f.worker(sources),false);assert.deepEqual(sources[0].constraints.slice(-2),[['orderBy','createdAt','desc'],['limit',200]]);
  }
});
test('actual App employee sources preserve assignment filters and never mix a revoked support category',()=>{
  const f=fixture({manager:false}),queries=f.queries();assert.equal(queries.length,2);assert.equal(f.worker(queries),false);
  assert.ok(queries.some(row=>filters(row).some(filter=>filter[0]==='assignedEmployeeId'&&filter[2]===actorId)));
  const g=fixture({manager:false,actions:{view_internal_messages:true,view_support_messages:false}});
  assert.deepEqual(filters(g.queries()[0])[1],['conversationType','in',['internal','internal_group']]);assert.equal(g.queries().length,1);
});
test('actual App reads current permission snapshots from its ref and refuses stale read-owner/tenant scopes',()=>{
  const f=fixture();assert.equal(f.queries().length,1);
  f.env.messageReadSubjectRef.current.company=override({view_internal_messages:false,view_support_messages:false});assert.deepEqual(f.queries(),[]);
  f.env.messageReadSubjectRef.current.ownerKey='different-owner';assert.deepEqual(f.queries(),[]);
  f.env.messageReadSubjectRef.current={ownerKey:'owner-key',company:{id:'other'},employee:{id:actorId,companyId:'other'},currentUser:{id:actorId,companyId:'other'}};assert.deepEqual(f.queries(),[]);
});
test('actual App ref publication prefers the exact current actor including archive state and preserves the owner key',()=>{
  const actor={id:actorId,companyId,isArchived:true};
  const snapshot=bind('messageReadSubject',{readOwnerKey:'stable-owner',currentCompany:{id:companyId},currentUser:{id:actorId,companyId},
    rawEmployees:[{id:'other',companyId},actor],appCurrentEmployee:{id:actorId,companyId,isArchived:false}});
  assert.equal(snapshot.employee,actor);assert.equal(snapshot.ownerKey,'stable-owner');assert.equal(snapshot.employee.isArchived,true);
});
test('actual App clears a policy-empty message view and cache without starting a forbidden listener or touching another source',()=>{
  const f=fixture({actions:{view_internal_messages:false,view_support_messages:false}}),states=[],loaded=[],confirmed=[];
  const cache=new Map([['messages',[{text:'old private content'}]],['orders',[{id:'keep'}]]]);
  const env={...f.env,isReadAccessCurrent:()=>true,activeRealtimeCollectionListeners:new Map(),lastStableCollectionDataRef:{current:cache},
    markCollectionLoaded:name=>loaded.push(name),markCollectionServerConfirmed:name=>confirmed.push(name)};
  const start=bind('startCollectionListener',env),stop=start(['messages',value=>states.push(value),false]);
  assert.equal(typeof stop,'function');assert.deepEqual(states,[[]]);assert.deepEqual(loaded,['messages']);assert.deepEqual(confirmed,['messages']);
  assert.equal(cache.has('messages'),false);assert.deepEqual(cache.get('orders'),[{id:'keep'}]);
  const stale=bind('startCollectionListener',{...env,isReadAccessCurrent:()=>false});stale(['messages',()=>assert.fail('Stale publication'),false]);
});
test('actual App customer query and other tenant collection reads retain their existing shapes',()=>{
  const customer=fixture({customer:true});const query=customer.queries()[0];
  assert.deepEqual(filters(query),[['companyId','==',companyId],['customerId','==','customer'],['conversationType','==','customer_support']]);
  assert.deepEqual(query.constraints.slice(-2),[['orderBy','createdAt','desc'],['limit',100]]);assert.equal(customer.worker([query]),false);
  const f=fixture();assert.deepEqual(filters(f.env.getTenantCollectionSources('payments')[0]),[['companyId','==',companyId]]);
});
