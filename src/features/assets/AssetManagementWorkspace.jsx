import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Bike,
  Building2,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  History,
  Monitor,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Wrench,
  X
} from 'lucide-react';
import {
  ASSET_FILTERS,
  EXTRA_ASSET_FILTERS,
  assetMatchesFilter,
  assetMatchesSearch,
  buildDocumentDraft,
  buildMaintenanceDraft,
  createAssetTimelineRows,
  getAssetCode,
  getAssetDetailFields,
  getAssetDocumentRows,
  getAssetImage,
  getAssetImageAlt,
  getAssetMaintenanceRows,
  getAssetName,
  getAssetOperationalMetrics,
  getAssetStatusMeta,
  getAssetTypeKey,
  getAssetTypeLabel,
  getAssetUpdatedLabel,
  isAssetAttentionRequired
} from './assetManagementModel.js';

const PAGE_SIZE = 24;

const formatDate = (value) => {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN');
};

const getAssetIcon = (asset = {}) => {
  const type = getAssetTypeKey(asset);
  if (type === 'truck') return Truck;
  if (type === 'car') return Car;
  if (type === 'motorbike') return Bike;
  if (['machine', 'generator', 'tool'].includes(type)) return Wrench;
  if (['computer', 'phone', 'office'].includes(type)) return Monitor;
  if (type === 'furniture') return Building2;
  return Package;
};

const getDocumentIcon = (document = {}) => {
  const text = `${document.type || ''}`.toLowerCase();
  if (text.includes('bảo hiểm')) return ShieldCheck;
  return FileText;
};

const getMaintenanceStatusMeta = (status) => ({
  completed: { label: 'Đã hoàn thành', className: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
  overdue: { label: 'Quá hạn', className: 'border-rose-100 bg-rose-50 text-rose-700' },
  soon: { label: 'Sắp đến hạn', className: 'border-amber-100 bg-amber-50 text-amber-700' },
  scheduled: { label: 'Đã lên lịch', className: 'border-sky-100 bg-sky-50 text-sky-700' }
}[status] || { label: 'Đã lên lịch', className: 'border-slate-200 bg-slate-100 text-slate-600' });

const statusIconClass = {
  danger: 'bg-rose-500',
  cost: 'bg-sky-500',
  good: 'bg-emerald-500',
  neutral: 'bg-slate-400'
};

const AssetImage = ({ asset, className = '' }) => {
  const imageUrl = getAssetImage(asset);
  const AssetIcon = getAssetIcon(asset);
  if (imageUrl) {
    return <img src={imageUrl} alt={getAssetImageAlt(asset)} loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-slate-50 text-blue-600 ${className}`} aria-label={`Biểu tượng ${getAssetTypeLabel(asset)}`}>
      <AssetIcon size={28} strokeWidth={1.8} aria-hidden="true" />
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const meta = getAssetStatusMeta(status);
  return (
    <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

const DetailTabs = ({ activeTab, onChange }) => {
  const tabs = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'costs', label: 'Chi phí' },
    { id: 'maintenance', label: 'Bảo trì' },
    { id: 'documents', label: 'Giấy tờ' },
    { id: 'history', label: 'Lịch sử' }
  ];
  return (
    <div className="-mx-4 overflow-x-auto border-b border-slate-100 px-4 sm:-mx-5 sm:px-5" role="tablist" aria-label="Chi tiết tài sản">
      <div className="flex min-w-max gap-5">
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={`min-h-11 border-b-2 px-0.5 pt-1 text-sm font-bold transition-colors ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const AssetKpiCard = ({ label, value, icon: Icon, tone, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-h-[5.75rem] rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.99] ${tone}`}
  >
    <Icon size={20} aria-hidden="true" />
    <p className="mt-1.5 text-[11px] font-semibold text-slate-600">{label}</p>
    <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900">{value}</p>
  </button>
);

function AssetCard({ asset, assigneeName, metrics, onOpen }) {
  const status = getAssetStatusMeta(asset.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:border-blue-100 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      data-asset-card="true"
    >
      <AssetImage asset={asset} className="h-[78px] w-[78px] rounded-xl border border-slate-100" />
      <div className="min-w-0 self-stretch py-0.5">
        <p className="text-xs font-semibold text-slate-500">{getAssetTypeLabel(asset)}</p>
        <h3 className="mt-0.5 truncate text-[16px] font-bold text-slate-900">{getAssetName(asset)}</h3>
        <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">{getAssetCode(asset)}</p>
        <p className="mt-2 truncate text-[12px] text-slate-500">{assigneeName || 'Chưa gán người phụ trách'}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{getAssetUpdatedLabel(asset)}</p>
      </div>
      <div className="flex h-full flex-col items-end justify-between gap-2 py-0.5">
        <span className={`inline-flex min-h-6 items-center rounded-full border px-2 py-1 text-[10px] font-bold ${status.className}`}>
          {status.label}
        </span>
        {isAssetAttentionRequired(asset, metrics) && <span className="text-[10px] font-bold text-rose-600">Cần chú ý</span>}
        <ChevronRight size={20} className="text-slate-300 transition group-hover:text-blue-600" aria-hidden="true" />
      </div>
    </button>
  );
}

function AssetListScreen({
  assets,
  metricsByAsset,
  getAssigneeName,
  canViewAssets,
  canCreateAsset,
  onCreateAsset,
  onOpenAsset
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(deferredQuery), 180);
    return () => window.clearTimeout(timer);
  }, [deferredQuery]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeFilter, debouncedQuery]);

  const summary = useMemo(() => {
    const activeAssets = assets.filter(asset => getAssetStatusMeta(asset.status).key === 'active').length;
    const attentionAssets = assets.filter(asset => isAssetAttentionRequired(asset, metricsByAsset[asset.id] || {})).length;
    return { total: assets.length, active: activeAssets, attention: attentionAssets };
  }, [assets, metricsByAsset]);

  const filteredAssets = useMemo(() => assets
    .filter(asset => assetMatchesFilter(asset, activeFilter, metricsByAsset[asset.id] || {}))
    .filter(asset => assetMatchesSearch(asset, debouncedQuery, getAssigneeName(asset)))
    .sort((left, right) => {
      const attentionDiff = Number(isAssetAttentionRequired(right, metricsByAsset[right.id] || {})) - Number(isAssetAttentionRequired(left, metricsByAsset[left.id] || {}));
      if (attentionDiff) return attentionDiff;
      return getAssetName(left).localeCompare(getAssetName(right), 'vi');
    }), [activeFilter, assets, debouncedQuery, getAssigneeName, metricsByAsset]);

  const visibleAssets = filteredAssets.slice(0, visibleCount);
  const visibleFilters = showMoreFilters ? [...ASSET_FILTERS, ...EXTRA_ASSET_FILTERS] : ASSET_FILTERS;

  return (
    <section className="space-y-4" data-asset-list-screen="true">
      <div className="flex items-center gap-2">
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 text-slate-500 focus-within:ring-2 focus-within:ring-blue-200">
          <Search size={19} aria-hidden="true" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="Tìm kiếm tài sản, biển số, mã, người phụ trách..."
            aria-label="Tìm kiếm tài sản"
            data-hd-search-input="true"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Xóa tìm kiếm">
              <X size={17} />
            </button>
          )}
        </label>
        <button type="button" onClick={() => setShowMoreFilters(value => !value)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600" aria-label="Mở thêm bộ lọc tài sản">
          <Settings2 size={20} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2" aria-label="Tổng quan tài sản">
        <AssetKpiCard label="Tổng tài sản" value={summary.total} icon={Package} tone="border-blue-100 bg-blue-50" onClick={() => setActiveFilter('all')} />
        <AssetKpiCard label="Cần chú ý" value={summary.attention} icon={ShieldCheck} tone="border-amber-100 bg-amber-50" onClick={() => setActiveFilter('attention')} />
        <AssetKpiCard label="Đang hoạt động" value={summary.active} icon={CheckCircle2} tone="border-emerald-100 bg-emerald-50" onClick={() => setActiveFilter('all')} />
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5" aria-label="Lọc loại tài sản">
        <div className="flex min-w-max gap-2 pb-1">
          {visibleFilters.map(filter => {
            const active = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-[13px] font-semibold transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'}`}
              >
                {filter.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setShowMoreFilters(value => !value)} className="inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600" aria-expanded={showMoreFilters}>
            {showMoreFilters ? 'Thu gọn' : 'Thêm'} <ChevronDown size={15} className={showMoreFilters ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-900">Danh sách tài sản</p>
        {canCreateAsset && (
          <button type="button" onClick={onCreateAsset} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700">
            <Plus size={17} /> Thêm tài sản
          </button>
        )}
      </div>

      {!canViewAssets ? (
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-8 text-center text-sm font-medium text-slate-500">Tài khoản chưa có quyền xem tài sản.</div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
          <Package size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">Chưa tìm thấy tài sản phù hợp</p>
          <p className="mt-1 text-xs text-slate-500">Thử tìm theo tên, mã, biển số hoặc người phụ trách.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              assigneeName={getAssigneeName(asset)}
              metrics={metricsByAsset[asset.id] || {}}
              onOpen={() => onOpenAsset(asset)}
            />
          ))}
        </div>
      )}

      {visibleAssets.length < filteredAssets.length && (
        <button type="button" onClick={() => setVisibleCount(count => count + PAGE_SIZE)} className="min-h-11 w-full rounded-xl border border-blue-100 bg-white text-sm font-bold text-blue-700 hover:bg-blue-50">
          Xem thêm {Math.min(PAGE_SIZE, filteredAssets.length - visibleAssets.length)} tài sản
        </button>
      )}
    </section>
  );
}

function OverviewTab({ asset, metrics, assigneeName, canEditAsset, onEditAsset }) {
  const fields = getAssetDetailFields(asset, assigneeName);
  const operationalMetrics = getAssetOperationalMetrics(asset, metrics);
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[17px] font-bold text-slate-900">Thông tin chung</h3>
          {canEditAsset && <button type="button" onClick={onEditAsset} className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600" aria-label="Chỉnh sửa tài sản"><Pencil size={18} /></button>}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {fields.length === 0 ? <p className="col-span-2 text-sm text-slate-500">Chưa có thông tin chi tiết. Hãy cập nhật tài sản để bổ sung.</p> : fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] font-semibold text-slate-400">{label}</dt>
              <dd className="mt-0.5 truncate text-[14px] font-semibold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900"><Gauge size={19} className="text-emerald-600" /><h3 className="text-[17px] font-bold">Chỉ số vận hành</h3></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {operationalMetrics.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-[11px] font-semibold text-slate-500">{label}</p>
              <p className="mt-1 truncate text-[15px] font-bold tabular-nums text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CostsTab({ asset, assetCostLogs, formatCurrency, getCostTypeLabel, canViewAssetCostLogs, canCreateAssetCostLog, onAddCost, onEditCost }) {
  const logs = useMemo(() => assetCostLogs
    .filter(log => `${log.assetId || ''}` === `${asset.id || ''}` && !log.isArchived)
    .sort((left, right) => new Date(right.createdAt || right.date || 0) - new Date(left.createdAt || left.date || 0)), [asset.id, assetCostLogs]);
  const total = logs.reduce((sum, log) => sum + Number(`${log.amount || 0}`.replace(/[^\d.-]/g, '')), 0);
  const groups = useMemo(() => logs.reduce((result, log) => {
    const name = getCostTypeLabel(log.type === 'fuel' ? 'fuel' : log.costType || log.type);
    result.set(name, (result.get(name) || 0) + Number(`${log.amount || 0}`.replace(/[^\d.-]/g, '')));
    return result;
  }, new Map()), [getCostTypeLabel, logs]);
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">Tổng chi phí</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{formatCurrency(total)} đ</p>
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="text-[17px] font-bold text-slate-900">Chi phí theo nhóm</h3>
        {groups.size === 0 ? <p className="mt-3 text-sm text-slate-500">Chưa có chi phí đã ghi nhận.</p> : <div className="mt-3 space-y-2">
          {[...groups.entries()].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="text-sm font-semibold text-slate-600">{label}</span><span className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(value)} đ</span></div>)}
        </div>}
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h3 className="text-[17px] font-bold text-slate-900">Lịch sử chi phí</h3>{canCreateAssetCostLog && <button type="button" onClick={onAddCost} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-200 px-2.5 text-sm font-bold text-blue-700"><Plus size={16} /> Thêm</button>}</div>
        {!canViewAssetCostLogs ? <p className="mt-3 text-sm text-slate-500">Tài khoản chưa có quyền xem chi phí tài sản.</p> : logs.length === 0 ? <p className="mt-3 text-sm text-slate-500">Chưa có nhật ký chi phí.</p> : <div className="mt-3 space-y-2">
          {logs.map(log => <button key={log.id} type="button" onClick={() => onEditCost(log)} className="w-full rounded-xl border border-slate-100 p-3 text-left transition hover:border-blue-100"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{getCostTypeLabel(log.type === 'fuel' ? 'fuel' : log.costType || log.type)}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(log.date || log.createdAt)}{log.note ? ` • ${log.note}` : ''}</p></div><p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(Number(`${log.amount || 0}`.replace(/[^\d.-]/g, '')))} đ</p></div></button>)}
        </div>}
      </section>
    </div>
  );
}

function MaintenanceTab({ asset, assetCostLogs, metrics, canEditAsset, canCreateAssetCostLog, onAddCost, onSaveSchedule }) {
  const schedules = getAssetMaintenanceRows(asset);
  const logs = assetCostLogs.filter(log => `${log.assetId || ''}` === `${asset.id || ''}` && ['maintenance', 'repair', 'oil', 'tire'].includes(log.costType || log.type));
  const overdue = schedules.find(row => row.status === 'overdue');
  const inspectionWarning = metrics.inspectionWarning;
  const warning = overdue
    ? { title: overdue.title, detail: overdue.dueDate ? `Đã quá hạn từ ${formatDate(overdue.dueDate)}` : 'Cần xử lý bảo trì ngay.' }
    : inspectionWarning && inspectionWarning.level !== 'green'
      ? { title: inspectionWarning.text, detail: 'Cần kiểm tra giấy tờ và kế hoạch vận hành.' }
      : null;
  return (
    <div className="space-y-3">
      {warning && <section className="rounded-2xl border border-rose-100 bg-rose-50 p-4"><div className="flex gap-3"><Wrench size={22} className="shrink-0 text-rose-600" /><div><p className="text-sm font-bold text-rose-800">{warning.title}</p><p className="mt-1 text-xs text-rose-700">{warning.detail}</p></div></div></section>}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h3 className="text-[17px] font-bold text-slate-900">Lịch bảo trì</h3>{canEditAsset && <button type="button" onClick={onSaveSchedule} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-200 px-2.5 text-sm font-bold text-blue-700"><Plus size={16} /> Thêm</button>}</div>
        {schedules.length === 0 ? <p className="mt-3 text-sm text-slate-500">Chưa có lịch bảo trì. Thêm lịch để app tự cảnh báo theo hạn.</p> : <div className="mt-3 space-y-2">
          {schedules.map(row => { const meta = getMaintenanceStatusMeta(row.status); return <div key={row.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-slate-900">{row.title}</p><p className="mt-0.5 text-xs text-slate-500">{row.dueDate ? `Hạn: ${formatDate(row.dueDate)}` : 'Chưa có hạn ngày'}{row.dueKm ? ` • ${row.dueKm} km` : ''}</p>{row.note && <p className="mt-1 text-xs text-slate-500">{row.note}</p>}</div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${meta.className}`}>{meta.label}</span></div></div>; })}
        </div>}
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="text-[17px] font-bold text-slate-900">Lịch sử bảo trì</h3>{canCreateAssetCostLog && <button type="button" onClick={onAddCost} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-200 px-2.5 text-sm font-bold text-blue-700"><Plus size={16} /> Ghi nhận</button>}</div>{logs.length === 0 ? <p className="mt-3 text-sm text-slate-500">Chưa có lần bảo trì nào được ghi nhận trong chi phí tài sản.</p> : <div className="mt-3 space-y-2">{logs.slice(0, 10).map(log => <div key={log.id} className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-sm font-bold text-slate-800">{log.costType || 'Bảo trì'}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(log.date || log.createdAt)}{log.note ? ` • ${log.note}` : ''}</p></div>)}</div>}</section>
    </div>
  );
}

function DocumentsTab({ asset, canEditAsset, onSaveDocument }) {
  const documents = getAssetDocumentRows(asset);
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h3 className="text-[17px] font-bold text-slate-900">Giấy tờ</h3>{canEditAsset && <button type="button" onClick={onSaveDocument} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white"><Plus size={16} /> Thêm giấy tờ</button>}</div>
        {documents.length === 0 ? <p className="mt-3 text-sm text-slate-500">Chưa có giấy tờ nào. Thêm đăng kiểm, bảo hiểm, phù hiệu hoặc chứng nhận liên quan.</p> : <div className="mt-3 space-y-2">{documents.map(document => { const DocumentIcon = getDocumentIcon(document); return <div key={document.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-100 p-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><DocumentIcon size={20} /></div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{document.type}</p><p className={`mt-0.5 text-xs font-medium ${document.expiry.key === 'overdue' ? 'text-rose-600' : document.expiry.key === 'soon' ? 'text-amber-600' : 'text-slate-500'}`}>{document.expiry.detail}</p>{document.reference && <p className="mt-0.5 truncate text-[11px] text-slate-400">{document.reference}</p>}</div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${document.expiry.className}`}>{document.expiry.label}</span></div>; })}</div>}
      </section>
    </div>
  );
}

function HistoryTab({ asset, assetCostLogs, getCostTypeLabel }) {
  const rows = createAssetTimelineRows({ asset, assetCostLogs, getCostTypeLabel });
  return <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><History size={19} className="text-blue-600" /><h3 className="text-[17px] font-bold text-slate-900">Lịch sử</h3></div>{rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">Chưa có lịch sử được ghi nhận cho tài sản này.</p> : <ol className="mt-4 space-y-0">{rows.map((row, index) => <li key={row.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3"><div className="relative flex justify-center">{index < rows.length - 1 && <span className="absolute top-5 h-[calc(100%+10px)] w-px bg-slate-100" />}<span className={`relative mt-1.5 h-2.5 w-2.5 rounded-full ${statusIconClass[row.tone] || statusIconClass.neutral}`} /></div><div className="pb-4"><p className="text-sm font-bold text-slate-900">{row.title}</p><p className="mt-0.5 text-xs text-slate-500">{row.detail}</p><p className="mt-1 text-[11px] font-medium text-slate-400">{formatDate(row.date)}</p></div></li>)}</ol>}</section>;
}

function AssetDetailScreen({ asset, metrics, assetCostLogs, canEditAsset, canViewAssetCostLogs, canCreateAssetCostLog, onBack, onEditAsset, onAddCost, onEditCost, onUpdateAsset, getAssigneeName, getCostTypeLabel, formatCurrency }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [maintenanceDraft, setMaintenanceDraft] = useState(null);
  const [documentDraft, setDocumentDraft] = useState(null);
  const typeIcon = getAssetIcon(asset);
  const AssetIcon = typeIcon;
  const saveMaintenance = () => {
    if (!maintenanceDraft?.title?.trim()) return;
    const current = Array.isArray(asset.maintenanceSchedule) ? asset.maintenanceSchedule : [];
    onUpdateAsset(asset.id, { maintenanceSchedule: [...current, { ...maintenanceDraft, title: maintenanceDraft.title.trim() }] });
    setMaintenanceDraft(null);
  };
  const saveDocument = () => {
    if (!documentDraft?.type?.trim()) return;
    const current = Array.isArray(asset.assetDocuments) ? asset.assetDocuments : [];
    onUpdateAsset(asset.id, { assetDocuments: [...current, { ...documentDraft, type: documentDraft.type.trim() }] });
    setDocumentDraft(null);
  };
  return (
    <section className="space-y-4" data-asset-detail-screen="true">
      <header className="flex min-h-11 items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100" aria-label="Quay lại danh sách tài sản"><ChevronLeft size={23} /></button>
        <h2 className="flex-1 text-center text-[17px] font-bold text-slate-900">Chi tiết tài sản</h2>
        {canEditAsset ? <button type="button" onClick={onEditAsset} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100" aria-label="Chỉnh sửa tài sản"><MoreHorizontal size={22} /></button> : <span className="h-11 w-11" />}
      </header>

      <section className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <AssetImage asset={asset} className="h-[104px] w-[104px] rounded-xl border border-slate-100" />
        <div className="min-w-0 py-1"><StatusBadge status={asset.status} /><h1 className="mt-2 truncate text-xl font-black text-slate-900">{getAssetName(asset)}</h1><p className="mt-0.5 truncate text-sm font-semibold text-slate-500">{getAssetCode(asset)}</p><div className="mt-3 flex flex-wrap gap-1.5"><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600"><AssetIcon size={13} /> {getAssetTypeLabel(asset)}</span>{asset.group && <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{asset.group}</span>}</div></div>
      </section>

      <DetailTabs activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'overview' && <OverviewTab asset={asset} metrics={metrics} assigneeName={getAssigneeName(asset)} canEditAsset={canEditAsset} onEditAsset={onEditAsset} />}
      {activeTab === 'costs' && <CostsTab asset={asset} assetCostLogs={assetCostLogs} formatCurrency={formatCurrency} getCostTypeLabel={getCostTypeLabel} canViewAssetCostLogs={canViewAssetCostLogs} canCreateAssetCostLog={canCreateAssetCostLog} onAddCost={onAddCost} onEditCost={onEditCost} />}
      {activeTab === 'maintenance' && <MaintenanceTab asset={asset} assetCostLogs={assetCostLogs} metrics={metrics} canEditAsset={canEditAsset} canCreateAssetCostLog={canCreateAssetCostLog} onAddCost={onAddCost} onSaveSchedule={() => setMaintenanceDraft(buildMaintenanceDraft())} />}
      {activeTab === 'documents' && <DocumentsTab asset={asset} canEditAsset={canEditAsset} onSaveDocument={() => setDocumentDraft(buildDocumentDraft())} />}
      {activeTab === 'history' && <HistoryTab asset={asset} assetCostLogs={assetCostLogs} getCostTypeLabel={getCostTypeLabel} />}

      {maintenanceDraft && <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/35 p-3 sm:items-center sm:justify-center" onClick={() => setMaintenanceDraft(null)}><form onSubmit={event => { event.preventDefault(); saveMaintenance(); }} onClick={event => event.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"><div className="flex items-center justify-between gap-3"><h3 className="text-[17px] font-bold text-slate-900">Thêm lịch bảo trì</h3><button type="button" onClick={() => setMaintenanceDraft(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label="Đóng"><X size={18} /></button></div><div className="mt-4 space-y-3"><input required autoFocus value={maintenanceDraft.title} onChange={event => setMaintenanceDraft(draft => ({ ...draft, title: event.target.value }))} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400" placeholder="Tên công việc bảo trì" /><div className="grid grid-cols-2 gap-2"><input type="date" value={maintenanceDraft.dueDate} onChange={event => setMaintenanceDraft(draft => ({ ...draft, dueDate: event.target.value }))} className="h-12 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none" /><input value={maintenanceDraft.dueKm} onChange={event => setMaintenanceDraft(draft => ({ ...draft, dueKm: event.target.value }))} className="h-12 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none" placeholder="Mốc km (nếu có)" /></div><textarea value={maintenanceDraft.note} onChange={event => setMaintenanceDraft(draft => ({ ...draft, note: event.target.value }))} className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 outline-none" placeholder="Ghi chú" /></div><button type="submit" className="mt-4 min-h-12 w-full rounded-xl bg-blue-600 text-sm font-bold text-white">Lưu lịch bảo trì</button></form></div>}
      {documentDraft && <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/35 p-3 sm:items-center sm:justify-center" onClick={() => setDocumentDraft(null)}><form onSubmit={event => { event.preventDefault(); saveDocument(); }} onClick={event => event.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"><div className="flex items-center justify-between gap-3"><h3 className="text-[17px] font-bold text-slate-900">Thêm giấy tờ</h3><button type="button" onClick={() => setDocumentDraft(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label="Đóng"><X size={18} /></button></div><div className="mt-4 space-y-3"><input required autoFocus value={documentDraft.type} onChange={event => setDocumentDraft(draft => ({ ...draft, type: event.target.value }))} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400" placeholder="Ví dụ: Bảo hiểm, chứng nhận" /><div className="grid grid-cols-2 gap-2"><input value={documentDraft.reference} onChange={event => setDocumentDraft(draft => ({ ...draft, reference: event.target.value }))} className="h-12 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none" placeholder="Số giấy tờ" /><input type="date" value={documentDraft.expiryDate} disabled={documentDraft.noExpiry} onChange={event => setDocumentDraft(draft => ({ ...draft, expiryDate: event.target.value }))} className="h-12 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none disabled:bg-slate-50" /></div><label className="flex min-h-10 items-center gap-2 text-sm font-medium text-slate-600"><input type="checkbox" checked={documentDraft.noExpiry} onChange={event => setDocumentDraft(draft => ({ ...draft, noExpiry: event.target.checked, expiryDate: event.target.checked ? '' : draft.expiryDate }))} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> Không có ngày hết hạn</label><textarea value={documentDraft.note} onChange={event => setDocumentDraft(draft => ({ ...draft, note: event.target.value }))} className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 outline-none" placeholder="Ghi chú" /></div><button type="submit" className="mt-4 min-h-12 w-full rounded-xl bg-blue-600 text-sm font-bold text-white">Lưu giấy tờ</button></form></div>}
    </section>
  );
}

export default function AssetManagementWorkspace({
  employees = [],
  assets = [],
  assetCostLogs = [],
  metricsByAsset = {},
  canViewAssets = true,
  canCreateAsset = false,
  canEditAsset = false,
  canViewAssetCostLogs = true,
  canCreateAssetCostLog = false,
  onCreateAsset,
  onEditAsset,
  onAddCost,
  onEditCost,
  onUpdateAsset,
  formatCurrency,
  getEmployeeNames,
  getCostTypeLabel
}) {
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const selectedAsset = assets.find(asset => `${asset.id}` === `${selectedAssetId}`) || null;
  const getAssigneeName = (asset) => getEmployeeNames(employees, asset);

  useEffect(() => {
    if (selectedAssetId && !selectedAsset) setSelectedAssetId('');
  }, [selectedAsset, selectedAssetId]);

  useEffect(() => {
    const handlePopState = () => setSelectedAssetId('');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAsset = (asset) => {
    setSelectedAssetId(asset.id);
    window.history.pushState({ hdAssetDetail: asset.id }, '');
  };
  const closeAsset = () => {
    if (window.history.state?.hdAssetDetail) window.history.back();
    else setSelectedAssetId('');
  };

  if (selectedAsset) {
    return <AssetDetailScreen asset={selectedAsset} metrics={metricsByAsset[selectedAsset.id] || {}} assetCostLogs={assetCostLogs} canEditAsset={canEditAsset} canViewAssetCostLogs={canViewAssetCostLogs} canCreateAssetCostLog={canCreateAssetCostLog} onBack={closeAsset} onEditAsset={() => onEditAsset(selectedAsset)} onAddCost={() => onAddCost(selectedAsset)} onEditCost={onEditCost} onUpdateAsset={onUpdateAsset} getAssigneeName={getAssigneeName} getCostTypeLabel={getCostTypeLabel} formatCurrency={formatCurrency} />;
  }
  return <AssetListScreen assets={assets} metricsByAsset={metricsByAsset} getAssigneeName={getAssigneeName} canViewAssets={canViewAssets} canCreateAsset={canCreateAsset} onCreateAsset={onCreateAsset} onOpenAsset={openAsset} />;
}
