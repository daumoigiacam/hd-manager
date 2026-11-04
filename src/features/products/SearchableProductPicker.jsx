import React,{useCallback,useEffect,useMemo,useRef,useState}from'react';
import DispatchSearchPicker from'../warehouse/DispatchSearchPicker.jsx';
import{usePreparedSearch}from'../../hooks/usePreparedSearch.js';
import{getProductSearchFields,hasSearchQuery}from'../../services/searchEngine.js';

// Reuse the existing virtualized picker and the one view-owned search index.
// A closed field has no option DOM/index preparation, even for a large catalog.
export default function SearchableProductPicker({products,value,onChange,label='Chọn sản phẩm'}){
 const[open,setOpen]=useState(false),[keyword,setKeyword]=useState('');
 const root=useRef(null),input=useRef(null);
 const selected=useMemo(()=>products.find(p=>p.id===value),[products,value]);
 const search=usePreparedSearch(products,getProductSearchFields,open?keyword:'');
 const records=hasSearchQuery(keyword)?search.results:products;
 const groups=useMemo(()=>[{options:open?records.map(product=>({id:product.id,label:product.name||product.shortName||product.id,detail:[product.category,product.unit].filter(Boolean).join(' • ')})):[]}],[open,records]);
 const changeOpen=useCallback(next=>{if(next&&!open)setKeyword('');setOpen(next)},[open]);
 useEffect(()=>{
  if(!open)return;
  const outside=event=>{if(root.current&&!root.current.contains(event.target))setOpen(false)};
  document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);
 },[open]);
 return <div ref={root}><DispatchSearchPicker value={open?keyword:selected?.name||''} selectedId={value||''} open={open}
  label={label} placeholder="Tìm tên hoặc mã sản phẩm" toggleLabel={`Mở ${label.toLowerCase()}`} emptyText="Không có sản phẩm phù hợp."
  showEmpty={!records.length} pending={search.pending} error={Boolean(search.error)} groups={groups} inputRef={input}
  onOpenChange={changeOpen} onChange={setKeyword} onSelect={id=>{onChange(id);setOpen(false);setKeyword('')}}/></div>;
}
