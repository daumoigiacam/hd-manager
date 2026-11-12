const owners=new Set();
const readOnly=sql=>{const tokens=String(sql).replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\r\n]*|\/\*[\s\S]*?\*\//g,' ');return /^\s*(SELECT|WITH|EXPLAIN)\b/i.test(tokens)&&! /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|DETACH|VACUUM|REINDEX)\b|\bREPLACE\b(?!\s*\()/i.test(tokens);};
// Reuses exactly the Native repository/schema contract. SQL, export and AES
// run in a Worker. A transaction resolves only after durable IDB completion.
export async function openWebOfflineDatabase({databaseName,schema,isCurrent,workerFactory=()=>new Worker(new URL('./webOfflineSqlWorker.js',import.meta.url),{type:'module'})}){
  if(owners.has(databaseName))throw Error('Browser Offline database already has an owner');
  owners.add(databaseName);let worker;try{worker=workerFactory();}catch(error){owners.delete(databaseName);throw error;}const pending=new Map();let sequence=0,tail=Promise.resolve(),closed=false,revision=0,metadata,fatal=null;
  const check=()=>{if(closed||!isCurrent())throw Object.assign(Error('Browser Offline scope closed'),{code:'permission-denied'});};
  const call=(method,...args)=>new Promise((resolve,reject)=>{if(fatal){reject(fatal);return;}const id=++sequence;pending.set(id,{resolve,reject});try{worker.postMessage({id,method,args});}catch(error){pending.delete(id);reject(error);}});
  worker.onmessage=event=>{const p=pending.get(event.data.id);if(!p)return;pending.delete(event.data.id);if(event.data.error)p.reject(Object.assign(Error(event.data.error.message),{code:event.data.error.code}));else p.resolve(event.data.result);};
  worker.onerror=()=>{fatal=Error('Offline database Worker stopped; dữ liệu đã lưu được giữ nguyên.');for(const p of pending.values())p.reject(fatal);pending.clear();};
  try{check();metadata=await call('open',databaseName,schema);if(metadata.version!==1||metadata.foreignKeys!==1)throw Error('Browser SQLite schema/configuration not verified');}
  catch(error){worker.terminate();owners.delete(databaseName);throw error;}
  const serial=work=>{const task=tail.then(()=>{check();return work();});tail=task.catch(()=>{});return task;};
  const wrote=()=>{if(revision>=Number.MAX_SAFE_INTEGER)throw Error('Browser database revision exhausted');revision++;};
  return Object.freeze({metadata:Object.freeze({...metadata,databaseName}),supportsReadRevision:true,
    readQuery:(statement,params=[],{prepare,observed}={})=>serial(async()=>{
      const plan=prepare?.(revision)||{statement,params};
      if(typeof plan.statement!=='string'||!Array.isArray(plan.params)||!readOnly(plan.statement))throw Error('Browser read requires SELECT');
      const result=await call('query',plan.statement,plan.params);check();observed?.(revision);return result;
    }),
    transaction:work=>serial(async()=>{
      await call('begin');
      try{const result=await work({query:(s,p=[])=>{if(!readOnly(s))wrote();return call('query',s,p);},run:(s,p=[])=>{wrote();return call('run',s,p);},execute:s=>{wrote();return call('execute',s);},runSet:s=>{wrote();return call('runSet',s);}});check();await call('commit');return result;}
      catch(error){await call('rollback').catch(()=>{});throw error;}
    }),
    async close(){if(closed)return;closed=true;await tail;try{await call('close');}finally{worker.terminate();owners.delete(databaseName);}},
  });
}
