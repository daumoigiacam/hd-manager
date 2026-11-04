// Conservative clone-work units (strings, keys, nodes), not measured wire bytes
// or a browser memory guarantee. Stop estimating at the limit. Large individual
// records remain isolated; complete snapshots still require every ordered row.
export function getWorkerTransferPolicy(collectionName,env={}) {
  const isolated=['companies','employees','messages'].includes(collectionName);
  const balanced=!isolated&&env.VITE_WORKER_TRANSFER_PROFILE==='balanced-64k';
  return {maxRows:isolated?1:balanced?64:16,maxWork:balanced?65536:16384};
}

export function estimateTransferWork(value,limit=16384) {
  const stack=[value];let units=0;
  while(stack.length&&units<limit){
    const item=stack.pop();units+=8;
    if(typeof item==='string')units+=item.length;
    else if(item&&typeof item==='object'){
      if(item instanceof Date)continue;
      for(const key of Object.keys(item)){
        units+=key.length+8;stack.push(item[key]);if(units>=limit)break;
      }
    }
  }
  return Math.min(units,limit);
}

export function* createBudgetedTransferChunks(rows,encode,{maxRows=16,maxWork=16384}={}) {
  if(!(Array.isArray(rows)||rows&&typeof rows.next==='function'&&typeof rows[Symbol.iterator]==='function')
    ||typeof encode!=='function'||!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>64
    ||!Number.isSafeInteger(maxWork)||maxWork<1)throw new TypeError('Invalid worker transfer budget.');
  let chunk=[],work=0;
  for(const row of rows){
    const encoded=encode(row),cost=estimateTransferWork(encoded,maxWork);
    if(chunk.length&&(chunk.length>=maxRows||work+cost>maxWork)){yield chunk;chunk=[];work=0}
    chunk.push(encoded);work+=cost;
  }
  if(chunk.length)yield chunk;
}
