import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(appSource, /function SectionInfoHint\(\{ description, label = 'phần này'/);
assert.match(appSource, /role="tooltip"/);
assert.match(appSource, /aria-label=\{`Xem mô tả \$\{label\}`\}/);
assert.match(appSource, /onMouseEnter=\{\(\) => setIsOpen\(true\)\}/);
assert.match(appSource, /event\.key === 'Escape'/);
assert.match(appSource, /setIsOpen\(prev => !prev\)/);
assert.match(appSource, /className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-transparent/);
assert.match(appSource, /<span className="text-sm font-black leading-none" aria-hidden="true">i<\/span>/);
assert.match(appSource, /<SectionInfoHint description=\{subtitle\} label=\{title\} \/>/);
assert.match(appSource, /<span>Ngân hàng & Thanh toán<\/span>[\s\S]*?<SectionInfoHint/);
assert.match(appSource, /<span>Ngày lễ trong năm<\/span>[\s\S]*?<SectionInfoHint/);
assert.match(appSource, /<span>Mô hình tài khoản<\/span>[\s\S]*?<SectionInfoHint/);
assert.match(appSource, /<span>Doanh thu<\/span>[\s\S]*?<SectionInfoHint/);
assert.match(appSource, /formatMonthYearShortLabel\(salesRevenueMonth\)/);
assert.match(appSource, /type="month"[\s\S]*?aria-label="Chọn tháng doanh thu"/);
assert.match(appSource, /<h2 className="text-lg font-bold text-gray-800">Tài khoản bộ phận<\/h2>[\s\S]*?<span>Doanh thu<\/span>[\s\S]*?<span>Mô hình tài khoản<\/span>/);
const holidayCardSource = appSource.slice(
  appSource.indexOf('function HolidayConfigCard'),
  appSource.indexOf('function EmployeeView')
);
const employeeHeaderSource = appSource.slice(
  appSource.indexOf('function EmployeeView'),
  appSource.indexOf('function SalaryViewLegacy')
);
assert.doesNotMatch(
  holidayCardSource,
  /<h2 className="mt-1 text-base font-black text-slate-900">Cài một lần, bảng lương tự tính<\/h2>[\s\S]*?<p className="mt-1 text-xs leading-relaxed text-slate-500">/,
  'Holiday explanation must not remain as an inline paragraph'
);
assert.doesNotMatch(
  employeeHeaderSource,
  /<span>Mô hình tài khoản<\/span>[\s\S]*?<p className="leading-relaxed">/,
  'Account model explanation must move into the info hint'
);
assert.doesNotMatch(
  employeeHeaderSource,
  /Doanh thu nhân viên kinh doanh/,
  'Sales revenue heading must use the shorter label'
);
assert.doesNotMatch(
  employeeHeaderSource,
  /canUseEmployeeReviews && \(/,
  'Employee screen must not render the duplicate review table'
);

console.log('Section info hint checks passed.');
