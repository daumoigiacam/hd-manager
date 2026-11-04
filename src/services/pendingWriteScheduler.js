// One timer per authenticated queue owner, not a polling interval or a second
// queue/cache. Unresolved physical writes keep their own existing ACK locks.
export function createPendingWriteScheduler({flush,nextDelay,onError=()=>{},schedule=setTimeout,cancel=clearTimeout}){
 if(typeof flush!=='function'||typeof nextDelay!=='function')throw new TypeError('Pending write scheduler requires queue callbacks');
 let timer=null,running=false,closed=false,woken=false;
 const report=error=>{try{onError(error)}catch{/* Diagnostics cannot drop the durable queue. */}};
 const arm=delay=>{
  if(closed||delay===null)return;
  if(timer!==null)cancel(timer);
  timer=schedule(async()=>{
   timer=null;if(closed)return;running=true;woken=false;
   try{await flush()}catch(error){report(error)}finally{
    running=false;if(!closed){try{arm(woken?0:nextDelay())}catch(error){report(error);arm(30000)}}
   }
  },Math.max(0,Math.min(300000,Number.isFinite(delay)?delay:30000)));
 };
 return Object.freeze({
  wake(){if(closed)return;if(running){woken=true;return}arm(0)},
  close(){closed=true;if(timer!==null)cancel(timer);timer=null},
 });
}
