import { useSyncExternalStore } from 'react';
const noopSubscribe = () => () => {};
const empty = () => 0;
export default function ReadWorkerActivityNotice({ store }) {
  const pending = useSyncExternalStore(store?.subscribe || noopSubscribe,store?.getSnapshot || empty,empty);
  if (!pending) return null;
  return <div role="status" aria-busy="true" data-hd-read-refreshing="true" className="pointer-events-none sticky top-0 z-10 h-0 overflow-visible">
    <span className="absolute right-0 top-0 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 shadow-sm">Đang cập nhật dữ liệu…</span>
  </div>;
}
