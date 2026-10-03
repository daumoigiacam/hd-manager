const { getShiftWindow, matchesCompanyWifi } = require('./attendanceWifi');

const deny = message => { throw Object.assign(new Error(message), { statusCode: 403 }); };
const assignedRoles = employee => [...new Set([
  employee.position, employee.primaryPosition,
  ...(employee.secondaryPositions || []), ...(employee.additionalPositions || []), ...(employee.departments || []),
  ...(employee.roleSalaryComponents || []).map(row => row.position || row.department || row.role),
].filter(Boolean))];

const validateMethod = (method, employee, company) => {
  if (!['wifi', 'gps'].includes(method.type)) deny('Phương thức chấm công không hợp lệ.');
  if (method.type === 'wifi' && !matchesCompanyWifi(method, company)) deny('Chưa kết nối đúng WiFi công ty.');
  const required = employee.attendanceLocationEnabled || employee.fixedAttendanceLocationEnabled || employee.attendanceGpsRequired;
  if (required && method.type !== 'gps') deny('Nhân sự này phải chấm công bằng GPS.');
  if (method.type === 'gps') {
    if (![method.latitude, method.longitude].every(value => typeof value === 'number' && Number.isFinite(value))
      || Math.abs(method.latitude) > 90 || Math.abs(method.longitude) > 180) deny('Vị trí GPS không hợp lệ.');
    if (required) {
      const location = employee.attendanceLocation || employee.fixedAttendanceLocation || employee.attendanceGpsLocation;
      const lat = Number(location?.lat ?? location?.latitude);
      const lng = Number(location?.lng ?? location?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) deny('Chưa cài vị trí chấm công.');
      const radians = value => value * Math.PI / 180;
      const a = Math.sin(radians(method.latitude - lat) / 2) ** 2
        + Math.cos(radians(lat)) * Math.cos(radians(method.latitude)) * Math.sin(radians(method.longitude - lng) / 2) ** 2;
      const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const radius = Math.max(1, Math.round(Number(employee.attendanceLocationRadiusMeters || employee.attendanceGpsRadiusMeters || company.attendanceLocationRadiusMeters || 150) || 150));
      if (!Number.isFinite(radius) || Math.round(distance) > radius) deny('Bạn đang ngoài vị trí được phép chấm công.');
    }
  }
};

// Only the server chooses the work date and timestamp. One transaction covers
// both duplicate detection and the write, including concurrent requests.
async function recordManualAttendance({ db, collectionPath, appId, identity, device, deviceSecret, verifyDevice, action, workRole, method = {}, now = new Date() }) {
  if (identity.accountType !== 'employee' || !identity.appUserId || !identity.companyId) deny('Tài khoản không được chấm công.');
  if (!['in', 'out', 'leave'].includes(action)) deny('Thao tác chấm công không hợp lệ.');
  const employeeId = identity.appUserId;
  const companyId = identity.companyId;
  return db.runTransaction(async tx => {
    const employeeRef = db.collection(collectionPath(appId, 'employees')).doc(employeeId);
    const companyRef = db.collection(collectionPath(appId, 'companies')).doc(companyId);
    const deviceRef = db.collection('identity_accounts').doc(identity.id).collection('devices').doc(device.deviceId);
    const [empSnap, companySnap, deviceSnap] = await Promise.all([tx.get(employeeRef), tx.get(companyRef), tx.get(deviceRef)]);
    const employee = empSnap.data() || {};
    const company = companySnap.data() || {};
    const inactive = data => data.isArchived || data.disabled || ['blocked', 'disabled', 'revoked', 'suspended', 'deleted'].includes(data.status || data.accountStatus);
    if (!empSnap.exists || !companySnap.exists || employee.companyId !== companyId || inactive(employee) || inactive(company)) deny('Hồ sơ chấm công không hợp lệ.');
    const savedDevice = deviceSnap.data() || {};
    if (!verifyDevice(savedDevice, deviceSecret)) deny('Thiết bị chưa được phép chấm công. Hãy đăng nhập bằng mật khẩu và đăng ký thiết bị.');
    if ((company.attendanceBiometricRequired || employee.attendanceBiometricRequired) && !savedDevice.biometricEnabled) deny('Công ty yêu cầu bật sinh trắc học cho thiết bị chấm công.');
    if (action !== 'leave') validateMethod(method, employee, company);
    const role = workRole || employee.position;
    if (!assignedRoles(employee).includes(role)) deny('Công việc chưa được phân công.');
    const components = employee.roleSalaryComponents || employee.departmentSalaryComponents || employee.salaryByDepartment || [];
    const component = components.find(row => (row.position || row.department || row.role) === role) || {};
    const shiftEmployee = role === employee.position ? employee : { ...employee, position: role, shiftStart: component.shiftStart || '', shiftEnd: component.shiftEnd || '', graceMinutes: component.graceMinutes };
    const shift = getShiftWindow(shiftEmployee, now);
    const recordRef = db.collection(collectionPath(appId, 'attendance')).doc(`${shift.workDate}_${employeeId}`);
    const safeCompany = companyId.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    const periodRef = db.collection(collectionPath(appId, 'payrollPeriods')).doc(`payroll_${safeCompany}_${shift.workDate.slice(0, 7)}`);
    const [recordSnap, periodSnap] = await Promise.all([tx.get(recordRef), tx.get(periodRef)]);
    const previous = recordSnap.data() || {};
    if (previous.companyId && previous.companyId !== companyId) deny('Bản ghi không thuộc công ty.');
    if (['LOCKED', 'ADJUSTED'].includes(`${periodSnap.data()?.status || ''}`.toUpperCase())) deny('Kỳ lương đã khóa.');
    const record = previous.workRoles?.[role] || (role === employee.position ? previous : {});
    const field = action === 'in' ? 'checkIn' : 'checkOut';
    if (action === 'leave' ? record.status === 'leave' : record[field]) return { success: true, duplicate: true, workDate: shift.workDate, record };
    if (action === 'leave' && (record.checkIn || record.checkOut)) deny('Không thể ghi nghỉ phép đè lên giờ chấm công.');
    if (record.status === 'leave' || (action === 'out' && !record.checkIn)) deny('Chưa có chấm công vào ca hợp lệ.');
    if (action === 'in' && !shift.inWindow) deny('Chưa trong thời gian ca làm được phép.');
    const meta = method.type === 'wifi' ? { type: 'wifi', ssid: method.ssid, bssid: method.bssid } : { type: 'gps', latitude: method.latitude, longitude: method.longitude,
      ...(Number.isFinite(method.accuracy) && method.accuracy >= 0 ? { accuracy: method.accuracy } : {}) };
    const fields = action === 'leave'
      ? { workRole: role, status: 'leave', checkIn: null, checkOut: null }
      : { workRole: role, [field]: now.toISOString(), [`${field}Method`]: method.type === 'wifi' ? `WiFi: ${method.ssid}` : 'GPS vị trí', [`${field}MethodMeta`]: { ...meta, deviceId: device.deviceId, serverVerified: true }, ...(action === 'in' ? { status: shift.status } : {}) };
    const updated = { ...record, ...fields };
    tx.set(recordRef, role === employee.position && !previous.workRoles?.[role]
      ? { companyId, ...fields } : { companyId, workRoles: { ...previous.workRoles, [role]: updated }, ...(role === employee.position ? fields : {}) }, { merge: true });
    const logRef = db.collection('identity_audit_logs').doc();
    tx.set(logRef, { accountId: identity.id, action: `attendance_${action}`, createdAt: now, immutable: true, metadata: { companyId, employeeId, deviceId: device.deviceId, workDate: shift.workDate, workRole: role, method: action === 'leave' ? 'leave' : method.type } });
    return { success: true, duplicate: false, workDate: shift.workDate, record: updated };
  });
}

module.exports = { recordManualAttendance, validateMethod, assignedRoles };
