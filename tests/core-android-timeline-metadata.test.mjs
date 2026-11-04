import test from 'node:test';import assert from 'node:assert/strict';
import {readMainNavigationTimeline} from '../scripts/helpers/android-timeline-metadata.mjs';
test('timeline uses a controlled main marker, joins B/E and X spans and excludes worker/trace secrets',()=>{
 const e=(name,ph,ts,patch={})=>({name,ph,ts,pid:10,tid:20,...patch});
 const input=[e('hd-navigation-timeline-root','R',0),e('RunTask','X',1,{dur:200000,tdur:150000}),
  e('RunTask','X',5,{dur:170000}),e('FunctionCall','B',10,{tts:3,args:{data:{scriptName:'https://localhost/assets/app-good.js',scriptLine:12,private:'must not escape'}}}),
  e('MajorGC','B',20,{tts:5}),e('', 'E',20020,{tts:10005}),e('', 'E',100010,{tts:80003}),
  e('thread_name','M',0,{tid:30,args:{name:'DedicatedWorker thread'}}),e('RunTask','X',0,{tid:30,dur:900000,tdur:800000,args:{private:'worker secret'}}),
  e('FunctionCall','X',1,{tid:30,dur:500000,args:{data:{url:'https://localhost/assets/calculation-good.js',lineNumber:8}}}),
  e('FunctionCall','X',200001,{dur:1,args:{data:{scriptName:'https://private.example/secret'}}})];
 const result=readMainNavigationTimeline(input);assert.equal(result.pid,10);assert.equal(result.tid,20);assert.equal(result.longTasks.length,1);
 const fn=result.events.find(e=>e.name==='FunctionCall');assert.equal(fn.dur,100000);assert.equal(fn.tdur,80000);assert.deepEqual(fn.source,{asset:'app-good.js',scriptLine:12});
 assert.equal(result.events.find(e=>e.name==='MajorGC').dur,20000);assert.equal(result.unclosedSpans,0);
 assert.equal(result.workers.length,1);assert.equal(result.workers[0].totalTaskCpuMs,800);
 assert.equal(result.workers[0].longTasks[0].children[0].source.asset,'calculation-good.js');
 assert.doesNotMatch(JSON.stringify(result),/private|secret|args/);
 assert.throws(()=>readMainNavigationTimeline([]),/marker/);assert.throws(()=>readMainNavigationTimeline([input[0],input[0]]),/marker/);
});
