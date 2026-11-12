import React from 'react';
import { Trash2, X } from 'lucide-react';
import './dispatch-dialogs.css';
import { useDispatchDialogFocus } from './useDispatchDialogFocus.js';

/** @typedef {{id: string, productLabel: string, sizeLabel: string, quantityLabel: string, requestDateLabel: string}} ShortageRow */
/**
 * @template {ShortageRow} T
 * @param {{customerName: string, rows: readonly T[], canDelete: boolean, deletingKey: string,
 * closing: boolean, error?: string, onClose: () => void, onDelete: (row: T) => void, onCloseShortage: () => void}} props
 */
export default function DispatchShortageDialog({ customerName, rows, canDelete, deletingKey, closing, error = '', onClose, onDelete, onCloseShortage }) {
  const dialogRef = useDispatchDialogFocus(onClose);
  return <div className="hd-dispatch-dialog-layer">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Đơn còn thiếu" className="hd-dispatch-dialog">
      <header className="hd-dispatch-dialog-heading">
        <div><p>Đơn còn thiếu</p><h3>{customerName}</h3></div>
        <button type="button" className="hd-dispatch-dialog-icon" onClick={onClose} aria-label="Đóng chi tiết đơn đặt"><X size={18} /></button>
      </header>
      {error && <p role="alert" className="hd-dispatch-dialog-danger">{error}</p>}
      <table className="hd-dispatch-dialog-table">
        <thead><tr><th>Loại</th><th>SL</th><th>Ngày</th>{canDelete && <th>Xóa</th>}</tr></thead>
        <tbody>{rows.length ? rows.map(row => <tr key={row.id}>
          <td>{row.productLabel}{row.sizeLabel && <small>Size: {row.sizeLabel}</small>}</td>
          <td>{row.quantityLabel || '-'}</td><td>{row.requestDateLabel || '-'}</td>
          {canDelete && <td><button type="button" className="hd-dispatch-dialog-icon hd-dispatch-dialog-danger"
            onClick={() => { dialogRef.current?.focus(); onDelete(row); }} disabled={Boolean(deletingKey) || closing} aria-busy={deletingKey === row.id}
            aria-label="Xóa đơn đặt sai" title="Xóa đơn đặt sai khỏi Đơn Thiếu"><Trash2 size={14} /></button></td>}
        </tr>) : <tr><td colSpan={canDelete ? 4 : 3}>Chưa có dữ liệu đơn đặt.</td></tr>}</tbody>
      </table>
      <button type="button" className="hd-dispatch-dialog-action" onClick={() => { dialogRef.current?.focus(); onCloseShortage(); }} disabled={closing || Boolean(deletingKey)} aria-busy={closing}>
        {closing ? 'Đang chốt thiếu...' : 'Chốt thiếu, không giao bù'}
      </button>
    </section>
  </div>;
}
