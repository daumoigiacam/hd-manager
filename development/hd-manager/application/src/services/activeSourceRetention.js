// Scheduling only, never an authorization cache. Reuse only subscriptions that
// are already active and server-committed for the SAME read owner. No cold
// source starts here. The caller keeps its existing listener budget and closes
// this owner synchronously on logout, revocation or tenant change.
export function createActiveSourceRetention({ttlMs=10000,clock=Date.now,isCurrent=()=>true}={}){
 if(!Number.isInteger(ttlMs)||ttlMs<0||ttlMs>10000)throw TypeError('Invalid source retention interval');
 let previous=new Set(),closed=false;const deadlines=new Map();
 const close=()=>{closed=true;previous.clear();deadlines.clear();};
 return Object.freeze({
  update(requestedNames,activeNames,canKeep){
   if(closed||!isCurrent()){close();return [];}
   const now=clock(),requested=new Set(requestedNames),active=new Set(activeNames);
   for(const name of previous)if(!requested.has(name)&&active.has(name)&&canKeep(name)&&ttlMs>0)deadlines.set(name,now+ttlMs);
   for(const name of requested)deadlines.delete(name);
   for(const [name,at]of deadlines)if(at<=now||!active.has(name)||!canKeep(name))deadlines.delete(name);
   previous=requested;return [...deadlines.keys()];
  },
  nextDeadline:()=>deadlines.size?Math.min(...deadlines.values()):null,
  close,
 });
}
