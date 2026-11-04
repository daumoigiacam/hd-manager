import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';

test('Home projection never reveals stale results across scope/data changes; completed immutable inputs reopen without recomputation',{timeout:30000},async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import Gate from'./src/features/employees/PersonalHomeProjectionGate.jsx';
 const employee={id:'fixture'},employees=[employee],empty=[],map={},config={};window.jobs=[];window.actions=0;window.readiness=[];
 const onReadinessChange=ready=>window.readiness.push(ready);
 function Fixture(){const[scope,setScope]=useState('scope-a'),[orders,setOrders]=useState(empty),[open,setOpen]=useState(true);
 window.switchScope=()=>setScope('scope-b');window.changeData=()=>setOrders([{id:'changed'}]);window.toggle=()=>setOpen(value=>!value);
 return open?<Gate input={{employee,employees,attendance:map,financials:empty,performance:map,customers:empty,orders,payments:empty,holidays:empty,employeeReviews:empty,deliveryReports:empty,monthKey:'2026-10'}}
 privacyScope={scope} config={config} db={null} enabled={true} onReadinessChange={onReadinessChange}>{value=><><p data-result>{value.label}</p><button onClick={()=>window.actions++}>Export</button></>}</Gate>:<p>Closed</p>}
 createRoot(document.getElementById('root')).render(<Fixture/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
 plugins:[{name:'controlled-projection',setup(b){
  b.onResolve({filter:/personalHomeProjectionClient\.js$/},()=>({path:'controlled',namespace:'stub'}));
  b.onResolve({filter:/^@hd\/personal-home-values$/},()=>({path:'values',namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='values'?'export const encodeFirestoreNativeValue=x=>x;export const decodeFirestoreNativeValue=x=>x;':`export function runPersonalHomeProjection({signal}){return new Promise((resolve,reject)=>{const job={resolve,reject,aborted:false};window.jobs.push(job);signal.addEventListener('abort',()=>{job.aborted=true;reject(Object.assign(new Error('cancelled'),{name:'AbortError'}))})})}`}));
 }}]});
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.jobs?.length===1);assert.equal(await page.locator('[data-result]').count(),0);
  assert.equal(await page.evaluate(()=>window.readiness.at(-1)),false);
  await page.evaluate(()=>window.jobs[0].resolve({label:'A complete'}));await page.getByText('A complete',{exact:true}).waitFor();
  await page.waitForFunction(()=>window.readiness.at(-1)===true);
  await page.evaluate(()=>window.toggle());await page.getByText('Closed',{exact:true}).waitFor();
  await page.evaluate(()=>window.toggle());await page.getByText('A complete',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.jobs.length),1,'same immutable sources reuse completed projection');
  await page.evaluate(()=>window.changeData());await page.waitForFunction(()=>window.jobs.length===2);
  assert.equal(await page.evaluate(()=>window.readiness.at(-1)),false);
  assert.equal(await page.getByText('A complete',{exact:true}).isVisible(),true,'same-scope completed content remains stable while recalculating');
  assert(await page.locator('[data-hd-projection-content][aria-busy="true"]').count()>0);
  await page.getByRole('button',{name:'Export',exact:true}).click();assert.equal(await page.evaluate(()=>window.actions),0,'retained data cannot be exported or acted on as fresh');
  await page.evaluate(()=>window.switchScope());await page.waitForFunction(()=>window.jobs.length===3);
  assert.equal(await page.getByText('A complete',{exact:true}).count(),0,'scope change removes the previous private subtree');
  assert.equal(await page.evaluate(()=>window.jobs[1].aborted),true);
  await page.evaluate(()=>window.jobs[1].resolve({label:'stale A'}));assert.equal(await page.getByText('stale A',{exact:true}).count(),0);
  await page.evaluate(()=>window.jobs[2].reject(new Error('synthetic worker failure')));await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('[data-result]').count(),0);
  await page.getByRole('button',{name:'Thử lại'}).click();await page.waitForFunction(()=>window.jobs.length===4);
  await page.evaluate(()=>window.jobs[3].resolve({label:'B complete'}));await page.getByText('B complete',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
