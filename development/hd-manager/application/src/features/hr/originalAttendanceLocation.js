// Generated exact original location declarations; regenerate rather than diverge.
import{Capacitor}from'@capacitor/core';import{Geolocation}from'@capacitor/geolocation';
const MAX_ATTENDANCE_GPS_ACCURACY_METERS = 100;

const mapPreciseAttendanceLocationErrorMessage = (error, source = 'web') => {
  const rawMessage = `${error?.message || ''}`.toLowerCase();
  const code = error?.code;
  const isNative = source === 'native';

  if (code === 1 || rawMessage.includes('permission') || rawMessage.includes('denied')) {
    return isNative
      ? 'Ứng dụng chưa được cấp quyền vị trí chính xác. Hãy vào Cài đặt > Ứng dụng > HD Manager > Quyền > Vị trí, chọn Cho phép khi dùng ứng dụng và bật Vị trí chính xác.'
      : 'Bạn chưa cấp quyền vị trí cho trình duyệt. Hãy cho phép Location/Vị trí rồi thử lại.';
  }

  if (
    code === 2 ||
    rawMessage.includes('services are not enabled') ||
    rawMessage.includes('location services are disabled') ||
    rawMessage.includes('location unavailable') ||
    rawMessage.includes('unavailable')
  ) {
    return 'Thiết bị chưa bật dịch vụ vị trí/GPS. Hãy bật Vị trí trên điện thoại rồi thử lại.';
  }

  if (code === 3 || rawMessage.includes('timeout')) {
    return 'GPS mất quá lâu để lấy vị trí chính xác. Hãy đứng nơi thoáng hơn rồi thử lại.';
  }

  return isNative
    ? 'Không thể lấy vị trí GPS chính xác. Hãy kiểm tra quyền vị trí và thử lại.'
    : 'Không thể lấy vị trí GPS trên trình duyệt. Hãy kiểm tra quyền vị trí và thử lại.';
};

const validateAttendancePositionAccuracy = (position = {}) => {
  const accuracy = Math.round(position?.coords?.accuracy || 0);
  if (accuracy > MAX_ATTENDANCE_GPS_ACCURACY_METERS) {
    throw new Error(`Vị trí GPS chưa đủ chính xác (${accuracy}m). Hãy bật Vị trí chính xác trong quyền vị trí của app, đứng nơi thoáng hơn rồi thử lại.`);
  }
  return position;
};

const requestPreciseAttendanceLocation = async () => {
  if (isNativeRuntime()) {
    try {
      const status = await Geolocation.checkPermissions();
      if (status?.location !== 'granted') {
        const requested = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (requested?.location !== 'granted') throw new Error('permission_denied');
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
        enableLocationFallback: true
      });
      return validateAttendancePositionAccuracy(position);
    } catch (error) {
      throw new Error(mapPreciseAttendanceLocationErrorMessage(error, 'native'));
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Trình duyệt này chưa hỗ trợ lấy vị trí GPS để chấm công.');
  }

  const permissionState = await getBrowserGeolocationPermissionState();
  if (permissionState === 'denied') {
    throw new Error(mapPreciseAttendanceLocationErrorMessage({ code: 1 }, 'web'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        try {
          resolve(validateAttendancePositionAccuracy(position));
        } catch (error) {
          reject(error);
        }
      },
      (error) => reject(new Error(mapPreciseAttendanceLocationErrorMessage(error, 'web'))),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
};

const getRuntimePlatform = () => {
  try {
    return Capacitor.getPlatform();
  } catch (error) {
    return 'web';
  }
};

const isNativeRuntime = () => getRuntimePlatform() !== 'web';

const getBrowserGeolocationPermissionState = async () => {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status?.state || 'prompt';
  } catch (error) {
    return 'prompt';
  }
};
export {requestPreciseAttendanceLocation};
