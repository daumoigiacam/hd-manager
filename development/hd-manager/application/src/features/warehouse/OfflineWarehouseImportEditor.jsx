import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {HDButton,HDInput,HDDateInput} from '../../design-system/components.jsx';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import {businessDayKey} from '../../utils/businessDate.js';
import {IMPORT_RULES,buildImportValues,canonicalImport,importDraftFromPair} from './warehouseImportProtocol.js';
import {WAREHOUSE_IMPORT_SOURCE_OPTIONS} from './warehouseImportOriginalPlan.js';
export const importStatusLabel={PENDING_SYNC:'Đã lưu trên thiết bị · Chờ đồng bộ',SYNCING:'Đang gửi và chờ máy chủ xác nhận',SYNCED:'Máy chủ đã xác nhận nhập kho và phiếu chi',SERVER_CONFIRMED:'Chứng từ nguồn máy chủ',SYNC_FAILED:'Đồng bộ chưa thành công · Ý định vẫn được giữ',CONFLICT_REQUIRES_REVIEW:'Cần đối chiếu nhập kho và phiếu chi; chưa ghi đè'};
export function importWriteAccess(runtime,repository,kind){
  const scope=runtime?.scope,user=runtime?.appSession?.currentUser;
  return Boolean(runtime?.isCurrent?.()&&Number.isFinite(runtime.expiresAtMs)&&Date.now()<runtime.expiresAtMs&&scope&&user?.firebaseUid===scope.principalId&&user.companyId===scope.tenantId&&runtime.appSession.currentCompany?.id===scope.tenantId&&user.accountType==='employee'&&runtime.appSession.sourceProfile===undefined&&repository?.ready&&repository.protocolVersion===1&&repository.employeeId===user.id&&['tenantId','principalId','permissionRevision','sessionId'].every(k=>repository.scope?.[k]===scope[k])&&['home.read','home.imports.read','home.cashflow.read',IMPORT_RULES[kind]?.capability].every(cap=>cap&&runtime.capabilities?.includes(cap)));
}
const emptyDraft=()=>({groupName:'',quantity:'',totalKg:'',quantityUnit:'',purchaseUnit:'',unitPrice:'',sourceType:'purchase_resale',date:businessDayKey(Date.now()),supplier:'',supplierPhone:'',supplierCustomerId:'',productId:'',productName:'',productCode:'',productBarcode:'',note:'',extraMeasures:[]});
export default function OfflineWarehouseImportEditor({runtime,repository,id=null,onClose,onSaved,closeRequestRef,readSource='local'}){
  const [draft,setDraft]=useState(emptyDraft),[record,setRecord]=useState(null),[groups,setGroups]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(null),[saving,setSaving]=useState(false),[confirmArchive,setConfirmArchive]=useState(false),[reviewed,setReviewed]=useState(null),[reload,setReload]=useState(0),[attempted,setAttempted]=useState(false);
  const scopeKey=JSON.stringify(runtime.scope),key=JSON.stringify([scopeKey,id,readSource]),current=useRef(key),initialized=useRef(null),attached=useRef(false),inFlight=useRef(false),intent=useRef(null),savedRef=useRef(saved),task=useRef(null),groupTask=useRef(null),dirty=useRef(false),archiveIntent=useRef(false);current.current=key;savedRef.current=saved;
  const target=id||saved?.entityId,statusKey=JSON.stringify([key,target,reload]),statusCurrent=useRef(statusKey);statusCurrent.current=statusKey;
  const kind=id?'warehouseImport.update':'warehouseImport.create',canWrite=importWriteAccess(runtime,repository,kind),canArchive=!!id&&importWriteAccess(runtime,repository,'warehouseImport.archive');
  const awaiting=!!id&&(!record||record.sourceChanged||!['SYNCED','SERVER_CONFIRMED'].includes(record.state))&&!reviewed;
  function close(){if(inFlight.current)return true;if(!saved&&(dirty.current||attempted)&&!window.confirm('Đóng bản nháp? Kiểm tra hàng chờ trước khi tạo lại; ý định đã lưu vẫn được giữ.'))return true;onClose?.();return true;}
  useLayoutEffect(()=>{if(!closeRequestRef)return;closeRequestRef.current=close;return()=>{if(closeRequestRef.current===close)closeRequestRef.current=null;};});
  useAppScreenBack(close);
  useEffect(()=>{let active=true;if(attached.current)setReload(n=>n+1);attached.current=true;const stop=runtime.subscribe?.(topic=>{if(active&&topic==='warehouseImports')setReload(n=>n+1);});return()=>{active=false;stop?.();};},[runtime,repository]);
  useEffect(()=>{let active=true;if(groupTask.current?.key!==key||groupTask.current.repository!==repository)groupTask.current={key,repository,promise:repository.groups()};groupTask.current.promise.then(value=>{if(active&&current.current===key&&runtime.isCurrent())setGroups({key,items:value.items});}).catch(()=>{if(active&&current.current===key)setError('Chưa đọc được nhóm hàng đã cấp quyền.');});return()=>{active=false;};},[runtime,repository,key]);
  useEffect(()=>{let active=true;if(!target||!runtime.isCurrent())return;if(task.current?.key!==statusKey||task.current.repository!==repository)task.current={key:statusKey,repository,promise:repository.detail(target,{preferFeed:readSource==='feed'})};
    task.current.promise.then(value=>{if(!active||statusCurrent.current!==statusKey||!runtime.isCurrent())return;if(!value)throw Error('missing');const own=savedRef.current?.commandId===value.commandId;
      setRecord(old=>old?.sourceChanged&&!own?old:old&&!own&&['SYNCED','SERVER_CONFIRMED'].includes(old.state)&&canonicalImport(old.base)!==canonicalImport(value.base)?{...old,sourceChanged:true}:value);
      if(id&&initialized.current!==key){initialized.current=key;setDraft(importDraftFromPair(value.pair));}
      if(own){setSaved(old=>old&&old.state!==value.state?{...old,state:value.state,serverConfirmed:value.state==='SYNCED'}:old);setNotice(importStatusLabel[value.state]||value.state);}
    }).catch(()=>{if(active&&statusCurrent.current===statusKey)setError('Chưa đọc được đầy đủ phiếu nhập và phiếu chi; không lưu lại để tránh trùng.');});return()=>{active=false;};
  },[runtime,repository,id,key,target,statusKey,readSource]);
  function change(field,value){if(attempted)return;dirty.current=true;intent.current=null;setDraft(old=>({...old,[field]:value}));setError('');}
  async function submit(event,archive=false){event?.preventDefault?.();if(inFlight.current||saved||awaiting||!(archive?canArchive:canWrite)||archive&&!confirmArchive)return;
    try{if(!archive){const values=buildImportValues(draft);if(groups?.key!==key||!groups.items.includes(values.groupName))throw Error('Chọn nhóm đã có trong công ty; không đăng ký nhóm mới.');}
      inFlight.current=true;setSaving(true);setError('');setAttempted(true);archiveIntent.current=archive;intent.current||={mutationId:globalThis.crypto.randomUUID(),editedAt:new Date().toISOString()};
      const o={...intent.current,base:reviewed?.base||record?.pair,resolvesConflictId:reviewed?.commandId||null};
      const result=archive?await repository.archive(id,o):id?await repository.update(id,draft,o):await repository.create(draft,o);
      if(current.current===key&&runtime.isCurrent()){setSaved(result);setNotice(importStatusLabel[result.state]||'Đã lưu ý định trên thiết bị, chưa có xác nhận máy chủ.');onSaved?.(result);}
    }catch(e){if(current.current===key&&runtime.isCurrent())setError(e.code==='invalid-argument'?e.message:'Chưa hoàn tất lưu. Kiểm tra hàng chờ trước khi thử lại; giữ nguyên mã thao tác.');}
    finally{inFlight.current=false;if(current.current===key&&runtime.isCurrent())setSaving(false);}
  }
  function reviewConflict(){if(record?.receipt?.outcome!=='conflict'||!record.receipt.current?.document)return;setReviewed({base:record.receipt.current,commandId:record.commandId});setDraft(importDraftFromPair(record.receipt.current));setSaved(null);setAttempted(false);intent.current=null;setError('');setNotice('Đã nạp cả nhập kho và chi phí nguồn. Ý định cũ vẫn được giữ; lần lưu mới dùng CAS mới.');}
  if(!runtime.isCurrent())return null;
  let preview='Chưa đủ dữ liệu';try{preview=String(buildImportValues(draft).amount);}catch{}
  const choices=groups?.key===key?groups.items:[],locked=saving||awaiting||attempted||!canWrite;
  return <section aria-label="Ghi nhận nhập kho Offline" className="space-y-3 rounded-2xl border-2 border-emerald-300 bg-white p-4">
    <div className="flex justify-between gap-2"><h2 className="font-bold">{id?'Sửa / lưu trữ phiếu nhập kho':'Thêm phiếu nhập kho'}</h2><HDButton variant="secondary" disabled={saving} onClick={close}>Đóng phiếu nhập</HDButton></div>
    <p className="text-sm">Phiếu nhập và phiếu chi đi kèm lưu nguyên tử. Hàng chờ chưa phải xác nhận máy chủ. Không ghi thanh toán hoặc trả nợ nhà cung cấp.</p>
    {!canWrite&&<p role="status">Thiếu quyền có chữ ký hoặc giao thức nhập kho/chi phí chưa sẵn sàng.</p>}
    {record&&<p role="status">{importStatusLabel[record.state]||record.state}</p>}
    {record?.sourceCatchup&&<p role="status">Nguồn danh sách đang cập nhật; đang xem bản nhập kho và chi phí đã được máy chủ xác nhận.</p>}
    {record?.sourceChanged&&<p role="alert">Nguồn nhập kho/chi phí đã thay đổi. Bản nháp và CAS ban đầu được giữ; mở lại trước khi lưu.</p>}
    {record?.state==='CONFLICT_REQUIRES_REVIEW'&&<HDButton variant="secondary" disabled={!record.receipt?.current?.document||saving} onClick={reviewConflict}>Nạp cả nhập kho / chi phí để đối chiếu</HDButton>}
    {error&&<p role="alert">{error}</p>}
    {attempted&&!saved&&error&&<HDButton variant="secondary" disabled={saving} onClick={e=>{void submit(e,archiveIntent.current);}}>Kiểm tra / thử lại đúng ý định đã lưu</HDButton>}
    {!saved&&<form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Nhóm hàng<select required disabled={locked} value={draft.groupName} onChange={e=>change('groupName',e.target.value)}><option value="">Chọn nhóm đã có trong công ty</option>{draft.groupName&&!choices.includes(draft.groupName)&&<option value={draft.groupName}>{draft.groupName} · Cần đối chiếu cấu hình</option>}{choices.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Nguồn nhập<select disabled={locked} value={draft.sourceType} onChange={e=>change('sourceType',e.target.value)}>{WAREHOUSE_IMPORT_SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <HDDateInput label="Ngày nhập kho" required value={draft.date} disabled={locked} onChange={e=>change('date',e.target.value)}/>
      {[['quantity','Số lượng'],['quantityUnit','Đơn vị số lượng (ghi rõ)'],['totalKg','Khối lượng (Kg)'],['purchaseUnit','Đơn vị nhập / tính giá (ghi rõ)'],['unitPrice','Đơn giá nhập'],['productId','Mã sản phẩm đã có (không bắt buộc)'],['productName','Tên sản phẩm trên phiếu'],['productCode','Mã hàng'],['productBarcode','Mã vạch'],['supplier','Nhà cung cấp'],['supplierCustomerId','Mã khách hàng nhà cung cấp (nếu đã liên kết)'],['supplierPhone','Điện thoại nhà cung cấp'],['orderedUnit','Đơn vị đặt đã ghi (nếu có)'],['pricingUnit','Đơn vị giá đã ghi (nếu có)'],['note','Ghi chú']].map(([field,label])=><HDInput key={field} label={label} value={draft[field]??''} required={['quantityUnit','purchaseUnit'].includes(field)} disabled={locked} onChange={e=>change(field,e.target.value)}/>)}
      <p className="text-sm">Thành tiền theo quy tắc nhập gốc: {preview} đ</p>
      <fieldset className="space-y-2 sm:col-span-2" disabled={locked}><legend>Số đo bổ sung đã ghi rõ đơn vị</legend>{draft.extraMeasures.map((m,index)=><div key={index} className="flex gap-2"><HDInput label={`Đơn vị bổ sung ${index+1}`} value={m.unit} onChange={e=>change('extraMeasures',draft.extraMeasures.map((x,i)=>i===index?{...x,unit:e.target.value}:x))}/><HDInput label={`Số lượng bổ sung ${index+1}`} value={m.quantity} onChange={e=>change('extraMeasures',draft.extraMeasures.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/><HDButton variant="secondary" onClick={()=>change('extraMeasures',draft.extraMeasures.filter((_,i)=>i!==index))}>Bỏ số đo</HDButton></div>)}<HDButton variant="secondary" disabled={draft.extraMeasures.length>=100} onClick={()=>change('extraMeasures',[...draft.extraMeasures,{unit:'',quantity:''}])}>Thêm số đo bổ sung</HDButton></fieldset>
      <HDButton type="submit" disabled={locked||!choices.length}>{saving?'Đang lưu trên thiết bị…':id?'Lưu cập nhật nhập kho':'Lưu nhập kho trên thiết bị'}</HDButton>
    </form>}
    {!saved&&canArchive&&record&&!awaiting&&<div className="space-y-2 border-t pt-3"><label><input type="checkbox" checked={confirmArchive} disabled={saving||attempted} onChange={e=>setConfirmArchive(e.target.checked)}/>Xác nhận lưu trữ cả phiếu nhập và phiếu chi đi kèm</label><HDButton variant="secondary" disabled={!confirmArchive||saving||attempted} onClick={e=>{void submit(e,true);}}>Lưu trữ nhập kho và chi phí</HDButton></div>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
