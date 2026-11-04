import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {planInboxIndexes} from './helpers/inbox-index-plan.mjs';
const mode=process.argv[2]||'plan';if(!['plan','apply','verify'].includes(mode))throw Error('Use plan, apply, or verify.');
const project='hd-manager-c5839',database='(default)',output='test-results/perf-target-20261102';
const require=createRequire(import.meta.url),cli=require('firebase-tools');
await cli.functions.list({project,nonInteractive:true,json:true});
const api=new(require('../node_modules/firebase-tools/lib/firestore/api.js').FirestoreApi)();
const config=JSON.parse(await fs.readFile('firestore.indexes.json','utf8'));
const deployed=await api.listIndexes(project,database),plan=planInboxIndexes(config,deployed);
const result={at:new Date().toISOString(),mode,project,database,...plan,
 scope:'Exactly five already-tracked inbox query indexes. Plan/verify are read-only. Apply only creates missing indexes; it never calls delete, updates security rules, reads/writes business documents, changes billing or deploys unrelated indexes.'};
await fs.writeFile(output+`/inbox-index-${mode}.json`,JSON.stringify(result,null,2));
if(mode==='apply'){
 result.operations=[];
 for(const index of plan.create){
  const response=await api.createIndex(project,index,database);
  result.operations.push({collectionGroup:index.collectionGroup,fields:index.fields,operation:response.body.name});
  await fs.writeFile(output+'/inbox-index-apply.json',JSON.stringify(result,null,2));
 }
}
console.log(JSON.stringify({mode,missing:plan.create.length,ready:plan.ready,states:plan.states,operations:result.operations?.length}));
if(mode==='verify'&&!plan.ready)process.exitCode=2;
