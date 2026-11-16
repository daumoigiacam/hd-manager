import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Reset the old, already-laid-out scroller before switching its contents. A
// write in the new page's first animation frame forces synchronous new layout.
export function useModuleScrollReset({
  activeTab,
  mainContentRef,
  onChange
}) {
  const latest = useRef(activeTab),
    previous = useRef(activeTab),
    prepared = useRef(null);
  latest.current = activeTab;
  const suspended=useRef(null);
  // Activity hides the same scroll container while Local access is shown.
  // Its layout may collapse to zero; restore only a reattachment of THIS tab.
  // Ordinary navigation still resets to the top and never inherits another tab.
  useLayoutEffect(()=>{
    const element=mainContentRef.current,prior=suspended.current;
    if(!element)return;
    if(prior?.tab===activeTab)element.scrollTop=prior.top;
    else suspended.current={tab:activeTab,top:0};
    // Record while visible, not during Activity cleanup after layout has
    // already collapsed. Exactly one passive observer belongs to this scroller.
    const remember=()=>{if(element.getClientRects().length)suspended.current={tab:activeTab,top:element.scrollTop};};
    element.addEventListener('scroll',remember,{passive:true});
    return()=>element.removeEventListener('scroll',remember);
  },[activeTab,mainContentRef]);
  const navigate = useCallback(next => {
    const target = typeof next === 'function' ? next(latest.current) : next;
    if (target === latest.current) return;
    const previousTab=latest.current,element=mainContentRef.current,top=element?.scrollTop||0;
    if (element) element.scrollTop = 0;
    prepared.current = target;
    latest.current = target;
    const accepted=onChange(target);
    if(accepted===false){
      prepared.current=null;latest.current=previousTab;
      if(element){element.scrollTop=top;suspended.current={tab:previousTab,top};}
      return false;
    }
    return accepted;
  }, [mainContentRef, onChange]);
  useEffect(() => {
    if (previous.current === activeTab) return undefined;
    previous.current = activeTab;
    if (prepared.current === activeTab) {
      prepared.current = null;
      return undefined;
    }
    // A route restored/changed by the parent bypasses navigate. Preserve the
    // prior behavior for that path, and cancel it if another route supersedes it.
    const frame = requestAnimationFrame(() => {
      if (mainContentRef.current) mainContentRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, mainContentRef]);
  return navigate;
}
