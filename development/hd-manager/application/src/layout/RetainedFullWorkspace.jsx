import React,{useLayoutEffect}from'react';

// One full workspace for this actor. Losing connectivity hides it and pauses
// effects without destroying a draft. Reconnect alone does not select a route.
export default function RetainedFullWorkspace({scope,local,localView,onVisible,children,native}){
 useLayoutEffect(()=>{if(!local)onVisible(scope);},[scope,local,onVisible]);
 if(!native)return children;
 return <React.Fragment key={scope}>
  <React.Activity mode={local?'hidden':'visible'}>{children}</React.Activity>
  {local&&localView}
 </React.Fragment>;
}
