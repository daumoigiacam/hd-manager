// One running read and at most one replacement per route. Writes never use
// this queue. Intermediate keystrokes cannot create a native-query backlog.
export function createLatestLocalRead() {
 let running=false,next=null;
 async function drain(job){
  running=true;
  try{while(job){try{job.resolve(await job.work());}catch(error){job.reject(error);}job=next;next=null;}}
  finally{running=false;}
 }
 return Object.freeze({
  run(work,onSkipped=()=>{}){return new Promise((resolve,reject)=>{const job={work,resolve,reject,skip(){onSkipped();resolve();}};if(running){next?.skip();next=job;}else void drain(job);});},
  clearQueued(){next?.skip();next=null;},
 });
}
