import test from 'node:test';import assert from 'node:assert/strict';
import {getReadOnlyModuleProjectionEntry,getLocalProjectionClockScope,readCompletedModuleProjection} from '../src/services/moduleProjectionCaches.js';
import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
const context={companyId:'synthetic-company',employeeId:'synthetic-employee',permissionKey:'own',periodKey:'2026-11',clockKey:'2026-11-02:Asia/Saigon'};

test('completed projections reuse exact source identities only, and every actor/permission/period/clock dimension invalidates',()=>{
 for(const [kind,count] of Object.entries({requestVisible:5,requestStatuses:6,orderViews:11,orderDirectory:3,orderLedgerIndex:1,orderPaymentIndex:1,orderSorted:3,payroll:15})){
  const sources=Array.from({length:count},()=>[]),entry=getReadOnlyModuleProjectionEntry(kind,sources,context);
  entry.value=Object.freeze({amount:123});entry.complete=true;
  assert.equal(getReadOnlyModuleProjectionEntry(kind,sources,context),entry);
  for(let index=0;index<sources.length;index++){
   const next=sources.slice();next[index]=[];assert.equal(getReadOnlyModuleProjectionEntry(kind,next,context).complete,false);
  }
  for(const field of ['companyId','employeeId','permissionKey','periodKey','clockKey']){
   const next=getReadOnlyModuleProjectionEntry(kind,sources,{...context,[field]:'different-'+field});
   assert.notEqual(next,entry);assert.equal(next.complete,false);
  }
  assert.equal(getReadOnlyModuleProjectionEntry(kind,sources,{...context,employeeId:''}),undefined);
  assert.throws(()=>getReadOnlyModuleProjectionEntry(kind,sources.slice(1),context),TypeError);
 }
 assert.throws(()=>getReadOnlyModuleProjectionEntry('unknown',[],context),TypeError);
 const sources=Array.from({length:5},()=>[]),first=getReadOnlyModuleProjectionEntry('requestVisible',sources,context);
 first.complete=true;
 for(let i=0;i<4;i++)getReadOnlyModuleProjectionEntry('requestVisible',sources,{...context,periodKey:'period-'+i});
 assert.equal(getReadOnlyModuleProjectionEntry('requestVisible',sources,context).complete,false,'old scopes are evicted after four entries for one source set');
 assert(JSON.parse(getLocalProjectionClockScope('synthetic-day')).includes('synthetic-day'));
});

test('synchronous immutable indexes reuse completed work and never retain a failed or asynchronous calculation',()=>{
 const source={},entry=getReadOnlyModuleProjectionEntry('orderLedgerIndex',[source],context);let calls=0;
 const first=readCompletedModuleProjection(entry,()=>{calls++;return new Map([['synthetic',{amount:123}]])});
 assert.equal(readCompletedModuleProjection(entry,()=>{throw Error('must not rebuild')}),first);assert.equal(calls,1);
 const changed=getReadOnlyModuleProjectionEntry('orderLedgerIndex',[{}],context);
 assert.throws(()=>readCompletedModuleProjection(changed,()=>{throw Error('failed')}),/failed/);assert.equal(changed.complete,false);
 assert.throws(()=>readCompletedModuleProjection(changed,()=>Promise.resolve(123)),TypeError);assert.equal(changed.complete,false);
 assert.equal(readCompletedModuleProjection(changed,()=>456),456);
});

test('real cooperative hook reopens completed views without another job, hides old actor data and never caches an aborted calculation',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';
 import {useCooperativeProjection} from './src/hooks/useCooperativeProjection.js';
 import {getReadOnlyModuleProjectionEntry} from './src/services/moduleProjectionCaches.js';
 window.jobs=0;window.hold=false;
 function View({sources,context}){
  const entry=getReadOnlyModuleProjectionEntry('requestVisible',sources,context);window.lastEntry=entry;
  const factory=useMemo(()=>function*(){window.jobs++;while(window.hold)yield;return {amount:sources[0].amount,label:context.employeeId+':'+context.permissionKey}},[sources,context]);
  const result=useCooperativeProjection(factory,entry);
  return result.pending?<p role="status">Pending synthetic projection</p>:<p data-result>{result.value.label+'='+result.value.amount}</p>;
 }
 function Fixture(){const[open,setOpen]=useState(true),[sources,setSources]=useState(()=>[{amount:123},[],[],[],[]]),
  [context,setContext]=useState({companyId:'fixture-company',employeeId:'actor-a',permissionKey:'own',periodKey:'2026-11',clockKey:'fixture-clock'});
  window.toggle=()=>setOpen(v=>!v);window.changeAmount=amount=>setSources(previous=>[{amount},...previous.slice(1)]);
  window.changeActor=employeeId=>setContext(previous=>({...previous,employeeId}));window.changePermission=permissionKey=>setContext(previous=>({...previous,permissionKey}));
  return open?<View sources={sources} context={context}/>:<p>Closed synthetic view</p>;
 }createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.route('**/*',route=>route.abort());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByText('actor-a:own=123',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.jobs),1);
  await page.evaluate(()=>window.toggle());await page.getByText('Closed synthetic view').waitFor();
  await page.evaluate(()=>window.toggle());await page.getByText('actor-a:own=123',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.jobs),1,'a new component lifetime can reuse completed immutable read data');
  await page.evaluate(()=>window.changeAmount(456));await page.getByText('actor-a:own=456',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.jobs),2);
  await page.evaluate(()=>{window.hold=true;window.changeActor('actor-b')});await page.getByRole('status').waitFor();
  assert.equal(await page.locator('[data-result]').count(),0,'no prior actor result while the next scope is pending');
  await page.waitForFunction(()=>window.jobs===3);
  await page.evaluate(()=>window.toggle());await page.getByText('Closed synthetic view').waitFor();
  await page.evaluate(()=>window.hold=false);await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>window.lastEntry.complete),false,'an obsolete job cannot complete a reusable entry');
  await page.evaluate(()=>window.toggle());await page.getByText('actor-b:own=456',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.jobs),4);
  await page.evaluate(()=>window.changePermission('restricted'));await page.getByText('actor-b:restricted=456',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.jobs),5);
 }finally{await browser.close()}
});
