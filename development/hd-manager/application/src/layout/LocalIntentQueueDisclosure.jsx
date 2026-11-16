import React from 'react';
import {localQueueNeedsAttention} from './localQueueAttention.js';

// One already-bounded repository page. This never claims the global Outbox is
// empty. Pending/error/unknown receipts and further pages stay expanded.
export default function LocalIntentQueueDisclosure({label,rows=[],hasMore=false,error=false,loading=false,children,className='rounded-xl border bg-white p-3'}){
 return <details className={className} open={localQueueNeedsAttention({rows,hasMore,error})}>
  <summary className="cursor-pointer text-sm font-semibold text-blue-700">{label} · {loading?'Đang đọc trạng thái':`${rows.length} phiếu trong trang`}{hasMore?' · Còn trang tiếp theo':''}</summary>
  <div className="mt-3 space-y-2">{children}</div>
 </details>;
}
