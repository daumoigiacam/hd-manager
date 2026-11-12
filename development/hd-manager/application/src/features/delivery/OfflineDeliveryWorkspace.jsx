import React,{useEffect,useRef,useState} from 'react';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import {HDButton,HDBadge,HDInput,HDDateInput,HDEmptyState} from '../../design-system/components.jsx';
import OfflineDeliveryEditor from './OfflineDeliveryEditor.jsx';
import OfflineDeliveryPending from './OfflineDeliveryPending.jsx';
import {deliveryWriteAccess} from './offlineDeliveryEditorModel.js';
import {
  readOfflineDeliveryPage,readOfflineDeliveryDetail,deliveryReadAccess,deliveryReadError,
  storedDeliveryValue,deliveryWeightStatus,deliveryMovementStatus,deliveryDriverLabel,deliveryDateRange,
} from './offlineDeliveryModel.js';

function Fields({values}) {
  return <dl className="grid grid-cols-2 gap-2 text-sm">{values.map(([label,value])=><React.Fragment key={label}><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium">{storedDeliveryValue(value)}</dd></React.Fragment>)}</dl>;
}
function ReportFields({record}) {
  return <Fields values={[
    ['Sản phẩm',record.productNameSnapshot ?? record.productName],['Kg dự kiến',record.expectedWeightKg],['Kg thực tế',record.actualWeightKg],['Chênh lệch đã lưu',record.differenceKg],
    ['Số lượng dự kiến',record.expectedQuantity],['Đơn vị dự kiến',record.expectedQuantityUnit],['Số lượng thực tế',record.actualQuantity],['Đơn vị thực tế',record.actualQuantityUnit],
    ['Số bọc / kiện',record.actualPackageCount],['Đơn vị bọc / kiện',record.actualPackageUnit],['Đơn vị đặt',record.orderedUnit],['Đơn vị tính giá',record.pricingUnit],
    ['Đơn giá đã lưu',record.unitPrice],['Số lượng tính giá',record.pricingQuantity],['Thành tiền đã lưu',record.amount],['Giá trị tính giá đã lưu',record.pricingAmount],
    ['Tiền thu đã ghi',record.collectedAmount],['Hình thức thu',record.collectedMethod],['Trạng thái đối chiếu',record.reviewStatus],['Xử lý chênh lệch',record.resolutionStatus],['Ghi chú',record.note],
  ]}/>;
}

/** Active-screen reads only; the parent retains the SAME signed runtime owner. */
export default function OfflineDeliveryWorkspace({runtime,directory,onNavigate,deliveryRepository=null,onInitialContentReady}) {
  const [editor,setEditor]=useState(null),editorClose=useRef(null);
  const [draft,setDraft]=useState({text:'',from:'',through:'',employeeId:'',status:''});
  const [filters,setFilters]=useState({text:'',from:null,to:null,employeeId:null,status:null}),[filterError,setFilterError]=useState('');
  const [cursors,setCursors]=useState([null]),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0);
  const [loaded,setLoaded]=useState(null),[readState,setReadState]=useState(null),[detail,setDetail]=useState(null);
  const sync=runtime?.home?.status?.();
  const scopeKey=JSON.stringify(['projectId','tenantId','principalId','permissionRevision','sessionId'].map(key=>runtime?.scope?.[key]));
  const queryKey=JSON.stringify([scopeKey,filters,cursors[page]]),requestKey=JSON.stringify([queryKey,refresh,sync?.generation||'',sync?.seq??null]);
  const currentQuery=useRef(queryKey),currentRequest=useRef(requestKey),lastQuery=useRef(queryKey),readTask=useRef(null),loadedRef=useRef(loaded),detailTicket=useRef(0),detailPanel=useRef(null);
  currentQuery.current=queryKey;currentRequest.current=requestKey;loadedRef.current=loaded;
  useAppScreenBack(()=>{if(!runtime?.isCurrent?.())return false;if(editor){editorClose.current?.();return true;}if(detail?.key!==queryKey)return false;detailTicket.current++;setDetail(null);return true;});
  useEffect(()=>{let active=true;const stop=runtime.subscribe?.(topic=>{if(active&&topic==='deliveryReports')setRefresh(v=>v+1);});return()=>{active=false;stop?.();};},[runtime]);
  useEffect(()=>{if(detail?.key===queryKey)detailPanel.current?.focus();},[detail,queryKey]);
  useEffect(()=>{
    let active=true;
    if(lastQuery.current!==queryKey){lastQuery.current=queryKey;detailTicket.current++;setDetail(null);}
    if(loadedRef.current?.requestKey===requestKey&&loadedRef.current.result&&loadedRef.current.directory===directory)return;
    setReadState({key:requestKey,pending:true});
    if(readTask.current?.key!==requestKey||readTask.current.directory!==directory)readTask.current={key:requestKey,directory,promise:readOfflineDeliveryPage({runtime,directory,options:{...filters,cursor:cursors[page]}})};
    readTask.current.promise.then(result=>{
      if(!active||currentRequest.current!==requestKey)return;
      deliveryReadAccess(runtime,directory);
      setLoaded({key:queryKey,requestKey,directory,result});setReadState({key:requestKey,pending:false});
      setDetail(previous=>previous?.key===queryKey&&JSON.stringify(previous.checkpoint)!==JSON.stringify(result.metadata.checkpoint)?null:previous);
    }).catch(error=>{
      if(!active||currentRequest.current!==requestKey)return;
      readTask.current=null;
      const invalid=['permission-denied','unauthenticated','stale-checkpoint','source-unavailable'].includes(error.code);
      if(invalid){setLoaded(null);setDetail(null);detailTicket.current++;}
      setReadState({key:requestKey,pending:false,invalid,error:deliveryReadError(error)});
    });
    return()=>{active=false;};
  },[runtime,directory,queryKey,requestKey]);
  useEffect(()=>{if(loaded?.result&&loaded.directory===directory&&loaded.requestKey===currentRequest.current&&runtime.isCurrent())onInitialContentReady?.();},[loaded,directory,runtime,onInitialContentReady]);
  let accessError='';try{deliveryReadAccess(runtime,directory);}catch(error){accessError=deliveryReadError(error);}
  if(accessError)return <section className="space-y-3 p-4" role="status"><h1 className="text-xl font-black">Báo cáo giao hàng</h1><p>{runtime?.appSession?.sourceProfile==='native-isolation-v1'?'Nguồn native hiện tại chưa có ánh xạ báo cáo giao hàng của sản phẩm. Không hiển thị nguồn legacy trong phiên này.':accessError}</p>{onNavigate&&<HDButton variant="secondary" onClick={()=>onNavigate('home')}>Trang chủ</HDButton>}</section>;
  const invalid=readState?.key===requestKey&&readState.invalid;
  const checkpointChanged=loaded?.result&&sync?.generation&&Number.isSafeInteger(sync.seq)&&(loaded.result.metadata.checkpoint.generation!==sync.generation||loaded.result.metadata.checkpoint.seq!==sync.seq);
  const result=loaded?.key===queryKey&&!invalid&&!checkpointChanged?loaded.result:null;
  const activeDetail=detail?.key===queryKey&&!invalid&&!checkpointChanged?detail:null,checkpoint=result?.metadata.checkpoint;
  const error=readState?.key===requestKey?readState.error:null,pending=!result&&!error;
  const employees=(runtime.appSession.employees||[]).filter(row=>row.companyId===runtime.scope.tenantId);
  const reporter=id=>employees.find(employee=>employee.id===id)?.name||id||'Chưa ghi nhận';
  function apply(event){event.preventDefault();try{const range=deliveryDateRange(draft.from,draft.through);setFilters({...range,text:draft.text.trim(),employeeId:draft.employeeId||null,status:draft.status||null});setPage(0);setCursors([null]);setRefresh(value=>value+1);setFilterError('');}catch{setFilterError('Khoảng ngày chưa hợp lệ.');}}
  async function openDetail(item,orderCursor=null){if(editor)return;const ticket=++detailTicket.current,key=queryKey;setDetail({key,item,checkpoint,pending:true});try{
    const value=await readOfflineDeliveryDetail({runtime,directory,id:item.id,checkpoint,orderCursor});
    if(ticket===detailTicket.current&&currentQuery.current===key){deliveryReadAccess(runtime,directory);setDetail({key,item,checkpoint,value});}
  }catch(failure){if(ticket===detailTicket.current&&currentQuery.current===key)setDetail({key,item,checkpoint,error:deliveryReadError(failure)});}}
  return <section className="space-y-4 p-4 pb-24" data-offline-delivery>
    <header className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-slate-500">Giao hàng · Chứng từ đã lưu trên thiết bị</p><h1 className="text-xl font-black">Báo cáo giao hàng</h1></div>{onNavigate&&<HDButton variant="secondary" disabled={!!editor} onClick={()=>onNavigate('home')}>Trang chủ</HDButton>}</header>
    {!deliveryRepository?.ready&&<p className="rounded-xl bg-amber-50 p-3 text-sm">Chỉ xem. Giao thức giao hàng nguyên tử chưa sẵn sàng trong phiên này.</p>}
    {deliveryRepository?.ready&&<><HDButton disabled={!!editor||!deliveryWriteAccess(runtime,deliveryRepository,'deliveryReport.create')} onClick={()=>setEditor({id:null,readSource:'local'})}>Thêm báo cáo giao hàng</HDButton><OfflineDeliveryPending runtime={runtime} repository={deliveryRepository} disabled={!!editor} onOpen={id=>{if(!editor)setEditor({id,readSource:'local'});}}/></>}
    {editor&&deliveryRepository&&<OfflineDeliveryEditor key={JSON.stringify([scopeKey,editor])} runtime={runtime} repository={deliveryRepository} id={editor.id} readSource={editor.readSource} closeRequestRef={editorClose} onClose={()=>setEditor(null)} onSaved={()=>setRefresh(v=>v+1)}/>}
    <form onSubmit={apply} className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-2" aria-label="Lọc báo cáo giao hàng">
      <HDInput label="Tìm báo cáo" maxLength={128} value={draft.text} onChange={event=>setDraft({...draft,text:event.target.value})}/>
      <label className="grid gap-1 text-sm">Người báo cáo<select className="rounded-xl border p-2" value={draft.employeeId} onChange={event=>setDraft({...draft,employeeId:event.target.value})}><option value="">Tất cả trong phạm vi được cấp quyền</option>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.name||employee.id}</option>)}</select></label>
      <HDDateInput label="Từ ngày nghiệp vụ" value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/><HDDateInput label="Đến hết ngày" value={draft.through} onChange={event=>setDraft({...draft,through:event.target.value})}/>
      <label className="grid gap-1 text-sm">Đối chiếu cân đã lưu<select className="rounded-xl border p-2" value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value})}><option value="">Tất cả</option><option value="matched">Khớp</option><option value="short">Lệch · Thiếu</option><option value="over">Lệch · Dư</option><option value="not_measured">Chưa nhập kg</option><option value="reported">Đã ghi báo cáo</option></select></label>
      <div className="flex items-end gap-2"><HDButton type="submit">Áp dụng bộ lọc</HDButton><HDButton variant="secondary" onClick={()=>{setPage(0);setCursors([null]);setRefresh(value=>value+1);}}>Tải lại danh sách</HDButton></div>{filterError&&<p role="alert">{filterError}</p>}
    </form>
    <p role="status" className="text-sm text-slate-500">{checkpoint?`Nguồn hoàn tất đến ${checkpoint.dayKey} · Checkpoint ${checkpoint.seq} · ${sync?.state==='SYNCING'?'Đang đồng bộ, giữ bản hoàn tất':sync?.state==='SYNC_FAILED'?'Đồng bộ chưa thành công, giữ bản hoàn tất':'Bản hoàn tất trên thiết bị'}`:'Chưa có danh sách từ nguồn hoàn tất.'}</p>
    {pending&&<p role="status" aria-busy="true">Đang đọc báo cáo giao hàng…</p>}{error&&<p role="alert">{error}</p>}
    {result&&readState?.key===requestKey&&readState.pending&&<p role="status">Đang đối chiếu lại; giữ bản hoàn tất đang xem…</p>}
    {result?.items.length===0&&<HDEmptyState title="Không có báo cáo phù hợp" description="Hãy kiểm tra lại bộ lọc."/>}
    {result?.items.map(item=><article key={item.id} className="space-y-2 rounded-2xl border bg-white p-4"><h2 className="font-bold">{item.document.customerNameSnapshot||item.document.customerName||'Báo cáo giao hàng'}</h2><p className="break-all text-xs text-slate-500">{item.id} · {item.businessDate||'Chưa có ngày nghiệp vụ'}</p><p>{item.document.productNameSnapshot||item.document.productName||'Chưa ghi sản phẩm'}</p><div className="flex flex-wrap gap-2"><HDBadge>{deliveryWeightStatus(item.document)}</HDBadge><HDBadge>{deliveryMovementStatus(item.document)}</HDBadge></div><p className="text-sm">Người báo cáo: {reporter(item.document.empId||item.document.createdByEmpId)}</p><p className="text-sm">Tài xế trên phiếu: {deliveryDriverLabel(item.document,employees)}</p><HDButton variant="secondary" onClick={()=>{void openDetail(item);}}>Mở chi tiết</HDButton></article>)}
    {result&&<nav className="flex items-center justify-between gap-2" aria-label="Trang báo cáo giao hàng"><HDButton variant="secondary" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Trang trước</HDButton><span>Trang {page+1} · {result.items.length} báo cáo</span><HDButton variant="secondary" disabled={!result.hasMore} onClick={()=>{setCursors(old=>[...old.slice(0,page+1),result.nextCursor]);setPage(value=>value+1);}}>Trang sau</HDButton></nav>}
    {activeDetail&&<section ref={detailPanel} tabIndex={-1} className="space-y-3 rounded-2xl border-2 border-emerald-200 bg-white p-4" aria-label="Chi tiết giao hàng">
      <div className="flex justify-between gap-2"><h2 className="font-bold">Chi tiết báo cáo giao hàng</h2><HDButton variant="secondary" onClick={()=>{detailTicket.current++;setDetail(null);}}>Đóng chi tiết</HDButton></div>
      {activeDetail.pending&&<p role="status">Đang đối chiếu chứng từ liên quan…</p>}{activeDetail.error&&<p role="alert">{activeDetail.error}</p>}
      {activeDetail.value&&!activeDetail.value.report&&<p role="status">Không còn báo cáo này trong nguồn hoàn tất. Hãy tải lại danh sách.</p>}
      {activeDetail.value?.report&&<><ReportFields record={activeDetail.value.report.document}/><p className="text-xs text-slate-500">Đối chiếu cân không phải trạng thái hoàn tất giao hàng. Không tính lại giá, công nợ hoặc tổng giao hàng từ các trang này.</p>
        {deliveryRepository?.ready&&<HDButton variant="secondary" disabled={!!editor} onClick={()=>{if(!editor)setEditor({id:activeDetail.item.id,readSource:'feed'});}}>Mở bản nguồn để sửa / lưu trữ</HDButton>}
        <h3 className="font-bold">Phiếu xuất liên quan</h3>{activeDetail.value.dispatch?<Fields values={[
          ['Mã phiếu xuất',activeDetail.value.dispatch.id],['Ngày nghiệp vụ',activeDetail.value.dispatch.businessDate],['Sản phẩm',activeDetail.value.dispatch.document.productNameSnapshot??activeDetail.value.dispatch.document.productName],['Tài xế',deliveryDriverLabel(activeDetail.value.dispatch.document,employees)],['Trạng thái trên phiếu xuất',deliveryMovementStatus(activeDetail.value.dispatch.document)],
        ]}/>:<p>{activeDetail.value.dispatchState==='not-linked'?'Báo cáo không ghi mã phiếu xuất.':activeDetail.value.dispatchState==='missing'?'Không tìm thấy phiếu xuất trong bản nguồn hoàn tất.':'Chưa được cấp nguồn/quyền đối chiếu phiếu xuất.'}</p>}
        <h3 className="font-bold">Đơn hàng liên quan</h3>{activeDetail.value.orders.map(order=><div key={order.id} className="rounded-xl border p-3"><Fields values={[
          ['Mã đơn',order.document.orderCode??order.document.code??order.id],['Khách hàng',order.document.customerName],['Ngày nghiệp vụ',order.businessDate],['Trạng thái đã lưu',order.document.status],
        ]}/></div>)}{activeDetail.value.ordersState!=='found'&&<p>{activeDetail.value.ordersState==='missing'?'Không tìm thấy đơn hàng theo liên kết đã ghi trong nguồn hoàn tất.':'Chưa có bộ đọc/liên kết được cấp quyền để đối chiếu đơn hàng theo phiếu xuất; chưa thể kết luận không có đơn hàng.'}</p>}
        {activeDetail.value.nextOrderCursor&&<HDButton variant="secondary" onClick={()=>{void openDetail(activeDetail.item,activeDetail.value.nextOrderCursor);}}>Trang đơn liên quan tiếp theo</HDButton>}
      </>}
    </section>}
  </section>;
}
