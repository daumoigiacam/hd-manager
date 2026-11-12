const aborted=()=>Object.assign(new Error('Data request cancelled.'),{name:'AbortError',code:'cancelled'});

// One FIFO admission contract for page transports and the legacy REST bridge.
// An in-flight, physically uncancellable SDK RPC retains its slot until it
// settles. Removing an obsolete queued job must not start any network work.
export function createRequestAdmission({maxConcurrent=2,maxQueued=100,now=()=>performance.now(),assertCurrent=()=>{}}={}) {
  if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||!Number.isSafeInteger(maxQueued)||maxQueued<1
    ||typeof now!=='function'||typeof assertCurrent!=='function')throw new TypeError('Invalid request admission bounds.');
  const queue=[];
  const concurrencyCeiling=maxConcurrent;
  let active=0,closed=false;
  const remove=task=>task.signal?.removeEventListener('abort',task.abort);
  const check=signal=>{if(closed||signal?.aborted)throw aborted();assertCurrent()};
  const drain=()=>{
    while(!closed&&active<maxConcurrent&&queue.length){
      const task=queue.shift();remove(task);
      try{check(task.signal)}catch(error){task.reject(error);continue}
      active++;
      Promise.resolve().then(()=>{check(task.signal);return task.run(now()-task.queuedAt)})
        .then(task.resolve,task.reject).finally(()=>{active--;drain()});
    }
  };
  const cancelQueued=error=>{
    for(const task of queue.splice(0)){remove(task);task.reject(error)}
  };
  return Object.freeze({
    run(run,signal){
      return new Promise((resolve,reject)=>{
        try{
          check(signal);
          if(typeof run!=='function')throw new TypeError('A request function is required.');
          if(queue.length>=maxQueued)throw Object.assign(new Error('Request queue is full; retry after active requests complete.'),{code:'queue-capacity'});
          const task={run,signal,resolve,reject,queuedAt:now(),abort:null};
          task.abort=()=>{const index=queue.indexOf(task);if(index<0)return;queue.splice(index,1);remove(task);reject(aborted())};
          queue.push(task);signal?.addEventListener('abort',task.abort,{once:true});
          if(signal?.aborted)task.abort();
          drain();
        }catch(error){reject(error)}
      });
    },
    cancelQueued,
    setConcurrency(value){
      if(!Number.isSafeInteger(value)||value<1||value>concurrencyCeiling)throw new RangeError('Concurrency must stay within the configured bound.');
      if(closed)return;
      maxConcurrent=value;drain();
    },
    close(){if(closed)return;closed=true;cancelQueued(aborted())},
    getDiagnostics:()=>Object.freeze({activeRequests:active,queuedRequests:queue.length,closed}),
  });
}
