const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {parse}=require('@babel/parser');
const sanitizers=require('../functions/customerPortalSecurity');
const source=readFileSync('functions/index.js','utf8'),tree=parse(source,{sourceType:'script'});
const declarations=new Map(tree.program.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).map(n=>[n.id.name,n.init]));
const build=(name,bindings)=>{const n=declarations.get(name);return new Function(...Object.keys(bindings),`return (${source.slice(n.start,n.end)})`)(...Object.values(bindings))};
function harness({claims,missing=false,foreignProfile=false,failRead=false}={}){
 const calls=[],headers={};let packet;
 const path=(app,name)=>`artifacts/${app}/public/data/${name}`;
 const profile={companyId:foreignProfile?'company-b':'company-a',name:'Fixture',password_hash:'must-not-leak'};
 const documents={companies:{name:'Fixture company',payosClientSecret:'must-not-leak'},customers:profile,
  customer_accounts:{customerId:'customer-a',phone:'fixture-phone',password_hash:'must-not-leak'}};
 const db={doc:p=>({get:async()=>{calls.push(p);if(failRead)throw Error('backend unavailable');const collection=p.split('/').at(-2);
  return {id:p.split('/').at(-1),exists:!missing,data:()=>documents[collection]}}}),
  collection:p=>({where:(field,op,value)=>({get:async()=>{calls.push({p,field,op,value});assert.equal(field,'companyId');assert.equal(op,'==');
   const rows=[{id:'visible',companyId:'company-a',name:'Visible',price:500,costPrice:100,password_hash:'must-not-leak'},
    {id:'foreign',companyId:'company-b',name:'Foreign'}];
   return {docs:rows.filter(row=>row.companyId===value).map(row=>({id:row.id,data:()=>row}))}}})})};
 const createRequestError=decision=>Object.assign(Error(decision.message),decision);
 const requireCustomerIdentity=build('requireCustomerIdentity',{createRequestError});
 const runProtectedCustomerRequest=build('runProtectedCustomerRequest',{
  applyCors:()=>{},normalizeAppId:value=>value||'fixture',verifyTenantIdentityRequest:async(req)=>{
   if(!req.authorization)throw createRequestError({statusCode:401,code:'unauthenticated'});
   return claims||{accountType:'customer',companyId:'company-a',customerId:'customer-a',appUserId:'account-a'};
  },requireCustomerIdentity,sendJson:(_res,status,data)=>{packet={status,data};return packet},
  sendProtectedEndpointError:(_res,error,message)=>{packet={status:error.statusCode||500,data:{success:false,code:error.code,message}};return packet},console:{error:()=>{}},
 });
 const loadTenantCatalog=build('loadTenantCatalog',{db,collectionPath:path});
 const endpoint=build('customerPortalBootstrapRequest',{...sanitizers,db,collectionPath:path,loadTenantCatalog,runProtectedCustomerRequest,createRequestError});
 const res={status:status=>({send:()=>{packet={status}}}),set:(name,value)=>{headers[name]=value}};
 return {calls,headers,run:async(method='POST',authorization=true)=>{await endpoint({method,authorization,body:{appId:'fixture',companyId:'company-b',customerId:'foreign'}},res);return packet}};
}
test('actual protected bootstrap uses verified scope, parallel complete catalogs and public sanitizers',async()=>{
 const h=harness(),r=await h.run();assert.equal(r.status,200);assert.equal(r.data.customer.id,'customer-a');assert.equal(r.data.company.id,'company-a');
 assert.equal(r.data.company.payosClientSecret,undefined);assert.equal(r.data.customer.password_hash,undefined);assert.equal(r.data.customerAccount.password_hash,undefined);
 assert.deepEqual(r.data.products.map(p=>p.id),['visible']);assert.equal(r.data.products[0].costPrice,undefined);
 assert.equal(h.calls.length,6);assert(h.calls.filter(p=>typeof p==='string').every(p=>!p.endsWith('/foreign')));
 assert.equal(h.headers['Cache-Control'],'private, no-store, max-age=0');
});
test('OPTIONS/GET, anonymous and employee callers cannot execute catalog/profile reads',async()=>{
 for(const [method,authorized,claims,expected]of [['OPTIONS',false,null,204],['GET',true,null,405],['POST',false,null,401],['POST',true,{accountType:'employee'},403]]){
  const h=harness({claims}),r=await h.run(method,authorized);assert.equal(r.status,expected);assert.equal(h.calls.length,0);
 }
});
test('missing profile, foreign profile and a failed read never publish a partial bootstrap',async()=>{
 for(const [options,status]of [[{missing:true},404],[{foreignProfile:true},403],[{failRead:true},500]]){
  const r=await harness(options).run();assert.equal(r.status,status);assert.equal(r.data.success,false);assert.equal(r.data.products,undefined);
 }
});
