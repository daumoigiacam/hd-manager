import React,{useEffect,useRef,useState} from 'react';
import PreloadedWorkspace from '../../layout/PreloadedWorkspace.jsx';
import {createPreloadableModule} from '../../utils/preloadableModule.js';
// Home is already requested. Keep demand loading, but don't suspend a newly
// mounted report and incur a second fallback scheduling delay after local data.

const reportModule=createPreloadableModule(()=>import('./OfflineHomeReport.jsx').then(({default:View})=>({default:props=><View {...props}/>})));
const nativeModule=createPreloadableModule(()=>import('./OfflineNativeHome.jsx'));


// Same product report view/calculator as Online; data comes from the account's
// encrypted repository. Never convert missing history or missing grants to zero.
export default function OfflineHome({runtime,verifiedLaunch,onNavigate,initialResult=null}) {
  const [result,setResult]=useState(initialResult),[loaded,setLoaded]=useState(Boolean(initialResult)),[error,setError]=useState('');
  const initialConsumed=useRef(false);
  const [,setSyncStatus]=useState(null);
  useEffect(()=>{
    if(!runtime)return;
    let active=true,sequence=0;
    const load=async()=>{
      const ticket=++sequence;
      try{const value=runtime.home?await runtime.home.read():null;if(active&&ticket===sequence&&runtime.isCurrent()){setResult(value);setLoaded(true);setError('');setSyncStatus(runtime.home?.status());}}
      catch(failure){if(active&&ticket===sequence){setError(failure.message);setLoaded(true);}}
    };
    if(!initialResult||initialConsumed.current)void load();initialConsumed.current=true;
    const release=runtime.subscribe(topic=>{if(topic==='home')void load();else if(topic==='home-status')setSyncStatus(runtime.home?.status());});
    // Intent-only network work, independent of the local read above. The same
    // Runtime owns the single-flight feed/worker; it survives screen changes.
    void runtime.home?.sync().catch(()=>{});
    return()=>{active=false;sequence++;release();};
  },[runtime]);
  const previousInitialResult=useRef(initialResult);
  useEffect(()=>{if(previousInitialResult.current!==initialResult){previousInitialResult.current=initialResult;setResult(initialResult);setLoaded(true);}},[initialResult]);
  if(error)return <p role="alert">Không đọc được báo cáo trên máy: {error}</p>;
  if(!loaded)return <p role="status">Đang mở báo cáo đã lưu trên máy…</p>;
  if(!result){const status=runtime.home?.status();return <section><h1>Trang chủ</h1><p>{runtime.home?'Chưa có báo cáo đầy đủ được lưu trên thiết bị.':'Phiên Offline này chưa được cấp quyền xem báo cáo tài chính.'}</p>{status?.state==='SYNCING'&&<p role="status">Đang nhận dữ liệu nghiệp vụ {status.applied||0}/{status.target||0}. KPI sẽ xuất hiện khi đủ nguồn.</p>}{status?.state==='SYNC_FAILED'&&<p role="alert">Chưa nhận đủ dữ liệu: {status.error}</p>}</section>;}
  if(result.sourceProfile==='native-isolation-v1')return <PreloadedWorkspace module={nativeModule} viewProps={{runtime,result}} label="dữ liệu native đã lưu"/>;
  return <section data-home-local-generation={result.generation}>
    <p role="status">{(runtime?.home?.status()||{state:'OPENING_DATABASE'}).state==='SYNCING'?'Đang nhận thay đổi mới · Báo cáo đã lưu vẫn sử dụng được':(runtime?.home?.status()||{state:'OPENING_DATABASE'}).state==='SYNC_FAILED'?'Chưa đồng bộ được thay đổi mới · Đang dùng bản đã lưu':'Báo cáo đã lưu trên thiết bị'}</p>
    <p role="status">{!runtime&&'Bộ lưu trữ đang mở · Bản cache mã hóa đã xác minh quyền. '}Ngày dữ liệu {result.dayKey} · Lưu lúc {new Date(result.capturedAt).toLocaleString('vi-VN')} · {(runtime?.home?.status()||{state:'OPENING_DATABASE'}).state==='SYNCED'?'Đã đối chiếu phiên bản nguồn server.':'Bản đã lưu chưa được đối chiếu thay đổi mới.'} Chưa gồm giao dịch đang chờ xác nhận.</p>
    <PreloadedWorkspace module={reportModule} viewProps={{result,runtime,verifiedLaunch,onNavigate}} label="báo cáo đã lưu"/>
  </section>;
}
