// Bound outstanding packets while preserving a completion barrier. The receiver
// serializes each stream; no complete/commit can overtake an unacknowledged row.
export async function transferWithWindow(payloads,send,{size=1,isCurrent=()=>true}={}){
 if(!Number.isInteger(size)||size<1||size>4)throw new RangeError('Invalid transfer window');
 const pending=[];
 const check=()=>{if(!isCurrent())throw Object.assign(Error('Transfer cancelled'),{name:'AbortError'})};
 const finish=async()=>{const error=await pending.shift();if(error)throw error;check()};
 try{for(const payload of payloads){check();pending.push(Promise.resolve().then(()=>{check();return send(payload)}).then(()=>null,error=>error));if(pending.length>=size)await finish();}while(pending.length)await finish();}
 finally{await Promise.all(pending);}
}
