import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').split('function AttendanceView(')[1];
const backBody = source.match(/useAppScreenBack\(\(\) => \{([\s\S]*?)\r?\n  \}\);/)[1];
const back = new Function('attendanceScreen', 'isCompanyAccount', 'setAttendanceScreen', backBody);
const transitions = [];
assert.equal(back('team', true, state => transitions.push(state)), false, 'company team Back must leave the module');
assert.deepEqual(transitions, []);
assert.equal(back('team', false, state => transitions.push(state)), true);
assert.deepEqual(transitions, ['dashboard']);
assert.equal(back('wifi-permission', true, state => transitions.push(state)), true);
assert.equal(transitions.at(-1), 'wifi');
console.log('PASS: company roster, self-only scope, tenant isolation, archived staff and department grouping.');
