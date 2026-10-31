import {memo} from 'react';

// Do not suspend a source update whose calculation starts in a parent effect:
// startTransition can delay that commit indefinitely. Retain the completed
// subtree, hidden and without new props, until its replacement is ready. Put
// any financial context provider INSIDE this retained subtree as well.
const CompletedContent = memo(function CompletedContent({ready, children}) {
  return ready ? (typeof children === 'function' ? children() : children) : null;
}, (_previous, next) => !next.ready);

export function CompletedProjectionGate({projection, onRetry, children, pendingContent, errorContent}) {
  const ready = !projection.pending && !projection.error;
  return <>
    <div data-hd-projection-content style={{display: ready ? undefined : 'none'}} aria-hidden={!ready || undefined}>
      <CompletedContent ready={ready}>{children}</CompletedContent>
    </div>
    {projection.pending && (pendingContent || <LedgerPreparationNotice />)}
    {!projection.pending && projection.error && <div role="alert" className="p-4 text-sm text-rose-700">
      {errorContent || 'Chưa đối chiếu được công nợ. Vui lòng thử lại.'}
      <button type="button" className="ml-2 font-bold underline" onClick={onRetry}>Thử lại</button>
    </div>}
  </>;
}

export function LedgerPreparationNotice() {
  return <div data-hd-ledger-loading role="status" aria-busy="true" className="p-4 text-sm text-slate-600">
    Đang đối chiếu công nợ…
  </div>;
}
