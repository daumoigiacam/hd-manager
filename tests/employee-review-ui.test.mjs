import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(testDir, '..', 'src', 'App.jsx'), 'utf8');
const radarStart = appSource.indexOf('function EmployeeReviewRadarChart');
const moduleStart = appSource.indexOf('function EmployeeReviewModuleView');
assert.ok(radarStart >= 0 && moduleStart > radarStart, 'Employee Review radar/module must exist');

const radarSource = appSource.slice(radarStart, moduleStart);
const moduleSource = appSource.slice(moduleStart);

assert.match(radarSource, /wrapEmployeeReviewRadarLabel/);
assert.match(appSource, /maxChars = 10/);
assert.match(radarSource, /<tspan[\s\S]*lineIndex/);
assert.match(radarSource, /textAnchor="middle"/);
assert.match(radarSource, /labelLines\.length > 1 \? 50 : 34/);
assert.match(moduleSource, /formatMonthYearShortLabel\(monthKey\)/);
assert.match(moduleSource, /aria-label="Chọn tháng đánh giá"/);
assert.doesNotMatch(moduleSource, /Dữ liệu chấm tự động trong tháng/);
assert.doesNotMatch(moduleSource, /Tên 10 tiêu chí|Sửa tên tiêu chí/);
assert.match(moduleSource, /canEditLabels=\{canManageReviewCriteria\}/);
assert.match(appSource, /documentIdMatch/);
assert.match(moduleSource, /Số người đánh giá:/);
assert.match(moduleSource, /Đánh giá của đồng nghiệp/);
assert.match(moduleSource, /Đánh giá tự động/);
assert.match(moduleSource, /const evaluationEmployee = applyEmployeePayrollPolicyForMonth\(selectedEmployee, monthKey\)/);
assert.match(moduleSource, /payrollLateMinutes: calculateAttendanceTiming\(evaluationEmployee, entry\)\.lateMinutes/);
assert.match(appSource, /const date = documentIdMatch\?\.\[1\]\s*\|\|\s*record\?\.date/);
assert.match(moduleSource, /shiftPolicy: resolveEmployeeShiftPolicy\(evaluationEmployee\)/);
assert.match(appSource, /isEmployeeReviewLeaveRecord/);
assert.match(appSource, /calculateAttendanceTiming\(emp, record\)\.lateMinutes > 0/);
assert.match(appSource, /manage_employee_review_criteria.*Sửa 10 tiêu chí đánh giá/);

console.log('employee-review-ui: PASS');
