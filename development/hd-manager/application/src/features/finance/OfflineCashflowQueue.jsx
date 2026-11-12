import React,{useEffect,useState} from 'react';
import {HDButton,HDCard} from '../../design-system/index.js';

export default function OfflineCashflowQueue({repository,refresh,onResolve}) {
  const [state,setState]=useState({repository:null,rows:[],error:'',loading:false});
  const [manual,setManual]=useState(0);
  useEffect(()=>{
    let active=true;
    setState(previous=>previous.repository===repository?{...previous,loading:true}:{repository,rows:[],error:'',loading:true});
    repository.page({limit:40}).then(rows=>{if(active)setState({repository,rows,error:'',loading:false});})
      .catch(error=>{if(active)setState(previous=>({...previous,error:error.message,loading:false}));});
    return()=>{active=false;};
  },[repository,refresh,manual]);
  const rows=state.repository===repository?state.rows:[];
  return <HDCard className="space-y-3 p-3" aria-label="Phiếu thu chi trên thiết bị">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">Phiếu thủ công trên thiết bị · tối đa 40 phiếu gần nhất</h2><HDButton variant="secondary" loading={state.loading} onClick={()=>setManual(value=>value+1)}>Cập nhật trạng thái</HDButton></div>
    <p className="text-sm text-slate-600">Bản nhập chờ máy chủ được tách khỏi danh mục nguồn đã xác nhận; không cộng vào tổng hay số dư.</p>
    {state.error&&<p role="alert">{state.error}</p>}
    <ul className="space-y-2">{rows.map(row=><li key={`${row.source}:${row.id}`} className="space-y-2 rounded-xl border p-3">
      <p>{row.source==='payments'?'Báo thu':'Khoản chi'} · {row.id}</p><p>{row.input.amount} đ · {row.input.date} · {row.input.note}</p>
      <p className="text-sm">{row.state==='SYNCED'?'Đã có biên nhận máy chủ':row.state==='CONFLICT_REQUIRES_REVIEW'?'Xung đột — cần kiểm tra':row.state==='SYNC_FAILED'?'Đồng bộ thất bại — chưa được máy chủ chấp nhận':'Đã lưu trên thiết bị — chờ máy chủ'} ({row.state})</p>
      {row.receipt?.document&&<p className="text-sm">Phê duyệt máy chủ: {row.receipt.document.approvalStatus==='approved'?'Đã xác nhận':'Chờ xác nhận'}</p>}
      {row.receipt?.reason&&<p className="text-sm">{row.receipt.reason}</p>}
      {row.state==='CONFLICT_REQUIRES_REVIEW'&&row.receipt?.currentDocument&&<HDButton variant="secondary" disabled={state.loading} onClick={()=>onResolve(row)}>Xem bản máy chủ, giữ bản nhập để xử lý</HDButton>}
    </li>)}</ul>
  </HDCard>;
}
