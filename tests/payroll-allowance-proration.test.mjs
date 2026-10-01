import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

for (const name of ['calculateSalaryDetails', 'buildSalaryDetails']) {
  test(`${name}: experience allowance follows actual workdays`, () => {
    const start = source.indexOf(`const ${name} =`);
    assert.ok(start >= 0);
    const declaration = source.slice(start).match(/const experienceSalaryCalc = ([^;]+);/);
    assert.ok(declaration);
    const calculate = new Function('experienceDetails', 'salaryMonthDays', 'workDays', 'roundMoneyValue', `return ${declaration[1]};`);
    for (const [standard, actual, expected] of [[26, 0, 0], [26, 13, 250000], [26, 26, 500000], [30, 15, 250000], [26, 1, 19231]]) {
      assert.equal(calculate({ total: 500000 }, standard, actual, Math.round), expected);
    }
  });
}
