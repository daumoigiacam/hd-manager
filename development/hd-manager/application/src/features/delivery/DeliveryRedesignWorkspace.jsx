import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppScreenBack } from '../../hooks/useAppScreenBack.js';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CircleDollarSign,
  FileText,
  Filter,
  ImagePlus,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  Phone,
  Search,
  Moon,
  Sun,
  Truck,
  WalletCards,
  X,
} from 'lucide-react';
import { HDButton, HDEmptyState, HDIconButton } from '../../design-system/index.js';
import { useHDTheme } from '../../design-system/ThemeProvider.jsx';
import './DeliveryRedesignWorkspace.css';
import {
  DELIVERY_STATUS_TABS,
  filterDeliveryWorkspaceGroups,
  formatDeliveryCompactMoney,
  formatDeliveryDay,
  formatDeliveryMoney,
  formatDeliveryTime,
  getDeliveryInitial,
  getDeliveryActivityByHour,
  getDeliveryWorkspaceStats,
  isDeliveryGroupCompleted,
} from './deliveryWorkspaceModel.js';

const PAYMENT_OPTIONS = [
  { id: 'Tiền mặt', label: 'Tiền mặt', icon: Banknote },
  { id: 'Chuyển khoản', label: 'Chuyển khoản', icon: WalletCards },
  { id: 'Công nợ', label: 'Công nợ', icon: CircleDollarSign },
];

const filterOptions = DELIVERY_STATUS_TABS;

function getGroupAmount(group = {}) {
  return Number(group.totalAmount || group.paymentSummaryTotal || group.collectedAmount || 0);
}

function getGroupProducts(group = {}) {
  if (Array.isArray(group.productLines) && group.productLines.length > 0) return group.productLines;
  return (group.rows || []).map((row) => ({
    productLabel: row.productLabel || row.productName || '',
    quantity: row.pricingQuantity ?? row.dispatchQuantity ?? row.actualQuantity,
    unit: row.pricingUnit || row.actualQuantityUnit || row.expectedQuantityUnit || '',
    amount: row.totalAmount ?? row.pricingAmount ?? 0,
    imageUrl: row.product?.imageUrl || row.productImage || row.imageUrl || row.photoUrl || '',
  }));
}

const EMPTY_FILTERS = Object.freeze({
  status: 'all',
  area: 'all',
  period: 'all',
  paymentMethod: 'all',
  fromDate: '',
  toDate: '',
});

function getGroupMapTarget(group = {}) {
  const location = group.location;
  const coordinates = location && typeof location === 'object'
    ? [location.latitude || location.lat, location.longitude || location.lng].filter((value) => value !== undefined && value !== null)
    : [];
  if (coordinates.length === 2) return coordinates.join(',');
  const raw = `${group.locationUrl || group.location || group.address || group.area || ''}`.trim();
  if (!raw || raw === 'Đã định vị') return '';
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    const query = parsed.searchParams.get('q') || parsed.searchParams.get('query') || parsed.searchParams.get('destination');
    if (query) return query;
    const coordinatesMatch = `${parsed.pathname}${parsed.hash}`.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    return coordinatesMatch ? `${coordinatesMatch[1]},${coordinatesMatch[2]}` : '';
  } catch {
    return '';
  }
}

function formatDeliveryDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function Avatar({ name, large = false }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-black text-blue-700 ${large ? 'h-14 w-14 text-xl' : 'h-12 w-12 text-base'}`} aria-hidden="true">
      {getDeliveryInitial(name)}
    </div>
  );
}

function IconButton({ label, children, className = '', style, ...props }) {
  return (
    <HDIconButton
      label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition active:scale-95 ${className}`}
      style={{
        width: 'var(--hd-touch-target)',
        minWidth: 'var(--hd-touch-target)',
        height: 'var(--hd-touch-target)',
        minHeight: 'var(--hd-touch-target)',
        ...(style || {}),
      }}
      {...props}
    >
      {children}
    </HDIconButton>
  );
}

function DeliveryRow({ group, onOpen, darkMode = false, compact = false }) {
  const completed = isDeliveryGroupCompleted(group);
  const groupAmount = getGroupAmount(group);
  const meta = [group.area || group.address, formatDeliveryTime(group.time)].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={() => onOpen(group)}
      className={`grid min-h-[72px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99] ${darkMode ? 'bg-slate-900 hover:bg-slate-800' : 'bg-white hover:bg-blue-50/60'} ${compact ? '' : 'border border-slate-100 shadow-[0_4px_14px_rgba(15,23,42,0.04)]'}`}
    >
      <Avatar name={group.customerName} />
      <span className="min-w-0">
        <span className={`block truncate text-[15px] font-extrabold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{group.customerName || 'Khách hàng'}</span>
        {meta && <span className={`mt-0.5 block truncate text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{meta}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-right">
          {groupAmount > 0 && <span className={`block text-[14px] font-black tabular-nums ${completed ? 'text-emerald-600' : 'text-slate-900'}`}>{formatDeliveryMoney(groupAmount)}</span>}
          <span className={`block text-xs font-bold ${completed ? 'text-emerald-600' : 'text-amber-600'}`}>{completed ? 'Đã giao' : 'Chờ giao'}</span>
        </span>
        <ChevronRight size={17} className={darkMode ? 'text-slate-500' : 'text-slate-300'} />
      </span>
    </button>
  );
}

function ActionTile({ icon: Icon, label, onClick, tone = 'blue', darkMode = false }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-[var(--hd-primary-50)] text-[var(--hd-primary)]',
    orange: 'bg-orange-50 text-orange-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <button type="button" onClick={onClick} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl px-2 text-xs font-bold transition active:scale-95 ${darkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-700'}`}>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}><Icon size={22} /></span>
      {label}
    </button>
  );
}

function DeliveryHeader({ title, onBack, onMore, onHistory, darkMode }) {
  return (
    <div className={`flex items-center justify-between gap-3 pb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
      <IconButton label="Quay lại" onClick={onBack} className={darkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}><ArrowLeft size={22} /></IconButton>
      <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-black">{title}</h2>
      <span className="flex shrink-0 items-center gap-1">
        {onHistory && <IconButton label="Lịch sử giao hàng" onClick={onHistory} className={darkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}><Clock3 size={20} /></IconButton>}
        {onMore && <IconButton label="Thêm thao tác" onClick={onMore} className={darkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}><MoreHorizontal size={22} /></IconButton>}
      </span>
    </div>
  );
}

export default function DeliveryRedesignWorkspace({
  workingDate,
  onChangeDate,
  groups = [],
  stats = {},
  canCreate = true,
  selectedCustomer,
  note,
  onNoteChange,
  photoUrl,
  onPhotoChange,
  onRemovePhoto,
  photoInputRef,
  isReadingPhoto = false,
  collectedAmount,
  onCollectedAmountChange,
  collectedMethod,
  onCollectedMethodChange,
  onSelectGroup,
  onComplete,
  onOpenDirections,
  statusMessage,
  statusTone = 'emerald',
  isSaving = false,
}) {
  const { theme, setPreference } = useHDTheme();
  const [screen, setScreen] = useState('overview');
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [searchValue, setSearchValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [visibleGroupLimit, setVisibleGroupLimit] = useState(30);
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [completedSummary, setCompletedSummary] = useState(null);
  const searchInputRef = useRef(null);
  const previousScreenRef = useRef('overview');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchValue.trim()), 275);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    if (screen !== 'search') return undefined;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  const normalizedGroups = useMemo(() => [...groups].sort((left, right) => (right.latestTimestamp || 0) - (left.latestTimestamp || 0)), [groups]);
  const displayStats = useMemo(() => ({ ...getDeliveryWorkspaceStats(normalizedGroups), ...stats }), [normalizedGroups, stats]);
  const selectedGroup = normalizedGroups.find((group) => group.key === selectedGroupKey) || null;
  const filteredGroups = useMemo(() => filterDeliveryWorkspaceGroups(normalizedGroups, {
    tab: filters.status === 'all' ? activeTab : filters.status,
    keyword: searchTerm,
    area: filters.area,
    paymentMethod: filters.paymentMethod,
    period: filters.period,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    referenceDate: workingDate,
  }), [activeTab, filters, normalizedGroups, searchTerm, workingDate]);
  const searchResults = useMemo(() => filterDeliveryWorkspaceGroups(normalizedGroups, {
    tab: 'all',
    keyword: searchTerm,
  }), [normalizedGroups, searchTerm]);
  const areaOptions = useMemo(() => [...new Set(normalizedGroups.map((group) => group.area || group.address).filter(Boolean))], [normalizedGroups]);
  const paymentOptions = useMemo(() => [...new Set(normalizedGroups.map((group) => group.collectedMethod).filter(Boolean))], [normalizedGroups]);
  const visibleGroups = filteredGroups.slice(0, visibleGroupLimit);
  const historicalGroups = normalizedGroups.filter(isDeliveryGroupCompleted);
  const recentGroups = normalizedGroups.slice(0, 4);
  const isDark = theme === 'dark';
  const shellClass = isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900';

  const openGroup = (group, target = 'detail') => {
    previousScreenRef.current = screen;
    setSelectedGroupKey(group.key);
    onSelectGroup?.(group);
    setScreen(target);
  };
  const openList = () => {
    setSearchValue('');
    setSearchTerm('');
    setActiveTab('pending');
    setFilters(EMPTY_FILTERS);
    setVisibleGroupLimit(30);
    setScreen('list');
  };
  const openSearch = () => {
    setSearchValue('');
    setSearchTerm('');
    setScreen('search');
  };
  const openFilter = () => {
    setDraftFilters({ ...filters, status: filters.status === 'all' ? activeTab : filters.status });
    setFilterOpen(true);
  };
  const resetToOverview = () => {
    setQuickActionsOpen(false);
    setFilterOpen(false);
    setScreen('overview');
  };
  useAppScreenBack(() => {
    if (quickActionsOpen) {
      setQuickActionsOpen(false);
      return true;
    }
    if (filterOpen) {
      setFilterOpen(false);
      return true;
    }
    if (screen === 'overview') return false;
    if (screen === 'search') setScreen('list');
    else if (screen === 'list' || screen === 'history' || screen === 'stats') resetToOverview();
    else if (screen === 'detail') setScreen(previousScreenRef.current || 'list');
    else if (screen === 'confirm' || screen === 'map') setScreen('detail');
    else if (screen === 'success') setScreen('list');
    else return false;
    return true;
  });
  const resetListFilters = () => {
    setActiveTab('all');
    setFilters(EMPTY_FILTERS);
    setDraftFilters(EMPTY_FILTERS);
    setSearchValue('');
    setSearchTerm('');
    setVisibleGroupLimit(30);
  };
  useEffect(() => setVisibleGroupLimit(30), [activeTab, filters, searchTerm]);
  const handleComplete = async () => {
    if (!selectedGroup || !canCreate) return;
    const saved = await onComplete?.();
    if (saved) {
      setCompletedSummary({
        customerName: selectedGroup.customerName,
        amount: Number(collectedAmount || getGroupAmount(selectedGroup)),
        method: collectedMethod,
        time: new Date().toISOString(),
        area: selectedGroup.area || selectedGroup.address || '',
      });
      setScreen('success');
    }
  };
  const triggerPhotoPicker = () => photoInputRef?.current?.click();
  const setPayment = (method) => {
    onCollectedMethodChange?.(method);
    if (method === 'Công nợ') onCollectedAmountChange?.('');
  };
  const customerGroupLabel = [selectedCustomer?.customerGroup, selectedCustomer?.customerType, selectedGroup?.customerGroup]
    .find((value) => typeof value === 'string' && value.trim())?.trim() || '';
  const detailFields = selectedGroup ? [
    { label: 'Khu vực', value: selectedGroup.area || selectedGroup.address, icon: MapPin },
    { label: 'Giờ giao', value: formatDeliveryTime(selectedGroup.time), icon: Clock3 },
    { label: 'Phương thức', value: selectedGroup.collectedMethod, icon: Banknote },
  ].filter((field) => field.value) : [];
  const deliveryProducts = selectedGroup ? getGroupProducts(selectedGroup).filter((product) => product.productLabel && product.productLabel !== 'Hàng hóa') : [];
  const detailNote = typeof selectedGroup?.note === 'string' ? selectedGroup.note.trim() : '';
  const mapTarget = selectedGroup ? getGroupMapTarget(selectedGroup) : '';

  const overview = (
    <div className="hd-delivery-overview-layout">
      <div className="hd-delivery-overview-primary">
        <section className="hd-delivery-overview-hero">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/80">Giao hàng</p>
              <p className="mt-1 text-sm font-medium text-white/90">{formatDeliveryDay(workingDate)}</p>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="Báo cáo nhanh" onClick={() => setScreen('stats')} className="text-white hover:bg-white/15"><BarChart3 size={19} /></IconButton>
              <IconButton label="Thao tác nhanh" onClick={() => setQuickActionsOpen(true)} className="text-white hover:bg-white/15"><MoreHorizontal size={20} /></IconButton>
              <label title="Chọn ngày" className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-white hover:bg-white/15">
                <input type="date" value={workingDate} onChange={(event) => onChangeDate?.(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Chọn ngày giao hàng" />
                <CalendarDays size={19} />
              </label>
            </div>
          </div>
          <div className="hd-delivery-overview-heading">
            <div className="hd-delivery-overview-copy">
              <h1 className="hd-delivery-overview-title">Giao đúng hẹn</h1>
              <p>Vững niềm tin</p>
            </div>
            <div className="hd-delivery-overview-illustration" aria-hidden="true"><Truck size={56} strokeWidth={1.6} /></div>
          </div>
          <div className="hd-delivery-overview-stats">
            {[
              { label: 'Cần giao', value: displayStats.required },
              { label: 'Chờ báo cáo', value: displayStats.waiting },
              { label: 'Đã giao', value: displayStats.completed },
            ].map((item) => (
              <div key={item.label}>
                <p>{item.value}</p>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>
        <button type="button" onClick={openList} className="hd-delivery-primary-cta">
          Bắt đầu giao hàng <ArrowRight size={18} />
        </button>
      </div>

      <section className="hd-delivery-recent-section">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 className="text-xl font-black">Giao gần đây</h2>
          <button type="button" onClick={openList} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--hd-primary)]">Xem tất cả <ChevronRight size={17} /></button>
        </div>
      <div className="space-y-2">
          {recentGroups.length > 0 ? recentGroups.map((group) => <DeliveryRow key={group.key} group={group} onOpen={openGroup} />) : (
            <HDEmptyState
              icon={<Truck size={22} aria-hidden="true" />}
              title="Chưa có chuyến giao"
              description="Chuyến giao sẽ hiện tại đây."
              className={`rounded-2xl border ${isDark ? 'border-slate-800 bg-slate-900' : 'border-dashed border-slate-200 bg-white'}`}
            />
          )}
        </div>
      </section>
    </div>
  );

  const list = (
    <div className="space-y-3">
      <DeliveryHeader title="Giao hàng" onBack={resetToOverview} onHistory={() => setScreen('history')} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <div className="grid grid-cols-3 border-b border-slate-200">
        {DELIVERY_STATUS_TABS.map((tab) => {
          const tabCount = tab.id === 'all' ? normalizedGroups.length : tab.id === 'pending' ? normalizedGroups.filter((group) => !isDeliveryGroupCompleted(group)).length : normalizedGroups.filter(isDeliveryGroupCompleted).length;
          const active = activeTab === tab.id;
          return (
            <button type="button" key={tab.id} onClick={() => { setActiveTab(tab.id); setFilters((previous) => ({ ...previous, status: 'all' })); }} className={`relative min-h-11 px-1 text-center text-sm font-bold ${active ? 'text-[var(--hd-primary)]' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {tab.label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-[var(--hd-primary-50)] text-[var(--hd-primary)]' : 'bg-slate-100 text-slate-500'}`}>{tabCount}</span>
              {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--hd-primary)]" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={openSearch} className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-left text-sm ${isDark ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
          <Search size={19} className="shrink-0" />
          <span className="truncate">{searchValue || 'Tìm khách hàng...'}</span>
        </button>
        <IconButton label="Bộ lọc" onClick={openFilter} className="border border-slate-200 bg-white text-[var(--hd-primary)] hover:bg-blue-50"><Filter size={19} /></IconButton>
      </div>
      {filters.area !== 'all' || filters.paymentMethod !== 'all' || filters.period !== 'all' ? (
        <button type="button" onClick={resetListFilters} className="min-h-9 text-left text-xs font-semibold text-[var(--hd-primary)]">Xóa điều kiện lọc</button>
      ) : null}
      <div className="hd-delivery-group-list space-y-2">
        {visibleGroups.length > 0 ? visibleGroups.map((group) => <DeliveryRow key={group.key} group={group} onOpen={openGroup} darkMode={isDark} />) : (
          <HDEmptyState
            icon={<Search size={24} aria-hidden="true" />}
            title={normalizedGroups.length > 0 ? 'Không có chuyến phù hợp' : 'Chưa có chuyến giao'}
            description={normalizedGroups.length > 0 ? 'Thử đổi điều kiện lọc.' : 'Chưa có chuyến giao.'}
            action={normalizedGroups.length > 0
              ? <HDButton variant="secondary" size="sm" onClick={resetListFilters}>Xóa bộ lọc</HDButton>
              : null}
            className={`rounded-2xl ${isDark ? 'bg-slate-900' : 'bg-white'}`}
          />
        )}
      </div>
      {filteredGroups.length > visibleGroupLimit && <HDButton variant="secondary" onClick={() => setVisibleGroupLimit((limit) => limit + 30)}>Tải thêm</HDButton>}
    </div>
  );

  const search = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại danh sách" onClick={() => setScreen('list')} className={isDark ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}><ArrowLeft size={22} /></IconButton>
        <label className={`flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-full px-4 ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
          <Search size={19} className="shrink-0 text-slate-400" />
          <input ref={searchInputRef} value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Tìm khách hàng..." className={`min-w-0 flex-1 bg-transparent text-sm outline-none focus:outline-none focus:ring-0 ${isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-500'}`} />
          {searchValue && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearchValue('')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-400"><X size={17} /></button>}
        </label>
      </div>
      {searchTerm && <p className="px-1 text-xs font-medium text-slate-500">{searchResults.length} kết quả</p>}
      <div className="hd-delivery-group-list space-y-2">
        {searchResults.length ? searchResults.slice(0, visibleGroupLimit).map((group) => <DeliveryRow key={group.key} group={group} onOpen={openGroup} darkMode={isDark} />) : (
          <HDEmptyState icon={<Search size={22} aria-hidden="true" />} title={searchTerm ? 'Không tìm thấy khách hàng' : 'Tìm chuyến giao'} />
        )}
      </div>
      {searchResults.length > visibleGroupLimit && <HDButton variant="secondary" onClick={() => setVisibleGroupLimit((limit) => limit + 30)}>Tải thêm</HDButton>}
    </div>
  );

  const detail = selectedGroup ? (
    <div className="space-y-4">
      <DeliveryHeader title="Chi tiết khách hàng" onBack={() => setScreen(previousScreenRef.current || 'list')} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <section className={`rounded-2xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_4px_16px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3">
          <Avatar name={selectedGroup.customerName} large />
          <div className="min-w-0 flex-1 text-left">
            <h2 className="truncate text-xl font-black">{selectedGroup.customerName || selectedCustomer?.name || 'Khách hàng'}</h2>
            {customerGroupLabel && <span className="mt-1 inline-flex max-w-full truncate rounded-full bg-[var(--hd-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--hd-primary)]">{customerGroupLabel}</span>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a href={selectedGroup.phone ? `tel:${selectedGroup.phone}` : undefined} aria-disabled={!selectedGroup.phone} className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold ${!selectedGroup.phone ? 'pointer-events-none opacity-45' : ''} ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'}`}><Phone size={20} className="text-emerald-600" />Gọi</a>
          <button type="button" onClick={() => setScreen('map')} className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'}`}><Navigation size={20} className="text-[var(--hd-primary)]" />Chỉ đường</button>
          <a href={selectedGroup.phone ? `sms:${selectedGroup.phone}` : undefined} aria-disabled={!selectedGroup.phone} className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold ${!selectedGroup.phone ? 'pointer-events-none opacity-45' : ''} ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'}`}><MessageCircle size={20} className="text-violet-600" />Nhắn tin</a>
        </div>
        {detailFields.length > 0 && <div className={`mt-3 grid divide-x rounded-2xl py-3 text-center ${isDark ? 'divide-slate-700 bg-slate-800' : 'divide-slate-100 bg-slate-50'}`} style={{ gridTemplateColumns: `repeat(${detailFields.length}, minmax(0, 1fr))` }}>
          {detailFields.map(({ label, value, icon: Icon }) => <span key={label} className="min-w-0 px-1"><Icon size={16} className="mx-auto text-slate-400" /><b className="mt-1 block truncate text-xs">{value}</b><small className="mt-0.5 block text-[10px] text-slate-500">{label}</small></span>)}
        </div>}
      </section>
      {deliveryProducts.length > 0 && <section className={`rounded-2xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_4px_16px_rgba(15,23,42,0.05)]'}`}>
        <h3 className="text-xl font-black">Hàng giao</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {deliveryProducts.map((product, index) => {
            const quantityText = Number(product.quantity) > 0
              ? `${product.quantity}${product.unit ? ` ${product.unit}` : ''}`
              : '';
            const imageUrl = product.imageUrl || product.image || product.photoUrl || '';
            return (
            <div key={`${product.productLabel}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              {imageUrl ? <img src={imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--hd-primary)]"><Truck size={20} /></span>}
              <span className="min-w-0 flex-1"><b className="block truncate text-sm">{product.productLabel}</b>{quantityText && <small className={isDark ? 'text-slate-400' : 'text-slate-500'}>{quantityText}</small>}</span>
              {Number(product.amount) > 0 && <b className="shrink-0 text-sm text-emerald-700">{formatDeliveryMoney(product.amount)}</b>}
            </div>
            );
          })}
        </div>
      </section>}
      {detailNote && <section className={`rounded-2xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_4px_16px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex gap-3"><FileText size={19} className="mt-0.5 shrink-0 text-slate-400" /><span><b className="block text-sm">Ghi chú</b><p className={`mt-1 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{detailNote}</p></span></div>
      </section>}
      <button type="button" disabled={!canCreate || isDeliveryGroupCompleted(selectedGroup)} onClick={() => setScreen('confirm')} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--hd-primary)] px-4 text-[15px] font-bold text-white shadow-sm disabled:opacity-50">{isDeliveryGroupCompleted(selectedGroup) ? 'Đã giao' : 'Xác nhận giao hàng'} <ArrowRight size={18} /></button>
    </div>
  ) : null;

  const confirm = selectedGroup ? (
    <div className="space-y-4">
      <DeliveryHeader title="Xác nhận giao hàng" onBack={() => setScreen('detail')} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><Avatar name={selectedGroup.customerName} /><span className="min-w-0"><b className="block truncate text-[15px]">{selectedGroup.customerName}</b><b className="mt-1 block text-sm text-emerald-700">{formatDeliveryMoney(getGroupAmount(selectedGroup))}</b></span></div>
      </section>
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">1</span><b className="text-[15px]">Đã giao</b></div>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 size={20} /> Hàng đã giao đúng khách</div>
      </section>
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">2</span><b className="text-[15px]">Chụp ảnh chứng từ</b></div>
        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={(event) => onPhotoChange?.(event.target.files?.[0])} className="sr-only" aria-label="Chụp hoặc chọn ảnh chứng từ" />
        <div className="mt-3 flex items-center gap-2">
          {photoUrl ? <div className="relative h-20 w-24 overflow-hidden rounded-xl bg-slate-100"><img src={photoUrl} alt="Chứng từ giao hàng" className="h-full w-full object-cover" /><IconButton label="Xóa ảnh" onClick={onRemovePhoto} className="absolute right-1 top-1 h-7 w-7 bg-white/90 text-red-600"><X size={14} /></IconButton></div> : <button type="button" onClick={triggerPhotoPicker} className="flex h-20 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-500"><ImagePlus size={21} />Thêm ảnh</button>}
          <button type="button" onClick={triggerPhotoPicker} className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-xs font-bold text-[var(--hd-primary)]"><Camera size={20} /><span>{isReadingPhoto ? 'Đang đọc ảnh...' : photoUrl ? 'Đổi ảnh' : 'Camera / Ảnh'}</span></button>
        </div>
      </section>
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-black text-white">3</span><b className="text-[15px]">Nhận thanh toán</b></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PAYMENT_OPTIONS.map(({ id, label, icon: Icon }) => {
            const active = collectedMethod === id;
            return <button type="button" key={id} onClick={() => setPayment(id)} aria-pressed={active} className={`min-h-20 rounded-2xl px-2 text-center text-xs font-bold transition ${active ? 'border border-[var(--hd-primary)] bg-[var(--hd-primary-50)] text-[var(--hd-primary)]' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}`}><Icon size={20} className="mx-auto mb-2" />{label}</button>;
          })}
        </div>
        <input inputMode="numeric" value={collectedAmount} onChange={(event) => onCollectedAmountChange?.(event.target.value)} disabled={collectedMethod === 'Công nợ'} placeholder={collectedMethod === 'Công nợ' ? 'Ghi công nợ' : 'Số tiền nhận'} className={`mt-3 h-12 w-full rounded-xl px-3 text-sm font-bold outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-60 ${isDark ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'}`} />
        <textarea value={note} onChange={(event) => onNoteChange?.(event.target.value)} rows={2} placeholder="Ghi chú" className={`mt-2 w-full resize-none rounded-xl px-3 py-3 text-sm font-medium outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0 ${isDark ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'}`} />
      </section>
      {statusMessage && <p className={`rounded-xl px-3 py-2 text-xs font-bold ${statusTone === 'red' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{statusMessage}</p>}
      <button type="button" disabled={isSaving || !canCreate} onClick={handleComplete} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--hd-primary)] px-4 text-[15px] font-bold text-white shadow-sm disabled:opacity-50">{isSaving ? 'Đang lưu...' : 'Hoàn thành'} <ArrowRight size={18} /></button>
    </div>
  ) : null;

  const success = completedSummary ? (
    <div className="pt-7 text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_18px_36px_rgba(5,150,105,0.25)]"><Check size={54} strokeWidth={2.7} /></div>
      <h2 className="mt-5 text-2xl font-black">Giao hàng thành công!</h2>
      <section className={`mt-5 rounded-3xl p-5 text-left ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><Avatar name={completedSummary.customerName} /><span><b className="block text-[15px]">{completedSummary.customerName}</b><b className="mt-1 block text-[17px] text-emerald-700">{formatDeliveryMoney(completedSummary.amount)}</b></span></div>
        <div className={`mt-4 divide-y rounded-2xl px-3 ${isDark ? 'divide-slate-800 bg-slate-800' : 'divide-slate-100 bg-slate-50'}`}>
          {completedSummary.time && <p className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Thời gian</span><b>{formatDeliveryDateTime(completedSummary.time)}</b></p>}
          {completedSummary.method && <p className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Phương thức</span><b>{completedSummary.method}</b></p>}
          {completedSummary.area && <p className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Khu vực</span><b className="truncate">{completedSummary.area}</b></p>}
        </div>
      </section>
      <button type="button" onClick={openList} className="mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--hd-primary)] px-4 text-[15px] font-bold text-white">Tiếp tục giao hàng <ArrowRight size={18} /></button>
      <button type="button" onClick={() => setScreen('detail')} className="mt-2 min-h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Xem chi tiết</button>
    </div>
  ) : null;

  const map = selectedGroup ? (
    <div className="hd-delivery-directions space-y-4">
      <DeliveryHeader title="Chỉ đường" onBack={() => setScreen('detail')} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <div className="hd-delivery-map-frame">
        {mapTarget ? <iframe title={`Bản đồ ${selectedGroup.customerName || 'khách hàng'}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(mapTarget)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-full w-full border-0" /> : <HDEmptyState icon={<MapPin size={22} />} title="Chưa có vị trí khách hàng" />}
      </div>
      <section className={`rounded-2xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_4px_16px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><Avatar name={selectedGroup.customerName} /><div className="min-w-0"><b className="block truncate text-base">{selectedGroup.customerName}</b>{(selectedGroup.address || selectedGroup.area) && <span className="mt-1 block truncate text-sm text-slate-500">{selectedGroup.address || selectedGroup.area}</span>}</div></div>
      </section>
      <button type="button" onClick={() => onOpenDirections?.(selectedGroup)} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--hd-primary)] px-4 text-[15px] font-bold text-white" disabled={!mapTarget}><Navigation size={18} /> Mở Google Maps</button>
    </div>
  ) : null;

  const activityByHour = useMemo(() => getDeliveryActivityByHour(normalizedGroups, workingDate), [normalizedGroups, workingDate]);
  const hasActivity = activityByHour.some((slot) => slot.count > 0);
  const maxActivity = Math.max(1, ...activityByHour.map((slot) => slot.count));
  const statsView = (
    <div className="space-y-4">
      <DeliveryHeader title="Hôm nay" onBack={resetToOverview} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <p className={isDark ? 'text-sm text-slate-400' : 'text-sm text-slate-500'}>{formatDeliveryDay(workingDate)}</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Đã giao', value: displayStats.completed, tone: 'text-emerald-700 bg-emerald-50' },
          { label: 'Chưa giao', value: displayStats.waiting, tone: 'text-orange-700 bg-orange-50' },
          { label: 'Doanh thu', value: formatDeliveryCompactMoney(stats.collectedTotal || 0), tone: 'text-blue-700 bg-blue-50' },
        ].map((item) => <div key={item.label} className={`rounded-2xl p-3 text-center ${item.tone}`}><b className="block text-lg font-black tabular-nums">{item.value}</b><span className="mt-1 block text-[10px] font-bold">{item.label}</span></div>)}
      </div>
      <section className={`rounded-2xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_4px_16px_rgba(15,23,42,0.05)]'}`}>
        <h3 className="text-xl font-black">Chuyến theo giờ</h3>
        {hasActivity ? <div className="mt-5 flex h-40 items-end justify-between gap-2" aria-label="Số chuyến giao theo giờ">
          {activityByHour.map((slot) => <span key={slot.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><small className="text-[10px] font-medium text-slate-500">{slot.count || ''}</small><i className="block w-full max-w-10 rounded-t-lg bg-[var(--hd-primary)]" style={{ height: `${slot.count ? Math.max(8, (slot.count / maxActivity) * 82) : 2}%` }} /><small className="text-[10px] text-slate-500">{slot.label}</small></span>)}
        </div> : <p className="mt-4 text-sm text-slate-500">Chưa có chuyến giao</p>}
      </section>
    </div>
  );

  const history = (
    <div className="space-y-3">
      <DeliveryHeader title="Lịch sử giao hàng" onBack={() => setScreen('list')} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      {historicalGroups.length ? <div className="hd-delivery-group-list space-y-2">{historicalGroups.map((group) => <DeliveryRow key={group.key} group={group} onOpen={openGroup} darkMode={isDark} />)}</div> : <HDEmptyState icon={<Clock3 size={22} />} title="Chưa có chuyến đã giao" />}
    </div>
  );

  const content = screen === 'overview' ? overview
    : screen === 'list' ? list
      : screen === 'search' ? search
        : screen === 'history' ? history
          : screen === 'detail' ? detail
            : screen === 'confirm' ? confirm
              : screen === 'success' ? success
                : screen === 'map' ? map
                  : statsView;
  return (
    <section data-hd-module="delivery" data-hd-screen={screen} data-hd-theme={theme} className={`hd-delivery-workspace relative min-h-full px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 ${shellClass}`} aria-label="Module giao hàng">
      {content}
      {statusMessage && statusTone === 'red' && screen !== 'confirm' && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{statusMessage}</p>}
      {filterOpen && <div className="hd-delivery-sheet-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
        <div className={`hd-delivery-sheet ${isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`} role="dialog" aria-modal="true" aria-label="Bộ lọc giao hàng" onClick={(event) => event.stopPropagation()}>
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <h3 className="text-xl font-black">Bộ lọc</h3>
            <IconButton label="Đóng bộ lọc" onClick={() => setFilterOpen(false)} className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'}><X size={18} /></IconButton>
          </header>
          <div className="hd-delivery-sheet-body">
            <fieldset>
              <legend className="mb-2 text-sm font-bold">Trạng thái</legend>
              <div className="grid grid-cols-3 gap-2">
                {filterOptions.map((option) => <button type="button" key={option.id} aria-pressed={draftFilters.status === option.id} onClick={() => setDraftFilters((previous) => ({ ...previous, status: option.id }))} className={`min-h-11 rounded-full px-2 text-xs font-bold ${draftFilters.status === option.id ? 'bg-[var(--hd-primary)] text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{option.label}</button>)}
              </div>
            </fieldset>
            <label className="grid gap-2 text-sm font-bold">Khu vực
              <select value={draftFilters.area} onChange={(event) => setDraftFilters((previous) => ({ ...previous, area: event.target.value }))} className={`min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'}`}>
                <option value="all">Tất cả khu vực</option>
                {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-bold">Thời gian</legend>
              <div className="grid grid-cols-3 gap-2">
                {[['all', 'Tất cả'], ['today', 'Hôm nay'], ['7days', '7 ngày'], ['range', 'Khoảng ngày']].map(([id, label]) => <button type="button" key={id} aria-pressed={draftFilters.period === id} onClick={() => setDraftFilters((previous) => ({ ...previous, period: id }))} className={`min-h-11 rounded-full px-2 text-xs font-bold ${draftFilters.period === id ? 'bg-[var(--hd-primary)] text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
              </div>
              {draftFilters.period === 'range' && <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">Từ ngày<input type="date" value={draftFilters.fromDate} onChange={(event) => setDraftFilters((previous) => ({ ...previous, fromDate: event.target.value }))} className={`min-h-11 min-w-0 rounded-xl border border-slate-200 px-2 text-sm ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'}`} /></label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">Đến ngày<input type="date" value={draftFilters.toDate} onChange={(event) => setDraftFilters((previous) => ({ ...previous, toDate: event.target.value }))} className={`min-h-11 min-w-0 rounded-xl border border-slate-200 px-2 text-sm ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'}`} /></label>
              </div>}
            </fieldset>
            <label className="grid gap-2 text-sm font-bold">Phương thức thanh toán
              <select value={draftFilters.paymentMethod} onChange={(event) => setDraftFilters((previous) => ({ ...previous, paymentMethod: event.target.value }))} className={`min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'}`}>
                <option value="all">Tất cả phương thức</option>
                {paymentOptions.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
          </div>
          <footer className="mt-4 flex gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={() => setDraftFilters(EMPTY_FILTERS)} className={`min-h-[52px] flex-1 rounded-full text-sm font-bold ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-700'}`}>Xóa tất cả</button>
            <button type="button" onClick={() => { setFilters(draftFilters); setActiveTab(draftFilters.status); setFilterOpen(false); }} className="min-h-[52px] flex-1 rounded-full bg-[var(--hd-primary)] text-sm font-bold text-white">Áp dụng</button>
          </footer>
        </div>
      </div>}
      {quickActionsOpen && <div className="hd-delivery-sheet-backdrop" role="presentation" onClick={() => setQuickActionsOpen(false)}>
        <div className={`hd-delivery-sheet ${isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`} role="dialog" aria-modal="true" aria-label="Thao tác nhanh" onClick={(event) => event.stopPropagation()}>
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <h3 className="text-xl font-black">Thao tác nhanh</h3>
            <IconButton label="Đóng thao tác nhanh" onClick={() => setQuickActionsOpen(false)} className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'}><X size={18} /></IconButton>
          </header>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ActionTile icon={Truck} label="Chờ giao" onClick={() => { setQuickActionsOpen(false); openList(); }} tone="green" darkMode={isDark} />
            <ActionTile icon={Clock3} label="Lịch sử" onClick={() => { setQuickActionsOpen(false); setScreen('history'); }} darkMode={isDark} />
            <ActionTile icon={BarChart3} label="Báo cáo nhanh" onClick={() => { setQuickActionsOpen(false); setScreen('stats'); }} darkMode={isDark} />
            <ActionTile icon={isDark ? Sun : Moon} label={isDark ? 'Giao diện sáng' : 'Giao diện tối'} onClick={() => setPreference(isDark ? 'light' : 'dark')} tone="violet" darkMode={isDark} />
          </div>
        </div>
      </div>}
    </section>
  );
}
