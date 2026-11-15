import React,{useEffect,useRef,useState}from'react';import{HDButton,HDCard}from'../../design-system/index.js';import EmployeeProfileEditor from'./EmployeeProfileEditor.jsx';
import LocalIntentQueueDisclosure from '../../layout/LocalIntentQueueDisclosure.jsx';
export default function EmployeeProfilePanel({runtime,repository,selection,onCloseSelection,visible}){
 const[state,setState]=useState(null),[creating,setCreating]=useState(false),[target,setTarget]=useState(null);const ticket=useRef(0);
 useEffect(()=>{if(!visible)return;let active=true;const load=async()=>{const id=++ticket.current;setState(previous=>previous?.runtime===runtime&&previous.repository===repository?{...previous,loading:true}: {runtime,repository,rows:[],error:'',loading:true});try{const rows=await repository.page();if(active&&id===ticket.current&&runtime.isCurrent())setState({runtime,repository,rows,error:'',loading:false});}catch(e){if(active&&id===ticket.current)setState({runtime,repository,rows:[],error:e.message,loading:false});}};const stop=runtime.subscribe(topic=>{if(topic==='employeeProfiles')void load();});void load();return()=>{active=false;ticket.current++;stop();};},[runtime,repository,visible]);
 const owned=runtime.isCurrent()&&state?.runtime===runtime&&state.repository===repository;
 const rows=owned?state.rows:[],error=owned?state.error:'',loading=!owned||state.loading;
 const chosen=selection||target;return <div hidden={!visible} className="space-y-3">
 <div className="flex items-start gap-2">
 {runtime.capabilities.includes('employeeProfile.create')&&<HDButton className="shrink-0" aria-label="Tạo hồ sơ nhân sự" onClick={()=>{setTarget(null);onCloseSelection();setCreating(true);}}>Tạo hồ sơ</HDButton>}
 <LocalIntentQueueDisclosure className="min-w-0 flex-1 rounded-xl border bg-white p-2" label="Thay đổi hồ sơ" rows={rows} error={Boolean(error)} loading={loading}>
 <HDCard className="space-y-2 p-3" aria-label="Thay đổi hồ sơ trên thiết bị">
 {error&&<p role="alert">{error}</p>}{rows.map(row=><div key={row.id} className="rounded-xl border p-2"><p>{row.document.name} · {row.document.phone} · {row.state}{row.document.isArchived?' · Ngừng hoạt động':''}</p><p className="break-words text-xs">{row.commandId}</p>
 {row.state==='SYNCED'&&!row.serverDocument?.isArchived&&runtime.capabilities.includes('employeeProfile.update')&&<HDButton variant="secondary" onClick={()=>{setCreating(false);onCloseSelection();setTarget(row.id);}}>Sửa hồ sơ {row.document.name}</HDButton>}
 {row.state==='CONFLICT_REQUIRES_REVIEW'&&<p role="alert">Hồ sơ máy chủ đã thay đổi. Giao dịch và biên nhận được giữ, không ghi đè tự động.</p>}{row.state==='SYNC_FAILED'&&<p role="alert">Chưa đồng bộ thành công. Hồ sơ và yêu cầu được giữ trên thiết bị.</p>}</div>)}
 {loading&&<p role="status">Đang đọc thay đổi hồ sơ trên thiết bị…</p>}
 {!loading&&!error&&!rows.length&&<p>Không có thay đổi hồ sơ trong trang Outbox đã đọc.</p>}</HDCard>
 </LocalIntentQueueDisclosure></div>
 {(creating||chosen)&&<EmployeeProfileEditor key={chosen||'new'} runtime={runtime} repository={repository} target={chosen||null} onClose={()=>{setCreating(false);setTarget(null);onCloseSelection();}}/>}
 </div>;
}
