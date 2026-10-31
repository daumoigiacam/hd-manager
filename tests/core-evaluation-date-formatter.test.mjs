import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/utils/employeeEvaluationAutomation.js', import.meta.url), 'utf8');
assert.ok(source.includes('if (!employeeEvaluationDateTimeFormatter)'));
const build = contents => {
  let constructors = 0;
  class CountingFormatter extends Intl.DateTimeFormat {
    constructor(...args) { super(...args); constructors++; }
  }
  // Transform export declarations only; execute the actual public model with
  // a counting Intl constructor. No dates, formulas or predicates are mocked.
  const model = new Function('Intl', `${contents.replace(/^export /gm, '')}\nreturn { collectLateMinutes, calculateEmployeeAutomaticEvaluation };`)({ DateTimeFormat: CountingFormatter });
  return { model, count: () => constructors };
};

test('one fixed-zone formatter preserves complete late-minute output across offsets, dates and overnight shifts', () => {
  const cached = build(source), old = build(source.replace('if (!employeeEvaluationDateTimeFormatter)', 'if (true)'));
  const checks = ['2026-10-01T00:15:00Z', '2026-09-30T23:20:00Z', '2026-10-01T07:25:00+07:00', '2026-10-01 07:15',
    new Date('2026-10-01T00:45:00Z'), { seconds: 1790817300 }, 'invalid', '07:15'];
  const entries = Array.from({ length: 180 }, (_, i) => ({ id: `a${i}`, companyId: 'fixture-company', employeeId: `e${i % 3}`,
    date: '2026-10-01', checkIn: checks[i % checks.length] }));
  for (const shiftPolicy of [{ shiftStart: '07:00', shiftEnd: '17:00' }, { shiftStart: '22:00', shiftEnd: '06:00' }]) {
    for (const employeeId of ['e0', 'e1', 'e2', undefined]) {
      const args = { entries, employeeId, companyId: 'fixture-company', monthKey: '2026-10', shiftPolicy };
      assert.deepEqual(cached.model.collectLateMinutes(args), old.model.collectLateMinutes(args));
      assert.deepEqual(cached.model.collectLateMinutes({ ...args, entries: entries.slice(20) }), old.model.collectLateMinutes({ ...args, entries: entries.slice(20) }));
    }
  }
  assert.equal(cached.count(), 1);
  assert.ok(old.count() > 100, 'full oracle still constructs a formatter for each timestamp conversion');
});
