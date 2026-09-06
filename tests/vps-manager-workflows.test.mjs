import test from 'node:test';
import assert from 'node:assert/strict';
import { updateVpsCompanySettings } from '../src/api/vpsCompanySettings.js';
import { applyVpsEmployeeProfile, hydrateVpsEmployeeProfiles, normalizeVpsEmployee, saveVpsEmployeeProfile } from '../src/api/vpsEmployees.js';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';

test('company settings send only changed allowed fields and server version', async () => {
  const company = { id: 'a', name: 'Before', vpsSettingsVersion: 'v1', rolePermissions: { owner: true } };
  let sent;
  const next = await updateVpsCompanySettings({ updateManagerSettings: async body => {
    sent = body;
    return { companyId: 'a', settings: { name: 'After' }, version: 'v2' };
  } }, company, { name: 'After', rolePermissions: company.rolePermissions });
  assert.deepEqual(sent, { version: 'v1', settings: { name: 'After' } });
  assert.equal(next.vpsSettingsVersion, 'v2');
  assert.equal(company.name, 'Before');
});

test('unsupported settings, missing version and tenant mismatch cannot report saved', async () => {
  let calls = 0;
  const api = { updateManagerSettings: async () => { calls++; return { companyId: 'b' }; } };
  await assert.rejects(updateVpsCompanySettings(api, { id: 'a' }, { name: 'After' }));
  await assert.rejects(updateVpsCompanySettings(api, { id: 'a', vpsSettingsVersion: 'v1' }, { paymentEnabled: true }));
  assert.equal(calls, 0);
  await assert.rejects(updateVpsCompanySettings(api, { id: 'a', vpsSettingsVersion: 'v1' }, { name: 'After' }));
});

test('native HR names/status normalize without fabricating an identity or salary', () => {
  const row = normalizeVpsEmployee({ id: 'e', fullName: 'Employee', hireDate: '2026-09-01T00:00:00Z', status: 'TERMINATED' });
  assert.equal(row.name, 'Employee');
  assert.equal(row.isArchived, true);
  assert.equal(row.basicSalary, undefined);
  assert.equal(row.role, undefined);
});

test('employee create uses stable request ID and does not claim login enrollment', async () => {
  let body;
  const result = await saveVpsEmployeeProfile({ createManagerEmployee: async request => {
    body = request;
    return { id: 'e', companyId: 'a', version: 'v1', profile: request.profile, userId: null, identityStatus: 'NOT_ENROLLED' };
  } }, 'a', null, { name: 'Employee', phone: '0900000041' }, 'request-1');
  assert.equal(body.requestId, 'request-1');
  assert.equal(result.identityStatus, 'NOT_ENROLLED');
  assert.equal(result.userId, null);
});

test('employee save refuses cross-tenant and unloaded salary profiles before network', async () => {
  let calls = 0;
  const api = { updateManagerEmployee: async () => { calls++; } };
  await assert.rejects(saveVpsEmployeeProfile(api, 'a', { id: 'e', companyId: 'b', vpsProfileVersion: 'v1' }, { name: 'Changed' }));
  await assert.rejects(saveVpsEmployeeProfile(api, 'a', { id: 'e', companyId: 'a' }, { basicSalary: 0 }));
  assert.equal(calls, 0);
  assert.throws(() => applyVpsEmployeeProfile({ id: 'e' }, { id: 'other', companyId: 'a', version: 'v1' }, 'a'));
});

test('manager API paths use guarded bodies and disable automatic mutation retry', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (...args) => { calls.push(['GET', ...args]); return { items: [], pagination: {} }; },
    post: async (...args) => { calls.push(['POST', ...args]); },
    patch: async (...args) => { calls.push(['PATCH', ...args]); },
  });
  await api.getManagerSettings();
  await api.updateManagerSettings({ version: 'v1', settings: { name: 'After' }, companyId: 'forged' });
  await api.createManagerEmployee({ requestId: 'r', profile: { name: 'Test' }, companyId: 'forged' });
  await api.updateManagerEmployee('e', { version: 'v1', profile: { name: 'After' } });
  assert.equal(calls[0][1], '/company-settings/manager');
  assert.deepEqual(calls[1], ['PATCH', '/company-settings/manager', { version: 'v1', settings: { name: 'After' } }, { retry: false }]);
  assert.deepEqual(calls[2], ['POST', '/hr-suite/manager-employees', { requestId: 'r', profile: { name: 'Test' } }, { retry: false }]);
  assert.deepEqual(calls[3].slice(0, 2), ['PATCH', '/hr-suite/manager-employees/e']);
});

test('payroll profile reads require explicit permission and never substitute zero for a failed read', async () => {
  const items = [{ id: 'e', companyId: 'a', name: 'Employee' }];
  let calls = 0;
  const api = { getManagerEmployee: async () => { calls++; throw new Error('Unavailable'); } };
  assert.equal(await hydrateVpsEmployeeProfiles(api, items, 'a', ['hr.employee.read']), items);
  assert.equal(calls, 0);
  await assert.rejects(hydrateVpsEmployeeProfiles(api, items, 'a', ['hr.payroll.read']));
  assert.equal(items[0].basicSalary, undefined);
  const loaded = await hydrateVpsEmployeeProfiles({ getManagerEmployee: async () => ({ id: 'e', companyId: 'a', version: 'v1', profile: { basicSalary: 123, responsibilitySalary: 5 } }) }, items, 'a', ['hr.payroll.read']);
  assert.equal(loaded[0].basicSalary, 123);
  assert.equal(loaded[0].responsibilitySalary, 5);
});
