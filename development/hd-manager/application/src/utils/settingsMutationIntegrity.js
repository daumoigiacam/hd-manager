import {payloadFingerprint} from './customerProductAutoSync.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const error = (message, code = 'settings_invalid_patch') => Object.assign(new Error(message), {code});
const invalid = () => { throw error('Cấu hình công ty chưa hợp lệ.'); };
const schemas = new Map();
function fields(names, type, permissions) {
  for (const name of names.split(' ')) schemas.set(name, {type, permissions});
}
const settings = action => [['settings', action]];
fields('name displayName companyPhone companyAddress logoUrl logo', 'string', settings('edit_company_profile'));
fields('bankId bankName bankAccountName bankAccountNumber primaryCompanyBankAccountId sepayVirtualAccountNumber sepayVaAccountNumber sepayVaNumber sepayReceivingAccountNumber bankVirtualAccountNumber virtualBankAccountNumber vaAccountNumber virtualAccountNumber', 'string', settings('manage_bank_accounts'));
fields('companyBankAccounts', 'banks', settings('manage_bank_accounts'));
fields('sepayUseVirtualAccount autoReconcileByOrderCode', 'boolean', settings('manage_bank_accounts'));
fields('invoiceQrTemplate invoiceTemplateId', 'string', settings('manage_payment_qr'));
fields('customerLoyaltyEnabled', 'boolean', settings('manage_loyalty_settings'));
fields('loyaltyEarnMode', 'earnMode', settings('manage_loyalty_settings'));
fields('loyaltyRevenuePercent', 'percent', settings('manage_loyalty_settings'));
fields('loyaltyEarnAmountPerPoint loyaltyRedeemValuePerPoint', 'positive', settings('manage_loyalty_settings'));
fields('loyaltyEligibilityConditions', 'booleanMap', settings('manage_loyalty_settings'));
fields('customerCareReminderEnabled', 'boolean', settings('manage_customer_care_reminders'));
fields('customerCareInactiveDays', 'positiveInteger', settings('manage_customer_care_reminders'));
fields('customerCareRules', 'care', settings('manage_customer_care_reminders'));
fields('warehouseOrderAutoCancelDays', 'nonnegativeInteger', [['settings', 'manage_warehouse_dispatch_settings'], ['settings', 'manage_order_request_auto_cancel']]);
fields('warehouseStockResetAt', 'string', [['warehouse_import', 'edit_inventory_balance']]);
fields('warehouseStockVisibilitySettings', 'map', [['warehouse_import', 'edit_inventory_balance']]);
fields('warehouseQuantityUnits warehouseQtyUnits', 'strings', [['warehouse_import', 'create_warehouse_import'], ['warehouse_import', 'edit_warehouse_import']]);
fields('productGroups', 'strings', [['products', 'create_product'], ['products', 'edit_product'], ['warehouse_import', 'create_warehouse_import']]);
fields('employeeDepartments companyDepartments', 'departments', [['employees', 'edit_employee']]);
fields('salaryAdvancePercent', 'nullablePercent', [['payroll', 'configure_salary_advance_limit']]);
fields('salaryAdvancePercentByDepartment', 'percentMap', [['payroll', 'configure_salary_advance_limit']]);
fields('employeeReviewCriteriaLabels', 'stringMap', [['employee_reviews', 'manage_employee_review_criteria']]);
fields('employeeReviewsEnabled', 'boolean', settings('manage_employee_review_settings'));
fields('attendanceWifiEnabled', 'boolean', settings('manage_attendance_wifi'));
fields('attendanceWifiSsid attendanceWifiBssid attendanceWifiUpdatedAt', 'string', settings('manage_attendance_wifi'));
fields('floatingQuickActionEnabled', 'boolean', settings('manage_quick_action_defaults'));
fields('rolePermissions rolePermissionActions', 'permissionMap', [['role_permissions', 'manage_role_permissions']]);
fields('employeeRolePermissions employeeRolePermissionActions', 'permissionMap', [['role_permissions', 'manage_employee_permission_override']]);
fields('dailyInventorySnapshots', 'map', [['warehouse_import', 'edit_inventory_balance']]);
fields('zaloDispatcherEnabled zaloDispatcherSendInvoicesEnabled zaloDispatcherSendCampaignsEnabled zaloDispatcherPaused zaloInboxBridgeEnabled zaloInboxBridgeClipboardEnabled zaloInboxBridgeAutoProcessEnabled enableAiAutoReply aiAutoReplyDryRun', 'boolean', settings('manage_gemini_api'));
fields('zaloDispatcherMachineId zaloDispatcherMachineName zaloDispatcherHeartbeatAt zaloInboxBridgeMachineId zaloInboxBridgeMachineName zaloInboxBridgeHeartbeatAt', 'string', settings('manage_gemini_api'));
fields('zaloDispatcherDelayMinSec zaloDispatcherDelayMaxSec zaloDispatcherMaxPerHour zaloInboxBridgeScanIntervalSec aiAutoReplyMaxPerGroupPerHour', 'positiveInteger', settings('manage_gemini_api'));
fields('aiAutoReplyStartTime aiAutoReplyEndTime zaloSchedulerDailyTime', 'clock', settings('manage_gemini_api'));
fields('zaloSchedulerMode', 'string', settings('manage_gemini_api'));
fields('zaloSchedulerDelayMinutes zaloSchedulerEditHoldMinutes', 'nonnegativeInteger', settings('manage_gemini_api'));

function assertData(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(assertData); return; }
  if (plain(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid();
      assertData(item);
    }
    return;
  }
  invalid();
}
function valid(value, type) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'clock') return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (type === 'earnMode') return ['fixed', 'revenue_percent'].includes(value);
  if (type === 'nullablePercent' && value === null) return true;
  if (['percent', 'nullablePercent', 'positive', 'positiveInteger', 'nonnegativeInteger'].includes(type)) {
    return typeof value === 'number' && Number.isFinite(value)
      && (type.endsWith('Integer') ? Number.isSafeInteger(value) : true)
      && (type.startsWith('positive') ? value > 0 : value >= 0)
      && (!type.toLowerCase().includes('percent') || value <= 100);
  }
  if (type === 'strings') return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
  if (type === 'departments') return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim()
    || plain(item) && typeof (item.name ?? item.label) === 'string' && (item.name ?? item.label).trim()
      && ['id','createdAt','updatedAt'].every(key => !own(item,key) || typeof item[key] === 'string'));
  if (type === 'banks') return Array.isArray(value) && value.every(item => plain(item)
    && ['id', 'bankId', 'bankName', 'bankAccountName', 'bankAccountNumber'].every(key => typeof item[key] === 'string' && item[key].trim())
    && ['sepayUseVirtualAccount', 'autoReconcileByOrderCode'].every(key => !own(item, key) || typeof item[key] === 'boolean')
    && (!own(item,'invoiceQrTemplate') || typeof item.invoiceQrTemplate === 'string'))
    && new Set(value.map(item => item.id)).size === value.length;
  if (!plain(value)) return false;
  if (type === 'booleanMap') return Object.values(value).every(item => typeof item === 'boolean');
  if (type === 'stringMap') return Object.values(value).every(item => typeof item === 'string');
  if (type === 'percentMap') return Object.values(value).every(item => valid(item, 'nullablePercent'));
  if (type === 'permissionMap') return Object.values(value).every(item => typeof item === 'boolean' || valid(item, 'permissionMap'));
  if (type === 'care') return Object.values(value).every(item => plain(item)
    && (!own(item, 'enabled') || typeof item.enabled === 'boolean')
    && (!own(item, 'inactiveDays') || valid(item.inactiveDays, 'positiveInteger'))
    && (!own(item, 'message') || typeof item.message === 'string')
    && (!own(item, 'holidayDates') || Array.isArray(item.holidayDates) && item.holidayDates.every(date => typeof date === 'string')));
  return true;
}

// Preserve presence, primitive types and nanoseconds. Native SDK Timestamps,
// timestamp wire values and Dates can represent the same instant.
export function canonicalSettingsValue(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) invalid();
    const milliseconds = value.getTime(), seconds = Math.floor(milliseconds / 1000);
    return ['timestamp', seconds, (milliseconds - seconds * 1000) * 1e6];
  }
  if (value && typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds, nanoseconds = value.nanoseconds ?? value._nanoseconds;
    if ((typeof value.toDate === 'function' || plain(value) && (!own(value, 'type') || value.type === 'firestore/timestamp/1.0')
      && Object.keys(value).every(key => ['seconds', 'nanoseconds', '_seconds', '_nanoseconds', 'type'].includes(key)))
      && Number.isSafeInteger(seconds) && Number.isInteger(nanoseconds) && nanoseconds >= 0 && nanoseconds < 1e9) return ['timestamp', seconds, nanoseconds];
    if (Array.isArray(value)) return ['array', value.map(canonicalSettingsValue)];
    if (plain(value)) return ['map', Object.keys(value).sort().map(key => [key, canonicalSettingsValue(value[key])])];
    invalid();
  }
  if (value === null) return ['null'];
  if (['boolean', 'string'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return [typeof value, value];
  invalid();
}
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => own(value, key));
export function assertSettingsScope(isCurrent) {
  if (!isCurrent()) throw error('Phiên hoặc công ty đã thay đổi. Vui lòng mở lại cấu hình.', 'settings_scope_changed');
}

// Restore company business settings, never identity, authorization, billing or
// the specially audited review feature switch. Full backups include those
// authority fields for reference; migrating a backup must not migrate owners.
export function settingsRestorableCompanyPatch(source) {
  if (!plain(source)) invalid();
  const result = {};
  for (const [key,value] of Object.entries(source)) {
    const schema = schemas.get(key);
    if (!schema || ['employeeReviewsEnabled','rolePermissions','rolePermissionActions','employeeRolePermissions','employeeRolePermissionActions'].includes(key)) continue;
    assertData(value);
    if (!valid(value,schema.type)) invalid();
    result[key] = value;
  }
  return result;
}
export function assertSettingsPermissions(keys, context, hasPermission) {
  for (const key of keys) {
    const schema = schemas.get(key);
    if (!schema) throw error(`Không hỗ trợ trường cấu hình: ${key}`);
    if (!schema.permissions.some(([module, action]) => hasPermission(context, module, action))) {
      throw error('Bạn chưa được cấp quyền lưu cấu hình này.', 'permission-denied');
    }
  }
}

export function assertSettingsNestedPermissions(patch,company,context,hasPermission) {
  if (!own(patch,'companyBankAccounts') || hasPermission(context,'settings','manage_payment_qr')) return;
  const previous = company.companyBankAccounts || (company.bankAccountNumber ? [{id:'legacy-primary',invoiceQrTemplate:company.invoiceQrTemplate || 'qr_only'}] : []);
  for (const account of patch.companyBankAccounts) {
    const old = previous.find(row => row.id === account.id);
    const oldTemplate = old?.invoiceQrTemplate || 'qr_only';
    if ((account.invoiceQrTemplate || 'qr_only') !== oldTemplate) throw error('Bạn chưa được cấp quyền chỉnh QR thanh toán.','permission-denied');
  }
}

export async function prepareSettingsMutation({patch, options = {}, company, companyId, actorId, context, hasPermission, normalizers = {}, isCurrent = () => true}) {
  assertSettingsScope(isCurrent);
  if (!plain(patch) || !Object.keys(patch).length || !plain(options)
    || Object.keys(options).some(key => !['clientCommandId', 'clientMutationAt', 'expectedSettings'].includes(key))
    || own(options,'clientCommandId') !== own(options,'clientMutationAt')) invalid();
  const keys = Object.keys(patch);
  assertSettingsPermissions(keys, context, hasPermission);
  if (keys.includes('employeeReviewsEnabled') && keys.length !== 1) throw error('Vui lòng lưu riêng cấu hình Đánh giá.');
  const wifiKeys = ['attendanceWifiEnabled', 'attendanceWifiSsid', 'attendanceWifiBssid', 'attendanceWifiUpdatedAt'];
  if (keys.some(key => wifiKeys.includes(key)) && keys.some(key => !wifiKeys.includes(key))) throw error('Vui lòng lưu riêng cấu hình WiFi.');
  if (!companyId || company?.id !== companyId || !actorId) throw error('Phiên làm việc không hợp lệ.', 'settings_scope_changed');
  const commandId = own(options,'clientCommandId') ? options.clientCommandId : globalThis.crypto.randomUUID();
  const mutationAt = own(options,'clientMutationAt') ? options.clientMutationAt : new Date().toISOString();
  if (typeof commandId !== 'string' || !/^[\w-]{1,160}$/.test(commandId)
    || typeof mutationAt !== 'string' || !Number.isFinite(Date.parse(mutationAt)) || new Date(mutationAt).toISOString() !== mutationAt) invalid();
  const expected = options.expectedSettings;
  if (own(options,'expectedSettings') && (!plain(expected) || Object.keys(expected).length !== keys.length || !keys.every(key => own(expected, key)))) invalid();
  const normalized = {}, guards = {};
  for (const key of keys) {
    const value = patch[key];
    assertData(value);
    if (!valid(value, schemas.get(key).type)) invalid();
    normalized[key] = normalizers[key] ? normalizers[key](value) : typeof value === 'string' ? value.trim() : value;
    assertData(normalized[key]);
    const guard = expected === undefined ? own(company, key) ? {exists:true, value:company[key]} : {exists:false} : expected[key];
    if (!exact(guard, guard?.exists === false ? ['exists'] : ['exists', 'value']) || typeof guard.exists !== 'boolean') invalid();
    if (guard.exists) canonicalSettingsValue(guard.value);
    guards[key] = guard.exists ? {exists:true, value:canonicalSettingsValue(guard.value)} : {exists:false};
  }
  // Clone validated input so callers cannot mutate an in-flight transaction.
  const frozenPatch = JSON.parse(JSON.stringify(normalized));
  assertSettingsNestedPermissions(frozenPatch,company,context,hasPermission);
  const fingerprint = await payloadFingerprint({settings:{companyId, actorId, patch:frozenPatch, mutationAt}});
  assertSettingsScope(isCurrent);
  return {companyId, actorId, keys, patch:frozenPatch, expected:guards, commandId, mutationAt, fingerprint};
}

export async function commitSettingsMutation({plan, db, companyRef, commandRef, employeeRef, runTransaction, isCurrent,
  hasPermission, context, buildPatch = patch => patch}) {
  assertSettingsScope(isCurrent);
  const result = await runTransaction(db, async transaction => {
    assertSettingsScope(isCurrent);
    const snapshot = await transaction.get(companyRef);
    assertSettingsScope(isCurrent);
    if (!snapshot.exists()) throw error('Không tìm thấy công ty.', 'settings_conflict');
    const company = snapshot.data();
    const employeeSnapshot = await transaction.get(employeeRef);
    assertSettingsScope(isCurrent);
    const employee = employeeSnapshot.exists() ? employeeSnapshot.data() : null;
    if (!employee || employee.companyId !== plan.companyId || employee.isArchived === true) throw error('Nhân sự không còn thuộc công ty.', 'permission-denied');
    const liveContext = {...context, company, employee:{...employee,id:plan.actorId}};
    assertSettingsPermissions(plan.keys, liveContext, hasPermission);
    const commandSnapshot = await transaction.get(commandRef);
    assertSettingsScope(isCurrent);
    if (commandSnapshot.exists()) {
      const saved = commandSnapshot.data();
      if (saved.companyId !== plan.companyId || saved.actorId !== plan.actorId || saved.fingerprint !== plan.fingerprint
        || saved.commandId !== plan.commandId || saved.mutationAt !== plan.mutationAt) throw error('Mã lưu đã được dùng cho nội dung khác.', 'settings_command_conflict');
      return {document:company, replay:true};
    }
    assertSettingsNestedPermissions(plan.patch,company,liveContext,hasPermission);
    for (const key of plan.keys) {
      const guard = plan.expected[key];
      if (own(company, key) !== guard.exists || guard.exists && JSON.stringify(canonicalSettingsValue(company[key])) !== JSON.stringify(guard.value)) {
        throw error('Cấu hình đã thay đổi trên máy khác. Vui lòng mở lại trước khi lưu.', 'settings_conflict');
      }
    }
    const patch = buildPatch(plan.patch);
    transaction.update(companyRef, patch);
    transaction.set(commandRef, {companyId:plan.companyId, actorId:plan.actorId, commandId:plan.commandId, fingerprint:plan.fingerprint, mutationAt:plan.mutationAt});
    return {document:{...company,...patch}, replay:false};
  });
  assertSettingsScope(isCurrent);
  return result;
}
