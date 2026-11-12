// One existing customer source, one serialized synchronizer. Snapshot pages and
// journal checkpoint commit with profile rows in the same SQLite transaction.
export function createCustomerDeltaCoordinator({repository,transport,scope,isCurrent,online,onChange,uuid,onFatal}){
 let running=null,stopped=false,active=0,timer=null,controller=null;
 const check=()=>{if(stopped||!isCurrent())throw Error('Customer sync scope closed');};
 const plan=()=>{clearTimeout(timer);if(active&&!stopped)timer=setTimeout(()=>void sync().catch(()=>{}),15000);};
 async function run(){
  if(!online())return;check();controller=new AbortController();
  let saved=await repository.syncCheckpoint();
  const head=await transport.delta({head:true},controller.signal,scope);check();
  if(!head.generation||!Number.isSafeInteger(head.through))throw Error('Invalid customer feed head');
  if(!saved||saved.generation!==head.generation)saved={generation:head.generation,phase:'snapshot',snapshotId:uuid(),after:'',seq:head.through};
  while(saved.phase==='snapshot'){
   check();if(!online())return;
   const page=await transport.page({after:saved.after,limit:20},controller.signal,scope);check();
   if(!Array.isArray(page.records)||page.records.length>20||typeof page.hasMore!=='boolean')throw Error('Invalid customer snapshot');
   const ids=page.records.map(x=>x.document?.id);if(ids.some((id,i)=>typeof id!=='string'||id<=saved.after||(i&&id<=ids[i-1]))||(ids.length&&page.after!==ids.at(-1))||(!ids.length&&page.hasMore))throw Error('Customer cursor mismatch');
   const next={...saved,after:ids.at(-1)||saved.after,phase:page.hasMore?'snapshot':'delta',finishSnapshot:!page.hasMore};
   const changed=await repository.ingestPage(page.records,{after:next.after,hasMore:page.hasMore},next);check();if(changed)onChange();
   saved={...next};delete saved.finishSnapshot;if(saved.phase==='delta')delete saved.snapshotId;
   // Bootstrap does one bounded page. Remaining directory pages run only while
   // the user has opened CRM; no transaction-history prefetch is involved.
   if(!active&&page.hasMore)return;
   await new Promise(resolve=>setTimeout(resolve,8));
  }
  let through=head.through;
  if(saved.seq===through)return;
  do{
   check();if(!online())return;
   const page=await transport.delta({generation:saved.generation,after:saved.seq,through,limit:50},controller.signal,scope);check();
   if(page.reset){await repository.ingestPage([],null,{generation:page.generation,phase:'snapshot',snapshotId:uuid(),after:'',seq:page.through});return;}
   if(!Array.isArray(page.events)||page.events.length>50||!Number.isSafeInteger(page.after)||page.after<saved.seq||page.after>through)throw Error('Invalid delta checkpoint');
   let last=saved.seq;const records=[],deletes=[];
   for(const event of page.events){if(!Number.isSafeInteger(event.seq)||event.seq<=last||event.seq>through||!['upsert','delete'].includes(event.operation)||event.generation!==saved.generation)throw Error('Invalid ordered customer delta');last=event.seq;if(event.operation==='delete')deletes.push(event.id);else records.push({document:event.document,fingerprint:event.fingerprint});}
   // Repeated modifications to one profile are applied in exact journal order.
   // Batch only unique IDs; duplicate event IDs split into atomic checkpoints.
   if(new Set(page.events.map(e=>e.id)).size!==page.events.length){
    for(const event of page.events){const next={generation:saved.generation,phase:'delta',after:saved.after,seq:event.seq};const changed=await repository.ingestPage(event.operation==='upsert'?[{document:event.document,fingerprint:event.fingerprint}]:[],null,next,event.operation==='delete'?[event.id]:[]);saved=next;if(changed)onChange();}
   }else{const next={...saved,seq:page.after};const changed=await repository.ingestPage(records,null,next,deletes);saved=next;if(changed)onChange();}
   if(!page.hasMore)break;
   await new Promise(resolve=>setTimeout(resolve,8));
  }while(active||online());
 }
 function sync(){if(running)return running;if(stopped)return Promise.resolve();running=run().catch(async error=>{if(['permission-denied','unauthenticated'].includes(error.code))await onFatal?.();throw error;}).finally(()=>{running=null;controller=null;plan();});return running;}
 return Object.freeze({sync,activate(){active++;void sync().catch(()=>{});plan();return()=>{active=Math.max(0,active-1);if(!active)clearTimeout(timer);};},stop(){stopped=true;clearTimeout(timer);controller?.abort();}});
}
