export const normalizeAttendanceSsid = value => `${value || ''}`.trim().replace(/^"|"$/g, '');
export const normalizeAttendanceBssid = value => `${value || ''}`.trim().toLowerCase();

export const isUsableAttendanceBssid = value => /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(normalizeAttendanceBssid(value))
  && normalizeAttendanceBssid(value) !== '02:00:00:00:00:00';

export const matchesAttendanceWifi = (network = {}, company = {}) => {
  const expectedSsid = normalizeAttendanceSsid(company.attendanceWifiSsid || company.attendanceWifi?.ssid);
  const expectedBssid = normalizeAttendanceBssid(company.attendanceWifiBssid || company.attendanceWifi?.bssid);
  return company.attendanceWifiEnabled !== false
    && Boolean(expectedSsid)
    && isUsableAttendanceBssid(expectedBssid)
    && normalizeAttendanceSsid(network.ssid || network.networkLabel) === expectedSsid
    && isUsableAttendanceBssid(network.bssid)
    && normalizeAttendanceBssid(network.bssid) === expectedBssid;
};

export const canAttemptAutoWifiCheckIn = ({ native, employee, company, permissionGranted, network }) => Boolean(
  native && employee?.id && employee.attendanceAutoWifiEnabled === true
  && employee.companyId === company?.id && permissionGranted
  && matchesAttendanceWifi(network, company)
);
