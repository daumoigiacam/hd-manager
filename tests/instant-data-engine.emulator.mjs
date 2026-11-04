import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc, getDocsFromServer, collection, query, where, limit } from 'firebase/firestore';
import { createInstantDataEngine } from '../src/data/instantDataEngine.js';
import { createFirestorePageTransport } from '../src/data/firestorePageTransport.js';

const projectId=process.env.HD_SYSTEM_LAB_PROJECT;
if(!projectId?.startsWith('demo-')||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:9295')throw Error('Isolated demo Firestore is mandatory.');
const output='test-results/full-system-transformation-20261101/data-engine-sdk';
const appId='synthetic-data-lab',companyId='synthetic-a',checks=[],engines=[];
const environment=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:9295,rules:await readFile('firestore.rules','utf8')}});
const recordPath=id=>`artifacts/${appId}/public/data/products/${id}`;
const scope={principalId:'synthetic-sales',tenantId:companyId,permissionRevision:'fixture-v1'};
const policy=({scope:identity})=>({allowed:true,...identity,allowedFilterFields:['group'],filters:[]});
let admin;
const engineFor=(role='sales',options={})=>{
  const db=environment.authenticatedContext(`synthetic-${role}`,{identityId:`fixture-${role}`,companyId,appUserId:`synthetic-${role}`,accountType:'employee',role}).firestore();
  const transport=createFirestorePageTransport({db,appId,authorize:policy});
  const engine=createInstantDataEngine({scope:{...scope,principalId:`synthetic-${role}`},transport,...options});
  engines.push(engine);return {engine,db};
};
try {
  await environment.withSecurityRulesDisabled(async context=>{
    admin=context.firestore();
    await Promise.all(Array.from({length:47},(_,i)=>setDoc(doc(admin,recordPath(`p${String(i).padStart(3,'0')}`)),
      {companyId,group:i%2?'duck':'chicken',sequence:i,name:`Synthetic product ${i}`,id:'payload-id-must-not-spoof'})));
    await setDoc(doc(admin,recordPath('foreign')),{companyId:'synthetic-b',group:'duck',name:'Foreign fixture'});
  });
  const {engine}=engineFor(),rows=engine.openQuery({collection:'products'}),ids=[];
  do {
    if(!ids.length)await rows.load();else await rows.next();
    const state=rows.getSnapshot();assert.equal(state.dataSource,'server');assert(state.items.length<=20);
    ids.push(...state.items.map(item=>item.id));assert(state.items.every(item=>item.companyId===companyId));
    assert(!('total' in state));
  } while(rows.getSnapshot().hasMore);
  assert.equal(ids.length,47);assert.equal(new Set(ids).size,47);assert(!ids.includes('foreign'));
  checks.push('Actual SDK/server-only keyset query: 20/20/7, all 47 records once, payload identity ignored, tenant isolation, no guessed total.');

  const small=engine.openQuery({collection:'products',pageSize:15,filters:[{field:'group',op:'==',value:'duck'}]});
  await small.load();assert.equal(small.getSnapshot().items.length,15);assert(small.getSnapshot().items.every(item=>item.group==='duck'));
  const filteredIds=small.getSnapshot().items.map(item=>item.id);await small.next();filteredIds.push(...small.getSnapshot().items.map(item=>item.id));
  assert.equal(filteredIds.length,23);assert.equal(new Set(filteredIds).size,23);
  checks.push('15-record filtered server pages cover every matching record, including matches beyond the first page.');

  await rows.load();const first=rows.getSnapshot(),lastId=first.items.at(-1).id;
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();await deleteDoc(doc(db,recordPath(lastId)));
    await setDoc(doc(db,recordPath('p019z')),{companyId,group:'duck',name:'Insert after cursor'});
    await setDoc(doc(db,recordPath('p000a')),{companyId,group:'duck',name:'Insert before cursor'});
    await setDoc(doc(db,recordPath('p020')),{companyId,group:'duck',name:'Concurrent update',sequence:20});
  });
  // An already cached second page remains a labelled cache snapshot until its
  // refresh. Do not mistake cache freshness for realtime propagation.
  await rows.next();assert.equal(rows.getSnapshot().dataSource,'cache');
  await rows.load({cursor:first.nextCursor,force:true});const after=rows.getSnapshot();
  assert.equal(after.items[0].id,'p019z');assert(after.items.some(item=>item.id==='p020'&&item.name==='Concurrent update'));
  assert(!after.items.some(item=>first.items.some(old=>old.id===item.id)));
  assert(!after.items.some(item=>item.id==='p000a'));
  await rows.load({force:true});assert(rows.getSnapshot().items.some(item=>item.id==='p000a'));
  checks.push('Deleted cursor anchor and concurrent updates progress without offset/duplicate rows; new earlier insertion appears only after explicit refresh (live-keyset, not snapshot isolation).');

  const roles=['owner','super_admin','sales','purchasing','warehouse','accounting','delivery','driver','custom_fixture'];
  for(const role of roles){const current=engineFor(role).engine.openQuery({collection:'products'});await current.load();assert(current.getSnapshot().items.every(row=>row.companyId===companyId));}
  checks.push('Synthetic local claims for 9 employee role labels can read same-tenant product pages under current rules; this is NOT real role login or full CRUD acceptance.');

  const anonymous=environment.unauthenticatedContext().firestore();
  await assert.rejects(getDocsFromServer(query(collection(anonymous,`artifacts/${appId}/public/data/products`),where('companyId','==',companyId),limit(20))),error=>error.code==='permission-denied');
  const employee=engineFor().db;
  await assert.rejects(getDocsFromServer(query(collection(employee,`artifacts/${appId}/public/data/products`),where('companyId','==','synthetic-b'),limit(20))),error=>error.code==='permission-denied');
  const customer=environment.authenticatedContext('synthetic-customer',{identityId:'synthetic-customer',companyId,customerId:'synthetic-customer',accountType:'customer'}).firestore();
  await assert.rejects(getDocsFromServer(query(collection(customer,`artifacts/${appId}/public/data/expenses`),where('companyId','==',companyId),limit(20))),error=>error.code==='permission-denied');
  checks.push('Server rules deny anonymous product reads, foreign-tenant product reads and customer expense reads.');

  let permitted=true;
  const guarded=engineFor('sales',{isCurrent:()=>permitted}).engine,resource=guarded.openQuery({collection:'products'});
  await resource.load();assert(resource.getSnapshot().items.length>0);permitted=false;
  assert.equal(resource.getSnapshot().items.length,0);await assert.rejects(resource.load(),error=>error.name==='AbortError');
  assert.throws(()=>engine.openQuery({collection:'products',search:{text:'Synthetic'}}),error=>error.code==='search-not-configured');
  checks.push('Verified scope revocation immediately hides cached data; unsupported global substring search fails explicitly instead of silently filtering one page.');

  const livePages=[],liveErrors=[];
  const stopLive=engine.observePage({collection:'products'},{onData:value=>livePages.push(value),onError:error=>liveErrors.push(error.code)});
  try {
    const waitUntil=async condition=>{const end=Date.now()+20000;while(!condition()){
      if(liveErrors.length)throw Error('Live query error: '+liveErrors[0]);
      if(Date.now()>end)throw Error('Bounded realtime query timeout');await new Promise(resolve=>setTimeout(resolve,20));
    }};
    await waitUntil(()=>livePages.length>0);assert.equal(livePages[0].items.length,20);
    await environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),recordPath('p000')),{name:'Realtime updated fixture'},{merge:true}));
    await waitUntil(()=>rows.getSnapshot().items.some(item=>item.id==='p000'&&item.name==='Realtime updated fixture'));
    assert.equal(rows.getSnapshot().dataSource,'server-realtime');assert(livePages.every(page=>page.items.length<=20));
  }finally{stopLive()}
  assert.equal(engine.getDiagnostics().activeRealtimeQueries,0);
  checks.push('Actual SDK bounded20 realtime publication reaches shared query resources, preserves server-confirmed semantics and releases its subscription.');
} finally {
  for(const engine of engines)engine.close();
  await environment.cleanup();
  await mkdir(output,{recursive:true});
  await writeFile(output+'/result.json',JSON.stringify({generatedAt:new Date().toISOString(),environment:'ISOLATED_FIRESTORE_EMULATOR_ACTUAL_SDK',
    productionTraffic:false,checks,completed:checks.length===7,limits:['Synthetic claims; no real user login.','No production capacity or network latency certification.','Adapter not yet replacing all active App sources.','Search service, aggregates, durable offline outbox and write adapters remain migration work.']},null,2));
}
assert.equal(checks.length,7);console.log(JSON.stringify({dataEngineSdkChecks:checks.length,productionTraffic:false}));
