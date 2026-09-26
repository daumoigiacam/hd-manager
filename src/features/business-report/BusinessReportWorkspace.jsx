import React, { useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3,
  Bell, CalendarDays, ChevronDown, ChevronRight, CircleDollarSign, Filter,
  Menu, Package, PieChart, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import {
  REPORT_PERIODS, formatCompactVnd, formatPercent, formatShortDate, formatVnd,
  getChangePercent, getProductImage, getReportPeriod, getRevenueGroups, getTopSalesEmployees,
} from './reportViewModel.js';
import { buildProductDailyReportSeries } from '../../services/executiveDashboardService.js';
import './business-report.css';

const SEGMENT_COLORS = ['#2f7af4', '#18b979', '#f5ad34', '#9963e8', '#f06278', '#5bb7dd'];
const routeTitles = { report: 'Báo cáo chi tiết', products: 'Sản phẩm', product: 'Chi tiết sản phẩm', profit: 'Lợi nhuận', costs: 'Chi phí', debt: 'Công nợ' };
const iconByMetric = { revenue: BarChart3, profit: TrendingUp, expense: Wallet, receivables: CircleDollarSign };

function EmptyState({ title = 'Chưa có dữ liệu trong khoảng thời gian này', detail = 'Điều chỉnh thời gian để xem thêm.' }) {
  return <div className="business-report-empty"><PieChart size={25} aria-hidden="true" /><strong>{title}</strong><span>{detail}</span></div>;
}

function Section({ title, action, children, className = '' }) {
  return <section className={`business-report-section ${className}`}>
    <div className="business-report-section__heading"><h2>{title}</h2>{action}</div>
    {children}
  </section>;
}

function Change({ value, inverse = false, label = 'so với kỳ trước' }) {
  if (value === null || value === undefined) return null;
  const isGood = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`business-report-change ${isGood ? 'is-good' : 'is-bad'}`}><Icon size={14} aria-hidden="true" />{value > 0 ? '+' : ''}{formatPercent(value)} <small>{label}</small></span>;
}

function KpiCard({ metric, value, change, label, onClick, compact = false }) {
  const Icon = iconByMetric[metric] || PieChart;
  const formattedValue = compact ? formatCompactVnd(value) : formatVnd(value);
  return <button type="button" className={`business-report-kpi business-report-kpi--${metric}`} onClick={onClick} title={`${label}: ${formatVnd(value)}`}>
    <span className="business-report-kpi__top"><span className="business-report-kpi__icon"><Icon size={17} aria-hidden="true" /></span><span className="business-report-kpi__label">{label}</span></span>
    <span className="business-report-kpi__metric-row"><strong className="business-report-kpi__value">{formattedValue}</strong>{change !== null && change !== undefined ? <Change value={change} inverse={metric === 'expense'} /> : <span className="business-report-kpi__comparison" title={metric === 'receivables' ? 'Số dư công nợ tại thời điểm hiện tại' : 'Chưa có dữ liệu kỳ trước'}>{metric === 'receivables' ? 'Hiện tại' : '—'}</span>}</span>
  </button>;
}

function KpiGrid({ report, period, finance, onNavigate }) {
  const previous = report.previous || {};
  const metrics = [
    { metric: 'revenue', label: 'Doanh thu', value: report.revenue, route: 'report' },
    { metric: 'profit', label: 'Lợi nhuận', value: report.profit, route: 'profit' },
    { metric: 'expense', label: 'Tổng chi', value: report.expense, route: 'costs' },
    { metric: 'receivables', label: 'Công nợ phải thu', value: finance?.receivables, route: 'debt' },
  ];
  return <div className="business-report-kpi-grid">{metrics.map((item) => <KpiCard
    key={item.metric} {...item} compact
    change={period === 'today' || period === 'month' ? getChangePercent(item.value, previous[item.metric]) : null}
    onClick={() => onNavigate(item.route)}
  />)}</div>;
}

function Chart({ rows = [], type = 'line', fields = ['revenue', 'profit'], title = '' }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const visible = rows.length <= 8 ? rows : Array.from({ length: 8 }, (_, index) => rows[Math.round(index * (rows.length - 1) / 7)]);
  if (!visible.length || visible.every((row) => fields.every((field) => !Number(row?.[field])))) return <EmptyState />;
  const values = visible.flatMap((row) => fields.map((field) => Number(row?.[field]) || 0));
  const high = Math.max(...values, 1);
  const low = Math.min(...values, 0);
  const span = Math.max(1, high - low);
  const y = (value) => 139 - ((Number(value || 0) - low) / span) * 111;
  const x = (index) => 24 + index * (302 / Math.max(1, visible.length - 1));
  const active = selectedIndex === null ? null : visible[selectedIndex];
  return <div className="business-report-chart" aria-label={title}>
    {active && <div className="business-report-chart__tooltip" role="status"><strong>{formatShortDate(active.date || `${active.month}-01`)}</strong>{fields.map((field) => <span key={field}>{field === 'profit' ? 'Lợi nhuận' : field === 'expense' ? 'Chi phí' : 'Doanh thu'}: {formatVnd(active[field])}</span>)}</div>}
    <svg viewBox="0 0 350 176" role="img" aria-label={title || 'Biểu đồ kinh doanh'} preserveAspectRatio="none">
      {[28, 83, 139].map((line) => <line key={line} x1="20" x2="330" y1={line} y2={line} className="business-report-chart__grid" />)}
      {type === 'bars' ? <>
        {visible.map((row, index) => <rect key={row.date || row.month || index} x={x(index) - 10} y={Math.min(y(row[fields[0]]), y(0))} width="20" height={Math.max(3, Math.abs(y(row[fields[0]]) - y(0)))} rx="4" className={Number(row[fields[0]]) < 0 ? 'business-report-chart__bar is-negative' : 'business-report-chart__bar'} />)}
      </> : fields.map((field, fieldIndex) => <g key={field}>
        <polyline points={visible.map((row, index) => `${x(index)},${y(row[field])}`).join(' ')} className={`business-report-chart__line business-report-chart__line--${fieldIndex}`} />
        {visible.map((row, index) => <circle key={row.date || row.month || index} cx={x(index)} cy={y(row[field])} r="3.5" className={`business-report-chart__point business-report-chart__point--${fieldIndex}`} />)}
      </g>)}
      {visible.map((row, index) => <g key={row.date || row.month || index} onClick={() => setSelectedIndex(index)} tabIndex={0} role="button" aria-label={`${formatShortDate(row.date || `${row.month}-01`)}: ${fields.map((field) => `${field} ${formatVnd(row[field])}`).join(', ')}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedIndex(index); }}>
        <rect x={x(index) - 18} y="20" width="36" height="124" fill="transparent" />
        <text x={x(index)} y="166" textAnchor="middle" className="business-report-chart__axis">{formatShortDate(row.date || `${row.month}-01`)}</text>
      </g>)}
    </svg>
  </div>;
}

function RevenueProfitChart({ report, finance }) {
  const [range, setRange] = useState('auto');
  const rows = range === 'seven' ? finance?.series7Days || [] : range === 'thirty' ? finance?.series30Days || [] : report.chartRows;
  return <Section title="Doanh thu & lợi nhuận" className="business-report-panel" action={<select aria-label="Kỳ biểu đồ" value={range} onChange={(event) => setRange(event.target.value)}><option value="auto">{report.chartLabel}</option><option value="seven">7 ngày</option><option value="thirty">30 ngày</option></select>}>
    <div className="business-report-legend"><span><i className="is-revenue" />Doanh thu</span><span><i className="is-profit" />Lợi nhuận</span></div>
    <Chart rows={rows} title="Doanh thu và lợi nhuận theo thời gian" />
  </Section>;
}

function DonutBreakdown({ title, rows, center, caption }) {
  const positive = rows.filter((row) => Number(row.value) > 0);
  const total = positive.reduce((sum, row) => sum + Number(row.value), 0);
  if (!total) return <Section title={title} className="business-report-panel"><EmptyState /></Section>;
  let angle = 0;
  const segments = positive.map((row, index) => {
    const start = angle;
    angle += Number(row.value) / total * 360;
    return `${SEGMENT_COLORS[index % SEGMENT_COLORS.length]} ${start}deg ${angle}deg`;
  });
  return <Section title={title} className="business-report-panel"><div className="business-report-breakdown">
    <div className="business-report-donut" role="img" aria-label={positive.map((row) => `${row.name} ${formatPercent(row.share ?? row.value / total * 100)}`).join(', ')} style={{ background: `conic-gradient(${segments.join(',')})` }}><span><strong>{formatCompactVnd(center ?? total)}</strong><small>{caption}</small></span></div>
    <div className="business-report-breakdown__legend">{positive.map((row, index) => <div key={row.name}><i style={{ background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }} /><span>{row.name}</span><strong>{formatPercent(row.share ?? row.value / total * 100)}</strong></div>)}</div>
  </div></Section>;
}

function ProductRows({ rows = [], products = [], valueField = 'revenue', onSelect, limit = 5 }) {
  const visible = rows.slice(0, limit);
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row[valueField]) || 0), 0);
  if (!visible.length) return <EmptyState />;
  return <div className="business-report-ranked-list">{visible.map((row, index) => {
    const image = getProductImage(row, products);
    const share = total > 0 ? Math.max(0, Number(row[valueField]) || 0) / total * 100 : 0;
    return <button type="button" className="business-report-ranked-row" key={`${row.id}-${index}`} onClick={() => onSelect?.(row)}>
      <span className="business-report-rank">{index + 1}</span>
      <span className="business-report-product-image"><Package size={20} aria-hidden="true" />{image && <img src={image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</span>
      <span className="business-report-ranked-row__body"><strong>{row.name}</strong><b>{valueField === 'stock' ? `${Number(row.stock || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${row.unit || 'đơn vị'}` : valueField === 'quantity' ? `${Number(row.quantity || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} sản phẩm` : formatVnd(row[valueField])}</b><small>{valueField === 'stock' ? 'Theo hồ sơ sản phẩm' : row.quantity > 0 && valueField !== 'quantity' ? `${Number(row.quantity).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} sản phẩm` : 'Theo đơn hàng'}</small></span>
      <span className="business-report-ranked-row__share"><span className="business-report-progress"><i style={{ width: `${share}%` }} /></span><small>{formatPercent(share)}</small></span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>;
  })}</div>;
}

function CustomerRows({ rows = [], onSelect, valueField = 'revenue', limit = 4 }) {
  if (!rows.length) return <EmptyState />;
  return <div className="business-report-ranked-list">{rows.slice(0, limit).map((row, index) => <button type="button" className="business-report-customer-row" key={`${row.id}-${index}`} onClick={() => onSelect?.(row)}>
    <span className="business-report-rank">{index + 1}</span>
    <span className="business-report-customer-avatar">{String(row.name || '?').trim().slice(0, 1)}</span>
    <span className="business-report-customer-row__text"><strong>{row.name}</strong><small>{valueField === 'debt' ? 'Công nợ phải thu' : `${row.orders || 0} đơn • Lũy kế`}</small></span>
    <span className="business-report-customer-row__value">{formatCompactVnd(row[valueField])}</span><ChevronRight size={15} aria-hidden="true" />
  </button>)}</div>;
}

function SalesEmployeeRows({ rows = [] }) {
  if (!rows.length) return <EmptyState title="Chưa có doanh số nhân viên" detail="Kỳ này chưa có đơn hàng gắn với nhân viên kinh doanh." />;
  return <div className="business-report-ranked-list">{rows.map((row, index) => <div className="business-report-sales-row" key={row.id}>
    <span className="business-report-rank">{index + 1}</span>
    <span className="business-report-customer-avatar">{String(row.name || '?').trim().slice(0, 1)}</span>
    <span className="business-report-customer-row__text"><strong>{row.name}</strong><small>{row.orders} đơn hàng</small></span>
    <strong className="business-report-sales-row__value">{formatCompactVnd(row.revenue)}</strong>
  </div>)}</div>;
}

function AlertsSection({ alerts = [], onNavigate }) {
  return <Section title="Cảnh báo cần chú ý" className="business-report-panel">{alerts.length ? <div className="business-report-alerts">{alerts.slice(0, 4).map((alert) => <button type="button" key={alert.id} className="business-report-alert" onClick={() => alert.targetTab && onNavigate(alert.targetTab)}><AlertCircle size={17} aria-hidden="true" /><span><strong>{alert.title}</strong><small>{alert.message}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</div> : <EmptyState title="Chưa có cảnh báo cần xử lý" detail="Các chỉ số chính đang trong trạng thái ổn định." />}</Section>;
}

function InsightSection({ recommendations = [], onNavigate, onOpenAll }) {
  return <Section title="Nhận định & gợi ý" className="business-report-panel" action={recommendations.length > 3 ? <button type="button" className="business-report-text-action" onClick={onOpenAll}>Xem thêm <ArrowRight size={15} /></button> : null}>
    {recommendations.length ? <div className="business-report-insights">{recommendations.slice(0, 3).map((item) => <button type="button" key={item.id} className="business-report-insight" onClick={() => item.targetTab && onNavigate(item.targetTab)}><Sparkles size={17} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.impact}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</div> : <EmptyState title="Chưa có gợi ý mới" detail="Gợi ý sẽ xuất hiện khi có thay đổi đáng chú ý." />}
  </Section>;
}

function ReportDateFilter({ finance, period, setPeriod, customRange, setCustomRange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => ({ start: customRange?.start || finance.todayKey, end: customRange?.end || finance.todayKey }));
  const firstDate = finance.series30Days?.[0]?.date || finance.todayKey;
  const label = period === 'custom' ? `${formatShortDate(customRange?.start)}–${formatShortDate(customRange?.end)}` : REPORT_PERIODS.find((item) => item.id === period)?.label || 'Hôm nay';
  return <div className="business-report-date-area"><button type="button" className="business-report-date-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><CalendarDays size={18} aria-hidden="true" /><span>{label}</span><ChevronDown size={16} aria-hidden="true" /></button><button type="button" className="business-report-filter-button" onClick={() => setOpen((value) => !value)} aria-label="Lọc thời gian" title="Lọc thời gian"><Filter size={18} /></button>
    {open && <div className="business-report-date-popover" role="dialog" aria-label="Chọn thời gian báo cáo"><div className="business-report-date-presets">{REPORT_PERIODS.map((item) => <button key={item.id} type="button" data-active={period === item.id} onClick={() => { setPeriod(item.id); setOpen(false); }}>{item.label}</button>)}</div><div className="business-report-date-inputs"><label>Từ ngày<input type="date" min={firstDate} max={finance.todayKey} value={draft.start || ''} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} /></label><label>Đến ngày<input type="date" min={firstDate} max={finance.todayKey} value={draft.end || ''} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} /></label></div><button type="button" className="business-report-date-apply" disabled={!draft.start || !draft.end || draft.start > draft.end} onClick={() => { setCustomRange(draft); setPeriod('custom'); setOpen(false); }}>Áp dụng</button><p>Khoảng tùy chọn dùng dữ liệu 30 ngày gần nhất.</p></div>}
  </div>;
}

function ReportHeader({ route, employee, companyName, notificationUnreadCount, onBack, onMenu, onNotifications, onProfile }) {
  if (route !== 'home') return <header className="business-report-subheader"><button type="button" onClick={onBack} aria-label="Quay lại"><ArrowLeft size={22} /></button><h1>{routeTitles[route]}</h1><span aria-hidden="true" /></header>;
  return <header className="business-report-header"><button type="button" className="business-report-header__menu" onClick={onMenu} aria-label="Mở menu"><Menu size={21} /></button><img src="/brand/hd-manager-icon-512.png" alt="" /><strong title={companyName}>{companyName}</strong><button type="button" className="business-report-header__bell" onClick={onNotifications} aria-label="Mở thông báo"><Bell size={20} />{notificationUnreadCount > 0 && <i>{notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}</i>}</button><button type="button" className="business-report-header__avatar" onClick={onProfile} aria-label="Hồ sơ của tôi">{String(employee?.name || 'HD').trim().split(/\s+/).slice(-1)[0].slice(0, 2).toUpperCase()}</button></header>;
}

export default function BusinessReportWorkspace({ snapshot, employee, companyName = 'Doanh nghiệp', products = [], orders = [], notificationUnreadCount = 0, setActiveTab, onOpenAssistant = () => {} }) {
  const [route, setRoute] = useState('home');
  const [period, setPeriod] = useState('today');
  const [customRange, setCustomRange] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productTab, setProductTab] = useState('revenue');
  const [reportTab, setReportTab] = useState('overview');
  const [showAllInsights, setShowAllInsights] = useState(false);
  const finance = snapshot?.finance || {};
  const business = snapshot?.business || {};
  const report = useMemo(() => getReportPeriod(finance, period, customRange), [finance, period, customRange]);
  const reportSalesEmployees = useMemo(() => getTopSalesEmployees(business, finance, period, customRange), [business, finance, period, customRange]);
  const productRevenue = business.topProductsByRevenue || [];
  const productProfit = business.topProductsByProfit || [];
  const stockRows = useMemo(() => products
    .filter((item) => item && !item.archived && !item.isArchived && item.stock !== undefined && item.stock !== null && item.stock !== '')
    .map((item) => ({ id: item.id, name: item.name || item.shortName || 'Sản phẩm', stock: Number(String(item.stock).replace(',', '.')), unit: item.unit || item.stockUnit || '' }))
    .filter((item) => Number.isFinite(item.stock))
    .sort((left, right) => right.stock - left.stock), [products]);
  const customerRevenue = business.topCustomersByRevenue || [];
  const customerDebt = business.topCustomersByDebt || [];
  const revenueGroups = useMemo(() => getRevenueGroups(productRevenue, 4), [productRevenue]);
  const costGroups = (finance.costBreakdown || []).filter((row) => Number(row.value) > 0).sort((a, b) => b.value - a.value);
  const navigate = (next) => { setRoute(next); setShowAllInsights(false); };
  const selectProduct = (row) => { setSelectedProduct(row); navigate('product'); };
  const goBack = () => navigate(route === 'product' ? 'products' : 'home');
  const debtNavigate = () => setActiveTab?.('debt');
  const chooseRoute = (next) => next === 'debt' ? navigate('debt') : navigate(next);
  const profitRows = productProfit.length ? productProfit : productRevenue;
  const selectedProfit = productProfit.find((row) => row.id === selectedProduct?.id || row.name === selectedProduct?.name);
  const selectedRevenue = productRevenue.find((row) => row.id === selectedProduct?.id || row.name === selectedProduct?.name);
  const productDailyRows = useMemo(() => selectedProduct ? buildProductDailyReportSeries({
    orders, products, profitability: snapshot?.profitability,
    product: selectedProduct,
    dateKeys: (finance.series30Days || []).map((row) => row.date),
  }) : [], [orders, products, snapshot?.profitability, selectedProduct, finance.series30Days]);

  if (!snapshot) return <div className="business-report-workspace"><div className="business-report-skeleton" aria-label="Đang tải báo cáo"><i /><i /><i /><i /></div></div>;
  if (!snapshot.finance) return <div className="business-report-workspace"><div className="business-report-error"><AlertCircle size={22} /><strong>Không thể tải báo cáo</strong><button type="button" onClick={() => window.location.reload()}>Thử lại</button></div></div>;

  return <div className="business-report-workspace">
    <ReportHeader route={route} employee={employee} companyName={companyName} notificationUnreadCount={notificationUnreadCount} onBack={goBack} onMenu={() => setActiveTab?.('more')} onNotifications={() => setActiveTab?.('messages')} onProfile={() => setActiveTab?.('profile')} />
    <div className="business-report-content">
      <ReportDateFilter finance={finance} period={period} setPeriod={setPeriod} customRange={customRange} setCustomRange={setCustomRange} />
      {route === 'home' && <>
        <KpiGrid report={report} period={period} finance={finance} onNavigate={chooseRoute} />
        <InsightSection recommendations={snapshot.recommendations} onNavigate={setActiveTab} onOpenAll={() => setShowAllInsights(true)} />
      </>}
      {route === 'report' && <>
        <div className="business-report-view-tabs" role="tablist" aria-label="Loại báo cáo">{[['overview', 'Tổng quan'], ['revenue', 'Doanh thu'], ['profit', 'Lợi nhuận'], ['costs', 'Chi phí']].map(([id, label]) => <button key={id} type="button" role="tab" data-active={reportTab === id} aria-selected={reportTab === id} onClick={() => setReportTab(id)}>{label}</button>)}</div>
        {reportTab === 'overview' && <><KpiGrid report={report} period={period} finance={finance} onNavigate={chooseRoute} /><RevenueProfitChart report={report} finance={finance} /><DonutBreakdown title="Cơ cấu doanh thu tháng" rows={revenueGroups} caption="Theo sản phẩm" /><Section title="Top nhân viên kinh doanh" className="business-report-panel" action={<span className="business-report-scope">{report.label}</span>}><SalesEmployeeRows rows={reportSalesEmployees} /></Section><Section title="Khách hàng nổi bật" className="business-report-panel" action={<span className="business-report-scope">Lũy kế</span>}><CustomerRows rows={customerRevenue} onSelect={() => setActiveTab?.('customers')} /></Section><Section title="Top sản phẩm" className="business-report-panel" action={<button type="button" className="business-report-text-action" onClick={() => navigate('products')}>Xem tất cả <ArrowRight size={15} /></button>}><ProductRows rows={productRevenue} products={products} onSelect={selectProduct} limit={3} /></Section><AlertsSection alerts={snapshot.alerts} onNavigate={setActiveTab} /></>}
        {reportTab === 'revenue' && <><div className="business-report-mini-grid"><div><span>Doanh thu {report.label.toLowerCase()}</span><strong>{formatVnd(report.revenue)}</strong></div><div><span>So với kỳ trước</span><strong>{getChangePercent(report.revenue, report.previous?.revenue) === null ? 'Chưa đủ dữ liệu' : formatPercent(getChangePercent(report.revenue, report.previous?.revenue))}</strong></div></div><RevenueProfitChart report={report} finance={finance} /><DonutBreakdown title="Cơ cấu doanh thu tháng" rows={revenueGroups} caption="Theo sản phẩm" /><Section title="Sản phẩm bán chạy tháng" className="business-report-panel"><ProductRows rows={productRevenue} products={products} onSelect={selectProduct} /></Section></>}
        {reportTab === 'profit' && <ProfitReport report={report} business={business} finance={finance} products={products} onProduct={selectProduct} />}
        {reportTab === 'costs' && <CostReport report={report} finance={finance} costGroups={costGroups} onOpenFinance={() => setActiveTab?.('finance')} />}
      </>}
      {route === 'products' && <>
        <div className="business-report-view-tabs" role="tablist" aria-label="Xếp hạng sản phẩm">{[['revenue', 'Doanh thu'], ['profit', 'Lợi nhuận'], ['quantity', 'Sản lượng'], ['stock', 'Tồn kho']].map(([id, label]) => <button key={id} type="button" role="tab" data-active={productTab === id} aria-selected={productTab === id} onClick={() => setProductTab(id)}>{label}</button>)}</div>
        <Section title={productTab === 'stock' ? 'Tồn theo hồ sơ sản phẩm' : 'Xếp hạng tháng này'} className="business-report-panel">{productTab === 'stock' ? <>{stockRows.length ? <ProductRows rows={stockRows} valueField="stock" products={products} onSelect={selectProduct} limit={30} /> : <EmptyState title="Hồ sơ chưa lưu tồn kho" detail="Mở kho để xem số lượng thực tế." />}<button type="button" className="business-report-link-row" onClick={() => setActiveTab?.('products')}>Mở kho sản phẩm <ArrowRight size={17} /></button></> : <ProductRows rows={productTab === 'profit' ? productProfit : productTab === 'quantity' ? [...productRevenue].sort((a, b) => Number(b.quantity) - Number(a.quantity)) : productRevenue} valueField={productTab === 'profit' ? 'profit' : productTab === 'quantity' ? 'quantity' : 'revenue'} products={products} onSelect={selectProduct} limit={30} />}</Section>
        <Section title="Xu hướng kinh doanh" className="business-report-panel"><Chart rows={report.chartRows} fields={['revenue']} type="bars" title="Doanh thu theo thời gian" /></Section>
      </>}
      {route === 'product' && <>
        <section className="business-report-product-detail"><span className="business-report-product-detail__image"><Package size={34} aria-hidden="true" />{getProductImage(selectedProduct, products) && <img src={getProductImage(selectedProduct, products)} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</span><h2>{selectedProduct?.name || 'Sản phẩm'}</h2><p>Số liệu tháng này</p></section>
        <div className="business-report-mini-grid"><div><span>Doanh thu</span><strong>{formatVnd(selectedRevenue?.revenue || selectedProduct?.revenue)}</strong></div><div><span>Lợi nhuận</span><strong>{formatVnd(selectedProfit?.profit)}</strong></div><div><span>Sản lượng</span><strong>{Number(selectedRevenue?.quantity || selectedProduct?.quantity || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong></div><div><span>Biên lợi nhuận</span><strong>{formatPercent(Number(selectedRevenue?.revenue) > 0 ? Number(selectedProfit?.profit || 0) / Number(selectedRevenue.revenue) * 100 : 0)}</strong></div></div>
        <Section title="Doanh thu & lợi nhuận" className="business-report-panel"><p className="business-report-scope">Sản phẩm này • 30 ngày gần nhất</p><div className="business-report-legend"><span><i className="is-revenue" />Doanh thu</span><span><i className="is-profit" />Lợi nhuận</span></div><Chart rows={productDailyRows} title={`Doanh thu và lợi nhuận sản phẩm ${selectedProduct?.name || ''}`} /></Section>
      </>}
      {route === 'profit' && <ProfitReport report={report} business={business} finance={finance} products={products} onProduct={selectProduct} />}
      {route === 'costs' && <CostReport report={report} finance={finance} costGroups={costGroups} onOpenFinance={() => setActiveTab?.('finance')} />}
      {route === 'debt' && <><div className="business-report-mini-grid"><div><span>Công nợ phải thu</span><strong>{formatVnd(report.receivables)}</strong></div><div><span>Quá hạn</span><strong>{formatVnd(report.overdueReceivables)}</strong></div></div><Section title="Khách nợ cao" className="business-report-panel" action={<span className="business-report-scope">Lũy kế</span>}><CustomerRows rows={customerDebt} valueField="debt" limit={10} onSelect={debtNavigate} /></Section><button type="button" className="business-report-primary-action" onClick={debtNavigate}>Mở sổ nợ <ArrowRight size={17} /></button></>}
    </div>
    {showAllInsights && <div className="business-report-dialog-backdrop" onClick={() => setShowAllInsights(false)}><div className="business-report-dialog" role="dialog" aria-modal="true" aria-label="Nhận định và gợi ý" onClick={(event) => event.stopPropagation()}><div><h2>Nhận định & gợi ý</h2><button type="button" onClick={() => setShowAllInsights(false)} aria-label="Đóng">×</button></div>{(snapshot.recommendations || []).map((item) => <button type="button" key={item.id} onClick={() => { setShowAllInsights(false); item.targetTab && setActiveTab?.(item.targetTab); }}><Sparkles size={17} /><span><strong>{item.title}</strong><small>{item.impact}</small></span><ChevronRight size={16} /></button>)}</div></div>}
    {route !== 'home' && <button type="button" className="business-report-assistant-fab" onClick={onOpenAssistant} aria-label="Mở Trợ lý AI"><Sparkles size={17} aria-hidden="true" /><span>Trợ lý AI</span></button>}
  </div>;
}

function ProfitReport({ report, business, finance, products, onProduct }) {
  const margin = report.revenue > 0 ? report.profit / report.revenue * 100 : 0;
  const activeDays = Math.max(1, report.rows?.length || 1);
  return <><div className="business-report-mini-grid"><div><span>Lợi nhuận</span><strong>{formatVnd(report.profit)}</strong></div><div><span>Biên lợi nhuận</span><strong>{formatPercent(margin)}</strong></div><div><span>Bình quân/ngày</span><strong>{formatCompactVnd(report.profit / activeDays)}</strong></div><div><span>Doanh thu</span><strong>{formatCompactVnd(report.revenue)}</strong></div></div><RevenueProfitChart report={report} finance={finance} /><Section title="Sản phẩm lợi nhuận cao" className="business-report-panel" action={<span className="business-report-scope">Tháng này</span>}><ProductRows rows={business.topProductsByProfit || []} valueField="profit" products={products} onSelect={onProduct} /></Section><Section title="Khách hàng lợi nhuận cao" className="business-report-panel" action={<span className="business-report-scope">Lũy kế</span>}><CustomerRows rows={business.topCustomersByProfit || []} valueField="profit" /></Section></>;
}

function CostReport({ report, finance, costGroups, onOpenFinance }) {
  const [tab, setTab] = useState('overview');
  const costRatio = report.revenue > 0 ? report.expense / report.revenue * 100 : 0;
  return <>
    <div className="business-report-view-tabs" role="tablist" aria-label="Chi phí">{[['overview', 'Tổng chi'], ['detail', 'Chi tiết'], ['category', 'Theo khoản']].map(([id, label]) => <button key={id} type="button" role="tab" data-active={tab === id} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab !== 'category' && <div className="business-report-cost-hero"><span>Tổng chi {report.label.toLowerCase()}</span><strong>{formatVnd(report.expense)}</strong><Change value={getChangePercent(report.expense, report.previous?.expense)} inverse /></div>}
    {tab === 'overview' && <div className="business-report-mini-grid"><div><span>Chi phí/ngày</span><strong>{formatCompactVnd(report.expense / Math.max(1, report.rows?.length || 1))}</strong></div><div><span>Chi phí / doanh thu</span><strong>{formatPercent(costRatio)}</strong></div></div>}
    {tab === 'detail' && <Section title="Chi phí theo thời gian" className="business-report-panel"><Chart rows={report.chartRows} fields={['expense']} type="bars" title="Chi phí theo thời gian" /></Section>}
    {tab !== 'detail' && <DonutBreakdown title="Cơ cấu chi phí tháng" rows={costGroups} caption="Tổng chi" />}
    {tab !== 'detail' && <Section title="Top chi phí tháng" className="business-report-panel"><CostRows costGroups={costGroups} finance={finance} onOpenFinance={onOpenFinance} /></Section>}
    <button type="button" className="business-report-primary-action" onClick={onOpenFinance}>Mở thu chi <ArrowRight size={17} /></button>
  </>;
}

function CostRows({ costGroups, finance, onOpenFinance }) {
  if (!costGroups.length) return <EmptyState />;
  return <div className="business-report-cost-list">{costGroups.map((row, index) => {
    const share = finance.expenseMonth > 0 ? row.value / finance.expenseMonth * 100 : 0;
    return <button type="button" key={row.name} onClick={onOpenFinance}><span className="business-report-rank">{index + 1}</span><span><strong>{row.name}</strong><small>{formatVnd(row.value)}</small><i><b style={{ width: `${Math.min(100, share)}%` }} /></i></span><em>{formatPercent(share)}</em><ChevronRight size={16} /></button>;
  })}</div>;
}
