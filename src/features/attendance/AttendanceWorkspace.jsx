import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BarChart3, Battery, Bell, CalendarDays, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, MapPin, RefreshCw, Settings2,
  ShieldCheck, Wifi, WifiOff, Zap
} from 'lucide-react';
import './AttendanceWorkspace.css';

const formatTime = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date) : '--:--';
};
const dateKey = date => `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
const fromDateKey = value => new Date(`${value}T12:00:00`);
const dateTitle = value => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromDateKey(value));
const monthTitle = value => {
  const month = fromDateKey(value);
  return `Tháng ${month.getMonth() + 1}, ${month.getFullYear()}`;
};
const methodLabel = value => /wifi/i.test(`${value || ''}`) ? 'WiFi nội bộ' : /gps|vị trí/i.test(`${value || ''}`) ? 'GPS vị trí' : (value || 'Chưa ghi nhận');

function AttendanceEvent({ time, title, method, network, tone = 'in', pending = false, status }) {
  return (
    <div className={`attendance-event ${pending ? 'attendance-event--pending' : ''}`}>
      <span className={`attendance-event__icon attendance-event__icon--${tone}`}>{pending ? <Clock3 size={15} /> : <Check size={15} />}</span>
      <strong>{formatTime(time)}</strong>
      <div className="attendance-event__copy">
        <span>{title}</span>
        <small>{pending ? method : methodLabel(method)}{network ? ` · ${network}` : ''}</small>
      </div>
      {status && <span className={`attendance-pill attendance-pill--${status === 'late' ? 'warning' : 'success'}`}>{status === 'late' ? 'Đi muộn' : 'Đúng giờ'}</span>}
    </div>
  );
}

export default function AttendanceWorkspace({
  screen, onScreenChange, onExit, onOpenNotifications, currentEmployee, currentCompany,
  attendance, date, onChangeDate, record, shiftPolicy, statusMessage, autoStatus,
  wifiInfo, wifiLoading, wifiPermission, wifiMatches, wifiConfigured, wifiMessage, onOpenWifi,
  onRefreshWifi, onRequestWifiPermission, onOpenWifiSettings, onSaveCompanyWifi,
  autoEnabled, autoSaving, onToggleAuto, canManage, canManageWifi, onManage,
  selfMethod, onSelectMethod, onCheckIn, onCheckOut, onLeave, submitting
}) {
  const [battery, setBattery] = useState(null);
  const [showShift, setShowShift] = useState(false);
  const shiftLabel = `${shiftPolicy.shiftStart} - ${shiftPolicy.shiftEnd}`;
  const records = useMemo(() => Object.entries(attendance || {})
    .filter(([key, value]) => key.endsWith(`_${currentEmployee?.id}`) && value?.companyId === currentCompany?.id)
    .map(([key, value]) => ({ date: key.slice(0, 10), ...value }))
    .sort((a, b) => b.date.localeCompare(a.date)), [attendance, currentEmployee?.id, currentCompany?.id]);
  const monthKey = date.slice(0, 7);
  const monthRecords = records.filter(item => item.date.startsWith(monthKey));
  const summary = {
    worked: monthRecords.filter(item => item.checkIn).length,
    late: monthRecords.filter(item => item.checkIn && item.status === 'late').length,
    leave: monthRecords.filter(item => item.status === 'leave').length
  };
  const weekDates = useMemo(() => {
    const first = fromDateKey(date);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(first);
      day.setDate(day.getDate() + index);
      return dateKey(day);
    });
  }, [date]);
  const selectedRecord = attendance?.[`${date}_${currentEmployee?.id}`];
  const isToday = date === dateKey(new Date());

  useEffect(() => {
    document.querySelector('.hd-app-shell[data-active-tab="company_attendance"] > .hd-app-content')?.scrollTo({ top: 0 });
  }, [screen]);

  useEffect(() => {
    if (typeof navigator?.getBattery !== 'function') return undefined;
    let active = true;
    let batteryManager;
    const update = () => { if (active) setBattery(Math.round(batteryManager.level * 100)); };
    void navigator.getBattery().then(manager => {
      batteryManager = manager;
      update();
      manager.addEventListener('levelchange', update);
    }).catch(() => {});
    return () => {
      active = false;
      batteryManager?.removeEventListener('levelchange', update);
    };
  }, []);

  const changeMonth = delta => {
    const next = fromDateKey(date);
    next.setDate(1);
    next.setMonth(next.getMonth() + delta);
    onChangeDate?.(dateKey(next));
  };
  const goBack = () => {
    if (screen === 'wifi-permission') onScreenChange('wifi');
    else if (screen !== 'dashboard') onScreenChange('dashboard');
    else onExit?.();
  };
  const title = screen === 'wifi' || screen === 'wifi-permission' ? 'WiFi nội bộ'
    : screen === 'history' ? 'Lịch sử chấm công'
      : screen === 'reports' ? 'Báo cáo chấm công'
        : screen === 'settings' ? 'Cài đặt chấm công' : 'Chấm công';

  return (
    <div className="attendance-workspace" data-attendance-screen={screen}>
      <header className="attendance-header">
        <button type="button" onClick={goBack} aria-label="Quay lại"><ArrowLeft size={22} /></button>
        <h1>{title}</h1>
        {screen === 'dashboard' && onOpenNotifications
          ? <button type="button" onClick={onOpenNotifications} aria-label="Thông báo"><Bell size={19} /></button>
          : <span className="attendance-header__spacer" />}
      </header>

      {screen === 'dashboard' && (
        <div className="attendance-dashboard">
          <div className="attendance-shift">
            <div><strong>{dateTitle(date)}</strong><small>{shiftPolicy.shiftName}: {shiftLabel}</small></div>
            <button type="button" onClick={() => setShowShift(value => !value)}>{showShift ? 'Ẩn ca' : 'Xem ca'}</button>
          </div>
          {showShift && <div className="attendance-inline-note">Ca làm của {currentEmployee?.name}: {shiftLabel}</div>}
          <div className="attendance-hero">
            <div className={`attendance-hero__circle ${record?.checkIn ? 'is-complete' : ''}`}>
              <span className="attendance-hero__mark">{record?.checkIn ? <Check size={28} /> : <Clock3 size={27} />}</span>
              <strong>{record?.checkIn ? formatTime(record.checkIn) : '--:--'}</strong>
              <span>{record?.checkIn ? 'Đã chấm công vào' : record?.status === 'leave' ? 'Nghỉ phép' : 'Chưa chấm công'}</span>
              {record?.checkIn && <small className={`attendance-pill attendance-pill--${record.status === 'late' ? 'warning' : 'success'}`}>{record.status === 'late' ? 'Đi muộn' : 'Đúng giờ'}</small>}
            </div>
          </div>
          <div className={`attendance-sensors ${battery === null ? 'attendance-sensors--two' : ''}`}>
            <button type="button" onClick={onOpenWifi}>
              {wifiMatches ? <Wifi size={20} /> : <WifiOff size={20} />}
              <strong>WiFi công ty</strong><span>{wifiInfo?.ssid || 'Chưa xác định'}</span>
              <small className={wifiMatches ? 'is-ready' : 'is-warning'}>{wifiMatches ? 'Đang kết nối' : !wifiPermission?.granted ? 'Chưa cấp quyền' : wifiInfo?.ssid ? 'Chưa khớp mạng' : 'Chưa xác định'}</small>
            </button>
            <div><MapPin size={20} /><strong>Vị trí</strong><span>{record?.checkInMethodMeta?.type === 'gps' ? 'Đã ghi nhận' : 'Chưa xác minh'}</span></div>
            {battery !== null && <div><Battery size={20} /><strong>Pin</strong><span>{battery}%</span></div>}
          </div>
          <div className="attendance-methods">
            <button type="button" className={selfMethod === 'gps' ? 'is-selected' : ''} onClick={() => onSelectMethod('gps')}>
              <MapPin size={23} /><strong>GPS vị trí</strong><small>Chấm công thủ công</small>{selfMethod === 'gps' && <CheckCircle2 className="attendance-methods__check" size={18} />}
            </button>
            <button type="button" className={selfMethod === 'wifi' ? 'is-selected' : ''} onClick={onOpenWifi}>
              <Wifi size={23} /><strong>WiFi nội bộ</strong><small>{autoEnabled ? 'Đang bật tự động' : 'Cài đặt tự động'}</small>{selfMethod === 'wifi' && <CheckCircle2 className="attendance-methods__check" size={18} />}
            </button>
          </div>
          {isToday && !record?.checkIn && record?.status !== 'leave' && (
            <div className="attendance-actions"><button type="button" className="attendance-primary" disabled={submitting || (selfMethod === 'wifi' && !wifiMatches)} onClick={onCheckIn}>{submitting ? 'Đang chấm công...' : `Chấm công vào qua ${selfMethod === 'wifi' ? 'WiFi' : 'GPS'}`}</button><button type="button" onClick={onLeave}>Xin nghỉ</button></div>
          )}
          {isToday && record?.checkIn && !record?.checkOut && record?.status !== 'leave' && <button type="button" className="attendance-primary attendance-primary--out" disabled={submitting} onClick={onCheckOut}>{submitting ? 'Đang chấm công...' : 'Chấm công ra'}</button>}
          {(statusMessage || autoStatus) && <div className="attendance-inline-note" role="status">{statusMessage || autoStatus}</div>}
          <section className="attendance-today">
            <div className="attendance-section-heading"><h2>{isToday ? 'Hôm nay' : 'Ngày đã chọn'}</h2><span>{Number(Boolean(record?.checkIn)) + Number(Boolean(record?.checkOut))} lượt</span></div>
            <AttendanceEvent time={record?.checkIn} title={record?.checkIn ? 'Chấm công vào' : 'Chưa chấm công vào'} method={record?.checkIn ? record.checkInMethod : `Ca làm: ${shiftLabel}`} network={record?.checkInMethodMeta?.ssid} pending={!record?.checkIn} status={record?.checkIn ? record.status : null} />
            <AttendanceEvent time={record?.checkOut} title={record?.checkOut ? 'Chấm công ra' : 'Chưa chấm công ra'} method={record?.checkOut ? record.checkOutMethod : `Ca làm: ${shiftLabel}`} network={record?.checkOutMethodMeta?.ssid} pending={!record?.checkOut} tone="out" />
          </section>
        </div>
      )}

      {screen === 'wifi' && (
        <div className="attendance-page">
          <div className={`attendance-wifi-banner ${wifiMatches ? 'is-connected' : ''}`}><span>{wifiMatches ? <Check size={24} /> : <WifiOff size={24} />}</span><div><strong>{wifiMatches ? 'Đã kết nối WiFi công ty' : 'Chưa kết nối WiFi công ty'}</strong><small>{wifiMatches ? 'App sẽ tự chấm công vào khi đủ điều kiện ca làm.' : 'Kết nối đúng WiFi công ty để sử dụng chấm công tự động.'}</small></div></div>
          <section className="attendance-panel"><h2>WiFi hiện tại</h2><div className="attendance-wifi-current"><div><strong>{wifiInfo?.ssid || 'Chưa xác định'}</strong><small>BSSID: {wifiInfo?.bssid || 'Chưa xác định'}</small></div><span className={`attendance-pill attendance-pill--${wifiMatches ? 'success' : 'warning'}`}>{wifiMatches ? 'WiFi công ty' : 'Chưa xác minh'}</span></div></section>
          <section className="attendance-panel attendance-toggle-row"><span className="attendance-toggle-row__icon"><Zap size={22} /></span><div><h2>Tự động chấm công vào</h2><small>Ghi nhận khi kết nối đúng WiFi công ty trong giờ làm việc.</small></div><button type="button" role="switch" aria-checked={autoEnabled} aria-label="Tự động chấm công vào" className={`attendance-switch ${autoEnabled ? 'is-on' : ''}`} disabled={autoSaving || !wifiConfigured} onClick={onToggleAuto}><span /></button></section>
          <section className={`attendance-panel attendance-status-panel ${wifiMatches ? '' : 'is-warning'}`}><h2>Trạng thái</h2><p className={wifiPermission?.granted ? '' : 'is-warning'}><ShieldCheck size={17} /> {wifiPermission?.granted ? 'Đã cấp quyền WiFi' : 'Chưa cấp quyền WiFi'}</p><p className={wifiMatches ? '' : 'is-warning'}><Wifi size={17} /> {wifiMatches ? 'Đang kết nối WiFi công ty' : 'Chưa kết nối đúng WiFi công ty'}</p><p className={autoEnabled ? '' : 'is-warning'}><Zap size={17} /> {autoEnabled ? 'Tự động chấm công đang bật' : 'Tự động chấm công đang tắt'}</p></section>
          <button type="button" className="attendance-secondary" disabled={wifiLoading} onClick={onRefreshWifi}><RefreshCw size={17} /> {wifiLoading ? 'Đang kiểm tra...' : 'Kiểm tra WiFi hiện tại'}</button>
          {wifiMessage && !wifiMatches && <div className="attendance-inline-note" role="status">{wifiMessage}</div>}
          {!wifiPermission?.granted && <button type="button" className="attendance-primary" onClick={() => onScreenChange('wifi-permission')}>Cấp quyền WiFi</button>}
          {canManageWifi && <button type="button" className="attendance-secondary" disabled={!wifiInfo?.bssid || !wifiInfo?.ssid} onClick={onSaveCompanyWifi}>Đặt WiFi hiện tại cho công ty</button>}
          {!wifiConfigured && <div className="attendance-inline-note">Công ty chưa cài đầy đủ SSID và BSSID cho chấm công tự động.</div>}
          {(statusMessage || autoStatus) && <div className="attendance-inline-note" role="status">{statusMessage || autoStatus}</div>}
          {wifiMatches && !record?.checkIn && isToday && <button type="button" className="attendance-primary" disabled={submitting} onClick={onCheckIn}>Chấm công vào qua WiFi</button>}
        </div>
      )}

      {screen === 'wifi-permission' && (
        <div className="attendance-page attendance-permission">
          <div className="attendance-permission__visual"><Wifi size={68} /><span><ShieldCheck size={30} /></span></div>
          <h2>Cấp quyền truy cập WiFi</h2>
          <p>HD Manager cần quyền đọc WiFi đang kết nối để nhận diện mạng công ty và tự động chấm công.</p>
          <div className="attendance-permission__features"><div><Wifi size={19} /><span><strong>WiFi công ty</strong><small>Nhận diện bằng SSID và BSSID</small></span></div><div><Zap size={19} /><span><strong>Tự động chấm công vào</strong><small>Khi kết nối đúng mạng trong ca làm</small></span></div><div><ShieldCheck size={19} /><span><strong>An toàn & bảo mật</strong><small>Chỉ dùng để xác minh WiFi chấm công</small></span></div></div>
          <button type="button" className="attendance-primary" onClick={onRequestWifiPermission}>Cấp quyền WiFi</button>
          <button type="button" className="attendance-secondary" onClick={onOpenWifiSettings}>Mở cài đặt ứng dụng</button>
          {statusMessage && <div className="attendance-inline-note" role="status">{statusMessage}</div>}
        </div>
      )}

      {screen === 'history' && (
        <div className="attendance-page attendance-history">
          <div className="attendance-calendar"><div className="attendance-calendar__month"><button type="button" aria-label="Tháng trước" onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button><strong>{monthTitle(date)}</strong><button type="button" aria-label="Tháng sau" onClick={() => changeMonth(1)}><ChevronRight size={20} /></button></div><div className="attendance-calendar__week">{weekDates.map((day, index) => <button type="button" key={day} className={day === date ? 'is-current' : ''} onClick={() => onChangeDate?.(day)}><small>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][index]}</small><strong>{Number(day.slice(8))}</strong></button>)}</div></div>
          <div className="attendance-kpis"><div><CheckCircle2 size={19} /><strong>{summary.worked}</strong><span>Ngày làm</span></div><div><Clock3 size={19} /><strong>{summary.late}</strong><span>Đi muộn</span></div><div><CalendarDays size={19} /><strong>{summary.leave}</strong><span>Nghỉ phép</span></div></div>
          <div className="attendance-history__list"><section className="attendance-day"><div className="attendance-day__heading"><strong>{dateTitle(date)}</strong><span className={`attendance-pill attendance-pill--${selectedRecord?.status === 'late' ? 'warning' : selectedRecord?.checkIn ? 'success' : 'neutral'}`}>{selectedRecord?.status === 'leave' ? 'Nghỉ phép' : selectedRecord?.checkIn ? selectedRecord.status === 'late' ? 'Đi muộn' : 'Đúng giờ' : 'Chưa chấm'}</span></div><AttendanceEvent time={selectedRecord?.checkIn} title={selectedRecord?.checkIn ? 'Chấm công vào' : 'Chưa chấm công vào'} method={selectedRecord?.checkInMethod} network={selectedRecord?.checkInMethodMeta?.ssid} pending={!selectedRecord?.checkIn} /><AttendanceEvent time={selectedRecord?.checkOut} title={selectedRecord?.checkOut ? 'Chấm công ra' : 'Chưa chấm công ra'} method={selectedRecord?.checkOutMethod} network={selectedRecord?.checkOutMethodMeta?.ssid} pending={!selectedRecord?.checkOut} tone="out" /></section>{monthRecords.filter(item => item.date !== date).slice(0, 20).map(item => <button type="button" key={item.date} className="attendance-history-row" onClick={() => onChangeDate?.(item.date)}><span><strong>{dateTitle(item.date)}</strong><small>{formatTime(item.checkIn)} - {formatTime(item.checkOut)}</small></span><ChevronRight size={17} /></button>)}</div>
        </div>
      )}

      {screen === 'reports' && <div className="attendance-page"><h2 className="attendance-page-title">{monthTitle(date)}</h2><div className="attendance-kpis"><div><CheckCircle2 size={19} /><strong>{summary.worked}</strong><span>Ngày làm</span></div><div><Clock3 size={19} /><strong>{summary.late}</strong><span>Đi muộn</span></div><div><CalendarDays size={19} /><strong>{summary.leave}</strong><span>Nghỉ phép</span></div></div><section className="attendance-panel"><h2>Thống kê chấm công</h2><p>Dữ liệu từ hồ sơ chấm công của {currentEmployee?.name} trong tháng đã chọn.</p><div className="attendance-report-bars">{monthRecords.slice(0, 14).reverse().map(item => <div key={item.date} title={`${item.date}: ${formatTime(item.checkIn)} - ${formatTime(item.checkOut)}`}><span style={{ height: item.checkIn ? item.checkOut ? '82%' : '48%' : '10%' }} /><small>{Number(item.date.slice(8))}</small></div>)}</div></section></div>}

      {screen === 'settings' && <div className="attendance-page"><section className="attendance-panel"><h2>Phương thức chấm công</h2><button type="button" className="attendance-settings-row" onClick={onOpenWifi}><Wifi size={21} /><span><strong>WiFi nội bộ</strong><small>{autoEnabled ? 'Tự động chấm công đang bật' : 'Thiết lập WiFi công ty'}</small></span><ChevronRight size={18} /></button><button type="button" className="attendance-settings-row" onClick={() => { onSelectMethod('gps'); onScreenChange('dashboard'); }}><MapPin size={21} /><span><strong>GPS vị trí</strong><small>Chấm công thủ công</small></span><ChevronRight size={18} /></button></section>{canManage && <section className="attendance-panel"><h2>Quản lý</h2><button type="button" className="attendance-settings-row" onClick={onManage}><CalendarDays size={21} /><span><strong>Chấm công nhân sự</strong><small>Xem, lọc và điều chỉnh chấm công</small></span><ChevronRight size={18} /></button></section>}<section className="attendance-panel"><h2>Ca làm hiện tại</h2><p>{shiftPolicy.shiftName} · {shiftLabel}</p></section></div>}

      <nav className="attendance-nav" aria-label="Điều hướng chấm công">{[
        ['dashboard', 'Chấm công', Clock3], ['history', 'Lịch sử', CalendarDays],
        ['reports', 'Báo cáo', BarChart3], ['settings', 'Cài đặt', Settings2]
      ].map(([key, label, Icon]) => <button type="button" key={key} className={screen === key || ((screen === 'wifi' || screen === 'wifi-permission') && key === 'dashboard') ? 'is-active' : ''} onClick={() => onScreenChange(key)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    </div>
  );
}
