import {useLayoutEffect,useRef} from 'react';
import {ArrowRight,BarChart3} from 'lucide-react';
import {recordStartupEvent} from '../services/startupTelemetry.js';
import './working-home.css';

// This is part of the real Home, not another application/runtime. A report may
// be unavailable without making navigation or nonfinancial work unavailable.
export default function WorkingHome({ready=false,storageReady=true,active=true,scope='',modules=[],onNavigate,onRequestReport,reportRequested=false}) {
 const announced=useRef('');
 useLayoutEffect(()=>{if(ready&&active&&scope&&announced.current!==scope){
  announced.current=scope;recordStartupEvent('workspace.interactive',{reportRequired:false});
 }},[ready,active,scope]);
 return <section className="hd-working-home" data-hd-workspace-ready={ready&&active?'true':'false'} data-hd-local-storage-ready={storageReady?'true':'false'} aria-label="Màn hình làm việc">
  <div className="hd-working-home__heading"><h2>Làm việc</h2>
   <p role="status">{ready?'Chọn chức năng để bắt đầu. Báo cáo không chặn công việc.':'Đang xác nhận tài khoản và quyền truy cập…'}</p></div>
  {ready&&<div className="hd-working-home__modules">{modules.map(item=><button type="button" key={item.id} onClick={()=>onNavigate?.(item.id)}>
   <span>{item.label}</span><ArrowRight size={17} aria-hidden="true"/>
  </button>)}</div>}
  {ready&&onRequestReport&&<button type="button" className="hd-working-home__report" onClick={onRequestReport}>
   <BarChart3 size={18} aria-hidden="true"/><span>{reportRequested?'Xem tình trạng báo cáo':'Xem báo cáo'}</span><ArrowRight size={17} aria-hidden="true"/>
  </button>}
 </section>;
}
