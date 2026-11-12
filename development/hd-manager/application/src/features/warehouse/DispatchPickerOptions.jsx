import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {useVirtualizer} from '@tanstack/react-virtual';
import {getListPage} from '../../utils/listPage.js';
import {getAdaptivePerformancePolicy,subscribeAdaptivePerformance} from '../../services/adaptivePerformance.js';
/** @typedef {{id: string, label: string, detail: string}} PickerOption */
/** @typedef {{key:string,title:string}|{key:string,option:PickerOption,ordinal:number}} PickerRow */
/** @param {{groups: readonly {title?:string,options:readonly PickerOption[]}[],selectedId:string,queryKey:string,scrollRef:React.RefObject<HTMLDivElement|null>,onSelect:(id:string)=>void}} props */
export default function PickerOptions({groups,selectedId,queryKey,scrollRef,onSelect}){
 const resourcePolicy=useSyncExternalStore(subscribeAdaptivePerformance,getAdaptivePerformancePolicy,getAdaptivePerformancePolicy);
 /** @type {PickerRow[]} */
 const rows=useMemo(()=>{let ordinal=0;return groups.flatMap((group,groupIndex)=>[
  ...(group.title&&group.options.length?[{key:`header:${groupIndex}`,title:group.title}]:[]),
  ...group.options.map(option=>({key:`${groupIndex}:${option.id}`,option,ordinal:++ordinal})),
 ])},[groups]);
 const virtual=rows.length>60&&typeof ResizeObserver==='function';
 const fallback=rows.length>60&&!virtual;
 // The scroll ref belongs to the parent picker; attach observers after the
 // parent's DOM ref has committed, including when the popover first opens.
 const [mounted,setMounted]=useState(false);
 useEffect(()=>{setMounted(true)},[]);
 const [selection,setSelection]=useState({key:queryKey,page:0});
 const info=getListPage(rows.length,selection.key===queryKey?selection.page:0,20);
 const page={...info,items:rows.slice(info.start,info.end),setPage:(/** @type {number} */ value)=>setSelection({key:queryKey,page:value})};
 const virtualizer=useVirtualizer({count:rows.length,getScrollElement:()=>scrollRef.current,
  estimateSize:index=>'option' in rows[index]?64:30,overscan:resourcePolicy.overscan,enabled:virtual&&mounted,
  getItemKey:index=>rows[index].key,useFlushSync:false});
 const focusFrame=useRef(0);
 useEffect(()=>()=>cancelAnimationFrame(focusFrame.current),[]);
 useEffect(()=>{if(virtual)virtualizer.scrollToOffset(0)},[queryKey,virtual,virtualizer]);
 const optionCount=rows.reduce((sum,row)=>sum+Number('option' in row),0);
 /** @param {number} index @param {React.KeyboardEvent} event */
 function move(index,event){
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  let next=event.key==='Home'?0:event.key==='End'?rows.length-1:index+(event.key==='ArrowDown'?1:-1);
  const direction=event.key==='End'||event.key==='ArrowUp'?-1:1;
  while(next>=0&&next<rows.length&&!('option' in rows[next]))next+=direction;
  if(next<0||next>=rows.length)return;
  if(virtual)virtualizer.scrollToIndex(next,{align:'auto'});
  else if(fallback)page.setPage(Math.floor(next/20));
  cancelAnimationFrame(focusFrame.current);let attempts=0;
  const focus=()=>{const element=scrollRef.current?.querySelector(`[data-picker-option-index="${next}"]`);if(element instanceof HTMLElement)element.focus();else if(++attempts<8)focusFrame.current=requestAnimationFrame(focus)};
  focusFrame.current=requestAnimationFrame(focus);
 }
 /** @param {PickerRow} row @param {number} index */
 const render=(row,index)=>'option' in row?<button className="hd-dispatch-picker-option" type="button" role="option" aria-selected={selectedId===row.option.id}
  aria-setsize={optionCount} aria-posinset={row.ordinal} data-picker-option-index={index} key={row.key}
  onKeyDown={event=>move(index,event)} onClick={()=>onSelect(row.option.id)}>
   <span>{row.option.label}</span><small>{row.option.detail}</small>
  </button>:<p key={row.key} className="hd-dispatch-picker-group">{row.title}</p>;
 if(virtual)return <div data-hd-virtual-options={optionCount} style={{height:virtualizer.getTotalSize(),width:'100%',position:'relative'}}>
  {virtualizer.getVirtualItems().map(item=><div key={item.key} data-index={item.index} ref={virtualizer.measureElement}
    style={{position:'absolute',top:0,left:0,width:'100%',transform:`translateY(${item.start}px)`}}>{render(rows[item.index],item.index)}</div>)}
 </div>;
 if(fallback)return <>{page.items.map((row,index)=>render(row,page.start+index))}<div className="hd-dispatch-picker-pages">
  <button type="button" disabled={page.page===0} onClick={()=>page.setPage(page.page-1)}>Trước</button>
  <span>{page.start+1}–{page.end} / {rows.length}</span>
  <button type="button" disabled={page.end>=rows.length} onClick={()=>page.setPage(page.page+1)}>Sau</button>
 </div></>;
 return <>{rows.map(render)}</>;
}
