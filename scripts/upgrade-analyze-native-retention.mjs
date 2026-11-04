import fs from'node:fs/promises';
import crypto from'node:crypto';
import{TraceMap,originalPositionFor}from'@jridgewell/trace-mapping';
const root='test-results/performance-upgrade-20261103',suffix=process.argv.includes('--retry')?'-retry':'',editor=process.argv.includes('--editor-cleanup'),listener=process.argv.includes('--listener-scope');
const state=JSON.parse(await fs.readFile(listener?root+'/post-listener-scope-heap-status.json':editor?root+'/post-editor-cleanup-heap-status.json':`${root}/post-soak-heap${suffix}-status.json`,'utf8'));
const sourceCohort=state.sourceCohort||'after-memo-search';if(!/^after-[a-z0-9-]+$/.test(sourceCohort))throw Error('Invalid owned source cohort');

if(state.status!=='POST_SPAN_RETENTION_CAPTURED_NOT_LEAK_ACCEPTANCE'||!state.snapshot?.complete)throw Error('Require a complete, explicitly after-span diagnostic');
if(state.snapshot.bytes>384*1024*1024)throw Error('Snapshot exceeds controlled offline analyzer memory budget; preserve artifact for separate analysis');
const bytes=await fs.readFile(state.snapshot.file);if(crypto.createHash('sha256').update(bytes).digest('hex')!==state.snapshot.sha256)throw Error('Snapshot digest mismatch');
const d=JSON.parse(bytes.toString('utf8')),m=d.snapshot.meta,n=d.nodes,e=d.edges,s=d.strings,w=m.node_fields.length,ew=m.edge_fields.length,N=n.length/w;
const nf=Object.fromEntries(m.node_fields.map((name,i)=>[name,i])),ef=Object.fromEntries(m.edge_fields.map((name,i)=>[name,i]));
for(const key of['type','name','id','self_size','edge_count'])if(nf[key]===undefined)throw Error('Unsupported heap node schema');
for(const key of['type','name_or_index','to_node'])if(ef[key]===undefined)throw Error('Unsupported heap edge schema');
const offsets=new Uint32Array(N+1);for(let i=0;i<N;i++)offsets[i+1]=offsets[i]+n[i*w+nf.edge_count]*ew;
const parent=new Int32Array(N).fill(-1),via=new Int32Array(N).fill(-1),queue=new Uint32Array(N);let head=0,tail=1;queue[0]=0;parent[0]=0;
const weak=m.edge_types[ef.type].indexOf('weak');
while(head<tail){const from=queue[head++];for(let j=offsets[from];j<offsets[from+1];j+=ew){if(e[j+ef.type]===weak)continue;const to=e[j+ef.to_node]/w;if(parent[to]!==-1)continue;parent[to]=from;via[to]=j;queue[tail++]=to}}
const maps=new Map(),scripts=new Map((state.scriptMetadata||[]).map(row=>[String(row.scriptId),row.url])),locations=new Map();
const lf=Object.fromEntries(m.location_fields.map((name,i)=>[name,i])),lw=m.location_fields.length;
for(let i=0;i<(d.locations||[]).length;i+=lw){const row=d.locations,scriptId=row[i+lf.script_id],scriptNode=lf.script_object_index===undefined?undefined:row[i+lf.script_object_index];
 locations.set(row[i+lf.object_index]/w,{scriptId,url:scripts.get(String(scriptId))||(scriptNode===undefined?null:s[n[scriptNode+nf.name]]),line:row[i+lf.line],column:row[i+lf.column]})}
const type=i=>m.node_types[nf.type][n[i*w+nf.type]],name=i=>s[n[i*w+nf.name]];
const label=i=>type(i).includes('string')?`${type(i)}:<${String(name(i)).length} chars redacted>`:`${type(i)}:${String(name(i)).slice(0,100)}`;
async function location(i){const value=locations.get(i);if(!value?.url?.endsWith('.js'))return value;const asset=value.url.split('/').at(-1);if(!maps.has(asset)){try{maps.set(asset,new TraceMap(JSON.parse(await fs.readFile(`${root}/${sourceCohort}/source-maps/assets/${asset}.map`,'utf8'))))}catch(error){if(error.code!=='ENOENT')throw error;maps.set(asset,null)}}return{...value,original:maps.get(asset)?originalPositionFor(maps.get(asset),{line:value.line+1,column:value.column}):null}}
async function pathTo(i){const path=[];for(let depth=0;i&&depth<40;depth++){const j=via[i],row={index:i,id:n[i*w+nf.id],node:label(i),location:await location(i)};if(j<0){path.push({...row,notReachedByStrongBfs:true});break}const kind=m.edge_types[ef.type][e[j+ef.type]],edge=e[j+ef.name_or_index];path.push({...row,via:{kind,name:['element','hidden'].includes(kind)?edge:String(s[edge]).slice(0,100)}});i=parent[i]}return path.reverse()}
const classes=new Map(),closures=new Map(),arrays=[];
for(let i=0;i<N;i++){const kind=type(i),size=n[i*w+nf.self_size],key=kind==='object'?kind+':'+name(i):kind,r=classes.get(key)||{key,count:0,selfBytes:0};r.count++;r.selfBytes+=size;classes.set(key,r);
 if(kind==='closure'){const loc=locations.get(i),key=JSON.stringify([name(i),loc?.scriptId,loc?.line,loc?.column]),g=closures.get(key)||{name:String(name(i)),generatedLocation:loc,count:0,selfBytes:0,sample:i};g.count++;g.selfBytes+=size;closures.set(key,g)}
 if(kind==='array'&&size>=8000)arrays.push({node:i,selfBytes:size})}
const report={at:new Date().toISOString(),status:'STRONG_PATH_DIAGNOSTIC_NOT_LEAK_ACCEPTANCE',apk:state.apkSha256,spanEndedAt:state.spanEndedAt,snapshot:state.snapshot,before:state.before,afterGc:state.afterGc,nodes:N,strongReachableNodes:tail,
 classes:[...classes.values()].sort((a,b)=>b.selfBytes-a.selfBytes).slice(0,35),
 closureGroups:await Promise.all([...closures.values()].sort((a,b)=>b.count-a.count).slice(0,18).map(async g=>({...g,path:await pathTo(g.sample)}))),
 largeArrays:await Promise.all(arrays.sort((a,b)=>b.selfBytes-a.selfBytes).slice(0,18).map(async g=>({...g,path:await pathTo(g.node)}))),
 qualifications:['Single end-of-span heap capture with explicit GC. This does not prove growth or absence of a leak by itself.','Paths are shortest strong-edge BFS, not dominator retained sizes; weak/ephemeron semantics need manual source review.','Object self sizes must not be summed as independent retained memory. String contents are redacted.','Debugger URL/ID metadata was captured and disabled before GC; this is separate from natural RAM observation.']};
await fs.writeFile(listener?root+'/native-post-listener-scope-retention-analysis.json':editor?root+'/native-post-editor-cleanup-retention-analysis.json':`${root}/native-post-soak-retention${suffix}-analysis.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,nodes:N,classes:report.classes.slice(0,8),closureGroups:report.closureGroups.slice(0,5)}));
