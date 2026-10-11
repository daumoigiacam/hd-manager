import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatVnd } from './reportViewModel.js';
import { selectRevenueDetail } from './revenueDetailModel.js';

export default function RevenueDetail({ business, selection, report }) {
  const [page, setPage] = useState(0);
  const detail = useMemo(() => selectRevenueDetail(business, selection, report), [business, selection, report]);
  const pageCount = Math.max(1, Math.ceil(detail.rows.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  return <section className="business-report-revenue-detail" aria-label="Chi tiết doanh thu">
    <h2>{selection.name}</h2>
    <p className="business-report-scope">{report.label}</p>
    <div className="business-report-mini-grid">
      <div><span>Doanh thu</span><strong>{formatVnd(detail.revenue)}</strong></div>
      <div><span>Đơn hàng</span><strong>{detail.rows.length}</strong></div>
    </div>
    {!detail.rows.length && <p>Không có đơn hàng trong kỳ này.</p>}
    <ol className="business-report-revenue-orders">
      {detail.rows.slice(currentPage * 20, (currentPage + 1) * 20).map((row, index) => <li key={row.orderId || index}>
        <div><strong>{row.orderCode || 'Đơn hàng'}</strong><time>{row.date}</time></div>
        <p>{row.customerName || row.name}</p>
        <p className="business-report-scope">Kinh doanh: {row.salesEmployeeName || 'Chưa phân công'}</p>
        <strong>{formatVnd(row.revenue)}</strong>
      </li>)}
    </ol>
    {pageCount > 1 && <nav className="business-report-detail-pager" aria-label="Trang đơn hàng">
      <button type="button" title="Trang trước" aria-label="Trang trước" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button>
      <span>{currentPage + 1} / {pageCount}</span>
      <button type="button" title="Trang sau" aria-label="Trang sau" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button>
    </nav>}
  </section>;
}
