import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {planMessageReadQueries,canUseMessageReadWorker} from '../src/services/messageReadAccessPlan.js';
import {roleDomain} from './helpers/role-permission-domain.mjs';
const {hasCompanyRolePermissionAction}=roleDomain;
const require=createRequire(import.meta.url);
const {readOriginalCoreActor,authorizeOriginalCoreGrant}=require('../../../../functions/offlineCoreAppPolicy.cjs');
const backendDomain=require('../../../../functions/generated/offlineOriginalDomain.cjs');

const companyId='roles-a';
const employee={id:'e',companyId,position:'Tài xế',role:'employee'};
const currentUser={...employee,accountType:'employee'};
const state=(company={})=>({company:{id:companyId,...company},employee,currentUser});
const individual=(module,actions)=>({employeeRolePermissions:{e:{messages:module}},employeeRolePermissionActions:{e:{messages:actions}}});
const plan=(company,isManager=false)=>planMessageReadQueries({...state(company),isManager},hasCompanyRolePermissionAction);

test('actual App defaults keep staff on internal messages and reserve broad manager queries for both actual grants',()=>{
  const manager=plan(individual(true,{view_internal_messages:true,view_support_messages:true}),true);
  assert.deepEqual(manager,[{kind:'all',filters:[]}]);assert.equal(canUseMessageReadWorker(manager),true);
  const staff=plan({});assert.deepEqual(staff,[{kind:'internal',filters:[['conversationType','in',['internal','internal_group']]]}]);
  assert.equal(canUseMessageReadWorker(staff),false);
});
test('partial internal/support grants never emit a broad or mixed forbidden query',()=>{
  const internal=individual(true,{view_internal_messages:true,view_support_messages:false});
  assert.deepEqual(plan(internal,true),[{kind:'internal',filters:[['conversationType','in',['internal','internal_group']]]}]);
  assert.deepEqual(plan(internal),plan(internal,true));
  const support=individual(true,{view_internal_messages:false,view_support_messages:true});
  assert.deepEqual(plan(support,true),[{kind:'support',filters:[['conversationType','in',['support','customer_support']]]}]);
  assert.deepEqual(plan(support),[{kind:'platform_support',filters:[['conversationType','==','support']]},
    {kind:'assigned_support',filters:[['conversationType','==','customer_support'],['assignedEmployeeId','==','e'],['assignmentState','==','assigned']]}]);
  for(const queries of [plan(internal,true),plan(support,true),plan(support)])assert.equal(canUseMessageReadWorker(queries),false);
});
test('actual role/individual override precedence, module fallback, explicit grants and revocation determine plans',()=>{
  for(const company of [individual(false,{}),individual(true,{view_internal_messages:false,view_support_messages:false}),
    {rolePermissionActions:{driver:{messages:{view_internal_messages:false,view_support_messages:false}}}}])assert.deepEqual(plan(company),[]);
  assert.deepEqual(plan(individual(false,{view_internal_messages:true,view_support_messages:false})).map(row=>row.kind),['internal']);
  const replacement={rolePermissionActions:{driver:{messages:{view_internal_messages:false,view_support_messages:false}}},...individual(true,{})};
  assert.deepEqual(plan(replacement).map(row=>row.kind),['internal'],'Individual replacement uses actual App role defaults, including support denial');
  // Record the current catalog's truthy coercion rather than inventing a new
  // catalog policy here. Rules continue to require an actual boolean grant.
  assert.equal(plan(individual(false,{view_internal_messages:'true',view_support_messages:false})).length,1);
});
test('customer read shape is independent of employee action revocation and stays bound to its own tenant/customer',()=>{
  const context={...state(individual(false,{})),customerId:'customer',currentUser:{id:'portal',companyId,customerId:'customer',accountType:'customer',role:'customer'}};
  assert.deepEqual(planMessageReadQueries(context,()=>assert.fail('Customer must not use employee grants')),
    [{kind:'customer',filters:[['customerId','==','customer'],['conversationType','==','customer_support']]}]);
  assert.deepEqual(planMessageReadQueries({...context,customerId:'other'},hasCompanyRolePermissionAction),[]);
  assert.deepEqual(planMessageReadQueries({...context,company:{id:'foreign'}},hasCompanyRolePermissionAction),[]);
});
test('missing/archived/foreign employees emit no queries and immutable plans cannot be widened by callers',()=>{
  for(const actor of [null,{...employee,id:'other'},{...employee,isArchived:true},{...employee,companyId:'foreign'}])assert.deepEqual(planMessageReadQueries({...state(),employee:actor},hasCompanyRolePermissionAction),[]);
  for(const empty of [null,undefined,[]])assert.equal(canUseMessageReadWorker(empty),false);
  const queries=plan(individual(true,{view_internal_messages:true,view_support_messages:false}));
  assert.throws(()=>queries.push({kind:'all',filters:[]}),TypeError);
  assert.throws(()=>queries[0].filters.push(['companyId','!=','a']),TypeError);
  assert.throws(()=>queries[0].filters[0][2].push('customer_support'),TypeError);
});

function backendFixture(){
  const root='artifacts/roles-backend/public/data/',uid='uid-a';
  const docs=new Map([['offlineHomeActors/'+uid,{active:true,tenantId:companyId,employeeId:employee.id}],
    [root+'companies/'+companyId,{id:companyId,...individual(true,{view_internal_messages:true,view_support_messages:false})}],
    [root+'employees/'+employee.id,{...employee}]]);
  const db={doc:path=>({path})},reader={get:async ref=>({data:()=>structuredClone(docs.get(ref.path))})};
  const read=()=>readOriginalCoreActor({db,reader,appId:'roles-backend',uid});
  return {docs,db,reader,read,root,uid};
}
test('actual backend ACL rereads role and individual policy revisions instead of trusting a prior access snapshot',async()=>{
  const f=backendFixture(),initial=await f.read();
  for(const patch of [{rolePermissions:{driver:{messages:false}}},{rolePermissionActions:{driver:{messages:{view_internal_messages:false}}}},
    individual(false,{}),individual(true,{view_internal_messages:false})]){
    Object.assign(f.docs.get(f.root+'companies/'+companyId),patch);
    assert.notEqual((await f.read()).permissionRevision,initial.permissionRevision);
  }
  f.docs.get(f.root+'employees/'+employee.id).isArchived=true;await assert.rejects(f.read(),{code:'permission-denied'});
});
test('actual trusted backend rejects stale capabilities after an individual read revoke in the same session',async()=>{
  const f=backendFixture(),initial=await f.read();
  const deriveCapabilities=subject=>backendDomain.hasCompanyRolePermissionAction(subject,'messages','view_internal_messages')?['synthetic.read-probe']:[];
  const access={active:true,readScope:'tenant',tenantId:companyId,permissionRevision:initial.permissionRevision,
    appIdentity:{id:employee.id,companyId},capabilities:deriveCapabilities(initial.subject)};
  f.docs.set('offlineCustomerAccess/'+f.uid,structuredClone(access));
  const actor={uid:f.uid,tenantId:companyId,permissionRevision:initial.permissionRevision};
  const args={db:f.db,reader:f.reader,appId:'roles-backend',actor,access,deriveCapabilities};
  await authorizeOriginalCoreGrant(args);
  Object.assign(f.docs.get(f.root+'companies/'+companyId),individual(false,{}));
  await assert.rejects(authorizeOriginalCoreGrant(args),{code:'permission-denied'});
});

test('actual backend projector agrees with actual App on message role/individual boolean grants and fallback',()=>{
  const positions=['Chủ doanh nghiệp','Kế toán & nhân sự','Kinh doanh','Tài xế','Sản xuất','Xuất kho'];
  const policies=[{},individual(false,{}),individual(false,{view_internal_messages:true}),individual(true,{view_internal_messages:false,view_support_messages:false}),
    {rolePermissionActions:{driver:{messages:{view_internal_messages:false,view_support_messages:false}}}},
    {rolePermissionActions:{driver:{messages:{view_internal_messages:false,view_support_messages:false}}},...individual(true,{})}];
  for(const position of positions)for(const company of policies)for(const action of ['view_internal_messages','view_support_messages']){
    const subject={...state(company),employee:{...employee,position}};
    assert.equal(backendDomain.hasCompanyRolePermissionAction(subject,'messages',action),hasCompanyRolePermissionAction(subject,'messages',action),position+' '+action);
  }
});
