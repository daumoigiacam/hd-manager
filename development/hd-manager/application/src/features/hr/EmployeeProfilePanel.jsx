import React,{useEffect,useRef,useState}from'react';import{HDButton,HDCard}from'../../design-system/index.js';import EmployeeProfileEditor from'./EmployeeProfileEditor.jsx';
export default function EmployeeProfilePanel({runtime,repository,selection,onCloseSelection,visible}){
 const[rows,setRows]=useState([]),[error,setError]=useState(''),[creating,setCreating]=useState(false),[target,setTarget]=useState(null);const ticket=useRef(0);
 useEffect(()=>{let active=true;const load=async()=>{const id=++ticket.current;try{const rows=await repository.page();if(active&&id===ticket.current&&runtime.isCurrent()){setRows(rows);setError('');}}catch(e){if(active)setError(e.message);}};const stop=runtime.subscribe(topic=>{if(topic==='employeeProfiles')void load();});void load();return()=>{active=false;ticket.current++;stop();};},[runtime,repository]);
 const chosen=selection||target;return <div hidden={!visible} className="space-y-3">
 <HDCard className="space-y-2 p-3" aria-label="Thay đổi hồ sơ trên thiết bị"><h2 className="font-bold">Hồ sơ nhân sự · SQLite và Outbox</h2>
 {runtime.capabilities.includes('employeeProfile.create')&&<HDButton onClick={()=>{setTarget(null);onCloseSelection();setCreating(true);}}>Tạo hồ sơ nhân sự</HDButton>}
 {error&&<p role="alert">{error}</p>}{rows.map(row=><div key={row.id} className="rounded-xl border p-2"><p>{row.document.name} · {row.document.phone} · {row.state}{row.document.isArchived?' · Ngừng hoạt động':''}</p><p className="break-words text-xs">{row.commandId}</p>
 {row.state==='SYNCED'&&!row.serverDocument?.isArchived&&runtime.capabilities.includes('employeeProfile.update')&&<HDButton variant="secondary" onClick={()=>{setCreating(false);onCloseSelection();setTarget(row.id);}}>Sửa hồ sơ {row.document.name}</HDButton>}
 {row.state==='CONFLICT_REQUIRES_REVIEW'&&<p role="alert">Hồ sơ máy chủ đã thay đổi. Giao dịch và biên nhận được giữ, không ghi đè tự động.</p>}{row.state==='SYNC_FAILED'&&<p role="alert">Chưa đồng bộ thành công. Hồ sơ và yêu cầu được giữ trên thiết bị.</p>}</div>)}
 {!rows.length&&<p>Chưa có thay đổi hồ sơ trong Outbox tài khoản này.</p>}</HDCard>
 {(creating||chosen)&&<EmployeeProfileEditor key={chosen||'new'} runtime={runtime} repository={repository} target={chosen||null} onClose={()=>{setCreating(false);setTarget(null);onCloseSelection();}}/>}
 </div>;
}
