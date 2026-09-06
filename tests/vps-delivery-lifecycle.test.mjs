import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceVpsDelivery,
  assignVpsDelivery,
  loadVpsDeliveryMasters,
} from '../src/api/vpsDeliveryLifecycle.js';

const COMPANY = 'bff9801e-b2c3-4e35-9781-0bd883b2419a';
const DELIVERY = 'f210c09e-1f16-4ca3-a683-3113632c2317';
const DRIVER = 'c210c09e-1f16-4ca3-a683-3113632c2317';
const VEHICLE = 'b210c09e-1f16-4ca3-a683-3113632c2317';
const TEAM = 'a210c09e-1f16-4ca3-a683-3113632c2317';

const native = (status, extras = {}) => ({
  id: DELIVERY,
  companyId: COMPANY,
  status,
  metadata: { sourceRecordId: 'dispatch-1', sourceReport: { id: 'dispatch-1' } },
  lines: [{ productId: 'e210c09e-1f16-4ca3-a683-3113632c2317', quantity: 10 }],
  ...extras,
});

test('loads only current-tenant delivery masters', async () => {
  const result = await loadVpsDeliveryMasters({
    listLogisticsDrivers: async () => ({ items: [{ id: DRIVER, companyId: COMPANY, status: 'ACTIVE' }, { id: 'foreign', companyId: 'a210c09e-1f16-4ca3-a683-3113632c2317', status: 'ACTIVE' }] }),
    listLogisticsTeams: async () => ({ items: [{ id: TEAM, companyId: COMPANY }] }),
    listLogisticsVehicles: async () => ({ items: [{ id: VEHICLE, companyId: COMPANY, status: 'ACTIVE' }] }),
  }, { companyId: COMPANY });
  assert.deepEqual(result.drivers.map((item) => item.id), [DRIVER]);
  assert.deepEqual(result.teams.map((item) => item.id), [TEAM]);
  assert.deepEqual(result.vehicles.map((item) => item.id), [VEHICLE]);
});

test('assigns an actual VPS driver then advances DRAFT to ASSIGNED exactly once', async () => {
  const calls = [];
  let current = native('DRAFT');
  const api = {
    getLogisticsDelivery: async () => current,
    assignLogisticsDelivery: async (id, payload) => {
      calls.push({ kind: 'assign', id, payload });
      current = native('DRAFT', { assignments: [{ ...payload, companyId: COMPANY }] });
      return current;
    },
    transitionLogisticsDelivery: async (id, payload) => {
      calls.push({ kind: 'transition', id, payload });
      current = native('ASSIGNED', { assignments: current.assignments });
      return current;
    },
  };
  const result = await assignVpsDelivery(api, { companyId: COMPANY }, { id: DELIVERY, vpsDelivery: true }, {
    driverId: DRIVER,
    vehicleId: VEHICLE,
    teamId: TEAM,
  });
  assert.equal(result.deliveryStatus, 'assigned');
  assert.deepEqual(calls.map((call) => call.kind), ['assign', 'transition']);
  assert.equal(calls[1].payload.transitionCode, 'ASSIGN');
});

test('refuses assignment without a real VPS driver', async () => {
  const completeApi = {
    getLogisticsDelivery: async () => native('DRAFT'),
    assignLogisticsDelivery: async () => native('DRAFT'),
    transitionLogisticsDelivery: async () => native('ASSIGNED'),
  };
  await assert.rejects(
    () => assignVpsDelivery(completeApi, { companyId: COMPANY }, { id: DELIVERY, vpsDelivery: true }),
    { code: 'VPS_DELIVERY_DRIVER_REQUIRED' },
  );
});

test('allows exactly the next native lifecycle transition and rejects a jump', async () => {
  const calls = [];
  const api = {
    getLogisticsDelivery: async () => native('LOADING'),
    transitionLogisticsDelivery: async (id, payload) => {
      calls.push({ id, payload });
      return native('DEPARTED');
    },
  };
  const result = await advanceVpsDelivery(api, { companyId: COMPANY }, { id: DELIVERY, vpsDelivery: true }, { transitionCode: 'DEPART' });
  assert.equal(result.deliveryStatus, 'departed');
  assert.equal(calls[0].payload.transitionCode, 'DEPART');
  await assert.rejects(
    () => advanceVpsDelivery(api, { companyId: COMPANY }, { id: DELIVERY, vpsDelivery: true }, { transitionCode: 'DELIVER' }),
    { code: 'VPS_DELIVERY_TRANSITION_INVALID' },
  );
});
