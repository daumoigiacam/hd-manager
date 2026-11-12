import React from 'react';
// Exact existing JSX; parent retains all state, permissions, callbacks and data.
export default function CustomerImportRender({context}) {
const {X,customerImportInputRef,customerImportManagerId,customerImportStatus,handleCustomerImportFileChange,isImportingCustomers,isSales,salesEmployees,setCustomerImportManagerId,setCustomerImportStatus,setShowCustomerImportModal}=context;
return (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-md animate-in zoom-in-95 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg mb-4">Nhập Excel khách hàng</h3>
                <p className="text-xs text-gray-500 mt-1">Cột bắt buộc trong file: <span className="font-bold text-gray-700">Tên Khách hàng</span>, <span className="font-bold text-gray-700">Số điện thoại</span>, <span className="font-bold text-gray-700">Địa chỉ</span>.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCustomerImportModal(false);
                  setCustomerImportStatus('');
                }}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {!isSales && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhân viên phụ trách</label>
                <select
                  value={customerImportManagerId}
                  onChange={(e) => setCustomerImportManagerId(e.target.value)}
                  className="w-full border border-gray-200 p-3 rounded-xl outline-none bg-white text-sm"
                >
                  <option value="">-- Chọn Sales phụ trách --</option>
                  {salesEmployees.map((salesEmployee) => (
                    <option key={salesEmployee.id} value={salesEmployee.id}>{salesEmployee.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase mb-1">Chọn file dữ liệu</p>
                  <p className="text-xs text-emerald-700/80 mt-1">Hỗ trợ <span className="font-bold">.xlsx</span> hoặc <span className="font-bold">.csv</span>.</p>
                </div>
                <button
                  type="button"
                  onClick={() => customerImportInputRef.current?.click()}
                  disabled={isImportingCustomers || (!isSales && !customerImportManagerId)}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isImportingCustomers ? 'Đang nhập...' : 'Chọn file'}
                </button>
              </div>
              <input
                ref={customerImportInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleCustomerImportFileChange}
                className="hidden"
              />
            </div>

            {customerImportStatus && (
              <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                customerImportStatus.startsWith('Đã nhập')
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  : customerImportStatus.startsWith('Không có') || customerImportStatus.startsWith('Thiếu') || customerImportStatus.startsWith('File')
                    ? 'border-amber-100 bg-amber-50 text-amber-700'
                    : 'border-sky-100 bg-sky-50 text-sky-700'
              }`}>
                {customerImportStatus}
              </div>
            )}

            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
              <p className="text-xs font-bold uppercase text-gray-700 mb-1">Mẫu cột Excel</p>
              <p>Tên khách hàng | Số điện thoại | Địa chỉ</p>
              <p className="mt-2 text-[11px] text-gray-400">Có thể thêm cột Sản phẩm cố định nếu muốn. Nếu tên sản phẩm khớp danh mục, app sẽ tự lưu kèm; nếu không có cột này thì vẫn nhập khách bình thường.</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCustomerImportModal(false);
                  setCustomerImportStatus('');
                }}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>);
}
