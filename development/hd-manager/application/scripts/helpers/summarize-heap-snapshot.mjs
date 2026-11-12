import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// Synthetic snapshots only. Do not print arbitrary string/object contents:
// generated scripts and fixture fields can otherwise flood a diagnostic log.
export async function summarizeHeapSnapshot(file){
 const bytes=await fs.readFile(file),snapshot=JSON.parse(bytes.toString('utf8'));
 const meta=snapshot.snapshot.meta,n=snapshot.nodes,w=meta.node_fields.length,types=meta.node_types[0],strings=snapshot.strings;
 const fields=Object.fromEntries(meta.node_fields.map((key,index)=>[key,index])),byType=new Map(),groups=new Map();
 for(let i=0;i<n.length;i+=w){
  const type=types[n[i+fields.type]],raw=strings[n[i+fields.name]],name=raw.length>100?`[long name: ${raw.length} chars; sha256:${crypto.createHash('sha256').update(raw).digest('hex').slice(0,12)}]`:raw;
  for(const[map,key]of[[byType,type],[groups,`${type}:${name}`]]){const row=map.get(key)||{key,count:0,selfBytes:0};row.count++;row.selfBytes+=n[i+fields.self_size];map.set(key,row)}
 }
 return{file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),nodeCount:n.length/w,edgeCount:snapshot.edges.length/meta.edge_fields.length,
  byType:[...byType.values()].sort((a,b)=>b.selfBytes-a.selfBytes),largestGroups:[...groups.values()].sort((a,b)=>b.selfBytes-a.selfBytes).slice(0,35),
  qualification:'Self-size classification, not dominator retained size. Code/inspector data and application objects are distinct; no leak verdict from totals alone.'};
}
