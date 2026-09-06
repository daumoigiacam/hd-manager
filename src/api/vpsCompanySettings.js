const settingFields = new Set([
  'name', 'displayName', 'companyPhone', 'companyAddress', 'logoUrl', 'logo',
  'productGroups', 'warehouseQuantityUnits', 'warehouseStockVisibilitySettings',
  'floatingQuickActionEnabled', 'mapProvider', 'employeeReviewCriteriaLabels',
  'customerCareReminderEnabled', 'customerCareInactiveDays',
  'attendanceWifiEnabled', 'attendanceWifiSsid', 'attendanceWifiBssid', 'attendanceWifiUpdatedAt',
  'salaryAdvancePercent', 'salaryAdvancePercentByDepartment',
]);

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
