import assert from 'node:assert/strict';
import { attendanceRoster, attendanceDepartment } from '../src/utils/attendanceRoster.js';

const company = { id: 'a', employeeDepartments: [{ id: 'sales', name: 'Kinh doanh' }] };
const employees = [
  { id: 'one', companyId: 'a', companyDepartmentId: 'sales' },
  { id: 'two', companyId: 'a', position: 'Kho' },
  { id: 'foreign', companyId: 'b' },
  { id: 'archived', companyId: 'a', isArchived: true },
];
assert.deepEqual(attendanceRoster(employees, company, null, true).map(e => e.id), ['one', 'two']);
assert.deepEqual(attendanceRoster(employees, company, employees[0], false).map(e => e.id), ['one']);
assert.deepEqual(attendanceRoster(employees, {}, null, true), []);
assert.equal(attendanceDepartment(employees[0], company), 'Kinh doanh');
assert.equal(attendanceDepartment(employees[1], company), 'Kho');
assert.equal(attendanceDepartment({}, company), 'Chưa phân bộ phận');
console.log('PASS: company roster, self-only scope, tenant isolation, archived staff and department grouping.');
