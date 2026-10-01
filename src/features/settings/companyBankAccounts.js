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

export function buildCompanyBankAccountUpdate(company, draft, useForInvoices) {
  const accounts = getCompanyBankAccounts(company);
  const account = { ...draft,
    bankId: draft.bankId.trim().toUpperCase(), bankName: draft.bankName.trim(),
    bankAccountName: draft.bankAccountName.trim().toUpperCase(),
    bankAccountNumber: draft.bankAccountNumber.replace(/\s/g, ''),
    sepayVirtualAccountNumber: draft.sepayVirtualAccountNumber.trim().toUpperCase(),
  };
  if (!account.bankId || !account.bankName || !account.bankAccountName || !account.bankAccountNumber) throw new Error('Vui lòng nhập đủ thông tin tài khoản.');
  if (accounts.some(item => item.id !== account.id && item.bankId === account.bankId && item.bankAccountNumber === account.bankAccountNumber)) throw new Error('Tài khoản ngân hàng này đã có trong danh sách.');
  if (account.sepayUseVirtualAccount && !account.sepayVirtualAccountNumber) throw new Error('Vui lòng nhập số tài khoản VA.');
  const primaryId = company.primaryCompanyBankAccountId || accounts[0]?.id;
  const isPrimary = !accounts.length || useForInvoices || primaryId === account.id;
  const next = accounts.some(item => item.id === account.id)
    ? accounts.map(item => item.id === account.id ? account : item) : [...accounts, account];
  const update = { companyBankAccounts: next, primaryCompanyBankAccountId: isPrimary ? account.id : primaryId };
  if (isPrimary) {
    const { id, ...profile } = account;
    Object.assign(update, profile);
  }
  return update;
}
