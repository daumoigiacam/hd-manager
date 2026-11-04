import fs from 'node:fs/promises';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {makeFixture} from '../performance/phase2/synthetic-fixture.mjs';
import {makeRichSyntheticFixture} from '../performance/upgrade-20261103/rich-synthetic-fixture.mjs';
const project='demo-hdm-perf-verification',appId='verification-fixture',root=process.env.HD_VERIFICATION_REPORT_ROOT||'test-results/phase2-verification-20261102';
if(!/^test-results\/(?:phase2-verification-20261102|performance-upgrade-20261103\/[a-z0-9-]+)$/.test(root))throw Error('Invalid isolated service report root');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8185'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Exact isolated Emulator endpoints required');
const rich=process.env.HD_VERIFICATION_WORKLOAD==='rich-linked-v1';
const ttlHours=Number(process.env.HD_VERIFICATION_SERVICE_TTL_HOURS||6);
if(!Number.isInteger(ttlHours)||ttlHours<1||ttlHours>12)throw Error('Local fixture lifetime must be between 1 and 12 hours');
if(process.env.HD_VERIFICATION_WORKLOAD&&!rich)throw Error('Unknown synthetic workload');
const fixture=rich?makeRichSyntheticFixture():makeFixture('manager',1000),companyId=fixture.claims.companyId;
await fs.mkdir(root,{recursive:true});
const identities={
 '0900000001':{id:'fixture-manager',uid:'verification-manager',companyId,name:'Synthetic Manager',accountType:'employee',role:'super_admin'},
 '0900000002':{id:'fixture-sales',uid:'verification-sales',companyId,name:'Synthetic Sales',accountType:'employee',role:'employee',position:'Kinh doanh'},
 '0900000003':{id:'fixture-customer',uid:'verification-customer',customerId:'fixture-customer',companyId,name:'Synthetic Customer',accountType:'customer',role:'customer'},
};
fixture.data.employees=rich?Object.fromEntries(Object.entries(fixture.data.employees).filter(([id])=>id.startsWith('fiction-worker-'))):{};
for(const [phone,identity] of Object.entries(identities)){
 if(identity.accountType==='employee')fixture.data.employees[identity.id]={...identity,phone};
 else fixture.data.customers[identity.customerId]={...fixture.data.customers[identity.customerId],name:identity.name,phone};
}
for(const customer of Object.values(fixture.data.customers))customer.empId='fixture-sales';
for(const order of Object.values(fixture.data.orders))order.empId='fixture-sales';
fixture.data.companies[companyId]={...fixture.data.companies[companyId],ownerId:'fixture-manager',status:'active'};
function field(value){if(value===null)return {nullValue:null};if(Array.isArray(value))return {arrayValue:{values:value.map(field)}};
 if(typeof value==='string')return {stringValue:value};if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,field(v)]))}};}
const writes=[];
for(const [collection,records] of Object.entries(fixture.data)){
 if(collection.startsWith('__'))continue;
 for(const [id,data] of Object.entries(records))writes.push({update:{name:`projects/${project}/databases/(default)/documents/artifacts/${appId}/public/data/${collection}/${id}`,fields:field(data).mapValue.fields}});
}
for(let i=0;i<writes.length;i+=300){
 const response=await fetch(`http://127.0.0.1:8185/v1/projects/${project}/databases/(default)/documents:commit`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes:writes.slice(i,i+300)}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Local fixture seed failed: '+response.status);
}
await fs.writeFile(`${root}/fixture-manifest.json`,JSON.stringify({project,appId,at:new Date().toISOString(),businessSha256:createHash('sha256').update(JSON.stringify(fixture.data)).digest('hex'),records:writes.length,collections:Object.fromEntries(Object.entries(fixture.data).filter(([k])=>!k.startsWith('__')).map(([k,v])=>[k,Object.keys(v).length])),realAccounts:false,orderItems:rich?'6000 linked synthetic order items':'empty, not worst-case business history',...(rich?{workload:fixture.workload}:{})},null,2));
const counts={login:0,bootstrap:0,logout:0,unsupported:0};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type,authorization');
 res.setHeader('Access-Control-Allow-Methods','POST,HEAD,OPTIONS');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'||req.method==='HEAD'){res.writeHead(204);res.end();return}
 let bytes='';for await(const chunk of req){bytes+=chunk;if(bytes.length>20000){res.writeHead(413);res.end('{}');return}}
 let body;try{body=JSON.parse(bytes||'{}')}catch{res.writeHead(400);res.end('{}');return}
 const action=req.url.split('/').at(-1);
 if(action==='identityLogin'){
  const identity=identities[body.identifier];
  if(!identity||body.password!=='Local-fixture-only-2026!'||body.appId!==appId){res.writeHead(401);res.end(JSON.stringify({success:false,message:'Synthetic fixture login only'}));return}
  counts.login++;
  const claims={companyId,appUserId:identity.id,identityId:identity.uid+'-identity',role:identity.role,accountType:identity.accountType,...(identity.customerId?{customerId:identity.customerId}:{})};
  res.end(JSON.stringify({success:true,requiresSetup:false,identity:{...identity,identityId:claims.identityId,accountId:identity.id},customToken:JSON.stringify({uid:identity.uid,claims})}));
 }else if(action==='customerPortalBootstrap'){
  counts.bootstrap++;res.end(JSON.stringify({success:true,company:fixture.data.companies[companyId],customer:fixture.data.customers['fixture-customer'],customerAccount:{id:'fiction-account',customerId:'fixture-customer'},products:Object.values(fixture.data.products),rewardCatalog:[],promotions:[]}));
 }else if(action==='identityLogout'){
  counts.logout++;res.end(JSON.stringify({success:true}));
 }else{counts.unsupported++;res.writeHead(501);res.end(JSON.stringify({success:false,message:'Not implemented by isolated fixture'}))}
});
await new Promise(r=>server.listen(5002,'127.0.0.1',r));
await fs.writeFile(`${root}/emulator-service-status.json`,JSON.stringify({status:'READY',project,appId,pid:process.pid,identity:'local fixture, not real backend',firestore:'real SDK against demo Emulator',ports:[8185,9199,5002],ttlHours,expiresAt:new Date(Date.now()+ttlHours*3600000).toISOString()},null,2));
setInterval(()=>fs.writeFile(`${root}/emulator-service-counts.json`,JSON.stringify({at:new Date().toISOString(),...counts,productionRequests:0})),15000);
// Bound lifetime even if a test controller exits unexpectedly.
setTimeout(()=>server.close(()=>process.exit(0)),ttlHours*60*60*1000);
