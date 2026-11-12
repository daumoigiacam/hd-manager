import {createPendingWriteScheduler} from './pendingWriteScheduler.js';

const SOURCES=Object.freeze(['orders','payments','expenses','warehouseImports','warehouseDispatches','warehouseStockCounts','deliveryReports','employees','attendance','payrollPeriods','payrollSnapshots','customers','products','orderRequests']);
const RETRY_DELAYS=[100,250,1000];
const failure=code=>Object.assign(new Error('Business search backfill unavailable'),{code});
const denied=error=>['permission-denied','unauthenticated','source-denied','source-unavailable'].includes(error?.code)||[401,403].includes(error?.statusCode);
const retryable=error=>['stale-checkpoint','SQLITE_BUSY','SQLITE_LOCKED','busy','database-busy'].includes(error?.code);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=512;

// Owns scheduling only. The feed owns its connection, transaction and checkpoint.
// request() is explicit visible-source demand; it never waits for background work.
// isCurrent must cover signed-session validity/scope. Existing home change handling
// calls invalidate(); existing owner teardown calls close(). No listeners here.
export function createBusinessSearchBackfillOwner({isCurrent,readHead,getFeed,verifySource,onProgress,
  clock=Date.now,schedule=setTimeout,cancel=clearTimeout,shouldYield=()=>false,acquireQuantum=null}){
  if([isCurrent,readHead,getFeed,verifySource,clock,schedule,cancel,shouldYield].some(fn=>typeof fn!=='function'))throw new TypeError('Backfill owner requires lifecycle and authorization callbacks');
  const requested=new Map(),complete=new Set();
  if(acquireQuantum!==null&&typeof acquireQuantum!=='function')throw new TypeError('Existing foreground quantum callback required');
  let closed=false,epoch=0,controller=new AbortController(),head=null,scope=null,nextBatchAt=0,running=false,lastSource=null,lastBatch=null;
  const current=()=>{if(closed)return false;try{if(isCurrent())return true;}catch{/* Fail closed. */}close();return false;};
  const valid=(version,signal)=>current()&&version===epoch&&!signal.aborted;
  const delay=()=>{
    if(closed)return null;
    const pending=[...requested.values()].filter(item=>item.state==='pending');
    return pending.length?Math.max(0,Math.max(nextBatchAt,Math.min(...pending.map(item=>item.eligibleAt)))-clock()):null;
  };
  function close(){if(closed)return;closed=true;epoch++;controller.abort();head=null;complete.clear();scheduler.close();}
  function capture(raw){
    if(!raw||raw.ready===false||!text(raw.generation)||!Number.isSafeInteger(raw.seq)||raw.seq<0||!/^\d{4}-\d{2}-\d{2}$/.test(raw.asOfDay)||
      ![raw.tenantId,raw.principalId,raw.permissionRevision].every(text)||!Array.isArray(raw.sources)||raw.sources.length>64||
      !raw.sources.every(text)||new Set(raw.sources).size!==raw.sources.length||!raw.counts)throw failure('stale-checkpoint');
    const profile=raw.sourceProfile??'legacy-v1';if(!text(profile))throw failure('permission-denied');
    const identity=[raw.tenantId,raw.principalId,raw.permissionRevision,profile];
    if(scope&&identity.some((value,index)=>value!==scope[index]))throw failure('scope-changed');
    const counts=Object.create(null);
    for(const source of raw.sources){if(!Number.isSafeInteger(raw.counts[source])||raw.counts[source]<0)throw failure('stale-checkpoint');counts[source]=raw.counts[source];}
    scope=identity;
    return Object.freeze({ready:true,generation:raw.generation,seq:raw.seq,asOfDay:raw.asOfDay,
      tenantId:raw.tenantId,principalId:raw.principalId,permissionRevision:raw.permissionRevision,sourceProfile:profile,
      sources:Object.freeze([...raw.sources]),counts:Object.freeze(counts)});
  }
  async function authorize(source,version,signal){
    const answer=await verifySource(source);
    if(!valid(version,signal))return false;
    // Existing authorizers may throw and return void on success; explicit false
    // is denial. No permissions are derived from Home visibility here.
    if(answer===false)throw failure('source-denied');
    return true;
  }
  async function flush(){
    if(!current()||running||delay()===null||delay()>0)return;
    const due=[...requested.values()].filter(item=>item.state==='pending'&&item.eligibleAt<=clock());
    // Only explicitly demanded Orders-v2 receives the fair quantum. Other
    // sources retain their original idle-only policy and bounded scheduler.
    const item=(acquireQuantum&&due.find(value=>value.source==='orders'))||due.find(value=>value.source!==lastSource)||due[0];if(!item)return;
    const quantum=item.source==='orders'?acquireQuantum?.():null;
    if((item.source==='orders'&&acquireQuantum&&!quantum)||shouldYield()){quantum?.release();nextBatchAt=clock()+100;return;}
    const version=epoch,signal=controller.signal,startedAt=clock();running=true;
    const checkQuantum=()=>{if(quantum&&!quantum.check())throw failure('foreground-yield');};
    try{
      checkQuantum();
      if(!await authorize(item.source,version,signal))return;
      if(item.source==='orders'&&!await authorize('customers',version,signal))return;
      if(!head){const raw=await readHead();if(!valid(version,signal))return;head=capture(raw);}
      if(!valid(version,signal))return;
      const source=item.source==='orders'&&!acquireQuantum&&!complete.has('customers')?'customers':item.source;
      if(!head.sources.includes(item.source)||!head.sources.includes(source))throw failure('source-unavailable');
      if(complete.has(source)){item.state='complete';return;}
      if(shouldYield()){nextBatchAt=clock()+100;return;}
      const feed=await getFeed();if(!valid(version,signal))return;
      if(!feed||typeof feed.backfillSearchPage!=='function')throw failure('feed-unavailable');
      // The underlying feed rechecks the actual committed checkpoint each batch.
      if(shouldYield()){nextBatchAt=clock()+100;return;}
      checkQuantum();
      const result=await feed.backfillSearchPage(head,{source,limit:16,signal,orderSort:item.source==='orders'&&source==='orders',shouldContinue:quantum?()=>quantum.check():undefined});
      if(!valid(version,signal))return;
      if(!result||typeof result.complete!=='boolean'||!Number.isInteger(result.processed)||result.processed<0||result.processed>16)throw failure('invalid-progress');
      if(!result.complete&&result.processed===0)throw failure('busy');
      lastBatch={source,processed:result.processed,complete:result.complete,durationMs:clock()-startedAt};
      item.retries=0;item.error=null;lastSource=item.source;nextBatchAt=clock()+16;
      if(result.complete){complete.add(source);const direct=requested.get(source);if(direct)direct.state='complete';}
      if(complete.has(item.source))item.state='complete';
      if(onProgress){try{const pending=onProgress(Object.freeze({source,processed:result.processed,complete:result.complete,generation:head.generation,seq:head.seq}));Promise.resolve(pending).catch(()=>{});}catch{/* Optional diagnostics cannot change ownership. */}}
    }catch(error){
      if(!valid(version,signal))return;
      if(error?.code==='foreground-yield'||(error?.code==='busy'&&quantum&&!quantum.check())){nextBatchAt=clock()+100;return;}
      if(error?.code==='scope-changed'){close();return;}
      item.error=denied(error)?'permission-denied':retryable(error)?error.code:'backfill-failed';
      if(denied(error)){item.state='denied';}
      else if(retryable(error)&&item.retries<RETRY_DELAYS.length){
        item.eligibleAt=clock()+RETRY_DELAYS[item.retries++];
        if(error.code==='stale-checkpoint')head=null;
      }else item.state='stopped';
    }finally{quantum?.release();running=false;}
  }
  const scheduler=createPendingWriteScheduler({flush,nextDelay:delay,
    // wake() normally arms zero; preserve eligibility and the inter-batch yield.
    schedule:(callback,ms)=>schedule(callback,Math.max(ms,delay()??0)),cancel,
    onError:()=>{close();}});
  return Object.freeze({
    request(source){
      if(!SOURCES.includes(source)||!current())return false;
      if(requested.has(source))return requested.get(source).state!=='denied'&&requested.get(source).state!=='stopped';
      requested.set(source,{source,state:complete.has(source)?'complete':'pending',eligibleAt:clock()+100,retries:0,error:null});
      if(requested.get(source).state==='pending')scheduler.wake();return true;
    },
    invalidate(){
      if(!current())return;epoch++;controller.abort();controller=new AbortController();head=null;complete.clear();nextBatchAt=clock()+100;
      for(const item of requested.values())if(item.state!=='denied'){item.state='pending';item.retries=0;item.error=null;item.eligibleAt=nextBatchAt;}
      if(delay()!==null)scheduler.wake();
    },
    inspect(){return {closed,running,epoch,headCaptured:!!head,nextDelayMs:delay(),lastBatch,sources:[...requested.values()].map(({source,state,retries,error})=>({source,state,retries,error}))};},
    close,
  });
}
