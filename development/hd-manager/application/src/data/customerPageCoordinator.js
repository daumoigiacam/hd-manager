// One bounded request per explicit action. No automatic fetch-all startup.
export function createCustomerPageCoordinator({repository,fetchPage,isCurrent}){
 let pending=null,pendingKind=false;
 async function read(more){
  if(pending){if(pendingKind===more)return pending;await pending;return read(more);}
  pendingKind=more;
  pending=(async()=>{
   const saved=await repository.serverCursor();
   if(more&&!saved.hasMore)return saved;
   const after=more?saved.after:'';
   const page=await fetchPage({after,limit:20});
   if(!isCurrent())throw new Error('Customer page session closed');
   if(!Array.isArray(page.records)||page.records.length>20||typeof page.hasMore!=='boolean')throw new Error('Invalid customer page response');
   const ids=page.records.map(r=>r.document?.id);
   if(ids.some((id,i)=>typeof id!=='string'||id<=after||(i>0&&id<=ids[i-1])))throw new Error('Invalid customer page order');
   const last=ids[ids.length-1];
   if((last&&page.after!==last)||(!last&&page.hasMore))throw new Error('Invalid customer page cursor');
   // A refresh of page one must not rewind an already advanced local cursor.
   const cursor=more||!saved.after?{after:last||after,hasMore:page.hasMore}:saved;
   await repository.ingestPage(page.records,cursor);
   return repository.serverCursor();
  })();
  try{return await pending;}finally{pending=null;}
 }
 return Object.freeze({refresh:()=>read(false),loadMore:()=>read(true)});
}
