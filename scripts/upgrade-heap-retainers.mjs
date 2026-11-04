import fs from 'node:fs/promises';
const root='test-results/performance-upgrade-20261103',cohort='after-share-memory';
const before=JSON.parse(await fs.readFile(`${root}/dom-retention-${cohort}-1.heapsnapshot`,'utf8'));
const previousIds=new Set();const bw=before.snapshot.meta.node_fields.length;for(let i=0;i<before.nodes.length;i+=bw)previousIds.add(before.nodes[i+2]);
const d=JSON.parse(await fs.readFile(`${root}/dom-retention-${cohort}-10.heapsnapshot`,'utf8')),m=d.snapshot.meta,n=d.nodes,e=d.edges,s=d.strings,w=m.node_fields.length,ew=m.edge_fields.length,N=n.length/w;
const offsets=new Uint32Array(N+1);for(let i=0;i<N;i++)offsets[i+1]=offsets[i]+n[i*w+4]*ew;
const parent=new Int32Array(N).fill(-1),edgeTo=new Int32Array(N).fill(-1),queue=new Uint32Array(N);let head=0,tail=1;queue[0]=0;parent[0]=0;
const weak=m.edge_types[0].indexOf('weak');
while(head<tail){const from=queue[head++];for(let j=offsets[from];j<offsets[from+1];j+=ew){if(e[j]===weak)continue;const to=e[j+2]/w;if(parent[to]!==-1)continue;parent[to]=from;edgeTo[to]=j;queue[tail++]=to}}
const safe=value=>String(value).slice(0,100),label=i=>`${m.node_types[0][n[i*w]]}:${safe(s[n[i*w+1]])}`;
const locationByIndex=new Map(),locationWidth=m.location_fields.length;
const locationFields=Object.fromEntries(m.location_fields.map((field,index)=>[field,index]));
for(let i=0;i<d.locations.length;i+=locationWidth){const scriptNode=d.locations[i+locationFields.script_object_index];locationByIndex.set(d.locations[i]/w,{scriptId:d.locations[i+locationFields.script_id],line:d.locations[i+locationFields.line],column:d.locations[i+locationFields.column],scriptNodeIndex:scriptNode,scriptName:scriptNode===undefined?null:s[n[scriptNode+1]]})}
const pathTo=i=>{const path=[];for(let steps=0;i&&steps<45;steps++){const j=edgeTo[i],node={index:i,id:n[i*w+2],node:label(i),location:locationByIndex.get(i)};if(j<0){path.push({...node,unreachableByStrongEdges:true});break}const kind=m.edge_types[0][e[j]],name=['element','hidden'].includes(kind)?e[j+1]:safe(s[e[j+1]]);path.push({...node,via:{kind,name}});i=parent[i]}return path.reverse()};
const groups=new Map(),largeArrays=[];
for(let i=0;i<N;i++){if(previousIds.has(n[i*w+2]))continue;const type=m.node_types[0][n[i*w]],name=s[n[i*w+1]];
 if(type==='closure'){const g=groups.get(name)||{name:safe(name),count:0,bytes:0,sampleNode:i};g.count++;g.bytes+=n[i*w+3];groups.set(name,g)}
 if(type==='array'&&n[i*w+3]>=4000)largeArrays.push({node:i,bytes:n[i*w+3]});
}
const report={at:new Date().toISOString(),cohort,conditions:'Cycle 1 to 10 synthetic desktop heap snapshots. Shortest strong-edge root paths, not dominator retained sizes; no weak/ephemeron reachability inference.',reachableStrongNodes:tail,newClosures:[...groups.values()].sort((a,b)=>b.count-a.count).slice(0,18).map(g=>({...g,path:pathTo(g.sampleNode)})),newLargeArrays:largeArrays.sort((a,b)=>b.bytes-a.bytes).slice(0,12).map(g=>({...g,path:pathTo(g.node)}))};
await fs.writeFile(`${root}/heap-retainer-paths.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
