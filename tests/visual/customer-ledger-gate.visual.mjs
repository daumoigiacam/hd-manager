import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../helpers/chromium-launch-options.mjs';
const output=process.env.HD_LEDGER_GATE_OUTPUT||'test-results/customer-ledger-gate';await fs.mkdir(output,{recursive:true});
const bundled=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState,useCallback,useEffect,Suspense,startTransition,useContext} from 'react';
 import {createRoot} from 'react-dom/client';
 import {useCooperativeProjection} from './src/hooks/useCooperativeProjection.js';
 import {CompletedProjectionGate,LedgerPreparationNotice} from './src/hooks/CompletedProjectionGate.jsx';
 window.lazyRenders=0;window.allowed=new Set([1]);window.fail=new Set();window.commits=[];window.mounts=0;window.started=[];
 const LedgerContext=React.createContext(null);
 function Form({version}){const [draft,setDraft]=useState('');const ledger=useContext(LedgerContext);
 if(ledger!==version)throw Error('Mixed ledger and document generation');useEffect(()=>{window.mounts++},[]);
 useEffect(()=>{window.commits.push(version)},[version]);
 return <div data-generation={version}><input aria-label="Draft" value={draft} onChange={e=>setDraft(e.target.value)}/><span>{version}</span></div>}
 function App(){const [version,setVersion]=useState(1),[attempt,setAttempt]=useState(0),[actor,setActor]=useState('one'),[retain,setRetain]=useState(false),[identity,setIdentity]=useState({});window.enableRetention=setRetain;window.replaceRetainIdentity=()=>setIdentity({});window.changeVersion=setVersion;window.changeActor=setActor;window.changeInTransition=v=>startTransition(()=>setVersion(v));
 const factory=useCallback(function*(){void attempt;void actor;window.started.push(version);while(!window.allowed.has(version))yield;if(window.fail.has(version))throw Error('synthetic projection failure');return version},[version,attempt,actor]);
 const projection=useCooperativeProjection(factory);
 return <><button onClick={()=>window.navClicks=(window.navClicks||0)+1}>Navigation</button>
 <Suspense fallback={<LedgerPreparationNotice/>}><CompletedProjectionGate key={actor} retainWhilePending={retain} retainIdentity={identity} projection={projection} onRetry={()=>{window.fail.delete(version);setAttempt(a=>a+1)}}>
 {()=>{window.lazyRenders++;return <LedgerContext.Provider value={projection.value}><Form version={projection.value}/></LedgerContext.Provider>}}</CompletedProjectionGate></Suspense></>}
 createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundled.outputFiles[0].contents:'<div id="root"></div><script src="/app.js"></script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(chromiumLaunchOptions());
const page=await browser.newPage({viewport:{width:360,height:800}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(url);await page.locator('[data-generation="1"]').waitFor();await page.getByRole('textbox',{name:'Draft'}).fill('unsaved draft');
 const completedRenders=await page.evaluate(()=>window.lazyRenders);
 await page.evaluate(()=>{window.originalInput=document.querySelector('input');window.changeVersion(2)});
 await page.locator('[data-hd-ledger-loading]').waitFor();assert.equal(await page.locator('[data-generation="1"]').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.lazyRenders),completedRenders,'pending gate must not construct partial child JSX');
 await page.getByRole('button',{name:'Navigation'}).click();assert.equal(await page.evaluate(()=>window.navClicks),1);checks.push('pending hides obsolete financial view; independent navigation works');
 await page.evaluate(()=>{window.allowed.add(3);window.changeVersion(3)});await page.locator('[data-generation="3"]').waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Draft'}).inputValue(),'unsaved draft');
 assert.equal(await page.evaluate(()=>window.originalInput===document.querySelector('input')),true);
 assert.equal(await page.evaluate(()=>window.mounts),1);assert.deepEqual(await page.evaluate(()=>window.commits),[1,3]);checks.push('superseded result never publishes; same form node and dirty input retained');
 await page.evaluate(()=>{window.fail.add(4);window.allowed.add(4);window.changeVersion(4)});await page.getByRole('alert').waitFor();
 assert.equal(await page.locator('[data-generation="4"]').count(),0);await page.getByRole('button',{name:'Thử lại'}).click();await page.locator('[data-generation="4"]').waitFor();checks.push('failure has explicit retry and no fabricated zero/complete result');
 await page.evaluate(()=>window.changeVersion(5));await page.locator('[data-hd-ledger-loading]').waitFor();assert.equal(await page.locator('[data-generation="4"]').isVisible(),false);
 await page.evaluate(()=>window.allowed.add(5));await page.locator('[data-generation="5"]').waitFor();checks.push('new scope never displays old visible ledger while pending');
 await page.evaluate(()=>{window.allowed.add(6);window.changeInTransition(6)});
 await page.locator('[data-generation="6"]').waitFor({timeout:3000});checks.push('React startTransition source update completes without waiting for an effect that cannot commit');
 await page.evaluate(()=>{window.allowed.add(7);window.changeActor('two');window.changeVersion(7)});await page.locator('[data-generation="7"]').waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Draft'}).inputValue(),'');assert.equal(await page.evaluate(()=>window.mounts),2);checks.push('actor key resets the previous private draft instead of retaining it across identities');
 await page.evaluate(()=>window.enableRetention(true));
 const reportTop=await page.locator('[data-generation="7"]').evaluate(node=>node.getBoundingClientRect().top);
 await page.evaluate(()=>{window.retainedNode=document.querySelector('[data-generation="7"]');window.changeVersion(8)});
 await page.locator('[data-hd-projection-content][aria-busy="true"]').waitFor();
 assert.equal(await page.locator('[data-generation="7"]').isVisible(),true);
 assert.equal(await page.locator('[data-generation="7"]').evaluate(node=>node.getBoundingClientRect().top),reportTop);
 assert.equal(await page.locator('[data-hd-ledger-loading]').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.retainedNode===document.querySelector('[data-generation="7"]')),true);
 checks.push('read-only background refresh retains the completed visible tree and exact layout while readiness stays busy');
 await page.evaluate(()=>window.allowed.add(8));await page.locator('[data-generation="8"]').waitFor();
 await page.evaluate(()=>{window.replaceRetainIdentity();window.changeVersion(9)});
 await page.locator('[data-hd-ledger-loading]').waitFor();assert.equal(await page.locator('[data-generation="8"]').isVisible(),false);
 checks.push('changed retention identity cannot display a previous private read tree');
 await page.evaluate(()=>window.allowed.add(9));await page.locator('[data-generation="9"]').waitFor();
 await page.evaluate(()=>{window.changeActor('revoked-permissions');window.changeVersion(10)});
 await page.locator('[data-hd-ledger-loading]').waitFor();assert.equal(await page.locator('[data-generation="9"]').count(),0);
 checks.push('changed privacy key unmounts the old report before a new result is available');
 await page.evaluate(()=>window.allowed.add(10));await page.locator('[data-generation="10"]').waitFor();
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/complete.png'});
}finally{await fs.writeFile(output+'/result.json',JSON.stringify({checks,errors,scope:'Real production React hooks and completed-subtree gate in isolated Chromium, synthetic controlled sources. Not Firebase or Android latency.'},null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({checks:checks.length,errors}));
