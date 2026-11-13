import React from 'react';

// Navigation needs only the authenticated permission context, never report data.
const actions = [
  ['order_requests', 'Đặt hàng'], ['orders', 'Đơn hàng'],
  ['warehouse_dispatch', 'Xuất kho'], ['warehouse_import', 'Nhập kho'],
  ['customers', 'Khách hàng'], ['products', 'Kho sản phẩm'],
  ['finance', 'Thu chi'], ['company_attendance', 'Chấm công'],
  ['payroll', 'Bảng lương'],
];
export default function HomeFunctionLauncher({ canAccess, onNavigate }) {
  const available = actions.filter(([id]) => canAccess(id));
  return <section aria-label="Chức năng làm việc" data-hd-home-functions className="p-4">
    <h2 className="mb-3 text-lg font-bold text-slate-900">Bạn muốn làm gì?</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {available.map(([id, label]) => <button key={id} type="button"
        className="rounded-xl border border-slate-200 bg-white p-4 text-left font-semibold text-slate-800 shadow-sm active:bg-blue-50"
        onClick={() => { if (canAccess(id)) onNavigate(id); }}>{label}</button>)}
      {canAccess('more') && <button type="button" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-left font-semibold text-blue-800"
        onClick={() => { if (canAccess('more')) onNavigate('more'); }}>Tất cả chức năng</button>}
    </div>
  </section>;
}
