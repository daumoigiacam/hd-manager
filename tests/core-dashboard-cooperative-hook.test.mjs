import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {fileURLToPath} from 'node:url';
test('actual report hook keeps stale data busy, cancels superseded work, hides old tenant/permissions and can retry errors', {timeout:30000},async()=>{
 const driver=fileURLToPath(new URL('../src/services/cooperativeReportProjection.js',import.meta.url));
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
 import React,{useMemo,useEffect} from 'react';import{createRoot}from'react-dom/client';
 import{useCooperativeDashboardProjection}from'./src/services/useCooperativeDashboardProjection.js';
 window.yields=[];window.commits=[];window.failOnce=false;const cache={},root=createRoot(document.getElementById('root'));
 const companies={a:{id:'a'},b:{id:'b'}},employees={a:{id:'a'},b:{id:'b'},b2:{id:'b',role:'changed'}};
 function* payroll(input){yield;yield;return[{amount:input.amount*10}]}
 function Harness({scope,amount,mark,role,privacy,revision,enabled=true}){
  const inputs=useMemo(()=>({company:revision?{...companies[scope],backupAt:revision}:companies[scope],employee:employees[role||scope],amount,
   ...(privacy===undefined?{}:{privacyScope:privacy})}),[scope,amount,role,privacy,revision]);
  const report=useCooperativeDashboardProjection(inputs,cache,payroll,{enabled});
  useEffect(()=>{window.mark=mark;if(!report.pending)window.commits.push(report.snapshot.amount)},[mark,report.pending,report.snapshot]);
  return <section aria-busy={report.pending}><output>{report.snapshot?report.snapshot.amount:''}</output><span data-error={report.failed}/><button onClick={report.retry}>Retry</button></section>;
 }
 window.renderCase=(scope,amount,mark,role,privacy,revision,enabled)=>root.render(<Harness {...{scope,amount,mark,role,privacy,revision,enabled}}/>);
 window.release=()=>{const task=window.yields.shift();if(task)task();return Boolean(task)};
 window.clear=()=>root.render(null);window.unmount=()=>root.unmount();
 `,loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{
  name:'controlled-projection-test',setup(b){
   b.onResolve({filter:/^\.\/cooperativeReportProjection\.js$/},()=>({path:'controlled-driver',namespace:'fixture'}));
   b.onResolve({filter:/^\.\/executiveDashboardService\.js$/},()=>({path:'snapshot-steps',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='controlled-driver'
    ? `import{runCooperativeReportProjection as run}from ${JSON.stringify(driver)};let clock=0;export const runCooperativeReportProjection=(iterator,options)=>run(iterator,{...options,budgetMs:1,now:()=>clock++,yieldWork:()=>new Promise(resolve=>window.yields.push(resolve))});`
    : `export function* createExecutiveDashboardSnapshotIterator(input){yield;yield;if(window.failOnce){window.failOnce=false;throw Error('fixture')};return{amount:input.amount,payroll:input.payrollCosts.reduce((s,r)=>s+r.amount,0)}}`,resolveDir:process.cwd()}));
  }
 }]});
 const browser=await chromium.launch(chromiumLaunchOptions());
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const render=async(scope,amount,mark,role,privacy,revision,enabled)=>{await page.evaluate(args=>window.renderCase(...args),[scope,amount,mark,role,privacy,revision,enabled]);await page.waitForFunction(m=>window.mark===m,mark)};
  const settle=async()=>{for(let i=0;i<60;i++){if(await page.locator('section').getAttribute('aria-busy')==='false')return;await page.evaluate(()=>window.release());await page.waitForTimeout(5)}throw Error('Fixture calculation never completed')};
  await render('a',0,-2,undefined,undefined,undefined,false);
  await render('a',0,-1,undefined,undefined,undefined,false);
  assert.equal(await page.evaluate(()=>window.yields.length),0,'incomplete initial sources must not start report/payroll work');
  assert.equal(await page.locator('section').getAttribute('aria-busy'),'true');assert.deepEqual(await page.evaluate(()=>window.commits),[]);
  await render('a',1,1);assert.equal(await page.locator('section').getAttribute('aria-busy'),'true');assert.equal(await page.locator('output').textContent(),'');
  await settle();assert.equal(await page.locator('output').textContent(),'1');
  await render('a',2,2);assert.equal(await page.locator('output').textContent(),'1');assert.equal(await page.locator('section').getAttribute('aria-busy'),'true');
  await page.evaluate(()=>window.release());await render('a',3,3);await settle();
  assert.equal(await page.locator('output').textContent(),'3');assert.equal(await page.evaluate(()=>window.commits.includes(2)),false);
  await render('b',4,4);assert.equal(await page.locator('output').textContent(),'','old tenant hidden before new result');await settle();
  await render('b',4,5,'b2');assert.equal(await page.locator('output').textContent(),'','changed permissions cannot reuse prior employee snapshot');await settle();
  await page.evaluate(()=>window.failOnce=true);await render('b',5,6,'b2');
  for(let i=0;i<60 && await page.locator('[data-error]').getAttribute('data-error')!=='true';i++){await page.evaluate(()=>window.release());await page.waitForTimeout(5)}
  assert.equal(await page.locator('[data-error]').getAttribute('data-error'),'true');assert.equal(await page.locator('section').getAttribute('aria-busy'),'true');assert.equal(await page.locator('output').textContent(),'4');
  await page.locator('button').click();await settle();assert.equal(await page.locator('output').textContent(),'5');
  await render('b',6,7,'b2','grants-one',1);assert.equal(await page.locator('output').textContent(),'');await settle();
  await render('b',7,8,'b2','grants-one',2);
  assert.equal(await page.locator('output').textContent(),'6','display/backup metadata keeps completed report visible');
  assert.equal(await page.locator('section').getAttribute('aria-busy'),'true');await settle();
  await render('b',8,9,'b2','grants-two',3);
  assert.equal(await page.locator('output').textContent(),'','revoked grants clear prior snapshot immediately');await settle();
  await render('a',10,10,'b2','grants-two',4);
  assert.equal(await page.locator('output').textContent(),'','tenant change cannot reuse even an identical explicit privacy key');await settle();
  await render('a',11,11,'a','grants-two',4);
  assert.equal(await page.locator('output').textContent(),'','principal change cannot reuse an explicit privacy key');await settle();
  await render('a',13,13);await settle();await page.evaluate(()=>window.clear());await page.waitForFunction(()=>!document.querySelector('section'));
  const beforeRemount=await page.evaluate(()=>window.yields.length);await render('a',13,14);
  assert.equal(await page.locator('output').textContent(),'13','same-scope cached report survives a real unmount/remount');await settle();
  assert.equal(await page.evaluate(()=>window.yields.length),beforeRemount,'unchanged inputs must not schedule payroll or report work again');
  await render('a',9,12);await page.evaluate(()=>window.unmount());for(let i=0;i<10;i++){await page.evaluate(()=>window.release());await page.waitForTimeout(5)}
  assert.equal(await page.evaluate(()=>window.commits.includes(9)),false);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
