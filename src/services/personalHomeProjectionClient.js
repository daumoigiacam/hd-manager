import {createBudgetedTransferChunks} from './workerTransferBudget.js';
import {personalHomeInputRows,PERSONAL_HOME_INPUT_KINDS,getPersonalHomeInputCounts} from './personalHomeProjectionProtocol.js';
import {createProjectionScheduler,runCooperativeProjection} from './cooperativeProjection.js';
import {createPersonalHomeWorker} from '@hd/personal-home-worker';
import {createRequestAdmission} from '../data/requestAdmission.js';
import {getAdaptivePerformancePolicy} from './adaptivePerformance.js';

const aborted=()=>Object.assign(new Error('Personal Home calculation cancelled.'),{name:'AbortError'});
let nextTimingRun=0;
const computeAdmission=createRequestAdmission({maxConcurrent:2,maxQueued:8});

export function runPersonalHomeProjection(options){
 computeAdmission.setConcurrency(getAdaptivePerformancePolicy().workerConcurrency);
 return computeAdmission.run(()=>runAdmittedProjection(options),options.signal);
}

async function runAdmittedProjection({input,config,encode,decode,signal,workerFactory=createPersonalHomeWorker,
 now=()=>performance.now(),yieldTask,timeoutMs=60000,onTiming,prepareInput}) {
 if(signal?.aborted)throw aborted();
 const worker=workerFactory(),jobId=crypto.randomUUID();let pending,sequence=0,scheduler,closed=false;
 const run=onTiming?++nextTimingRun:0,startedAt=onTiming?now():0;
 const trace=(phase,detail={})=>onTiming?.({run,phase,...detail});
 const yieldWork=yieldTask||(()=>{scheduler??=createProjectionScheduler();return scheduler.yieldTask()});
 const close=()=>{if(closed)return;closed=true;worker.terminate();scheduler?.close();if(pending){clearTimeout(pending.timer);pending.reject(aborted());pending=null}};
 const check=()=>{if(closed||signal?.aborted)throw aborted()};
 worker.onmessage=event=>{
  const message=event.data;if(closed||!pending||message?.jobId!==jobId)return;
  if(message.type==='error'){clearTimeout(pending.timer);pending.reject(new Error('Không thể tính dữ liệu Trang chủ.'));pending=null;return}
  if(message.sequence!==pending.sequence||!['ack','result'].includes(message.type))return;
  clearTimeout(pending.timer);pending.resolve(message);pending=null;
 };
 worker.onerror=()=>{if(pending){clearTimeout(pending.timer);pending.reject(new Error('Không thể khởi tạo tính toán Trang chủ.'));pending=null}};
 signal?.addEventListener('abort',close,{once:true});
 const exchange=message=>new Promise((resolve,reject)=>{
  check();const current=sequence++;
  pending={sequence:current,resolve,reject,timer:setTimeout(()=>{pending=null;reject(new Error('Tính toán Trang chủ quá thời gian.'))},timeoutMs)};
  try{worker.postMessage({...message,jobId,sequence:current})}catch(error){clearTimeout(pending.timer);pending=null;reject(error)}
 });
 try{
  if(prepareInput){
   input=await runCooperativeProjection(()=>prepareInput(input),{signal,now,yieldTask:yieldWork});check();
   trace('selected',onTiming?{durationMs:now()-startedAt,rows:Object.values(getPersonalHomeInputCounts(input)).reduce((sum,n)=>sum+n,0)}:{});
  }
  await exchange({type:'init',monthKey:input.monthKey,config,counts:getPersonalHomeInputCounts(input)});check();
  trace('initialized',onTiming?{durationMs:now()-startedAt}:{});
  const transferStarted=onTiming?now():0;
  const counts=Object.fromEntries(Object.keys(PERSONAL_HOME_INPUT_KINDS).map(name=>[name,0]));
  let chunks=0,deadline=now()+4;
  const rows=personalHomeInputRows(input,value=>encode(value));
  for(const chunk of createBudgetedTransferChunks(rows,row=>row,{maxRows:64,maxWork:65536})){
   check();if(now()>=deadline){await yieldWork();check();deadline=now()+4}
   for(const row of chunk)counts[row.name]++;
   await exchange({type:'chunk',index:chunks++,rows:chunk});check();
  }
  trace('transferred',onTiming?{durationMs:now()-transferStarted,chunks,rows:Object.values(counts).reduce((sum,count)=>sum+count,0)}:{});
  const result=await exchange({type:'complete',chunks,counts});check();
  if(result.type!=='result')throw new Error('Thiếu kết quả tính Trang chủ.');
  const value=decode(result.value);
  trace('completed',onTiming?{durationMs:now()-startedAt,calculationMs:result.calculationMs}:{});
  return value;
 }catch(error){
  trace(error.name==='AbortError'?'cancelled':'failed',onTiming?{durationMs:now()-startedAt}:{});throw error;
 }finally{signal?.removeEventListener('abort',close);close()}
}
