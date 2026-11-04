import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './helpers/chromium-launch-options.mjs';

test('legacy Blob readers preserve native behavior, exact binary and UTF-8 without overwriting available APIs',async()=>{
 const source=await fs.readFile('src/services/legacyRuntime.js','utf8');
 const browser=await chromium.launch(chromiumLaunchOptions());
 try{
  const page=await browser.newPage();await page.route('**/*',route=>route.abort());await page.setContent('<title>Legacy Blob compatibility</title>');
  const result=await page.evaluate(async source=>{
   const bytes=new Uint8Array([0,255,128,13,10,239,187,191,225,187,135]);
   const fixtures=[new Blob([bytes]),new Blob(['Tiếng Việt · € 😀']),new Blob([new Uint8Array([239,187,191,65])]),new Blob([new Uint8Array([255,195,40])]),new Blob([])];
   const nativeArrayBuffer=Blob.prototype.arrayBuffer,nativeText=Blob.prototype.text;
   const expected=await Promise.all(fixtures.map(async blob=>({bytes:Array.from(new Uint8Array(await nativeArrayBuffer.call(blob))),text:await nativeText.call(blob)})));
   (0,eval)(source);const nativeRetained=Blob.prototype.arrayBuffer===nativeArrayBuffer&&Blob.prototype.text===nativeText;
   delete Blob.prototype.arrayBuffer;delete Blob.prototype.text;(0,eval)(source);
   const actual=await Promise.all(fixtures.map(async blob=>({bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),text:await blob.text()})));
   let invalidRejected=false;try{await Blob.prototype.arrayBuffer.call({})}catch{invalidRejected=true}
   const descriptors=['arrayBuffer','text'].map(key=>{const d=Object.getOwnPropertyDescriptor(Blob.prototype,key);return{writable:d.writable,enumerable:d.enumerable,configurable:d.configurable}});
   return{expected,actual,nativeRetained,invalidRejected,descriptors};
  },source);
  assert.deepEqual(result.actual,result.expected);assert.equal(result.nativeRetained,true);assert.equal(result.invalidRejected,true);
  assert.ok(result.descriptors.every(d=>d.writable&&d.configurable&&!d.enumerable));
 }finally{await browser.close()}
});
