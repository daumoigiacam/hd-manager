import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';
import {
  archiveVpsAsset, getVpsAssetFormDefaults, isVpsAssetHrEmployee, loadVpsAssetDetails,
  loadVpsAssets, mergeVpsAssets, normalizeVpsAsset, saveVpsAsset, vpsAssetErrorMessage,
  vpsAssetMutationPayload, vpsAssetQuery,
} from '../src/api/vpsAssets.js';

const COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VEHICLE = 'eeeeeeee-eeee-5eee-8eee-eeeeeeeeeeee';
const EVENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REQUEST = '11111111-1111-4111-8111-111111111111';
const V1 = '2026-09-06T01:00:00.000Z';
const V2 = '2026-09-06T01:00:00.001Z';
const session = { id: USER, companyId: COMPANY, permissions: ['logistics.read', 'logistics.manage'] };
const employees = [{ id: HR, companyId: COMPANY, vpsEmployee: true, status: 'ACTIVE', isArchived: false, userId: USER }];
const baseProfile = { name: 'Truck', type: 'VEHICLE', plateNumber: 'TEST-001', vehicleType: 'TRUCK', driverIds: [], status: 'active', inspectionExpiry: null };
const response = (patch = {}) => ({
  id: VEHICLE, companyId: COMPANY, code: 'TRUCK-001', licensePlate: 'TEST-001', vehicleType: 'TRUCK',
  nativeStatus: 'AVAILABLE', version: V1, isArchived: false, archivedAt: null, archivedByUserId: null,
  createdAt: V1, provenance: { kind: 'NATIVE_CREATE', sourceMapping: 'NOT_ASSERTED' }, asset: { ...baseProfile }, ...patch,
});
const native = (patch = {}) => normalizeVpsAsset(response(patch), COMPANY);
const form = (patch = {}) => ({ ...getVpsAssetFormDefaults(), ...baseProfile, code: 'TRUCK-001', ...patch });
function savedResponse(body, current = null, archive = false) {
  const asset = { ...(current?.vpsAssetProfile ?? baseProfile), ...(body.asset ?? {}) };
  asset.plateNumber = asset.plateNumber.toUpperCase();
  return response({
    id: current?.id ?? VEHICLE, code: current?.code ?? body.code, asset,
    licensePlate: asset.plateNumber, vehicleType: asset.vehicleType,
    nativeStatus: asset.status === 'maintenance' ? 'MAINTENANCE' : asset.status === 'inactive' ? 'INACTIVE' : current?.nativeStatus ?? 'AVAILABLE',
    version: current ? new Date(Date.parse(current.version) + 1).toISOString() : V1,
    isArchived: archive, archivedAt: archive ? V2 : null, archivedByUserId: archive ? USER : null,
    handoverEventId: body.handover?.eventId ?? null,
  });
}
const code = expected => error => { assert.equal(error.code, expected); return true; };
const noNetwork = new Proxy({}, { get: () => () => assert.fail('Unexpected network call') });
const event = (patch = {}) => ({
  eventId: EVENT, driverIds: [HR], date: '2026-09-06', km: 123.5, condition: 'Checked', note: 'At depot', imageUrl: null,
  vehicleId: VEHICLE, actorUserId: USER, requestId: REQUEST, recordedAt: V1, evidenceStatus: 'NO_EVIDENCE', ...patch,
});

test('manager assets use exact vehicle routes, string queries and body-only retry UUIDs', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (...args) => { calls.push(['GET', ...args]); },
    post: async (...args) => { calls.push(['POST', ...args]); },
    patch: async (...args) => { calls.push(['PATCH', ...args]); },
  });
  const base = '/logistics-suite/manager-assets';
  await api.listManagerAssets({ limit: '100', includeArchived: 'true' });
  await api.getManagerAsset(VEHICLE);
  await api.createManagerAsset({ requestId: REQUEST, code: 'TRUCK-001', asset: baseProfile });
  await api.updateManagerAsset(VEHICLE, { requestId: REQUEST, version: V1, asset: { name: 'Changed' } });
  await api.archiveManagerAsset(VEHICLE, { requestId: REQUEST, version: V1 });
  assert.deepEqual(calls[0], ['GET', base, { query: { limit: '100', offset: '0', includeArchived: 'true' } }]);
  assert.deepEqual(calls[1], ['GET', `${base}/${VEHICLE}`, { query: { limit: '50', offset: '0' } }]);
  assert.deepEqual(calls[2], ['POST', base, { requestId: REQUEST, code: 'TRUCK-001', codeOrigin: 'PROVIDED', asset: baseProfile }, { retry: false }]);
  assert.deepEqual(calls[3], ['PATCH', `${base}/${VEHICLE}`, { requestId: REQUEST, version: V1, asset: { name: 'Changed' } }, { retry: false }]);
  assert.deepEqual(calls[4], ['POST', `${base}/${VEHICLE}/archive`, { requestId: REQUEST, version: V1 }, { retry: false }]);
});

test('native response flattens into Manager UI without guessing name, assignment, subtype or status', () => {
  const result = native({ nativeStatus: 'IN_TRANSIT', asset: { ...baseProfile, name: null } });
  assert.equal(result.name, null);
  assert.equal(result.status, 'active');
  assert.equal(result.nativeStatus, 'IN_TRANSIT');
  assert.equal(result.version, V1);
  assert.equal(result.type, 'VEHICLE');
  assert.deepEqual(result.driverIds, []);
  assert.equal(result.assignedDriverId, undefined);
  assert.equal(result.vpsAsset, true);
  assert.throws(() => normalizeVpsAsset(response({ companyId: FOREIGN }), COMPANY), code('MANAGER_ASSET_SCOPE_MISMATCH'));
  for (const bad of [{ version: 1 }, { version: '2026-09-06' }, { licensePlate: '' }, { vehicleType: '' }, { asset: { ...baseProfile, type: 'MACHINE' } }]) {
    assert.throws(() => normalizeVpsAsset(response(bad), COMPANY));
  }
});

test('create normalizes blank optional values explicitly, not zero, and preserves independent native subtype', async () => {
  let sent;
  const result = await saveVpsAsset({ createManagerAsset: async body => { sent = body; return savedResponse(body); } }, session, null,
    form({ vehicleType: 'VAN', fuelNorm: '12,5', nextMaintenanceKm: '0' }), employees);
  assert.equal(sent.asset.vehicleType, 'VAN');
  assert.equal(sent.asset.fuelNorm, 12.5);
  assert.equal(sent.asset.nextMaintenanceKm, 0);
  assert.equal(sent.asset.tankCapacity, null);
  assert.equal(sent.asset.registrationDate, null);
  assert.equal(sent.asset.registrationImageUrl, null);
  assert.equal(sent.handover, undefined);
  assert.equal(result.vehicleType, 'VAN');
  assert.match(sent.requestId, /^[0-9a-f-]{14}4[0-9a-f-]+$/);
});

test('nonvehicles, missing explicit identity, unknown/legacy aliases and prototype payloads fail closed', async () => {
  for (const patch of [{ type: '' }, { type: 'MACHINE' }, { type: 'TRUCK' }, { code: '' }, { plateNumber: '' }, { vehicleType: '' }, { name: ' Truck ' }, { assignedDriverId: HR }, { assignedDriverIds: [HR] }, { driverId: HR }, { handoverHistory: [] }, { metadata: {} }, { companyId: FOREIGN }, { cost: 50 }]) {
    await assert.rejects(saveVpsAsset(noNetwork, session, null, form(patch), employees));
  }
  const malicious = JSON.parse('{"requestId":"11111111-1111-4111-8111-111111111111","code":"X","asset":{"type":"VEHICLE","__proto__":{}}}');
  assert.throws(() => vpsAssetMutationPayload('create', malicious), code('MANAGER_ASSET_INVALID_PAYLOAD'));
  assert.throws(() => vpsAssetMutationPayload('create', { requestId: REQUEST, code: 'X', codeOrigin: 'REQUEST_ID_DERIVED', asset: baseProfile }));
});

test('dates, numbers and HTTPS references enforce backend bounds without provider access', async () => {
  for (const patch of [{ fuelNorm: -1 }, { fuelNorm: '1kg' }, { fuelNorm: 1.0001 }, { fuelNorm: 1e-4 }, { tankCapacity: 1_000_000_001 }, { currentKm: Infinity }, { nextMaintenanceDate: '2026-02-30' }, { registrationDate: '0000-01-01' }, { inspectionImageUrl: 'data:image/png;base64,x' }, { registrationImageUrl: 'http://example.test/a' }, { registrationImageUrl: 'https://user:secret@example.test/a' }, { registrationImageUrls: Array(9).fill('https://example.test/a') }]) {
    await assert.rejects(saveVpsAsset(noNetwork, session, null, form(patch), employees));
  }
  const good = form({ fuelNorm: 0.001, registrationDate: '2024-02-29', registrationImageUrl: 'https://example.test/reference' });
  assert.equal((await saveVpsAsset({ createManagerAsset: async body => savedResponse(body) }, session, null, good, employees)).fuelNorm, 0.001);
});

test('driver refs use only same-company ACTIVE native HR rows, never users/logistics/legacy aliases', async () => {
  assert.equal(isVpsAssetHrEmployee(employees[0], COMPANY), true);
  for (const records of [[], [{ ...employees[0], vpsEmployee: false }], [{ ...employees[0], companyId: FOREIGN }], [{ ...employees[0], status: 'INACTIVE' }], [{ ...employees[0], isArchived: true }], [{ ...employees[0], id: USER, vpsEmployee: false }]]) {
    await assert.rejects(saveVpsAsset(noNetwork, session, null, form({ driverIds: [HR] }), records), code('MANAGER_ASSET_HR_RECONCILIATION_REQUIRED'));
  }
  await assert.rejects(saveVpsAsset(noNetwork, session, null, form({ driverIds: [USER] }), employees), code('MANAGER_ASSET_HR_RECONCILIATION_REQUIRED'));
  await assert.rejects(saveVpsAsset(noNetwork, session, null, form({ driverIds: ['employee_legacy'] }), employees));
  await assert.rejects(saveVpsAsset(noNetwork, session, null, form({ driverIds: [HR, HR] }), employees));
});

test('profile assignment does not imply handover, and handover-only does not alter assignees', async () => {
  const current = native();
  let body;
  const api = { updateManagerAsset: async (id, data) => { body = data; return savedResponse(data, current); } };
  await saveVpsAsset(api, session, current, { ...getVpsAssetFormDefaults(current), driverIds: [HR] }, employees);
  assert.deepEqual(body.asset, { driverIds: [HR] });
  assert.equal(body.handover, undefined);
  await saveVpsAsset(api, session, current, { ...getVpsAssetFormDefaults(current), recordHandover: true, handoverDriverIds: [HR], handoverDate: '2026-09-06', handoverKm: '123.5' }, employees);
  assert.equal(body.asset, undefined);
  assert.deepEqual(body.handover.driverIds, [HR]);
  assert.equal(body.handover.km, 123.5);
  await assert.rejects(saveVpsAsset(noNetwork, session, current, { ...getVpsAssetFormDefaults(current), handoverDate: '2026-09-06' }, employees), code('MANAGER_ASSET_HANDOVER_INTENT_REQUIRED'));
});

test('profile edits can preserve inactive existing HR references; explicit unassignment remains []', async () => {
  const current = native({ asset: { ...baseProfile, driverIds: [HR] } });
  const bodies = [];
  const api = { updateManagerAsset: async (id, data) => { bodies.push(data); return savedResponse(data, current); } };
  await saveVpsAsset(api, session, current, { ...getVpsAssetFormDefaults(current), name: 'Renamed' }, []);
  assert.equal(bodies[0].asset.driverIds, undefined);
  await saveVpsAsset(api, session, current, { ...getVpsAssetFormDefaults(current), driverIds: [] }, []);
  assert.deepEqual(bodies[1].asset.driverIds, []);
});

test('create retries use stable request AND event UUIDs; actor/content/version/vehicle separate commands', async () => {
  const commands = [];
  const api = { createManagerAsset: async body => { commands.push(body); throw new Error('offline'); } };
  const data = form({ recordHandover: true, handoverDate: '2026-09-06', handoverKm: '10', handoverDriverIds: [HR] });
  await assert.rejects(saveVpsAsset(api, session, null, data, employees), /offline/);
  await assert.rejects(saveVpsAsset(api, session, null, { ...data, name: 'Other' }, employees), /offline/);
  await assert.rejects(saveVpsAsset(api, session, null, { ...data }, employees), /offline/);
  await assert.rejects(saveVpsAsset(api, { ...session, id: FOREIGN }, null, data, employees), /offline/);
  assert.equal(commands[0].requestId, commands[2].requestId);
  assert.equal(commands[0].handover.eventId, commands[2].handover.eventId);
  assert.notEqual(commands[0].requestId, commands[1].requestId);
  assert.notEqual(commands[0].handover.eventId, commands[1].handover.eventId);
  assert.notEqual(commands[0].requestId, commands[3].requestId);
  const current = native();
  const writes = [];
  const update = { updateManagerAsset: async (id, body) => { writes.push(body); throw new Error('conflict'); }, archiveManagerAsset: async (id, body) => { writes.push(body); throw new Error('conflict'); } };
  const send = row => assert.rejects(saveVpsAsset(update, session, row, { ...getVpsAssetFormDefaults(row), name: 'Edit' }), /conflict/);
  await send(current); await send(current); await send(native({ version: V2 })); await send(native({ id: FOREIGN }));
  await assert.rejects(archiveVpsAsset(update, session, current), /conflict/);
  await assert.rejects(archiveVpsAsset(update, session, current), /conflict/);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.equal(new Set([0, 2, 3, 4].map(i => writes[i].requestId)).size, 4);
  assert.equal(writes[4].requestId, writes[5].requestId);
});

test('legacy/unmapped and stale form versions cannot be mutated or silently upgraded', async () => {
  const current = native();
  for (const legacy of [{ ...current, vpsAsset: false }, { ...current, version: 2 }, { ...current, version: 'legacy' }]) {
    await assert.rejects(saveVpsAsset(noNetwork, session, legacy, getVpsAssetFormDefaults(legacy)), code('reconciliation_required'));
    await assert.rejects(archiveVpsAsset(noNetwork, session, legacy), code('reconciliation_required'));
  }
  await assert.rejects(saveVpsAsset(noNetwork, session, current, { ...getVpsAssetFormDefaults(current), vpsAssetVersion: V2, name: 'Edit' }), code('MANAGER_ASSET_CHANGED_RELOAD'));
  await assert.rejects(archiveVpsAsset(noNetwork, session, { ...current, type: 'MACHINE' }), code('MANAGER_ASSET_VEHICLE_ONLY'));
});

test('permissions and response scope/version/event verification fail before local state updates', async () => {
  await assert.rejects(saveVpsAsset(noNetwork, { ...session, permissions: [] }, null, form()), code('MANAGER_ASSET_PERMISSION_REQUIRED'));
  await assert.rejects(loadVpsAssets(noNetwork, { ...session, permissions: ['logistics.manage'] }), code('MANAGER_ASSET_PERMISSION_REQUIRED'));
  const current = native();
  for (const patch of [{ companyId: FOREIGN }, { id: FOREIGN }, { version: V1 }, { handoverEventId: EVENT }, { code: 'OTHER' }]) {
    await assert.rejects(saveVpsAsset({ updateManagerAsset: async (id, body) => ({ ...savedResponse(body, current), ...patch }) }, session, current, { ...getVpsAssetFormDefaults(current), name: 'Changed' }));
  }
  await assert.rejects(archiveVpsAsset({ archiveManagerAsset: async (id, body) => savedResponse(body, current, false) }, session, current));
  assert.equal(current.version, V1);
  assert.match(vpsAssetErrorMessage({ status: 409, code: 'MANAGER_ASSET_CHANGED_RELOAD' }), /Mở lại/);
});

test('offset list loading verifies all tenants/pages, includes archives and does not truncate', async () => {
  const all = Array.from({ length: 103 }, (_, i) => response({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  const queries = [];
  const loaded = await loadVpsAssets({ listManagerAssets: async query => { queries.push(query); const offset = Number(query.offset); return { items: all.slice(offset, offset + 100), nextOffset: offset === 0 ? 100 : null }; } }, session);
  assert.equal(loaded.items.length, 103);
  assert.deepEqual(queries, [0, 100].map(offset => ({ limit: '100', offset: String(offset), includeArchived: 'true' })));
  for (const read of [
    async () => ({ items: [response({ companyId: FOREIGN })], nextOffset: null }),
    async () => ({ items: [response(), response()], nextOffset: null }),
    async () => ({ items: [response()], nextOffset: 100 }),
    async () => ({ items: [], nextOffset: 0 }),
    async query => Number(query.offset) === 0 ? { items: all.slice(0, 100), nextOffset: 100 } : Promise.reject(new Error('offline')),
  ]) await assert.rejects(loadVpsAssets({ listManagerAssets: read }, session));
  await assert.rejects(loadVpsAssets(noNetwork, session, { cancelled: () => true }), code('MANAGER_ASSET_LOAD_CANCELLED'));
});

test('detail loads append-only handover ledger separately from legacy history and rejects malformed evidence/actors', async () => {
  const detail = await loadVpsAssetDetails({ getManagerAsset: async () => response({ handoverHistory: { items: [event()], nextOffset: null } }) }, session, VEHICLE);
  assert.deepEqual(detail.vpsHandoverHistory, [event()]);
  assert.equal(detail.handoverHistory, undefined);
  for (const item of [event({ vehicleId: FOREIGN }), event({ actorUserId: 'employee_legacy' }), event({ evidenceStatus: 'VERIFIED' }), event({ imageUrl: 'data:abc' })]) {
    await assert.rejects(loadVpsAssetDetails({ getManagerAsset: async () => response({ handoverHistory: { items: [item], nextOffset: null } }) }, session, VEHICLE));
  }
});

test('native/legacy merge dedupes exact IDs only, preserves raw history and never regresses newer native versions', () => {
  const legacy = { id: VEHICLE, companyId: COMPANY, type: 'VEHICLE', name: 'Old', handoverHistory: [{ id: 'old', extra: { preserve: true } }] };
  const otherLegacy = { ...legacy, id: 'asset_old' };
  const merged = mergeVpsAssets([legacy, otherLegacy, legacy], [native(), native({ id: FOREIGN })], COMPANY);
  assert.equal(merged.length, 3);
  assert.equal(merged[0], legacy);
  assert.equal(merged[1], otherLegacy);
  const newer = { ...native({ version: V2 }), vpsHandoverHistory: [event()], handoverHistory: legacy.handoverHistory };
  assert.equal(mergeVpsAssets([newer], [native()], COMPANY)[0], newer);
  const refreshed = mergeVpsAssets([newer], [native({ version: V2 })], COMPANY)[0];
  assert.equal(refreshed.handoverHistory, legacy.handoverHistory);
  assert.deepEqual(refreshed.vpsHandoverHistory, [event()]);
  assert.throws(() => mergeVpsAssets([newer], [{ ...native({ version: V2 }), vpsHandoverHistory: [] }], COMPANY), code('reconciliation_required'));
});

test('query and low-level payload validation never allow general assets, finance or history rewrites', () => {
  for (const query of [{ limit: 100 }, { offset: '-1' }, { limit: '101' }, { includeArchived: true }, { companyId: COMPANY }]) assert.throws(() => vpsAssetQuery(query));
  assert.throws(() => vpsAssetQuery({ includeArchived: 'true' }, true));
  for (const asset of [{ handoverHistory: [] }, { assignedDriverIds: [] }, { expenseId: USER }, { type: 'EQUIPMENT' }]) {
    assert.throws(() => vpsAssetMutationPayload('update', { requestId: REQUEST, version: V1, asset }));
  }
});

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const rootSource = app.slice(app.indexOf('  const handleGetAsset ='), app.indexOf('  const handleAddAssetCostLog ='));
function rootHandlers(api, previous = [native()]) {
  let state = previous;
  let updates = 0;
  const bindings = { isVpsApiMode: true, currentUser: session, myCompanyId: COMPANY, rawAssets: previous, rawEmployees: employees,
    getHdConnectStagingApi: () => api, saveVpsAsset, archiveVpsAsset, loadVpsAssetDetails, mergeVpsAssets,
    setRawAssets: update => { updates++; state = update(state); }, firebaseUser: null,
  };
  return { ...new Function(...Object.keys(bindings), `${rootSource}\nreturn { handleGetAsset, handleAddAsset, handleEditAsset, handleDeleteAsset };`)(...Object.values(bindings)), state: () => state, updates: () => updates };
}

test('actual App handlers propagate failure without optimistic/Firebase writes and reject stale archives', async () => {
  const current = native();
  const previous = [current];
  const failing = rootHandlers({ createManagerAsset: async () => { throw new Error('offline'); }, updateManagerAsset: async () => { throw new Error('conflict'); }, archiveManagerAsset: async () => { throw new Error('conflict'); } }, previous);
  await assert.rejects(failing.handleAddAsset('ignored-employee', form()), /offline/);
  await assert.rejects(failing.handleEditAsset(VEHICLE, { ...getVpsAssetFormDefaults(current), name: 'Edit' }), /conflict/);
  await assert.rejects(failing.handleDeleteAsset(VEHICLE, V1), /conflict/);
  await assert.rejects(failing.handleDeleteAsset(VEHICLE, V2), /CHANGED_RELOAD/);
  assert.equal(failing.state(), previous);
  assert.equal(failing.updates(), 0);
  const success = rootHandlers({ archiveManagerAsset: async (id, body) => savedResponse(body, current, true) });
  assert.equal((await success.handleDeleteAsset(VEHICLE, V1)).success, true);
  assert.equal(success.state()[0].isArchived, true);
});

const view = app.slice(app.indexOf('function AssetManagementView('), app.indexOf('function AssetManagementView(') + 70000);
const uiSource = view.slice(view.indexOf('  const handleAssetSubmit ='), view.indexOf('  const handleCostSubmit ='));
function uiHandlers(extra = {}) {
  let closed = 0;
  const statuses = [];
  const bindings = { isVpsApiMode: true, isSavingAsset: false, editingAsset: native(), assetForm: form(), canDeleteAsset: true,
    setIsSavingAsset() {}, setAssetSaveStatus: value => statuses.push(value), closeAssetForm: () => { closed++; },
    vpsAssetErrorMessage, getFriendlyFirebaseErrorMessage: error => error.message, window: { confirm: () => true },
    onEditAsset: async () => ({ success: true }), onAddAsset: async () => VEHICLE, onDeleteAsset: async () => ({ success: true }), ...extra,
  };
  return { ...new Function(...Object.keys(bindings), `${uiSource}\nreturn { handleAssetSubmit, handleAssetArchive };`)(...Object.values(bindings)), closed: () => closed, statuses };
}
function assetFieldChanges(setAssetForm) {
  const parser = createRequire(import.meta.url)('@babel/parser');
  const tree = parser.parse(app, { sourceType: 'module', plugins: ['jsx'] });
  const component = tree.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'AssetManagementView');
  const handlers = {};
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXOpeningElement') {
      const field = node.attributes.find(attribute => ['value', 'checked'].includes(attribute.name?.name)
        && attribute.value?.expression?.object?.name === 'assetForm')?.value.expression.property.name;
      const change = node.attributes.find(attribute => attribute.name?.name === 'onChange')?.value?.expression;
      if (field && change) handlers[field] = new Function('setAssetForm', `return (${app.slice(change.start, change.end)});`)(setAssetForm);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(component);
  return handlers;
}

function deferredAssetDraft() {
  const queued = [];
  const handlers = assetFieldChanges(update => queued.push(update));
  const expected = {
    code: 'QA-BROWSER-VEHICLE', vehicleType: 'TRUCK', name: 'QA Browser Vehicle', plateNumber: 'QA-001', status: 'active',
    recordHandover: true, handoverDriverIds: [HR], handoverKm: '240000', handoverDate: '2026-09-06',
    handoverCondition: 'Good', handoverNote: 'QA handover', handoverImageUrl: 'https://example.test/reference.jpg',
    lastMaintenanceDate: '2026-09-01', nextMaintenanceDate: '2027-03-01', nextMaintenanceKm: '255000',
  };
  assert.deepEqual(Object.keys(handlers).sort(), Object.keys(expected).sort());
  for (const [field, value] of Object.entries(expected)) {
    const option = { value: HR };
    const target = { value: field === 'code' ? value.toLowerCase() : value, checked: value, selectedOptions: [option] };
    handlers[field]({ target });
    // React can restore a controlled DOM input before a queued updater is evaluated.
    target.value = '';
    target.checked = false;
    option.value = USER;
    target.selectedOptions.length = 0;
  }
  let draft = getVpsAssetFormDefaults();
  for (const update of queued) {
    const next = update(draft);
    assert.deepEqual(update(draft), next, 'Repeated updater evaluation must be deterministic');
    draft = next;
  }
  return { draft, expected };
}

test('controlled asset inputs capture primitive and selection values before deferred state updates', () => {
  const { draft, expected } = deferredAssetDraft();
  for (const [field, value] of Object.entries(expected)) assert.deepEqual(draft[field], value, `${field} must retain the entered value`);
});

test('captured handover date and km reach the adapter and the entire draft survives a failed save', async () => {
  const { draft, expected } = deferredAssetDraft();
  const before = structuredClone(draft);
  const requests = [];
  const api = { createManagerAsset: async body => {
    requests.push(body);
    throw Object.assign(new Error('Save rejected'), { code: 'MANAGER_ASSET_INVALID_PAYLOAD' });
  } };
  const ui = uiHandlers({ editingAsset: null, assetForm: draft, onAddAsset: data => saveVpsAsset(api, session, null, data, employees) });
  await ui.handleAssetSubmit({ preventDefault() {} });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].handover.date, expected.handoverDate);
  assert.equal(requests[0].handover.km, 240000);
  assert.deepEqual(requests[0].handover.driverIds, [HR]);
  assert.equal(ui.closed(), 0);
  assert.ok(ui.statuses.at(-1));
  assert.deepEqual(draft, before);
  for (const [field, value] of Object.entries(expected)) assert.deepEqual(draft[field], value);
  await ui.handleAssetSubmit({ preventDefault() {} });
  assert.equal(ui.closed(), 0);
  assert.deepEqual(requests[1], requests[0], 'Retry must preserve the captured draft and command IDs');
});

test('actual UI save and archive await success, keep form open on rejected/false/missing responses', async () => {
  for (const result of [false, null, 'throw']) {
    const action = async () => { if (result === 'throw') throw new Error('offline'); return result === false ? { success: false, message: 'rejected' } : null; };
    const ui = uiHandlers({ onEditAsset: action, onDeleteAsset: action });
    await ui.handleAssetSubmit({ preventDefault() {} });
    await ui.handleAssetArchive();
    assert.equal(ui.closed(), 0);
    assert.ok(ui.statuses.at(-1));
  }
  let reject;
  const ui = uiHandlers({ onDeleteAsset: () => new Promise((resolve, fail) => { reject = fail; }) });
  const saving = ui.handleAssetArchive();
  assert.equal(ui.closed(), 0);
  reject(new Error('MANAGER_ASSET_CHANGED_RELOAD'));
  await saving;
  assert.equal(ui.closed(), 0);
  const success = uiHandlers();
  await success.handleAssetSubmit({ preventDefault() {} });
  await success.handleAssetArchive();
  assert.equal(success.closed(), 2);
});

test('App wiring exposes explicit code/subtype/handover and routes costs through verified VPS commands', () => {
  assert.match(view, /value=\{assetForm\.code\}/);
  assert.match(view, /value=\{assetForm\.vehicleType\}/);
  assert.match(view, /checked=\{assetForm\.recordHandover\}/);
  assert.match(view, /value=\{assetForm\.handoverDriverIds\}/);
  assert.match(view, /editingAsset\.vpsHandoverHistory\.map/);
  assert.match(view, /asset = await onGetAsset\(asset\.id\)/);
  assert.match(app, /onGetAsset=\{handleGetAsset\}/);
  assert.match(app, /<AssetManagementView onGetAsset=\{onGetAsset\}/);
  assert.match(app, /loadVpsAssets\(api, currentUser, \{ cancelled: \(\) => cancelled \}\)/);
  for (const handler of ['handleAddAssetCostLog', 'handleEditAssetCostLog', 'handleDeleteAssetCostLog']) {
    const start = app.indexOf(`  const ${handler} =`);
    const source = app.slice(start, app.indexOf('\n  const ', start + 1));
    assert.match(source, /if \(isVpsApiMode\)/);
    assert.match(source, /await saveVpsAssetCost/);
  }
  assert.match(rootSource, /if \(!firebaseUser\) return null/);
  assert.match(rootSource, /'assets', assetId/);
});

test('App JSX parses after the scoped form changes (no build or browser)', () => {
  const parser = createRequire(import.meta.url)('@babel/parser');
  assert.doesNotThrow(() => parser.parse(app, { sourceType: 'module', plugins: ['jsx'] }));
});
