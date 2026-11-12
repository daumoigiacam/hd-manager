import React,{useEffect,useRef,useState}from'react';
import{HDButton,HDCard,HDInput,HDSelect}from'../../design-system/index.js';
const labels={name:'Họ tên nhân sự',phone:'Điện thoại nhân sự',address:'Địa chỉ nhân sự',email:'Email nhân sự',department:'Bộ phận nhân sự',employeeCode:'Mã nhân viên'};
const empty=()=>Object.fromEntries(Object.keys(labels).map(k=>[k,'']));
export default function EmployeeProfileEditor({runtime,repository,target,onClose}){
 const owner=useRef(null);if(!owner.current||owner.current.runtime!==runtime||owner.current.repository!==repository||owner.current.target!==target)owner.current={runtime,repository,target};const[proof,setProof]=useState(null),[input,setInput]=useState(empty),[position,setPosition]=useState('Kinh doanh'),[busy,setBusy]=useState(false),[saved,setSaved]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;if(target){setBusy(true);repository.prepare(target).then(p=>{if(live){setProof(p);setInput(p.input);setPosition(p.position);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});}return()=>{live=false;};},[target,repository]);
 async function submit(archive=false){if(busy||saved)return;const own=owner.current;setBusy(true);setError('');try{const value=archive?await repository.archive(proof):proof?await repository.update(proof,input):await repository.create(input,position,globalThis.crypto.randomUUID());if(owner.current===own&&runtime.isCurrent())setSaved(value);}catch(e){if(owner.current===own)setError(e.message);}finally{if(owner.current===own)setBusy(false);}}
 // Changes to background data never replace these controlled draft fields.
 return <HDCard className="space-y-3 p-4" aria-label="Hồ sơ nhân sự Offline"><h2 className="font-bold">{target?'Chỉnh sửa hồ sơ nhân sự':'Tạo hồ sơ nhân sự'}</h2>
 <p className="text-sm">Hồ sơ lưu trên thiết bị trước, máy chủ kiểm tra quyền và số điện thoại khi đồng bộ. Quyền đăng nhập, lương, ca làm và chính sách không được sửa qua biểu mẫu này.</p>
 {Object.entries(labels).map(([key,label])=><HDInput key={key} label={label} value={input[key]} disabled={busy||!!saved} onChange={e=>setInput(p=>({...p,[key]:e.target.value}))}/>)}
 {!target&&<HDSelect label="Vị trí nhân sự" value={position} disabled={busy||!!saved} onChange={e=>setPosition(e.target.value)}><option>Kinh doanh</option><option>Tài xế</option><option>Sản xuất</option><option>Xuất kho</option></HDSelect>}
 {error&&<p role="alert">{error} Bản nhập được giữ.</p>}{saved&&<p role="status">Đã lưu hồ sơ bền trên SQLite. Mã yêu cầu: {saved.commandId}. Xem trạng thái đồng bộ trong danh sách thay đổi.</p>}
 <div className="flex gap-2"><HDButton disabled={busy||!!saved||!!target&&!proof} onClick={()=>submit()}>Lưu hồ sơ trên thiết bị</HDButton>{proof&&runtime.capabilities.includes('employeeProfile.archive')&&<HDButton disabled={busy||!!saved} onClick={()=>submit(true)}>Ngừng hoạt động nhân sự</HDButton>}<HDButton variant="secondary" disabled={busy} onClick={onClose}>Đóng hồ sơ</HDButton></div></HDCard>;
}
