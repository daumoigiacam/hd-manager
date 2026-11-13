import React,{useEffect,useLayoutEffect,useCallback,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {HDButton} from '../../design-system/index.js';
import {createOrderSearchState} from '../../services/orderSearchState.js';
import OrderSearchInput from './OrderSearchInput.jsx';
import OrderStatusListbox from './OrderStatusListbox.jsx';
import {createOrderProductAdapter} from './orderProductAdapter.js';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import {ordersRelevantTopic,ordersQueryKey,retainedPagination,ordersPageMatches} from './ordersRetainedState.js';
import {searchMark,startSearchTrace} from '../../data/crmSearchTrace.js';

const money=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('vi-VN')+' ₫':'Chưa có số tiền';
const statusNames={SERVER_CONFIRMED:'Bản máy chủ đã tải',SYNCED:'Đã đồng bộ',LOCAL_ONLY:'Chỉ trên thiết bị',PENDING_SYNC:'Đã lưu · chờ đồng bộ',SYNCING:'Đang đồng bộ',SYNC_FAILED:'Đồng bộ lỗi',CONFLICT_REQUIRES_REVIEW:'Cần đối soát'};
const current=runtime=>runtime?.isCurrent?.()&&Date.now()<runtime.expiresAtMs;
const errorText=error=>error?.message||'Không thể đọc đơn hàng. Vui lòng thử lại.';
const field='rounded-xl border bg-white p-3 text-sm text-gray-900';

// Lazy route contract: default({runtime,onNavigate}). The owner provides one
// shared business directory and an Orders-specific full-history reader/writer.
export default function SQLiteProductOrders({runtime,onNavigate,orderSearchIntent}){
 const [epoch,setEpoch]=useState(0);
 useEffect(()=>{const release=runtime?.subscribe?.(topic=>{if(!current(runtime)||ordersRelevantTopic(topic))setEpoch(n=>n+1);});
  const timer=setTimeout(()=>setEpoch(n=>n+1),Math.max(0,(runtime?.expiresAtMs||0)-Date.now())+1);
  return()=>{release?.();clearTimeout(timer);};},[runtime]);
 if(!current(runtime)||!runtime.capabilities?.includes('orders.read'))return <section role="alert" className="p-4">Phiên đơn hàng không còn quyền truy cập.</section>;
 if(runtime.appSession?.sourceProfile==='native-isolation-v1')return <section role="alert" className="p-4">Nguồn native hiện chưa có giao thức đơn hàng sản phẩm.</section>;
 if(!runtime.business)return <section role="alert" className="p-4">Chưa nối danh mục dùng chung runtime.business. Chưa thể đọc đơn.</section>;
 return <OrdersWorkspace key={JSON.stringify(runtime.scope)} runtime={runtime} onNavigate={onNavigate} epoch={epoch} orderSearchIntent={orderSearchIntent}/>;
}

// A pending query retains readable rows without dimming/repainting the page.
// Disabled remains a real DOM property; authorization/publication gates above
// are unchanged. Amount formatting is reused while only pending state changes.
const OrderListItem=React.memo(function OrderListItem({order,disabled,onSelect}){
 const amount=useMemo(()=>money(order.amount),[order.amount]);
 const open=useCallback(()=>onSelect(order.id),[order.id,onSelect]);
 return <li><button type="button" disabled={disabled} className="flex w-full items-center justify-between gap-4 rounded-xl border bg-white p-4 text-left" onClick={open}>
  <span><strong>{order.code}</strong><span className="block text-sm text-gray-600">{order.date} · {order.customerName||order.customerId}</span><span className="block text-sm">{statusNames[order.localSyncState]||'Chưa xác định trạng thái'}</span></span><span>{amount}</span>
 </button></li>;
});

function OrdersWorkspace({runtime,onNavigate,epoch,orderSearchIntent}){
 const searchStore=useMemo(()=>createOrderSearchState(),[]);
 const search=useSyncExternalStore(searchStore.subscribe,searchStore.getSnapshot);
 const [draftSearch,setDraftSearch]=useState(search);
 const [filters,setFilters]=useState({from:'',to:'',state:''});
 const queryKey=ordersQueryKey(runtime.scope,search,filters);
 const [savedPagination,setPagination]=useState(()=>({key:queryKey,cursors:[null],index:0}));
 const {cursors,index}=retainedPagination(savedPagination,queryKey),cursor=cursors[index];
 const [repo,setRepo]=useState(null),[page,setPage]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [selected,setSelected]=useState(''),[creating,setCreating]=useState(false),[refresh,setRefresh]=useState(0);
 const consumedHomeSearch=useRef(null);
 useEffect(()=>{
  // A Home search uses the existing indexed SQLite query. It never closes a
  // draft/detail or replaces its inputs; apply the latest intent after closing.
  if(!orderSearchIntent||consumedHomeSearch.current===orderSearchIntent||creating||selected)return;
  consumedHomeSearch.current=orderSearchIntent;
  searchStore.set(orderSearchIntent.query);setDraftSearch(orderSearchIntent.query);
 },[orderSearchIntent,creating,selected,searchStore]);
 const [notice,setNotice]=useState('');
 const selectOrder=useCallback(id=>setSelected(id),[]);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const createClose=useRef(null),detailClose=useRef(null),adapterOwner=useRef(null),completedQuery=useRef(null),pageTrace=useRef(0);
 useAppScreenBack(()=>{if(creating){createClose.current?.();return true;}if(selected){if(detailClose.current)detailClose.current();else setSelected('');return true;}if(filtersOpen){setFiltersOpen(false);return true;}return false;});
 useEffect(()=>{let active=true;
  if(adapterOwner.current?.runtime!==runtime){adapterOwner.current={runtime,promise:Promise.all([Promise.resolve().then(()=>typeof runtime.business==='function'?runtime.business():runtime.business),Promise.resolve().then(()=>typeof runtime.orderProduct==='function'?runtime.orderProduct():runtime.orderProduct)])
   .then(([business,product])=>createOrderProductAdapter({business,product,capabilities:runtime.capabilities}))};}
  adapterOwner.current.promise.then(value=>{if(active&&current(runtime))setRepo(previous=>previous===value?previous:value);}).catch(e=>{if(active){completedQuery.current=null;setError(errorText(e));setBusy(false);}});
  return()=>{active=false;};},[runtime]);
 useEffect(()=>{setPagination(previous=>retainedPagination(previous,queryKey));},[queryKey]);
 // Activity reattaches this validation, keeping retained rows visible. The
 // layout effect disables actions before a re-shown screen can use stale proof.
 useLayoutEffect(()=>{setBusy(true);},[repo,runtime,queryKey,cursor,epoch,refresh]);
 useEffect(()=>{if(!repo){completedQuery.current=null;return;}let active=true;setError('');
  const traceId=startSearchTrace('orders-page-effect');pageTrace.current=traceId;
  const identity={repo,runtime,queryKey,positionKey:JSON.stringify(cursor),epoch,refresh};
  const completed=completedQuery.current;
  const reuse=!!completed&&Object.keys(identity).every(key=>identity[key]===completed[key])&&typeof repo.verifyReadAccess==='function';
  // Only the last successfully published query may survive Activity detach.
  // Query/owner/epoch/refresh changes and all errors require a real page read.
  if(!reuse)completedQuery.current=null;
  const invalidate=()=>{if(active||(reuse&&completedQuery.current===completed))completedQuery.current=null;};
  const read=async()=>{
   if(reuse){
    // Main's adapter checks the existing signed read lease without source SQL.
    // Retain row objects, cursor, selection and drafts while authority is checked.
    searchMark(traceId,'orders-reuse-authorize-start');
    await repo.verifyReadAccess(search);
    searchMark(traceId,'orders-reuse-authorize-end');
    if(active){if(current(runtime))completedQuery.current=identity;else invalidate();}
    return;
   }
   searchMark(traceId,'orders-repo-page-start');
   const value=await repo.page({...filters,search,after:cursor,limit:25});
   searchMark(traceId,'orders-repo-page-end',{rows:value.rows.length});
   if(active){if(current(runtime)){searchMark(traceId,'orders-page-publish');setPage({...value,queryKey,positionKey:identity.positionKey});completedQuery.current=identity;}else{searchMark(traceId,'orders-page-discard');invalidate();}}else searchMark(traceId,'orders-page-discard');
  };
  void read().catch(e=>{invalidate();if(active){setError(errorText(e));if(e.code==='permission-denied'||e.code==='unauthenticated')setPage(null);}}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;searchMark(traceId,'orders-effect-detach');};
 },[repo,runtime,queryKey,cursor,epoch,refresh]);
 useLayoutEffect(()=>{searchMark(pageTrace.current,'orders-dom-commit',{busy,rows:page?.rows.length||0,error:!!error});},[busy,page,error]);
 const actionsSafe=ordersPageMatches(page,queryKey,cursor)&&draftSearch===search&&!busy&&!error&&current(runtime);
 const restart=()=>{setPagination({key:queryKey,cursors:[null],index:0});setRefresh(n=>n+1);};
 const setFilter=(key,value)=>setFilters(previous=>({...previous,[key]:value}));
 const creationCapabilities=repo?.creationCapabilities||['orders.create'];
 const missingCreationCapabilities=creationCapabilities.filter(cap=>!runtime.capabilities.includes(cap));
 const canCreate=!!runtime.orderProduct&&missingCreationCapabilities.length===0;
 // A new manual order does not consume the active search result. Retain the
 // first verified page/error/session gates, and recheck time on the click.
 // The form's lookup/preview/write authorization remains independent.
 const creationReady=!!repo&&canCreate&&!!page&&!error&&current(runtime);
 return <section aria-label="Đơn hàng" className="mx-auto max-w-5xl space-y-4 p-4">
  <header className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Đơn hàng</h1><p className="text-sm text-gray-600">Chọn bản máy chủ đã tải hoặc giao dịch tạo trên thiết bị</p></div>
   <div className="flex gap-2">{onNavigate&&<HDButton variant="secondary" onClick={()=>onNavigate('home')}>Trang chủ</HDButton>}<HDButton disabled={!creationReady} onClick={()=>{if(creationReady&&current(runtime))setCreating(true);}}>Tạo đơn thủ công</HDButton></div></header>
  {!canCreate&&<p className="text-sm text-gray-600">Chưa thể tạo đơn: {!runtime.orderProduct?'thiếu runtime.orderProduct':('thiếu quyền đã ký '+missingCreationCapabilities.join(', '))}.</p>}
  <div className="flex rounded-xl border bg-white p-1" onKeyDownCapture={event=>{if(event.key==='Enter'&&(event.nativeEvent?.isComposing||event.nativeEvent?.keyCode===229))event.stopPropagation();}}><OrderSearchInput searchStore={searchStore} commitDelayMs={0} onDraftChange={setDraftSearch} onCommit={value=>{searchStore.set(value);setDraftSearch(value);}} onClose={()=>{searchStore.set('');setDraftSearch('');}} placeholder="Tìm mã đơn, mã khách hoặc sản phẩm" className="min-w-0 flex-1 bg-transparent p-2 outline-none"/></div>
  <HDButton variant="secondary" onClick={()=>setFiltersOpen(value=>!value)}>{filtersOpen?'Đóng bộ lọc':'Bộ lọc'}</HDButton>
  {filtersOpen&&<div className="flex flex-wrap gap-2"><label className="text-sm">Từ ngày <input aria-label="Từ ngày" type="date" className={field} value={filters.from} onChange={e=>setFilter('from',e.target.value)}/></label>
   <label className="text-sm">Đến ngày <input aria-label="Đến ngày" type="date" className={field} value={filters.to} onChange={e=>setFilter('to',e.target.value)}/></label>
   <OrderStatusListbox label="Nguồn và trạng thái đơn" className={field} owner={runtime} active={!selected&&!creating} value={filters.state} onChange={value=>setFilter('state',value)} options={[{value:'',label:'Đơn máy chủ đã tải'},...Object.entries(statusNames).filter(([value])=>value!=='SERVER_CONFIRMED').map(([value,label])=>({value,label:`Tạo trên thiết bị · ${label}`}))]}/>
   </div>}
  <HDButton variant="secondary" onClick={restart}>Tải lại từ đầu</HDButton>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-blue-50 p-3">{notice}</p>}
  <p role="status" aria-live="polite" aria-atomic="true" className="min-h-6 text-sm text-gray-600">{busy?'Đang đọc đơn hàng…':'\u00a0'}</p>
  {!busy&&page?.rows.length===0&&<p>Không có đơn phù hợp trong bản dữ liệu đã tải.</p>}
  <ul aria-label="Danh sách đơn" aria-busy={busy} className="space-y-2">{page?.rows.map(order=><OrderListItem key={order.id} order={order} disabled={!actionsSafe} onSelect={selectOrder}/>)}</ul>
  {page&&<nav aria-label="Phân trang đơn hàng" className="flex items-center justify-center gap-4"><HDButton variant="secondary" disabled={!actionsSafe||index===0} onClick={()=>setPagination({key:queryKey,cursors,index:index-1})}>Trang trước</HDButton><span>Trang {index+1}</span><HDButton variant="secondary" disabled={!actionsSafe||!page.nextCursor} onClick={()=>setPagination({key:queryKey,cursors:[...cursors.slice(0,index+1),page.nextCursor],index:index+1})}>Trang sau</HDButton></nav>}
  <p className="text-sm text-gray-600">Danh sách không dùng số trang để tính công nợ. Sửa ghi chú/lưu trữ dùng CAS khi được cấp quyền. Giá, phí, thu tiền, QR và xuất kho cần luồng nghiệp vụ riêng.</p>
  {selected&&repo&&<OrderDetail key={selected} identity={selected} repo={repo} runtime={runtime} epoch={epoch} closeRequest={detailClose} onChanged={result=>{runtime.notifySync?.();setRefresh(n=>n+1);setNotice(result.entityId+' · '+statusNames[result.state]);}} onClose={()=>setSelected('')}/>}
  {creating&&repo&&<ManualOrderForm repo={repo} runtime={runtime} closeRequest={createClose} onClose={()=>setCreating(false)} onSaved={result=>{setCreating(false);setFilters(previous=>({...previous,state:result.state}));restart();setNotice(result.entityId+' · '+(statusNames[result.state]||'Cần kiểm tra trạng thái'));}}/>}
 </section>;
}

function useCloseRequest(closeRequest,handler){
 const latest=useRef(handler);latest.current=handler;
 useEffect(()=>{if(!closeRequest)return;const callback=()=>latest.current();closeRequest.current=callback;return()=>{if(closeRequest.current===callback)closeRequest.current=null;};},[closeRequest]);
}
function Panel({title,onClose,children}){
 const root=useRef(null),focus=useRef(null);
 useEffect(()=>{const previous=document.activeElement;(focus.current||root.current?.querySelector('button'))?.focus();return()=>{if(root.current?.contains(document.activeElement))focus.current=document.activeElement;previous?.focus?.();};},[]);
 const keyboard=event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}if(event.key==='Tab'){
  const fields=[...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(node=>!node.matches(':disabled'));
  const first=fields[0],last=fields.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }};
 return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3"><section ref={root} onKeyDown={keyboard} role="dialog" aria-modal="true" aria-label={title} className="mx-auto max-w-2xl space-y-4 rounded-2xl bg-white p-4"><header className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><HDButton variant="secondary" onClick={onClose}>Đóng</HDButton></header>{children}</section></div>;
}
function OrderDetail({identity,repo,runtime,onClose,closeRequest,epoch,onChanged}){
 const [detail,setDetail]=useState(null),[ledger,setLedger]=useState(null),[error,setError]=useState(''),[ledgerError,setLedgerError]=useState('');
 const [validated,setValidated]=useState(false),[editing,setEditing]=useState(null),[reload,setReload]=useState(0),editorClose=useRef(null);
 const [ledgerState,setLedgerState]=useState('idle'),ledgerController=useRef(null);
 const cancelLedger=()=>{const controller=ledgerController.current;ledgerController.current=null;controller?.abort();};
 const requestClose=()=>{cancelLedger();if(editing){editorClose.current?.();return true;}onClose();return true;};
 useCloseRequest(closeRequest,requestClose);
 useLayoutEffect(()=>{setValidated(false);},[repo,runtime,identity,epoch,reload]);
 useEffect(()=>{let active=true;setError('');
  repo.detail(identity).then(value=>{if(!active||!current(runtime))return;if(!value)throw Error('Đơn không còn trong bản dữ liệu hiện tại');setDetail(value);setValidated(true);
  }).catch(e=>{if(active){setError(errorText(e));setValidated(false);}});return()=>{active=false;};},[repo,runtime,identity,epoch,reload]);
 useEffect(()=>{setLedger(null);setLedgerError('');setLedgerState('idle');return()=>cancelLedger();},[repo,runtime,identity,epoch,reload,editing]);
 const requestLedger=async()=>{
  if(!validated||!detail||editing||!current(runtime))return;
  cancelLedger();const controller=new AbortController();ledgerController.current=controller;
  setLedger(null);setLedgerError('');setLedgerState('loading');
  try{const result=await repo.ledger(detail.customerId,detail.checkpoint,{signal:controller.signal});
   if(ledgerController.current===controller&&!controller.signal.aborted&&current(runtime)){setLedger({...result,checkpointKey:JSON.stringify(detail.checkpoint)});setLedgerState(result.status==='complete'?'complete':'withheld');}
  }catch(failure){if(ledgerController.current===controller&&current(runtime)){if(failure.name==='AbortError')setLedgerState('cancelled');else{setLedgerError(errorText(failure));setLedgerState('error');}}}
  finally{if(ledgerController.current===controller)ledgerController.current=null;}
 };
 const shownLedger=validated&&!ledgerError&&ledger?.checkpointKey===JSON.stringify(detail?.checkpoint)?ledger:null;
 const allocation=shownLedger?.status==='complete'?shownLedger.orders.find(row=>row.id===identity):null;
 const edit=(kind,resolve=false)=>{cancelLedger();setEditing({kind,note:detail.note,isArchived:resolve?detail.archived:!detail.archived,baseToken:resolve?detail.mutation.conflict.reviewToken:detail.mutation.editToken,resolvesConflictId:resolve?detail.mutation.conflict.commandId:null,serverNote:detail.mutation.conflict?.serverNote,serverArchived:detail.mutation.conflict?.serverArchived});};
 if(editing)return <OrderChangeForm identity={identity} repo={repo} runtime={runtime} draft={editing} closeRequest={editorClose} onClose={()=>setEditing(null)} onSaved={result=>{setEditing(null);setReload(value=>value+1);onChanged(result);}}/>;
 return <Panel title="Chi tiết đơn hàng" onClose={requestClose}>{error&&<p role="alert">{error}</p>}{!detail&&!error&&<p role="status">Đang đọc chi tiết…</p>}{detail&&<>
  <p><strong>{detail.code}</strong> · {detail.date}</p><p>Khách hàng: {detail.customerName||detail.customerId}</p><p>{statusNames[detail.localSyncState]}</p>
  <ul className="space-y-3">{detail.items.map((line,index)=><li key={index} className="rounded-xl border p-3"><strong>{line.name||line.productId}</strong><p>Số lượng: {line.quantity} {line.unit}</p><p>Tính giá: {line.billingQuantity} {line.billingUnit} × {money(line.unitPrice)}</p><p>Thành tiền: {money(line.amount)}</p></li>)}</ul>
  <p>Tổng giá trị đơn: <strong>{money(detail.amount)}</strong></p>{detail.note&&<p>Ghi chú: {detail.note}</p>}
  <section className="space-y-2" aria-label="Thay đổi đơn an toàn" data-order-detail-ready={validated?'true':'false'}><h3 className="font-semibold">Sửa ghi chú / lưu trữ bằng CAS</h3>
   {!detail.mutation?.protocolReady&&<p>Chưa nối giao thức CAS, quyền và receipt order.update/archive; không ghi generic/LWW.</p>}
   {detail.mutation?.protocolReady&&!runtime.capabilities.includes('orders.update')&&<p>Thiếu quyền đã ký orders.update (orders/edit_order_items).</p>}
   {detail.mutation?.protocolReady&&!runtime.capabilities.includes('orders.archive')&&<p>Thiếu quyền đã ký orders.archive (orders/delete_order).</p>}
   {detail.mutation?.pending&&<p>Đang có một thay đổi chưa xác nhận. Giữ nguyên ý định; chờ đồng bộ/đối soát trước khi sửa tiếp.</p>}
   {detail.mutation?.conflict?<div role="alert"><p>Xung đột: {detail.mutation.conflict.reason}. Bản máy chủ không bị ghi đè.</p><p>Ghi chú máy chủ: {detail.mutation.conflict.serverNote}</p><p>Máy chủ: {detail.mutation.conflict.serverArchived?'đã lưu trữ':'đang sử dụng'}</p>{detail.mutation.conflict.canResolve&&<HDButton disabled={!validated||(detail.mutation.conflict.kind==='order.update'?!detail.mutation.canUpdate:!detail.mutation.canArchive)} onClick={()=>edit(detail.mutation.conflict.kind,true)}>Xem và tạo quyết định đối soát mới</HDButton>}</div>:<div className="flex gap-2"><HDButton disabled={!validated||!detail.mutation?.canUpdate} onClick={()=>edit('order.update')}>Sửa ghi chú</HDButton><HDButton variant="secondary" disabled={!validated||!detail.mutation?.canArchive} onClick={()=>edit('order.archive')}>{detail.archived?'Khôi phục lưu trữ':'Lưu trữ đơn'}</HDButton></div>}
   <p className="text-sm text-gray-600">Không sửa số lượng/giá, phí, thu tiền, khách hàng, trả hàng hoặc phiếu xuất: các thay đổi này cần giữ luồng nguyên khối và đối soát thưởng, chứng từ, QR.</p>
  </section>
  <section className="space-y-2 rounded-xl bg-gray-50 p-3" aria-label="Đối soát công nợ" data-ledger-state={ledgerState}><h3 className="font-semibold">Công nợ theo lịch sử đầy đủ</h3>
   <HDButton disabled={!validated||ledgerState==='loading'} onClick={requestLedger}>Xem công nợ và lịch sử</HDButton>
   {ledgerState==='idle'&&<p>Chưa yêu cầu đọc lịch sử đầy đủ. Không suy công nợ từ trang danh sách hoặc hiển thị số 0 thay thế.</p>}
   {ledgerState==='loading'&&<p role="status">Đang đọc toàn bộ lịch sử liên quan và kiểm tra quyền/checkpoint…</p>}
   {ledgerState==='cancelled'&&<p>Đã hủy đọc lịch sử. Nhấn xem lại khi cần; chưa công bố công nợ.</p>}
   {ledgerError&&<p>Chưa thể công bố công nợ: {ledgerError}</p>}
   {shownLedger?.status==='unconfirmed'&&<p>{shownLedger.reason}</p>}
   {shownLedger?.status==='complete'&&<><p>Công nợ khách hàng: {money(shownLedger.currentDebt)}</p><p>Số dư có: {money(shownLedger.creditBalance)}</p>{allocation?<><p>Đã phân bổ cho đơn: {money(allocation.appliedAmount)}</p><p>Còn phải thu của đơn: {money(allocation.outstandingAmount)}</p></>:<p>Đơn chưa được ghi nhận trong sổ công nợ chính thức.</p>}<p className="text-sm">Theo bản đã tải, mốc {shownLedger.seq}. Chưa phản ánh giao dịch chưa tải về.</p></>}
  </section></>}</Panel>;
}

function OrderChangeForm({identity,repo,runtime,draft,onClose,onSaved,closeRequest}){
 const [mutationId]=useState(()=>globalThis.crypto.randomUUID()),[editedAt]=useState(()=>new Date().toISOString());
 const [note,setNote]=useState(draft.note),[archive,setArchive]=useState(draft.isArchived),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false),attempted=useRef(false);
 const dirty=note!==draft.note||archive!==draft.isArchived||attempted.current;
 const requestClose=()=>{if(inFlight.current)return true;if(dirty&&!window.confirm('Đóng trình sửa và bỏ bản nháp? Ý định đã vào hàng đợi và lịch sử xung đột vẫn được giữ nguyên.'))return true;onClose();return true;};
 useCloseRequest(closeRequest,requestClose);
 const submit=async event=>{event.preventDefault();if(inFlight.current||!current(runtime))return;inFlight.current=true;attempted.current=true;setBusy(true);setError('');
  try{const result=await repo.change({identity,mutationId,editedAt,kind:draft.kind,baseToken:draft.baseToken,resolvesConflictId:draft.resolvesConflictId,patch:draft.kind==='order.update'?{note}:{isArchived:archive}});if(current(runtime))onSaved(result);}
  catch(e){attempted.current=e.orderCommitAttempted===true;setError(errorText(e)+' Mã thay đổi giữ nguyên: '+mutationId);}finally{inFlight.current=false;setBusy(false);}
 };
 return <Panel title={draft.resolvesConflictId?'Đối soát xung đột đơn hàng':draft.kind==='order.update'?'Sửa ghi chú đơn':'Lưu trữ / khôi phục đơn'} onClose={requestClose}><form className="space-y-4" onSubmit={submit}>
  <p>{identity} · Ghi bằng CAS theo bản đã xem. Nếu máy chủ thay đổi, yêu cầu sẽ thành xung đột; không ghi đè bản mới.</p>
  {draft.resolvesConflictId&&<div className="rounded-xl border p-3"><p>Ghi chú máy chủ đã xem: {draft.serverNote||'(trống)'}</p><p>Máy chủ: {draft.serverArchived?'đã lưu trữ':'đang sử dụng'}</p><p>Quyết định này là lệnh mới; lệnh và receipt xung đột cũ được giữ nguyên. Một thay đổi máy chủ tiếp theo vẫn có thể gây xung đột mới.</p></div>}
  {draft.kind==='order.update'?<label className="block">Ghi chú mới<textarea required={false} maxLength={4000} className={field+' w-full'} value={note} disabled={busy||attempted.current} onChange={e=>setNote(e.target.value)}/></label>:<label className="flex items-center gap-2"><input type="checkbox" checked={archive} disabled={busy||attempted.current} onChange={e=>setArchive(e.target.checked)}/>Lưu trữ đơn (bỏ chọn để khôi phục)</label>}
  <p className="text-sm">Giữ nguyên dòng hàng, ĐVT/giá lịch sử, công nợ, thu tiền, phí và phiếu xuất. Lưu trữ thay đổi cách bộ tính gốc chọn đơn; không xóa dữ liệu.</p>
  {error&&<p role="alert" className="text-red-800">{error}</p>}<HDButton type="submit" disabled={busy}>{busy?'Đang lưu…':attempted.current?'Thử lại cùng ý định':'Lưu vào hàng đợi'}</HDButton>
 </form></Panel>;
}
function Lookup({repo,source,label,value,onChange,disabled}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(null),[after,setAfter]=useState(''),[error,setError]=useState('');
 const queryKey=JSON.stringify([source,query,after]),[validated,setValidated]=useState(false);
 useLayoutEffect(()=>{setValidated(false);},[repo,queryKey]);
 useEffect(()=>{let active=true;setError('');repo.lookup(source,{search:query,after,limit:25}).then(result=>{if(active){setPage({...result,queryKey});setValidated(true);}}).catch(e=>{if(active)setError(errorText(e));});return()=>{active=false;};},[repo,queryKey]);
 return <fieldset disabled={disabled} className="space-y-2"><legend className="text-sm font-semibold">{label}{value?' · '+value.name:''}</legend><input aria-label={'Tìm '+label.toLowerCase()} className={field+' w-full'} placeholder="Tìm tên hoặc mã" value={query} onChange={e=>{setQuery(e.target.value);setAfter('');}}/>
  <select aria-label={label} disabled={!validated||page?.queryKey!==queryKey||!!error} className={field+' w-full'} value="" onChange={e=>{const selected=page?.rows.find(row=>row.id===e.target.value);if(selected&&!selected.archived)onChange(selected);}}><option value="">{value?'Đổi lựa chọn…':'Chọn…'}</option>{page?.rows.map(row=><option key={row.id} value={row.id} disabled={row.archived}>{row.name||row.id}{row.archived?' · đã lưu trữ':''}</option>)}</select>
  {error&&<p role="alert">{error}</p>}{page?.nextCursor&&<HDButton variant="secondary" disabled={!validated||page.queryKey!==queryKey||!!error} onClick={()=>setAfter(page.nextCursor)}>Danh mục tiếp</HDButton>}{after&&<HDButton variant="secondary" onClick={()=>setAfter('')}>Về đầu danh mục</HDButton>}
 </fieldset>;
}
function ManualOrderForm({repo,runtime,onClose,onSaved,closeRequest}){
 const [identity]=useState(()=>'ord_'+globalThis.crypto.randomUUID().replaceAll('-',''));
 const [createdAt]=useState(()=>new Date().toISOString());
 const [customer,setCustomer]=useState(null),[employee,setEmployee]=useState(null),[day,setDay]=useState(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date()));
 const [lines,setLines]=useState([{product:null,quantity:'',orderedUnit:'',billingQuantity:'',billingUnit:'',unitPrice:''}]);
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false),attempted=useRef(false);
 const initialDay=useRef(day);
 const dirty=!!customer||!!employee||!!note||day!==initialDay.current||lines.some(line=>line.product||line.quantity||line.orderedUnit||line.billingQuantity||line.billingUnit||line.unitPrice);
 const requestClose=()=>{if(inFlight.current)return true;if(dirty&&!window.confirm('Đóng và bỏ bản nháp chưa lưu? Giao dịch đã lưu trong hàng đợi vẫn được giữ nguyên.'))return true;onClose();return true;};
 useCloseRequest(closeRequest,requestClose);
 const update=(index,patch)=>setLines(previous=>previous.map((line,i)=>i===index?{...line,...patch}:line));
 const save=async event=>{event.preventDefault();if(inFlight.current||!current(runtime))return;setError('');
  if(!customer||!employee||lines.some(line=>!line.product)){setError('Chọn khách hàng, nhân viên và sản phẩm.');return;}
  inFlight.current=true;setBusy(true);attempted.current=true;
  try{const result=await repo.createManual({identity,createdAt,customerId:customer.id,salesEmpId:employee.id,date:day,note,lines:lines.map(line=>({productId:line.product.id,quantity:Number(line.quantity),orderedUnit:line.orderedUnit,billingQuantity:Number(line.billingQuantity),billingUnit:line.billingUnit,unitPrice:Number(line.unitPrice)}))});
   if(current(runtime))onSaved(result);
  }catch(e){attempted.current=e.orderCommitAttempted===true;setError(errorText(e)+' Mã đơn được giữ nguyên khi thử lại: '+identity);}finally{inFlight.current=false;setBusy(false);}
 };
 // Once a commit may have happened, preserve the exact intent and ID. Closing
 // returns to the directory for reconciliation; a retry never creates a new ID.
 const locked=busy||attempted.current;
 return <Panel title="Tạo đơn thủ công" onClose={requestClose}><form onSubmit={save} className="space-y-4">
  <p className="text-sm">Lưu vào hàng đợi trước; chỉ hiển thị đã đồng bộ khi có xác nhận máy chủ. Không ghi nhận thu tiền hoặc xuất kho.</p>
  <Lookup repo={repo} source="customers" label="Khách hàng" value={customer} onChange={setCustomer} disabled={locked}/><Lookup repo={repo} source="employees" label="Nhân viên bán hàng" value={employee} onChange={setEmployee} disabled={locked}/>
  <label className="block">Ngày đơn <input required type="date" className={field} value={day} disabled={locked} onChange={e=>setDay(e.target.value)}/></label>
  {lines.map((line,index)=><fieldset key={index} disabled={locked} className="space-y-2 rounded-xl border p-3"><legend>Dòng {index+1}</legend><Lookup repo={repo} source="products" label={'Sản phẩm dòng '+(index+1)} value={line.product} onChange={product=>update(index,{product})} disabled={locked}/>
   <div className="grid grid-cols-2 gap-2">{[['quantity','Số lượng đặt','number'],['orderedUnit','ĐVT đặt','text'],['billingQuantity','Số lượng tính giá','number'],['billingUnit','ĐVT tính giá','text'],['unitPrice','Đơn giá','number']].map(([key,label,type])=><label key={key} className="text-sm">{label}<input required className={field+' w-full'} type={type} min={type==='number'?'0.000001':undefined} step={type==='number'?'any':undefined} value={line[key]} onChange={e=>update(index,{[key]:e.target.value})}/></label>)}</div>
   {lines.length>1&&<HDButton variant="secondary" onClick={()=>setLines(previous=>previous.filter((_,i)=>i!==index))}>Bỏ dòng</HDButton>}</fieldset>)}
  <HDButton variant="secondary" disabled={locked||lines.length>=100} onClick={()=>setLines(previous=>[...previous,{product:null,quantity:'',orderedUnit:'',billingQuantity:'',billingUnit:'',unitPrice:''}])}>Thêm dòng hàng</HDButton>
  <label className="block">Ghi chú<textarea className={field+' w-full'} maxLength={4000} value={note} disabled={locked} onChange={e=>setNote(e.target.value)}/></label>
  {error&&<p role="alert" className="text-red-800">{error}</p>}<HDButton type="submit" disabled={busy}>{busy?'Đang lưu…':attempted.current?'Thử lại cùng mã đơn':'Lưu đơn vào hàng đợi'}</HDButton>
 </form></Panel>;
}
