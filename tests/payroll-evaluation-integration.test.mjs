import assert from 'node:assert/strict';
import {
  applyEvaluationBonusToSalaryDetails,
  createEmptyPayrollEvaluationResult,
  projectEvaluationSummaryToPayroll
} from '../src/utils/payrollEvaluationBonus.js';

const employee = { id: 'emp-01', name: 'Nguyen Van A' };
const monthKey = '2026-08';
const baseSummary = {
  employee,
  monthKey,
  system: { workDays: 20, revenue: 0, deliveryCount: 0 },
  peer: { count: 2 },
  customer: { count: 1 },
  stars: 5,
  finalCriteriaAverage: 4.91,
  finalScore: 98,
  bonus: 850000
};

const tests = [
  ['1. Missing evaluation returns zero bonus', () => {
    const result = projectEvaluationSummaryToPayroll(null, { employeeId: employee.id, monthKey });
    assert.deepEqual(result, createEmptyPayrollEvaluationResult({ employeeId: employee.id, monthKey }));
  }],
  ['2. Evaluation from another employee is rejected', () => {
    const result = projectEvaluationSummaryToPayroll(baseSummary, { employeeId: 'emp-02', monthKey });
    assert.equal(result.hasEvaluation, false);
    assert.equal(result.bonus, 0);
  }],
  ['3. Evaluation from another payroll month is rejected', () => {
    const result = projectEvaluationSummaryToPayroll(baseSummary, { employeeId: employee.id, monthKey: '2026-07' });
    assert.equal(result.hasEvaluation, false);
    assert.equal(result.bonus, 0);
  }],
  ['4. Empty evaluation sources are reported as missing data', () => {
    const result = projectEvaluationSummaryToPayroll({
      ...baseSummary,
      system: { workDays: 0, revenue: 0, deliveryCount: 0 },
      peer: { count: 0 },
      customer: { count: 0 }
    }, { employeeId: employee.id, monthKey });
    assert.equal(result.hasEvaluation, false);
    assert.equal(result.note, 'Chua co du lieu danh gia');
  }],
  ['5. Final stars, scores and bonus are copied without recalculation', () => {
    const result = projectEvaluationSummaryToPayroll(baseSummary, { employeeId: employee.id, monthKey });
    assert.equal(result.hasEvaluation, true);
    assert.equal(result.stars, 5);
    assert.equal(result.averageScore, 4.91);
    assert.equal(result.finalScore, 98);
    assert.equal(result.bonus, 850000);
  }],
  ['6. Automatic evaluation with attendance is accepted', () => {
    const result = projectEvaluationSummaryToPayroll({
      ...baseSummary,
      peer: { count: 0 },
      customer: { count: 0 },
      bonus: 300000
    }, { employeeId: employee.id, monthKey });
    assert.equal(result.hasEvaluation, true);
    assert.equal(result.bonus, 300000);
  }],
  ['7. Customer feedback is accepted as evaluation source data', () => {
    const result = projectEvaluationSummaryToPayroll({
      ...baseSummary,
      system: { workDays: 0, revenue: 0, deliveryCount: 0 },
      peer: { count: 0 },
      customer: { count: 3 },
      stars: 4,
      bonus: 500000
    }, { employeeId: employee.id, monthKey });
    assert.equal(result.hasEvaluation, true);
    assert.equal(result.stars, 4);
    assert.equal(result.bonus, 500000);
  }],
  ['8. Evaluation bonus is added exactly once to gross and net salary', () => {
    const result = projectEvaluationSummaryToPayroll(baseSummary, { employeeId: employee.id, monthKey });
    const salary = applyEvaluationBonusToSalaryDetails({ monthKey, grossSalary: 10000000, netSalary: 8500000 }, result);
    assert.equal(salary.evaluationBonus, 850000);
    assert.equal(salary.grossSalary, 10850000);
    assert.equal(salary.netSalary, 9350000);
  }],
  ['9. Missing evaluation leaves every existing salary amount unchanged', () => {
    const empty = createEmptyPayrollEvaluationResult({ employeeId: employee.id, monthKey });
    const salary = applyEvaluationBonusToSalaryDetails({ monthKey, grossSalary: 10000000, netSalary: 8500000, commission: 250000 }, empty);
    assert.equal(salary.evaluationBonus, 0);
    assert.equal(salary.grossSalary, 10000000);
    assert.equal(salary.netSalary, 8500000);
    assert.equal(salary.commission, 250000);
  }],
  ['10. Read-only integration never mutates evaluation or salary sources', () => {
    const summarySnapshot = structuredClone(baseSummary);
    const salarySource = { monthKey, grossSalary: 10000000, netSalary: 8500000, totalBonus: 200000 };
    const salarySnapshot = structuredClone(salarySource);
    const result = projectEvaluationSummaryToPayroll(baseSummary, { employeeId: employee.id, monthKey });
    applyEvaluationBonusToSalaryDetails(salarySource, result);
    assert.deepEqual(baseSummary, summarySnapshot);
    assert.deepEqual(salarySource, salarySnapshot);
  }]
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}

console.log(`\nPayroll evaluation integration: ${passed}/${tests.length} cases PASS`);
