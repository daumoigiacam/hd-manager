import {createPersonalHomeInputAssembler} from './personalHomeProjectionProtocol.js';

// No database reads/writes or authentication in this calculation protocol.
export function createPersonalHomeWorkerHandler({initialize,calculate,post}) {
 let assembler,encode,jobId,finished=false;
 return message=>{
  if(finished)return;
  try{
   if(!message||typeof message.jobId!=='string'||!message.jobId||!Number.isSafeInteger(message.sequence))throw Error();
   if(message.type==='init'){
    if(assembler||message.sequence!==0)throw Error();
    jobId=message.jobId;const codec=initialize(message.config);encode=codec.encode;
    assembler=createPersonalHomeInputAssembler({decode:codec.decode,monthKey:message.monthKey,expectedCounts:message.counts});
   }else{
    if(!assembler||message.jobId!==jobId)throw Error();
    if(message.type==='chunk')assembler.chunk(message);
    else if(message.type==='complete'){
     const input=assembler.finish(message),started=performance.now(),value=calculate(input),calculationMs=performance.now()-started;
     finished=true;post({type:'result',jobId,sequence:message.sequence,value:encode(value),calculationMs});return;
    }else throw Error();
   }
   post({type:'ack',jobId,sequence:message.sequence});
  }catch{finished=true;post({type:'error',jobId,code:'personal-home-projection-failed'})}
 };
}
