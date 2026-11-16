// One UI selection, not a business record/authority cache. Cancel releases the
// previous request; a hidden/unmounted view cannot resume a delayed send.
export function createMessageAttachmentSelection({isCurrent}){
 let pending=null;
 const cancel=()=>{const old=pending;pending=null;old?.resolve(null);};
 return Object.freeze({
  open(scope,items){cancel();if(!isCurrent(scope))return Promise.resolve(null);return new Promise(resolve=>{pending={scope,items:new Set(items),resolve};});},
  choose(scope,item){if(!pending||pending.scope!==scope)return false;if(!isCurrent(scope)){cancel();return false;}if(!pending.items.has(item))return false;const old=pending;pending=null;old.resolve(item);return true;},
  cancel,
 });
}
