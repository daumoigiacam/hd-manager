import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {parse} from '@babel/parser';
import {chromium} from 'playwright-core';import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';
const tree=parse(readFileSync('scripts/diagnose-startup-source-timing.mjs','utf8'),{sourceType:'module'});let source;
function walk(node){if(!node||typeof node!=='object')return;
 if(node.type==='VariableDeclarator'&&node.id.name==='source'&&node.init.type==='TemplateLiteral'){assert.equal(node.init.expressions.length,0);source=node.init.quasis[0].value.cooked}
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
}walk(tree);assert(source);
test('source diagnostic restoration removes worker listeners and wrappers rather than retaining live profiling callbacks',{timeout:30000},async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions());try{
  const page=await browser.newPage();await page.setContent('<div>Isolated probe cleanup</div>');
  await page.evaluate(()=>{
   window.FixtureWorker=class {constructor(){this.listeners=new Set()}postMessage(){}addEventListener(_,fn){this.listeners.add(fn)}removeEventListener(_,fn){this.listeners.delete(fn)}emit(data){this.listeners.forEach(fn=>fn({data}))}};
   window.Worker=window.FixtureWorker;window.originalFixtureFetch=window.fetch;
  });
  await page.addScriptTag({content:source});
  const result=await page.evaluate(()=>{
   const w=new Worker('firestoreReadWorker-fixture.js'),probe=window.__hdSourceTiming;
   w.postMessage({type:'subscribe',collectionName:'orders',streamId:'fixture'});w.emit({type:'chunk',streamId:'fixture',rows:[{},{}]});
   const before={listeners:w.listeners.size,rows:probe.read().streams[0].rows};probe.restore();
   w.emit({type:'chunk',streamId:'fixture',rows:[{}]});
   return{before,after:{listeners:w.listeners.size,rows:probe.read().streams[0].rows,workerRestored:window.Worker===window.FixtureWorker,
    postRestored:w.postMessage===window.FixtureWorker.prototype.postMessage,fetchRestored:window.fetch===window.originalFixtureFetch,removed:window.__hdSourceTiming===undefined}};
  });
  assert.deepEqual(result,{before:{listeners:1,rows:2},after:{listeners:0,rows:2,workerRestored:true,postRestored:true,fetchRestored:true,removed:true}});
 }finally{await browser.close()}
});
