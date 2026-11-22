import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {readApplicationSource} from '../scripts/helpers/application-source.cjs';
import {appFunction} from './helpers/app-source-function.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(read('../functions/payrollAutomationConfig.json'));

test('disabled automatic payroll scheduler exits without touching any plans', async () => {
  assert.equal(config.autoLockEnabled, false);
  const source = read('../functions/index.js');
  const scheduler = source.slice(source.indexOf('exports.autoLockPayrollPeriods ='));
  const body = scheduler.slice(scheduler.indexOf('}, async () => {') + '}, async () => {'.length, scheduler.indexOf('const initialClock ='));
  let reachedData = false;
  await new Function('require', 'touchData', `return (async () => { ${body} touchData(); })();`)(() => config, () => { reachedData = true; });
  assert.equal(reachedData, false);
});

test('app hides automatic closing and guards plan preparation using the same switch', () => {
  const app = readApplicationSource();
  const canPrepare = autoLockEnabled => appFunction('canPreparePayrollAutoLock', {
    payrollViewReady: true, payrollAutomationConfig: {autoLockEnabled}, canManagePayrollByRole: true,
    canViewCompanyPayroll: true, isPayrollLocked: false, currentMonth: '2026-11',
    getVietnamPayrollDateKey: () => '2026-11-21', liveSalaryRows: [{}], onPreparePayrollAutoLockPlan() {},
  }, {scope: 'SalaryView'});
  assert.equal(canPrepare(false), false, 'The actual canonical view must honor the disabled switch');
  assert.equal(canPrepare(true), true, 'Eligible enabled preparation must still be available');
  assert.match(app, /const handlePreparePayrollAutoLockPlan[^\n]+\n\s*if \(!payrollAutomationConfig.autoLockEnabled\) return/);
  const heading = app.indexOf('Khóa lương tự động cuối tháng');
  assert.match(app.slice(heading - 650, heading), /payrollAutomationConfig.autoLockEnabled && payrollScreen/);
});
