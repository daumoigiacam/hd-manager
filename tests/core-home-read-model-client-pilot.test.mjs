import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from '@babel/parser';
import {build,transform} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
import {homeReadModelPilotPlugin} from '../scripts/helpers/home-read-model-pilot-plugin.mjs';
import {planForegroundRealtimeActivation} from '../src/services/realtimeListenerPlanner.js';

test('QA plugin executes the exact App branch and company-primary plan; opt-out and every other route retain the original machinery',async()=>{
 const appFile=path.resolve('src/App.jsx'),planFile=path.resolve('src/services/homeDataContract.js');
 const app=await readFile(appFile,'utf8'),plan=await readFile(planFile,'utf8');
 const disabled=homeReadModelPilotPlugin();assert.equal(disabled.transform(app,appFile),null);
 assert.equal(disabled.transformIndexHtml('<html/>'),null);
 assert.throws(()=>homeReadModelPilotPlugin({enabled:true,project:'production'}),/fictional/);
 const receipts=[],plugin=homeReadModelPilotPlugin({enabled:true,project:'demo-hdm-perf-verification',receipts});
 assert.equal(plugin.name,'hd-local-home-read-model-pilot');
 assert.throws(()=>plugin.configResolved({command:'build',mode:'production'}),/QA build/);
 plugin.configResolved({command:'build',mode:'emulator'});
 const next=plugin.transform(app,appFile).code,nextPlan=plugin.transform(plan,planFile).code;
 plugin.buildEnd();assert.equal(receipts.length,2);
 assert.equal(plugin.transform('untouched',path.resolve('src/features/legacy/CustomerPortalView.jsx')),null);
 assert.throws(()=>plugin.transform(app.replace('return props.primaryMode ?','return props.changed ?'),appFile),/contract changed/);
 assert.throws(()=>plugin.transform(plan+plan,planFile),/contract changed/);
 const tree=parse(next,{sourceType:'module',plugins:['jsx']});
 const branch=tree.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='ExecutiveDashboardView');assert(branch);
 const jsx=(await transform(next.slice(branch.start,branch.end),{loader:'jsx',jsxFactory:'element'})).code;
 const choose=new Function('element','LocalHomeReadModelView','FullExecutiveDashboardView',jsx+';return ExecutiveDashboardView')((view,props)=>({view,props}),'pilot','full');
 assert.equal(choose({primaryMode:true}).view,'pilot');assert.equal(choose({primaryMode:false}).view,'full');
 const original=await import('data:text/javascript;base64,'+Buffer.from(plan).toString('base64'));
 const changed=await import('data:text/javascript;base64,'+Buffer.from(nextPlan).toString('base64'));
 const byTab={home:['old-home'],executive_dashboard:['all-history'],orders:['orders'],customers:['customers']};
 for(const companyHome of[false,true])for(const primaryHome of[false,true])for(const detailsRequested of[false,true])for(const tab of['home','orders','customers','executive_dashboard']){
  const options={companyHome,primaryHome,detailsRequested,byTab};
  assert.deepEqual(changed.getForegroundReadCollections(tab,options),tab==='home'&&companyHome&&primaryHome?[]:original.getForegroundReadCollections(tab,options));
 }
 assert.deepEqual(changed.COMPANY_HOME_PRIMARY_COLLECTIONS,original.COMPANY_HOME_PRIMARY_COLLECTIONS,'do not change source contracts or raw readiness flags');
 const activation=planForegroundRealtimeActivation({requestedNames:changed.getForegroundReadCollections('home',{companyHome:true,primaryHome:true,byTab}),
  activeNames:['companies','employees',...original.COMPANY_HOME_PRIMARY_COLLECTIONS],baselineNames:['companies','employees'],limit:8,retainRecent:false});
 assert.deepEqual(activation.liveNames,[]);assert.deepEqual(activation.overflowNames,[]);
 assert.deepEqual(activation.evictedNames,original.COMPANY_HOME_PRIMARY_COLLECTIONS,'retire histories without taking ownership of the P0 identity listeners');
 assert.equal(plugin.transformIndexHtml('<html/>').tags[0].children,'window.__hdLocalHomeReadModelPilot=true;');
});

// Bundle only this local React fixture into memory; no Vite/native build,
// artifact output, Firebase/emulator connection or network request is made.
const fixtureSource=`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import View,{pilotClock,canonicalPilotClock,pilotLocalDeadline} from './performance/upgrade-20261103/pilots/LocalHomeReadModelView.jsx';
 import {createDashboardPrivacyScope} from './src/utils/dashboardPrivacyScope.js';
 import {createHomePrimarySnapshotIterator} from './src/services/executiveDashboardService.js';
 window.__hdLocalHomeReadModelPilot=true;window.authCallbacks=new Set();window.jobs=[];window.pilotCache={};
 window.canonicalPilotClock=canonicalPilotClock;
 window.pilotLocalDeadline=pilotLocalDeadline;
 window.makeUser=(uid='fiction-owner',epoch=1700000000)=>({uid,epoch,getIdToken:async function(){return 'fiction-'+this.uid+'-'+this.epoch},getIdTokenResult:async function(){return {token:await this.getIdToken(),claims:{auth_time:this.epoch}}}});
 window.pilotAuth={app:{options:{projectId:'demo-hdm-perf-verification'}},currentUser:window.makeUser()};
 window.emitAuth=()=>{for(const callback of window.authCallbacks)callback(window.pilotAuth.currentUser)};
 window.fetch=(url,options)=>new Promise((resolve,reject)=>window.jobs.push({url,options,resolve,reject}));
 window.scopeFor=(changes={})=>createDashboardPrivacyScope({companyId:'fiction-company',currentUser:{id:'owner-record',companyId:'fiction-company'},employee:{id:'owner-record'},
  rolePermissionKey:'owner',sessionId:'app-session-1',rolePermissions:{home:true},rolePermissionActions:{home:{view:true}},isOwnerAccount:true,...changes});
 window.props={privacyScope:window.scopeFor(),company:{id:'fiction-company',name:'Fiction company'},dashboardCache:window.pilotCache,isActive:true,primaryMode:true};
 function Fixture(){const[props,setProps]=useState(window.props);window.update=patch=>flushSync(()=>setProps(old=>(window.props={...old,...patch})));return <View {...props}/>}
 const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(<Fixture/>));window.unmount=()=>flushSync(()=>root.unmount());
 window.response=(changes={})=>{
  const now=Date.now(),clock=pilotClock(now),iterator=createHomePrimarySnapshotIterator({now:new Date(now).toISOString(),employees:[],customers:[],orders:[{id:'fiction-order',date:clock.dayKey,amount:123}],payments:[],expenses:[],cashExpenseRecords:[],payrollCosts:[],debtLedger:[{id:'fiction-customer',debt:456}]});
  let step;do{step=iterator.next()}while(!step.done);const snapshot=step.value;snapshot.generatedAt=new Date(now).toISOString();
  return {state:'current',current:true,reason:'published',projectionVersion:1,capabilities:'four-cards-line-only',snapshot,
   serverTime:now,generatedAt:snapshot.generatedAt,expiresAt:now+60000,scope:{principalId:window.pilotAuth.currentUser.uid,tenantId:window.props.company.id,
    permissionKey:'owner',sessionId:String(window.pilotAuth.currentUser.epoch),...clock},...changes};
 };
 window.finish=(index,changes={},status=200)=>window.jobs[index].resolve({status,ok:status>=200&&status<300,json:async()=>window.response(changes)});
`;

test('actual React pilot commits verified cards and fails closed across grants, sessions, stale replies, denial and cache revalidation',async t=>{
 const bundle=await build({stdin:{contents:fixtureSource,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},
  define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'offline-auth-fixture',setup(build){
   build.onResolve({filter:/^firebase\/auth$/},()=>({path:'auth',namespace:'fixture'}));
   build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getAuth=()=>window.pilotAuth;export const onIdTokenChanged=(auth,callback)=>{window.authCallbacks.add(callback);queueMicrotask(()=>{if(window.authCallbacks.has(callback))callback(auth.currentUser)});return()=>window.authCallbacks.delete(callback)};'}));
  }}]});
 const browser=await chromium.launch(chromiumLaunchOptions());
 const open=async({mockTime=false}={})=>{const page=await browser.newPage({timezoneId:'Asia/Ho_Chi_Minh'});await page.route('**/*',route=>route.abort());
  if(mockTime)await page.clock.install();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setContent('<main data-hd-module="home"><div id="root"></div></main>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.jobs.length===1);return{page,errors,gate:page.locator('[data-hd-home-read-model-ready]')};};
 const ready=page=>page.locator('[data-hd-home-read-model-ready="true"]').waitFor();
 try{
  await t.test('a newly published source with the observed 666ms server lead uses verified server time without changing the business clock',async()=>{
   const{page,gate}=await open();try{
    await page.evaluate(()=>{const body=response(),serverTime=Date.now()+666,generatedAt=new Date(serverTime).toISOString();
     finish(0,{serverTime,generatedAt,expiresAt:serverTime+60000,snapshot:{...body.snapshot,generatedAt}});
    });await page.waitForFunction(()=>document.querySelector('[data-hd-home-read-model-state]').getAttribute('data-hd-home-read-model-state')!=='pending');
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'true');
    assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),'published');
    assert.equal(await page.evaluate(()=>{const entry=pilotCache.homePrimaryProjection;return Date.parse(entry.snapshot.generatedAt)>Date.now()
     &&entry.pilot.localExpiresAt<=entry.pilot.expiresAt&&entry.pilot.localExpiresAt<=Date.now()+60000}),true,'actual source stamp is preserved without extending local TTL');
   }finally{await page.close()}
  });
  await t.test('server lead/lag and full RTT only shorten TTL; invalid clock metadata is unavailable rather than permission denied',async()=>{
   const{page}=await open();try{
    const values=await page.evaluate(()=>{
     const local=Date.now(),ttl=60000,rtt=120;
     return [666,-666].map(skew=>{const serverTime=local+skew,expiresAt=serverTime+ttl;
      return pilotLocalDeadline({serverTime,expiresAt},local,rtt)-local;});
    });assert.deepEqual(values,[59880,59334]);
   }finally{await page.close()}
   for(const kind of['ahead','behind','missing','string']){
    const{page,gate}=await open();try{
     await page.evaluate(kind=>finish(0,{serverTime:kind==='ahead'?Date.now()+6000:kind==='behind'?Date.now()-6000:kind==='string'?String(Date.now()):undefined}),kind);
     await page.locator('[data-hd-home-read-model-state="clock-unavailable"]').waitFor();
     assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');
     assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),null);assert.equal(await page.getByRole('alert').count(),0);
     assert.match(await gate.textContent(),/đồng hồ/);
    }finally{await page.close()}
   }
  });
  await t.test('only a verified current response renders ready cards with the explicit capability contract',async()=>{
   const{page,gate,errors}=await open();try{
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');
    assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),null);
    const request=await page.evaluate(()=>({url:jobs[0].url,body:JSON.parse(jobs[0].options.body),credentials:jobs[0].options.credentials}));
    assert.deepEqual(request,{url:'http://127.0.0.1:5003/home',body:{idToken:'fiction-fiction-owner-1700000000'},credentials:'omit'});
    await page.evaluate(()=>finish(0));await ready(page);
    assert.equal(await gate.getAttribute('data-hd-home-read-model-principal'),'fiction-owner');
    assert.equal(await gate.getAttribute('data-hd-home-read-model-tenant'),'fiction-company');
    assert.equal(await gate.getAttribute('data-hd-home-read-model-capabilities'),'four-cards-line-only');
    assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),'published');
    assert.equal(await page.locator('.business-report-kpi').count(),4);
    assert.match(await page.locator('.business-report-kpi').first().textContent(),/123/);
    assert.equal(await page.locator('.business-report-kpi').first().getAttribute('title'),'Doanh thu: 123 đ','preserve the actual financial title consumed by the native truth oracle');
    assert.equal(await page.getByRole('button',{name:/Doanh thu/}).first().isDisabled(),true);
    assert.match(await page.locator('.business-report-kpi').first().getAttribute('data-hd-qa-unavailable'),/QA/);
    assert.equal(await page.locator('.business-report-kpi:enabled,.business-report-text-action:enabled').count(),0,'unsupported details cannot request histories');
    assert.equal(await page.evaluate(()=>Object.keys(pilotCache).join(',')),'homePrimaryProjection');assert.deepEqual(errors,[]);
   }finally{await page.close()}
  });
  await t.test('same-scope RAM retention is labelled pending until another real response; a transient failure retains it without readiness',async()=>{
   const{page,gate}=await open();try{
    await page.evaluate(()=>finish(0));await ready(page);
    await page.getByRole('button',{name:'Đối chiếu lại',exact:true}).click();await page.waitForFunction(()=>jobs.length===2);
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');assert.equal(await page.locator('.business-report-kpi').count(),4);
    assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),null,'retained RAM is never classified as a new publication');
    assert.match(await gate.textContent(),/RAM/);
    await page.evaluate(()=>jobs[1].reject(Error('offline')));await page.waitForTimeout(20);
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');assert.equal(await page.locator('.business-report-kpi').count(),4);
    await page.getByRole('button',{name:'Đối chiếu lại',exact:true}).click();await page.waitForFunction(()=>jobs.length===3);
    await page.evaluate(()=>finish(2));await ready(page);
   }finally{await page.close()}
  });
  await t.test('only fully verified current responses expose the exact API publication/revalidation/replay reason',async()=>{
   const{page,gate}=await open();try{
    for(const[index,reason]of['published','verified-source-revisions','idempotent-replay'].entries()){
     if(index){await page.getByRole('button',{name:'Đối chiếu lại',exact:true}).click();await page.waitForFunction(count=>jobs.length===count,index+1);
      assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),null);}
     await page.evaluate(({index,reason})=>finish(index,{reason}),{index,reason});await ready(page);
     assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),reason);
     assert.equal(await page.evaluate(()=>pilotCache.homePrimaryProjection.pilot.resultReason),reason);
    }
    await page.getByRole('button',{name:'Đối chiếu lại',exact:true}).click();await page.waitForFunction(()=>jobs.length===4);
    await page.evaluate(()=>finish(3,{reason:'published',scope:{...response().scope,tenantId:'wrong-company'}}));await page.getByRole('alert').waitFor();
    assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),null,'a claimed publication with failed scope verification exposes no result marker');
   }finally{await page.close()}
  });
  await t.test('Vietnam aliases require a proven matching day and -420 offset before canonicalization',async()=>{
   const{page}=await open();try{
    const checks=await page.evaluate(()=>{
     const now=Date.now(),clock=response().scope,accepted=canonicalPilotClock({...clock,timeZone:'Asia/Saigon'},now).timeZone;
     const rejected=[{timeZone:'Asia/Bangkok'},{timezoneOffsetMinutes:0},{dayKey:'2000-01-01'}].map(patch=>{try{canonicalPilotClock({...clock,...patch},now);return false}catch{return true}});
     return{accepted,rejected};
    });assert.deepEqual(checks,{accepted:'Asia/Ho_Chi_Minh',rejected:[true,true,true]});
    await page.evaluate(()=>finish(0,{scope:{...response().scope,timeZone:'Asia/Saigon'}}));await ready(page);
   }finally{await page.close()}
  });
  await t.test('denial removes previously visible cards and RAM entry rather than presenting a complete zero',async()=>{
   const{page,gate}=await open();try{
    await page.evaluate(()=>finish(0));await ready(page);await page.getByRole('button',{name:'Đối chiếu lại',exact:true}).click();await page.waitForFunction(()=>jobs.length===2);
    await page.evaluate(()=>finish(1,{},403));await page.getByRole('alert').waitFor();
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');assert.equal(await page.locator('.business-report-kpi').count(),0);
    assert.equal(await page.evaluate(()=>pilotCache.homePrimaryProjection===undefined),true);
   }finally{await page.close()}
  });
  await t.test('grant and App session changes synchronously hide retained data; queued old replies cannot publish',async()=>{
   const{page,gate}=await open();try{
    await page.evaluate(()=>finish(0));await ready(page);
    await page.evaluate(()=>update({privacyScope:scopeFor({rolePermissions:{home:false}})}));await page.waitForFunction(()=>jobs.length===2);
    assert.equal(await page.locator('.business-report-kpi').count(),0);
    await page.evaluate(()=>update({privacyScope:scopeFor({sessionId:'app-session-2'})}));await page.waitForFunction(()=>jobs.length===3);
    assert.equal(await page.evaluate(()=>jobs[1].options.signal.aborted),true);
    await page.evaluate(()=>finish(1));await page.waitForTimeout(20);assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');
    assert.equal(await page.locator('.business-report-kpi').count(),0);await page.evaluate(()=>finish(2));await ready(page);
   }finally{await page.close()}
  });
  await t.test('same UID with a new verified auth_time cannot reuse prior-session RAM or publish old responses',async()=>{
   const{page,gate}=await open();try{
    await page.evaluate(()=>finish(0));await ready(page);
    await page.evaluate(()=>{pilotAuth.currentUser.epoch++;emitAuth()});await page.waitForFunction(()=>jobs.length===2);
    assert.equal(await page.locator('.business-report-kpi').count(),0);
    await page.evaluate(()=>finish(1,{scope:{...response().scope,sessionId:'1700000000'}}));await page.getByRole('alert').waitFor();
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');
   }finally{await page.close()}
  });
  await t.test('wrong actor/tenant, stale time/API/capability, cached and malformed payloads never become ready',async()=>{
   for(const kind of['principal','tenant','permission','day','zone','expired','future','version','string-version','string-expiry','capability','cached','malformed']){
    const{page,gate}=await open();try{
     await page.evaluate(kind=>{const body=response();let changes;
      if(['principal','tenant','permission','day','zone'].includes(kind)){
       const field={principal:'principalId',tenant:'tenantId',permission:'permissionKey',day:'dayKey',zone:'timeZone'}[kind];changes={scope:{...body.scope,[field]:'wrong'}};
      }else changes=kind==='expired'?{expiresAt:Date.now()-1}:kind==='future'?{generatedAt:new Date(Date.now()+60000).toISOString()}:
       kind==='version'?{projectionVersion:2}:kind==='string-version'?{projectionVersion:'1'}:kind==='string-expiry'?{expiresAt:String(Date.now()+60000)}:
       kind==='capability'?{capabilities:'full'}:kind==='cached'?{state:'cached',current:false}:{snapshot:{kind:'home-primary-v1',generatedAt:body.generatedAt,finance:{}}};
      finish(0,changes);
     },kind);await page.locator(kind==='cached'?'[data-hd-home-read-model-state="unavailable"]':'[data-hd-home-read-model-state="denied"]').waitFor();
     assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false',kind);
     assert.equal(await gate.getAttribute('data-hd-home-read-model-result'),null,kind);
     assert.equal(await page.locator('.business-report-kpi').count(),0,kind);
    }finally{await page.close()}
   }
  });
  await t.test('unopened/hidden Home cancels requests and cannot publish; UID/tenant boundaries hide previous cards',async()=>{
   const{page,gate}=await open();try{
    await page.evaluate(()=>update({isActive:false}));assert.equal(await page.evaluate(()=>jobs[0].options.signal.aborted),true);
    await page.evaluate(()=>finish(0));await page.waitForTimeout(20);assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');
    assert.equal(await page.evaluate(()=>jobs.length),1);
    await page.evaluate(()=>update({isActive:true}));await page.waitForFunction(()=>jobs.length===2);await page.evaluate(()=>finish(1));await ready(page);
    await page.evaluate(()=>{pilotAuth.currentUser=makeUser('fiction-other');emitAuth()});await page.waitForFunction(()=>jobs.length===3);
    assert.equal(await page.locator('.business-report-kpi').count(),0);
    await page.evaluate(()=>update({company:{id:'fiction-other-company'},privacyScope:scopeFor({companyId:'fiction-other-company'})}));await page.waitForFunction(()=>jobs.length===4);
    await page.evaluate(()=>finish(2));await page.waitForTimeout(20);assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');
    await page.evaluate(()=>unmount());assert.equal(await page.evaluate(()=>jobs.every(job=>job.options.signal.aborted)),true);
   }finally{await page.close()}
  });
  await t.test('actual shell route changes cancel reads even when the retained Home props stay frozen',async()=>{
   const{page,gate}=await open();try{
    await page.evaluate(()=>document.querySelector('main').setAttribute('data-hd-module','orders'));
    await page.waitForFunction(()=>jobs[0].options.signal.aborted);
    await page.evaluate(()=>finish(0));await page.waitForTimeout(20);
    assert.equal(await page.evaluate(()=>props.isActive),true,'simulate the existing RetainedReadOnlyHome prop freeze');
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');assert.equal(await page.locator('.business-report-kpi').count(),0);
    assert.equal(await page.evaluate(()=>jobs.length),1);
    await page.evaluate(()=>document.querySelector('main').setAttribute('data-hd-module','home'));await page.waitForFunction(()=>jobs.length===2);
    await page.evaluate(()=>finish(1));await ready(page);
   }finally{await page.close()}
  });
  await t.test('a bounded hung revalidation and an expired response retire readiness while labelling retained cards',async()=>{
   const{page,gate}=await open({mockTime:true});try{
    await page.evaluate(()=>finish(0));await ready(page);
    await page.getByRole('button',{name:'Đối chiếu lại',exact:true}).click();await page.waitForFunction(()=>jobs.length===2);
    await page.clock.runFor(10001);await page.locator('[data-hd-home-read-model-state="unavailable"]').waitFor();
    assert.equal(await page.evaluate(()=>jobs[1].options.signal.aborted),true);
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');assert.equal(await page.locator('.business-report-kpi').count(),4);
    await page.evaluate(()=>finish(1));assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false','late ignored-abort response cannot restore freshness');
    await page.getByRole('button',{name:'Đối chiếu lại',exact:true}).click();await page.waitForFunction(()=>jobs.length===3);
    await page.evaluate(()=>finish(2));await ready(page);await page.clock.runFor(60001);
    await page.locator('[data-hd-home-read-model-state="pending"]').waitFor();
    assert.equal(await gate.getAttribute('data-hd-home-read-model-ready'),'false');assert.equal(await page.locator('.business-report-kpi').count(),4);
   }finally{await page.close()}
  });
 }finally{await browser.close()}
});
