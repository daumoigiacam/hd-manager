import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeCompanyDepartments,
  removeCompanyDepartment,
  upsertCompanyDepartment,
} from '../src/utils/companyDepartments.js';

const normalized = normalizeCompanyDepartments([
  '  Kế toán   ',
  { id: 'sales', name: 'Kinh doanh' },
  'ke toan',
]);
assert.deepEqual(normalized.map(({ name }) => name), ['Kế toán', 'Kinh doanh']);
assert.equal(normalized[1].id, 'sales');

const created = upsertCompanyDepartment(normalized, {
  name: '  Chăm sóc khách hàng ',
  now: '2026-09-23T00:00:00.000Z',
  nextId: 'customer-care',
});
assert.equal(created.error, '');
assert.equal(created.departments.at(-1).id, 'customer-care');
assert.match(
  upsertCompanyDepartment(created.departments, { name: 'CHAM SOC KHACH HANG' }).error,
  /đã tồn tại/,
);

const renamed = upsertCompanyDepartment(created.departments, {
  id: 'customer-care',
  name: 'Chăm sóc & hỗ trợ khách hàng',
  now: '2026-09-24T00:00:00.000Z',
});
assert.equal(renamed.error, '');
assert.equal(renamed.departments.at(-1).id, 'customer-care');
assert.equal(renamed.departments.at(-1).name, 'Chăm sóc & hỗ trợ khách hàng');

assert.match(
  removeCompanyDepartment(renamed.departments, {
    id: 'customer-care',
    assignedDepartmentIds: ['customer-care'],
  }).error,
  /đang có nhân sự/,
);
assert.equal(
  removeCompanyDepartment(renamed.departments, { id: 'customer-care' }).departments.length,
  2,
);

const appSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.jsx'),
  'utf8',
);
const employeeViewSource = appSource.slice(
  appSource.indexOf('function EmployeeView'),
  appSource.indexOf('function SalaryViewLegacy'),
);
assert.match(appSource, /employeeDepartments:\s*settingsData\.employeeDepartments/);
assert.match(appSource, /onUpdateCompanySettings=\{handleUpdateCompanySettings\}/);
assert.match(employeeViewSource, /aria-label="Bộ phận công ty"/);
assert.match(employeeViewSource, /companyDepartmentId/);

console.log('Company department tests passed.');
