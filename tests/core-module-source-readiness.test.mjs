import test from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import {readModuleSourceReadiness,isExplicitlyVisible,hasActiveModulePending} from '../scripts/helpers/module-source-readiness.mjs';
import {build} from 'esbuild';
import vm from 'node:vm';import {readFileSync} from 'node:fs';import {parse} from 'acorn';import {simple} from 'acorn-walk';
import {normalizeTrustedInputTimestamp} from '../scripts/helpers/browser-interaction-timing.mjs';

test('local read-model observer has an explicit capability contract, current actor and P0 authority; never confirms thirteen raw sources',()=>{
 const attrs={'data-hd-home-read-model-ready':'true','data-hd-home-read-model-principal':'uid-a','data-hd-home-read-model-tenant':'tenant-a','data-hd-home-read-model-capabilities':'four-cards-line-only'};
 const marker={getAttribute:key=>attrs[key]},main={querySelector:()=>marker};
 const props={currentUser:{uid:'uid-a',companyId:'tenant-a'},homeReadinessCollections:[],serverConfirmedCollectionState:{tenantId:'tenant-a',collections:{companies:true,employees:true,orders:false}}};
 const host={stateNode:main},view={memoizedProps:props,child:host},root={child:view,stateNode:{}};root.stateNode.current=root;view.return=root;host.return=view;main.__reactFiber$fixture=host;
 const read=vm.runInNewContext('('+readModuleSourceReadiness.toString()+')',{window:{__hdLocalHomeReadModelPilot:true}});
 assert.equal(read(main,'home',{}).sourcesReady,true);assert.equal(props.serverConfirmedCollectionState.collections.orders,false);
 for(const key of ['data-hd-home-read-model-ready','data-hd-home-read-model-principal','data-hd-home-read-model-tenant','data-hd-home-read-model-capabilities']){const old=attrs[key];attrs[key]='wrong';assert.equal(read(main,'home',{}).sourcesReady,false);attrs[key]=old}
 props.serverConfirmedCollectionState.collections.employees=false;assert.equal(read(main,'home',{}).sourcesReady,false);props.serverConfirmedCollectionState.collections.employees=true;
 const normal=vm.runInNewContext('('+readModuleSourceReadiness.toString()+')',{window:{__hdLocalHomeReadModelPilot:false}});assert.equal(normal(main,'home',{}).sourcesReady,false);
});
test('full-module observer requires actual same-tenant source contracts and respects active versus hidden retained loading',async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.setContent('<main data-hd-module="orders"><section style="display:none"><span aria-busy="true">Retained old route</span></section><section id="active">Synthetic current route</section></main>');
  await page.addScriptTag({content:[readModuleSourceReadiness,isExplicitlyVisible,hasActiveModulePending].map(fn=>fn.toString()).join('\n')});
  const state=()=>page.evaluate(()=>readModuleSourceReadiness(document.querySelector('main'),'orders',{orders:['orders','products']}));
  assert.equal((await state()).sourcesReady,false);
  await page.evaluate(()=>{const m=document.querySelector('main');window.props={currentUser:{companyId:'synthetic-a'},homeReadinessCollections:['orders'],serverConfirmedCollectionState:{tenantId:'synthetic-b',collections:{companies:true,employees:true,orders:true,products:true}}};const host={stateNode:m},view={memoizedProps:window.props,child:host},root={child:view,stateNode:{}};root.stateNode.current=root;view.return=root;host.return=view;m.__reactFiber$fixture=host;
   m.getBoundingClientRect=()=>{throw Error('No geometry allowed')};
  });
  assert.equal((await state()).sourcesReady,false);
  await page.evaluate(()=>window.props.serverConfirmedCollectionState.tenantId='synthetic-a');
  assert.equal((await state()).sourcesReady,true);
  assert.equal(await page.evaluate(()=>hasActiveModulePending(document.querySelector('main'))),false,'hidden old route cannot block source-confirmed current content');
  await page.evaluate(()=>document.querySelector('#active').setAttribute('aria-busy','true'));
  assert.equal(await page.evaluate(()=>hasActiveModulePending(document.querySelector('main'))),true,'active pending calculation cannot count as ready');
  await page.evaluate(()=>window.props.serverConfirmedCollectionState.collections.products=false);
  assert.deepEqual((await state()).missing,['products']);
  await page.evaluate(()=>window.props.homeReadinessCollections=[]);
  assert.equal(await page.evaluate(()=>readModuleSourceReadiness(document.querySelector('main'),'home',{home:['legacy-guessed-source']}).sourcesReady),false,'Home must use its actual nonempty contract');
  assert.equal(await page.evaluate(()=>readModuleSourceReadiness(document.querySelector('main'),'unknown',{}).sourcesReady),false);
 }finally{await browser.close()}
});

test('actual source-aware audit waits for props-only confirmation, keeps absent input clocks unmeasured and cleans up its polling',async()=>{
 const text=readFileSync('scripts/audit-android-webview.mjs','utf8');let expression;
 simple(parse(text,{ecmaVersion:'latest',sourceType:'module'}),{VariableDeclarator(n){if(n.id.name==='instrumentation')expression=text.slice(n.init.start,n.init.end)}});
 assert(expression);const instrumentation=vm.runInNewContext(expression,{normalizeTrustedInputTimestamp,lightweight:true,feedbackOnly:false,sourceAware:true,
  sourcePlans:{orders:['orders','products']},readModuleSourceReadiness,isExplicitlyVisible,hasActiveModulePending});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.setContent('<main data-hd-module="orders"><section style="display:none"><span aria-busy="true">Retained route</span></section><section id="active"><button id="tap">Synthetic navigation</button></section></main>');
  await page.evaluate(()=>{window.props={currentUser:{companyId:'fixture'},homeReadinessCollections:['orders'],serverConfirmedCollectionState:{tenantId:'fixture',collections:{companies:true,employees:true,orders:true,products:false}}};const m=document.querySelector('main');const host={stateNode:m},view={memoizedProps:window.props,child:host},root={child:view,stateNode:{}};root.stateNode.current=root;view.return=root;host.return=view;m.__reactFiber$fixture=host;
   window.__androidInteraction={expected:'orders',started:null,ready:null,feedback:null,feedbackScheduled:false,inputAt:null};
  });
  await page.addScriptTag({content:instrumentation});await page.evaluate(()=>document.querySelector('#tap').click());
  await page.waitForFunction(()=>window.__androidInteraction.feedback!==null);
  assert.equal(await page.evaluate(()=>window.__androidInteraction.ready),null);
  assert.equal(await page.evaluate(()=>window.__androidInteraction.preconfirmedAtClick),false);
  await page.evaluate(()=>window.props.serverConfirmedCollectionState.collections.products=true);
  await page.waitForFunction(()=>window.__androidInteraction.ready!==null);
  assert.equal(await page.evaluate(()=>window.__androidInteraction.inputToReadyMs),undefined,'no trusted pointer clock must not become a synthetic zero/PASS');
  assert.deepEqual(await page.evaluate(()=>window.__androidInteraction.sourceReadiness.missing),[]);
  await page.evaluate(()=>{window.__hdAndroidAuditProbe.restore();window.__androidInteraction.ready=null;window.__androidInteraction.started=performance.now()});
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__androidInteraction.ready),null,'no timer/observer remains after restoration');
 }finally{await browser.close()}
});


test('actual production React alternating commits and reused DOM subtrees are read from the current root',async()=>{
 const bundled=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';const fixed=<main data-hd-module="home"><p>Stable subtree</p></main>;const user={companyId:'fixture'},plan=['orders'];function View({serverConfirmedCollectionState,currentUser,homeReadinessCollections}){return window.__staticMain?fixed:<main data-hd-module="home"><p>{serverConfirmedCollectionState.collections.orders?'READY':'PENDING'}</p></main>}function App(){const[state,set]=React.useState({tenantId:'fixture',collections:{companies:true,employees:true,orders:false}});window.updateReady=value=>flushSync(()=>set({tenantId:'fixture',collections:{companies:true,employees:true,orders:value}}));return <View currentUser={user} serverConfirmedCollectionState={state} homeReadinessCollections={plan}/>}flushSync(()=>createRoot(document.getElementById('root')).render(<App/>));`},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch(chromiumLaunchOptions());try{for(const staticMain of[false,true]){const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.evaluate(value=>window.__staticMain=value,staticMain);await page.addScriptTag({content:bundled.outputFiles[0].text});await page.addScriptTag({content:readModuleSourceReadiness.toString()});
 for(const ready of[false,true,false,true,false]){await page.evaluate(value=>window.updateReady(value),ready);const result=await page.evaluate(()=>readModuleSourceReadiness(document.querySelector('main'),'home',{}));assert.equal(result.sourcesReady,ready,`staticMain=${staticMain}: current commit must agree with source state`)}await page.close()}}finally{await browser.close()}
});
