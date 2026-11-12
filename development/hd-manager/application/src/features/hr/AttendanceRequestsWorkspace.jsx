import React,{useEffect,useRef,useState} from 'react';
import {HDButton,HDCard} from '../../design-system/index.js';
import {businessDayKey} from '../../utils/businessDate.js';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
const initial=()=>({workDate:businessDayKey(new Date()),workRole:'',adjustmentType:'Điều chỉnh giờ công',reason:'',proposedDetail:''});
const labels={PENDING_REVIEW:'Chờ duyệt',APPROVED:'Đã duyệt · Đã cập nhật công',APPROVED_PENDING_APPLICATION:'Đã duyệt · Chờ áp dụng',REJECTED:'Từ chối'};
const localClock=value=>{const at=Date.parse(value);return Number.isFinite(at)?new Date(at+7*3600000).toISOString().slice(0,16):'';};
export default function AttendanceRequestsWorkspace({runtime,onClose,initialProposal=null}){
 const[repo,setRepo]=useState(null),[rows,setRows]=useState([]),[form,setForm]=useState(()=>initialProposal?{...initial(),...initialProposal}:initial()),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[cursor,setCursor]=useState(null),[receiptList,setReceiptList]=useState(null);
 const touched=useRef(!!initialProposal),[draftSaved,setDraftSaved]=useState(false),[localCursor,setLocalCursor]=useState(undefined);
 const current=()=>runtime.isCurrent()&&Date.now()<runtime.expiresAtMs;
 useAppScreenBack(()=>{onClose();return true;});
 useEffect(()=>{let active=true,reading=false,again=false,r;const load=async()=>{if(!active||!current())return;if(reading){again=true;return;}reading=true;try{const items=await r.page({before:localCursor});if(active&&current())setRows(items);}catch(e){if(active)setError(e.message);}finally{reading=false;if(again){again=false;void load();}}};let stop;
  runtime.attendanceRequestRepository().then(async value=>{if(!active)return;r=value;const draft=await r.draft();if(!active)return;if(draft&&!touched.current){setForm(draft);setDraftSaved(true);}setRepo(r);stop=runtime.subscribe(topic=>{if(topic==='attendanceRequests')void load();});await load();if(navigator.onLine)try{const page=await r.refresh();if(active)setCursor(page.after);await load();}catch(e){if(active)setError('Đang dùng dữ liệu Local. '+e.message);}}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;stop?.();};
 },[runtime,localCursor]);
 async function run(work){if(busy||!current())return;setBusy(true);setError('');try{await work();if(current())setRows(await repo.page({before:localCursor}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 const field=(key,label,type='text')=><label className="block space-y-1">{label}<input aria-label={label} type={type} disabled={busy||!!form.proposedTimes&&['workDate','workRole'].includes(key)} required maxLength={{workDate:10,workRole:160,adjustmentType:80,reason:2000,proposedDetail:4000}[key]} value={form[key]} onChange={e=>{touched.current=true;setDraftSaved(false);setForm(p=>({...p,[key]:e.target.value}));}} className="block w-full rounded border p-2"/></label>;
 if(!current())return <p role="alert">Phiên hoặc quyền đã hết hiệu lực. Yêu cầu đang chờ vẫn được giữ an toàn.</p>;
 return <section aria-label="Yêu cầu điều chỉnh công SQLite" className="space-y-4 p-3 pb-24">
  <HDButton onClick={onClose}>Nhân sự</HDButton><h2 className="text-xl font-bold">Yêu cầu điều chỉnh công</h2>
  <p>Ghi yêu cầu vào SQLite và Outbox cùng giao dịch. Chỉ cập nhật giờ khi có đề nghị cụ thể, nguồn còn khớp và quản lý duyệt hợp lệ. Kỳ lương đã khóa luôn được giữ nguyên.</p>
  {error&&<p role="alert">{error}</p>}
  {runtime.capabilities.includes('attendanceRequest.create')&&<form aria-label="Tạo yêu cầu điều chỉnh" className="space-y-2" onSubmit={e=>{e.preventDefault();void run(async()=>{await repo.enqueue('create',form);setForm(initial());touched.current=false;setDraftSaved(false);setLocalCursor(undefined);});}}>
   {field('workDate','Ngày công','date')}{field('workRole','Ca / công việc')}{field('adjustmentType','Loại điều chỉnh')}{field('reason','Lý do yêu cầu')}{field('proposedDetail','Nội dung đề nghị')}
   {initialProposal&&<label><input aria-label="Đề nghị cập nhật giờ công" type="checkbox" checked={!!form.proposedTimes} disabled={busy} onChange={e=>setForm(previous=>e.target.checked?{...previous,...initialProposal,reason:previous.reason,proposedDetail:previous.proposedDetail}:{...previous,proposedTimes:null})}/>Đề nghị cập nhật giờ công (bỏ chọn để chỉ ghi yêu cầu xác minh)</label>}
   {form.proposedTimes&&<div className="space-y-2"><label>Trạng thái công đề nghị<select aria-label="Trạng thái công đề nghị" disabled={busy} value={form.proposedTimes.status} onChange={e=>setForm(p=>({...p,proposedTimes:{...p.proposedTimes,status:e.target.value,...(e.target.value==='leave'?{checkIn:null,checkOut:null}:{})}}))}><option value="present">Có công</option><option value="late">Đi muộn</option><option value="leave">Nghỉ</option></select></label>{['checkIn','checkOut'].map(key=><label key={key} className="block">{key==='checkIn'?'Giờ vào đề nghị':'Giờ ra đề nghị'}<input aria-label={key==='checkIn'?'Giờ vào đề nghị':'Giờ ra đề nghị'} type="datetime-local" disabled={busy||form.proposedTimes.status==='leave'} required={key==='checkIn'&&form.proposedTimes.status!=='leave'} value={localClock(form.proposedTimes[key])} onChange={e=>{touched.current=true;setDraftSaved(false);const value=e.target.value?new Date(e.target.value+'+07:00').toISOString():null;setForm(p=>({...p,proposedTimes:{...p.proposedTimes,[key]:value}}));}}/></label>)}<p>Giờ Việt Nam (UTC+7). Quản lý đối chiếu nguồn trước khi áp dụng; không tính lại lương đã khóa.</p></div>}
   <HDButton type="submit" disabled={!repo||busy}>Lưu yêu cầu Local</HDButton>
   <HDButton type="button" disabled={!repo||busy} onClick={()=>void run(async()=>{await repo.saveDraft(form);setDraftSaved(true);})}>Lưu nháp Local</HDButton>
   {draftSaved&&<p role="status">Nháp đã lưu SQLite · Chưa gửi duyệt.</p>}
  </form>}
  <HDButton disabled={!repo||busy} onClick={()=>void run(async()=>{const p=await repo.refresh();setCursor(p.after);})}>Cập nhật yêu cầu từ server</HDButton>
  {cursor&&<HDButton disabled={busy} onClick={()=>void run(async()=>{const p=await repo.refresh(cursor);setCursor(p.after);})}>Tải thêm yêu cầu</HDButton>}
  {runtime.capabilities.includes('attendanceRequest.approve')&&<label className="block">Lý do xử lý<input aria-label="Lý do xử lý" className="block w-full rounded border p-2" value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>}
  {!rows.length&&<p>Chưa có yêu cầu trong dữ liệu Local đã tải.</p>}
  {localCursor!==undefined&&<HDButton disabled={busy} onClick={()=>setLocalCursor(undefined)}>Yêu cầu mới nhất đã lưu</HDButton>}
  {rows.length===40&&<HDButton disabled={busy} onClick={()=>setLocalCursor(rows.at(-1).ordinal)}>Xem yêu cầu cũ hơn đã lưu</HDButton>}
  {rows.map(row=>{const d=row.document;return <HDCard key={d.id} className="space-y-2 p-3" data-attendance-request-id={d.id}>
   <h3 className="font-bold">{d.workDate} · {d.workRole}</h3><p>{d.reason}</p><p>{d.proposedDetail}</p><p>{labels[d.status]||d.status}</p><p data-command-state={row.state}>Đồng bộ: {row.state}</p><p>Mã yêu cầu: {d.id}</p>
   {d.lockedPeriod&&<p>Kỳ đã khóa: chỉ ghi yêu cầu và quyết định, không sửa công/lương lịch sử.</p>}
   {d.reviewReason&&<p>Lý do xử lý: {d.reviewReason}</p>}
   {d.proposedTimes&&<p>Đề nghị: {d.proposedTimes.status} · Vào {d.proposedTimes.checkIn||'Không có'} · Ra {d.proposedTimes.checkOut||'Không có'}</p>}
   {d.applied&&<p data-attendance-applied="true">Công đã cập nhật theo quyết định · Phiên bản {d.attendanceRevision}</p>}
   {row.state==='CONFLICT_REQUIRES_REVIEW'&&<p role="alert">Dữ liệu công nguồn đã thay đổi. Chưa áp dụng, giao dịch và biên nhận được giữ nguyên. Có thể từ chối đề nghị cũ kèm lý do.</p>}
   <details><summary>Lịch sử xử lý</summary>{d.history.map((h,i)=><p key={i}>{h.at} · {h.by} · {h.action}: {h.reason}</p>)}</details>
   <HDButton disabled={busy} onClick={()=>void run(async()=>setReceiptList({id:d.id,items:await repo.receipts(d.id)}))}>Xem biên nhận {d.workDate}</HDButton>
   {receiptList?.id===d.id&&receiptList.items.map(r=><p key={r.commandId}>Biên nhận {r.commandId} · {r.outcome} · {r.reason||r.kind}</p>)}
   {d.status==='PENDING_REVIEW'&&['SYNCED','CONFLICT_REQUIRES_REVIEW'].includes(row.state)&&<div className="flex gap-2">{['approve','reject'].filter(a=>runtime.capabilities.includes('attendanceRequest.'+a)&&(a==='reject'||row.state==='SYNCED')).map(a=><HDButton key={a} disabled={busy||!reason.trim()} onClick={()=>void run(()=>repo.enqueue(a,{reason:reason.trim()},d.id))}>{a==='approve'?'Duyệt yêu cầu':'Từ chối yêu cầu'}</HDButton>)}</div>}
  </HDCard>;})}
 </section>;
}
