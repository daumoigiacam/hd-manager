import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { appObject, appFunction } from './helpers/app-source-function.mjs';

test('actual dashboard loader memoization and deferred guard retain current tenant, period and genuine busy state', { timeout: 30000 }, async () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const node = appObject('handleLoadPayrollPeriodSnapshots');
  const initializer = source.slice(node.start, node.end);
  const start = source.indexOf('function MemoizedExecutiveDashboardView(props) {');
  const end = source.indexOf('\nfunction ExecutivePeriodSummaryCard', start);
  assert.ok(start > 0 && end > start);
  const wrapper = source.slice(start, end);
  const output = await build({ stdin: { contents: `
    import React,{useCallback,useState,useEffect,startTransition} from 'react';
    import {createRoot} from 'react-dom/client';
    const root=createRoot(document.getElementById('root'));
    const isVpsStagingMode=false,db={},appId='fixture';
    const pendingFirebaseWritesRef={current:[]};
    const normalizePayrollMonthKey=m=>m;
    const buildPayrollPeriodId=(c,m)=>c+':'+m;
    const getLockedPayrollPeriod=(rows,c,m)=>rows.find(p=>p.companyId===c && p.monthKey===m);
    const collection=(_, ...parts)=>({name:parts[parts.length-1]});
    const firebaseWhere=(field,op,value)=>({field,value});
    const firebaseQuery=(base,...filters)=>({...base,filters});
    const withTimeout=p=>p;
    const applyPayrollAdjustmentsToSnapshots=rows=>rows;
    const auditPayrollHistoricalData=({snapshots})=>({checked:snapshots.length});
    const getFriendlyFirebaseErrorMessage=(_,message)=>message;
    window.queryCalls=[];window.loaderCommits=[];
    const getDocs=async query=>{
      window.queryCalls.push(query);
      const c=query.filters.find(f=>f.field==='companyId').value;
      const period=query.filters.find(f=>f.field==='periodId').value;
      const rows=query.name==='payrollSnapshots' ? [
        {id:'s1',companyId:c,periodId:period,amount:100},
        {id:'s2',companyId:c,periodId:period,amount:200},
        {id:'foreign',companyId:'foreign',periodId:period,amount:999}
      ]:[];
      return {docs:rows.map(row=>({id:row.id,data:()=>row}))};
    };
    const users={a:{uid:'fixture-a'},b:{uid:'fixture-b'}};
    const periods={a:[{companyId:'a',monthKey:'2026-10',snapshotIds:['s1']}],
      b:[{companyId:'b',monthKey:'2026-10',snapshotIds:['s2']}],
      changed:[{companyId:'a',monthKey:'2026-10',snapshotIds:['s2']}]};
    function LoaderHarness({user,company,period,mark}){
      const firebaseUser=user?users[user]:null,myCompanyId=company,rawPayrollPeriods=periods[period];
      const handler=${initializer};
      useEffect(()=>{window.loaderCommits.push(handler);window.handler=handler;window.loaderMark=mark},[handler,mark]);
      return null;
    }
    window.renderLoader=(user,company,period,mark)=>root.render(<LoaderHarness {...{user,company,period,mark}}/>);
    window.callLoader=()=>window.handler({monthKey:'2026-10'});
    window.pending=pendingFirebaseWritesRef;
    const areExecutiveDashboardPropsEqual=${appFunction('areExecutiveDashboardPropsEqual').toString()};
    window.reportRenders=0;window.frameCallbacks=new Map();let sequence=0;
    window.requestAnimationFrame=callback=>{window.frameCallbacks.set(++sequence,callback);return sequence};
    window.cancelAnimationFrame=id=>window.frameCallbacks.delete(id);
    window.stepFrame=()=>{const tasks=[...window.frameCallbacks.values()];window.frameCallbacks.clear();tasks.forEach(fn=>fn(performance.now()))};
    const RetainedExecutiveDashboardView=React.memo(function Report(p){window.reportRenders++;return <div id="report">{p.company.id+':'+p.orders[0].id}</div>},areExecutiveDashboardPropsEqual);
    ${wrapper}
    const base={isActive:true,company:{id:'a'},employee:{id:'employee-a'},orders:[{id:'one'}],dashboardCache:{},onLoadPayrollPeriodSnapshots:()=>{},setActiveTab:()=>{}};
    const changedOrders=[{id:'two'}],otherCompany={id:'b'};
    function WrapperHost({value,mark}){useEffect(()=>{window.wrapperMark=mark},[mark]);return <MemoizedExecutiveDashboardView {...value}/>}
    window.renderWrapper=(scenario,mark)=>{
      const value={...base};
      if(scenario==='changed')value.orders=changedOrders;
      if(scenario==='scope')value.company=otherCompany;
      if(scenario==='hidden'){value.isActive=false;value.orders=changedOrders;}
      root.render(<WrapperHost value={value} mark={mark}/>);
    };
  `, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', jsx: 'automatic' });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'), headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: output.outputFiles[0].text });
    const loader = async (user, company, period, mark) => {
      await page.evaluate(args => window.renderLoader(...args), [user, company, period, mark]);
      await page.waitForFunction(m => window.loaderMark === m, mark, { polling: 10 });
    };
    await loader('a', 'a', 'a', 1);
    await loader('a', 'a', 'a', 2);
    assert.equal(await page.evaluate(() => window.loaderCommits[0] === window.loaderCommits[1]), true);
    await page.evaluate(() => { window.pending.current=[{collectionName:'payrollSnapshots',documentId:'s1',payload:{companyId:'a',periodId:'a:2026-10',amount:250}}]; });
    assert.deepEqual((await page.evaluate(() => window.callLoader())).snapshots.map(row => [row.id, row.amount]), [['s1', 250]]);
    await loader('a', 'a', 'changed', 3);
    assert.equal(await page.evaluate(() => window.loaderCommits[1] === window.loaderCommits[2]), false);
    assert.deepEqual((await page.evaluate(() => window.callLoader())).snapshots.map(row => row.id), ['s2']);
    await loader('b', 'b', 'b', 4);
    assert.deepEqual((await page.evaluate(() => window.callLoader())).snapshots.map(row => [row.companyId, row.id]), [['b', 's2']]);
    await loader(null, 'b', 'b', 5);
    const before = await page.evaluate(() => window.queryCalls.length);
    assert.equal((await page.evaluate(() => window.callLoader())).success, false);
    assert.equal(await page.evaluate(() => window.queryCalls.length), before);

    const wrapperRender = async (scenario, mark) => {
      await page.evaluate(args => window.renderWrapper(...args), [scenario, mark]);
      await page.waitForFunction(m => window.wrapperMark === m, mark, { polling: 10 });
    };
    await wrapperRender('base', 1);
    const renders = await page.evaluate(() => window.reportRenders);
    await wrapperRender('base', 2);
    assert.equal(await page.locator('[aria-busy]').getAttribute('aria-busy'), 'false');
    assert.equal(await page.evaluate(() => window.frameCallbacks.size), 0, 'fresh props object with equal data does not schedule a fake refresh');
    assert.equal(await page.evaluate(() => window.reportRenders), renders);
    await wrapperRender('changed', 3);
    assert.equal(await page.locator('[aria-busy]').getAttribute('aria-busy'), 'true', 'genuine new data stays busy');
    assert.equal(await page.locator('#report').textContent(), 'a:one');
    await page.evaluate(() => { window.stepFrame(); window.stepFrame(); });
    await page.waitForFunction(() => document.querySelector('[aria-busy]').getAttribute('aria-busy') === 'false', null, { polling: 10 });
    assert.equal(await page.locator('#report').textContent(), 'a:two');
    await wrapperRender('hidden', 4);
    assert.equal(await page.evaluate(() => window.frameCallbacks.size), 0);
    await wrapperRender('scope', 5);
    assert.equal(await page.locator('#report').textContent(), 'b:one', 'scope changes never display a deferred prior-tenant report');
    assert.equal(await page.locator('[aria-busy]').getAttribute('aria-busy'), 'false');
  } finally { await browser.close(); }
});
