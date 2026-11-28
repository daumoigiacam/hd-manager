import {useState,useRef} from 'react';
import {captureEmployeePayrollPolicy} from '../../utils/payrollPolicyHistory.js';
import {payrollPolicyReviewSignature} from '../../utils/payrollPolicyCompletion.js';

const labels = {
  position:'Bộ phận chính', primaryPosition:'Vị trí chính', secondaryPositions:'Vị trí kiêm nhiệm', additionalPositions:'Bộ phận kiêm nhiệm', departments:'Các bộ phận',
  startDate:'Ngày bắt đầu làm việc', probationDuration:'Thời gian thử việc', probationUnit:'Đơn vị thử việc', probationRate:'Lương thử việc (%)',
  basicSalary:'Lương cơ bản', salaryMonthDays:'Ngày công chuẩn', supportSalary:'Phụ cấp', responsibilitySalary:'Lương trách nhiệm',
  experienceSalary:'Lương kinh nghiệm mỗi chu kỳ', experienceSalaryPeriod:'Chu kỳ kinh nghiệm', roleSalaryComponents:'Lương kiêm nhiệm', departmentSalaryComponents:'Lương theo bộ phận', salaryByDepartment:'Lương bộ phận',
  commissionRate:'Tỷ lệ hoa hồng', commissionTiers:'Các mốc hoa hồng', commissionPolicy:'Chính sách hoa hồng', commissionBaseMode:'Căn cứ hoa hồng', targetRevenue:'Chỉ tiêu doanh thu',
  salesLeaderId:'Trưởng nhóm', salesManagerId:'Quản lý kinh doanh', parentSalesEmpId:'Nhân sự tuyến trên', managerEmpId:'Người quản lý',
  salesLeaderCommissionPercent:'Hoa hồng trưởng nhóm (%)', leaderCommissionPercent:'Hoa hồng tuyến trên (%)', managerCommissionPercent:'Hoa hồng quản lý (%)',
  overtimeRate:'Lương tăng ca mỗi giờ', latePenaltyRate:'Mức phạt đi muộn', latePenaltyTiers:'Các mốc phạt đi muộn',
  autoEarlyOvertimeEnabled:'Tính tăng ca đến sớm', autoLateCheckoutOvertimeEnabled:'Tính tăng ca sau ca',
  shiftName:'Tên ca', shiftStart:'Giờ vào ca', shiftEnd:'Giờ kết thúc ca', shiftIsOvernight:'Ca qua đêm', graceMinutes:'Phút được phép đi muộn',
  minExcessRevenue:'Phần vượt từ', rate:'Tỷ lệ', from:'Từ', to:'Đến', fixedBonus:'Thưởng cố định', amount:'Số tiền', minutes:'Phút',
  method:'Phương pháp', revenueBasis:'Căn cứ doanh thu', effectiveFrom:'Áp dụng từ', effectiveTo:'Kết thúc', enabled:'Sử dụng', status:'Trạng thái', cycle:'Chu kỳ'
};
const words = {months:'Tháng',years:'Năm',days:'Ngày',above_target:'Phần vượt chỉ tiêu',total_revenue:'Toàn bộ doanh thu',
  fixed:'Cố định',above_kpi:'Vượt KPI',progressive:'Lũy tiến',retrospective:'Theo bậc đạt được',recognized_net:'Doanh thu ghi nhận',collected:'Thực thu',active:'Đang áp dụng',paused:'Tạm dừng'};
const display = (value, key, employees) => {
  if (value === null || value === undefined || value === '') return key === 'to' ? 'Không giới hạn' : 'Chưa khai báo';
  if (typeof value === 'boolean') return value ? 'Bật' : 'Tắt';
  if (['commissionRate','rate'].includes(key)) return `${Number((Number(value)*100).toFixed(6)).toLocaleString('vi-VN')}%`;
  if (/EmpId$|LeaderId$|ManagerId$/.test(key)) return employees.find(emp => emp.id === value)?.name || value;
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  if (Array.isArray(value)) return value.length ? value.map(item => display(item, '', employees)).join('; ') : 'Không có';
  if (typeof value === 'object') return Object.entries(value).filter(([k]) => !['schemaVersion','policyId','revision','id'].includes(k))
    .map(([k,v]) => `${labels[k] || k}: ${display(v,k,employees)}`).join(' · ');
  return words[value] || value;
};

export default function PayrollPolicyCompletion({employee, employees = [], monthKey, onSave, onCancel}) {
  // Keep a detached reviewed version; realtime updates must not silently replace
  // the values under an already checked confirmation.
  const [reviewed] = useState(() => structuredClone(employee));
  const [reason,setReason] = useState('');
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const saving = useRef(false);
  const save = async () => {
    if (saving.current || busy || !confirmed || !reason.trim()) return;
    saving.current = true;
    setBusy(true);setError('');
    try {
      const result = await onSave({employeeId:reviewed.id,monthKey,expectedSignature:payrollPolicyReviewSignature(reviewed),confirmed,reason});
      if (result?.success === false) throw Error(result.message || 'Chưa lưu được chính sách.');
      onCancel();
    } catch (failure) {setError(failure.message || 'Chưa lưu được chính sách.');}
    finally {saving.current=false;setBusy(false);}
  };
  return <section className="rounded-xl border border-blue-200 bg-white p-4" aria-label={`Rà soát chính sách ${reviewed.name}`}>
    <h3 className="font-bold text-slate-900">Chính sách lương {reviewed.name} — {monthKey}</h3>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">Dưới đây là thông số từ hồ sơ hiện tại. Chỉ xác nhận nếu đúng với kỳ đang chốt. Bản bổ sung chỉ có hiệu lực trong tháng này; hồ sơ hiện tại và kỳ đã khóa được giữ nguyên. Nếu thông số chưa đúng, hãy sửa hồ sơ nhân sự rồi mở lại phần rà soát.</p>
    <dl className="mt-3 space-y-2 text-xs">{Object.entries(captureEmployeePayrollPolicy(reviewed)).map(([key,value]) => <div key={key} className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-2"><dt className="text-slate-500">{labels[key] || key}</dt><dd className="break-words text-right font-medium text-slate-800">{display(value,key,employees)}</dd></div>)}</dl>
    <label className="mt-3 block text-xs font-semibold">Căn cứ xác nhận<input aria-label="Căn cứ xác nhận chính sách" value={reason} disabled={busy} onChange={event=>setReason(event.target.value)} maxLength={500} placeholder="Ví dụ: Đối chiếu hợp đồng và mức lương tháng này" className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 p-2 font-normal" /></label>
    <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />Tôi đã rà soát và xác nhận các thông số trên đúng với kỳ {monthKey}.</label>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    <div className="mt-3 flex gap-2"><button type="button" onClick={onCancel} disabled={busy} className="min-h-11 flex-1 rounded-lg bg-slate-100 text-sm">Quay lại</button><button type="button" onClick={save} disabled={busy || !confirmed || !reason.trim()} className="min-h-11 flex-1 rounded-lg bg-blue-600 px-2 text-sm font-semibold text-white disabled:bg-blue-300">{busy ? 'Đang lưu...' : 'Lưu chính sách kỳ này'}</button></div>
  </section>;
}
