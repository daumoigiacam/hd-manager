import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
test('React model availability requires an exact DOM commit; actor/period/revision changes and obsolete callbacks cannot publish old financial data',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useState,useRef,useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';import {useEmployeeHomeReadModel} from './src/hooks/useEmployeeHomeReadModel.js';
 const jobs=[];window.jobs=jobs;const read=input=>new Promise((resolve,reject)=>jobs.push({input,resolve,reject}));const getIdToken=async()=>'synthetic-only';
 function CommittedView({result,acknowledge}){const ref=useRef(null);useLayoutEffect(()=>{if(ref.current.textContent===String(result.model.salary.netSalary)){window.lastCommit={result,acknowledge};acknowledge(result)}},[result,acknowledge]);return <p data-model ref={ref}>{result.model.salary.netSalary}</p>}
 function Fixture(){const[actor,setActor]=useState({uid:'uid-a',companyId:'company-a',employeeId:'employee-a'}),[date,setDate]=useState('2026-11-02'),[revision,setRevision]=useState('revision-1'),[enabled,setEnabled]=useState(true),[showView,setShowView]=useState(false);
 const state=useEmployeeHomeReadModel({enabled,projectId:'synthetic-project',appId:'synthetic-app',actor,date,timeZone:'Asia/Ho_Chi_Minh',domainVersion:'a'.repeat(64),getIdToken,revision,read});
 window.state=state;window.setActor=setActor;window.setDate=setDate;window.setRevision=setRevision;window.setEnabled=setEnabled;window.setShowView=setShowView;
 window.finish=(index,amount)=>jobs[index].resolve({kind:'hd-employee-home-model-v1',scope:{...jobs[index].input.actor,date:jobs[index].input.date},model:{salary:{netSalary:amount}}});
 return <><output data-status={state.status} data-ready={String(state.ready)}>{state.error?'error':state.result?'available':'pending'}</output>{showView&&state.result?<CommittedView result={state.result} acknowledge={state.acknowledgeCommit}/>:null}</>;
 }const root=createRoot(document.getElementById('root'));root.render(<React.StrictMode><Fixture/></React.StrictMode>);window.unmount=()=>root.unmount();
 `},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.route('**/*',route=>route.abort());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.jobs.length===1);await page.evaluate(()=>window.finish(0,123));await page.locator('[data-status="available"][data-ready="false"]').waitFor();
  assert.equal(await page.locator('[data-model]').count(),0,'network availability alone is not UI readiness');
  await page.evaluate(()=>window.setShowView(true));await page.locator('[data-status="ready"][data-ready="true"]').waitFor();assert.equal(await page.locator('[data-model]').textContent(),'123');
  await page.evaluate(()=>{window.oldCommit=window.lastCommit;window.setActor({uid:'uid-b',companyId:'company-b',employeeId:'employee-b'})});
  await page.waitForFunction(()=>window.jobs.length===2);assert.equal(await page.locator('[data-model]').count(),0);
  assert.equal(await page.evaluate(()=>window.oldCommit.acknowledge(window.oldCommit.result)),false);
  await page.evaluate(()=>window.setRevision('revision-2'));await page.waitForFunction(()=>window.jobs.length===3);
  assert.equal(await page.evaluate(()=>window.jobs[1].input.signal.aborted),true);
  await page.evaluate(()=>window.finish(1,999));await page.waitForTimeout(30);assert.equal(await page.locator('[data-model]').count(),0,'transport ignoring cancellation cannot expose obsolete amount');
  await page.evaluate(()=>window.finish(2,456));await page.locator('[data-status="ready"]').waitFor();assert.equal(await page.locator('[data-model]').textContent(),'456');
  await page.evaluate(()=>window.setDate('2026-12-01'));await page.waitForFunction(()=>window.jobs.length===4);assert.equal(await page.locator('[data-model]').count(),0);
  await page.evaluate(()=>window.jobs[3].reject(Error('Synthetic unavailable')));await page.locator('[data-status="error"][data-ready="false"]').waitFor();
  await page.evaluate(()=>window.state.retry());await page.waitForFunction(()=>window.jobs.length===5);await page.evaluate(()=>window.finish(4,789));await page.locator('[data-status="ready"]').waitFor();
  await page.evaluate(()=>window.setEnabled(false));await page.locator('[data-status="disabled"]').waitFor();assert.equal(await page.locator('[data-model]').count(),0);
  await page.evaluate(()=>window.unmount());assert.equal(await page.evaluate(()=>window.jobs.every(j=>j.input.signal.aborted)),true);
 }finally{await browser.close()}
});
