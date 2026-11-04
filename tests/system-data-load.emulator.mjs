import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

const project=process.env.HD_SYSTEM_LAB_PROJECT;
if(!project?.startsWith('demo-')||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:9295'
  ||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9296')throw Error('Local demo Auth and Firestore are mandatory.');
const require=createRequire(import.meta.url),admin=require('../functions/node_modules/firebase-admin');
const app=admin.initializeApp({projectId:project},'system-load-lab'),db=app.firestore(),auth=app.auth();
const diagnostic=process.env.HD_LOCAL_LOAD_DIAGNOSTIC==='true';
const output='test-results/full-system-transformation-20261101/'+(diagnostic?'local-protocol-load-unbounded-diagnostic':'local-protocol-load');
await mkdir(output,{recursive:true});
const report={startedAt:new Date().toISOString(),project,environment:'LOOPBACK_AUTH_FIRESTORE_EMULATORS',productionTraffic:false,
  workload:'Independent concurrent virtual sessions: Auth Emulator password sign-in, 20-row Firestore server page, full-dataset exact customer query. No UI/browser cache and no production data.',
  limitations:['This is protocol/integration load, not HD identityLogin or a deployed HD API benchmark.',
    'Virtual sessions share one synthetic identity; not 5000 real unique user accounts.',
    'Outstanding requests include client/socket queues; server-side concurrency is not measured.',
    'Round-trip timings include load-generator and local-emulator processing; no server-only latency is claimed.',
    'Realtime, transaction integrity and long soak are separate checks; mixed financial business load is not certified.',
    'No real Firebase/VPS scalability or cloud billing conclusion can be drawn from local emulators.'],
  generator:{node:process.version,cpuCount:os.cpus().length,totalMemoryBytes:os.totalmem(),
    transport:diagnostic?'unbounded-fetch-diagnostic':'native-http-keepalive-pool',maxSocketsPerOrigin:diagnostic?null:64},tiers:[],
  realCloudCapacity:'UNMEASURED',cloudCost:'NO_CLOUD_REQUESTS; real service cost unmeasured',serverResourceUsage:'UNMEASURED; generator/host samples only'};
const persist=()=>writeFile(output+'/result.json',JSON.stringify(report,null,2));
const agent=new http.Agent({keepAlive:true,maxSockets:64,maxFreeSockets:16});
let pending=0,peakPending=0;
const failures=new Map();
const sample=()=>({at:new Date().toISOString(),rssBytes:process.memoryUsage().rss,heapUsedBytes:process.memoryUsage().heapUsed,
  hostFreeMemoryBytes:os.freemem(),outstandingRequests:pending,
  activeClientSockets:diagnostic?null:Object.values(agent.sockets).reduce((sum,rows)=>sum+rows.length,0),
  agentQueuedRequests:diagnostic?null:Object.values(agent.requests).reduce((sum,rows)=>sum+rows.length,0)});
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const summarize=values=>({count:values.length,p50Ms:percentile(values,.50),p95Ms:percentile(values,.95),p99Ms:percentile(values,.99),maxMs:values.length?Math.max(...values):null});
const post=async(url,body,token)=>{
  const target=new URL(url);
  if(target.hostname!=='127.0.0.1'||!['9295','9296'].includes(target.port))throw Error('Non-emulator request blocked.');
  pending++;peakPending=Math.max(peakPending,pending);
  try {
    if(!diagnostic)return await new Promise((resolve,reject)=>{
      const encoded=JSON.stringify(body);
      const request=http.request(target,{method:'POST',agent,signal:AbortSignal.timeout(20000),
        headers:{'content-type':'application/json','content-length':Buffer.byteLength(encoded),...(token?{Authorization:`Bearer ${token}`}:{})}},response=>{
        const chunks=[];let bytes=0;
        response.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){request.destroy(Object.assign(new Error('Response limit exceeded'),{code:'RESPONSE_LIMIT'}));return;}chunks.push(chunk)});
        response.on('error',reject);
        response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(response.statusCode<200||response.statusCode>=300)throw Object.assign(new Error('Emulator HTTP failure'),{code:`HTTP_${response.statusCode}`});resolve(value);
        }catch(error){reject(error)}});
      });
      request.on('error',reject);request.end(encoded);
    });
    const response=await fetch(target,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const value=await response.json();if(!response.ok)throw Object.assign(new Error('Emulator HTTP failure'),{code:`HTTP_${response.status}`});
    return value;
  } finally {pending--;}
};
const appId='synthetic-load-only',companyId='load-company',root=`artifacts/${appId}/public/data`;
const parent=`projects/${project}/databases/(default)/documents/${root}`;
const firestoreUrl=`http://127.0.0.1:9295/v1/projects/${project}/databases/(default)/documents/${root}:runQuery`;
const authUrl='http://127.0.0.1:9296/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-load-key';
// Local, throwaway credential. Never copied to production or printed in logs.
const credentials={email:'load-fixture@example.invalid',password:'Synthetic-local-only-987!',returnSecureToken:true};
const structured=(collectionId,filters)=>({structuredQuery:{from:[{collectionId}],where:{compositeFilter:{op:'AND',filters:[
  {fieldFilter:{field:{fieldPath:'companyId'},op:'EQUAL',value:{stringValue:companyId}}},...filters]}},
  orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:20}});
const customers=structured('customers',[{fieldFilter:{field:{fieldPath:'name'},op:'EQUAL',value:{stringValue:'Synthetic target outside first page'}}}]);
const products=structured('products',[]);
try {
  const user=await auth.createUser({email:credentials.email,password:credentials.password});
  await auth.setCustomUserClaims(user.uid,{identityId:'synthetic-load-identity',appUserId:'synthetic-load-user',companyId,accountType:'employee',role:'sales'});
  const batch=db.batch();
  for(let i=0;i<47;i++){
    batch.set(db.doc(`${root}/products/p${String(i).padStart(3,'0')}`),{companyId,name:`Synthetic product ${i}`,sequence:i});
    batch.set(db.doc(`${root}/customers/c${String(i).padStart(3,'0')}`),{companyId,name:i===46?'Synthetic target outside first page':`Synthetic customer ${i}`,sequence:i});
  }
  await batch.commit();
  const preflight=await post(authUrl,credentials);
  assert.equal((await post(firestoreUrl,products,preflight.idToken)).filter(row=>row.document).length,20);
  const search=await post(firestoreUrl,customers,preflight.idToken);assert.equal(search.filter(row=>row.document).length,1);assert.equal(search.find(row=>row.document).document.name,`${parent}/customers/c046`);
  report.preflight={auth:true,page20:true,globalExactMatchOutsideFirstPage:true};
  await persist();
  for(const users of diagnostic?[100,500]:[100,500,1000,3000,5000]){
    if(os.freemem()<3*1024**3){report.tiers.push({virtualUsers:users,status:'NOT_RUN_HOST_MEMORY_GUARD'});await persist();continue;}
    failures.clear();peakPending=0;
    const timings={auth:[],page:[],search:[]},successTimings={auth:[],page:[],search:[]},samples=[sample()];
    const histogram=monitorEventLoopDelay({resolution:20});histogram.enable();
    const cpuStart=process.cpuUsage(),started=performance.now();
    const timer=setInterval(()=>samples.push(sample()),1000);
    let complete=0,failed=0,documentsObserved=0;
    const measured=async(kind,run)=>{
      const start=performance.now();
      try{const value=await run();const duration=performance.now()-start;timings[kind].push(duration);successTimings[kind].push(duration);return value;}
      catch(error){timings[kind].push(performance.now()-start);const code=error.code||error.cause?.code||error.cause?.errors?.map(item=>item.code).join(',')||error.name||'UNKNOWN';failures.set(kind+':'+code,(failures.get(kind+':'+code)||0)+1);throw error;}
    };
    await Promise.all(Array.from({length:users},async()=>{
      try {
        const session=await measured('auth',()=>post(authUrl,credentials));
        const rows=await measured('page',()=>post(firestoreUrl,products,session.idToken));
        assert.equal(rows.filter(row=>row.document).length,20);documentsObserved+=20;
        const matches=await measured('search',()=>post(firestoreUrl,customers,session.idToken));
        assert.equal(matches.filter(row=>row.document).length,1);documentsObserved++;
        complete++;
      }catch(error){failed++;if(error.code==='ERR_ASSERTION')failures.set('integrity-assertion',(failures.get('integrity-assertion')||0)+1);}
    }));
    clearInterval(timer);histogram.disable();samples.push(sample());
    const durationMs=performance.now()-started;
    report.tiers.push({virtualUsers:users,status:failed?'LOCAL_PROTOCOL_ERRORS':'LOCAL_PROTOCOL_COMPLETED',sessionsCompleted:complete,sessionsFailed:failed,errorRate:failed/users,
      durationMs,completedSessionsPerSecond:complete/(durationMs/1000),peakOutstandingFetchCalls:peakPending,
      roundTripAllCompletedAttempts:Object.fromEntries(Object.entries(timings).map(([kind,values])=>[kind,summarize(values)])),
      roundTripSuccessfulAttempts:Object.fromEntries(Object.entries(successTimings).map(([kind,values])=>[kind,summarize(values)])),
      errors:Object.fromEntries(failures),logicalDocumentsObserved:documentsObserved,billableDatabaseReads:'UNMEASURED_NOT_BILLABLE_EMULATOR',
      generatorCpuMicros:process.cpuUsage(cpuStart),generatorEventLoop:{p95Ms:histogram.percentile(95)/1e6,p99Ms:histogram.percentile(99)/1e6,maxMs:histogram.max/1e6},samples});
    await persist();console.log(JSON.stringify({localProtocolVirtualUsers:users,complete,failed,peakPending,durationMs}));
  }
} finally {
  report.endedAt=new Date().toISOString();report.status=report.tiers.some(t=>t.sessionsFailed||t.status.startsWith('NOT_RUN'))?'INCOMPLETE_OR_PROTOCOL_ERRORS':'LOCAL_PROTOCOL_MEASURED_NOT_PRODUCTION_ACCEPTANCE';
  await persist();agent.destroy();await app.delete();
}
if(report.tiers.some(t=>t.sessionsFailed))process.exitCode=1;
