import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {appFunction} from './helpers/app-source-function.mjs';
import {extractEmployeeHomeDomain} from '../scripts/helpers/employee-home-domain-extraction.mjs';
import {retainCollectionRecordIdentityAsync} from '../src/utils/cooperativeCollectionIdentity.js';
import {createCollectionCommitWitness} from '../src/services/collectionCommitWitness.js';

// Execute the current payroll dependency closure and real source imports in
// memory. No generated domain bundle, ignored artifact, build or Firebase read.
const source=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
const code=extractEmployeeHomeDomain(source,path.resolve('src'),['buildDashboardPayrollCostSteps'])
 .replace(/from ("[^"\n]+")/g,(_match,quoted)=>'from '+JSON.stringify(pathToFileURL(JSON.parse(quoted)).href));
const {buildDashboardPayrollCostSteps}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const minimum={employees:[{id:'fiction-worker',companyId:'fiction-company',position:'Giao hàng',role:'employee',baseSalary:6000000,startDate:'2026-01-01'}],
 company:{id:'fiction-company'},now:new Date('2026-11-04T05:00:00.000Z'),attendanceLoaded:true,complaintsLoaded:true};
const payroll=complaints=>{const iterator=buildDashboardPayrollCostSteps({...minimum,customerComplaints:complaints});let step;
 do{step=iterator.next()}while(!step.done);return{rows:step.value.length,today:step.value.filter(row=>row.date==='2026-11-04').reduce((sum,row)=>sum+row.amount,0)};};

function fixture({initial=null,name='customerComplaints',kind='server',keepPreviousOnEmpty=false}={}){
 let state=initial,current=true;const updates=[],confirmed=[],stable=new Map(),committed={[name]:initial};
 const createWitness=()=>createCollectionCommitWitness({isCurrent:()=>current,getCommittedStates:()=>committed,
  onCommitted:name=>confirmed.push(name),schedule:()=>1,cancel(){}});
 const server=createWitness(),worker=createWitness();
 const serverVersion=kind==='server'?server.begin(name):null,workerVersion=kind==='worker'?worker.begin(name):null;
 const reader=kind==='worker'?{isPublicationCurrent:worker.isPublicationCurrent,expectCommit:worker.expectCommit,publicationScheduled:worker.publicationScheduled}:null;
 const apply=appFunction('setCollectionSafely',{
  hasCollectionValue:appFunction('hasCollectionValue'),readWorker:reader,publicationWitness:server,isReadAccessCurrent:()=>current,
  readWorkerCommittedStateRef:{current:committed},retainCollectionRecordIdentityAsync,
  mergePendingArrayItems:(_name,value)=>typeof value==='function'?null:value,
  getPreviousStableCollectionValue:key=>stable.get(key),rememberStableCollectionValue:(key,value)=>stable.set(key,value),
  runNonBlockingStateUpdate:callback=>callback(),markCollectionLoaded(){},
 });
 return{publish:value=>apply(name,update=>updates.push(update),value,false,{keepPreviousOnEmpty,
  serverCommitVersion:serverVersion,workerCommitVersion:workerVersion}),read:()=>({state,confirmed,queued:updates.length}),
  commit(){for(const update of updates.splice(0))state=update(state);committed[name]=state;server.confirmCommitted(committed);worker.confirmCommitted(committed)},
  expire(){current=false},supersede(){server.begin(name);worker.begin(name)}};
}

test('complete authoritative empty complaints replace the missing sentinel only after publication commits',async()=>{
 for(const kind of['server','worker']){
  const f=fixture({kind});const empty=[];await f.publish(empty);
  assert.equal(f.read().state,null);assert.deepEqual(f.read().confirmed,[],'transport receipt is not a React commit');
  f.commit();assert.strictEqual(f.read().state,empty,'a confirmed empty source must become known empty, not remain missing');
  assert.deepEqual(f.read().confirmed,['customerComplaints']);
 }
});

test('actual payroll retains missing-data semantics for null and includes the existing reward for a confirmed empty publication',async()=>{
 assert.equal(Object.hasOwn(minimum.employees[0],'basicSalary'),false);
 assert.deepEqual(payroll(null),{rows:0,today:0},'unread complaints must not be silently treated as no complaints');
 const f=fixture();await f.publish([]);f.commit();
 assert.deepEqual(payroll(f.read().state),{rows:12,today:800000},'baseSalary is not basicSalary; these rows are the unchanged evaluation reward');
});

test('cache, pending-write, incomplete/error fallback and explicit retain paths do not promote null to known empty',async()=>{
 for(const kind of['cache','pending-write','incomplete','error']){
  const f=fixture({kind,keepPreviousOnEmpty:kind!=='pending-write'});await f.publish([]);f.commit();
  assert.equal(f.read().state,null,kind);assert.deepEqual(f.read().confirmed,[]);
 }
 const retained=fixture({keepPreviousOnEmpty:true});await retained.publish([]);retained.commit();assert.equal(retained.read().state,null);
});

test('failed/partial refresh keeps existing complaint records; completed authority may clear them',async()=>{
 const old=[{id:'fiction-complaint',companyId:'fiction-company'}];
 for(const kind of['cache','incomplete','error']){
  const f=fixture({initial:old,kind,keepPreviousOnEmpty:true});await f.publish([]);f.commit();
  assert.strictEqual(f.read().state,old);assert.deepEqual(f.read().confirmed,[]);
 }
 const f=fixture({initial:old});await f.publish([]);f.commit();assert.deepEqual(f.read().state,[]);assert.deepEqual(f.read().confirmed,['customerComplaints']);
});

test('the narrow sentinel fix preserves other empty collection identities and rejects superseded/old-owner queued work',async()=>{
 for(const name of['orders','payments','employees']){
  const old=[];const f=fixture({name,initial:old});await f.publish([]);f.commit();assert.strictEqual(f.read().state,old);
  const missing=fixture({name});await missing.publish([]);missing.commit();assert.equal(missing.read().state,null);
 }
 for(const expire of[f=>f.expire(),f=>f.supersede()]){
  const f=fixture();await f.publish([]);expire(f);f.commit();assert.equal(f.read().state,null);assert.deepEqual(f.read().confirmed,[]);
 }
});
