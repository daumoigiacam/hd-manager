const { evaluateAutoWifiCheckIn, getShiftWindow } = require('./attendanceWifi');

const recordAutoWifiAttendance = async ({ db, collectionPath, appId, claims, network, now = new Date() }) => {
  const companyId = claims.companyId;
  const employeeId = claims.appUserId;
  const companyRef = db.collection(collectionPath(appId, 'companies')).doc(companyId);
  const employeeRef = db.collection(collectionPath(appId, 'employees')).doc(employeeId);
  return db.runTransaction(async transaction => {
    const [companySnap, employeeSnap] = await Promise.all([
      transaction.get(companyRef), transaction.get(employeeRef)
    ]);
    if (!companySnap.exists || !employeeSnap.exists) return { success: false, code: 'profile_missing', statusCode: 404 };
    const company = { ...companySnap.data(), id: companySnap.id };
    const employee = { ...employeeSnap.data(), id: employeeSnap.id };
    const shift = getShiftWindow(employee, now);
    const recordId = `${shift.workDate}_${employeeId}`;
    const attendanceRef = db.collection(collectionPath(appId, 'attendance')).doc(recordId);
    const safeCompanyId = companyId.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    const periodRef = db.collection(collectionPath(appId, 'payrollPeriods')).doc(`payroll_${safeCompanyId}_${shift.workDate.slice(0, 7)}`);
    const [recordSnap, periodSnap] = await Promise.all([
      transaction.get(attendanceRef), transaction.get(periodRef)
    ]);
    const record = recordSnap.data() || {};
    const primaryRecord = record.workRoles?.[employee.position] || record;
    const decision = evaluateAutoWifiCheckIn({ claims, company, employee, network, record, period: periodSnap.data() || {}, now });
    const retryAfterMs = shift.inWindow
      ? shift.endAt - now.getTime() + 1
      : (shift.startAt - 30 * 60000 > now.getTime() ? shift.startAt - 30 * 60000 : shift.startAt - 30 * 60000 + 86400000) - now.getTime();
    if (!decision.eligible) {
      return {
        success: true, created: false, reason: decision.reason, workDate: shift.workDate,
        retryAfterMs: ['already_recorded', 'outside_shift', 'payroll_locked', 'gps_required'].includes(decision.reason) ? retryAfterMs : 60000,
        ...(decision.reason === 'already_recorded' ? { workRole: employee.position || '', checkIn: primaryRecord.checkIn || null, status: primaryRecord.status, checkInMethod: primaryRecord.checkInMethod || '', checkInMethodMeta: primaryRecord.checkInMethodMeta || null } : {})
      };
    }
    const timestamp = now.toISOString();
    const fields = {
      companyId, workRole: employee.position || '', checkIn: timestamp,
      checkInMethod: `WiFi: ${network.ssid}`,
      checkInMethodMeta: { type: 'wifi', source: 'android-native-auto', ssid: network.ssid, bssid: network.bssid, automatic: true },
      status: decision.status
    };
    transaction.set(attendanceRef, record.workRoles?.[employee.position]
      ? { ...fields, workRoles: { [employee.position]: { ...primaryRecord, ...fields } } }
      : fields, { merge: true });
    const notificationRef = db.collection(collectionPath(appId, 'notifications')).doc(`attendance_auto_${recordId}`);
    transaction.set(notificationRef, {
      id: notificationRef.id, companyId, employeeId, recipientId: employeeId,
      recipientType: 'employee', category: 'attendance', type: 'attendance_auto_check_in',
      title: 'Đã chấm công vào',
      message: `Đã ghi nhận vào ca lúc ${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(now)} qua WiFi công ty.`,
      tab: 'company_attendance', status: 'unread', readStatus: 'unread',
      date: shift.workDate, createdAt: timestamp, createdAtMs: now.getTime(), isArchived: false
    }, { merge: true });
    return { success: true, created: true, workDate: shift.workDate, retryAfterMs, ...fields };
  });
};

module.exports = { recordAutoWifiAttendance };
