// Server receipt is not a committed React collection. Track exact immutable
// publication identities across deferred/no-op state updates and scope teardown.
export function createCollectionCommitWitness({isCurrent=()=>true,getCommittedStates=()=>({}),onCommitted=()=>{},
  schedule=callback=>setTimeout(callback,0),cancel=clearTimeout}={}) {
  const generations=new Map(),pending=new Map();const unset=Symbol('unset');
  let closed=false,timer=null;
  const valid=()=>!closed&&isCurrent();
  const confirmCommitted=(states=getCommittedStates())=>{
    if(!valid())return;
    for(const [collection,entry] of pending){
      if(entry.value!==unset&&states[collection]===entry.value){pending.delete(collection);onCommitted(collection)}
    }
  };
  return {
    begin(collection){
      if(!valid())return null;
      const generation=(generations.get(collection)||0)+1;generations.set(collection,generation);
      pending.set(collection,{generation,value:unset});return generation;
    },
    isPublicationCurrent(collection,generation){return valid()&&generations.get(collection)===generation},
    hasPublication(collection){return valid()&&generations.has(collection)},
    expectCommit(collection,generation,value){
      if(!valid())return;
      const entry=pending.get(collection);if(entry?.generation===generation)entry.value=value;
    },
    publicationScheduled(){
      if(!valid())return;confirmCommitted();
      if(timer!==null)return;
      timer=schedule(()=>{timer=null;confirmCommitted()});
    },
    confirmCommitted,
    close(){closed=true;if(timer!==null)cancel(timer);timer=null;pending.clear();generations.clear()},
  };
}
