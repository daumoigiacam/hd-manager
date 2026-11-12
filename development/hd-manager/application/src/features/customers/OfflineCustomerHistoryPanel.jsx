import React,{useCallback,useEffect,useRef,useState} from 'react';
export default function OfflineCustomerHistoryPanel({runtime,customerId}){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const dayPart=type=>parts.find(p=>p.type===type).value;
 const today=dayPart('year')+'-'+dayPart('month')+'-'+dayPart('day');
 const [from,setFrom]=useState(today.slice(0,7)+'-01'),[to,setTo]=useState(new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),1)).toISOString().slice(0,10));
 const [page,setPage]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0);
 const load=useCallback(async(after=null)=>{const n=++generation.current;try{const value=await runtime.history.page({customerId,from,to,after,limit:20});if(n===generation.current)setPage(value);}catch(e){if(n===generation.current){setPage(null);setError(e.message);}}},[runtime,customerId,from,to]);
 useEffect(()=>{if(!runtime.history)return;void load();const off=runtime.subscribe(topic=>{if(!topic||topic==='history')void load();});return()=>{generation.current++;off();};},[runtime,load]);
 useEffect(()=>{
  if(!runtime.history||!navigator.onLine)return;
  const controller=new AbortController();let disposed=false;
  const deadline=setTimeout(()=>controller.abort(),15000);
  void(async()=>{try{for(const source of ['orders','payments','expenses']){if(controller.signal.aborted)break;await runtime.refreshHistory({customerId,from,to,source,sourceCursor:null,limit:20},controller.signal);}}catch(e){if(!disposed&&e.name!=='AbortError')setError(e.message);}finally{clearTimeout(deadline);}})();
  return()=>{disposed=true;clearTimeout(deadline);controller.abort();};
 },[runtime,customerId,from,to]);
 async function update(){setBusy(true);setError('');try{for(const source of ['orders','payments','expenses']){const coverage=page?.completeness.find(c=>c.source===source);await runtime.refreshHistory({customerId,from,to,source,sourceCursor:coverage?.status==='partial'?coverage.nextSourceCursor:null,limit:20});}await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(!runtime.history)return <p role="status">Phiên Offline này chưa được cấp quyền xem lịch sử giao dịch.</p>;
 return <section aria-label="Lịch sử giao dịch SQLite" className="bg-white border rounded-xl p-3 space-y-2">
  <h3 className="font-bold">Lịch sử giao dịch</h3>
  <div className="flex gap-2"><label>Từ ngày<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Đến trước ngày<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
  <p className="text-xs">Đọc chứng từ đã lưu trên máy. Lịch sử chưa đầy đủ khi có nguồn chưa tải hoặc còn trang tiếp theo.</p>
  {error&&<p role="alert">{error}</p>}
  {page?.completeness.map(c=><p key={c.source} className="text-xs">{c.source}: {c.status==='complete'?'Đã nhận đủ trang của snapshot':c.status==='partial'?'Còn trang chưa tải':'Chưa có dữ liệu đã xác minh'}{c.snapshotRevision?' · '+new Date(Math.floor(c.snapshotRevision/1000)).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):''}</p>)}
  {page?.records.map(r=><article key={r.historyId} className="border-t py-2"><strong>{r.document.code||r.document.id}</strong><p>{r.businessDate} · {r.source} · {r.localSyncState}</p><p>Giá trị chứng từ gốc: {String(r.document.total??r.document.amount??'Chưa xác định')} · {r.document.status||''}</p></article>)}
  {page?.records.length===0&&<p>Không có chứng từ trong phần lịch sử đã lưu cho khoảng này.</p>}
  <button type="button" disabled={busy} onClick={update}>{busy?'Đang lấy chứng từ':'Cập nhật / tải trang tiếp theo từ máy chủ'}</button>
  {page?.nextCursor&&<button type="button" onClick={()=>void load(page.nextCursor)}>Trang lịch sử cục bộ tiếp</button>}
 </section>;
}
