const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const normalizeSsid = value => `${value || ''}`.trim().replace(/^"|"$/g, '');
const normalizeBssid = value => `${value || ''}`.trim().toLowerCase();
const isValidBssid = value => /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(normalizeBssid(value))
  && normalizeBssid(value) !== '02:00:00:00:00:00';

const matchesCompanyWifi = (network = {}, company = {}) => {
  const configuredSsid = normalizeSsid(company.attendanceWifiSsid || company.attendanceWifi?.ssid);
  const configuredBssid = normalizeBssid(company.attendanceWifiBssid || company.attendanceWifi?.bssid);
  return company.attendanceWifiEnabled !== false
    && Boolean(configuredSsid)
    && isValidBssid(configuredBssid)
    && normalizeSsid(network.ssid) === configuredSsid
    && isValidBssid(network.bssid)
    && normalizeBssid(network.bssid) === configuredBssid;
};

const getVietnamParts = now => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
};

const nextDay = date => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const minutesOf = (value, fallback) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(`${value || ''}`);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
};

const POSITION_SHIFTS = {
  'Tài xế': ['06:30', '16:30', 10],
  'Sản xuất': ['07:30', '16:30', 10],
  'Xuất kho': ['06:30', '16:30', 10],
  'Kinh doanh': ['08:00', '17:00', 10],
  'Cộng tác viên kinh doanh': ['08:00', '17:00', 10],
  'Chủ doanh nghiệp': ['08:00', '17:00', 0]
};

const getShiftWindow = (employee = {}, now = new Date()) => {
  const defaults = POSITION_SHIFTS[employee.position] || ['08:00', '17:00', 5];
  const startMinutes = minutesOf(employee.shiftStart, minutesOf(defaults[0], 480));
  const endMinutes = minutesOf(employee.shiftEnd, minutesOf(defaults[1], 1020));
  const graceMinutes = employee.graceMinutes !== null && employee.graceMinutes !== '' && Number.isFinite(Number(employee.graceMinutes))
    ? Math.max(0, Number(employee.graceMinutes)) : defaults[2];
  const { date, minutes } = getVietnamParts(now);
  const overnight = endMinutes <= startMinutes;
  const workDate = overnight && minutes >= startMinutes ? nextDay(date) : date;
  const startDate = overnight ? new Date(Date.parse(`${workDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : workDate;
  const startAt = Date.parse(`${startDate}T00:00:00+07:00`) + startMinutes * 60000;
  const endAt = Date.parse(`${workDate}T00:00:00+07:00`) + endMinutes * 60000;
  return {
    workDate,
    inWindow: now.getTime() >= startAt - 30 * 60000 && now.getTime() <= endAt,
    status: now.getTime() > startAt + graceMinutes * 60000 ? 'late' : 'present'
  };
};

const evaluateAutoWifiCheckIn = ({ claims = {}, company = {}, employee = {}, network = {}, record = {}, now = new Date() }) => {
  if (claims.accountType !== 'employee' || !claims.companyId || !claims.appUserId
    || claims.companyId !== company.id || employee.companyId !== company.id
    || claims.appUserId !== employee.id) return { eligible: false, reason: 'tenant_or_identity' };
  if (employee.isArchived || employee.attendanceAutoWifiEnabled !== true) return { eligible: false, reason: 'disabled' };
  if (!matchesCompanyWifi(network, company)) return { eligible: false, reason: 'wifi_mismatch' };
  const shift = getShiftWindow(employee, now);
  if (!shift.inWindow) return { eligible: false, reason: 'outside_shift', workDate: shift.workDate };
  if (record.checkIn || record.status === 'leave') return { eligible: false, reason: 'already_recorded', workDate: shift.workDate };
  return { eligible: true, workDate: shift.workDate, status: shift.status };
};

module.exports = { normalizeSsid, normalizeBssid, isValidBssid, matchesCompanyWifi, getShiftWindow, evaluateAutoWifiCheckIn };
