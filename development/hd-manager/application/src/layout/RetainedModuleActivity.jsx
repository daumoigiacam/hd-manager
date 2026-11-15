import React,{memo,useLayoutEffect,useState} from 'react';

// Hidden views retain their last committed props as well as their form state.
// Activity detaches effects while hidden, so a retained screen cannot keep
// active subscriptions or recalculate from unrelated background source updates.
const CommittedModule=memo(function CommittedModule({children}){return children;},(_previous,next)=>!next.active);

// The caller MUST key this boundary by the authenticated read/permission owner.
// This is one existing view, never a Runtime, connection, grant or data cache.
export default function RetainedModuleActivity({active,allowed,children}){
 const [visited,setVisited]=useState(()=>active&&allowed);
 useLayoutEffect(()=>{if(!allowed)setVisited(false);else if(active)setVisited(true);},[active,allowed]);
 if(!allowed||!active&&!visited)return null;
 return <React.Activity mode={active?'visible':'hidden'}><CommittedModule active={active}>{children}</CommittedModule></React.Activity>;
}
