import assert from 'node:assert/strict';
import {readApplicationSource} from '../scripts/helpers/application-source.cjs';

const appSource = readApplicationSource();

assert.match(appSource, /function SectionInfoHint\(\{ description, label = 'phần này'/);
assert.match(appSource, /role="tooltip"/);
assert.match(appSource, /aria-label=\{`Xem mô tả \$\{label\}`\}/);
assert.match(appSource, /onMouseEnter=\{\(\) => setIsOpen\(true\)\}/);
assert.match(appSource, /event\.key === 'Escape'/);
assert.match(appSource, /setIsOpen\(prev => !prev\)/);
assert.match(appSource, /className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-transparent/);
assert.match(appSource, /<span className="text-sm font-black leading-none" aria-hidden="true">i<\/span>/);
assert.match(appSource, /<span>Ngày lễ trong năm<\/span>[\s\S]*?<SectionInfoHint/);
// The current employee screen no longer contains the legacy revenue/account
// model panels. Check the reusable hint's interaction and accessibility contract.
const hint = appSource.slice(appSource.indexOf('function SectionInfoHint('), appSource.indexOf('function WorkflowGuideCard('));
assert.match(hint, /if \(!description\) return null/);
assert.match(hint, /aria-expanded=\{isOpen\}/);
assert.match(hint, /aria-describedby=\{isOpen \? tooltipId : undefined\}/);
assert.match(hint, /event\.stopPropagation\(\)/);
assert.match(hint, /onMouseLeave=\{\(\) => setIsOpen\(false\)\}/);
assert.match(hint, /onBlur=\{\(\) => setIsOpen\(false\)\}/);
assert.match(hint, /id=\{tooltipId\}[\s\S]*role="tooltip"/);
const holidayCardSource = appSource.slice(
  appSource.indexOf('function HolidayConfigCard'),
  appSource.indexOf('function EmployeeView')
);
const employeeHeaderSource = appSource.slice(
  appSource.indexOf('function EmployeeView'),
  appSource.indexOf('function SalaryViewLegacy')
);
const bankPaymentCenterSource = appSource.slice(
  appSource.indexOf('function BankPaymentCenterView'),
  appSource.indexOf('function MoreMenu(', appSource.indexOf('function BankPaymentCenterView'))
);
assert.match(bankPaymentCenterSource, /data-bank-page="customers"/);
assert.match(bankPaymentCenterSource, /aria-label="Quay lại TT giao dịch"/);
assert.match(bankPaymentCenterSource, /TK Khách hàng/);
assert.doesNotMatch(bankPaymentCenterSource, /<SectionInfoHint/);
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
