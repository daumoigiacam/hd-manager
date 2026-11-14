// Adapter contracts only. DAO/token doubles are NOT Production/HTTPS evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createTrustedOfflineBackend} from '../functions/offlineTrustedBackend.mjs';
import {createTrustedOfflineHttp} from '../functions/offlineTrustedHttp.cjs';
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
function fixture(){
 const projectId='hd-offline-read-contract',appId='trusted-read-contract',root=`artifacts/${appId}/public/data/`,rows=new Map();
 const doc=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(path)});
 function snapshot(path){return {...doc(path),exists:rows.has(path),data:()=>structuredClone(rows.get(path)),updateTime:{toMillis:()=>1700000000000}};}
 function query(path,conditions=[],orders=[],limitN=Infinity,after=null){return {path,conditions,orders,limitN,after,
  where:(...args)=>query(path,[...conditions,args],orders,limitN,after),orderBy:(...args)=>query(path,conditions,[...orders,args],limitN,after),limit:n=>query(path,conditions,orders,n,after),startAfter:(...args)=>query(path,conditions,orders,limitN,args)};}
 const db={projectId,doc,collection:path=>query(path),async runTransaction(work){return work({async get(ref){
  if(!ref.conditions)return snapshot(ref.path);
  const field=(r,k)=>k==='__name__'?r.id:r.data()[k];
  let docs=[...rows.keys()].filter(p=>p.startsWith(ref.path+'/')&&!p.slice(ref.path.length+1).includes('/')).map(snapshot);
  for(const [key,op,value]of ref.conditions){assert.equal(typeof key,'string');docs=docs.filter(d=>op==='=='?field(d,key)===value:op==='in'?value.includes(field(d,key)):op==='>='?field(d,key)>=value:op==='<'?field(d,key)<value:false);}
  docs.sort((a,b)=>{for(const [key,direction]of ref.orders){const av=field(a,key),bv=field(b,key);if(av!==bv)return (av>bv?1:-1)*(direction==='desc'?-1:1);}return 0;});
  if(ref.after){const n=docs.findIndex(d=>ref.orders.every(([key],i)=>field(d,key)===(ref.after[i]?.id||ref.after[i])));docs=docs.slice(n+1);}
  docs=docs.slice(0,ref.limitN);return {docs,size:docs.length,empty:!docs.length};
 },set(){throw Error('Read route attempted a write');},delete(){throw Error('Read route attempted a delete');}});}};
 const tokens={};for(const x of ['a','b']){
  const identityId='employee_'+x;tokens[x]={uid:'identity_'+identityId,identityId,companyId:'tenant-'+x,appUserId:'employee-'+x,accountType:'employee',aud:projectId,iss:'https://securetoken.google.com/'+projectId,exp:Math.floor(Date.now()/1000)+3600};
  rows.set('identity_accounts/'+identityId,{status:'active',accountType:'employee',companyId:'tenant-'+x,appUserId:'employee-'+x});
  rows.set(root+'companies/tenant-'+x,{name:'Contract '+x});rows.set(root+'employees/employee-'+x,{companyId:'tenant-'+x,name:'Contract employee '+x,position:'Chủ doanh nghiệp',role:'super_admin'});
  rows.set(root+'orders/order-'+x,{companyId:'tenant-'+x,date:'2026-11-13',total:123});
  rows.set(root+'attendance/2026-11-13_employee-'+x,{companyId:'tenant-'+x,status:'present',checkIn:'2026-11-13T01:00:00Z',checkOut:'2026-11-13T05:00:00Z'});
  rows.set(root+'payrollSnapshots/snapshot-'+x,{companyId:'tenant-'+x,employeeId:'employee-'+x,monthKey:'2026-11'});
  rows.set('attendanceAdjustmentRequests/request-'+x,{id:'request-'+x,tenantId:'tenant-'+x,principalId:tokens[x].uid,status:'PENDING_REVIEW'});
  const item={companyId:'tenant-'+x,date:'2026-11-13',quantity:2,amount:456};rows.set(root+'warehouseImports/import-'+x,item);
  rows.set('offlineHomeFeeds/tenant-'+x,{generation:'generation-'+x,sourceRevisions:{warehouseImports:1},counts:{warehouseImports:1},sourceReady:{warehouseImports:true},asOfDay:'2026-11-13'});
  rows.set('offlineHomeFeeds/tenant-'+x+'/sourceVersions/'+hash(['warehouseImports','import-'+x]),{generation:'generation-'+x,source:'warehouseImports',id:'import-'+x,hash:hash({...item,id:'import-'+x})});
 }
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const auth={app:{options:{projectId}},async verifyIdToken(token,revoked){assert.equal(revoked,true);if(!tokens[token])throw Object.assign(Error('invalid token'),{code:'auth/invalid-id-token'});return tokens[token];}};
 const api=createTrustedOfflineBackend({db,auth,configuration:{projectId,appId,environment:'development',appOrigin:'https://contract.example.com',publicKey:{...publicKey.export({format:'jwk'}),alg:'RS256'}},getSigningKey:async()=>privateKey.export({format:'pem',type:'pkcs8'})});
 async function call(action,body={},token='a',origin='https://contract.example.com'){
  const result={headers:{}};const res={set:(k,v)=>result.headers[k]=v,status(s){result.status=s;return this;},json(b){result.body=b;return this;},end(){return this;}};
  await api.handler({method:'POST',path:'/offline/'+action,body,get:k=>k==='origin'?origin:k==='authorization'?'Bearer '+token:''},res);return result;
 }
 return {rows,root,api,call,tokens};
}
test('all six routes execute existing tenant-filtered business queries, never a placeholder 200',async()=>{
 const f=fixture();try{
  const grant=await f.call('grant',{deviceId:'contract-device'});assert.equal(grant.status,200);const scope=grant.body.scope;
  const sources=await f.call('business-source',{scope,plan:[{source:'orders',options:{limit:1}}]});assert.equal(sources.status,200);assert.deepEqual(sources.body.results[0].items.map(x=>x.id),['order-a']);
  const period=await f.call('attendance-period',{action:'read',employeeId:'employee-a',monthKey:'2026-11'});assert.equal(period.status,200);assert.equal(period.body.sourceRecordCount,1);assert.equal(period.body.days.length,30);
  const settlement=await f.call('payroll-settlement',{action:'catalog',monthKey:'2026-11'});assert.equal(settlement.status,200);assert.deepEqual(settlement.body.items.map(x=>x.id),['snapshot-a']);
  const request=await f.call('attendance-adjustment',{action:'list'});assert.equal(request.status,200);assert.deepEqual(request.body.items.map(x=>x.id),['request-a']);
  const head=await f.call('warehouse-import-head',{scope});assert.equal(head.status,200);assert.equal(head.body.counts.warehouseImports,1);
  const page=await f.call('warehouse-import-page',{scope,query:{}});assert.equal(page.status,200);assert.deepEqual(page.body.items.map(x=>x.id),['import-a']);assert.equal(page.body.items[0].document.amount,456);assert.equal(page.body.hasMore,false);
  for(const cap of ['attendancePeriod.read','attendanceRequest.read','salarySettlement.read'])assert(JSON.parse(Buffer.from(grant.body.signedGrant.split('.')[1],'base64url')).capabilities.includes(cap));
 }finally{await f.api.close();}
});
test('read routes enforce auth, current permission, tenant scope, cursor binding and deny write smuggling',async()=>{
 const f=fixture();try{
  const scope=(await f.call('grant',{deviceId:'device-a'})).body.scope;
  assert.equal((await f.call('business-source',{scope:{...scope,tenantId:'tenant-b'},plan:[{source:'orders'}]})).status,403);
  assert.equal((await f.call('attendance-period',{action:'read',employeeId:'employee-b',monthKey:'2026-11'})).status,403);
  assert.equal((await f.call('attendance-adjustment',{action:'approve'})).status,403);
  assert.equal((await f.call('payroll-settlement',{command:{kind:'salarySettlement.pay'}})).status,403);
  assert.equal((await f.call('warehouse-import-head',{scope},'invalid')).status,401);
  assert.equal((await f.call('attendance-adjustment',{action:'list'},'a','https://evil.example.com')).status,403);
  assert.equal((await f.call('warehouse-import-page',{scope,query:{cursor:JSON.stringify({v:2,epoch:'wrong',key:'wrong',after:['2026-11-13','import-b']})}})).body.reset,true);
  f.rows.get(f.root+'employees/employee-a').isArchived=true;
  assert.equal((await f.call('attendance-adjustment',{action:'list'})).status,403);
  for(const kind of ['order.create','cashflow.expense.create','payroll.lock','salarySettlement.pay'])assert.notEqual((await f.call('sync',{command:{kind}})).status,200);
 }finally{await f.api.close();}
});
test('packaged Android HTTPS origin uses the same current authenticated tenant authority',async()=>{
 const f=fixture();try{const grant=await f.call('grant',{deviceId:'android-unit-device'},'a','https://localhost');assert.equal(grant.status,200);assert.equal(grant.body.scope.tenantId,'tenant-a');assert.equal(grant.headers['Access-Control-Allow-Origin'],'https://localhost');
  const read=await f.call('business-source',{scope:grant.body.scope,plan:[{source:'orders',options:{limit:2}}]},'a','https://localhost');assert.equal(read.status,200);assert.deepEqual(read.body.results[0].items.map(x=>x.id),['order-a']);
  assert.equal((await f.call('grant',{deviceId:'android-unit-device'},'','https://localhost')).status,401);assert.equal((await f.call('grant',{deviceId:'android-unit-device'},'a','https://localhost.evil.example.com')).status,403);
 }finally{await f.api.close();}
});
test('native preflight is limited to approved exact origins; enabling Native never enables arbitrary web origins',async()=>{
 assert.throws(()=>createTrustedOfflineHttp({environment:{appOrigin:'https://app.example.com'},api:{},nativeOrigins:['https://attacker.example.com']}),/Unexpected packaged Native origin/);
 const handler=createTrustedOfflineHttp({environment:{appOrigin:'https://app.example.com'},api:{handle:()=>{throw Error('Preflight must not dispatch');}},nativeOrigins:['https://localhost']});const result={headers:{}},res={set:(k,v)=>result.headers[k]=v,status(s){result.status=s;return this;},end(){return this;},json(){return this;}};
 await handler({method:'OPTIONS',get:k=>k==='origin'?'https://localhost':''},res);assert.equal(result.status,204);assert.equal(result.headers['Access-Control-Allow-Origin'],'https://localhost');
});

test('missing Firestore index is an infrastructure outage, never a malformed client payload or fake successful page',async()=>{
 const handler=createTrustedOfflineHttp({environment:{appOrigin:'https://qa.example.com'},api:{handle:async()=>{throw Object.assign(Error('The query requires an index. Internal administration URL must not be exposed'),{code:9});}}}),response={headers:{}};
 const res={set:(k,v)=>response.headers[k]=v,status(s){response.status=s;return this;},json(body){response.body=body;return this;}};
 await handler({method:'POST',path:'/offline/warehouse-import-page',body:{query:{}},get:key=>key==='origin'?'https://qa.example.com':key==='authorization'?'Bearer unit-test-token':''},res);
 assert.equal(response.status,503);assert.deepEqual(response.body,{code:'unavailable'});
});
