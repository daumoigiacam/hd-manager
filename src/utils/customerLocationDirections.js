import { extractCustomerCoordinates, isValidLatLng } from '../services/mapEngineService.js';

const MAPS_DESTINATION_QUERY_KEYS = ['destination', 'query', 'q'];

const normalizeText = (value = '') => `${value || ''}`.trim();

const getDestinationFromMapsUrl = (value = '') => {
  const rawUrl = normalizeText(value);
  if (!/^https?:\/\//i.test(rawUrl)) return '';

  try {
    const parsed = new URL(rawUrl);
    for (const key of MAPS_DESTINATION_QUERY_KEYS) {
      const candidate = normalizeText(parsed.searchParams.get(key));
      if (candidate) return candidate;
    }

    const coordinateMatch = `${parsed.pathname}${parsed.hash}`.match(
      /@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/
    );
    if (coordinateMatch) return `${coordinateMatch[1]},${coordinateMatch[2]}`;
  } catch {
    // A malformed legacy URL can still fall back to the saved address below.
  }

  return '';
};

const getLocationTextCandidates = (customer = {}) => [
  customer?.location,
  customer?.location?.url,
  customer?.location?.address,
  customer?.locationUrl,
  customer?.locationInput,
  customer?.mapsUrl,
  customer?.mapsLink,
  customer?.mapLink,
  customer?.gps,
  customer?.gpsText,
  customer?.address,
].filter(value => typeof value === 'string' && normalizeText(value));

export const resolveCustomerDirectionsDestination = (customer = {}) => {
  const coordinates = extractCustomerCoordinates(customer);
  if (coordinates && isValidLatLng(Number(coordinates.latitude), Number(coordinates.longitude))) {
    return `${Number(coordinates.latitude)},${Number(coordinates.longitude)}`;
  }

  for (const candidate of getLocationTextCandidates(customer)) {
    const destinationFromUrl = getDestinationFromMapsUrl(candidate);
    if (destinationFromUrl) return destinationFromUrl;
    if (!/^https?:\/\//i.test(candidate)) return normalizeText(candidate);
  }

  return '';
};

export const buildCustomerDirectionsUrl = (customer = {}) => {
  const destination = resolveCustomerDirectionsDestination(customer);
  if (!destination) return '';

  const params = new URLSearchParams({
    api: '1',
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};
