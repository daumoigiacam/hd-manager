import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import vm from 'node:vm';import{randomUUID}from'node:crypto';
import {loginLocalQa} from '../tools/local-development/auth-client.mjs';

test('canonical document audit is accepted by actual Local Rules; missing type and cross-tenant are denied',async()=>{
 const {configuration:c,account,idToken}=await loginLocalQa('A');
 assert.match(c.projectId,/^demo-hdmanager-/);assert.equal(c.firestore.host,'127.0.0.1');
 const text=await fs.readFile(new URL('../development/hd-manager/application/src/App.jsx',import.meta.url),'utf8');
 const start=text.indexOf('const buildActivityAuditLogPayload = '),end=text.indexOf('\nconst writeActivityAuditLog',start);
 assert(start>0&&end>start);
 const build=vm.runInNewContext(text.slice(start,end)+';buildActivityAuditLogPayload',{
  db:{},getCollectionNameFromDocRef:()=> 'products',getAuditCompanyId:()=>account.tenantId,
  ACTIVITY_LOG_IGNORED_COLLECTIONS:new Set(['activityLogs']),activityAuditContext:{userId:account.employeeId},
  getAuditActionForWrite:()=> 'create',getDocumentPathFromDocRef:()=> 'products/qa-local-only',getAuditRecordLabel:()=> 'QA audit contract',
 });
 const payload=JSON.parse(JSON.stringify(build({documentRef:{id:'qa-local-only'},action:'create',payload:{name:'QA audit contract'}})));
 assert.equal(payload.type,'document_write');assert.equal(payload.action,'create');assert.equal(payload.actorId,account.employeeId);
 const value=x=>x===null?{nullValue:null}:typeof x==='string'?{stringValue:x}:typeof x==='number'?{integerValue:String(x)}:Array.isArray(x)?{arrayValue:{values:x.map(value)}}:{mapValue:{fields:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]))}};
 const base=`http://${c.firestore.host}:${c.firestore.port}/v1/projects/${c.projectId}/databases/(default)/documents/artifacts/${c.appId}/public/data/activityLogs`;
 const create=async data=>{const id='qa_audit_'+randomUUID();return fetch(base+'?documentId='+id,{method:'POST',headers:{authorization:'Bearer '+idToken,'content-type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)]))})});};
 const missing={...payload};delete missing.type;assert.equal((await create(missing)).status,403,'reproduces the original Rules failure');
 const accepted=await create(payload);assert.equal(accepted.status,200,(await accepted.clone().text()).slice(0,200));
 const document=await accepted.json();assert.equal(document.fields.type.stringValue,'document_write');
 const reread=await fetch('http://'+c.firestore.host+':'+c.firestore.port+'/v1/'+document.name,{headers:{authorization:'Bearer '+idToken}});
 assert.equal(reread.status,200);assert.equal((await reread.json()).fields.companyId.stringValue,account.tenantId);
 assert.equal((await create({...payload,companyId:'qa-another-tenant'})).status,403);
});
