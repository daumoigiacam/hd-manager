import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Filter,
  ImagePlus,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  Phone,
  ScanLine,
  Search,
  Send,
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
  formatDeliveryDay,
  formatDeliveryMoney,
  formatDeliveryTime,
  getDeliveryInitial,
  getDeliveryWorkspaceStats,
  isDeliveryGroupCompleted,
} from './deliveryWorkspaceModel.js';

const PAYMENT_OPTIONS = [
  { id: 'Tiền mặt', label: 'Tiền mặt', icon: Banknote },
  { id: 'Chuyển khoản', label: 'Chuyển khoản', icon: WalletCards },
  { id: 'Công nợ', label: 'Công nợ', icon: CircleDollarSign },
];

const filterOptions = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ giao' },
  { id: 'completed', label: 'Đã giao' },
];

function getGroupAmount(group = {}) {
  return Number(group.totalAmount || group.paymentSummaryTotal || group.collectedAmount || 0);
}

function getGroupProducts(group = {}) {
  if (Array.isArray(group.productLines) && group.productLines.length > 0) return group.productLines;
  return (group.rows || []).map((row) => ({
    productLabel: row.productLabel || row.productName || 'Hàng hóa',
    quantity: row.pricingQuantity || row.dispatchQuantity || row.actualQuantity || 0,
    unit: row.pricingUnit || row.actualQuantityUnit || row.expectedQuantityUnit || 'đv',
    amount: row.totalAmount || row.pricingAmount || 0,
  }));
}

function Avatar({ name, large = false }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-violet-100 font-black text-violet-700 ${large ? 'h-20 w-20 text-3xl' : 'h-11 w-11 text-base'}`} aria-hidden="true">
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
  return (
    <button
      type="button"
      onClick={() => onOpen(group)}
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99] ${darkMode ? 'bg-slate-900 hover:bg-slate-800' : 'bg-white hover:bg-emerald-50/50'} ${compact ? '' : 'border border-slate-100 shadow-[0_8px_22px_rgba(15,23,42,0.04)]'}`}
    >
      <Avatar name={group.customerName} />
      <span className="min-w-0">
        <span className={`block truncate text-[15px] font-extrabold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{group.customerName || 'Khách hàng'}</span>
        <span className={`mt-0.5 block truncate text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {`${group.area || group.address || 'Chưa có khu vực'} • ${formatDeliveryTime(group.time)}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-right">
          <span className={`block text-[14px] font-black tabular-nums ${completed ? 'text-emerald-600' : 'text-slate-900'}`}>{groupAmount > 0 ? formatDeliveryMoney(groupAmount) : 'Chờ đối soát'}</span>
          <span className={`mt-1 block text-[10px] font-bold ${completed ? 'text-emerald-600' : 'text-orange-500'}`}>{completed ? 'Đã giao' : 'Chờ giao'}</span>
        </span>
        <ChevronRight size={17} className={darkMode ? 'text-slate-500' : 'text-slate-300'} />
      </span>
    </button>
  );
}

function ActionTile({ icon: Icon, label, onClick, tone = 'blue', darkMode = false }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <button type="button" onClick={onClick} className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl px-2 text-xs font-bold shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition active:scale-95 ${darkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-700'}`}>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}><Icon size={22} /></span>
      {label}
    </button>
  );
}

function DeliveryHeader({ title, onBack, onMore, darkMode }) {
  return (
    <div className={`flex items-center justify-between gap-3 pb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
      <IconButton label="Quay lại" onClick={onBack} className={darkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}><ArrowLeft size={22} /></IconButton>
      <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-black">{title}</h2>
      <IconButton label="Thêm thao tác" onClick={onMore} className={darkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}><MoreHorizontal size={22} /></IconButton>
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
  const [keyword, setKeyword] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [completedSummary, setCompletedSummary] = useState(null);

  const normalizedGroups = useMemo(() => [...groups].sort((left, right) => (right.latestTimestamp || 0) - (left.latestTimestamp || 0)), [groups]);
  const displayStats = useMemo(() => ({ ...getDeliveryWorkspaceStats(normalizedGroups), ...stats }), [normalizedGroups, stats]);
  const selectedGroup = normalizedGroups.find((group) => group.key === selectedGroupKey) || null;
  const filteredGroups = useMemo(() => filterDeliveryWorkspaceGroups(normalizedGroups, {
    tab: filterStatus === 'all' ? activeTab : filterStatus,
    keyword,
  }), [activeTab, filterStatus, keyword, normalizedGroups]);
  const recentGroups = normalizedGroups.slice(0, 4);
  const isDark = theme === 'dark';
  const shellClass = isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900';

  const openGroup = (group, target = 'detail') => {
    setSelectedGroupKey(group.key);
    onSelectGroup?.(group);
    setScreen(target);
  };
  const openList = () => {
    setKeyword('');
    setFilterStatus('all');
    setScreen('list');
  };
  const resetToOverview = () => {
    setQuickActionsOpen(false);
    setFilterOpen(false);
    setScreen('overview');
  };
  const resetListFilters = () => {
    setActiveTab('all');
    setFilterStatus('all');
    setKeyword('');
  };
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

  const overview = (
    <div className="space-y-4">
      <section className="hd-delivery-overview-hero overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-3 text-slate-900 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-slate-600">Giao hàng</p>
            <p className="mt-1 text-sm font-normal text-slate-500">{formatDeliveryDay(workingDate)}</p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="Báo cáo nhanh" onClick={() => setScreen('stats')} className="text-slate-600 hover:bg-slate-100"><BarChart3 size={19} /></IconButton>
            <IconButton label="Thao tác nhanh" onClick={() => setQuickActionsOpen(true)} className="text-slate-600 hover:bg-slate-100"><MoreHorizontal size={20} /></IconButton>
          <label title="Chọn ngày" className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100">
              <input type="date" value={workingDate} onChange={(event) => onChangeDate?.(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Chọn ngày giao hàng" />
              <FileText size={19} />
            </label>
          </div>
        </div>
        <div className="hd-delivery-overview-heading mt-3 flex items-center justify-between gap-4">
          <div className="hd-delivery-overview-copy min-w-0 flex-1">
            <p className="hd-delivery-overview-title text-xl font-bold leading-7">Giao đúng hẹn</p>
            <p className="mt-1 text-sm font-medium text-slate-500">Vững niềm tin</p>
          </div>
          <div className="hd-delivery-overview-illustration flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
            <Truck size={34} strokeWidth={1.8} aria-hidden="true" />
          </div>
        </div>
        <div className="hd-delivery-overview-stats mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Cần giao', value: displayStats.required, tone: 'border-slate-200 bg-slate-50' },
            { label: 'Chờ báo cáo', value: displayStats.waiting, tone: 'border-amber-100 bg-amber-50' },
            { label: 'Đã giao', value: displayStats.completed, tone: 'border-emerald-100 bg-emerald-50' },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl border px-2 py-3 text-center ${item.tone}`}>
              <p className="text-xl font-bold tabular-nums">{item.value}</p>
              <p className="mt-1 text-xs font-medium leading-4 text-slate-600">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <button type="button" onClick={openList} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]">
        Bắt đầu giao hàng <ArrowRight size={18} />
      </button>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="text-[17px] font-black">Giao gần đây</h2>
          <button type="button" onClick={openList} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">Xem tất cả <ChevronRight size={15} /></button>
        </div>
        <div className="space-y-2">
          {recentGroups.length > 0 ? recentGroups.map((group) => <DeliveryRow key={group.key} group={group} onOpen={openGroup} />) : (
            <HDEmptyState
              icon={<Truck size={24} aria-hidden="true" />}
              title="Chưa có chuyến giao"
              description="Các chuyến giao sẽ xuất hiện tại đây khi có đơn cần giao."
              className={`rounded-2xl border ${isDark ? 'border-slate-800 bg-slate-900' : 'border-dashed border-slate-200 bg-white'}`}
            />
          )}
        </div>
      </section>
    </div>
  );

  const list = (
    <div className="space-y-3">
      <DeliveryHeader title="Giao hàng" onBack={resetToOverview} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <div className="grid grid-cols-3 border-b border-slate-200">
        {DELIVERY_STATUS_TABS.map((tab) => {
          const tabCount = tab.id === 'all' ? normalizedGroups.length : tab.id === 'pending' ? normalizedGroups.filter((group) => !isDeliveryGroupCompleted(group)).length : normalizedGroups.filter(isDeliveryGroupCompleted).length;
          const active = activeTab === tab.id;
          return (
            <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative min-h-11 px-1 text-center text-sm font-bold ${active ? 'text-emerald-700' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {tab.label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{tabCount}</span>
              {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-600" />}
            </button>
          );
        })}
      </div>
      <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_8px_20px_rgba(15,23,42,0.04)]'}`}>
        <Search size={18} className="shrink-0 text-slate-400" />
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm khách hàng..." className={`min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0 ${isDark ? 'text-white' : 'text-slate-800'}`} />
        {keyword && <IconButton label="Xóa tìm kiếm" onClick={() => setKeyword('')} className="h-8 w-8 text-slate-400 hover:bg-slate-100"><X size={16} /></IconButton>}
        <IconButton label="Bộ lọc" onClick={() => setFilterOpen(true)} className="h-9 w-9 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Filter size={18} /></IconButton>
      </div>
      <div className="space-y-2">
        {filteredGroups.length > 0 ? filteredGroups.map((group) => <DeliveryRow key={group.key} group={group} onOpen={openGroup} darkMode={isDark} />) : (
          <HDEmptyState
            icon={<Search size={24} aria-hidden="true" />}
            title={normalizedGroups.length > 0 ? 'Không có chuyến phù hợp' : 'Chưa có chuyến giao'}
            description={normalizedGroups.length > 0
              ? 'Thử điều chỉnh tìm kiếm hoặc trạng thái giao hàng.'
              : 'Các chuyến giao mới sẽ hiển thị tại đây.'}
            action={normalizedGroups.length > 0
              ? <HDButton variant="secondary" size="sm" onClick={resetListFilters}>Xóa bộ lọc</HDButton>
              : null}
            className={`rounded-2xl ${isDark ? 'bg-slate-900' : 'bg-white'}`}
          />
        )}
      </div>
    </div>
  );

  const detail = selectedGroup ? (
    <div className="space-y-4">
      <DeliveryHeader title="Chi tiết giao hàng" onBack={() => setScreen('list')} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <section className={`rounded-[28px] p-5 text-center ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <Avatar name={selectedGroup.customerName} large />
        <h2 className="mt-3 text-xl font-black">{selectedGroup.customerName || selectedCustomer?.name || 'Khách hàng'}</h2>
        <div className="mt-2 flex justify-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Thân thiết</span>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">VIP</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <a href={selectedGroup.phone ? `tel:${selectedGroup.phone}` : undefined} className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'}`}><Phone size={20} className="text-emerald-600" />Gọi</a>
          <button type="button" onClick={() => { onOpenDirections?.(selectedGroup); setScreen('map'); }} className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'}`}><Navigation size={20} className="text-blue-600" />Chỉ đường</button>
          <a href={selectedGroup.phone ? `sms:${selectedGroup.phone}` : undefined} className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'}`}><MessageCircle size={20} className="text-violet-600" />Nhắn tin</a>
        </div>
        <div className={`mt-4 grid grid-cols-3 divide-x rounded-2xl py-3 text-center ${isDark ? 'divide-slate-700 bg-slate-800' : 'divide-slate-100 bg-slate-50'}`}>
          <span><MapPin size={15} className="mx-auto text-slate-400" /><b className="mt-1 block truncate px-1 text-[11px]">{selectedGroup.area || 'Chưa rõ'}</b></span>
          <span><ClockIcon /><b className="mt-1 block text-[11px]">{formatDeliveryTime(selectedGroup.time)}</b></span>
          <span><Banknote size={15} className="mx-auto text-slate-400" /><b className="mt-1 block truncate px-1 text-[11px]">{selectedGroup.collectedMethod || 'Tiền mặt'}</b></span>
        </div>
      </section>
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <h3 className="text-[17px] font-black">Hàng giao</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {getGroupProducts(selectedGroup).map((product, index) => (
            <div key={`${product.productLabel}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Truck size={19} /></span>
              <span className="min-w-0 flex-1"><b className="block truncate text-sm">{product.productLabel}</b><small className={isDark ? 'text-slate-400' : 'text-slate-500'}>{product.quantity || 0} {product.unit || 'đv'}</small></span>
              <b className="shrink-0 text-sm text-emerald-700">{product.amount > 0 ? formatDeliveryMoney(product.amount) : '--'}</b>
            </div>
          ))}
        </div>
      </section>
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex gap-3"><FileText size={19} className="mt-0.5 shrink-0 text-slate-400" /><span><b className="block text-sm">Ghi chú</b><p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedGroup.note || 'Không có ghi chú'}</p></span></div>
      </section>
      <button type="button" disabled={!canCreate || isDeliveryGroupCompleted(selectedGroup)} onClick={() => setScreen('confirm')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-[15px] font-black text-white shadow-[0_14px_28px_rgba(5,150,105,0.22)] disabled:opacity-50">{isDeliveryGroupCompleted(selectedGroup) ? 'Đã giao' : 'Xác nhận giao hàng'} <ArrowRight size={18} /></button>
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
          <button type="button" onClick={triggerPhotoPicker} className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-xs font-bold text-blue-700"><CameraIcon /><span>{isReadingPhoto ? 'Đang đọc ảnh...' : photoUrl ? 'Đổi ảnh' : 'Camera / Ảnh'}</span></button>
        </div>
      </section>
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-black text-white">3</span><b className="text-[15px]">Nhận thanh toán</b></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PAYMENT_OPTIONS.map(({ id, label, icon: Icon }) => {
            const active = collectedMethod === id;
            return <button type="button" key={id} onClick={() => setPayment(id)} className={`min-h-20 rounded-2xl px-2 text-center text-xs font-bold transition ${active ? 'border border-emerald-500 bg-emerald-50 text-emerald-700' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}`}><Icon size={20} className="mx-auto mb-2" />{label}</button>;
          })}
        </div>
        <input inputMode="numeric" value={collectedAmount} onChange={(event) => onCollectedAmountChange?.(event.target.value)} disabled={collectedMethod === 'Công nợ'} placeholder={collectedMethod === 'Công nợ' ? 'Ghi công nợ' : 'Số tiền nhận'} className={`mt-3 h-12 w-full rounded-xl px-3 text-sm font-bold outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-60 ${isDark ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'}`} />
        <textarea value={note} onChange={(event) => onNoteChange?.(event.target.value)} rows={2} placeholder="Ghi chú" className={`mt-2 w-full resize-none rounded-xl px-3 py-3 text-sm font-medium outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0 ${isDark ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'}`} />
      </section>
      {statusMessage && <p className={`rounded-xl px-3 py-2 text-xs font-bold ${statusTone === 'red' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{statusMessage}</p>}
      <button type="button" disabled={isSaving || !canCreate} onClick={handleComplete} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-[15px] font-black text-white shadow-[0_14px_28px_rgba(5,150,105,0.22)] disabled:opacity-50">{isSaving ? 'Đang lưu...' : 'Hoàn thành'} <ArrowRight size={18} /></button>
    </div>
  ) : null;

  const success = completedSummary ? (
    <div className="pt-7 text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_18px_36px_rgba(5,150,105,0.25)]"><Check size={54} strokeWidth={2.7} /></div>
      <h2 className="mt-5 text-2xl font-black">Giao hàng thành công!</h2>
      <section className={`mt-5 rounded-3xl p-5 text-left ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3"><Avatar name={completedSummary.customerName} /><span><b className="block text-[15px]">{completedSummary.customerName}</b><b className="mt-1 block text-[17px] text-emerald-700">{formatDeliveryMoney(completedSummary.amount)}</b></span></div>
        <div className={`mt-4 divide-y rounded-2xl px-3 ${isDark ? 'divide-slate-800 bg-slate-800' : 'divide-slate-100 bg-slate-50'}`}>
          <p className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Thời gian</span><b>{formatDeliveryTime(completedSummary.time)} · {workingDate}</b></p>
          <p className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Phương thức</span><b>{completedSummary.method}</b></p>
          <p className="flex justify-between gap-3 py-3 text-sm"><span className="text-slate-500">Khu vực</span><b className="truncate">{completedSummary.area || '--'}</b></p>
        </div>
      </section>
      <button type="button" onClick={openList} className="mt-5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-[15px] font-black text-slate-700">Xem danh sách</button>
      <button type="button" onClick={resetToOverview} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-[15px] font-black text-white">Tiếp tục giao hàng <ArrowRight size={18} /></button>
    </div>
  ) : null;

  const map = selectedGroup ? (
    <div className="space-y-4">
      <DeliveryHeader title="Chỉ đường" onBack={() => setScreen('detail')} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <section className="relative h-[24rem] overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-100 via-emerald-50 to-sky-200 p-5">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(90deg, transparent 49%, #94a3b8 50%, transparent 51%), linear-gradient(0deg, transparent 49%, #94a3b8 50%, transparent 51%)', backgroundSize: '64px 64px' }} />
        <div className="relative flex h-full flex-col justify-between"><span className="mx-auto rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-800 shadow">Tuyến đến {selectedGroup.area || 'khách hàng'}</span><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"><MapPin size={28} /></span><span className="mx-auto rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white">Mở Google Maps để điều hướng</span></div>
      </section>
      <button type="button" onClick={() => onOpenDirections?.(selectedGroup)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-[15px] font-black text-white"><Navigation size={18} /> Mở Google Maps</button>
    </div>
  ) : null;

  const statsView = (
    <div className="space-y-4">
      <DeliveryHeader title="Hôm nay" onBack={resetToOverview} onMore={() => setQuickActionsOpen(true)} darkMode={isDark} />
      <p className={isDark ? 'text-sm text-slate-400' : 'text-sm text-slate-500'}>{formatDeliveryDay(workingDate)}</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Đã giao', value: displayStats.completed, tone: 'text-emerald-700 bg-emerald-50' },
          { label: 'Chưa giao', value: displayStats.waiting, tone: 'text-orange-700 bg-orange-50' },
          { label: 'Doanh thu', value: formatDeliveryMoney(stats.collectedTotal || 0), tone: 'text-blue-700 bg-blue-50' },
        ].map((item) => <div key={item.label} className={`rounded-2xl p-3 text-center ${item.tone}`}><b className="block text-lg font-black tabular-nums">{item.value}</b><span className="mt-1 block text-[10px] font-bold">{item.label}</span></div>)}
      </div>
      <section className={`rounded-3xl p-4 ${isDark ? 'bg-slate-900' : 'bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]'}`}><h3 className="text-[17px] font-black">Nhịp giao hàng</h3><div className="mt-7 flex h-40 items-end justify-between gap-2">{[34, 53, 31, 72, 48, 86, 62].map((height, index) => <span key={index} className="flex flex-1 flex-col items-center gap-2"><i className="block w-full rounded-t-lg bg-emerald-500" style={{ height: `${height}%` }} /><small className="text-[10px] text-slate-400">{6 + index * 2}h</small></span>)}</div></section>
    </div>
  );

  const content = screen === 'overview' ? overview : screen === 'list' ? list : screen === 'detail' ? detail : screen === 'confirm' ? confirm : screen === 'success' ? success : screen === 'map' ? map : statsView;
  return (
    <section data-hd-module="delivery" data-hd-theme={theme} className={`relative min-h-full px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 ${shellClass}`} aria-label="Module giao hàng">
      {content}
      {filterOpen && <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] top-0 z-30 flex items-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="Bộ lọc giao hàng" onClick={() => setFilterOpen(false)}><div className={`w-full rounded-t-[28px] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ${isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`} onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-[17px] font-black">Bộ lọc</h3><IconButton label="Đóng bộ lọc" onClick={() => setFilterOpen(false)} className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'}><X size={18} /></IconButton></div><div className="mt-4 grid grid-cols-3 gap-2">{filterOptions.map((option) => <button type="button" key={option.id} onClick={() => setFilterStatus(option.id)} className={`min-h-11 rounded-xl px-2 py-3 text-xs font-bold ${filterStatus === option.id ? 'bg-emerald-600 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{option.label}</button>)}</div><button type="button" onClick={() => setFilterOpen(false)} className="mt-4 min-h-11 w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-black text-white">Áp dụng</button></div></div>}
      {quickActionsOpen && <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] top-0 z-30 flex items-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="Thao tác nhanh" onClick={() => setQuickActionsOpen(false)}><div className={`w-full rounded-t-[28px] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ${isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`} onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-[17px] font-black">Thao tác nhanh</h3><IconButton label="Đóng thao tác nhanh" onClick={() => setQuickActionsOpen(false)} className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'}><X size={18} /></IconButton></div><div className="mt-4 grid grid-cols-2 gap-3"><ActionTile icon={ScanLine} label="Quét khách" onClick={() => { setQuickActionsOpen(false); openList(); }} tone="green" darkMode={isDark} /><ActionTile icon={FileText} label="Hóa đơn" onClick={() => { setQuickActionsOpen(false); openList(); }} darkMode={isDark} /><ActionTile icon={ImagePlus} label="Chụp ảnh" onClick={() => { setQuickActionsOpen(false); triggerPhotoPicker(); }} tone="orange" darkMode={isDark} /><ActionTile icon={Send} label="Ghi chú" onClick={() => { setQuickActionsOpen(false); selectedGroup ? setScreen('confirm') : openList(); }} tone="violet" darkMode={isDark} /></div><button type="button" onClick={() => setPreference(isDark ? 'light' : 'dark')} className={`mt-3 min-h-11 w-full rounded-xl py-3 text-sm font-bold ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-700'}`}>{isDark ? 'Dùng giao diện sáng' : 'Dùng giao diện tối'}</button></div></div>}
    </section>
  );
}

function ClockIcon() {
  return <span className="mx-auto flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-slate-400"><span className="h-1.5 w-px translate-y-[-1px] bg-slate-400" /></span>;
}

function CameraIcon() {
  return <span className="flex h-5 w-6 items-center justify-center rounded border-2 border-current"><span className="h-1.5 w-1.5 rounded-full border border-current" /></span>;
}
