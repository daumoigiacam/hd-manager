import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parse}from'@babel/parser';
import {build}from'esbuild';import{chromium}from'playwright-core';import{chromiumLaunchOptions}from'./helpers/chromium-launch-options.mjs';
test('actual App read-state reset commits no previous actor data, preserves commands and rejects delayed old publication',{timeout:30000},async()=>{
 const source=fs.readFileSync('src/App.jsx','utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']}),app=ast.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration;
 const states=app.body.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).filter(n=>n.id.type==='ArrayPattern'&&n.id.elements[0]?.name.startsWith('raw')&&n.init?.callee?.name==='useState');
 assert.ok(states.length>=40);const start=source.indexOf('  const readOwnerKey='),end=source.indexOf('  const setRealtimeStatus =',start);assert.ok(start>0&&end>start);
 const declarations=states.map(n=>'const '+source.slice(n.start,n.end)+';').join('\n'),names=states.map(n=>n.id.elements[0].name);
 const fillers=states.map(n=>`${n.id.elements[1].name}(${n.init.arguments[0].type==='ObjectExpression'?'{fiction:{id:"private-fixture"}}':'[{id:"private-fixture"}]'});`).join('\n');
 const errorBindings=['getErrorText','isFirebasePermissionError'].map(name=>{
  const declaration=ast.program.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name===name);
  assert.ok(declaration,`Missing actual App classifier binding: ${name}`);return 'const '+source.slice(declaration.start,declaration.end)+';';
 }).join('\n');
 const script=`import React,{useState,useRef,useLayoutEffect}from'react';import{createRoot}from'react-dom/client';import{bindScopedReadPublication}from'./src/services/scopedReadPublication.js';import{createReadOwnerAccess}from'./src/services/readOwnerAccess.js';window.commits=[];window.commands=[{operationId:'unresolved-fictional-command'}];
 ${errorBindings}
 function Fixture(){const[actor,setActor]=useState({id:'a',uid:'u',companyId:'same-company',accountType:'employee',role:'sales',session:1}),[loaded,setLoadedCollections]=useState({}),[confirmed,setServerConfirmedCollectionState]=useState({collections:{}});const currentUser=actor,dataSessionId=actor.uid+'-'+actor.session,readPermissionKey=actor.permission||'initial-permission';
 const lastStableCollectionDataRef=useRef(new Map()),recentLocalWritesRef=useRef(new Map()),recentLocalDeletesRef=useRef(new Map()),lastRealtimeSnapshotAtRef=useRef(new Map()),lastRealtimeServerSnapshotAtRef=useRef(new Map()),collectionReadinessCommittedRef=useRef(null),customerBootstrapCommitRef=useRef(null);
 const [financial,setCustomerFinancialState]=useState(null),[catalog,setCustomerCatalogState]=useState(null);const resetCustomerFinancialReadiness=()=>({status:'idle'});
 ${declarations}
 ${source.slice(start,end)}
 window.seed=()=>{${fillers}lastStableCollectionDataRef.current.set('orders',[{id:'old-private'}]);setLoadedCollections({orders:true});setServerConfirmedCollectionState({ownerKey:readOwnerKey,collections:{orders:true}});window.oldPublication=bindScopedReadPublication(setRawOrders,()=>readOwnerRef.current===readOwnerKey)};
 window.change=patch=>setActor(previous=>({...previous,...patch}));window.delayed=()=>window.oldPublication([{id:'late-old-actor'}]);
 const values={${names.join(',')}};const count=Object.values(values).reduce((n,value)=>n+(Array.isArray(value)?value.length:value?Object.keys(value).length:0),0);
 useLayoutEffect(()=>{window.commits.push({id:actor.id,session:actor.session,role:actor.role,tenant:actor.companyId,count,confirmed:confirmed.collections.orders===true,stableCount:lastStableCollectionDataRef.current.size})});
 return <p data-count={count} data-actor={actor.id} data-session={actor.session} data-ready={confirmed.collections.orders===true}>{count}</p>}
 createRoot(document.getElementById('root')).render(<Fixture/>);`;
 const bundle=await build({stdin:{contents:script,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"development"'}}),browser=await chromium.launch(chromiumLaunchOptions());
 try{const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('[data-count="0"]').waitFor();
 for(const patch of [{id:'b'},{session:2},{role:'viewer'},{companyId:'another-company'},{permission:'narrower-grants'}]){
  await page.evaluate(()=>window.seed());await page.waitForFunction(()=>Number(document.querySelector('[data-count]').dataset.count)>0);
  const index=await page.evaluate(()=>window.commits.length);await page.evaluate(patch=>window.change(patch),patch);await page.locator('[data-count="0"][data-ready="false"]').waitFor();
  await page.evaluate(()=>window.delayed());await page.waitForTimeout(30);assert.equal(await page.locator('[data-count]').getAttribute('data-count'),'0');assert.equal(await page.evaluate(index=>window.commits.slice(index).every(row=>row.count===0&&!row.confirmed&&row.stableCount===0),index),true);
  assert.equal(await page.evaluate(()=>window.commands.length),1);
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
