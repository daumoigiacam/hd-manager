import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTask,completeTraceIntervals} from '../performance/phase2-verification/trace-analysis.mjs';
test('trace phase attribution unions nested intervals without summing child CPU or fabricating missing tdur',()=>{
 const task={pid:1,tid:2,ts:0,dur:100000};
 const events=[{name:'FunctionCall',ts:0,dur:100000},{name:'FunctionCall',ts:1000,dur:99000},{name:'Layout',ts:20000,dur:30000},{name:'UpdateLayoutTree',ts:25000,dur:10000},{name:'Paint',ts:50000,dur:10000}].map(e=>({...e,pid:1,tid:2,ph:'X'}));
 const value=summarizeTask(task,events);assert.equal(value.layoutWallMs,30);assert.equal(value.paintWallMs,10);assert.equal(value.scriptingExclusiveWallMs,60);assert.equal(value.unclassifiedWallMs,0);assert.equal(value.threadCpuMs,null);
});
test('legacy Chromium nested B/E intervals retain thread identity and do not invent missing ends',()=>{
 const events=completeTraceIntervals([
  {pid:1,tid:2,ph:'B',name:'FunctionCall',ts:0,tts:0},
  {pid:1,tid:3,ph:'B',name:'Layout',ts:10},
  {pid:1,tid:2,ph:'B',name:'Layout',ts:20000,tts:5000},
  {pid:1,tid:2,ph:'E',ts:50000,tts:10000},
  {pid:1,tid:2,ph:'E',ts:100000,tts:30000},
  {pid:1,tid:9,ph:'E',ts:100000},
 ]);
 const summary=summarizeTask({pid:1,tid:2,ts:0,dur:100000},events);
 assert.equal(summary.layoutWallMs,30);assert.equal(summary.scriptingExclusiveWallMs,70);
 assert.equal(events.filter(e=>e.ph==='X').length,2);assert.equal(summary.threadCpuMs,null);
});
