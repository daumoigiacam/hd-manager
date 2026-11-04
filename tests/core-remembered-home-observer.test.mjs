import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {parse} from '@babel/parser';
import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
const tree=parse(readFileSync('scripts/measure-remembered-session-startup.mjs','utf8'),{sourceType:'module'});let source;
function walk(node){if(!node||typeof node!=='object')return;
 if(node.type==='VariableDeclarator'&&node.id.name==='source'&&node.init.type==='TemplateLiteral'){
  assert.equal(node.init.expressions.length,0);source=node.init.quasis[0].value.cooked;
 }
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
}
walk(tree);assert(source);
test('remembered startup cannot certify a missing contract, wrong tenant or an unfinished personal Home calculation',{timeout:30000},async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.setContent('<main data-hd-module="home"><div class="hd-staff-greeting-surface">Synthetic Home</div></main>');
  await page.addScriptTag({content:source});
  assert.equal(await page.evaluate(()=>window.__hdRememberedStartup.state.homeServerConfirmedAt),null);
  await page.evaluate(()=>{
   const m=document.querySelector('main');window.props={currentUser:{companyId:'fixture-a'},homeReadinessCollections:['attendance','orders'],
    serverConfirmedCollectionState:{tenantId:'fixture-b',collections:{companies:true,employees:true,attendance:true,orders:true}}};
   m.__reactFiber$fixture={memoizedProps:window.props};
  });
  await page.waitForFunction(()=>window.__hdRememberedStartup.state.requiredHome!==null);
  assert.equal(await page.evaluate(()=>window.__hdRememberedStartup.state.homeServerConfirmedAt),null);
  await page.evaluate(()=>{window.props.serverConfirmedCollectionState.tenantId='fixture-a';const busy=document.createElement('div');busy.setAttribute('data-hd-module-loading','');busy.setAttribute('aria-busy','true');document.querySelector('main').append(busy)});
  await page.waitForFunction(()=>window.__hdRememberedStartup.state.homeServerConfirmedAt!==null);
  assert.equal(await page.evaluate(()=>window.__hdRememberedStartup.state.homeReadyTwoFramesAt),null);
  await page.evaluate(()=>document.querySelector('[data-hd-module-loading]').remove());
  await page.waitForFunction(()=>window.__hdRememberedStartup.state.homeReadyTwoFramesAt!==null);
  const result=await page.evaluate(()=>{window.__hdRememberedStartup.restore('test-complete');return window.__hdRememberedStartup.state});
  assert.deepEqual(result.requiredHome,['companies','employees','attendance','orders']);assert.deepEqual(result.homeServerMissing,[]);
  assert(result.homeReadyTwoFramesAt>=result.homeCommittedReportReadyAt);assert.equal(result.observerVersion,4);
 }finally{await browser.close()}
});
