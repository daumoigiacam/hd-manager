// Bound initial subscription work, not ongoing realtime or UI readiness.
// A slot is released only by the caller after its first confirmed server
// transfer ACK, cancellation or terminal error. Cached snapshots do not settle.
export function createInitialReadAdmission({concurrency=2,maxPending=64,groupLimits={}}={}) {
  if(!Number.isSafeInteger(concurrency)||concurrency<1||!Number.isSafeInteger(maxPending)||maxPending<concurrency)
    throw new RangeError('Invalid initial subscription admission bounds.');
  const limits=new Map(Object.entries(groupLimits));
  if([...limits].some(([name,value])=>!name||!Number.isSafeInteger(value)||value<1))
    throw new RangeError('Invalid initial subscription group bounds.');
  const queued=new Map(),running=new Map();
  let closed=false,draining=false;
  const drain=()=>{
    if(closed||draining)return;
    draining=true;
    try{
      while(!closed&&running.size<concurrency&&queued.size){
        // A large history must not occupy both SDK/materialization slots.
        // Keep other required sources moving; preserve FIFO within each group.
        const next=[...queued].find(([,job])=>!limits.has(job.group)
          || [...running.values()].filter(group=>group===job.group).length<limits.get(job.group));
        if(!next)break;
        const [key,job]=next;
        queued.delete(key);running.set(key,job.group);
        try{job.start()}
        catch(error){running.delete(key);try{job.onError(error)}catch{/* Error observers cannot strand other sources. */}}
      }
    }finally{draining=false}
  };
  return Object.freeze({
    enqueue(key,{start,onError,group=''}){
      if(closed)throw Object.assign(new Error('Initial subscription admission is closed.'),{name:'AbortError'});
      if(typeof key!=='string'||!key||typeof group!=='string'||typeof start!=='function'||typeof onError!=='function'||queued.has(key)||running.has(key))
        throw new TypeError('Invalid or duplicate initial subscription job.');
      if(queued.size+running.size>=maxPending)throw Object.assign(new Error('Initial subscription admission queue is full.'),{code:'resource-exhausted'});
      queued.set(key,{start,onError,group});drain();
    },
    settle(key){
      const waiting=queued.delete(key),active=running.delete(key);
      if(waiting||active)drain();
      return waiting||active;
    },
    close(){closed=true;queued.clear();running.clear()},
    getSnapshot:()=>({active:running.size,queued:queued.size,closed}),
  });
}
