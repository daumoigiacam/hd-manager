import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSharePagesSequentially} from '../src/utils/sharePagePipeline.js';

test('multi-page share keeps one bitmap live and retains page order and every byte',async()=>{
 let live=0,maxLive=0;const events=[];
 const actual=await renderSharePagesSequentially(['first','second','third'],{
  yieldTask:async()=>events.push('yield'),
  render:(page,meta)=>{live++;maxLive=Math.max(live,maxLive);events.push(['render',page,meta]);return{page,height:100,get width(){return 100},set width(value){if(value===0)live--}}},
  encode:async canvas=>{await Promise.resolve();events.push(['encode',canvas.page]);return new Blob([canvas.page])},
 });
 assert.equal(maxLive,1);assert.equal(live,0);
 assert.deepEqual(await Promise.all(actual.map(b=>b.text())),['first','second','third']);
 assert.deepEqual(events.filter(Array.isArray).filter(e=>e[0]==='render').map(e=>e[2]),[{pageNumber:1,totalPages:3},{pageNumber:2,totalPages:3},{pageNumber:3,totalPages:3}]);
 assert.equal(events.filter(e=>e==='yield').length,3);
});
test('failed encoding frees bitmap and rejects the complete set instead of caching partial pages',async()=>{
 const canvases=[];let index=0;
 await assert.rejects(renderSharePagesSequentially([1,2,3],{yieldTask:async()=>{},render:()=>{const canvas={width:100,height:100};canvases.push(canvas);return canvas},encode:async()=>{if(++index===2)throw Error('disk unavailable');return new Blob(['valid'])}}),/disk unavailable/);
 assert.equal(canvases.length,2);assert.ok(canvases.every(c=>c.width===0&&c.height===0));
});
test('cancellation after in-flight encoding releases bitmap and never starts another page',async()=>{
 const abort=new AbortController(),canvases=[];
 await assert.rejects(renderSharePagesSequentially([1,2],{signal:abort.signal,yieldTask:async()=>{},render:()=>{const canvas={width:100,height:100};canvases.push(canvas);return canvas},encode:async()=>{abort.abort();return new Blob(['valid'])}}),{name:'AbortError'});
 assert.equal(canvases.length,1);assert.equal(canvases[0].width,0);assert.equal(canvases[0].height,0);
});
test('empty image is never accepted as a complete page',async()=>{
 const canvas={width:10,height:20};
 await assert.rejects(renderSharePagesSequentially([1],{yieldTask:async()=>{},render:()=>canvas,encode:()=>new Blob([])}),/encoding failed/);
 assert.deepEqual(canvas,{width:0,height:0});
});
