import { createContext, useContext, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export const SyncQueueContext = createContext({ writes: [], onRetry: async () => {} });

export default function SyncQueueStatus() {
  const { writes, onRetry } = useContext(SyncQueueContext);
  const inFlight = useRef(new Set());
  const [busy, setBusy] = useState({});
  const [error, setError] = useState('');
  const stopped = writes.filter(write => ['blocked', 'paused'].includes(write.syncState));
  const retry = async write => {
    if (inFlight.current.has(write.key)) return;
    inFlight.current.add(write.key);
    setBusy(value => ({ ...value, [write.key]: true }));
    setError('');
    try { await onRetry(write); }
    catch (failure) { setError(failure.message || 'Chưa đồng bộ được. Bản lưu tạm vẫn được giữ.'); }
    finally {
      inFlight.current.delete(write.key);
      setBusy(value => ({ ...value, [write.key]: false }));
    }
  };
  return (
    <aside className="hd-sync-queue" aria-label="Trạng thái đồng bộ">
      <details>
        <summary><AlertCircle size={16} /> <span>Trạng thái đồng bộ</span></summary>
        <div className="hd-sync-queue__content">
          <p>{writes.length ? `${writes.length} thao tác đang chờ xác nhận${stopped.length ? ` · ${stopped.length} cần xử lý` : ''}` : 'Không có thao tác chờ đồng bộ.'}</p>
          {error && <p role="alert">{error}</p>}
          {writes.map(write => (
            <div className="hd-sync-queue__item" key={write.key}>
              <div><strong>{write.documentId}</strong><p>{write.lastError || 'Đã lưu trên thiết bị, đang đồng bộ.'}</p></div>
              {['blocked', 'paused'].includes(write.syncState) && <button type="button" title="Thử đồng bộ lại" aria-label={`Thử đồng bộ ${write.documentId}`} disabled={busy[write.key]} onClick={() => retry(write)}><RefreshCw size={18} /></button>}
            </div>
          ))}
        </div>
      </details>
    </aside>
  );
}
