import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{execFileSync}from'node:child_process';import{parse}from'@babel/parser';
import{isEmployeeReviewEnabled,employeeReviewFeaturePatch}from'../src/utils/companyEmployeeReviews.js';
import{hasCompanyRolePermissionAction}from'../src/features/payroll/payrollOriginalDomain.js';
import{fixture,owner,staff,companyId,tick}from'./helpers/settings-parent-fixture.mjs';
const file=new URL('../src/App.jsx',import.meta.url),source=fs.readFileSync(file,'utf8');
const find=(text,name)=>{let found;const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name===name&&(name!=='canAccess'||text.slice(n.init.start,n.init.end).includes("permissionId === 'employee_reviews'")))found=n.init;if(n.type==='FunctionDeclaration'&&n.id?.name===name)found=n;for(const[k,v]of Object.entries(n)){if(['loc','extra','comments'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}};walk(parse(text,{sourceType:'module',plugins:['jsx']}));assert(found,'Missing canonical function '+name);return text.slice(found.start,found.end);};
const bind=(name,env)=>new Function(...Object.keys(env),`return (${find(source,name)});`)(...Object.values(env));
test('company flag defaults preserve existing accounts and remain independent between tenants',()=>{
 assert.equal(isEmployeeReviewEnabled({id:'a'}),true);assert.equal(isEmployeeReviewEnabled({id:'a',employeeReviewsEnabled:false}),false);assert.equal(isEmployeeReviewEnabled({id:'b',employeeReviewsEnabled:true}),true);
 assert.throws(()=>employeeReviewFeaturePatch('false','actor',{}));assert.throws(()=>employeeReviewFeaturePatch(false,'',{}));
});
test('canonical owner handler writes only the review flag/actor/server timestamp in a server-confirmed transaction',async()=>{
 const f=fixture({company:{salaryPolicy:{amount:420000}}});const result=await f.call({employeeReviewsEnabled:false});assert.equal(result.success,true);assert.equal(result.confirmed,true);
 const writes=f.writes.filter(row=>row.ref.startsWith('companies/'));assert.equal(writes.length,1);assert.equal(writes[0].ref,'companies/'+companyId);assert.deepEqual(Object.keys(writes[0].patch).sort(),['employeeReviewsEnabled','employeeReviewsUpdatedAt','employeeReviewsUpdatedByEmpId']);assert.equal(writes[0].patch.employeeReviewsUpdatedByEmpId,owner.id);assert.equal(f.visible.employeeReviewsEnabled,false);assert.deepEqual(f.visible.salaryPolicy,{amount:420000});
});
test('canonical handler rejects non-owners and mixed setting patches before writing',async()=>{
 const f=fixture({actor:staff});await assert.rejects(f.call({employeeReviewsEnabled:false}),{code:'permission-denied'});assert.equal(f.writes.length,0);
 const g=fixture();await assert.rejects(g.call({employeeReviewsEnabled:false,salaryPolicy:{amount:0}}));assert.equal(g.writes.length,0);
});
test('new settings action denies by default, supports explicit role/individual grants, and revokes immediately',async()=>{
 const permission=(company,employee={id:'staff',position:'Kế toán & nhân sự'})=>hasCompanyRolePermissionAction({company,employee,currentUser:{role:'employee'}},'settings','manage_employee_review_settings');
 assert.equal(permission({}),false);
 const company={rolePermissionActions:{accounting:{settings:{manage_employee_review_settings:true}}}};
 assert.equal(permission(company),true);
 const f=fixture({actor:{...staff,id:'staff',position:'Kế toán & nhân sự'},company});
 assert.equal((await f.call({employeeReviewsEnabled:false})).success,true);
 company.employeeRolePermissions={staff:{settings:true}};
 assert.equal(permission(company),false,'individual override replaces role grant');
 company.employeeRolePermissionActions={staff:{settings:{manage_employee_review_settings:true}}};
 assert.equal(permission(company),true);
 company.employeeRolePermissionActions.staff.settings.manage_employee_review_settings=false;
 assert.equal(permission(company),false);const count=f.writes.length;
 Object.assign(f.env.currentCompany,company);Object.assign(f.docs.get('companies/'+companyId),company);
 await assert.rejects(f.call({employeeReviewsEnabled:true}),{code:'permission-denied'});assert.equal(f.writes.length,count);
});
test('no offline success or stale company UI after late confirmation during account change',async()=>{
 const f=fixture();f.env.runTransaction=async()=>{throw Error('offline');};await assert.rejects(f.call({employeeReviewsEnabled:false}),/offline/);assert.equal(f.visible.employeeReviewsEnabled,true);
 const g=fixture();g.defer=true;const pending=g.call({employeeReviewsEnabled:false});await tick();g.env.activeTenantScopeRef.current='b';g.acks[0].resolve();await assert.rejects(pending,{code:'settings_scope_changed'});assert.equal(g.publications.length,0);assert.equal(g.visible.employeeReviewsEnabled,true);
});
test('canonical direct navigation and save callback cannot bypass a disabled company feature, including the owner',async()=>{
 const env={isEmployeeReviewEnabled,currentCompany:{id:'a',employeeReviewsEnabled:false},localWorkflowRoutes:[],isOwnerAccount:true,isSuperAdmin:true,hasRoleModuleAccess:()=>true};
 assert.equal(bind('canAccess',env)('employee_reviews'),false);assert.equal(bind('canAccess',env)('payroll'),true);
 assert.equal((await bind('handleAddEmployeeReview',{firebaseUser:{uid:'a'},myCompanyId:'a',currentCompany:env.currentCompany,isEmployeeReviewEnabled})({targetEmployeeId:'x'})).success,false);
});
test('review scoring remains unchanged; the company toggle never rewrites scoring history',()=>{
 const baseline='4561a08cf58376527228ff674e5b1e7c0b7b3d58';
 const previous=execFileSync('git',['show',baseline+':development/hd-manager/application/src/App.jsx'],{encoding:'utf8',maxBuffer:12*1024*1024});
 const name='buildEmployeeReviewSummary';assert.equal(find(source,name).replaceAll('\r\n','\n'),find(previous,name).replaceAll('\r\n','\n'),name);
});
