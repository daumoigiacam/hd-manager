const settingFields = new Set([
  'name', 'displayName', 'companyPhone', 'companyAddress', 'logoUrl', 'logo',
  'productGroups', 'warehouseQuantityUnits', 'warehouseStockVisibilitySettings',
  'floatingQuickActionEnabled', 'mapProvider', 'employeeReviewCriteriaLabels',
  'customerCareReminderEnabled', 'customerCareInactiveDays',
  'attendanceWifiEnabled', 'attendanceWifiSsid', 'attendanceWifiBssid', 'attendanceWifiUpdatedAt',
  'salaryAdvancePercent', 'salaryAdvancePercentByDepartment',
]);

const nativeBankFields = new Set([
  'bankId',
  'bankName',
  'bankAccountName',
  'bankAccountNumber',
]);

const stringValue = (value) => `${value ?? ''}`.trim();

export function hasVpsCompanyBankSettings(input = {}) {
  return Object.keys(input).some((key) => nativeBankFields.has(key));
}

export async function saveVpsCompanyReceivingBankAccount(api, company, input = {}) {
  const bankId = stringValue(input.bankId).toUpperCase();
  const bankName = stringValue(input.bankName);
  const accountName = stringValue(input.bankAccountName).toUpperCase();
  const accountNumber = stringValue(input.bankAccountNumber).replace(/\s+/g, '');
  if (!bankId || !bankName || !accountName || !accountNumber) {
    throw new Error('Vui long nhap du ma ngan hang, ten ngan hang, chu tai khoan va so tai khoan.');
  }
  const code = `CUSTOMER_RECEIVING_${bankId}`.slice(0, 60);
  const page = await api.listFinanceBankAccounts({ page: 1, limit: 100 });
  const existing = page.items.find(
    (item) => `${item?.code || ''}`.trim().toUpperCase() === code,
  );
  const details = { bankName, accountName, accountNumber, status: 'ACTIVE' };
  const bankAccount = existing
    ? await api.updateFinanceBankAccount(existing.id, details)
    : await api.createFinanceBankAccount({
      code,
      ...details,
      isCustomerPaymentDefault: true,
    });
  const defaultBankAccount = bankAccount.isCustomerPaymentDefault === true
    ? bankAccount
    : await api.setFinanceCustomerPaymentDefaultBankAccount(bankAccount.id);
  return {
    ...company,
    bankId,
    bankName: defaultBankAccount.bankName || bankName,
    bankAccountName: defaultBankAccount.accountName || accountName,
    bankAccountNumber: defaultBankAccount.accountNumber || accountNumber,
    vpsCustomerPaymentBankAccountId: defaultBankAccount.id,
  };
}

export async function updateVpsCompanySettings(api, company, input) {
  if (!company?.id || !company.vpsSettingsVersion) {
    throw new Error('Cau hinh cong ty chua tai xong. Vui long tai lai.');
  }
  const settings = {};
  for (const [key, value] of Object.entries(input)) {
    if (JSON.stringify(value) === JSON.stringify(company[key])) continue;
    if (!settingFields.has(key)) {
      throw new Error(`Cau hinh ${key} can contract VPS rieng; chua luu thay doi.`);
    }
    settings[key] = value;
  }
  if (!Object.keys(settings).length) return company;
  const result = await api.updateManagerSettings({ version: company.vpsSettingsVersion, settings });
  if (result.companyId !== company.id) throw new Error('VPS company scope mismatch.');
  return { ...company, ...result.settings, id: company.id, vpsSettingsVersion: result.version };
}
