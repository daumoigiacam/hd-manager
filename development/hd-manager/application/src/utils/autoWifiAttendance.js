import { canAttemptAutoWifiCheckIn } from './attendanceWifi.js';

const reasonMessages = {
  outside_shift: 'Chưa đến khung giờ chấm công của ca làm.',
  already_recorded: 'Ca này đã có chấm công hoặc nghỉ phép.',
  payroll_locked: 'Kỳ lương đã khóa, không thể tự động thêm chấm công.',
  gps_required: 'Hồ sơ yêu cầu xác minh GPS. Chấm công WiFi tự động không được phép bỏ qua vị trí.',
  disabled: 'Chấm công WiFi tự động đã tắt.',
  tenant_or_identity: 'Hồ sơ hoặc phiên đăng nhập không khớp công ty.',
  wifi_mismatch: 'WiFi hiện tại không khớp mạng công ty.'
};
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

// One foreground worker for the signed-in employee, independent of the active screen.
export function createAutoWifiAttendanceController({
  getContext, getPermission, getNetwork, requestCheckIn, onRecorded, onStatus,
  now = monotonicNow, timeoutMs = 18000
}) {
  let stopped = false;
  let active = true;
  let pending;
  let queued = false;
  let abortController;
  let pauseUntil = 0;
  let contextKey = '';
  let lastStatus = '';
  const status = message => {
    if (stopped || message === lastStatus) return;
    lastStatus = message;
    onStatus?.(message);
  };
  const attempt = () => {
    if (stopped || !active) return Promise.resolve();
    if (pending) { queued = true; return pending; }
    const context = getContext();
    const { native, employee, company } = context;
    const key = JSON.stringify([employee?.id, employee?.companyId, employee?.attendanceAutoWifiEnabled,
      employee?.position, employee?.shiftStart, employee?.shiftEnd, employee?.graceMinutes,
      employee?.attendanceLocationEnabled, employee?.fixedAttendanceLocationEnabled, employee?.attendanceGpsRequired,
      company?.id, company?.attendanceWifiEnabled, company?.attendanceWifiSsid, company?.attendanceWifiBssid, company?.attendanceWifi]);
    if (key !== contextKey) { contextKey = key; pauseUntil = 0; }
    if (!native || !employee?.id || employee.isArchived || employee.attendanceAutoWifiEnabled !== true || employee.companyId !== company?.id || now() < pauseUntil) return Promise.resolve();
    const controller = new AbortController();
    abortController = controller;
    let timer;
    const deadline = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Chưa nhận xác nhận máy chủ. App sẽ kiểm tra lại khi có kết nối.')), { once: true });
      timer = setTimeout(() => controller.abort(), timeoutMs);
    });
    const run = async () => {
      const permission = await getPermission();
      if (stopped || controller.signal.aborted) return;
      if (!permission?.granted) { status('Chưa cấp quyền đọc WiFi cho chấm công tự động.'); return; }
      const network = await getNetwork();
      if (stopped || controller.signal.aborted) return;
      if (!canAttemptAutoWifiCheckIn({ native, employee, company, permissionGranted: true, network })) {
        status(network?.supported === false ? network.message || reasonMessages.wifi_mismatch : reasonMessages.wifi_mismatch);
        return;
      }
      const result = await requestCheckIn(network, controller.signal);
      if (stopped || controller.signal.aborted) return;
      if (!result?.success) throw new Error(result?.message || 'Máy chủ chưa nhận chấm công WiFi.');
      if (result.created || ['already_recorded', 'outside_shift', 'payroll_locked', 'gps_required', 'disabled'].includes(result.reason)) {
        pauseUntil = now() + Math.min(86400000, Math.max(1000, Number(result.retryAfterMs) || 60000));
      }
      if (result.workDate && result.checkIn) {
        onRecorded?.({
          ...result, employeeId: employee.id, companyId: company.id, workRole: employee.position || '',
          checkInMethod: result.checkInMethod ?? (result.created ? `WiFi: ${network.ssid}` : undefined),
          checkInMethodMeta: result.checkInMethodMeta ?? (result.created ? { type: 'wifi', source: 'android-native-auto', ssid: network.ssid, bssid: network.bssid, automatic: true } : undefined)
        });
        const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(result.checkIn));
        status(`Đã ghi nhận vào ca lúc ${time}${result.created ? ' qua WiFi công ty' : ''}.`);
      } else status(reasonMessages[result.reason] || 'Chưa đủ điều kiện chấm công tự động.');
    };
    pending = Promise.race([run(), deadline]).catch(error => {
      if (!stopped && active) {
        pauseUntil = now() + 30000;
        status(`Chấm công WiFi chưa được xác nhận: ${error?.message || 'Lỗi kết nối.'}`);
      }
    }).finally(() => {
      clearTimeout(timer);
      pending = undefined;
      abortController = undefined;
      if (queued) { queued = false; void attempt(); }
    });
    return pending;
  };
  return {
    attempt,
    setActive(value) {
      active = Boolean(value);
      if (active) return attempt();
      abortController?.abort();
      return Promise.resolve();
    },
    stop() { stopped = true; queued = false; abortController?.abort(); }
  };
}
