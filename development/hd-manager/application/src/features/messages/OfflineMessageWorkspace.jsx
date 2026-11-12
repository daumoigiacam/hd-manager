import React,{useEffect,useRef,useState} from 'react';
import {HDButton,HDStatusState} from '../../design-system/components.jsx';
import {getOfflineMessageReadState,offlineMessageSource} from './offlineMessageModel.js';

/** No transport is started until the actual signed permission/feed exists.
 * directory is deliberately not consumed: Home records cannot authorize inboxes.
 * Tabs survive Activity hide/show; a changed initialSource is explicit navigation.
 */
export default function OfflineMessageWorkspace({runtime,onNavigate,initialSource='messages'}) {
  const [source,setSource]=useState(()=>offlineMessageSource(initialSource));
  const previousSource=useRef(initialSource);
  useEffect(()=>{if(previousSource.current===initialSource)return;previousSource.current=initialSource;setSource(offlineMessageSource(initialSource));},[initialSource]);
  const state=getOfflineMessageReadState(runtime,source),notifications=source==='notifications';
  return <section className="space-y-4 p-4 pb-24" data-offline-message-state={state.state}>
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-black">Tin nhắn / thông báo</h1>{onNavigate&&<HDButton variant="secondary" onClick={()=>onNavigate('home')}>Trang chủ</HDButton>}</header>
    <nav className="flex gap-2" aria-label="Tin nhắn và thông báo"><HDButton variant={!notifications?'primary':'secondary'} aria-current={!notifications?'page':undefined} onClick={()=>setSource('messages')}>Tin nhắn</HDButton><HDButton variant={notifications?'primary':'secondary'} aria-current={notifications?'page':undefined} onClick={()=>setSource('notifications')}>Thông báo</HDButton></nav>
    <HDStatusState status="empty" title={notifications?'Chưa thể đọc thông báo Offline':'Chưa thể đọc tin nhắn Offline'} description={state.message}/>
    {state.state==='NOT_PROVISIONED'&&<p className="rounded-xl bg-amber-50 p-3 text-sm">Cần hoàn tất quyền đọc và nguồn đồng bộ riêng cho mục này. Các chứng từ Trang chủ đã lưu không thay thế được quyền đọc hội thoại hoặc thông báo cá nhân.</p>}
    <div className="flex flex-wrap gap-2" aria-label="Chức năng chưa được cấp giao thức Offline">{!notifications&&<HDButton disabled>Gửi tin nhắn</HDButton>}<HDButton disabled variant="secondary">Đánh dấu đã đọc</HDButton></div>
  </section>;
}
