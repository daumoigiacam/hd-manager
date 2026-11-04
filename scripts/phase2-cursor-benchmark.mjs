import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {performance} from 'node:perf_hooks';
const root='test-results/phase2-performance-20261102';
const fixture=Array.from({length:200},(_,i)=>({id:`path-${i}`,data:()=>({id:i<10?'same-imported-id':`path-${i}`,companyId:'fiction',amount:1000})}));
globalThis.__phase2CursorDocs=fixture;
const mock=`export const collection=(...a)=>a,documentId=()=> '__name__',limit=n=>n,orderBy=(...a)=>a,query=(...a)=>a,startAfter=a=>a,where=(...a)=>a;
export const getDocs=async()=>({docs:globalThis.__phase2CursorDocs,size:globalThis.__phase2CursorDocs.length});`;
const versions={};
for(const [name,file] of Object.entries({before:`${root}/rollback/firestoreCursorPagination.js`,after:'src/services/firestoreCursorPagination.js'})){
 const b=await build({entryPoints:[file],bundle:true,write:false,minify:true,format:'esm',platform:'node',plugins:[{name:'synthetic-firestore',setup(b){b.onResolve({filter:/^firebase\/firestore$/},()=>({path:'fixture',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:mock,loader:'js'}))}}]});
 const text=b.outputFiles[0].text;
 versions[name]={api:await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64')),isolatedHelperBytes:Buffer.byteLength(text)};
}
const samples=[];
for(let round=0;round<12;round++)for(const name of round%2?['after','before']:['before','after']){
 const {api}=versions[name];
 const cpu=process.cpuUsage(),memoryBefore=process.memoryUsage(),start=performance.now();let result;
 for(let i=0;i<300;i++)result=await api.readTenantCursorPage({db:{},appId:'fixture',collectionName:'products',companyId:'fiction',pageSize:200});
 const wallMs=performance.now()-start,cpuUsed=process.cpuUsage(cpu),memoryAfter=process.memoryUsage();
 samples.push({round,name,wallMs,cpuMs:(cpuUsed.user+cpuUsed.system)/1000,memoryBefore,memoryAfter,rows:result.items.length,
  uniquePathIdentities:new Set(result.items.map(r=>r.id)).size,iterations:300,qualification:'mock transport, one Node process, no forced GC; heap deltas are not retained leak bytes'});
}
const result={at:new Date().toISOString(),kind:'LOCAL_SYNTHETIC_HELPER_CORRECTNESS_AND_COST',productionRequests:0,
 runtime:process.version,fixtureRows:200,samples,helperBytes:Object.fromEntries(Object.entries(versions).map(([k,v])=>[k,v.isolatedHelperBytes])),
 nativeCpuDelta:null,androidRamDelta:null,startupBundleDelta:null,
 qualification:'Alternating order, identical fixture. SDK substituted by mock; not full startup bundle, app performance acceptance, Firestore latency or Android evidence. No claimed speed improvement.'};
await fs.writeFile(`${root}/cursor-local-before-after.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({beforeUnique:samples.find(s=>s.name==='before').uniquePathIdentities,afterUnique:samples.find(s=>s.name==='after').uniquePathIdentities,helperBytes:result.helperBytes}));
