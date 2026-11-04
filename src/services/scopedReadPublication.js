// A deferred React updater must verify its owner again when React evaluates it,
// not only when a network callback queues it. Never applies to durable commands.
export function bindScopedReadPublication(setState,isCurrent){
 if(typeof setState!=='function'||typeof isCurrent!=='function')throw new TypeError('Scoped read publication requires an owner');
 return update=>{
  if(!isCurrent())return;
  setState(previous=>isCurrent()?(typeof update==='function'?update(previous):update):previous);
 };
}
