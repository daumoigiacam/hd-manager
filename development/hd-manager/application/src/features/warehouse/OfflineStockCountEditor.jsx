import React,{useEffect,useRef,useState} from 'react';
import {HDButton,HDInput,HDDateInput} from '../../design-system/components.jsx';
import {businessDayKey} from '../../utils/businessDate.js';
import {STOCK_COUNT_RULES,STOCK_COUNT_REASON_CAPABILITY,STOCK_COUNT_REASONS,normalizeLeadingLabel,stockCountDraftFromDocument,assertEditableStockCount,buildStockCountValues,canonicalStockCount} from './stockCountProtocol.js';
import {assertWarehouseRuntime,warehouseErrorMessage} from './offlineWarehouseModel.js';

export function stockCountWriteAccess(runtime,repository,kind){
  try{assertWarehouseRuntime(runtime);}catch{return false;}
  return runtime.appSession.sourceProfile!=='native-isolation-v1'&&repository?.ready===true&&repository.protocolVersion===1&&
    ['projectId','tenantId','principalId','permissionRevision','sessionId'].every(key=>repository.scope?.[key]===runtime.scope[key])&&
    repository.employeeId===runtime.appSession.currentUser.id&&runtime.capabilities.includes('home.stock.read')&&runtime.capabilities.includes(STOCK_COUNT_RULES[kind]?.capability);
}
const emptyDraft=()=>({groupName:'',quantity:'',totalKg:'',quantityUnit:'Con',date:businessDayKey(Date.now()),reason:'',note:''});
const statusLabel={PENDING_SYNC:'Đã lưu trên thiết bị · Chờ đồng bộ',SYNCING:'Đang gửi và chờ máy chủ xác nhận',SYNCED:'Máy chủ đã xác nhận',SYNC_FAILED:'Đồng bộ chưa thành công · Ý định vẫn được giữ',CONFLICT_REQUIRES_REVIEW:'Xung đột · Cần đối chiếu, chưa ghi đè máy chủ',SERVER_CONFIRMED:'Chứng từ nguồn máy chủ'};

export function OfflineStockCountPending({runtime,repository,refreshToken,onEdit}){
  const [loaded,setLoaded]=useState(null),[page,setPage]=useState(0),[cursors,setCursors]=useState(['']),[reload,setReload]=useState(0);
  const queryKey=JSON.stringify([runtime.scope,cursors[page]]),key=JSON.stringify([queryKey,refreshToken,reload]),task=useRef(null),current=useRef(key),attached=useRef(false);current.current=key;
  useEffect(()=>{let active=true;if(attached.current)setReload(n=>n+1);attached.current=true;
    const stop=runtime.subscribe?.(topic=>{if(!active)return;if(!runtime.isCurrent()){setLoaded(null);return;}if(topic==='stockCounts')setReload(n=>n+1);});
    return()=>{active=false;stop?.();};
  },[runtime,repository]);
  useEffect(()=>{let active=true;if(!runtime.isCurrent())return;if(task.current?.key!==key||task.current.repository!==repository)task.current={key,repository,promise:repository.page({after:cursors[page],limit:25})};
    task.current.promise.then(value=>{if(active&&current.current===key&&runtime.isCurrent())setLoaded({key,queryKey,value});}).catch(()=>{if(active&&current.current===key)setLoaded({key,queryKey,error:true});});return()=>{active=false;};
  },[runtime,repository,key]);
  if(!runtime.isCurrent())return null;
  const value=loaded?.queryKey===queryKey?loaded.value:null;
  return <section className="space-y-2 rounded-2xl border p-3" aria-label="Ý định kiểm tồn trên thiết bị"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">Phiếu kiểm tồn đã lưu trên thiết bị</h2><HDButton variant="secondary" onClick={()=>setReload(n=>n+1)}>Tải lại trạng thái</HDButton></div>
    {loaded?.key===key&&loaded.error&&<p role="alert">Chưa đọc được trạng thái kiểm tồn. Không tạo lại phiếu trước khi kiểm tra lệnh đã lưu.</p>}
    {!value&&!loaded?.error&&<p role="status">Đang đọc trạng thái lệnh kiểm tồn…</p>}
    {value?.items.map(item=><article key={item.id} className="rounded-xl border p-3"><strong>{item.document.groupName}</strong><p>{item.document.date} · {statusLabel[item.state]||item.state}</p><p className="break-all text-xs">{item.id}</p><HDButton variant="secondary" onClick={()=>onEdit(item.id)}>Mở phiếu / đối chiếu</HDButton></article>)}
    {value&&<nav className="flex justify-between gap-2" aria-label="Trang lệnh kiểm tồn"><HDButton variant="secondary" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Trang trước</HDButton><span>Trang {page+1}</span><HDButton variant="secondary" disabled={!value.hasMore} onClick={()=>{setCursors(old=>[...old.slice(0,page+1),value.nextCursor]);setPage(n=>n+1);}}>Trang sau</HDButton></nav>}
  </section>;
}

export default function OfflineStockCountEditor({runtime,repository,id=null,onClose,onSaved}){
  const [draft,setDraft]=useState(emptyDraft),[record,setRecord]=useState(null),[loadError,setLoadError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[saved,setSaved]=useState(null),[reviewed,setReviewed]=useState(null),[confirmArchive,setConfirmArchive]=useState(false);
  const [groupRead,setGroupRead]=useState(null),groupTask=useRef(null);
  const [statusReload,setStatusReload]=useState(0),attached=useRef(false);
  const key=JSON.stringify([runtime.scope,id]),task=useRef(null),current=useRef(key),initialized=useRef(null),inFlight=useRef(false),intent=useRef(null);current.current=key;
  const targetId=id||saved?.entityId,statusKey=JSON.stringify([key,targetId,statusReload,saved?.commandId||null]),currentStatus=useRef(statusKey),savedRef=useRef(saved);currentStatus.current=statusKey;savedRef.current=saved;
  useEffect(()=>{let active=true;if(attached.current)setStatusReload(n=>n+1);attached.current=true;
    const stop=runtime.subscribe?.(topic=>{if(!active)return;if(!runtime.isCurrent()){setRecord(null);setLoadError('Phiên kiểm tồn đã đóng.');return;}if(topic==='stockCounts')setStatusReload(n=>n+1);});
    return()=>{active=false;stop?.();};
  },[runtime,repository]);
  useEffect(()=>{let active=true;if(typeof repository.groups!=='function')return;
    if(groupTask.current?.key!==key||groupTask.current.repository!==repository)groupTask.current={key,repository,promise:repository.groups()};
    groupTask.current.promise.then(value=>{if(active&&current.current===key&&runtime.isCurrent())setGroupRead({key,items:value.items});}).catch(()=>{if(active&&current.current===key)setGroupRead({key,error:true});});return()=>{active=false;};
  },[runtime,repository,key]);
  useEffect(()=>{let active=true;if(!targetId||!runtime.isCurrent())return;
    if(task.current?.key!==statusKey||task.current.repository!==repository)task.current={key:statusKey,repository,promise:repository.detail(targetId)};
    task.current.promise.then(value=>{if(!active||currentStatus.current!==statusKey||!runtime.isCurrent())return;
      if(!value)throw Error('Không tìm thấy phiếu kiểm tồn trong nguồn hoàn tất.');
      setLoadError('');
      const ownSaved=Boolean(savedRef.current&&savedRef.current.commandId===value.commandId);
      setRecord(previous=>{
        if(previous?.sourceChanged&&!ownSaved)return previous;
        if(previous&&['SYNCED','SERVER_CONFIRMED'].includes(previous.state)&&!ownSaved&&
          (previous.commandId!==value.commandId||canonicalStockCount(previous.base||previous.document)!==canonicalStockCount(value.base||value.document)))return {...previous,sourceChanged:true};
        return value;
      });
      if(id&&initialized.current!==key){initialized.current=key;setDraft(stockCountDraftFromDocument(value.document));}
      if(ownSaved){setSaved(previous=>previous&&previous.commandId===value.commandId&&previous.state!==value.state?{...previous,state:value.state,serverConfirmed:value.state==='SYNCED'}:previous);setNotice(statusLabel[value.state]||value.state);}
    }).catch(()=>{if(active&&currentStatus.current===statusKey)setLoadError('Chưa đọc được đầy đủ bản nguồn để sửa/lưu trữ. Hãy tải lại danh sách.');});return()=>{active=false;};
  },[runtime,repository,key,statusKey,targetId,id]);
  const kind=id?'stockCount.update':'stockCount.create',canWrite=stockCountWriteAccess(runtime,repository,kind),canArchive=!!id&&stockCountWriteAccess(runtime,repository,'stockCount.archive');
  const reasonAllowed=runtime.capabilities.includes(STOCK_COUNT_REASON_CAPABILITY);
  const groups=typeof repository.groups==='function'?(groupRead?.key===key?groupRead.items||[]:[]):[...new Set((runtime.appSession.currentCompany.productGroups||[]).filter(value=>typeof value==='string').map(normalizeLeadingLabel))];
  const awaiting=id&&(!record||record.sourceChanged||!['SYNCED','SERVER_CONFIRMED'].includes(record.state))&&!reviewed;
  let editError='';if(record&&!awaiting){try{assertEditableStockCount(reviewed?.base||record.base||record.document);}catch(error){editError=error.message;}}
  function change(key,value){intent.current=null;setDraft(old=>({...old,[key]:value}));setNotice('');}
  async function submit(event,archive=false){event?.preventDefault?.();if(inFlight.current||saved)return;
    if(archive&&!confirmArchive)return;
    if(!(archive?canArchive:canWrite)||awaiting||(!archive&&editError))return;
    try{
      assertWarehouseRuntime(runtime);
      if(!archive){buildStockCountValues(draft);if(!groups.includes(normalizeLeadingLabel(draft.groupName)))throw Error('Nhóm hàng phải có sẵn trong cấu hình công ty; luồng này không đăng ký nhóm mới.');}
      inFlight.current=true;setSaving(true);setNotice('');
      intent.current||={mutationId:globalThis.crypto.randomUUID(),editedAt:new Date().toISOString()};
      const options={...intent.current,base:reviewed?.base||record?.base||record?.document,resolvesConflictId:reviewed?.commandId||null};
      const value=archive?await repository.archive(id,options):id?await repository.update(id,draft,options):await repository.create(draft,options);
      if(!runtime.isCurrent()||current.current!==key)return;
      setSaved(value);setNotice(statusLabel[value.state]||'Đã lưu ý định trên thiết bị. Chưa có xác nhận máy chủ.');onSaved?.(value);
    }catch(error){if(runtime.isCurrent()&&current.current===key)setNotice(error?.code==='permission-denied'?warehouseErrorMessage(error):error?.code==='invalid-argument'?error.message:'Chưa hoàn tất lưu kiểm tồn. Hãy kiểm tra trạng thái lệnh đã lưu trước khi thử lại.');}
    finally{inFlight.current=false;if(runtime.isCurrent()&&current.current===key)setSaving(false);}
  }
  function reviewConflict(){const conflict=record?.receipt;if(!conflict?.currentDocument||conflict.outcome!=='conflict')return;
    setReviewed({base:conflict.currentDocument,commandId:record.commandId});setDraft(stockCountDraftFromDocument(conflict.currentDocument));intent.current=null;setNotice('Đã nạp bản máy chủ để đối chiếu. Ý định cũ vẫn được giữ. Lần lưu tiếp theo là lệnh mới có CAS.');}
  if(!runtime.isCurrent())return null;
  return <section className="space-y-3 rounded-2xl border-2 border-emerald-300 bg-white p-4" aria-label="Ghi nhận kiểm tồn thực tế">
    <div className="flex justify-between gap-2"><h2 className="font-bold">{id?'Sửa / lưu trữ phiếu kiểm tồn':'Ghi nhận tồn kho thực tế'}</h2><HDButton variant="secondary" disabled={saving} onClick={onClose}>Đóng phiếu</HDButton></div>
    <p className="text-xs text-slate-500">Chỉ ghi phiếu kiểm tồn; không tính lại sổ kho, tài chính hoặc đăng ký nhóm mới. Lệnh lưu trên thiết bị chưa phải xác nhận từ máy chủ.</p>
    {loadError&&<p role="alert">{loadError}</p>}{record&&<p role="status">{statusLabel[record.state]||record.state}</p>}
    {record?.sourceChanged&&<p role="alert">Nguồn phiếu đã thay đổi. Bản nháp và bản CAS ban đầu được giữ; hãy mở lại phiếu để đối chiếu trước khi lưu.</p>}
    {!groups.length&&<p role="status">Chưa có nhóm hàng từ cấu hình công ty đã được cấp quyền và đồng bộ. Không tạo nhóm mới trong luồng kiểm tồn này.</p>}
    {record?.state==='CONFLICT_REQUIRES_REVIEW'&&<div className="rounded-xl bg-amber-50 p-3"><p>Máy chủ đã đổi. Ý định của bạn và bản máy chủ được giữ riêng; không tự ghi đè.</p><HDButton variant="secondary" disabled={!record.receipt?.currentDocument||saving} onClick={reviewConflict}>Nạp bản máy chủ để đối chiếu</HDButton></div>}
    {editError&&<p role="alert">{editError}</p>}
    {!saved&&<form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Nhóm hàng<select value={draft.groupName} disabled={saving||awaiting||!canWrite} onChange={event=>change('groupName',event.target.value)} className="rounded-xl border p-2"><option value="">Chọn nhóm đã có trong công ty</option>{draft.groupName&&!groups.includes(draft.groupName)&&<option value={draft.groupName}>{draft.groupName} · Cần đối chiếu cấu hình</option>}{groups.map(group=><option key={group} value={group}>{group}</option>)}</select></label>
      <HDDateInput label="Ngày kiểm thực tế" required value={draft.date} disabled={saving||awaiting||!canWrite} onChange={event=>change('date',event.target.value)}/>
      <HDInput label="Số lượng thực tế (để trống nếu không kiểm)" inputMode="decimal" value={draft.quantity} disabled={saving||awaiting||!canWrite} onChange={event=>change('quantity',event.target.value)}/>
      <HDInput label="Đơn vị số lượng (ghi rõ)" required value={draft.quantityUnit} disabled={saving||awaiting||!canWrite} onChange={event=>change('quantityUnit',event.target.value)}/>
      <HDInput label="Khối lượng thực tế (Kg; để trống nếu không kiểm)" inputMode="decimal" value={draft.totalKg} disabled={saving||awaiting||!canWrite} onChange={event=>change('totalKg',event.target.value)}/>
      <label className="grid gap-1 text-sm">Lý do<select value={draft.reason} disabled={saving||awaiting||!canWrite||!reasonAllowed} onChange={event=>change('reason',event.target.value)} className="rounded-xl border p-2"><option value="">Không ghi lý do</option>{draft.reason&&!STOCK_COUNT_REASONS.includes(draft.reason)&&<option value={draft.reason}>{draft.reason}</option>}{STOCK_COUNT_REASONS.map(reason=><option key={reason} value={reason}>{reason}</option>)}</select></label>
      <HDInput label="Ghi chú" maxLength={4000} value={draft.note} disabled={saving||awaiting||!canWrite} onChange={event=>change('note',event.target.value)}/>
      <HDButton type="submit" disabled={saving||awaiting||!canWrite||!!editError||!!loadError}>{saving?'Đang lưu trên thiết bị…':id?'Lưu cập nhật kiểm tồn':'Lưu kiểm tồn trên thiết bị'}</HDButton>
    </form>}
    {!saved&&canArchive&&record&&!awaiting&&<div className="space-y-2 border-t pt-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmArchive} disabled={saving} onChange={event=>{intent.current=null;setConfirmArchive(event.target.checked);}}/>Xác nhận lưu trữ phiếu kiểm tồn này; không xóa vật lý</label><HDButton variant="secondary" disabled={!confirmArchive||saving} onClick={event=>{void submit(event,true);}}>Lưu trữ phiếu kiểm tồn</HDButton></div>}
    {notice&&<p role="status" className="rounded-xl bg-slate-50 p-3">{notice}</p>}
  </section>;
}
