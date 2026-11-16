import {useRetainedReadProjection} from '../../hooks/useRetainedReadProjection.js';

export default function OrderReadBoundary({projection, identity, enabled, onRetry, children}) {
  const presentation = useRetainedReadProjection(projection, identity, {enabled});
  return <div key={identity} data-hd-order-read-boundary aria-busy={projection.pending || !enabled}>
    {presentation.available && children(presentation.value)}
    {!presentation.available && !projection.error && <div role="status" aria-busy="true" className="p-4 text-sm text-slate-600">Đang mở đơn hàng…</div>}
    {projection.error && <div role="alert" className="p-4 text-sm text-rose-700">Chưa đối chiếu được công nợ. <button type="button" className="font-bold underline" onClick={onRetry}>Thử lại</button></div>}
  </div>;
}
