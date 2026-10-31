import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequestDeliveryLookup, buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';

const url = new URL('../src/services/executiveDashboardService.js', import.meta.url);
const source = readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const pattern = /export const createRequestDeliveryLookup = [\s\S]*?\n};(?=\n\nconst inventoryValueOfImports)/;
assert.ok(pattern.test(source), 'replace exactly the optimized delivery membership function for the independent full-scan oracle');
const baseline = source.replace(pattern, `export const createRequestDeliveryLookup = (dispatches = []) => (request = {}) => {
  const signature = buildRequestSignature(request);
  const requestTime = parseDate(getDateValue(request))?.getTime() || 0;
  return dispatches.some(dispatch => {
    if (buildDispatchSignature(dispatch) !== signature) return false;
    const dispatchTime = parseDate(getDateValue(dispatch))?.getTime() || 0;
    return !requestTime || !dispatchTime || dispatchTime >= requestTime;
  });
};`).replace(/from '([^']+)'/g, (_, relative) => `from '${new URL(relative, url).href}'`);
const oracle = await import(`data:text/javascript;base64,${Buffer.from(baseline).toString('base64')}`);

test('delivery index matches original signature/date rules and all dashboard output through edits and tenant changes', () => {
  const dates = ['', 'invalid', '1/10/2026', '2026-10-02', '2026-10-02T00:00:00Z', 0, -1, { seconds: 1790899200 }];
  const requests = Array.from({ length: 160 }, (_, i) => ({ id: `r${i}`, customerId: i % 7 ? `c${i % 13}` : '',
    customerName: i % 2 ? 'Chị Trang' : 'CHI TRANG', productId: i % 3 ? `p${i % 5}` : '', productName: i % 2 ? 'Vịt To' : 'VIT TO',
    date: dates[i % dates.length], status: i % 17 ? 'open' : 'cancelled', isArchived: i % 19 === 0 }));
  const dispatches = Array.from({ length: 310 }, (_, i) => ({ ...requests[i % requests.length], id: `d${i}`, date: dates[(i + 2) % dates.length],
    __pendingFirebaseSync: i % 23 === 0 }));
  const input = { now: '2026-10-31T12:00:00', orderRequests: requests, warehouseDispatches: dispatches,
    orders: [{ id: 'o', customerId: 'c1', date: '2026-10-03', amount: 1000 }], expenses: [{ id: 'e', date: '2026-10-03', amount: 20 }] };
  const strip = ({ generatedAt: _time, ...rest }) => rest;
  for (const rows of [dispatches, dispatches.map((r, i) => i === 4 ? { ...r, customerId: 'c1', date: '2026-10-31' } : r), dispatches.slice(20), [], dispatches]) {
    const indexed = createRequestDeliveryLookup(rows), full = oracle.createRequestDeliveryLookup(rows);
    for (const request of requests) assert.equal(indexed(request), full(request));
    assert.deepEqual(strip(buildExecutiveDashboardSnapshot({ ...input, warehouseDispatches: rows })), strip(oracle.buildExecutiveDashboardSnapshot({ ...input, warehouseDispatches: rows })));
  }
  const anotherTenant = [{ customerId: 'c1', productId: 'p1', date: '2026-10-31' }];
  assert.equal(createRequestDeliveryLookup(anotherTenant)({ customerId: 'c1', productId: 'p1', date: '2026-11-01' }), false);
});

test('dispatch signatures are read once for hundreds of request lookups', () => {
  let reads = 0;
  const dispatches = Array.from({ length: 5000 }, (_, i) => ({ customerId: `c${i % 200}`, date: '2026-10-31',
    get productId() { reads++; return `p${i % 5}`; } }));
  const lookup = createRequestDeliveryLookup(dispatches);
  assert.equal(reads, dispatches.length);
  for (let i = 0; i < 400; i++) lookup({ customerId: `c${i % 200}`, productId: `p${i % 5}`, date: '2026-10-30' });
  assert.equal(reads, dispatches.length, 'requests do not rescan dispatch signatures');
});
