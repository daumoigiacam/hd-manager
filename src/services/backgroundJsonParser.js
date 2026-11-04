const aborted=()=>Object.assign(new Error('JSON response decoding cancelled.'),{name:'AbortError'});
const invalid=()=>new SyntaxError('Invalid JSON response.');

export function createBackgroundJsonParser({
  workerFactory=()=>new Worker(new URL('./jsonParseWorker.js',import.meta.url)),
  fallbackParse=JSON.parse,timeoutMs=15000,idleMs=30000,
}={}) {
  let worker=null,sequence=0,idleTimer=null,closed=false,ackScheduler=null;
  const jobs=new Map();
  const scheduleIdle=()=>{
    clearTimeout(idleTimer);
    if(!jobs.size && worker)idleTimer=setTimeout(()=>{if(!jobs.size){worker?.terminate();worker=null}},idleMs);
  };
  const finish=(job,error,value)=>{
    if(!jobs.delete(job.id))return;
    clearTimeout(job.timer);clearTimeout(job.ackTimer);job.signal?.removeEventListener('abort',job.abort);
    if(error && job.worker===worker)try{worker?.postMessage({type:'cancel-json',id:job.id})}catch{/* The worker may already be unavailable. */}
    job.text=null;job.value=null;
    if(error)job.reject(error);else job.resolve(value);
    if(!jobs.size){ackScheduler?.close();ackScheduler=null;}
    scheduleIdle();
  };
  const fallback=job=>{
    if(!jobs.has(job.id)||job.fallingBack)return;
    job.fallingBack=true;clearTimeout(job.timer);
    // Older hosts retain a bounded-page fallback, after the current input task.
    job.timer=setTimeout(()=>{
      if(!jobs.has(job.id))return;
      if(job.signal?.aborted){finish(job,aborted());return;}
      try {finish(job,null,fallbackParse(job.text));}catch {finish(job,invalid());}
    },0);
  };
  const breakWorker=current=>{
    if(worker!==current)return;
    current.terminate();worker=null;
    for(const job of jobs.values())if(job.worker===current)fallback(job);
  };
  const getWorker=()=>{
    if(worker)return worker;
    const current=workerFactory();
    current.onmessage=event=>{
      if(worker!==current)return;
      const message=event.data,job=jobs.get(message?.id);
      if(!job || job.worker!==current || job.fallingBack)return;
      if(message.type==='parsed-json'){
        if(job.value || Array.isArray(message.value))finish(job,invalid());
        else finish(job,null,message.value);
      } else if(message.type==='parsed-json-start'){
        if(job.value || !Number.isSafeInteger(message.count)||message.count<0){finish(job,invalid());return;}
        job.value=[];job.expectedCount=message.count;
      } else if(message.type==='parsed-json-chunk'){
        if(!job.value || message.index!==job.value.length || !Array.isArray(message.rows)
          || message.encoding!=='raw-json' || message.rows.length<1 || message.rows.length>16
          || message.rows.some(row=>typeof row!=='string')
          || message.rows.length>1 && message.rows.reduce((sum,row)=>sum+row.length,0)>32768
          || job.value.length+message.rows.length>job.expectedCount){finish(job,invalid());return;}
        try {
          const decoded=message.rows.map(row=>{
            if(typeof row!=='string')throw invalid();
            return JSON.parse(row);
          });
          job.value.push(...decoded);
        } catch {finish(job,invalid());return;}
        // Yield a real task without the nested setTimeout minimum delay on
        // every REST row. Parallel requests share a FIFO task scheduler.
        const acknowledge=()=>{
          if(!jobs.has(job.id)||worker!==current||job.fallingBack)return;
          try{current.postMessage({type:'ack-json',id:job.id,nextIndex:job.value.length})}catch{breakWorker(current)}
        };
        try {
          ackScheduler ||= createProjectionScheduler();
          void ackScheduler.yieldTask().then(acknowledge);
        } catch { job.ackTimer=setTimeout(acknowledge,0); }
      } else if(message.type==='parsed-json-complete'){
        if(!job.value || message.count!==job.expectedCount || job.value.length!==job.expectedCount)finish(job,invalid());
        else finish(job,null,job.value);
      } else if(message.type==='invalid-json')finish(job,invalid());
    };
    current.onerror=()=>breakWorker(current);
    worker=current;return current;
  };
  return {
    parse(text,{signal}={}) {
      if(closed || signal?.aborted)return Promise.reject(aborted());
      if(typeof text!=='string')return Promise.reject(new TypeError('JSON body must be a string.'));
      clearTimeout(idleTimer);
      return new Promise((resolve,reject)=>{
        const job={id:++sequence,text,signal,resolve,reject,worker:null,timer:null,ackTimer:null,value:null,expectedCount:null,fallingBack:false};
        job.abort=()=>finish(job,aborted());jobs.set(job.id,job);
        signal?.addEventListener('abort',job.abort,{once:true});
        if(signal?.aborted){job.abort();return;}
        try {
          job.worker=getWorker();job.timer=setTimeout(()=>breakWorker(job.worker),timeoutMs);
          job.worker.postMessage({id:job.id,text});
        } catch { fallback(job); }
      });
    },
    close() {
      closed=true;clearTimeout(idleTimer);worker?.terminate();worker=null;
      for(const job of [...jobs.values()])finish(job,aborted());
    },
  };
}

let parser;
export async function parseFirebaseResponseJsonInBackground(response,{signal}={}) {
  if(signal?.aborted)throw aborted();
  const text=await response.text();
  if(signal?.aborted)throw aborted();
  parser ||= createBackgroundJsonParser();
  return parser.parse(text,{signal});
}
import { createProjectionScheduler } from './cooperativeProjection.js';

