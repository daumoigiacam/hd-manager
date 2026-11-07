// One worker per mounted report owner. One active job and one latest pending
// intent; stale results cannot publish into a different permission/day scope.
export function createOnlineHomeProjectionClient({createWorker=()=>new Worker(new URL('./onlineHomeProjectionWorker.js',import.meta.url))}={}){
 let worker=null,sent={},scope=null,active=null,pending=null,serial=0,closed=false,timer=null;
 const abort=()=>Object.assign(Error('Home calculation superseded'),{name:'AbortError'});
 const fail=error=>{clearTimeout(timer);active?.reject(error);active=null;pending?.reject(error);pending=null;worker?.terminate();worker=null;sent={};scope=null;};
 const pump=async()=>{
  if(closed||active||!pending)return;
  active=pending;pending=null;
  try{
   const nextScope=JSON.stringify([active.inputs.privacyScope,active.inputs.company?.id,active.inputs.employee?.id,active.inputs.dashboardDayKey,active.inputs.dashboardClockScope]);
   const reset=scope!==nextScope;if(reset){worker?.terminate();worker=null;sent={};}
   if(!worker){worker=createWorker();worker.onmessage=({data})=>{if(!active||data.id!==active.id)return;clearTimeout(timer);const job=active;active=null;data.error?job.reject(Error(data.error)):job.resolve(data);pump();};worker.onerror=event=>fail(Error(event.message||'Home worker unavailable'));}
   const patch={};for(const key of new Set([...Object.keys(sent),...Object.keys(active.inputs)]))if(reset||!Object.is(sent[key],active.inputs[key]))patch[key]=active.inputs[key];
   const job=active,target=worker;
   timer=setTimeout(()=>fail(Error('Home worker timed out')),30000);
   target.postMessage({id:job.id,reset,patch:{},prepare:true});
   for(const [key,value]of Object.entries(patch)){
    if(closed||worker!==target||active!==job)return;
    const object=['attendance','performance','lockedPayroll'].includes(key)&&value&&typeof value==='object'&&!Array.isArray(value);
    if(Array.isArray(value)||object){
     const rows=object?Object.entries(value):value;target.postMessage({id:job.id,patch:{[key]:object?{}:[]},prepare:true});
     let start=performance.now();for(let offset=0;offset<rows.length;offset+=25){
      if(closed||worker!==target||active!==job)return;
      target.postMessage({id:job.id,patch:{},prepare:true,append:{key,object,rows:rows.slice(offset,offset+25)}});
      if(performance.now()-start>=4){await new Promise(resolve=>setTimeout(resolve,0));start=performance.now();}
     }
    }else target.postMessage({id:job.id,patch:{[key]:value},prepare:true});
   }
   if(closed||worker!==target||active!==job)return;
   target.postMessage({id:job.id,mode:job.mode,patch:{}});sent=job.inputs;scope=nextScope;
  }catch(error){fail(error);}
 };
 return {calculate(inputs,mode='primary'){if(closed)return Promise.reject(abort());return new Promise((resolve,reject)=>{pending?.reject(abort());pending={id:++serial,inputs,mode,resolve,reject};pump();});},close(){closed=true;fail(abort());}};
}
