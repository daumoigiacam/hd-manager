// Lifecycle for the existing Local API feed cache; not another data store.
export function createLocalFeedRegistry({create,limit=4}){
 const live=new Map(),pending=new Map();let closed=false;
 async function get(tenantId,day){
  if(closed)throw Error('Local feed registry closed');
  const old=live.get(tenantId);if(old?.day===day)return old.feed;
  if(old){live.delete(tenantId);old.feed.close();}
  const opening=pending.get(tenantId);if(opening){const feed=await opening.promise;if(opening.day===day)return feed;return get(tenantId,day);}
  if(live.size+pending.size>=limit){const first=live.entries().next();if(first.done)throw Object.assign(Error('Feed ownership capacity busy'),{code:'unavailable'});const[id,value]=first.value;live.delete(id);value.feed.close();}
  const task={day,promise:null};task.promise=Promise.resolve().then(async()=>{
   let feed;try{feed=await create(tenantId,day);if(closed)throw Error('Local feed registry closed');await feed.ready();if(closed)throw Error('Local feed registry closed');live.set(tenantId,{day,feed});return feed;}catch(error){feed?.close();throw error;}
  }).finally(()=>{if(pending.get(tenantId)===task)pending.delete(tenantId);});pending.set(tenantId,task);return task.promise;
 }
 return{get,close(){if(closed)return;closed=true;for(const{feed}of live.values())feed.close();live.clear();},inspect:()=>({live:live.size,pending:pending.size,closed})};
}
