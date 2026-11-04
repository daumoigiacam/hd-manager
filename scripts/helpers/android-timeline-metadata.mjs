const names=new Set(['RunTask','ThreadControllerImpl::RunTask','EventDispatch','FunctionCall','UpdateLayoutTree','Layout','Paint','MinorGC','MajorGC','TimerFire','FireAnimationFrame']);
const marker='hd-navigation-timeline-root';
function readThreadTimeline(raw,pid,tid){
 const stack=[],events=[];
 const admit=(e,dur,tdur)=>{
  if(!names.has(e.name)||!Number.isFinite(dur)||dur<0)return;
  const type=e.name==='EventDispatch'&&e.args?.data?.type;
  const call=e.name==='FunctionCall'&&e.args?.data;
  const url=call&&(call.scriptName||call.url),match=typeof url==='string'&&/^https:\/\/localhost\/assets\/([A-Za-z0-9_.-]+\.js)$/.exec(url);
  const site=call&&{scriptLine:call.scriptLine??call.lineNumber,scriptColumn:call.scriptColumn??call.columnNumber};
  const source=match?{asset:match[1],...Object.fromEntries(['scriptLine','scriptColumn'].filter(k=>Number.isSafeInteger(site[k])&&site[k]>=0).map(k=>[k,site[k]]))}:null;
  events.push({name:e.name,pid,tid,ts:e.ts,dur,...(Number.isFinite(tdur)&&tdur>=0?{tdur}:{}),
   ...(typeof type==='string'&&/^[A-Za-z]{1,30}$/.test(type)?{eventType:type}:{}),...(source?{source}:{})});
 };
 for(const e of raw){
  if(e.pid!==pid||e.tid!==tid)continue;
  if(e.ph==='B')stack.push(e);
  else if(e.ph==='E'){
   const start=stack.pop();if(start)admit(start,e.ts-start.ts,Number.isFinite(e.tts)&&Number.isFinite(start.tts)?e.tts-start.tts:undefined);
  }else if(e.ph==='X')admit(e,e.dur,e.tdur);
 }
 // Trace streams can repeat task names for nested native message pumping. Keep
 // only outer RunTask spans when counting, while retaining nested metadata.
 const tasks=events.filter(e=>e.name==='RunTask').sort((a,b)=>a.ts-b.ts||b.dur-a.dur),outer=[];
 for(const e of tasks){const previous=outer.at(-1);if(!previous||e.ts>=previous.ts+previous.dur)outer.push(e)}
 const longTasks=outer.filter(e=>e.dur>=100000).sort((a,b)=>b.dur-a.dur).map(task=>({...task,
  children:events.filter(e=>e!==task&&e.name!=='RunTask'&&e.name!=='ThreadControllerImpl::RunTask'&&e.ts>=task.ts&&e.ts+e.dur<=task.ts+task.dur)
   .sort((a,b)=>b.dur-a.dur).slice(0,12)}));
 return {pid,tid,events,longTasks,unclosedSpans:stack.length,outerTasks:outer};
}
export function readMainNavigationTimeline(raw){
 const marks=raw.filter(e=>e.name===marker&&Number.isSafeInteger(e.pid)&&Number.isSafeInteger(e.tid));
 if(marks.length!==1)throw Error('Exactly one controlled renderer-main marker required.');
 const {pid,tid}=marks[0],{outerTasks:ignored,...main}=readThreadTimeline(raw,pid,tid);
 const workerIds=[...new Set(raw.filter(e=>e.ph==='M'&&e.name==='thread_name'&&e.pid===pid&&e.tid!==tid
  &&/^(?:DedicatedWorker(?: thread)?|WorkerThread(?: ?\d+)?)$/.test(e.args?.name||'')).map(e=>e.tid))];
 if(workerIds.length>16)throw Error('Worker diagnostic thread cap exceeded.');
 const workers=workerIds.map(workerId=>{
  const timeline=readThreadTimeline(raw,pid,workerId),measured=timeline.outerTasks.filter(t=>Number.isFinite(t.tdur));
  return {tid:workerId,outerTaskCount:timeline.outerTasks.length,cpuMeasuredTaskCount:measured.length,
   totalTaskCpuMs:measured.reduce((sum,t)=>sum+t.tdur/1000,0),longTasks:timeline.longTasks.slice(0,8),unclosedSpans:timeline.unclosedSpans};
 });
 return {...main,workers};
}
