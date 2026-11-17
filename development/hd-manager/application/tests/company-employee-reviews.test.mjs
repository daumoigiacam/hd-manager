import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{execFileSync}from'node:child_process';import{parse}from'@babel/parser';
import{isEmployeeReviewEnabled,employeeReviewFeaturePatch}from'../src/utils/companyEmployeeReviews.js';
import{hasCompanyRolePermissionAction}from'../src/features/payroll/payrollOriginalDomain.js';
const file=new URL('../src/App.jsx',import.meta.url),source=fs.readFileSync(file,'utf8');
const find=(text,name)=>{let found;const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name===name&&(name!=='canAccess'||text.slice(n.init.start,n.init.end).includes("permissionId === 'employee_reviews'")))found=n.init;if(n.type==='FunctionDeclaration'&&n.id?.name===name)found=n;for(const[k,v]of Object.entries(n)){if(['loc','extra','comments'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}};walk(parse(text,{sourceType:'module',plugins:['jsx']}));assert(found,'Missing canonical function '+name);return text.slice(found.start,found.end);};
const bind=(name,env)=>new Function(...Object.keys(env),`return (${find(source,name)});`)(...Object.values(env));
function ownerEnvironment(){
 let company={id:'a',name:'Company A',employeeReviewsEnabled:true,salaryPolicy:{amount:420000}},companies=[company];
 const operations=[],stamp={serverTimestamp:true};
 const env={firebaseUser:{uid:'owner-a'},myCompanyId:'a',appCurrentEmployee:{id:'owner-a'},currentUser:{id:'owner-a',role:'owner'},isOwnerAccountUser:()=>true,employeeReviewFeaturePatch,serverTimestamp:()=>stamp,db:{},appId:'local-test',doc:(...p)=>p.slice(1).join('/'),withTimeout:p=>p,runTransaction:async(_,callback)=>callback({get:async()=>({exists:()=>true}),update:(ref,patch)=>operations.push({ref,patch})}),setCurrentCompany:f=>{company=f(company);},setRawCompanies:f=>{companies=f(companies);}};
 Object.assign(env,{currentCompany:company,hasCompanyRolePermissionAction});
 return{env,operations,read:()=>({company,companies}),switchCompany:next=>{company=next;companies=[next];}};
}
test('company flag defaults preserve existing accounts and remain independent between tenants',()=>{
 assert.equal(isEmployeeReviewEnabled({id:'a'}),true);assert.equal(isEmployeeReviewEnabled({id:'a',employeeReviewsEnabled:false}),false);assert.equal(isEmployeeReviewEnabled({id:'b',employeeReviewsEnabled:true}),true);
 assert.throws(()=>employeeReviewFeaturePatch('false','actor',{}));assert.throws(()=>employeeReviewFeaturePatch(false,'',{}));
});
test('canonical owner handler writes only the review flag/actor/server timestamp in a server-confirmed transaction',async()=>{
 const f=ownerEnvironment();assert.deepEqual(await bind('handleUpdateCompanySettings',f.env)({employeeReviewsEnabled:false}),{success:true});
 assert.equal(f.operations.length,1);assert.equal(f.operations[0].ref,'artifacts/local-test/public/data/companies/a');assert.deepEqual(Object.keys(f.operations[0].patch).sort(),['employeeReviewsEnabled','employeeReviewsUpdatedAt','employeeReviewsUpdatedByEmpId']);assert.equal(f.read().company.employeeReviewsEnabled,false);assert.deepEqual(f.read().company.salaryPolicy,{amount:420000});
});
test('canonical handler rejects non-owners and mixed setting patches before writing',async()=>{
 const f=ownerEnvironment();f.env.isOwnerAccountUser=()=>false;f.env.currentUser={role:'accounting'};assert.equal((await bind('handleUpdateCompanySettings',f.env)({employeeReviewsEnabled:false})).success,false);assert.equal(f.operations.length,0);
 const g=ownerEnvironment();assert.equal((await bind('handleUpdateCompanySettings',g.env)({employeeReviewsEnabled:false,salaryPolicy:{amount:0}})).success,false);assert.equal(g.operations.length,0);
});
test('new settings action denies by default, supports explicit role/individual grants, and revokes immediately',async()=>{
 const permission=(company,employee={id:'staff',position:'Kế toán & nhân sự'})=>hasCompanyRolePermissionAction({company,employee,currentUser:{role:'employee'}},'settings','manage_employee_review_settings');
 assert.equal(permission({}),false);
 const company={rolePermissionActions:{accounting:{settings:{manage_employee_review_settings:true}}}};
 assert.equal(permission(company),true);
 const f=ownerEnvironment();Object.assign(f.env,{appCurrentEmployee:{id:'staff',position:'Kế toán & nhân sự'},currentUser:{id:'staff',role:'employee'},currentCompany:company});
 assert.equal((await bind('handleUpdateCompanySettings',f.env)({employeeReviewsEnabled:false})).success,true);
 company.employeeRolePermissions={staff:{settings:true}};
 assert.equal(permission(company),false,'individual override replaces role grant');
 company.employeeRolePermissionActions={staff:{settings:{manage_employee_review_settings:true}}};
 assert.equal(permission(company),true);
 company.employeeRolePermissionActions.staff.settings.manage_employee_review_settings=false;
 assert.equal(permission(company),false);const count=f.operations.length;
 assert.equal((await bind('handleUpdateCompanySettings',f.env)({employeeReviewsEnabled:true})).success,false);assert.equal(f.operations.length,count);
});
test('no offline success or stale company UI after late confirmation during account change',async()=>{
 const f=ownerEnvironment();f.env.runTransaction=async()=>{throw Error('offline');};await assert.rejects(bind('handleUpdateCompanySettings',f.env)({employeeReviewsEnabled:false}),/offline/);assert.equal(f.read().company.employeeReviewsEnabled,true);
 const g=ownerEnvironment();let done;g.env.runTransaction=()=>new Promise(resolve=>{done=resolve;});const pending=bind('handleUpdateCompanySettings',g.env)({employeeReviewsEnabled:false});g.switchCompany({id:'b',employeeReviewsEnabled:true});done();await pending;assert.deepEqual(g.read(),{company:{id:'b',employeeReviewsEnabled:true},companies:[{id:'b',employeeReviewsEnabled:true}]});
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
