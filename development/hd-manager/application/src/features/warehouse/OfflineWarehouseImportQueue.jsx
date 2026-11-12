import React,{useEffect,useRef,useState} from 'react';
import {HDButton} from '../../design-system/components.jsx';
import {importStatusLabel} from './OfflineWarehouseImportEditor.jsx';
export default function OfflineWarehouseImportQueue({runtime,repository,onEdit,refreshToken,disabled=false}){
  const [loaded,setLoaded]=useState(null),[cursors,setCursors]=useState(['']),[page,setPage]=useState(0),[reload,setReload]=useState(0);
  const queryKey=JSON.stringify([runtime.scope,cursors[page]]),key=JSON.stringify([queryKey,reload,refreshToken]),current=useRef(key),attached=useRef(false),task=useRef(null);current.current=key;
  useEffect(()=>{let active=true;if(attached.current)setReload(n=>n+1);attached.current=true;const stop=runtime.subscribe?.(topic=>{if(active&&topic==='warehouseImports')setReload(n=>n+1);});return()=>{active=false;stop?.();};},[runtime,repository]);
  useEffect(()=>{let active=true;if(!runtime.isCurrent())return;if(task.current?.key!==key||task.current.repository!==repository)task.current={key,repository,promise:repository.page({after:cursors[page],limit:25})};task.current.promise.then(value=>{if(active&&current.current===key&&runtime.isCurrent())setLoaded({queryKey,key,value});}).catch(()=>{if(active&&current.current===key)setLoaded(old=>({...old,key,error:true}));});return()=>{active=false;};},[runtime,repository,key]);
  if(!runtime.isCurrent())return null;const value=loaded?.queryKey===queryKey?loaded.value:null;
  return <section aria-label="Ý định nhập kho và chi phí trên thiết bị" className="space-y-2 rounded-2xl border p-3"><div className="flex justify-between gap-2"><h2 className="font-bold">Phiếu nhập đã lưu trên thiết bị</h2><HDButton variant="secondary" onClick={()=>setReload(n=>n+1)}>Tải lại trạng thái nhập kho</HDButton></div>
    {loaded?.key===key&&loaded.error&&<p role="alert">Chưa đọc được trạng thái; không tạo lại phiếu trước khi kiểm tra hàng chờ.</p>}
    {!value&&!loaded?.error&&<p role="status">Đang đọc nhập kho và chi phí đã lưu…</p>}
    {value?.items.map(item=><article key={item.id} className="rounded-xl border p-3"><strong>{item.pair.document.groupName}</strong><p>{item.pair.document.date} · {importStatusLabel[item.state]||item.state}</p><p className="break-all text-xs">{item.id}</p><p>Phiếu chi đi kèm: {item.pair.expense?.isArchived?'Đã lưu trữ':item.pair.expense?'Có phiếu chi trong cùng ý định':'Không phát sinh chi phí'}</p><HDButton variant="secondary" disabled={disabled} onClick={()=>onEdit(item.id)}>Mở nhập kho / đối chiếu chi phí</HDButton></article>)}
    {value&&<nav aria-label="Trang ý định nhập kho" className="flex justify-between"><HDButton variant="secondary" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Trang trước</HDButton><span>Trang {page+1}</span><HDButton variant="secondary" disabled={!value.hasMore} onClick={()=>{setCursors(old=>[...old.slice(0,page+1),value.nextCursor]);setPage(n=>n+1);}}>Trang sau</HDButton></nav>}
  </section>;
}

