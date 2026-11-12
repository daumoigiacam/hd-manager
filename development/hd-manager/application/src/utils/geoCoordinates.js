const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseLatLngText = (value = '') => {
  const match = `${value || ''}`.trim().match(/(-?\d+(?:[\.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[\.,]\d+)?)/);
  if (!match) return null;
  const latitude = toNumber(match[1]);
  const longitude = toNumber(match[2]);
  return isValidLatLng(latitude, longitude) ? { latitude, longitude } : null;
};

export const isValidLatLng = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
);

export const extractCustomerCoordinates = (customer = {}) => {
  const coordinatePairs = [
    [customer.latitude, customer.longitude],
    [customer.lat, customer.lng],
    [customer.locationLat, customer.locationLng],
    [customer.gpsLatitude, customer.gpsLongitude],
    [customer.customerLatitude, customer.customerLongitude],
    [customer.deliveryLatitude, customer.deliveryLongitude],
    [customer.location?.latitude, customer.location?.longitude],
    [customer.location?.lat, customer.location?.lng],
    [customer.mapLocation?.latitude, customer.mapLocation?.longitude],
    [customer.mapLocation?.lat, customer.mapLocation?.lng],
    [customer.gpsLocation?.latitude, customer.gpsLocation?.longitude],
    [customer.gpsLocation?.lat, customer.gpsLocation?.lng],
    [customer.deliveryLocation?.latitude, customer.deliveryLocation?.longitude],
    [customer.deliveryLocation?.lat, customer.deliveryLocation?.lng],
  ];

  for (const [rawLatitude, rawLongitude] of coordinatePairs) {
    const latitude = toNumber(rawLatitude);
    const longitude = toNumber(rawLongitude);
    if (isValidLatLng(latitude, longitude)) return { latitude, longitude };
  }

  return parseLatLngText(
    customer.gps
    || customer.gpsText
    || customer.locationText
    || customer.locationInput
    || customer.locationUrl
    || customer.mapLink
    || customer.mapsLink
    || customer.mapsUrl
    || customer.addressUrl
    || customer.deliveryLocationText
    || customer.deliveryLocationInput
  );
};
