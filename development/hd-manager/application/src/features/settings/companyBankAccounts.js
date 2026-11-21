export function getCompanyBankAccounts(company = {}) {
  if (Array.isArray(company.companyBankAccounts)) return company.companyBankAccounts;
  if (!company.bankAccountNumber) return [];
  return [{
    id: 'legacy-primary', bankId: company.bankId || '', bankName: company.bankName || '',
    bankAccountName: company.bankAccountName || '', bankAccountNumber: company.bankAccountNumber,
    invoiceQrTemplate: company.invoiceQrTemplate || 'qr_only',
    autoReconcileByOrderCode: company.autoReconcileByOrderCode !== false,
    sepayVirtualAccountNumber: company.sepayVirtualAccountNumber || company.sepayVaAccountNumber || '',
    sepayUseVirtualAccount: Boolean(company.sepayUseVirtualAccount),
  }];
}

export function buildCompanyBankAccountUpdate(company, draft, useForInvoices, {canManageAccounts = true, canManageQr = true} = {}) {
  const accounts = getCompanyBankAccounts(company);
  const primaryId = company.primaryCompanyBankAccountId || accounts[0]?.id;
  if (!canManageAccounts) {
    if (!canManageQr || draft.id !== primaryId) throw new Error('Bạn chưa được cấp quyền sửa tài khoản ngân hàng này.');
    if (!['qr_only', 'compact2', 'compact', 'print'].includes(draft.invoiceQrTemplate)) throw new Error('Mẫu QR chưa hợp lệ.');
    return {invoiceQrTemplate: draft.invoiceQrTemplate};
  }
  const account = { ...draft,
    bankId: String(draft.bankId || '').trim().toUpperCase(), bankName: String(draft.bankName || '').trim(),
    bankAccountName: String(draft.bankAccountName || '').trim().toUpperCase(),
    bankAccountNumber: String(draft.bankAccountNumber || '').replace(/\s/g, ''),
    sepayVirtualAccountNumber: String(draft.sepayVirtualAccountNumber || '').replace(/\s/g, '').toUpperCase(),
    ...(!canManageQr ? {invoiceQrTemplate: accounts.find(item => item.id === draft.id)?.invoiceQrTemplate || 'qr_only'} : {}),
  };
  if (!account.bankId || !account.bankName || !account.bankAccountName || !account.bankAccountNumber) throw new Error('Vui lòng nhập đủ thông tin tài khoản.');
  if (accounts.some(item => item.id !== account.id && String(item.bankId || '').trim().toUpperCase() === account.bankId && String(item.bankAccountNumber || '').replace(/\s/g, '') === account.bankAccountNumber)) throw new Error('Tài khoản ngân hàng này đã có trong danh sách.');
  if (account.sepayUseVirtualAccount && !account.sepayVirtualAccountNumber) throw new Error('Vui lòng nhập số tài khoản VA.');
  const isPrimary = !accounts.length || useForInvoices || primaryId === account.id;
  const next = accounts.some(item => item.id === account.id)
    ? accounts.map(item => item.id === account.id ? account : item) : [...accounts, account];
  const update = { companyBankAccounts: next, primaryCompanyBankAccountId: isPrimary ? account.id : primaryId };
  if (isPrimary) {
    const profile = {...account};
    delete profile.id;
    Object.assign(update, profile);
    if (!canManageQr) delete update.invoiceQrTemplate;
  }
  return update;
}
