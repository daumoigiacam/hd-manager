import {createRequire} from 'node:module';import {fork} from 'node:child_process';import {Session} from 'node:inspector';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';import {getHeapStatistics,getHeapSpaceStatistics} from 'node:v8';import {PerformanceObserver} from 'node:perf_hooks';
const require=createRequire(import.meta.url),fromFunctions=createRequire(path.resolve('functions/package.json'));
const {v1}=fromFunctions('firebase-admin/firestore'),grpc=fromFunctions('@grpc/grpc-js'),{OAuth2Client}=fromFunctions('google-auth-library');
const {loadEmployeeHomeGrpcSnapshot:load}=require('../functions/employeeHomeGrpcSnapshot');
const {createEmployeeHomeCpuDiagnostic}=require('../functions/employeeHomeCpuDiagnostic');
const output=process.env.HD_LOCAL_HOME_CPU_OUTPUT;if(!output?.startsWith('test-results/'))throw Error('Local CPU diagnostic output required.');
const spec=JSON.parse(await readFile('test-results/perf-target-20261102/guarded-fields-android-input-v2/artifact/manifest.json','utf8')).fieldProjection;
const counts={employees:27,customers:319,orders:5500,payments:3900,expenses:1200,financials:250,attendance:1400,performance:30,employeeReviews:20,deliveryReports:250,holidays:5,advances:20,assets:30,assetCostLogs:80};
// Keep server heap identical across client heap experiments. Only the client
// nursery is varied; synthetic response encoding is outside its CPU counter.
const child=fork('scripts/helpers/local-home-profile-server.cjs',[],{windowsHide:true,execArgv:['--max-old-space-size=364','--max-semi-space-size=16'],stdio:['ignore','ignore','ignore','ipc']});
let client,inspector,gcObserver;
const heapSpaces=()=>getHeapSpaceStatistics().map(s=>({name:s.space_name,sizeMiB:s.space_size/1048576,usedMiB:s.space_used_size/1048576,physicalMiB:s.physical_space_size/1048576}));
const embeddedDiagnostic=process.env.HD_LOCAL_HOME_EMBEDDED_CPU==='true',disableCpu=process.env.HD_LOCAL_HOME_DISABLE_CPU==='true',diagnosticRecords=[];
try{
 const ready=new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Synthetic server exited before ready')))});
 child.send({counts,fields:spec.fieldsByCollection.orders});const {port}=await ready;
 const authClient=new OAuth2Client();authClient.setCredentials({access_token:'synthetic-local-profile-only',expiry_date:Date.now()+3600000});
 client=new v1.FirestoreClient({projectId:'synthetic-project',apiEndpoint:'127.0.0.1',port,sslCreds:grpc.credentials.createInsecure(),authClient,fallback:false,gaxServerStreamingRetries:false});
 await client.initialize();
 const time={seconds:1793590000,nanoseconds:123456789},actor=id=>({id,exists:true,readTime:time,data:()=>({companyId:'synthetic-company'})});
 const db={doc:path=>({path}),runTransaction:async fn=>fn({getAll:async()=>[actor('synthetic-company'),actor('synthetic-employee')]})};
 const admission=process.env.HD_LOCAL_HOME_ADMISSION_FILE;
 if(admission){if(path.resolve(admission)!==path.resolve(output,'admission.json'))throw Error('Synthetic admission must stay in its result directory');await mkdir(output,{recursive:true});await writeFile(admission,JSON.stringify({clientPid:process.pid,serverPid:child.pid}));
  const until=Date.now()+15000;while(true){try{await readFile(admission+'.go');break}catch(e){if(e.code!=='ENOENT')throw e;if(Date.now()>until)throw Error('Synthetic CPU-affinity admission timed out');await new Promise(resolve=>setTimeout(resolve,25))}}
 }
 let gcStart=Infinity,gcEnd=Infinity;
 const gc={supported:PerformanceObserver.supportedEntryTypes.includes('gc'),events:0,totalDurationMs:0,maxDurationMs:0,byKind:{}};
 if(gc.supported){gcObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries()){if(entry.startTime<gcStart||entry.startTime>=gcEnd)continue;gc.events++;gc.totalDurationMs+=entry.duration;gc.maxDurationMs=Math.max(gc.maxDurationMs,entry.duration);const kind=entry.detail?.kind;if([1,4,8,16].includes(kind)){const row=gc.byKind[kind]??={events:0,totalDurationMs:0};row.events++;row.totalDurationMs+=entry.duration}}});gcObserver.observe({entryTypes:['gc']})}
 const spacesBefore=heapSpaces();
 const post=(method,params={})=>new Promise((resolve,reject)=>inspector.post(method,params,(error,result)=>error?reject(error):resolve(result)));
 if(!embeddedDiagnostic&&!disableCpu){inspector=new Session();inspector.connect();await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start')}
 const began=performance.now(),cpu=process.cpuUsage(),asyncTrace=process.env.HD_LOCAL_HOME_ASYNC_TRACE==='true';gcStart=began;let metrics=[],status='COMPLETE',code=null,snapshot;
 const operation=()=>load({db,scope:{appId:'synthetic-app',companyId:'synthetic-company',employeeId:'synthetic-employee'},projectId:'synthetic-project',queryClient:client,fieldProjection:spec,onReadMetrics:rows=>{metrics=rows}});
 const diagnostic=createEmployeeHomeCpuDiagnostic({record:r=>diagnosticRecords.push(r)});
 const execute=()=>embeddedDiagnostic&&!disableCpu?diagnostic({nonce:'qaCpu_synthetic_only'},operation):operation();
 try{snapshot=asyncTrace?await new AsyncLocalStorage().run([],execute):await execute()}catch(error){status='FAILED';code=/^[a-z_]{1,80}$/.test(error.code||'')?error.code:'unknown'}
 const wallMs=performance.now()-began,used=process.cpuUsage(cpu);gcEnd=began+wallMs;const {profile}=embeddedDiagnostic||disableCpu?{profile:{nodes:[],samples:[],timeDeltas:[]}}:await post('Profiler.stop');if(!embeddedDiagnostic&&!disableCpu)await post('Profiler.disable');
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));gcObserver?.disconnect();
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();let maxSampleIntervalMs=0,gapsOver50ms=0;
 for(let i=0;i<(profile.samples||[]).length;i++){const delta=profile.timeDeltas?.[i];if(!Number.isFinite(delta)||delta<0)continue;maxSampleIntervalMs=Math.max(maxSampleIntervalMs,delta/1000);if(delta>=50000)gapsOver50ms++;times.set(profile.samples[i],(times.get(profile.samples[i])||0)+delta/1000)}
 const frames=[...times].sort((a,b)=>b[1]-a[1]).slice(0,45).map(([id,selfSampleMs])=>{
  const frame=nodes.get(id)?.callFrame||{};let file='unknown';
  if(frame.url?.startsWith('file:')){const relative=path.relative(process.cwd(),fileURLToPath(frame.url)).replaceAll('\\','/');if(!relative.startsWith('../'))file=relative}
  else if(frame.url?.startsWith('node:'))file=frame.url;
  return {function:/^[A-Za-z0-9_$ .:[\]<>-]{0,120}$/.test(frame.functionName||'')?frame.functionName:'anonymous',file,line:frame.lineNumber,column:frame.columnNumber,selfSampleMs};
 });
 const result={at:new Date().toISOString(),runtime:process.version,asyncTrace,embeddedDiagnostic,cpuProfilerEnabled:!disableCpu,diagnosticRecords,heapSizeLimitMiB:getHeapStatistics().heap_size_limit/1048576,status,code,wallMs,processCpuMs:(used.user+used.system)/1000,
  processArgs:process.execArgv.filter(v=>/^--max-(?:old|semi)-space-size=\d+$/.test(v)),spacesBefore,spacesAfter:heapSpaces(),gc,
  returnedDocuments:snapshot?Object.values(snapshot.counts).reduce((n,v)=>n+v,0):null,metrics,frames,maxSampleIntervalMs,gapsOver50ms,
  scope:'SYNTHETIC LOCAL LOOPBACK DIAGNOSIS ONLY. Public locked SDK, child server on127.0.0.1, fake OAuth credential, no actual Firebase API/data/account. Same bounded reader3s deadline. Node runtime/Windows differ from Cloud Node22. Inspector overhead. Sample intervals include gaps/idle and are not exact function CPU, interaction latency or acceptance. Server encoding runs in another process and is excluded from this client CPU profile.'};
 await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status,code,wallMs,processCpuMs:result.processCpuMs,documents:result.returnedDocuments,top:frames.slice(0,12)}));
}finally{gcObserver?.disconnect();inspector?.disconnect();await client?.close();child.disconnect();child.kill()}
