import React,{useSyncExternalStore} from 'react';
import {readWebOfflineStatus,subscribeWebOfflineStatus} from '../services/webOfflineShell.js';
export default function WebOfflineNotice(){
 const status=useSyncExternalStore(subscribeWebOfflineStatus,readWebOfflineStatus,readWebOfflineStatus);
 const message=status.shell==='initializing'?'Đang lưu giao diện để có thể mở lại khi mất mạng.':status.shell==='unavailable'?'Chưa sẵn sàng mở lại Web khi mất mạng. Dữ liệu đã lưu vẫn được giữ nguyên.':status.persistent===false?'Trình duyệt chưa bảo đảm giữ bộ nhớ Offline lâu dài. Đừng xóa dữ liệu trang khi còn giao dịch chờ đồng bộ.':'';
 if(!message)return null;
 return <aside role="status" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{message}</aside>;
}
