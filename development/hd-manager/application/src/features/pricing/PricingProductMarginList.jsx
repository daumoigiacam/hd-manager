import React,{useMemo,useState} from 'react';
import {normalizeSearchText} from '../../services/searchEngine.js';

const PAGE_SIZE=20;
// Presentation of the existing, already-loaded pricing catalog only. The
// parent's rules draft owns ALL margins, including products on other pages.
export default function PricingProductMarginList({rows,groupLabel,canEdit,onChange}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0);
 const filtered=useMemo(()=>{
  const terms=normalizeSearchText(query).split(' ').filter(Boolean);
  if(!terms.length)return rows;
  return rows.filter(row=>{const text=normalizeSearchText(row.productName+' '+row.productKey);return terms.every(term=>text.includes(term));});
 },[rows,query]);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),current=Math.min(page,pages-1);
 const visible=filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
 return <div className="space-y-2">
  <label className="block text-xs font-semibold text-gray-600">Tìm sản phẩm trong {groupLabel}
   <input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}
    className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>
  </label>
  {visible.map(row=><div key={row.productKey} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
   <div className="min-w-0"><p className="truncate text-sm font-black text-gray-900">{row.productName}</p>
    {row.inheritedFromGroup&&<p className="mt-0.5 text-[10px] font-semibold text-gray-400">Đang dùng biên độ nhóm cũ, hãy lưu để chuyển sang sản phẩm</p>}
   </div>
   <label className="flex w-24 shrink-0 items-center justify-center gap-1 rounded-xl bg-emerald-50 px-2 py-2 text-center">
    <input inputMode="decimal" value={row.targetMargin||''} onChange={e=>onChange(row.productKey,'targetMargin',e.target.value)} disabled={!canEdit}
     className="w-12 bg-transparent text-center text-base font-black text-emerald-700 outline-none disabled:text-gray-400" placeholder="0" aria-label={`Biên lợi nhuận ${row.productName}`}/>
    <span className="text-xs font-black text-emerald-700">%</span>
   </label>
  </div>)}
  {!visible.length&&<p className="px-2 py-2 text-xs font-bold text-gray-400">{rows.length?'Không có sản phẩm khớp tìm kiếm.':'Nhóm này chưa có sản phẩm trong catalog.'}</p>}
  {filtered.length>0&&<nav aria-label={`Trang biên lợi nhuận ${groupLabel}`} className="flex items-center justify-between gap-2 text-xs">
   <button type="button" disabled={current===0} onClick={()=>setPage(current-1)} className="rounded-lg border px-2 py-2 disabled:opacity-40">Trang trước</button>
   <span>{current*PAGE_SIZE+1}–{Math.min((current+1)*PAGE_SIZE,filtered.length)} / {filtered.length}</span>
   <button type="button" disabled={current===pages-1} onClick={()=>setPage(current+1)} className="rounded-lg border px-2 py-2 disabled:opacity-40">Trang sau</button>
  </nav>}
 </div>;
}
