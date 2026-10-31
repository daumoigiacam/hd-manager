// Same conservative value/ID semantics as collectionIdentity, with a task
// boundary during deep traversal. No partial result is published or mutated.
const plain = value => [Object.prototype,null].includes(Object.getPrototypeOf(value));
function* retainValue(previous,next,budget,depth=0) {
  if (Object.is(previous,next)) return previous;
  if (!previous || !next || typeof previous!=='object' || typeof next!=='object' || depth>64) return next;
  const array=Array.isArray(next);
  if (array!==Array.isArray(previous) || (array ? previous.length!==next.length
    : !plain(previous)||!plain(next)||Object.getPrototypeOf(previous)!==Object.getPrototypeOf(next))) return next;
  const keys=Object.keys(next);let equal=keys.length===Object.keys(previous).length,result=next;
  for(let index=0;index<keys.length;index++){
    const key=keys[index];
    if(--budget.left<=0){budget.left=64;yield}
    const present=Object.hasOwn(previous,key),before=present?previous[key]:undefined,after=next[key];
    const value=!present?after:Object.is(before,after)?before
      :before&&after&&typeof before==='object'&&typeof after==='object'?yield* retainValue(before,after,budget,depth+1):after;
    if(equal && (!present || !Object.is(value,before))){
      equal=false;
      // Earlier children were all equal to the old children. Materialize that
      // prefix only after a real change; unchanged records allocate no copy.
      for(let prior=0;prior<index;prior++){
        if(--budget.left<=0){budget.left=64;yield}
        const prefixKey=keys[prior],retained=previous[prefixKey];
        if(Object.is(retained,next[prefixKey]))continue;
        if(result===next)result=array?next.slice():Object.setPrototypeOf({...next},Object.getPrototypeOf(next));
        Object.defineProperty(result,prefixKey,{value:retained,writable:true,enumerable:true,configurable:true});
      }
    }
    if(!equal && !Object.is(value,after)){
      if(result===next)result=array?next.slice():Object.setPrototypeOf({...next},Object.getPrototypeOf(next));
      Object.defineProperty(result,key,{value,writable:true,enumerable:true,configurable:true});
    }
  }
  return equal?previous:result;
}
function* lookup(rows,budget){
  const byId=new Map();
  for(const row of rows){
    if(--budget.left<=0){budget.left=64;yield}
    if(!row || typeof row!=='object' || !plain(row) || !Object.hasOwn(row,'id'))return null;
    const id=row.id;
    if(!((typeof id==='string'&&id.trim()!=='')||(typeof id==='number'&&Number.isFinite(id)))||byId.has(id))return null;
    byId.set(id,row);
  }
  return byId;
}
function* reconcile(previous,next){
  const budget={left:64};
  if(!Array.isArray(previous)||!Array.isArray(next))return yield* retainValue(previous,next,budget);
  const byId=yield* lookup(previous,budget);
  if(!byId || !(yield* lookup(next,budget)))return yield* retainValue(previous,next,budget);
  let result=next,unchanged=previous.length===next.length;
  for(let index=0;index<next.length;index++){
    if(--budget.left<=0){budget.left=64;yield}
    const row=next[index],retained=byId.has(row.id)?yield* retainValue(byId.get(row.id),row,budget):row;
    if(unchanged && !Object.is(retained,previous[index])){
      unchanged=false;
      for(let prior=0;prior<index;prior++){
        if(--budget.left<=0){budget.left=64;yield}
        if(Object.is(previous[prior],next[prior]))continue;
        if(result===next)result=next.slice();result[prior]=previous[prior];
      }
    }
    if(!unchanged && !Object.is(retained,row)){if(result===next)result=next.slice();result[index]=retained}
  }
  return unchanged?previous:result;
}
export async function retainCollectionRecordIdentityAsync(previous,next,{
  isCurrent=()=>true,yieldWork=()=>new Promise(resolve=>setTimeout(resolve,0)),now=()=>performance.now(),budgetMs=4,
}={}){
  if(!Number.isFinite(budgetMs)||budgetMs<=0)throw new TypeError('Invalid collection comparison budget.');
  const check=()=>{if(!isCurrent())throw Object.assign(new Error('Collection publication superseded.'),{name:'AbortError'})};
  check();const iterator=reconcile(previous,next);let deadline=now()+budgetMs;
  for(;;){
    check();const step=iterator.next();if(step.done)return step.value;
    if(now()>=deadline){await yieldWork();check();deadline=now()+budgetMs}
  }
}
