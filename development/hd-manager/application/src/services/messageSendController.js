export function createMessageSendController({isCurrent,makeId=()=>crypto.randomUUID(),now=()=>new Date().toISOString()}) {
  const pending=new Map(),inFlight=new Set();
  return {
    isBusy:scope=>inFlight.has(scope),
    async send({scope,action,payload,save}) {
      if(!isCurrent(scope))return {stale:true};
      if(inFlight.has(scope))return {busy:true};
      if(typeof save!=='function')throw new Error('Chưa có kết nối lưu tin nhắn cho hội thoại này.');
      const key=JSON.stringify([scope,action]),signature=JSON.stringify(payload);
      let intent=pending.get(key);
      if(!intent||intent.signature!==signature){intent={signature,payload:{...JSON.parse(signature),clientMutationId:makeId(),clientMutationAt:now()}};pending.set(key,intent);}
      inFlight.add(scope);
      try {
        const receipt=await save(intent.payload);
        if(!receipt||receipt.success===false||receipt.queued||receipt.confirmed===false)throw new Error('Máy chủ chưa xác nhận tin nhắn. Vui lòng thử lại.');
        if(pending.get(key)===intent)pending.delete(key);
        return isCurrent(scope)?{success:true,receipt}:{stale:true};
      } finally {inFlight.delete(scope);}
    },
    clearExcept(scope) {for(const key of pending.keys())if(JSON.parse(key)[0]!==scope)pending.delete(key);}
  };
}
