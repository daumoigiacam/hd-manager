import React from 'react';
import { Send, Trash2, X } from 'lucide-react';
import './dispatch-dialogs.css';
import { useDispatchDialogFocus } from './useDispatchDialogFocus.js';

/** @typedef {{id: string, customerName: string, productName: string, productShortName?: string, pieceCount: number, quantityUnit: string, weightKg: number}} HistoryRow */
/**
 * @template {HistoryRow} T
 * @param {{dateLabel: string, customerCount: number, lineCount: number, weight: number,
 * rows: readonly T[], canShare: boolean, canDelete: boolean, exporting: boolean, deletingId?: string, error?: string,
 * onClose: () => void, onShare: () => void, onDelete: (row: T) => void,
 * formatNumber: (value: number) => string, compactProductName: (name: string) => string}} props
 */
export default function DispatchHistoryDialog({ dateLabel, customerCount, lineCount, weight, rows,
  canShare, canDelete, exporting, onClose, onShare, onDelete, formatNumber, compactProductName, deletingId = '', error = '' }) {
  const dialogRef = useDispatchDialogFocus(onClose);
  return <div className="hd-dispatch-dialog-layer">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Chi tiết phiếu xuất" className="hd-dispatch-dialog hd-dispatch-dialog--history">
      <header className="hd-dispatch-dialog-heading">
        <div><p>Chi tiết phiếu xuất</p><h3>{dateLabel}</h3>
          <p>{customerCount} khách • {lineCount} dòng xuất • {formatNumber(weight)} kg</p></div>
        <button type="button" className="hd-dispatch-dialog-icon" onClick={onClose} aria-label="Đóng chi tiết phiếu xuất"><X size={18} /></button>
      </header>
      {error && <p role="alert" className="hd-dispatch-dialog-danger">{error}</p>}
      {canShare && <button type="button" className="hd-dispatch-dialog-action" onClick={onShare} disabled={exporting} aria-busy={exporting}>
        <Send size={16} />{exporting ? 'Đang chuẩn bị...' : 'Chia sẻ phiếu này'}
      </button>}
      <table className="hd-dispatch-dialog-table">
        <thead><tr><th>Tên KH</th><th>Loại</th><th>SL</th><th>Kg</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id || `${row.customerName}-${row.productName}-${index}`}>
          <td><div className="hd-dispatch-dialog-cell-actions"><span>{row.customerName || '-'}</span>
            {canDelete && <button type="button" disabled={Boolean(deletingId)} aria-busy={deletingId === row.id} className="hd-dispatch-dialog-icon hd-dispatch-dialog-danger" onClick={() => onDelete(row)} aria-label="Xóa lịch sử xuất kho" title="Xóa lịch sử"><Trash2 size={14} /></button>}
          </div></td>
          <td>{row.productShortName || compactProductName(row.productName || '') || '-'}</td>
          <td>{row.pieceCount ? `${formatNumber(row.pieceCount)} ${row.quantityUnit || ''}`.trim() : '-'}</td>
          <td>{row.weightKg ? formatNumber(row.weightKg) : '-'}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div>;
}
