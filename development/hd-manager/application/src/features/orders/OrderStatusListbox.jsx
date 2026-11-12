import React,{useId,useLayoutEffect,useRef,useState} from 'react';

// Only the Orders status filter uses this inline control. No system popup,
// query scheduling, or data ownership lives here.
export default function OrderStatusListbox({label,value,options,onChange,className,owner,active=true}){
 const id=useId(),root=useRef(null),trigger=useRef(null),list=useRef(null);
 const [expanded,setExpanded]=useState(null),typed=useRef({text:'',at:0});
 const open=Boolean(active&&expanded&&expanded.owner===owner);
 const selected=Math.max(0,options.findIndex(option=>option.value===value));
 const index=open?Math.min(expanded.index,options.length-1):selected;
 const close=(restoreFocus=true)=>{
  setExpanded(null);typed.current={text:'',at:0};
  if(restoreFocus&&active&&trigger.current?.isConnected)trigger.current.focus();
 };
 const begin=(position=selected)=>{
  if(!active||!options.length)return;
  typed.current={text:'',at:0};setExpanded({owner,index:position});
 };
 const choose=position=>{
  if(!open||!options[position])return;
  const next=options[position].value;close();if(next!==value)onChange(next);
 };
 useLayoutEffect(()=>{
  if(!open)return;
  const document=root.current.ownerDocument,window=document.defaultView;
  const outside=event=>{if(!root.current?.contains(event.target))close(false);};
  const back=event=>{
   if(event.defaultPrevented||event.detail?.handled)return;
   if(event.detail)event.detail.handled=true;
   event.preventDefault();close();
  };
  const visibility=()=>{if(document.visibilityState==='hidden')close(false);};
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('hd-manager-screen-back',back,true);
  list.current?.focus({preventScroll:true});
  return()=>{
   document.removeEventListener('pointerdown',outside,true);
   document.removeEventListener('visibilitychange',visibility);
   window.removeEventListener('hd-manager-screen-back',back,true);
   // React Activity disconnects layout effects when hidden. Do not reopen or
   // steal focus when the retained Orders screen becomes visible again.
   setExpanded(null);
  };
 },[open,owner]);
 useLayoutEffect(()=>{if(open)list.current?.children[index]?.scrollIntoView({block:'nearest'});},[open,index]);
 const keyboard=event=>{
  if(event.nativeEvent?.isComposing||event.isComposing)return;
  const key=event.key;
  if(!open){
   if(['ArrowDown','ArrowUp','Enter',' ','Home','End'].includes(key)){
    event.preventDefault();begin(key==='Home'?0:key==='End'?options.length-1:selected);
   }
   return;
  }
  if(key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  // Let the browser move focus first; onBlur closes without trapping Tab.
  if(key==='Tab')return;
  if(key==='Enter'||key===' '){event.preventDefault();choose(index);return;}
  let next;
  if(key==='ArrowDown')next=(index+1)%options.length;
  else if(key==='ArrowUp')next=(index-1+options.length)%options.length;
  else if(key==='Home')next=0;
  else if(key==='End')next=options.length-1;
  else if(key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   const now=Date.now(),previous=typed.current;
   const text=(now-previous.at>700?key:previous.text+key).slice(-64);
   typed.current={text,at:now};
   const prefix=[...text].every(char=>char===text[0])?text[0]:text;
   for(let offset=1;offset<=options.length;offset++){
    const candidate=(index+offset)%options.length;
    if(options[candidate].label.toLocaleLowerCase('vi').startsWith(prefix.toLocaleLowerCase('vi'))){next=candidate;break;}
   }
  }else return;
  event.preventDefault();if(next!==undefined)setExpanded({owner,index:next});
 };
 return <div ref={root} className="relative min-w-0" onKeyDown={keyboard} onBlur={event=>{if(open&&!event.currentTarget.contains(event.relatedTarget))close(false);}}>
  <button ref={trigger} type="button" className={className+' w-full text-left focus-visible:ring-2 focus-visible:ring-emerald-600'} aria-label={label} aria-describedby={id+'-value'} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id+'-list':undefined} disabled={!active} onClick={()=>open?close():begin()}>
   <span id={id+'-value'}>{options[selected]?.label||label}</span><span aria-hidden="true"> ▾</span>
  </button>
  {open&&<div ref={list} id={id+'-list'} role="listbox" aria-label={label} aria-activedescendant={id+'-option-'+index} tabIndex={-1} className="absolute left-0 top-full z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-xl border bg-white p-1 text-sm text-gray-900 shadow-lg outline-none">
   {options.map((option,position)=><button key={option.value} id={id+'-option-'+position} type="button" role="option" aria-selected={option.value===value} tabIndex={-1} className={'block w-full rounded-lg p-3 text-left '+(position===index?'bg-emerald-100 ring-1 ring-inset ring-emerald-600':'hover:bg-gray-100')} onPointerMove={()=>{if(position!==index)setExpanded({owner,index:position});}} onClick={()=>choose(position)}>{option.label}</button>)}
  </div>}
 </div>;
}
