const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value = '') => `${value || ''}`.trim().toLowerCase();

const compactDigits = (value = '') => `${value || ''}`.replace(/\D/g, '');

const normalizeLookupKey = (value = '') => normalizeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ')
  .trim();

const LOCATION_FALLBACKS = [
  { terms: ['bau bang', 'bàu bàng'], latitude: 11.2758, longitude: 106.6393, displayName: 'Bàu Bàng, Bình Dương' },
  { terms: ['chon thanh', 'chơn thành'], latitude: 11.4291, longitude: 106.6584, displayName: 'Chơn Thành, Bình Phước' },
  { terms: ['binh duong', 'bình dương'], latitude: 11.1667, longitude: 106.6667, displayName: 'Bình Dương' },
  { terms: ['binh phuoc', 'bình phước'], latitude: 11.7512, longitude: 106.7235, displayName: 'Bình Phước' },
  { terms: ['dong xoai', 'đồng xoài'], latitude: 11.5349, longitude: 106.8832, displayName: 'Đồng Xoài, Bình Phước' },
  { terms: ['ho chi minh', 'hồ chí minh', 'tp hcm', 'tphcm'], latitude: 10.7769, longitude: 106.7009, displayName: 'TP. Hồ Chí Minh' },
];

const getFallbackCoordinates = (query = '') => {
  const key = normalizeLookupKey(query);
  if (!key) return null;
  const found = LOCATION_FALLBACKS.find(item => item.terms.some(term => key.includes(normalizeLookupKey(term))));
  if (!found) return null;
  return {
    latitude: found.latitude,
    longitude: found.longitude,
    displayName: found.displayName,
    source: 'local_fallback',
  };
};

export const buildGeocodeQuery = (point = {}, currentCompany = {}) => {
  const parts = [
    point.address,
    point.deliveryAddress,
    point.customerAddress,
    point.customerName,
    currentCompany?.address,
    currentCompany?.province,
    currentCompany?.city,
    'Việt Nam',
  ].filter(Boolean);
  return Array.from(new Set(parts.map(part => `${part}`.trim()).filter(Boolean))).join(', ');
};

export const geocodeAddress = async (query = '') => {
  const safeQuery = `${query || ''}`.trim();
  if (!safeQuery) return null;

  const fallback = getFallbackCoordinates(safeQuery);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=vn&q=${encodeURIComponent(safeQuery)}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      const first = Array.isArray(data) ? data[0] : null;
      const latitude = toNumber(first?.lat);
      const longitude = toNumber(first?.lon);
      if (isValidLatLng(latitude, longitude)) {
        return {
          latitude,
          longitude,
          displayName: first?.display_name || safeQuery,
          source: 'nominatim',
        };
      }
    }
  } catch (error) {
    // Offline or provider throttled. Keep the map usable with the local fallback below.
  }
  return fallback;
};

const parseLatLngText = (value = '') => {
  const text = `${value || ''}`.trim();
  if (!text) return null;
  const match = text.match(/(-?\d+(?:[\.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[\.,]\d+)?)/);
  if (!match) return null;
  const latitude = toNumber(match[1]);
  const longitude = toNumber(match[2]);
  if (!isValidLatLng(latitude, longitude)) return null;
  return { latitude, longitude };
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

  for (const [rawLat, rawLng] of coordinatePairs) {
    const latitude = toNumber(rawLat);
    const longitude = toNumber(rawLng);
    if (isValidLatLng(latitude, longitude)) return { latitude, longitude };
  }

  const textCoordinate = parseLatLngText(
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
  return textCoordinate;
};

export const extractDispatchCoordinates = (dispatch = {}) => {
  const coordinatePairs = [
    [dispatch.latitude, dispatch.longitude],
    [dispatch.lat, dispatch.lng],
    [dispatch.locationLat, dispatch.locationLng],
    [dispatch.gpsLatitude, dispatch.gpsLongitude],
    [dispatch.customerLatitude, dispatch.customerLongitude],
    [dispatch.deliveryLatitude, dispatch.deliveryLongitude],
    [dispatch.location?.latitude, dispatch.location?.longitude],
    [dispatch.location?.lat, dispatch.location?.lng],
    [dispatch.customerLocation?.latitude, dispatch.customerLocation?.longitude],
    [dispatch.customerLocation?.lat, dispatch.customerLocation?.lng],
    [dispatch.deliveryLocation?.latitude, dispatch.deliveryLocation?.longitude],
    [dispatch.deliveryLocation?.lat, dispatch.deliveryLocation?.lng],
  ];

  for (const [rawLat, rawLng] of coordinatePairs) {
    const latitude = toNumber(rawLat);
    const longitude = toNumber(rawLng);
    if (isValidLatLng(latitude, longitude)) return { latitude, longitude };
  }

  return parseLatLngText(
    dispatch.gps
    || dispatch.gpsText
    || dispatch.locationText
    || dispatch.locationInput
    || dispatch.mapLink
    || dispatch.mapsLink
    || dispatch.customerLocationText
    || dispatch.deliveryLocationText
    || dispatch.customerLocation
    || dispatch.deliveryLocation
  );
};

export const extractDriverCoordinates = (driverLocation = {}, employee = {}) => {
  const coordinatePairs = [
    [driverLocation.latitude, driverLocation.longitude],
    [driverLocation.lat, driverLocation.lng],
    [driverLocation.location?.latitude, driverLocation.location?.longitude],
    [employee.latitude, employee.longitude],
    [employee.lat, employee.lng],
    [employee.location?.latitude, employee.location?.longitude],
  ];

  for (const [rawLat, rawLng] of coordinatePairs) {
    const latitude = toNumber(rawLat);
    const longitude = toNumber(rawLng);
    if (isValidLatLng(latitude, longitude)) return { latitude, longitude };
  }
  return parseLatLngText(driverLocation.gps || employee.gps || employee.locationText);
};

export class MapProvider {
  constructor(config = {}) {
    this.config = config;
  }

  get id() {
    return 'base';
  }

  get label() {
    return 'Map Provider';
  }

  showMap() {
    return null;
  }

  addMarker(markers = [], marker = {}) {
    return [...markers, marker];
  }

  removeMarker(markers = [], markerId) {
    return markers.filter(marker => marker.id !== markerId);
  }

  drawPolyline(points = []) {
    return points;
  }

  moveCamera(camera = {}, nextCamera = {}) {
    return { ...camera, ...nextCamera };
  }

  fitBounds(points = []) {
    return calculateBounds(points);
  }

  showCurrentLocation(location = null) {
    return location;
  }

  updateMarker(markers = [], markerId, patch = {}) {
    return markers.map(marker => marker.id === markerId ? { ...marker, ...patch } : marker);
  }

  clusterMarker(points = [], zoom = 10) {
    return clusterMapPoints(points, zoom);
  }

  buildPointUrl(point = {}) {
    const latitude = toNumber(point.latitude);
    const longitude = toNumber(point.longitude);
    if (!isValidLatLng(latitude, longitude)) return '';
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  }

  buildRouteUrl(points = []) {
    const validPoints = points.filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
    return validPoints[0] ? this.buildPointUrl(validPoints[0]) : '';
  }

  buildEmbedUrl(points = [], bounds = null) {
    const validPoints = (points || []).filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
    const firstPoint = validPoints[0];
    if (!firstPoint) return '';
    const safeBounds = bounds || calculateBounds(validPoints);
    if (safeBounds) {
      const paddingLat = Math.max(0.01, (safeBounds.maxLat - safeBounds.minLat) * 0.22);
      const paddingLng = Math.max(0.01, (safeBounds.maxLng - safeBounds.minLng) * 0.22);
      const bbox = [
        safeBounds.minLng - paddingLng,
        safeBounds.minLat - paddingLat,
        safeBounds.maxLng + paddingLng,
        safeBounds.maxLat + paddingLat,
      ].join(',');
      return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${firstPoint.latitude},${firstPoint.longitude}`)}`;
    }
    return `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${encodeURIComponent(`${firstPoint.latitude},${firstPoint.longitude}`)}`;
  }
}

export class GoogleMapProvider extends MapProvider {
  get id() {
    return 'google';
  }

  get label() {
    return 'Google Maps';
  }

  buildPointUrl(point = {}) {
    const latitude = toNumber(point.latitude);
    const longitude = toNumber(point.longitude);
    if (!isValidLatLng(latitude, longitude)) return '';
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }

  buildRouteUrl(points = []) {
    const validPoints = points.filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
    if (!validPoints.length) return '';
    if (validPoints.length === 1) return this.buildPointUrl(validPoints[0]);
    const origin = `${validPoints[0].latitude},${validPoints[0].longitude}`;
    const destinationPoint = validPoints[validPoints.length - 1];
    const destination = `${destinationPoint.latitude},${destinationPoint.longitude}`;
    const waypoints = validPoints.slice(1, -1).map(point => `${point.latitude},${point.longitude}`).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}`;
  }

  buildEmbedUrl(points = []) {
    const validPoints = points.filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
    const firstPoint = validPoints[0];
    if (!firstPoint) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(`${firstPoint.latitude},${firstPoint.longitude}`)}&z=14&output=embed`;
  }
}

export class GoongMapProvider extends MapProvider {
  get id() {
    return 'goong';
  }

  get label() {
    return 'Goong Map';
  }

  buildPointUrl(point = {}) {
    const latitude = toNumber(point.latitude);
    const longitude = toNumber(point.longitude);
    if (!isValidLatLng(latitude, longitude)) return '';
    return `https://map.goong.io/?lat=${latitude}&lng=${longitude}&z=16`;
  }

  buildRouteUrl(points = []) {
    const validPoints = points.filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
    if (!validPoints.length) return '';
    if (validPoints.length === 1) return this.buildPointUrl(validPoints[0]);
    const firstPoint = validPoints[0];
    const lastPoint = validPoints[validPoints.length - 1];
    const origin = `${firstPoint.latitude},${firstPoint.longitude}`;
    const destination = `${lastPoint.latitude},${lastPoint.longitude}`;
    return `https://map.goong.io/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
  }

  buildEmbedUrl(points = []) {
    const validPoints = points.filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
    const firstPoint = validPoints[0];
    if (!firstPoint) return '';
    return this.buildPointUrl(firstPoint);
  }
}

export class OpenStreetMapProvider extends MapProvider {
  get id() {
    return 'openstreetmap';
  }

  get label() {
    return 'OpenStreetMap';
  }

  buildRouteUrl(points = []) {
    const validPoints = points.filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
    if (!validPoints.length) return '';
    if (validPoints.length === 1) return this.buildPointUrl(validPoints[0]);
    const route = validPoints.map(point => `${point.longitude},${point.latitude}`).join(';');
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
  }
}

export const MAP_PROVIDER_OPTIONS = [
  { id: 'openstreetmap', label: 'OpenStreetMap', description: 'Mở, nhẹ, không khóa theo Google.' },
  { id: 'google', label: 'Google Maps', description: 'Mở chỉ đường bằng Google Maps khi cần.' },
  { id: 'goong', label: 'Goong Map', description: 'Bản đồ Việt Nam, dùng Map Tiles key của Goong.' },
  { id: 'mapbox', label: 'Mapbox', description: 'Đã chừa kiến trúc, có thể tích hợp sau.' },
];

export const createMapProvider = (providerId = 'google', config = {}) => {
  if (providerId === 'google') return new GoogleMapProvider(config);
  if (providerId === 'goong') return new GoongMapProvider(config);
  return new OpenStreetMapProvider(config);
};

export const getDefaultMapProvider = (company = {}) => company?.mapProvider || company?.settings?.mapProvider || 'google';

const getCustomerEmployeeId = (customer = {}) => (
  customer.assignedEmployeeId
  || customer.salesEmployeeId
  || customer.managerId
  || customer.employeeId
  || customer.createdBy
  || ''
);

const buildCustomerLookups = (customers = []) => {
  const byId = new Map();
  const byPhone = new Map();
  const byName = new Map();

  (customers || []).filter(Boolean).forEach(customer => {
    const ids = [
      customer.id,
      customer.customerId,
      customer.customerID,
      customer.code,
    ].filter(Boolean);
    ids.forEach(id => byId.set(`${id}`, customer));

    const phones = [
      customer.phone,
      customer.phoneNumber,
      customer.mobile,
      customer.zaloPhone,
      customer.contactPhone,
    ].map(compactDigits).filter(phone => phone.length >= 6);
    phones.forEach(phone => byPhone.set(phone, customer));

    const names = [
      customer.name,
      customer.customerName,
      customer.fullName,
      customer.displayName,
    ].map(normalizeLookupKey).filter(Boolean);
    names.forEach(name => byName.set(name, customer));
  });

  return { byId, byPhone, byName };
};

const findCustomerForDispatch = (dispatch = {}, lookups = {}) => {
  const idCandidates = [
    dispatch.customerId,
    dispatch.customerID,
    dispatch.clientId,
    dispatch.customer?.id,
    dispatch.customer?.customerId,
  ].filter(Boolean).map(value => `${value}`);

  for (const id of idCandidates) {
    const customer = lookups.byId?.get(id);
    if (customer) return customer;
  }

  const phoneCandidates = [
    dispatch.phone,
    dispatch.customerPhone,
    dispatch.phoneNumber,
    dispatch.contactPhone,
    dispatch.customer?.phone,
    dispatch.customer?.phoneNumber,
  ].map(compactDigits).filter(phone => phone.length >= 6);

  for (const phone of phoneCandidates) {
    const customer = lookups.byPhone?.get(phone);
    if (customer) return customer;
  }

  const nameCandidates = [
    dispatch.customerName,
    dispatch.customerNameSnapshot,
    dispatch.name,
    dispatch.customer?.name,
    dispatch.customer?.customerName,
  ].map(normalizeLookupKey).filter(Boolean);

  for (const name of nameCandidates) {
    const customer = lookups.byName?.get(name);
    if (customer) return customer;
  }

  return null;
};

const getCustomerRevenue = (customerId, orders = []) => (orders || []).reduce((sum, order) => {
  if (order?.isArchived || order?.customerId !== customerId) return sum;
  return sum + (toNumber(order.total) || toNumber(order.totalAmount) || toNumber(order.amount) || 0);
}, 0);

const getCustomerDebt = (customer = {}, orders = [], payments = []) => {
  const explicitDebt = toNumber(customer.debt ?? customer.totalDebt ?? customer.currentDebt);
  if (Number.isFinite(explicitDebt)) return explicitDebt;
  const orderDebt = (orders || []).reduce((sum, order) => {
    if (order?.isArchived || order?.customerId !== customer.id) return sum;
    const total = toNumber(order.total) || toNumber(order.totalAmount) || 0;
    const paid = toNumber(order.paidAmount) || toNumber(order.paid) || 0;
    return sum + Math.max(0, total - paid);
  }, 0);
  const loosePayments = (payments || []).reduce((sum, payment) => {
    if (payment?.isArchived || payment?.customerId !== customer.id) return sum;
    return sum + (toNumber(payment.amount) || 0);
  }, 0);
  return Math.max(0, orderDebt - loosePayments);
};

export const buildCustomerMapPoints = ({ customers = [], employees = [], orders = [], payments = [], warehouseDispatches = [] } = {}) => {
  const employeeLookup = new Map((employees || []).map(employee => [employee.id, employee]));
  return (customers || [])
    .filter(customer => customer && !customer.isArchived)
    .map(customer => {
      const coordinates = extractCustomerCoordinates(customer);
      if (!coordinates) return null;
      const employeeId = getCustomerEmployeeId(customer);
      const manager = employeeLookup.get(employeeId) || {};
      const dispatchCount = (warehouseDispatches || []).filter(dispatch => !dispatch?.isArchived && dispatch.customerId === customer.id).length;
      return {
        id: customer.id,
        customerId: customer.id,
        customerName: customer.name || customer.customerName || 'Khách hàng',
        phone: customer.phone || customer.phoneNumber || '',
        address: customer.address || customer.deliveryAddress || '',
        area: customer.area || customer.district || customer.province || '',
        branch: customer.branchName || customer.defaultBranchName || '',
        route: customer.route || customer.routeName || '',
        employeeId,
        employeeName: manager.name || customer.assignedEmployeeName || '',
        revenue: getCustomerRevenue(customer.id, orders),
        debt: getCustomerDebt(customer, orders, payments),
        orderCount: (orders || []).filter(order => !order?.isArchived && order.customerId === customer.id).length,
        dispatchCount,
        updatedAt: customer.updatedAt || customer.locationUpdatedAt || customer.createdAt || '',
        ...coordinates,
      };
    })
    .filter(Boolean);
};

export const filterMapPoints = (points = [], filters = {}) => {
  const keyword = normalizeText(filters.keyword);
  return (points || []).filter(point => {
    if (filters.employeeId && point.employeeId !== filters.employeeId) return false;
    if (filters.onlyDebt && !(point.debt > 0)) return false;
    if (filters.area && !normalizeText(point.area).includes(normalizeText(filters.area))) return false;
    if (!keyword) return true;
    const haystack = [
      point.customerName,
      point.phone,
      point.address,
      point.area,
      point.branch,
      point.route,
      point.employeeName,
    ].map(normalizeText).join(' ');
    return keyword.split(/\s+/).every(term => haystack.includes(term));
  });
};

export const calculateBounds = (points = []) => {
  const validPoints = (points || []).filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
  if (!validPoints.length) return null;
  return validPoints.reduce((bounds, point) => ({
    minLat: Math.min(bounds.minLat, point.latitude),
    maxLat: Math.max(bounds.maxLat, point.latitude),
    minLng: Math.min(bounds.minLng, point.longitude),
    maxLng: Math.max(bounds.maxLng, point.longitude),
  }), {
    minLat: validPoints[0].latitude,
    maxLat: validPoints[0].latitude,
    minLng: validPoints[0].longitude,
    maxLng: validPoints[0].longitude,
  });
};

export const clusterMapPoints = (points = [], zoom = 10) => {
  const gridSize = zoom >= 14 ? 0.002 : zoom >= 11 ? 0.01 : zoom >= 8 ? 0.05 : 0.12;
  const clusters = new Map();
  (points || []).forEach(point => {
    const latitude = toNumber(point.latitude);
    const longitude = toNumber(point.longitude);
    if (!isValidLatLng(latitude, longitude)) return;
    const key = `${Math.round(latitude / gridSize)}:${Math.round(longitude / gridSize)}`;
    const existing = clusters.get(key) || { id: key, latitude: 0, longitude: 0, count: 0, points: [] };
    existing.count += 1;
    existing.latitude += latitude;
    existing.longitude += longitude;
    existing.points.push(point);
    clusters.set(key, existing);
  });
  return Array.from(clusters.values()).map(cluster => ({
    ...cluster,
    latitude: cluster.latitude / cluster.count,
    longitude: cluster.longitude / cluster.count,
  }));
};

const toDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return '';
};

const resolveDispatchDateKey = (dispatch = {}) => (
  dispatch.date
  || dispatch.dispatchDate
  || dispatch.workingDate
  || toDateKey(dispatch.createdAt)
  || toDateKey(dispatch.updatedAt)
);

const resolveDispatchDriverId = (dispatch = {}) => (
  dispatch.driverId
  || dispatch.assignedDriverId
  || dispatch.deliveryDriverId
  || dispatch.driverEmployeeId
  || ''
);

export const buildDeliveryMissions = ({ warehouseDispatches = [], customers = [], employees = [], deliveryReports = [], driverLocations = [], date = '', currentDriverId = '' } = {}) => {
  const customerLookups = buildCustomerLookups(customers);
  const employeeLookup = new Map((employees || []).map(employee => [employee.id, employee]));
  const reportLookup = new Map((deliveryReports || []).filter(report => !report?.isArchived).map(report => [report.dispatchId || report.warehouseDispatchId, report]));
  const driverLocationLookup = new Map((driverLocations || []).map(location => [location.driverId || location.employeeId, location]));
  return (warehouseDispatches || [])
    .filter(dispatch => dispatch && !dispatch.isArchived)
    .filter(dispatch => !date || resolveDispatchDateKey(dispatch) === date)
    .filter(dispatch => !currentDriverId || resolveDispatchDriverId(dispatch) === currentDriverId)
    .map((dispatch, index) => {
      const customer = findCustomerForDispatch(dispatch, customerLookups) || {};
      const driverId = resolveDispatchDriverId(dispatch);
      const driver = employeeLookup.get(driverId) || {};
      const customerCoordinates = extractCustomerCoordinates(customer);
      const dispatchCoordinates = extractDispatchCoordinates(dispatch);
      // Hồ sơ khách hàng là nguồn vị trí chuẩn. Tọa độ trên phiếu xuất chỉ dùng dự phòng
      // để tránh lấy nhầm vị trí cũ khi khách đã cập nhật GPS trong phần Khách hàng.
      const coordinates = customerCoordinates || dispatchCoordinates || {};
      const report = reportLookup.get(dispatch.id) || {};
      const isDelivered = Boolean(report.id || dispatch.deliveryStatus === 'delivered' || dispatch.status === 'delivered');
      const resolvedCustomerId = dispatch.customerId || dispatch.customerID || customer.id || customer.customerId || '';
      return {
        id: dispatch.id,
        sequence: index + 1,
        dispatchId: dispatch.id,
        customerId: resolvedCustomerId,
        productId: dispatch.productId || '',
        customerName: dispatch.customerName || customer.name || 'Khách hàng',
        address: customer.address || dispatch.address || '',
        phone: customer.phone || dispatch.phone || '',
        driverId,
        driverName: driver.name || dispatch.driverName || 'Chưa chọn tài xế',
        driverLocation: extractDriverCoordinates(driverLocationLookup.get(driverId), driver),
        reportId: report.id || '',
        isDelivered,
        deliveredAt: report.deliveredAt || report.createdAt || dispatch.deliveredAt || '',
        status: isDelivered ? 'delivered' : dispatch.status || 'assigned',
        etaMinutes: Math.max(8, (index + 1) * 18),
        date: resolveDispatchDateKey(dispatch),
        itemSummary: dispatch.productName || dispatch.groupName || dispatch.productGroup || '',
        weight: toNumber(dispatch.weightKg ?? dispatch.kg ?? dispatch.totalKg) || 0,
        quantity: toNumber(dispatch.quantity ?? dispatch.count ?? dispatch.pieceCount) || 0,
        amount: toNumber(dispatch.amount ?? dispatch.totalAmount ?? dispatch.finalAmount ?? dispatch.total) || 0,
        hasDispatchGps: Boolean(dispatchCoordinates),
        hasCustomerGps: Boolean(customerCoordinates),
        gpsSource: customerCoordinates ? 'customer' : dispatchCoordinates ? 'dispatch' : '',
        ...coordinates,
      };
    });
};

export const buildRoutePolyline = (stops = [], warehouseLocation = null) => {
  const points = [];
  if (warehouseLocation && isValidLatLng(toNumber(warehouseLocation.latitude), toNumber(warehouseLocation.longitude))) {
    points.push({ ...warehouseLocation, type: 'warehouse' });
  }
  (stops || []).forEach(stop => {
    if (isValidLatLng(toNumber(stop.latitude), toNumber(stop.longitude))) points.push(stop);
  });
  return points;
};

const haversineKm = (a, b) => {
  const lat1 = toNumber(a?.latitude);
  const lon1 = toNumber(a?.longitude);
  const lat2 = toNumber(b?.latitude);
  const lon2 = toNumber(b?.longitude);
  if (!isValidLatLng(lat1, lon1) || !isValidLatLng(lat2, lon2)) return 0;
  const toRad = degree => degree * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLon * sinLon;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
};

export const estimateRouteMetrics = (points = []) => {
  const validPoints = (points || []).filter(point => isValidLatLng(toNumber(point.latitude), toNumber(point.longitude)));
  const distanceKm = validPoints.reduce((sum, point, index) => (
    index === 0 ? 0 : sum + haversineKm(validPoints[index - 1], point)
  ), 0);
  const etaMinutes = Math.round((distanceKm / 28) * 60 + Math.max(0, validPoints.length - 1) * 8);
  return { distanceKm, etaMinutes };
};

export const buildDispatchDashboard = (missions = [], employees = []) => {
  const activeDriverIds = new Set((missions || []).map(mission => mission.driverId).filter(Boolean));
  const delivered = missions.filter(mission => mission.status === 'delivered').length;
  const remaining = Math.max(0, missions.length - delivered);
  const driverCount = (employees || []).filter(employee => {
    const text = normalizeText(`${employee.position || ''} ${employee.role || ''} ${employee.department || ''}`);
    return text.includes('tài') || text.includes('tai') || text.includes('driver') || text.includes('giao');
  }).length;
  return {
    activeDrivers: activeDriverIds.size,
    stoppedDrivers: Math.max(0, driverCount - activeDriverIds.size),
    totalStops: missions.length,
    delivered,
    remaining,
    lateStops: missions.filter(mission => mission.etaMinutes > 120 && mission.status !== 'delivered').length,
    wrongRoute: 0,
  };
};

export const buildHeatmapBuckets = (points = [], metric = 'revenue') => {
  const maxValue = Math.max(1, ...(points || []).map(point => toNumber(point[metric]) || 0));
  return (points || []).map(point => {
    const value = toNumber(point[metric]) || 0;
    const ratio = Math.min(1, value / maxValue);
    return {
      ...point,
      heatValue: value,
      heatRatio: ratio,
      heatColor: ratio > 0.66 ? '#ef4444' : ratio > 0.33 ? '#f59e0b' : '#10b981',
    };
  });
};

export const buildOfflineRouteSnapshot = ({ missions = [], providerId = 'openstreetmap', createdAt = new Date().toISOString() } = {}) => ({
  providerId,
  createdAt,
  missions: (missions || []).map(mission => ({
    id: mission.id,
    customerId: mission.customerId,
    customerName: mission.customerName,
    latitude: mission.latitude,
    longitude: mission.longitude,
    address: mission.address,
    phone: mission.phone,
    sequence: mission.sequence,
    status: mission.status,
  })),
});

export const formatDistanceKm = (value = 0) => `${(toNumber(value) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;
export const formatEtaMinutes = (value = 0) => {
  const minutes = Math.max(0, Math.round(toNumber(value) || 0));
  if (minutes < 60) return `${minutes} phút`;
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
};

export class MapService {
  constructor({ providerId = 'openstreetmap', config = {} } = {}) {
    this.provider = createMapProvider(providerId, config);
  }

  get providerId() {
    return this.provider.id;
  }

  get providerLabel() {
    return this.provider.label;
  }

  buildCustomerMapPoints(args) {
    return buildCustomerMapPoints(args);
  }

  filterMapPoints(points, filters) {
    return filterMapPoints(points, filters);
  }

  buildDeliveryMissions(args) {
    return buildDeliveryMissions(args);
  }

  buildDispatchDashboard(missions, employees) {
    return buildDispatchDashboard(missions, employees);
  }

  buildRoutePolyline(stops, warehouseLocation) {
    return buildRoutePolyline(stops, warehouseLocation);
  }

  estimateRouteMetrics(points) {
    return estimateRouteMetrics(points);
  }

  buildHeatmapBuckets(points, metric) {
    return buildHeatmapBuckets(points, metric);
  }

  clusterMarker(points, zoom) {
    return this.provider.clusterMarker(points, zoom);
  }

  fitBounds(points) {
    return this.provider.fitBounds(points);
  }

  buildPointUrl(point) {
    return this.provider.buildPointUrl(point);
  }

  buildRouteUrl(points) {
    return this.provider.buildRouteUrl(points);
  }

  buildEmbedUrl(points, bounds) {
    return this.provider.buildEmbedUrl(points, bounds);
  }

  buildGeocodeQuery(point, currentCompany) {
    return buildGeocodeQuery(point, currentCompany);
  }

  geocodeAddress(query) {
    return geocodeAddress(query);
  }
}
