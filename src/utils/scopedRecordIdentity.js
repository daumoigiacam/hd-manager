// Stabilize a freshly calculated plain record; do not cache the calculation or
// its clock. Immutable nested references remain part of exact shallow equality.
// One current scope/value only; changing actor/date drops the prior identity.
export function createScopedRecordIdentity() {
 let scope,previous;
 const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 return (nextScope,next)=>{
  if(typeof nextScope!=='string'||!nextScope)throw new TypeError('Explicit record scope required.');
  if(scope===nextScope&&plain(previous)&&plain(next)){
   const keys=Object.keys(next);
   if(keys.length===Object.keys(previous).length&&keys.every(key=>Object.hasOwn(previous,key)&&Object.is(previous[key],next[key])))return previous;
  }
  scope=nextScope;previous=next;return next;
 };
}
