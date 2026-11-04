import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeRichSyntheticFixture} from '../performance/upgrade-20261103/rich-synthetic-fixture.mjs';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const project='demo-hdm-perf-verification',app='verification-fixture',root='test-results/performance-upgrade-20261103';
const base=`http://127.0.0.1:8185/v1/projects/${project}/databases/(default)/documents`;
const out=root+'/home-model-business-source-unchanged.json';
try{await fs.access(out);throw Error('Preserve prior integrity evidence')}catch(error){if(error.code!=='ENOENT')throw error}
const ready=await assertVerificationFixtureReady(),fixture=makeRichSyntheticFixture(),data=fixture.data,companyId=fixture.claims.companyId;
data.employees=Object.fromEntries(Object.entries(data.employees).filter(([id])=>id.startsWith('fiction-worker-')));
const identities=[{id:'fixture-manager',uid:'verification-manager',name:'Synthetic Manager',accountType:'employee',role:'super_admin',phone:'0900000001'},
 {id:'fixture-sales',uid:'verification-sales',name:'Synthetic Sales',accountType:'employee',role:'employee',position:'Kinh doanh',phone:'0900000002'},
 {id:'fixture-customer',uid:'verification-customer',customerId:'fixture-customer',name:'Synthetic Customer',accountType:'customer',role:'customer',phone:'0900000003'}];
for(const identity of identities){if(identity.accountType==='employee')data.employees[identity.id]={...identity,companyId};else Object.assign(data.customers[identity.customerId],{name:identity.name,phone:identity.phone})}
for(const row of Object.values(data.customers))row.empId='fixture-sales';for(const row of Object.values(data.orders))row.empId='fixture-sales';
Object.assign(data.companies[companyId],{ownerId:'fixture-manager',status:'active'});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function decode(field){if('stringValue'in field)return field.stringValue;if('integerValue'in field)return Number(field.integerValue);if('doubleValue'in field)return field.doubleValue;if('booleanValue'in field)return field.booleanValue;if('nullValue'in field)return null;if('timestampValue'in field)return field.timestampValue;if('arrayValue'in field)return(field.arrayValue.values||[]).map(decode);if('mapValue'in field)return Object.fromEntries(Object.entries(field.mapValue.fields||{}).map(([key,v])=>[key,decode(v)]));throw Error('Unsupported source field')}
async function post(action,body){const r=await fetch(base+action,{method:'POST',redirect:'error',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Read-only fictional integrity request: '+r.status);return r.json()}
const transaction=(await post(':beginTransaction',{options:{readOnly:{}}})).transaction,rows=[];
try{for(const name of Object.keys(data).filter(name=>!name.startsWith('__'))){
 const response=await post(`/artifacts/${app}/public/data:runQuery`,{transaction,structuredQuery:{from:[{collectionId:name}]}});
 const actual=Object.fromEntries(response.filter(row=>row.document).map(({document})=>[document.name.split('/').at(-1),Object.fromEntries(Object.entries(document.fields||{}).map(([key,v])=>[key,decode(v)]))]));
 rows.push({collection:name,expectedCount:Object.keys(data[name]).length,actualCount:Object.keys(actual).length,expectedSha256:digest(data[name]),actualSha256:digest(actual),equal:digest(data[name])===digest(actual)});
}}finally{await post(':rollback',{transaction})}
const report={at:new Date().toISOString(),status:rows.every(row=>row.equal)?'ORIGINAL_FICTIONAL_BUSINESS_DOCUMENTS_UNCHANGED':'MISMATCH_NOT_PASS',fixture:ready,readOnly:true,productionRequests:0,collections:rows,
 qualification:'Exact canonical comparison of original seeded fictional collection documents after native login/navigation/cache tests. Auth Emulator records and isolated read-model metadata are separate. This does not certify production business data or unseeded operational collections.'};
await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,documents:rows.reduce((n,row)=>n+row.actualCount,0),mismatch:rows.filter(row=>!row.equal).map(row=>row.collection)}));if(rows.some(row=>!row.equal))throw Error('Fictional business source changed');
