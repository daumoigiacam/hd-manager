// Lifecycle-local counters only. Foreground work starts immediately; quiet time
// gates background indexing, never UI reads. No timer or event listener owned.
export function createBusinessSearchForegroundGate({isCurrent,activity=()=>({}),clock=()=>performance.now(),quietMs=500}){
  if(typeof isCurrent!=='function'||typeof activity!=='function'||typeof clock!=='function'||quietMs!==500)throw new TypeError('Current owner and fixed background quiet interval required');
  let closed=false,pending=0,quietAt=clock(),editorFocused=false,interactionCount=null,quantum=null,nextQuantumAt=0;
  const current=()=>!closed&&isCurrent();
  const state=()=>{
    const at=clock(),value=activity();
    if(value.editorFocused&&!editorFocused)quietAt=at;editorFocused=value.editorFocused===true;
    if(Number.isSafeInteger(value.interactionCount)&&value.interactionCount>=0&&value.interactionCount!==interactionCount){interactionCount=value.interactionCount;quietAt=at;}
    return {at,blocked:!current()||pending>0||value.hidden===true||value.inputPending===true};
  };
  return Object.freeze({
    async run(work){
      if(!current())throw Object.assign(new Error('Business read owner closed'),{code:'permission-denied'});
      pending++;quietAt=clock();if(quantum)quantum.cancelled=true;
      try{return await work();}finally{pending--;quietAt=clock();}
    },
    shouldYield(){
      if(!current())return true;
      const {at,blocked}=state();
      // Focus is an activity edge, not an indefinitely renewed lease. Existing
      // foreground reads and browser interaction counters renew quiet time for
      // actual editing; an idle focused draft can coexist with derived reads.
      if(blocked){quietAt=at;if(quantum)quantum.cancelled=true;return true;}
      if(quantum)return quantum.cancelled;
      return at<quietAt||at-quietAt<quietMs;
    },
    // Existing scheduler only. A demanded batch may use a genuine gap even
    // while interactions keep renewing the 500ms idle edge. No foreground or
    // pending input is bypassed. New foreground work latches cancellation;
    // the feed checks it around each native operation and rolls back its batch.
    beginBackgroundQuantum(){
      const sample=state();if(quantum||sample.blocked||sample.at<nextQuantumAt)return null;
      const token={cancelled:false};quantum=token;
      return Object.freeze({
        check(){const sample=state();if(sample.blocked)token.cancelled=true;return quantum===token&&!token.cancelled;},
        release(){if(quantum===token){quantum=null;nextQuantumAt=clock()+100;}},
      });
    },
    close(){closed=true;if(quantum)quantum.cancelled=true;},
  });
}
