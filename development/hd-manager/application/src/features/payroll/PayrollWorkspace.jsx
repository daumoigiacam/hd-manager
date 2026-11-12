import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Banknote, CalendarDays, CheckCircle2, ChevronLeft,
  ChevronRight, Clock3, Gift, LockKeyhole,
  ShieldCheck, UsersRound, Wallet
} from 'lucide-react';
import {
  getPayrollCarryoverRows, getPayrollEmployeeState, getPayrollMonthRange, shiftPayrollMonth,
  summarizePayrollWorkspace
} from './payrollWorkspaceModel.js';

const money = value => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;
const stateLabels = { ready: 'Sẽ nhận đủ', carry: 'Có ứng kỳ sau', review: 'Cần kiểm tra' };
const stateStyles = {
  ready: 'bg-emerald-50 text-emerald-700',
  carry: 'bg-amber-50 text-amber-700',
  review: 'bg-rose-50 text-rose-700'
};
const closedAtLabel = period => {
  const value = period?.closedAtServer || period?.lockedAt;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value || '');
  return Number.isNaN(date.getTime()) ? 'Đã chốt' : date.toLocaleString('vi-VN');
};

function MonthControl({ monthKey, onChange, locked, compact = false }) {
  const range = getPayrollMonthRange(monthKey);
  if (!range) return null;
  if (compact) return <div className="flex min-w-0 flex-col justify-center rounded-lg border border-slate-100 bg-white p-2 shadow-sm" aria-label="Chọn tháng lương">
    <div className="flex items-center justify-between">
      <button type="button" aria-label="Tháng trước" onClick={() => onChange(shiftPayrollMonth(monthKey, -1))} className="flex h-10 w-8 shrink-0 items-center justify-center text-slate-600"><ChevronLeft size={18} /></button>
      <p className="min-w-0 text-center text-xs font-bold text-slate-900">{monthKey.slice(5)}/{monthKey.slice(0, 4)}</p>
      <button type="button" aria-label="Tháng sau" onClick={() => onChange(shiftPayrollMonth(monthKey, 1))} className="flex h-10 w-8 shrink-0 items-center justify-center text-slate-600"><ChevronRight size={18} /></button>
    </div>
    <p className="text-center text-[10px] leading-relaxed text-slate-500">{range.firstLabel}<br />{range.lastLabel}</p>
  </div>;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <button type="button" className="flex h-10 w-9 shrink-0 items-center justify-center text-slate-600" aria-label="Tháng trước" onClick={() => onChange(shiftPayrollMonth(monthKey, -1))}><ChevronLeft size={20} /></button>
      <div className="min-w-0 flex-1 text-center">
        <p className="text-base font-bold text-slate-900">{range.label}</p>
        <p className="text-xs text-slate-500">{range.firstLabel} - {range.lastLabel}</p>
      </div>
      <button type="button" className="flex h-10 w-9 shrink-0 items-center justify-center text-slate-600" aria-label="Tháng sau" onClick={() => onChange(shiftPayrollMonth(monthKey, 1))}><ChevronRight size={20} /></button>
      <span className={`hidden shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold sm:inline-flex ${locked ? stateStyles.ready : stateStyles.carry}`}>{locked ? 'Đã chốt' : 'Chưa chốt'}</span>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone = 'blue' }) {
  const colors = { blue: 'text-blue-600 bg-blue-50', green: 'text-emerald-600 bg-emerald-50', orange: 'text-orange-600 bg-orange-50', red: 'text-red-600 bg-red-50', violet: 'text-violet-600 bg-violet-50' };
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-2 shadow-sm" data-payroll-metric>
      <div className="flex h-6 items-center gap-1">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${colors[tone]}`}><Icon size={16} aria-hidden="true" /></span>
        <p className="whitespace-nowrap text-[11px] font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-2 flex min-h-8 items-center justify-center whitespace-nowrap text-center font-bold tabular-nums text-slate-900" style={{ fontSize: String(value).length > 17 ? '0.625rem' : String(value).length > 12 ? '0.75rem' : '1rem' }}>{value}</p>
    </div>
  );
}

export default function PayrollWorkspace({
  screen, onScreenChange, rows, monthKey, onMonthChange, isLocked, lockedPeriod,
  periods, carryovers, employees, companyId, canManage, canViewCompany, canClose, closeDateLabel, onCloseRequest,
  onEmployeeOpen, selectedEmployeeId, onOpenAdvance, searchText = '', filterOpen = false
}) {
  const [listTab, setListTab] = useState('all');
  const [department, setDepartment] = useState('all');
  const [detailTab, setDetailTab] = useState('overview');
  const summary = useMemo(() => summarizePayrollWorkspace(rows), [rows]);
  const totalPayLabel = money(summary.payable);
  const range = getPayrollMonthRange(monthKey);
  const selectedRow = rows.find(row => row.emp?.id === selectedEmployeeId);
  const departments = [...new Set(rows.map(row => `${row.emp?.department || row.emp?.position || ''}`.trim()).filter(Boolean))];
  const listRows = rows.filter(row => {
    const state = getPayrollEmployeeState(row);
    const query = searchText.trim().toLocaleLowerCase('vi-VN');
    const group = `${row.emp?.department || row.emp?.position || ''}`.trim();
    return (listTab === 'all' || listTab === state)
      && (department === 'all' || group === department)
      && (!query || `${row.emp?.name || ''} ${group}`.toLocaleLowerCase('vi-VN').includes(query));
  });
  const history = (periods || [])
    .filter(period => !period.isArchived && `${period.companyId || ''}` === `${companyId || ''}` && ['LOCKED', 'ADJUSTED'].includes(`${period.status || ''}`.toUpperCase()))
    .sort((a, b) => `${b.monthKey || ''}`.localeCompare(`${a.monthKey || ''}`));
  const previousPeriod = history.find(period => period.monthKey === shiftPayrollMonth(monthKey, -1));
  const previousPayable = Number(previousPeriod?.totals?.totalSalary);
  const changePercent = canViewCompany && Number.isFinite(previousPayable) && previousPayable > 0
    ? (summary.payable - previousPayable) * 100 / previousPayable
    : null;
  const carryoverRows = getPayrollCarryoverRows({ carryovers, rows, employees, companyId, monthKey, isLocked });

  if (screen === 'carryover') return (
    <section className="space-y-3" data-payroll-screen="carryover">
      <button type="button" onClick={() => onScreenChange('overview')} className="inline-flex min-h-10 items-center gap-1 text-base font-bold text-slate-900"><ChevronLeft size={20} /> Ứng kỳ sau</button>
      <MonthControl monthKey={monthKey} onChange={onMonthChange} locked={isLocked} />
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">{isLocked ? 'Đã ghi nhận chuyển kỳ' : 'Dự kiến chuyển kỳ khi chốt'}</p>
        <p className="mt-1 text-2xl font-bold text-amber-700">{money(carryoverRows.reduce((total, item) => total + item.amount, 0))}</p>
        <p className="mt-1 text-xs text-slate-500">{carryoverRows.length} nhân viên</p>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl bg-white px-4 shadow-sm">
        {carryoverRows.map(item => <div key={item.id} className="py-4 text-sm">
          <div className="flex items-start justify-between gap-3"><strong className="min-w-0 text-slate-900">{item.employeeName}</strong><strong className="shrink-0 text-amber-700">{money(item.amount)}</strong></div>
          <p className="mt-1 text-xs text-slate-500">Lương âm {getPayrollMonthRange(item.sourceMonthKey)?.label} · Áp dụng {getPayrollMonthRange(item.targetMonthKey)?.label}</p>
          <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'applied' ? stateStyles.ready : item.status === 'cancelled' ? stateStyles.review : stateStyles.carry}`}>{item.status === 'applied' ? 'Đã áp dụng' : item.status === 'cancelled' ? 'Đã hủy' : item.status === 'pending_close' ? 'Chờ chốt' : 'Chưa xác nhận áp dụng'}</span>
        </div>)}
        {carryoverRows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Không có khoản chuyển kỳ.</p>}
      </div>
    </section>
  );

  if (screen === 'list') return (
    <section className="space-y-3" data-payroll-screen="employees">
      <MonthControl monthKey={monthKey} onChange={onMonthChange} locked={isLocked} />
      {filterOpen && <select aria-label="Bộ phận" value={department} onChange={event => setDepartment(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">Tất cả bộ phận</option>{departments.map(value => <option key={value} value={value}>{value}</option>)}</select>}
      <div className="hd-payroll-tabs flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Tình trạng lương">
        {[
          ['all', 'Tất cả', summary.employeeCount], ['ready', 'Sẽ nhận đủ', summary.readyCount],
          ['carry', 'Có ứng', summary.carryCount], ['review', 'Cần kiểm tra', summary.reviewCount]
        ].map(([key, label, count]) => <button key={key} role="tab" aria-selected={listTab === key} onClick={() => setListTab(key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${listTab === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>{label} ({count})</button>)}
      </div>
      <div className="divide-y divide-slate-100 rounded-xl bg-white px-3 shadow-sm">
        {listRows.map(row => {
          const state = getPayrollEmployeeState(row);
          const debt = Number(row.details?.endingDebt || 0);
          return <button type="button" key={row.emp.id} onClick={() => { setDetailTab('overview'); onEmployeeOpen(row.emp.id); }} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{`${row.emp?.name || '?'}`.trim().charAt(0).toLocaleUpperCase('vi-VN')}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{row.emp?.name || 'Nhân viên'}</span><span className="block truncate text-xs text-slate-500">{row.emp?.position || row.emp?.department || 'Nhân sự'}</span></span>
            <span className="min-w-0 shrink-0 text-right"><span className={`block rounded-full px-2 py-1 text-[10px] font-semibold ${stateStyles[state]}`}>{stateLabels[state]}</span><span className={`mt-1 block text-xs font-bold ${debt ? 'text-red-600' : 'text-slate-900'}`}>{debt ? `-${money(debt)}` : money(row.details?.netSalary)}</span></span>
            <ChevronRight className="shrink-0 text-slate-400" size={16} />
          </button>;
        })}
        {listRows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Không có nhân viên phù hợp.</p>}
      </div>
    </section>
  );

  if (screen === 'detail') {
    if (!selectedRow) return <button type="button" onClick={() => onScreenChange('list')} className="inline-flex items-center gap-1 text-blue-700"><ChevronLeft size={18} /> Quay lại danh sách</button>;
    const details = selectedRow.details || {};
    const state = getPayrollEmployeeState(selectedRow);
    const debt = Number(details.endingDebt || 0);
    const incomeRows = [
      ['Lương cơ bản', details.baseSalaryCalc], ['Phụ cấp', Number(details.supportSalary || 0) + Number(details.responsibilitySalary || 0) + Number(details.roleSalary || 0) + Number(details.experienceSalary || 0)],
      ['Hoa hồng', details.commission], ['Thưởng', details.totalBonus], ['Lương đánh giá', details.evaluationBonus], ['Tăng ca', details.overtimePay]
    ];
    const deductionRows = [
      ['Tạm ứng', details.totalAdvance], ['Phạt', details.totalPenalty], ['Mua hàng công ty', details.totalEmployeePurchase],
      ['Công nợ khách hàng', details.badDebt], ['Ứng kỳ trước đã trừ', details.openingDebtApplied]
    ];
    return <section className="space-y-3" data-payroll-screen="detail">
      <div className="hd-payroll-tabs flex gap-1 overflow-x-auto" role="tablist" aria-label="Chi tiết lương">{[['overview', 'Tổng quan'], ['attendance', 'Ngày công'], ['allowance', 'Phụ cấp'], ['adjustments', 'Thưởng/Phạt']].map(([key, label]) => <button role="tab" aria-selected={detailTab === key} key={key} onClick={() => setDetailTab(key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${detailTab === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>{label}</button>)}</div>
        <div className="grid grid-cols-2 items-stretch gap-2" data-payroll-detail-summary>
          <div className="min-w-0 bg-white p-3"><p className="text-sm font-semibold">Tổng lương thực nhận</p><p className="mt-2 break-words text-lg font-bold">{debt ? `-${money(debt)}` : money(details.netSalary)}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${stateStyles[state]}`}>{stateLabels[state]}</span></div>
          <MonthControl monthKey={monthKey} onChange={onMonthChange} locked={isLocked} compact />
        </div>
      {detailTab === 'overview' && <>
        <div className="bg-white p-4"><div className="mt-3 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-3 text-sm"><div className="min-w-0 pr-2"><p className="text-xs text-slate-500">Tổng thu nhập</p><strong className="mt-1 block break-words text-emerald-700">{money(details.grossSalary)}</strong></div><div className="min-w-0 pl-2"><p className="text-xs text-slate-500">Tổng khấu trừ</p><strong className="mt-1 block break-words text-red-600">{money(details.deductionTotal)}</strong></div></div></div>
        <div className="rounded-xl bg-white p-4 shadow-sm"><h3 className="mb-2 text-sm font-bold text-slate-900">Chi tiết thu nhập</h3>{incomeRows.map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-slate-50 py-2 text-sm"><span className="text-slate-600">{label}</span><strong className="text-right text-slate-900">{money(value)}</strong></div>)}</div>
        <div className="rounded-xl bg-white p-4 shadow-sm"><h3 className="mb-2 text-sm font-bold text-slate-900">Chi tiết khấu trừ</h3>{deductionRows.map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-slate-50 py-2 text-sm"><span className="text-slate-600">{label}</span><strong className="text-right text-slate-900">{money(value)}</strong></div>)}</div>
        {debt > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Lương kỳ này còn âm</p><p className="mt-1">Chuyển sang {getPayrollMonthRange(shiftPayrollMonth(monthKey, 1))?.label}: <strong>{money(debt)}</strong></p><p className="mt-1 text-xs">Khoản chuyển kỳ được ghi khi chốt lương và chỉ trừ một lần ở kỳ kế tiếp.</p></div>}
      </>}
      {detailTab === 'attendance' && <div className="rounded-xl bg-white p-4 shadow-sm"><h3 className="font-bold text-slate-900">Ngày công</h3><p className="mt-1 text-2xl font-bold text-blue-700">{Number(details.workDays || 0).toLocaleString('vi-VN')}</p><p className="mt-3 text-sm text-slate-600">Chính thức: {details.workDaysOfficial || 0} · Thử việc: {details.workDaysProbation || 0}</p><p className="mt-2 text-sm text-slate-600">Tăng ca: {Number(details.approvedOvertimeHours || 0) + Number(details.automaticOvertimeHours || 0)} giờ · {money(details.overtimePay)}</p><p className="mt-2 text-xs text-slate-500">{(details.attendanceEntries || []).length} bản ghi từ module Chấm công.</p></div>}
      {detailTab === 'allowance' && <div className="rounded-xl bg-white p-4 shadow-sm"><h3 className="mb-2 font-bold text-slate-900">Phụ cấp và lương bổ sung</h3>{[['Hỗ trợ', details.supportSalary], ['Trách nhiệm', details.responsibilitySalary], ['Kiêm nhiệm', details.roleSalary], ['Kinh nghiệm', details.experienceSalary]].map(([label, value]) => <div key={label} className="flex justify-between border-b border-slate-50 py-2 text-sm"><span>{label}</span><strong>{money(value)}</strong></div>)}{(details.roleSalaryRows || []).map(row => <div key={row.id || row.position} className="flex justify-between gap-2 border-b border-slate-50 py-2 text-sm"><span>{row.position}{row.workDays != null && ` · ${row.workDays} ngày công`}</span><strong>{money(row.calculatedAmount)}</strong></div>)}</div>}
      {detailTab === 'adjustments' && <div className="rounded-xl bg-white p-4 shadow-sm"><h3 className="mb-2 font-bold text-slate-900">Thưởng, phạt và tạm ứng</h3>{[['Thưởng', details.totalBonus], ['Thưởng đánh giá', details.evaluationBonus], ['Phạt', details.totalPenalty], ['Tạm ứng', details.totalAdvance], ['Công nợ chuyển kỳ', details.endingDebt]].map(([label, value]) => <div key={label} className="flex justify-between border-b border-slate-50 py-2 text-sm"><span>{label}</span><strong>{money(value)}</strong></div>)}{onOpenAdvance && !isLocked && <button type="button" onClick={() => onOpenAdvance(selectedRow.emp.id)} className="mt-3 min-h-10 w-full rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white">Tạo lệnh ứng</button>}</div>}
    </section>;
  }

  if (screen === 'history') return <section className="space-y-3" data-payroll-screen="history"><button type="button" onClick={() => onScreenChange('overview')} className="inline-flex min-h-10 items-center gap-1 text-base font-bold text-slate-900"><ChevronLeft size={20} /> Lịch sử chốt lương</button><div className="divide-y divide-slate-100 rounded-xl bg-white px-4 shadow-sm">{history.map(period => <button key={period.id} type="button" onClick={() => { onMonthChange(period.monthKey); onScreenChange('overview'); }} className="flex min-h-20 w-full items-center gap-3 py-3 text-left"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><LockKeyhole size={18} /></span><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{getPayrollMonthRange(period.monthKey)?.label || period.monthKey}</strong><span className="block text-xs text-slate-500">{closedAtLabel(period)} · {period.lockedByName || 'Hệ thống'}</span><span className="block text-xs text-slate-500">{period.employeeCount || 0} nhân viên · Chuyển kỳ {money(period.totalEndingDebt)}</span></span><span className="shrink-0 text-right text-xs font-bold text-blue-700">{money(period.totals?.totalSalary)}<ChevronRight className="ml-auto text-slate-400" size={16} /></span></button>)}{history.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Chưa có kỳ lương đã chốt.</p>}</div></section>;

  return <section className="space-y-3" data-payroll-screen="overview">
    <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 p-3 text-white shadow-md" data-payroll-total>
      <div className="flex min-h-7 items-center gap-2">
        <Wallet className="shrink-0 text-blue-100" size={20} aria-hidden="true" />
        <p className="shrink-0 text-sm font-medium text-blue-100">{canViewCompany ? 'Tổng lương' : 'Lương thực nhận'}</p>
        <p className="min-w-0 flex-1 whitespace-nowrap text-right font-bold tabular-nums" style={{ fontSize: totalPayLabel.length > 17 ? '0.75rem' : totalPayLabel.length > 13 ? '0.875rem' : '1.125rem' }}>{totalPayLabel}</p>
      </div>
      {changePercent !== null && <p className="mt-1 text-xs font-semibold text-white">{changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}% so với tháng trước</p>}
    </div>
    <MonthControl monthKey={monthKey} onChange={onMonthChange} locked={isLocked} />
    <div className="grid grid-cols-2 gap-2">
      <Metric icon={UsersRound} label="Tổng nhân viên" value={summary.employeeCount} />
      <Metric icon={CalendarDays} label="Tổng ngày công" value={Number(summary.workDays).toLocaleString('vi-VN')} tone="green" />
      <Metric icon={Wallet} label="Tổng lương cơ bản" value={money(summary.baseSalary)} tone="violet" />
      <Metric icon={ShieldCheck} label="Tổng phụ cấp" value={money(summary.allowances)} tone="blue" />
      <Metric icon={Gift} label="Tổng thưởng" value={money(summary.bonus)} tone="orange" />
      <Metric icon={AlertTriangle} label="Tổng phạt" value={money(summary.penalty)} tone="red" />
      <Metric icon={Banknote} label="Tổng ứng" value={money(summary.totalAdvance)} tone="orange" />
      <Metric icon={Wallet} label="Tổng khấu trừ" value={money(summary.totalDeductions)} tone="red" />
    </div>
    <div className="rounded-xl bg-white p-4 shadow-sm"><h3 className="mb-2 text-sm font-bold text-slate-900">Tình trạng lương tháng này</h3>{[['ready', summary.readyCount, CheckCircle2], ['carry', summary.carryCount, Clock3], ['review', summary.reviewCount, AlertTriangle]].map(([state, count, Icon]) => <button key={state} type="button" onClick={() => { setListTab(state); onScreenChange('list'); }} className="flex min-h-12 w-full items-center gap-3 border-b border-slate-100 text-left last:border-0"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${stateStyles[state]}`}><Icon size={16} /></span><span className="min-w-0 flex-1 text-xs text-slate-700"><strong className="block text-slate-900">{stateLabels[state]}</strong>{count} nhân viên</span><span className="text-xs font-bold text-slate-500">{summary.employeeCount ? (count * 100 / summary.employeeCount).toFixed(1) : '0.0'}%</span></button>)}</div>
    {summary.carryForward > 0 && <button type="button" onClick={() => onScreenChange('carryover')} className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm font-semibold text-amber-900"><span>Cần chuyển kỳ sau ({summary.carryCount})</span><strong>{money(summary.carryForward)}</strong></button>}
    <button type="button" onClick={() => { setListTab('all'); onScreenChange('list'); }} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-blue-100 bg-white px-4 text-sm font-semibold text-blue-700">Danh sách nhân viên <ArrowRight size={18} /></button>
{canManage && (isLocked ? <p className="text-center text-sm font-semibold text-emerald-700">Đã chốt ngày {lockedPeriod?.lockedAt ? new Date(lockedPeriod.lockedAt).toLocaleDateString('vi-VN') : closeDateLabel}</p> : <><button type="button" disabled={!canClose} onClick={onCloseRequest} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300"><LockKeyhole size={17} /> Chốt lương {range?.label.toLocaleLowerCase('vi-VN')}</button><p className="text-center text-xs text-slate-500">Có thể chốt từ ngày cuối tháng ({closeDateLabel})</p></>)}
  </section>;
}
