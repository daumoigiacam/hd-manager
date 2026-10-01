import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

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
  const app = read('../src/App.jsx');
  assert.match(app, /const canPreparePayrollAutoLock = Boolean\(\s*payrollAutomationConfig.autoLockEnabled/);
  assert.match(app, /const handlePreparePayrollAutoLockPlan[^\n]+\n\s*if \(!payrollAutomationConfig.autoLockEnabled\) return/);
  const heading = app.indexOf('Khóa lương tự động cuối tháng');
  assert.match(app.slice(heading - 650, heading), /payrollAutomationConfig.autoLockEnabled && payrollScreen/);
});
