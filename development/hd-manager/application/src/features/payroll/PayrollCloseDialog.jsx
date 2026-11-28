import { useState, useEffect } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, LockKeyhole } from 'lucide-react';
import { getPayrollMonthRange, summarizePayrollWorkspace } from './payrollWorkspaceModel.js';
import { useModalScrollLock } from '../../layout/useModalScrollLock.js';
import PayrollPolicyCompletion from './PayrollPolicyCompletion.jsx';

const money = value => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;

export default function PayrollCloseDialog({ monthKey, closeDateLabel, rows, eligible, busy, status, onCancel, onConfirm,
  blockers = [], missingPolicies = [], employees = [], onCompletePolicy }) {
  useModalScrollLock(true);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  useEffect(() => setConfirmed(false), [rows,eligible,blockers]);
  const summary = summarizePayrollWorkspace(rows);
  const range = getPayrollMonthRange(monthKey);

  return <div className="hd-modal-layer fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" data-hd-modal-root="true" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="payroll-close-title" className="hd-modal-surface flex h-full w-full max-w-md flex-col overflow-hidden bg-[#f5f7fb] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
      <header className="flex min-h-16 items-center gap-3 bg-gradient-to-r from-blue-700 to-blue-600 px-4 text-white">
        <button type="button" onClick={onCancel} disabled={busy} aria-label="Quay lại bảng lương" className="flex h-10 w-10 shrink-0 items-center justify-center"><ChevronLeft size={22} /></button>
        <h2 id="payroll-close-title" className="min-w-0 text-base font-bold">Chốt lương {range?.label.toLocaleLowerCase('vi-VN')}</h2>
      </header>
      <div className="hd-modal-body min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {reviewing ? <PayrollPolicyCompletion key={reviewing.id} employee={reviewing} employees={employees} monthKey={monthKey} onSave={async payload => {
          const result = await onCompletePolicy(payload);
          if (result?.success !== false) setConfirmed(false);
          return result;
        }} onCancel={() => setReviewing(null)} /> : <>
        <div className="flex gap-3 rounded-xl border border-blue-100 bg-white p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"><CalendarDays size={19} /></span>
          <div><p className="text-sm font-bold text-slate-900">Chốt lương vào ngày {closeDateLabel}</p><p className="mt-1 text-xs leading-relaxed text-slate-600">Sau khi chốt, dữ liệu kỳ này được khóa và lưu lịch sử. Khoản lương âm sẽ tự chuyển sang tháng sau.</p></div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Tổng hợp trước khi chốt</h3>
          {[
            ['Tổng nhân viên', summary.employeeCount],
            ['Tổng ngày công', Number(summary.workDays).toLocaleString('vi-VN')],
            ['Tổng chi phí lương', money(summary.payable)],
            ['Nhân viên nhận đủ', summary.readyCount],
            ['Nhân viên có ứng kỳ sau', summary.carryCount],
            ['Tổng chuyển kỳ sau', money(summary.carryForward)]
          ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 text-sm last:border-0"><span className="text-slate-600">{label}</span><strong className="text-right text-slate-900">{value}</strong></div>)}
        </div>
        {summary.carryCount > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="shrink-0" size={17} /><p>{summary.carryCount} nhân viên có dư nợ {money(summary.carryForward)}. Khoản này sẽ được ghi trong giao dịch chuyển kỳ khi chốt thành công.</p></div>}
        {summary.carryCount > 0 && <details className="rounded-xl bg-white p-4 text-xs"><summary className="cursor-pointer font-semibold">Chi tiết chuyển kỳ theo nhân viên</summary>{rows.filter(row => Number(row.details?.endingDebt) > 0).map(row => <div key={row.emp.id} className="mt-3 border-t border-slate-100 pt-2"><p className="font-semibold">{row.emp.name}</p><p>Dư nợ đầu kỳ: {money(row.details.openingDebt)} · Công nợ khách hàng tính kỳ này: {money(row.details.badDebt)} · Dư nợ chuyển: {money(row.details.endingDebt)}</p></div>)}</details>}
        {blockers.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900" aria-label="Cần hoàn thiện trước khi chốt"><h3 className="font-bold">Cần hoàn thiện trước khi chốt</h3><ul className="mt-2 space-y-2">{blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>{missingPolicies.map(employee => <div key={employee.id} className="mt-3 flex items-center justify-between gap-2 border-t border-amber-200 pt-2"><span>{employee.name}</span>{onCompletePolicy ? <button type="button" onClick={() => setReviewing(employee)} disabled={busy} className="min-h-10 shrink-0 rounded-lg bg-white px-3 font-semibold text-blue-700">Rà soát chính sách</button> : <span>Người có quyền sửa chính sách lương cần bổ sung.</span>}</div>)}</section>}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-4 text-sm text-slate-700 shadow-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 h-5 w-5 accent-blue-600" /><span>Tôi xác nhận đã kiểm tra và chốt lương {range?.label.toLocaleLowerCase('vi-VN')}. Sau khi chốt, dữ liệu không thể chỉnh sửa trực tiếp.</span></label>
        {status && !status.startsWith('Đang lưu') && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-700">{status}</p>}
        </>}
      </div>
      <footer className="hd-modal-actions border-t border-slate-100 bg-white p-4">
        <button type="button" disabled={!confirmed || !eligible || busy || Boolean(reviewing)} onClick={onConfirm} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300"><LockKeyhole size={17} /> {busy ? 'Đang chốt...' : 'Xác nhận chốt lương'}</button>
        <p className="mt-2 text-center text-xs text-slate-500">Ngày chốt được xác minh bằng thời gian máy chủ.</p>
      </footer>
    </section>
  </div>;
}
