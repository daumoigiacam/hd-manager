import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, setDoc, query, where, orderBy, documentId, limit, onSnapshot } from 'firebase/firestore';

const projectId=process.env.HD_SYSTEM_LAB_PROJECT;
if(!projectId?.startsWith('demo-')||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:9295')throw Error('Local demo emulator required.');
const output='test-results/full-system-transformation-20261101/local-realtime',appId='synthetic-realtime',companyId='synthetic-rt-a';
const environment=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:9295,rules:await readFile('firestore.rules','utf8')}});
const path=`artifacts/${appId}/public/data/products`,listeners=[],states=[],errors=[],rounds=[];
let writeStarted=null;
const wait=async(condition,timeout=20000)=>{
  const end=Date.now()+timeout;while(!condition()){if(errors.length)throw Error('Realtime listener error: '+errors[0]);if(Date.now()>end)throw Error('Realtime condition timeout');await new Promise(resolve=>setTimeout(resolve,20));}
};
try {
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();await Promise.all(Array.from({length:30},(_,i)=>setDoc(doc(db,`${path}/p${String(i).padStart(3,'0')}`),{companyId,revision:0,name:`Synthetic ${i}`})));
  });
  for(let i=0;i<50;i++){
    const db=environment.authenticatedContext(`synthetic-rt-${i}`,{identityId:`rt-${i}`,appUserId:`rt-${i}`,companyId,accountType:'employee',role:'sales'}).firestore();
    const state={initial:false,revisions:[],events:0};states.push(state);
    listeners.push(onSnapshot(query(collection(db,path),where('companyId','==',companyId),orderBy(documentId()),limit(20)),snapshot=>{
      if(snapshot.metadata.fromCache)return;
      try {
        assert(snapshot.size<=20);assert(snapshot.docs.every(row=>row.data().companyId===companyId));
        const revision=snapshot.docs.find(row=>row.id==='p000')?.data().revision;
        assert(Number.isInteger(revision));state.initial=true;state.events++;
        if(revision>0&&!state.revisions.some(row=>row.revision===revision))state.revisions.push({revision,afterWriteStartMs:performance.now()-writeStarted});
      }catch(error){errors.push(error.code||error.name||'snapshot-integrity');}
    },error=>errors.push(error.code||'listener-error')));
  }
  await wait(()=>states.every(state=>state.initial));
  for(let revision=1;revision<=3;revision++){
    writeStarted=performance.now();
    await environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),`${path}/p000`),{revision},{merge:true}));
    const ackAfterStartMs=performance.now()-writeStarted;
    await wait(()=>states.every(state=>state.revisions.some(row=>row.revision===revision)));
    const values=states.map(state=>state.revisions.find(row=>row.revision===revision).afterWriteStartMs).sort((a,b)=>a-b);
    rounds.push({revision,observerCount:states.length,ackAfterStartMs,p50Ms:values[Math.ceil(values.length*.5)-1],p95Ms:values[Math.ceil(values.length*.95)-1],p99Ms:values[Math.ceil(values.length*.99)-1],maxMs:values.at(-1),values});
  }
  assert.equal(errors.length,0);
} finally {
  for(const unsubscribe of listeners)unsubscribe();
  await environment.cleanup();await mkdir(output,{recursive:true});
  await writeFile(output+'/result.json',JSON.stringify({at:new Date().toISOString(),environment:'ISOLATED_ACTUAL_FIRESTORE_SDK',productionTraffic:false,
    syntheticListenerInstances:50,pageLimit:20,completed:rounds.length===3&&!errors.length,rounds,errors,
    scope:'50 distinct test SDK contexts, 3 synthetic updates; elapsed propagation starts BEFORE the write request and includes write/SDK work. Not server-only time. Local rules-unit-testing auth claims, not real HD login or 5000-device realtime capacity. Instant Data Engine realtime adapter remains separate migration work.'},null,2));
}
assert.equal(rounds.length,3);console.log(JSON.stringify({localRealtimeListeners:50,rounds:rounds.length,errors:errors.length}));
