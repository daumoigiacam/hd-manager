import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';

import {
  DELIVERY_ROUTE_REROUTE_DISTANCE_METERS,
  buildDeliveryRouteCacheKey,
  getDeliveryCustomerLocationState,
  getDeliveryGpsQuality,
  getPendingDeliveryMapPoints,
  normalizeDeliveryGpsPosition,
  shouldAcceptDeliveryGpsPosition,
  shouldRefreshDeliveryRoute,
} from '../src/utils/deliveryMapNavigation.js';
import { buildDeliveryMissions } from '../src/services/mapEngineService.js';

const test = (name, callback) => {
  callback();
  console.log(`PASS ${name}`);
};

const now = Date.now();
const makePosition = (overrides = {}) => normalizeDeliveryGpsPosition({
  coords: { latitude: 10.7769, longitude: 106.7009, accuracy: 12, ...overrides },
  timestamp: now + 1_000,
}, { receivedAt: now + 1_000 });

test('normalizes GPS timestamps and keeps only fresh, valid locations', () => {
  const normalized = makePosition();
  assert.equal(normalized.timestampMs, now + 1_000);
  assert.equal(normalized.speedKmh, null);
  assert.equal(getDeliveryGpsQuality(normalized, { now: now + 2_000 }).isUsable, true);
  assert.equal(shouldAcceptDeliveryGpsPosition(null, normalizeDeliveryGpsPosition({
    coords: { latitude: 10.7, longitude: 106.7, accuracy: 8 }, timestamp: now - 40_000,
  }, { receivedAt: now }), { now }), false);
});

test('rejects inaccurate jitter and impossible GPS jumps without rejecting normal travel', () => {
  const previous = makePosition();
  const jitter = normalizeDeliveryGpsPosition({
    coords: { latitude: 10.77691, longitude: 106.70091, accuracy: 20 }, timestamp: now + 1_400,
  }, { receivedAt: now + 1_400 });
  const impossibleJump = normalizeDeliveryGpsPosition({
    coords: { latitude: 11.7769, longitude: 107.7009, accuracy: 10 }, timestamp: now + 3_000,
  }, { receivedAt: now + 3_000 });
  const normalTravel = normalizeDeliveryGpsPosition({
    coords: { latitude: 10.7778, longitude: 106.7016, accuracy: 10 }, timestamp: now + 90_000,
  }, { receivedAt: now + 90_000 });
  assert.equal(shouldAcceptDeliveryGpsPosition(previous, jitter, { now: now + 1_400 }), false);
  assert.equal(shouldAcceptDeliveryGpsPosition(previous, impossibleJump, { now: now + 3_000 }), false);
  assert.equal(shouldAcceptDeliveryGpsPosition(previous, normalTravel, { now: now + 90_000 }), true);
});

test('reroutes only after meaningful movement and cache keys are stable for nearby GPS points', () => {
  const origin = makePosition();
  const nearby = normalizeDeliveryGpsPosition({
    coords: { latitude: 10.7770, longitude: 106.7010, accuracy: 12 }, timestamp: now + 20_000,
  }, { receivedAt: now + 20_000 });
  const moved = normalizeDeliveryGpsPosition({
    coords: { latitude: 10.7780, longitude: 106.7020, accuracy: 12 }, timestamp: now + 40_000,
  }, { receivedAt: now + 40_000 });
  assert.equal(shouldRefreshDeliveryRoute(origin, nearby), false);
  assert.equal(shouldRefreshDeliveryRoute(origin, moved), true);
  assert.ok(DELIVERY_ROUTE_REROUTE_DISTANCE_METERS >= 75);
  const target = { latitude: 10.8, longitude: 106.72 };
  assert.equal(buildDeliveryRouteCacheKey({ origin, target }), buildDeliveryRouteCacheKey({ origin: { ...origin, latitude: origin.latitude + 0.00001 }, target }));
});

test('keeps delivered missions out of the active map and list', () => {
  const pending = getPendingDeliveryMapPoints([
    { id: 'pending-1', status: 'assigned' },
    { id: 'done-1', status: 'delivered' },
    { id: 'done-2', isDelivered: true },
  ]);
  assert.deepEqual(pending.map(point => point.id), ['pending-1']);
});

test('does not hide a dispatch merely because a draft VPS delivery report exists', () => {
  const missions = buildDeliveryMissions({
    warehouseDispatches: [{ id: 'dispatch-1', customerId: 'customer-1', date: '2026-09-06' }],
    customers: [{ id: 'customer-1', name: 'Customer', location: { lat: 10.7, lng: 106.7 } }],
    deliveryReports: [{ id: 'delivery-1', dispatchId: 'dispatch-1', deliveryStatus: 'draft', isDelivered: false }],
    date: '2026-09-06',
  });
  assert.equal(missions.length, 1);
  assert.equal(missions[0].isDelivered, false);
});

test('distinguishes a missing customer pin from a device GPS position that is still loading', () => {
  assert.deepEqual(
    getDeliveryCustomerLocationState({ customerPosition: { latitude: 10.7, longitude: 106.7 } }),
    { key: 'waiting_for_device_location', label: 'Đã có vị trí khách • đang chờ GPS thiết bị' }
  );
  assert.deepEqual(
    getDeliveryCustomerLocationState({ customerPosition: {} }),
    { key: 'missing_customer_location', label: 'Chưa có vị trí khách' }
  );
  assert.equal(
    getDeliveryCustomerLocationState({
      customerPosition: { latitude: 10.7, longitude: 106.7 },
      originPosition: { latitude: 10.8, longitude: 106.8 },
    }).key,
    'ready'
  );
});

test('prepares 5, 20, 50 and 100 map markers within one responsive frame', () => {
  [5, 20, 50, 100].forEach(count => {
    const warehouseDispatches = Array.from({ length: count }, (_, index) => ({
      id: `dispatch-${index}`,
      customerId: `customer-${index}`,
      date: '2026-08-24',
      status: 'assigned',
    }));
    const customers = Array.from({ length: count }, (_, index) => ({
      id: `customer-${index}`,
      name: `Customer ${index}`,
      location: { lat: 10.7 + index / 10_000, lng: 106.6 + index / 10_000 },
    }));
    const startedAt = performance.now();
    const missions = buildDeliveryMissions({ warehouseDispatches, customers, date: '2026-08-24' });
    const pending = getPendingDeliveryMapPoints(missions);
    const elapsedMs = performance.now() - startedAt;
    assert.equal(pending.length, count);
    assert.ok(elapsedMs < 16, `${count} markers prepared in ${elapsedMs.toFixed(2)}ms`);
  });
});

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
test('map rendering keeps marker instances stable and delivery completion is idempotent', () => {
  assert.match(appSource, /const markersRef = useRef\(new Map\(\)\)/);
  assert.match(appSource, /deliveryStatus: 'delivered'/);
  assert.match(appSource, /idempotencyKey: `map_delivery:\$\{mission\.dispatchId\}`/);
  assert.match(appSource, /setOptimisticDeliveredIds\(prev => prev\.includes\(markerId\) \? prev : \[\.\.\.prev, markerId\]\);/);
  assert.match(appSource, /const result = await requestCurrentLocation\(\);/);
  assert.match(appSource, /void getCurrentMapPosition\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(appSource, /getDeliveryCustomerLocationState\(\{/);
});

test('uses the native Capacitor watcher for APK navigation and keeps a fresh GPS fallback', () => {
  assert.match(appSource, /const cachedPosition = getCachedMapPosition\(\);/);
  assert.match(appSource, /return cachedPosition;/);
  assert.match(appSource, /if \(isNativeRuntime\(\)\) \{\s*void Geolocation\.watchPosition\(/);
  assert.match(appSource, /Geolocation\.clearWatch\(\{ id: nativeWatchId \}\)/);
  assert.match(appSource, /App chưa được cấp quyền vị trí/);
  assert.match(appSource, /Dịch vụ vị trí chưa sẵn sàng/);
  assert.match(appSource, /Đang chờ tín hiệu GPS chính xác\. App tạm tính tuyến từ kho và sẽ tự cập nhật khi nhận được vị trí\./);
  assert.match(appSource, /Đang chờ tín hiệu GPS để cập nhật tuyến\./);
  assert.doesNotMatch(appSource, /Chưa lấy được vị trí hiện tại\. Hãy bật GPS rồi bấm Chỉ đường lại\./);
  assert.doesNotMatch(appSource, /Chưa đủ dữ liệu vị trí để tính tuyến\./);
  assert.doesNotMatch(appSource, /setNavigationLocationError\(currentPosition \? '' : 'Chưa lấy được GPS hiện tại/);
});

console.log('\ndelivery map navigation tests: PASS');
