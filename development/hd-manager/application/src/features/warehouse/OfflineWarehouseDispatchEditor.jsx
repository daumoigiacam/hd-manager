import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {HDButton,HDInput,HDDateInput} from '../../design-system/components.jsx';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import {businessDayKey} from '../../utils/businessDate.js';
import {canonicalDispatch,dispatchDraftFromDocument,buildDispatchValues} from './warehouseDispatchOfflineProtocol.js';
import {dispatchStatusLabel,dispatchWriteAccess} from './warehouseDispatchAccess.js';
export {dispatchStatusLabel,dispatchWriteAccess} from './warehouseDispatchAccess.js';
export function DispatchLookup({runtime,repository,source,onSelect,onClose}){
 const [text,setText]=useState(''),[page,setPage]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[cursor,setCursor]=useState(null);
 useAppScreenBack(()=>{onClose();return true;});
 useEffect(()=>{let active=true;setBusy(true);setError('');repository.lookup(source,{text,cursor}).then(value=>{if(active&&runtime.isCurrent())setPage(value);}).catch(e=>{if(active){setError(e.message);setPage(null);}}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[runtime,repository,source,text,cursor]);
 return <section aria-label="Chọn danh mục phiếu xuất" className="space-y-2 border p-3"><HDInput label="Tìm trong danh mục đã cấp quyền" value={text} onChange={e=>{setText(e.target.value);setCursor(null);}}/>{error&&<p role="alert">{error}</p>}<ul aria-busy={busy}>{page?.items.map(item=><li key={item.id}><HDButton disabled={busy} variant="secondary" onClick={()=>{onSelect(item);onClose();}}>{item.name} · {item.id}</HDButton></li>)}</ul>{page?.hasMore&&<HDButton disabled={busy} onClick={()=>setCursor(page.cursor)}>Trang danh mục tiếp</HDButton>}<HDButton variant="secondary" onClick={onClose}>Đóng danh mục</HDButton></section>;
}
const emptyDraft=()=>({customerId:'',productId:'',branchId:'',pieceCount:'',quantityUnit:'',weightKg:'',assignedDriverId:'',note:'',date:businessDayKey(Date.now()),weightEntries:[]});
export default function OfflineWarehouseDispatchEditor({runtime,repository,id=null,onClose,onSaved,closeRequestRef,readSource='local'}){
 const [denied,setDenied]=useState(false),[draft,setDraft]=useState(emptyDraft),[record,setRecord]=useState(null),[preview,setPreview]=useState(null),[error,setError]=useState(''),[saved,setSaved]=useState(null),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[archiveConfirmed,setArchiveConfirmed]=useState(false),[reviewed,setReviewed]=useState(null),[picker,setPicker]=useState(null),[reload,setReload]=useState(0);
 const root=useRef(null),focused=useRef(null),returnFocus=useRef(null),initialized=useRef(null),attached=useRef(false),inFlight=useRef(false),dirty=useRef(false),intent=useRef(null),action=useRef(null),draftVersion=useRef(0),key=JSON.stringify([runtime.scope,id,readSource]),currentKey=useRef(key),immutableIdentity=useRef(key);currentKey.current=key;
 const target=id||saved?.entityId,kind=id?'warehouseDispatch.update':'warehouseDispatch.create',canWrite=dispatchWriteAccess(runtime,repository,kind),canArchive=!!id&&!!record&&dispatchWriteAccess(runtime,repository,'warehouseDispatch.archive',record.document);
 const awaiting=!!id&&(!record||record.sourceChanged||!['SYNCED','SERVER_CONFIRMED'].includes(record.state))&&!reviewed;
 function close(){if(picker){setPicker(null);return true;}if(inFlight.current)return true;if(!saved&&(dirty.current||attempted)&&!window.confirm('Đóng bản nháp phiếu xuất? Ý định đã vào hàng chờ vẫn được giữ.'))return true;onClose?.();returnFocus.current?.focus?.();return true;}
 useAppScreenBack(close);
 useLayoutEffect(()=>{if(!closeRequestRef)return;closeRequestRef.current=close;return()=>{if(closeRequestRef.current===close)closeRequestRef.current=null;};});
 useEffect(()=>{if(focused.current!==key){focused.current=key;returnFocus.current=document.activeElement;root.current?.querySelector('input')?.focus();}},[key]);
 useEffect(()=>{let active=true;if(attached.current)setReload(n=>n+1);attached.current=true;const stop=runtime.subscribe?.(topic=>{if(active&&topic==='warehouseDispatches')setReload(n=>n+1);});return()=>{active=false;stop?.();};},[runtime,repository]);
 useEffect(()=>{let active=true;if(!target)return;repository.detail(target,{preferFeed:readSource==='feed'}).then(value=>{
  if(!active||currentKey.current!==key||!runtime.isCurrent())return;setDenied(false);if(!value)throw Error('Không tìm thấy phiếu xuất.');
  setRecord(old=>old&&value.commandId!==saved?.commandId&&['SYNCED','SERVER_CONFIRMED'].includes(old.state)&&canonicalDispatch(old.document)!==canonicalDispatch(value.document)?{...old,sourceChanged:true}:value);
  if(id&&initialized.current!==key){initialized.current=key;try{setDraft(dispatchDraftFromDocument(value.document));}catch(e){setError(e.message);}}
  if(saved?.commandId===value.commandId)setSaved(old=>({...old,state:value.state,serverConfirmed:value.state==='SYNCED'}));
 }).catch(e=>{if(active&&currentKey.current===key){setError(e.message);if(e.code==='permission-denied')setDenied(true);}});return()=>{active=false;};},[runtime,repository,key,id,target,reload,readSource,saved?.commandId]);
 function change(field,value){if(attempted||inFlight.current)return;dirty.current=true;draftVersion.current++;intent.current=null;setPreview(null);setDraft(old=>({...old,[field]:value}));setError('');}
 const base=reviewed?.base||record?.document||null;
 async function prepare(){if(!canWrite||awaiting||inFlight.current||attempted)return;const version=draftVersion.current;inFlight.current=true;setBusy(true);setError('');
  try{buildDispatchValues(draft);intent.current||={mutationId:globalThis.crypto.randomUUID(),editedAt:new Date().toISOString()};const result=await repository.preview(draft,{...intent.current,base});if(currentKey.current===key&&version===draftVersion.current&&runtime.isCurrent())setPreview({document:result,version});}
  catch(e){if(currentKey.current===key){setError(e.message);if(e.code==='permission-denied')setDenied(true);}}finally{inFlight.current=false;if(currentKey.current===key)setBusy(false);}
 }
 async function submit(event,archive=false){event?.preventDefault?.();if(inFlight.current||saved||awaiting||!(archive?canArchive:canWrite)||archive&&!archiveConfirmed||!archive&&(!preview||preview.version!==draftVersion.current))return;
  inFlight.current=true;setBusy(true);setError('');setAttempted(true);action.current=archive;intent.current||={mutationId:globalThis.crypto.randomUUID(),editedAt:new Date().toISOString()};
  try{const options={...intent.current,base,resolvesConflictId:reviewed?.commandId||null,expectedPlan:preview?.document||null};const result=archive?await repository.archive(id,options):id?await repository.update(id,draft,options):await repository.create(draft,options);
   if(currentKey.current===key&&runtime.isCurrent()){setSaved(result);onSaved?.(result);}
  }catch(e){if(currentKey.current===key&&runtime.isCurrent()){setError(e.message+' Giữ nguyên mã thao tác và kiểm tra hàng chờ trước khi tạo lại.');if(e.code==='permission-denied')setDenied(true);}}
  finally{inFlight.current=false;if(currentKey.current===key&&runtime.isCurrent())setBusy(false);}
 }
 function reviewConflict(){const receipt=record?.receipt;if(receipt?.outcome!=='conflict'||!receipt.current)return;try{setDraft(dispatchDraftFromDocument(receipt.current));setReviewed({base:receipt.current,commandId:record.commandId});setSaved(null);setAttempted(false);setPreview(null);intent.current=null;dirty.current=true;draftVersion.current++;setError('');}catch(e){setError(e.message);}}
 if(!runtime.isCurrent()||immutableIdentity.current!==key||denied)return null;
 const locked=busy||attempted||awaiting||!canWrite;
 return <section ref={root} aria-label="Ghi nhận xuất kho Offline" className="space-y-3 rounded-2xl border bg-white p-4"><header className="flex justify-between"><h2>{id?'Sửa / lưu trữ phiếu xuất':'Tạo phiếu xuất ngoài đơn đặt'}</h2><HDButton variant="secondary" disabled={busy} onClick={close}>Đóng phiếu xuất</HDButton></header>
  <p>Phiếu một dòng ngoài đơn đặt. Chỉ máy chủ mới xác nhận tồn kho. Phiếu gắn hóa đơn, giao hàng, đơn đặt hoặc sổ kho cần luồng đối soát riêng.</p>
  {!canWrite&&<p role="status">Chưa đủ quyền có chữ ký hoặc giao thức xuất kho chưa sẵn sàng.</p>}
  {record&&<p role="status">{dispatchStatusLabel[record.state]||record.state}</p>}{record?.sourceChanged&&<p role="alert">Nguồn phiếu đã đổi. Giữ bản nháp và CAS cũ; mở lại để đối chiếu.</p>}{record?.sourceCatchup&&<p>Nguồn đang cập nhật; đang giữ bản đã xác nhận.</p>}
  {record?.receipt?.reason&&<p role="alert">Máy chủ chưa chấp nhận: {record.receipt.reason}</p>}{error&&<p role="alert">{error}</p>}
  {record?.state==='CONFLICT_REQUIRES_REVIEW'&&<HDButton disabled={busy||!record.receipt?.current} onClick={reviewConflict}>Nạp bản máy chủ để đối chiếu ý định mới</HDButton>}
  {picker&&<DispatchLookup runtime={runtime} repository={repository} source={picker} onClose={()=>setPicker(null)} onSelect={item=>change(picker==='customers'?'customerId':picker==='products'?'productId':'assignedDriverId',item.id)}/>}
  {!saved&&<form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
   {[['customerId','Khách hàng'],['productId','Sản phẩm'],['branchId','Chi nhánh (nếu có)'],['pieceCount','Số lượng thực tế'],['quantityUnit','Đơn vị thực tế (ghi rõ)'],['weightKg','Khối lượng thực tế Kg'],['assignedDriverId','Mã người giao (không bắt buộc)'],['note','Ghi chú']].map(([field,label])=><HDInput key={field} label={label} value={draft[field]} disabled={locked||!!id&&['customerId','productId','branchId'].includes(field)} onChange={e=>change(field,e.target.value)}/>)}
   <HDDateInput label="Ngày xuất" value={draft.date} disabled={locked||!!id} onChange={e=>change('date',e.target.value)}/>
   {['customers','products',...(runtime.capabilities.includes('home.payroll.read')?['employees']:[])].map(source=><HDButton key={source} variant="secondary" disabled={locked||!!id&&source!=='employees'} onClick={()=>setPicker(source)}>Chọn {source==='customers'?'khách hàng':source==='products'?'sản phẩm':'người giao'}</HDButton>)}
   <fieldset disabled={locked} className="space-y-2"><legend>Các lần cân (nếu đã ghi)</legend>{draft.weightEntries.map((weight,index)=><div key={index}><HDInput label={'Lần cân '+(index+1)} value={weight} onChange={e=>change('weightEntries',draft.weightEntries.map((v,i)=>i===index?e.target.value:v))}/><HDButton variant="secondary" onClick={()=>change('weightEntries',draft.weightEntries.filter((_,i)=>i!==index))}>Bỏ lần cân</HDButton></div>)}<HDButton variant="secondary" disabled={draft.weightEntries.length>=100} onClick={()=>change('weightEntries',[...draft.weightEntries,''])}>Thêm lần cân</HDButton></fieldset>
   <HDButton variant="secondary" disabled={locked} onClick={prepare}>Đối chiếu đơn vị và giá</HDButton>
   {preview&&<p aria-label="Giá trị xuất đã đối chiếu">{preview.document.billingQuantity} {preview.document.billingUnit} × {preview.document.unitPrice} = {preview.document.amount} đ. Chưa phải xác nhận tồn kho.</p>}
   <HDButton type="submit" disabled={locked||!preview}>{busy?'Đang lưu trên thiết bị…':'Lưu ý định xuất kho trên thiết bị'}</HDButton>
  </form>}
  {attempted&&!saved&&error&&<HDButton disabled={busy} onClick={event=>{void submit(event,action.current);}}>Thử lại đúng ý định đã lưu</HDButton>}
  {!saved&&canArchive&&!awaiting&&<div><label><input type="checkbox" disabled={busy||attempted} checked={archiveConfirmed} onChange={e=>setArchiveConfirmed(e.target.checked)}/>Xác nhận lưu trữ phiếu xuất</label><HDButton disabled={busy||attempted||!archiveConfirmed} onClick={e=>{void submit(e,true);}}>Lưu trữ phiếu xuất</HDButton></div>}
  {saved&&<p role="status">{dispatchStatusLabel[saved.state]||saved.state} · {saved.commandId}</p>}
 </section>;
}
