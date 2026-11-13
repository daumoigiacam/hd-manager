const {randomUUID}=require('node:crypto');
const {isTrustedOfflineServerEnvironment}=require('./offlineServerEnvironment.cjs');
const denied=()=>Object.assign(Error('Home feed writer lease unavailable'),{code:'unavailable'});
// Metadata lease, not a second source of business truth. All writes from the
// existing journal are fenced by a Firestore transaction reading this lease.
async function acquireOfflineFeedLease({db,tenantId,environment,now=Date.now,leaseMs=60000,onLost=()=>{}}){
 if(!isTrustedOfflineServerEnvironment(environment,environment?.projectId,environment?.appId,db))throw Error('Verified feed environment required');
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(tenantId)||leaseMs!==60000)throw Error('Invalid feed lease');
 const owner=randomUUID(),ref=db.doc('offlineHomeFeedLeases/'+tenantId);let closed=false;
 await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();if(old?.until>now()&&old.owner!==owner)throw denied();tx.set(ref,{owner,until:now()+leaseMs});});
 const fence=async(tx)=>{const lease=(await tx.get(ref)).data();if(closed||lease?.owner!==owner||lease.until<=now())throw denied();};
 const timer=setInterval(()=>void db.runTransaction(async tx=>{await fence(tx);tx.set(ref,{owner,until:now()+leaseMs});}).catch(()=>{closed=true;clearInterval(timer);onLost();}),20000);timer.unref?.();
 const guarded=Object.create(db);
 guarded.doc=path=>{
  const raw=db.doc(path);if(path!=='offlineHomeFeeds/'+tenantId)return raw;
  return new Proxy(raw,{get(target,key){if(key==='set')return(data,options)=>db.runTransaction(async tx=>{await fence(tx);if(options)tx.set(target,data,options);else tx.set(target,data);});const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 };
 guarded.collection=db.collection.bind(db);guarded.runTransaction=db.runTransaction.bind(db);
 guarded.batch=()=>{const actions=[];const b={set:(...a)=>{actions.push(['set',a]);return b;},delete:(...a)=>{actions.push(['delete',a]);return b;},commit:()=>db.runTransaction(async tx=>{await fence(tx);for(const[k,args]of actions)tx[k](...args);})};return b;};
 return {db:guarded,owner,async close(){clearInterval(timer);closed=true;await db.runTransaction(async tx=>{const lease=(await tx.get(ref)).data();if(lease?.owner===owner)tx.set(ref,{owner,until:0});});}};
}
module.exports={acquireOfflineFeedLease};
