// Keep a small fixed window of unacknowledged chunks. Never release readiness
// until every ACK has arrived; stop producing rows on cancellation or rejection.
export async function sendBoundedWorkerChunks(chunks,send,{windowSize=1,isActive=()=>true}={}){
 if(!Number.isInteger(windowSize)||windowSize<1||windowSize>2)throw new RangeError('Invalid worker transfer window');
 const pending=[];let count=0,failure;
 const settle=promise=>promise.then(()=>null,error=>{failure??=error;return error});
 const check=()=>{if(failure)throw failure;if(!isActive())throw Object.assign(new Error('Worker transfer closed'),{name:'AbortError'})};
 try{
  for(const rows of chunks){
   check();
   pending.push(settle(Promise.resolve().then(()=>{check();return send(rows,count++)})));
   if(pending.length>=windowSize){const error=await pending.shift();if(error)throw error;check()}
  }
  while(pending.length){const error=await pending.shift();if(error)throw error;check()}
  return count;
 }finally{
  // Rejections are handled immediately by settle, including packets whose
  // native ACK arrives after another packet failed. Do not strand a promise.
  pending.length=0;
 }
}
