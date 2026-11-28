import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatVnd } from './reportViewModel.js';
import { getEmployeeRevenueYears, selectEmployeeRevenueYear, selectRevenueDetail } from './revenueDetailModel.js';

export default function RevenueDetail({ business, selection, report, onOpenOrder, view = 'period', onViewChange, onEmployeeChange, asOfDate = report.endDate }) {
  const [page, setPage] = useState(0);
  const [openError, setOpenError] = useState('');
  const [year, setYear] = useState(() => String(report.endDate || asOfDate).slice(0, 4));
  const [monthKey, setMonthKey] = useState('');
  const invoiceHeading = useRef(null);
  const annualView = selection.kind === 'employee' && view === 'annual';
  const employeeOptions = useMemo(() => {
    const options = new Map();
    for (const row of business.salesEmployeeOrders || []) if (row.id) options.set(String(row.id), row.salesEmployeeName || row.name || 'Nhân viên');
    if (selection.kind === 'employee') options.set(String(selection.id), selection.name || 'Nhân viên');
    return [...options].map(([id, name]) => ({id, name})).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [business.salesEmployeeOrders, selection]);
  const years = useMemo(() => getEmployeeRevenueYears(business, selection, asOfDate, year), [business, selection, asOfDate, year]);
  const activeYear = years.includes(year) ? year : years[0];
  const annual = useMemo(() => annualView ? selectEmployeeRevenueYear(business, selection, activeYear, asOfDate) : null, [annualView, business, selection, activeYear, asOfDate]);
  const month = annual?.months.find(item => item.key === monthKey && !item.future);
  const detailReport = month || report;
  const detail = useMemo(() => selectRevenueDetail(business, selection, detailReport), [business, selection, detailReport]);
  const showInvoices = !annualView || Boolean(month);
  const summary = annualView ? annual : detail;
  const pageCount = Math.max(1, Math.ceil(detail.rows.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const peak = Math.max(0, ...(annual?.months.map(item => item.revenue) || []));
  const resetList = () => { setPage(0); setOpenError(''); };
  useEffect(() => {
    if (annualView && monthKey) invoiceHeading.current?.scrollIntoView?.({behavior: 'smooth', block: 'start'});
  }, [annualView, monthKey]);
  return <section className="business-report-revenue-detail" aria-label="Chi tiết doanh thu">
    <h2>{selection.name}</h2>
    {selection.kind === 'employee' && onViewChange && <div className="business-report-revenue-modes" role="group" aria-label="Cách xem doanh thu nhân viên">
      {[['period', 'Theo bộ lọc'], ['annual', '12 tháng trong năm']].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => { resetList(); setMonthKey(''); onViewChange(id); }}>{label}</button>)}
    </div>}
    {annualView ? <div className="business-report-year-picker">
      {onEmployeeChange && <label>Nhân viên<select aria-label="Nhân viên xem doanh thu" value={String(selection.id)} onChange={event => { const selected = employeeOptions.find(item => item.id === event.target.value); if (selected) { resetList(); onEmployeeChange({...selected, kind: 'employee'}); } }}>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label>Năm xem doanh thu<select aria-label="Năm xem doanh thu" value={activeYear || ''} onChange={event => { setYear(event.target.value); setMonthKey(''); resetList(); }}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label><p className="business-report-scope">Doanh thu ghi nhận đến {asOfDate.split('-').reverse().join('/')}. Chọn tháng để xem hóa đơn.</p></div> : <p className="business-report-scope">{report.label}</p>}
    <div className="business-report-mini-grid">
      <div><span>{annualView ? `Doanh thu năm ${activeYear || ''}` : 'Doanh thu'}</span><strong>{summary ? formatVnd(summary.revenue) : 'Chưa có dữ liệu'}</strong></div>
      <div><span>{annualView ? 'Hóa đơn trong năm' : 'Đơn hàng'}</span><strong>{summary ? (annualView ? summary.orders : detail.rows.length) : '—'}</strong></div>
    </div>
    {annualView && annual && <div className="business-report-month-grid" role="group" aria-label={`Doanh thu 12 tháng năm ${activeYear}`}>
      {annual.months.map(item => <button type="button" key={item.key} className="business-report-month" disabled={item.future} aria-pressed={monthKey === item.key} aria-label={`Tháng ${item.month}/${activeYear}: ${item.future ? 'Chưa đến kỳ' : `${formatVnd(item.revenue)}, ${item.orders} hóa đơn`}`} onClick={() => { setMonthKey(item.key); resetList(); }}>
        <span>Tháng {item.month}</span><strong>{item.future ? '—' : formatVnd(item.revenue)}</strong><small>{item.future ? 'Chưa đến kỳ' : `${item.orders} hóa đơn`}</small>
        <i aria-hidden="true"><b style={{width: `${peak > 0 ? Math.max(0, item.revenue) / peak * 100 : 0}%`}} /></i>
      </button>)}
    </div>}
    {annualView && !month && <p className="business-report-scope">Chọn một tháng ở trên để xem chi tiết.</p>}
    {annualView && month && <div className="business-report-month-heading" ref={invoiceHeading}><h3>Hóa đơn tháng {month.month}/{activeYear}</h3><p>{month.orders} hóa đơn · <strong>{formatVnd(month.revenue)}</strong></p><button type="button" onClick={() => { setMonthKey(''); resetList(); }}>Xem tổng năm</button></div>}
    {showInvoices && <>
      {!detail.rows.length && <p>Không có đơn hàng trong kỳ này.</p>}
      <ol className="business-report-revenue-orders">
        {detail.rows.slice(currentPage * 20, (currentPage + 1) * 20).map((row, index) => {
          const content = <span className="business-report-order-summary"><span>{row.customerName || row.name || 'Khách hàng'}</span><strong>{formatVnd(row.revenue)}</strong></span>;
          return <li key={row.orderId || index}>
            {row.orderId && onOpenOrder ? <button type="button" className="business-report-order-link" aria-label={`Xem hóa đơn ${row.customerName || row.name || 'khách hàng'}, ${formatVnd(row.revenue)}`} onClick={() => {
              setOpenError('');
              if (onOpenOrder(row.orderId) === false) setOpenError('Không thể mở hóa đơn. Vui lòng kiểm tra quyền xem đơn hàng.');
            }}>{content}</button> : content}
          </li>;
        })}
      </ol>
      {openError && <p role="alert">{openError}</p>}
      {pageCount > 1 && <nav className="business-report-detail-pager" aria-label="Trang đơn hàng">
        <button type="button" title="Trang trước" aria-label="Trang trước" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" title="Trang sau" aria-label="Trang sau" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button>
      </nav>}
    </>}
  </section>;
}
