const EARTH_RADIUS_METERS = 6_371_000;

export const DELIVERY_GPS_MAX_AGE_MS = 30_000;
export const DELIVERY_GPS_WARNING_ACCURACY_METERS = 50;
export const DELIVERY_GPS_REJECT_ACCURACY_METERS = 150;
export const DELIVERY_ROUTE_REROUTE_DISTANCE_METERS = 80;

const toFiniteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toTimestampMs = (value, fallback) => {
  const timestamp = toFiniteNumber(value);
  if (!timestamp || timestamp <= 0) return fallback;
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
};

export const isValidDeliveryMapPosition = (position = {}) => {
  const latitude = toFiniteNumber(position?.latitude);
  const longitude = toFiniteNumber(position?.longitude);
  return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
};

export const normalizeDeliveryGpsPosition = (rawPosition = {}, { receivedAt = Date.now() } = {}) => {
  const coords = rawPosition?.coords || rawPosition || {};
  const latitude = toFiniteNumber(coords.latitude);
  const longitude = toFiniteNumber(coords.longitude);
  if (!isValidDeliveryMapPosition({ latitude, longitude })) return null;

  const timestampMs = toTimestampMs(
    rawPosition?.timestamp ?? rawPosition?.timeStamp ?? coords.timestamp ?? coords.timeStamp,
    receivedAt
  );
  const rawSpeed = toFiniteNumber(coords.speed);
  const accuracy = toFiniteNumber(coords.accuracy);
  const heading = toFiniteNumber(coords.heading);

  return {
    latitude,
    longitude,
    speedKmh: rawSpeed !== null && rawSpeed > 0 ? rawSpeed * 3.6 : null,
    heading: heading !== null && heading >= 0 ? heading : null,
    accuracy: accuracy !== null && accuracy >= 0 ? accuracy : null,
    timestampMs,
    updatedAt: new Date(timestampMs).toISOString(),
  };
};

export const getDeliveryGpsQuality = (position = {}, { now = Date.now() } = {}) => {
  if (!isValidDeliveryMapPosition(position)) {
    return { isFresh: false, isAccurate: false, isUsable: false, message: 'GPS chưa có vị trí hợp lệ.' };
  }
  const ageMs = Math.max(0, now - Number(position.timestampMs || Date.parse(position.updatedAt || '') || 0));
  const isFresh = ageMs <= DELIVERY_GPS_MAX_AGE_MS;
  const accuracy = toFiniteNumber(position.accuracy);
  const isAccurate = accuracy === null || accuracy <= DELIVERY_GPS_WARNING_ACCURACY_METERS;
  const isUsable = isFresh && (accuracy === null || accuracy <= DELIVERY_GPS_REJECT_ACCURACY_METERS);
  const message = !isFresh
    ? 'GPS đã cũ, đang tìm vị trí mới hơn.'
    : !isAccurate
      ? `GPS chưa chính xác${accuracy !== null ? ` (sai số khoảng ${Math.round(accuracy)}m)` : ''}.`
      : '';
  return { isFresh, isAccurate, isUsable, accuracy, ageMs, message };
};

export const distanceBetweenDeliveryGpsPointsMeters = (first = {}, second = {}) => {
  if (!isValidDeliveryMapPosition(first) || !isValidDeliveryMapPosition(second)) return 0;
  const toRadians = value => value * Math.PI / 180;
  const latitudeDelta = toRadians(Number(second.latitude) - Number(first.latitude));
  const longitudeDelta = toRadians(Number(second.longitude) - Number(first.longitude));
  const firstLatitude = toRadians(Number(first.latitude));
  const secondLatitude = toRadians(Number(second.latitude));
  const halfChord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord));
};

export const shouldAcceptDeliveryGpsPosition = (previous = null, next = null, { now = Date.now() } = {}) => {
  const nextQuality = getDeliveryGpsQuality(next || {}, { now });
  if (!nextQuality.isUsable) return false;
  if (!previous || !isValidDeliveryMapPosition(previous)) return true;

  const previousTimestampMs = Number(previous.timestampMs || Date.parse(previous.updatedAt || '') || 0);
  const nextTimestampMs = Number(next.timestampMs || Date.parse(next.updatedAt || '') || 0);
  if (nextTimestampMs && previousTimestampMs && nextTimestampMs + 1_000 < previousTimestampMs) return false;

  const previousAccuracy = Math.max(0, toFiniteNumber(previous.accuracy) ?? 0);
  const nextAccuracy = Math.max(0, toFiniteNumber(next.accuracy) ?? 0);
  const distanceMeters = distanceBetweenDeliveryGpsPointsMeters(previous, next);
  const elapsedSeconds = Math.max(0.25, (nextTimestampMs - previousTimestampMs) / 1000);
  const estimatedSpeedKmh = distanceMeters / elapsedSeconds * 3.6;
  const noiseRadius = Math.max(12, previousAccuracy, nextAccuracy);

  if (distanceMeters > noiseRadius * 2 && elapsedSeconds < 120 && estimatedSpeedKmh > 170) return false;
  if (nextAccuracy > DELIVERY_GPS_WARNING_ACCURACY_METERS * 2 && nextAccuracy > previousAccuracy * 1.75 && distanceMeters < nextAccuracy) return false;
  if (distanceMeters < noiseRadius && elapsedSeconds < 1.5 && nextAccuracy >= previousAccuracy) return false;
  return true;
};

export const shouldRefreshDeliveryRoute = (routeOrigin = null, nextPosition = null) => {
  if (!isValidDeliveryMapPosition(nextPosition)) return false;
  if (!routeOrigin || !isValidDeliveryMapPosition(routeOrigin)) return true;
  const quality = getDeliveryGpsQuality(nextPosition);
  if (!quality.isUsable) return false;
  const threshold = Math.max(
    DELIVERY_ROUTE_REROUTE_DISTANCE_METERS,
    (toFiniteNumber(routeOrigin.accuracy) ?? 0) * 2,
    (toFiniteNumber(nextPosition.accuracy) ?? 0) * 2
  );
  return distanceBetweenDeliveryGpsPointsMeters(routeOrigin, nextPosition) >= threshold;
};

export const buildDeliveryRouteCacheKey = ({ origin = {}, target = {}, provider = 'osrm' } = {}) => {
  if (!isValidDeliveryMapPosition(origin) || !isValidDeliveryMapPosition(target)) return '';
  const pointKey = point => `${Number(point.latitude).toFixed(4)},${Number(point.longitude).toFixed(4)}`;
  return `${provider}:${pointKey(origin)}>${pointKey(target)}`;
};

export const getPendingDeliveryMapPoints = (points = []) => (
  (points || []).filter(point => point && !point.isDelivered && point.status !== 'delivered' && !point.deliveredAt)
);

export const getDeliveryCustomerLocationState = ({ customerPosition = null, originPosition = null } = {}) => {
  if (!isValidDeliveryMapPosition(customerPosition || {})) {
    return {
      key: 'missing_customer_location',
      label: 'Chưa có vị trí khách',
    };
  }

  if (!isValidDeliveryMapPosition(originPosition || {})) {
    return {
      key: 'waiting_for_device_location',
      label: 'Đã có vị trí khách • đang chờ GPS thiết bị',
    };
  }

  return {
    key: 'ready',
    label: '',
  };
};
