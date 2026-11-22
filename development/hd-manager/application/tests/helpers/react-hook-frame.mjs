import React from 'react';
function hooks() {
  const slots=[];let cursor=0,pending=[],dirty=false;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
  return {
    begin(){cursor=0;pending=[];dirty=false;},commit(){pending.forEach(effect=>effect());return dirty;},
    unmount(){slots.forEach(slot=>slot?.cleanup?.());},
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};
      return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;
        if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
    useMemo(calculate,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:calculate(),deps};return slots[i].value;},
    useEffect(effect,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){
      const previous=slots[i];slots[i]={deps};pending.push(()=>{previous?.cleanup?.();slots[i].cleanup=effect();});}}
  };
}
const nodes=(node,predicate,out=[])=>{
  if(!node||typeof node!=='object')return out;
  if(predicate(node))out.push(node);
  React.Children.forEach(node.props?.children,child=>nodes(child,predicate,out));return out;
};
const text=node=>typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node?.props?.children).map(text).join('');

export {hooks,nodes,text};
