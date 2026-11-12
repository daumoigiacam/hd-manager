import React,{useEffect,useRef,useState} from 'react';
import {HDButton} from '../../design-system/components.jsx';
import {dispatchStatusLabel} from './warehouseDispatchAccess.js';
export default function OfflineWarehouseDispatchQueue({runtime,repository,onOpen,disabled=false,refreshToken=0}){
 const [page,setPage]=useState(null),[cursor,setCursor]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[epoch,setEpoch]=useState(0),attached=useRef(false),scopeKey=useRef(JSON.stringify(runtime.scope));
 useEffect(()=>{if(attached.current)setEpoch(n=>n+1);attached.current=true;const stop=runtime.subscribe?.(topic=>{if(topic==='warehouseDispatches')setEpoch(n=>n+1);});return()=>stop?.();},[runtime,repository]);
 useEffect(()=>{let active=true;setBusy(true);setError('');repository.page({after:cursor,limit:25}).then(value=>{if(active&&runtime.isCurrent())setPage(value);}).catch(e=>{if(active){setError(e.message);setPage(null);}}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[runtime,repository,cursor,epoch,refreshToken]);
 if(!runtime.isCurrent()||scopeKey.current!==JSON.stringify(runtime.scope))return null;
 return <section aria-label="Hàng chờ xuất kho" className="space-y-2"><h2>Phiếu xuất đã lưu trên thiết bị</h2><p>Ý định đang chờ không phải xác nhận tồn kho hoặc công nợ.</p>{error&&<p role="alert">{error}</p>}<ul aria-busy={busy}>{page?.items.map(row=><li key={row.id}><HDButton variant="secondary" disabled={disabled||busy||!!error} onClick={()=>onOpen(row.id)}>{row.id} · {row.document.customerNameSnapshot} · {dispatchStatusLabel[row.state]||row.state}</HDButton>{row.receipt?.reason&&<p>{row.receipt.reason}</p>}</li>)}</ul><HDButton variant="secondary" disabled={busy||!cursor} onClick={()=>setCursor('')}>Đầu hàng chờ</HDButton><HDButton variant="secondary" disabled={busy||!page?.hasMore} onClick={()=>setCursor(page.cursor)}>Trang hàng chờ tiếp</HDButton></section>;
}
