import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planInboxIndexes} from '../scripts/helpers/inbox-index-plan.mjs';
import {appFunction} from './helpers/app-source-function.mjs';
const config=JSON.parse(fs.readFileSync('firestore.indexes.json','utf8'));
test('repair is limited to five existing tracked schemas and treats CREATING as incomplete, not a duplicate',()=>{
 const plan=planInboxIndexes(config,[]);assert.equal(plan.create.length,5);assert.equal(plan.ready,false);
 const indexes=plan.create.map((spec,i)=>({...spec,name:`projects/fixture/databases/(default)/collectionGroups/${spec.collectionGroup}/indexes/${i}`,state:'READY',fields:[...spec.fields,{fieldPath:'__name__',order:'DESCENDING'}]}));
 assert.equal(planInboxIndexes(config,indexes).ready,true);assert.equal(planInboxIndexes(config,indexes).create.length,0);
 indexes[0].state='CREATING';assert.equal(planInboxIndexes(config,indexes).ready,false);assert.equal(planInboxIndexes(config,indexes).create.length,0);
 const changed=structuredClone(config);changed.indexes.find(x=>x.collectionGroup==='notifications').fields[0].fieldPath='unsupported';
 assert.throws(()=>planInboxIndexes(changed,[]),/exact tracked inbox/);
 assert.equal(planInboxIndexes(config,[{collectionGroup:'unrelated',queryScope:'COLLECTION',fields:[],state:'READY'}]).create.length,5);
});
test('tracked schemas cover actual App customer, assigned staff, internal and manager inbox queries without dropping filters',()=>{
 const specs=planInboxIndexes(config,[]).create;
 const factory=customer=>appFunction('getTenantCollectionSources',{
  db:{},appId:'fixture',tenantCompanyId:'company-a',customerSession:customer,sessionCustomerId:'customer-a',
  currentUser:{id:'employee-a',role:'employee'},customerOwnedCollections:new Set(['messages','notifications']),
  collection:(_db,...p)=>({collectionGroup:p.at(-1)}),doc:()=>{throw Error('Not an inbox query')},
  firebaseQuery:(ref,...filters)=>({...ref,filters}),firebaseWhere:(field,op)=>({kind:'where',field,op}),
  firebaseOrderBy:(field,order)=>({kind:'order',field,order}),firebaseLimit:count=>({kind:'limit',count}),isOwnerRoleValue:()=>!customer,
 });
 const queries=[...factory(true)('messages'),...factory(true)('notifications'),...factory(false)('messages')];
 // Also evaluate the ordinary assigned/internal branch with the real factory.
 const ordinary=appFunction('getTenantCollectionSources',{
  db:{},appId:'fixture',tenantCompanyId:'company-a',customerSession:false,sessionCustomerId:'',currentUser:{id:'employee-a',role:'employee'},
  collection:(_db,...p)=>({collectionGroup:p.at(-1)}),firebaseQuery:(ref,...filters)=>({...ref,filters}),
  firebaseWhere:(field,op)=>({kind:'where',field,op}),firebaseOrderBy:(field,order)=>({kind:'order',field,order}),firebaseLimit:count=>({kind:'limit',count}),isOwnerRoleValue:()=>false,
 });queries.push(...ordinary('messages'));assert.equal(queries.length,5);
 for(const q of queries){const equality=q.filters.filter(f=>f.kind==='where').map(f=>f.field).sort();
  const order=q.filters.find(f=>f.kind==='order');assert.equal(order.field,'createdAt');assert.equal(order.order,'desc');
  assert(specs.some(s=>s.collectionGroup===q.collectionGroup&&JSON.stringify(s.fields.slice(0,-1).map(f=>f.fieldPath).sort())===JSON.stringify(equality)));
 }
});
