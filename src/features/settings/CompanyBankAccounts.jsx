import { useState } from 'react';
import { Plus, ChevronRight, CreditCard } from 'lucide-react';
import { getCompanyBankAccounts, buildCompanyBankAccountUpdate } from './companyBankAccounts.js';

export default function CompanyBankAccounts({ company, banks, canEdit, onSave, draft, setDraft }) {
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [useForInvoices, setUseForInvoices] = useState(false);
  const accounts = getCompanyBankAccounts(company);
  const primaryId = company.primaryCompanyBankAccountId || accounts[0]?.id;
  const open = account => {
    setStatus('');
    setUseForInvoices(!accounts.length || account?.id === primaryId);
    setDraft(account ? { ...account } : {
      id: crypto.randomUUID(), bankId: '', bankName: '', bankAccountName: '', bankAccountNumber: '',
      invoiceQrTemplate: 'qr_only', autoReconcileByOrderCode: true,
      sepayUseVirtualAccount: false, sepayVirtualAccountNumber: '',
    });
  };
  const field = (key, label, props = {}) => <label className="block text-sm text-gray-700">
    <span className="mb-1 block font-semibold">{label}</span>
    <input {...props} value={draft[key]} onChange={event => setDraft(value => ({ ...value, [key]: event.target.value }))} className="w-full min-w-0 border-0 border-b border-gray-300 bg-white px-1 py-3 outline-none focus:border-emerald-600" />
  </label>;
  if (!draft) return <div data-bank-accounts="list" className="bg-white">
    <div className="flex justify-end border-b border-gray-200 py-2">
      {canEdit && <button type="button" aria-label="Thêm tài khoản ngân hàng" title="Thêm tài khoản ngân hàng" onClick={() => open(null)} className="flex h-11 w-11 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"><Plus size={24} /></button>}
    </div>
    <div className="divide-y divide-gray-300">{accounts.map(account => <button type="button" key={account.id} onClick={() => open(account)} className="flex w-full items-center gap-3 py-4 text-left">
      <CreditCard size={22} className="shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1 break-words"><span className="block text-sm font-semibold">{account.bankName} - {account.bankAccountNumber}</span><span className="block text-xs text-gray-500">{account.bankAccountName}</span>{account.id === primaryId && <span className="text-xs text-emerald-700">Dùng cho hóa đơn</span>}</span>
      <ChevronRight size={18} className="shrink-0" />
    </button>)}</div>
  </div>;
  return <form data-bank-accounts="detail" className="space-y-5 bg-white" onSubmit={async event => {
    event.preventDefault();
    if (saving || !canEdit) return;
    setSaving(true); setStatus('');
    try {
      const result = await onSave(buildCompanyBankAccountUpdate(company, draft, useForInvoices));
      if (!result?.success) throw new Error(result?.message || 'Không thể lưu tài khoản.');
      setStatus('Đã lưu tài khoản ngân hàng.');
    } catch (error) { setStatus(error.message); }
    finally { setSaving(false); }
  }}>
    <fieldset disabled={saving || !canEdit} className="min-w-0 space-y-5">
      {field('bankAccountName', 'Chủ tài khoản', { required: true })}
      {field('bankAccountNumber', 'Số tài khoản', { required: true, inputMode: 'numeric' })}
      <label className="block text-sm font-semibold">Tên ngân hàng
        <select required value={draft.bankId} onChange={event => { const bank = banks.find(item => item.value === event.target.value); setDraft(value => ({ ...value, bankId: bank.value, bankName: bank.label })); }} className="mt-1 w-full border-0 border-b border-gray-300 bg-white py-3 text-sm font-normal">
          <option value="" disabled>Chọn ngân hàng</option>
          {draft.bankId && !banks.some(bank => bank.value === draft.bankId) && <option value={draft.bankId}>{draft.bankName}</option>}
          {banks.map(bank => <option key={bank.value} value={bank.value}>{bank.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">Mẫu QR<select value={draft.invoiceQrTemplate} onChange={event => setDraft(value => ({ ...value, invoiceQrTemplate: event.target.value }))} className="mt-1 w-full border-0 border-b border-gray-300 bg-white py-3 text-sm font-normal"><option value="qr_only">Chỉ mã QR</option><option value="compact2">Compact 2</option><option value="compact">Compact</option><option value="print">Print</option></select></label>
      <label className="block text-sm font-semibold">Nội dung mẫu<input readOnly value="TT HD000001" className="mt-1 w-full border-0 border-b border-gray-300 bg-white py-3 font-normal" /></label>
      <label className="flex items-center justify-between gap-3 text-sm">Tự động đối soát<input type="checkbox" checked={draft.autoReconcileByOrderCode} onChange={event => setDraft(value => ({ ...value, autoReconcileByOrderCode: event.target.checked }))} /></label>
      <label className="flex items-center justify-between gap-3 text-sm">Sử dụng tài khoản VA<input type="checkbox" checked={draft.sepayUseVirtualAccount} onChange={event => setDraft(value => ({ ...value, sepayUseVirtualAccount: event.target.checked }))} /></label>
      {draft.sepayUseVirtualAccount && field('sepayVirtualAccountNumber', 'Số tài khoản VA', { required: true })}
      <label className="flex items-center justify-between gap-3 text-sm">Dùng cho hóa đơn<input type="checkbox" disabled={draft.id === primaryId || !accounts.length} checked={draft.id === primaryId || !accounts.length || useForInvoices} onChange={event => setUseForInvoices(event.target.checked)} /></label>
      {canEdit && <button type="submit" className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu tài khoản'}</button>}
    </fieldset>
    {status && <p role="status" className="text-sm text-gray-700">{status}</p>}
  </form>;
}
