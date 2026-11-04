import fs from 'node:fs/promises';
const root='test-results/performance-upgrade-20261103';
const status=JSON.parse(await fs.readFile(`${root}/post-soak-heap-retry-status.json`,'utf8'));
if(!status.snapshot.complete)throw Error('Complete diagnostic snapshot required');
const d=JSON.parse(await fs.readFile(status.snapshot.file,'utf8')),m=d.snapshot.meta,n=d.nodes,e=d.edges,s=d.strings,w=m.node_fields.length,ew=m.edge_fields.length;
const nf=Object.fromEntries(m.node_fields.map((x,i)=>[x,i])),ef=Object.fromEntries(m.edge_fields.map((x,i)=>[x,i])),N=n.length/w;
const type=i=>m.node_types[nf.type][n[i*w+nf.type]],name=i=>s[n[i*w+nf.name]],label=i=>type(i).includes('string')?'string:<redacted>':`${type(i)}:${name(i)}`;
const offsets=new Uint32Array(N+1);for(let i=0;i<N;i++)offsets[i+1]=offsets[i]+n[i*w+nf.edge_count]*ew;
const kind=j=>m.edge_types[ef.type][e[j+ef.type]],edgeName=j=>['element','hidden'].includes(kind(j))?e[j+ef.name_or_index]:s[e[j+ef.name_or_index]];
const targets=new Set([109265,2657172,2756071,2657503,2689015,2689016,34989]);
const incoming=new Map([...targets].map(i=>[i,[]]));
const nativeCounts=new Map();
for(let i=0;i<N;i++){
 if(type(i)==='native')nativeCounts.set(name(i),(nativeCounts.get(name(i))||0)+1);
 for(let j=offsets[i];j<offsets[i+1];j+=ew){const to=e[j+ef.to_node]/w;if(targets.has(to)&&incoming.get(to).length<30)incoming.get(to).push({from:i,label:label(i),kind:kind(j),edge:edgeName(j)});}
}
const report={at:new Date().toISOString(),qualification:'Offline embedder graph edges are not symbolic C++ ownership names; no source attribution inferred.',nativeCounts:[...nativeCounts].sort((a,b)=>b[1]-a[1]).slice(0,25),targets:[...targets].map(i=>({i,label:label(i),incoming:incoming.get(i),outgoing:Array.from({length:Math.min(15,(offsets[i+1]-offsets[i])/ew)},(_,k)=>{const j=offsets[i]+k*ew;return{to:e[j+ef.to_node]/w,label:label(e[j+ef.to_node]/w),kind:kind(j),edge:edgeName(j)}})}))};
await fs.writeFile(`${root}/native-dom-retainers.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
