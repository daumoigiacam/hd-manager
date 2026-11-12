// One bounded read for the sources explicitly visible in this Finance view.
// Consumed once per source; reload, pagination and detail use the original owner.
export function createVisibleFinanceReadPlan(directory,requests){
 if(typeof directory?.pageBatch!=='function'||requests.length!==2)return directory;
 const slots=new Map(requests.map(request=>[request.source,{options:request.options,used:false}]));
 let pending;
 const equal=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
 return Object.freeze({...directory,async page(source,options={}){
  const slot=slots.get(source);
  if(!slot||slot.used||!equal(slot.options,options))return directory.page(source,options);
  slot.used=true;
  pending ||= directory.pageBatch(requests);
  const rows=await pending;
  // A sibling may consume its envelope later. Recheck current authority then.
  await directory.verifyAccess(source,options);
  return rows[requests.findIndex(request=>request.source===source)];
 }});
}
