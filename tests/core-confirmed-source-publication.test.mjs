import test from 'node:test';import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {createSourcePhaseDiagnostics} from '../src/services/sourcePhaseDiagnostics.js';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
const markSource=appFunction('markCollectionServerConfirmed').toString(),flushSource=appFunction('flushServerConfirmedCollectionMarks').toString(),pendingSource=appFunction('markCollectionServerPending').toString();
function fixture({warm=false,deferred=false}={}){
 let state=warm?{tenantId:'a',ownerKey:'fixture-session',collections:{orders:true}}:{tenantId:'a',collections:{}},sets=0;
 const updates=[];
 const activeTenantScopeRef={current:'a'},readOwnerRef={current:'fixture-session'};
 const collectionReadinessCommittedRef={current:warm?{actorUid:'actor-a',tenantId:'a',loaded:{orders:true},serverConfirmed:state}:null};
 const bindings={readOwnerRef,readOwnerKey:'fixture-session',activeTenantScopeRef,tenantCompanyId:'a',firebaseUser:{uid:'actor-a'},collectionReadinessCommittedRef,sourcePhaseDiagnostics:createSourcePhaseDiagnostics(),startupNotificationBarrier:null,customerSession:false,
  markCollectionLoaded(){},setServerConfirmedCollectionState:update=>{sets++;if(deferred){updates.push(update);return}state=update(state);
   // This synchronous state harness models the subsequent committed effect.
   collectionReadinessCommittedRef.current={actorUid:'actor-a',tenantId:'a',loaded:{},serverConfirmed:state};}};
 const gate=new Function(...Object.keys(bindings),`
  let cancelled=false,serverConfirmedCollectionMarkTimer=null;
  const isReadAccessCurrent=()=>!cancelled&&readOwnerRef.current===readOwnerKey;
  const pendingServerConfirmedCollectionMarks=new Set();
  const serverPendingCollectionNames=new Set();
  const pending=${pendingSource};
  const flushServerConfirmedCollectionMarks=${flushSource};const mark=${markSource};
  return{mark,pending,cancel(){cancelled=true;serverConfirmedCollectionMarkTimer=null;pendingServerConfirmedCollectionMarks.clear()}};
 `)(...Object.values(bindings));
 return {...gate,activeTenantScopeRef,readOwnerRef,read:()=>({state,sets}),commit(){for(const update of updates.splice(0))state=update(state);
  collectionReadinessCommittedRef.current={actorUid:'actor-a',tenantId:'a',loaded:{orders:true},serverConfirmed:state}}};
}
test('actual confirmed-source publisher batches commit witnesses in one bounded microtask instead of a timer/transition',async()=>{
 const f=fixture();f.mark('orders');f.mark('payments');assert.equal(f.read().sets,0);
 await Promise.resolve();assert.equal(f.read().sets,1);assert.deepEqual(f.read().state,{tenantId:'a',ownerKey:'fixture-session',collections:{orders:true,payments:true}});
 for(let i=0;i<100;i++)f.mark('orders');await Promise.resolve();assert.equal(f.read().sets,1,'already committed source metadata must not create 100 no-op React actions');
});
test('cancelled or replaced tenant cannot receive a queued confirmed-source mark',async()=>{
 for(const cancel of [true,false]){
  const f=fixture();f.mark('orders');if(cancel)f.cancel();else f.activeTenantScopeRef.current='b';
  await Promise.resolve();assert.deepEqual(f.read().state,{tenantId:'a',collections:{}});
 }
});
test('same UID and tenant with a new login epoch rejects the previous confirmation',async()=>{
 const f=fixture();f.mark('orders');f.readOwnerRef.current='new-session';await Promise.resolve();assert.deepEqual(f.read().state,{tenantId:'a',collections:{}});
});

test('cold starts and repeated pending marks schedule no React update until a real confirmation',async()=>{
 const f=fixture();for(let i=0;i<100;i++)f.pending('orders');
 assert.equal(f.read().sets,0);assert.equal(f.read().state.collections.orders,undefined);
 f.mark('orders');await Promise.resolve();assert.equal(f.read().sets,1);assert.equal(f.read().state.collections.orders,true);
});
test('warm reopen marks only its currently true flag pending and is idempotent',async()=>{
 const f=fixture({warm:true});f.pending('orders');
 assert.equal(f.read().state.collections.orders,false);assert.equal(f.read().sets,1);
 for(let i=0;i<100;i++)f.pending('orders');f.pending('unopened');assert.equal(f.read().sets,1);
 f.mark('orders');await Promise.resolve();assert.equal(f.read().state.collections.orders,true);assert.equal(f.read().sets,2);
});
test('same-tick pending/confirm must override a still-true committed ref',async()=>{
 const f=fixture({warm:true,deferred:true});f.pending('orders');f.mark('orders');await Promise.resolve();
 assert.equal(f.read().sets,2,'confirmation cannot be skipped because the committed ref still says true');
 f.commit();assert.equal(f.read().state.collections.orders,true);
});
test('pending removes a queued old confirmation and blocks an already-queued React confirmation updater',async()=>{
 for(const flushFirst of[false,true]){
  const f=fixture({deferred:true});f.mark('orders');if(flushFirst)await Promise.resolve();
  f.pending('orders');await Promise.resolve();f.commit();assert.notEqual(f.read().state.collections.orders,true);
  f.mark('orders');await Promise.resolve();f.commit();assert.equal(f.read().state.collections.orders,true);
 }
});
test('cancelled, changed-tenant and same-UID new epochs reject pending/confirm and queued invalidations',async()=>{
 for(const change of[f=>f.cancel(),f=>{f.activeTenantScopeRef.current='b'},f=>{f.readOwnerRef.current='next-login'}]){
  const f=fixture({warm:true,deferred:true});f.pending('orders');change(f);f.pending('payments');f.mark('orders');
  await Promise.resolve();f.commit();assert.equal(f.read().state.collections.orders,true,'obsolete invalidation cannot alter the next owner state');
  assert.equal(f.read().sets,1);
 }
});

test('actual pending/confirm callbacks keep the same React form and cached rows mounted while freshness changes',async()=>{
 const script=`import React,{useState,useRef,useMemo,useLayoutEffect,useEffect}from'react';
 import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
 import{createCollectionCommitWitness}from'./src/services/collectionCommitWitness.js';
 window.mounts=0;window.unmounts=0;window.starts=0;
 function View({rows,ready}){const[draft,setDraft]=useState('');useEffect(()=>{window.mounts++;return()=>window.unmounts++},[]);
 return React.createElement('main',{'data-ready':String(ready)},React.createElement('p',null,rows[0].id),React.createElement('input',{value:draft,onChange:event=>setDraft(event.target.value),'aria-label':'Draft'}));}
 function Fixture(){const[readOwnerKey,setOwner]=useState('owner-a'),[state,setServerConfirmedCollectionState]=useState({tenantId:'a',ownerKey:'owner-a',collections:{orders:true}});
 const readOwnerRef=useRef(readOwnerKey);readOwnerRef.current=readOwnerKey;
 const rows=useRef([{id:'same-cached-report'}]).current;
 const collectionReadinessCommittedRef=useRef({actorUid:'actor-a',tenantId:'a',serverConfirmed:state});
 useLayoutEffect(()=>{collectionReadinessCommittedRef.current={actorUid:'actor-a',tenantId:'a',serverConfirmed:state}},[state]);
 const runtime=useMemo(()=>{let serverConfirmedCollectionMarkTimer=null;
 const activeTenantScopeRef={current:'a'},tenantCompanyId='a',firebaseUser={uid:'actor-a'},customerSession=false,startupNotificationBarrier=null;
 const sourcePhaseDiagnostics={mark(){}},markCollectionLoaded=()=>{};
 const isReadAccessCurrent=()=>readOwnerRef.current===readOwnerKey;
 const pendingServerConfirmedCollectionMarks=new Set(),serverPendingCollectionNames=new Set();
 const markCollectionServerPending=${pendingSource};
 const flushServerConfirmedCollectionMarks=${flushSource};
 const markCollectionServerConfirmed=${markSource};
 const witness=createCollectionCommitWitness({isCurrent:isReadAccessCurrent,getCommittedStates:()=>({orders:rows}),onCommitted:markCollectionServerConfirmed});
 return{start(){window.starts++;markCollectionServerPending('orders');witness.begin('orders')},
 server(){const generation=witness.begin('orders');witness.expectCommit('orders',generation,rows);witness.publicationScheduled()},
 late:()=>markCollectionServerConfirmed('orders')};},[readOwnerKey]);
 window.start=()=>flushSync(()=>runtime.start());window.server=()=>runtime.server();window.oldCallback=runtime.late;
 window.nextOwner=()=>flushSync(()=>{setOwner('owner-b');setServerConfirmedCollectionState({tenantId:'a',ownerKey:'owner-b',collections:{orders:false}})});
 return React.createElement(View,{key:readOwnerKey,rows,ready:state.collections.orders===true});}
 const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Fixture)));window.stop=()=>flushSync(()=>root.unmount());`;
 const bundle=await build({stdin:{contents:script,loader:'js',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const context=await browser.newContext();await context.route('**/*',route=>route.abort());const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByLabel('Draft').fill('preserve unsaved form');await page.evaluate(()=>{window.inputNode=document.querySelector('input');window.start()});
  await page.locator('[data-ready="false"]').waitFor();assert.equal(await page.getByText('same-cached-report').isVisible(),true);
  assert.equal(await page.getByLabel('Draft').inputValue(),'preserve unsaved form');
  await page.evaluate(()=>window.server());await page.locator('[data-ready="true"]').waitFor();
  assert.equal(await page.evaluate(()=>window.inputNode===document.querySelector('input')),true);
  assert.equal(await page.evaluate(()=>window.mounts),1);assert.equal(await page.evaluate(()=>window.unmounts),0);
  assert.equal(await page.evaluate(()=>window.starts),1,'readiness changes must not restart the subscription');
  const old=await page.evaluateHandle(()=>window.oldCallback);await page.evaluate(()=>window.nextOwner());
  await page.evaluate(callback=>callback(),old);await page.locator('[data-ready="false"]').waitFor();
  await old.dispose();await page.evaluate(()=>window.stop());assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
