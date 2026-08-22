import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  AUTOMATIC_EVALUATION_CRITERIA,
  buildEmployeeEvaluationSummaryId,
  buildEvaluationPeriodId,
  buildEvaluationSummary13,
  calculateEmployeeAutomaticEvaluation,
  collectLeaveDays,
  collectValidatedComplaints,
  createIdempotentEvaluationWritePlan,
  getEvaluationReward,
  scoreLateMinutes,
  scoreLeaveDays,
  scoreValidatedComplaints
} from '../src/utils/employeeEvaluationAutomation.js';
import { applyEmployeePayrollPolicyForMonth } from '../src/utils/payrollPolicyHistory.js';

const require = createRequire(import.meta.url);
const { buildEvaluationSummary: buildServerEvaluationSummary } = require('../functions/employeeEvaluation.js');

test('late-minute scoring preserves every required boundary', () => {
  const cases = [
    [99, 5], [100, 4.5], [150, 4.5], [151, 4], [200, 4], [201, 3.5],
    [250, 3.5], [251, 3], [300, 3], [301, 2.5], [350, 2.5], [351, 2],
    [400, 2], [401, 1.5], [450, 1.5], [451, 1], [500, 1], [501, 0]
  ];
  for (const [minutes, expected] of cases) {
    assert.equal(scoreLateMinutes(minutes).score, expected, `late=${minutes}`);
  }
});

test('leave-day scoring maps 0 through 5 and above exactly', () => {
  const expected = [5, 4, 3, 2, 1, 0, 0];
  expected.forEach((score, days) => assert.equal(scoreLeaveDays(days).score, score, `leave=${days}`));
});

test('validated complaint scoring maps 0 through 5 and above exactly', () => {
  const expected = [5, 4, 3, 2, 1, 0, 0];
  expected.forEach((score, count) => assert.equal(scoreValidatedComplaints(count).score, score, `complaints=${count}`));
});

test('leave counting is employee/month scoped and deduplicated by day', () => {
  const result = collectLeaveDays({
    entries: [
      { id: 'a', employeeId: 'e1', companyId: 'c1', date: '2026-08-05', status: 'leave' },
      { id: 'a-duplicate', employeeId: 'e1', companyId: 'c1', date: '2026-08-05', status: 'approved_leave' },
      { id: 'b', employeeId: 'e1', companyId: 'c1', date: '2026-08-06', status: 'unapproved_leave' },
      { id: 'c', employeeId: 'e2', companyId: 'c1', date: '2026-08-07', status: 'leave' },
      { id: 'd', employeeId: 'e1', companyId: 'c1', date: '2026-07-08', status: 'leave' }
    ],
    employeeId: 'e1',
    companyId: 'c1',
    monthKey: '2026-08'
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.value, 2);
  assert.deepEqual(result.details.map(item => item.date), ['2026-08-05', '2026-08-06']);
});

test('complaint count excludes rejected and unrelated records', () => {
  const result = collectValidatedComplaints({
    complaints: [
      { id: 'c1', employeeId: 'e1', companyId: 'c1', date: '2026-08-01', status: 'validated' },
      { id: 'c2', employeeId: 'e1', companyId: 'c1', date: '2026-08-02', status: 'confirmed' },
      { id: 'c3', employeeId: 'e1', companyId: 'c1', date: '2026-08-03', status: 'rejected' },
      { id: 'c4', employeeId: 'e2', companyId: 'c1', date: '2026-08-04', status: 'validated' },
      { id: 'c5', employeeId: 'e1', companyId: 'c1', date: '2026-07-04', status: 'validated' },
      { id: 'c6', employeeId: 'e1', companyId: 'c1', date: '2026-08-05', status: 'validated', isValid: false }
    ],
    employeeId: 'e1',
    companyId: 'c1',
    monthKey: '2026-08'
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.value, 2);
  assert.deepEqual(result.details.map(item => item.id), ['c1', 'c2']);
});

test('automatic sources require an exact tenant match when companyId is supplied', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1',
    companyId: 'company-a',
    monthKey: '2026-07',
    attendanceEntries: [
      { id: 'a1', employeeId: 'e1', companyId: 'company-a', date: '2026-07-01', lateMinutes: 10 },
      { id: 'a2', employeeId: 'e1', companyId: 'company-b', date: '2026-07-02', lateMinutes: 400 },
      { id: 'a3', employeeId: 'e1', date: '2026-07-03', lateMinutes: 400 }
    ],
    complaints: [
      { id: 'c1', employeeId: 'e1', companyId: 'company-a', date: '2026-07-01', status: 'validated' },
      { id: 'c2', employeeId: 'e1', companyId: 'company-b', date: '2026-07-02', status: 'validated' },
      { id: 'c3', employeeId: 'e1', date: '2026-07-03', status: 'validated' }
    ]
  });

  assert.equal(result.criteria.lateMinutes.value, 10);
  assert.equal(result.criteria.customerComplaints.value, 1);
});

test('explicitly loaded empty sources produce valid zero scores', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1',
    companyId: 'company-a',
    monthKey: '2026-07',
    attendanceEntries: [],
    complaints: []
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.criteria.lateMinutes.score, 5);
  assert.equal(result.criteria.leaveDays.score, 5);
  assert.equal(result.criteria.customerComplaints.score, 5);
});

test('missing source data is not silently converted to zero', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: null,
    complaints: null
  });
  assert.equal(result.status, 'needs_review');
  assert.equal(result.totalScore, null);
  assert.deepEqual(result.missingData.sort(), ['customerComplaints', 'lateMinutes', 'leaveDays']);
});

test('automatic evaluation calculates exact values without early rounding', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: [
      { id: 'a1', employeeId: 'e1', companyId: 'c1', date: '2026-08-01', lateMinutes: 100 },
      { id: 'a2', employeeId: 'e1', companyId: 'c1', date: '2026-08-02', status: 'leave' }
    ],
    complaints: [{ id: 'c1', employeeId: 'e1', companyId: 'c1', date: '2026-08-03', status: 'validated' }]
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.criteria.lateMinutes.value, 100);
  assert.equal(result.criteria.lateMinutes.score, 4.5);
  assert.equal(result.criteria.leaveDays.value, 1);
  assert.equal(result.criteria.leaveDays.score, 4);
  assert.equal(result.criteria.customerComplaints.score, 4);
  assert.equal(result.exactAverage, 4.166666666666667);
  assert.equal(result.displayAverage, 4.17);
});

test('attendance documents recover employee and date from their document id', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: [
      { id: '2026-08-01_e1', companyId: 'c1', checkIn: '2026-08-01T07:30:00', status: 'late' },
      { id: '2026-08-02_e1', companyId: 'c1', status: 'leave' }
    ],
    complaints: []
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.criteria.lateMinutes.value, 30);
  assert.equal(result.criteria.leaveDays.value, 1);
});

test('attendance document date wins over a conflicting legacy record date', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: [{
      id: '2026-08-01_e1',
      companyId: 'c1',
      date: '2026-07-31',
      checkIn: '2026-08-01T06:45:00',
      status: 'present'
    }],
    complaints: [],
    shiftPolicy: { shiftStart: '06:30', shiftEnd: '16:30' }
  });

  assert.equal(result.criteria.lateMinutes.value, 15);
  assert.equal(result.criteria.lateMinutes.details[0].date, '2026-08-01');
});

test('overnight attendance uses actual check-in time and ignores stale derived minutes', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: [{
      id: '2026-08-21_e1',
      companyId: 'c1',
      checkIn: '2026-08-21T03:00:00',
      lateMinutes: 20160,
      status: 'late'
    }],
    complaints: [],
    shiftPolicy: { shiftStart: '23:00', shiftEnd: '11:00', graceMinutes: 10 }
  });

  assert.equal(result.criteria.lateMinutes.value, 240);
  assert.equal(result.criteria.lateMinutes.details[0].minutes, 240);
});

test('all shift cases keep early check-ins out of late totals and count leave days once', () => {
  const cases = [
    {
      employeeId: 'day-early',
      shiftPolicy: { shiftStart: '08:00', shiftEnd: '17:00' },
      checkIn: '2026-08-21T07:30:00',
      staleLateMinutes: 999,
      expectedLateMinutes: 0
    },
    {
      employeeId: 'day-late',
      shiftPolicy: { shiftStart: '08:00', shiftEnd: '17:00' },
      checkIn: '2026-08-21T08:15:00',
      expectedLateMinutes: 15
    },
    {
      employeeId: 'overnight-early',
      shiftPolicy: { shiftStart: '23:00', shiftEnd: '11:00' },
      checkIn: '2026-08-20T21:00:00',
      staleLateMinutes: 1320,
      expectedLateMinutes: 0
    },
    {
      employeeId: 'overnight-late',
      shiftPolicy: { shiftStart: '23:00', shiftEnd: '11:00' },
      checkIn: '2026-08-21T03:00:00',
      expectedLateMinutes: 240
    }
  ];

  for (const testCase of cases) {
    const result = calculateEmployeeAutomaticEvaluation({
      employeeId: testCase.employeeId,
      companyId: 'c1',
      monthKey: '2026-08',
      attendanceEntries: [
        {
          id: `2026-08-21_${testCase.employeeId}`,
          companyId: 'c1',
          checkIn: testCase.checkIn,
          lateMinutes: testCase.staleLateMinutes,
          status: 'present'
        },
        { id: `leave-${testCase.employeeId}-1`, employeeId: testCase.employeeId, companyId: 'c1', date: '2026-08-22', status: 'leave' },
        { id: `leave-${testCase.employeeId}-2`, employeeId: testCase.employeeId, companyId: 'c1', date: '2026-08-22', status: 'approved_leave' }
      ],
      complaints: [],
      shiftPolicy: testCase.shiftPolicy
    });

    assert.equal(result.criteria.lateMinutes.value, testCase.expectedLateMinutes, testCase.employeeId);
    assert.equal(result.criteria.leaveDays.value, 1, `${testCase.employeeId} leave days`);
  }
});

test('historical early check-in is excluded from day-shift late evaluation', () => {
  const early = calculateEmployeeAutomaticEvaluation({
    employeeId: 'tho-legacy',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: [{
      id: '2026-08-02_tho-legacy',
      companyId: 'c1',
      date: '2026-08-02',
      checkIn: '2026-08-01T23:00:00',
      checkOut: '2026-08-02T11:00:00',
      status: 'present'
    }],
    complaints: [],
    shiftPolicy: { shiftStart: '06:30', shiftEnd: '16:30' }
  });
  assert.equal(early.criteria.lateMinutes.value, 0);
  assert.equal(early.criteria.lateMinutes.score, 5);

  const late = calculateEmployeeAutomaticEvaluation({
    employeeId: 'tho-legacy',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: [{
      id: '2026-08-02_tho-legacy-late',
      employeeId: 'tho-legacy',
      companyId: 'c1',
      date: '2026-08-02',
      checkIn: '2026-08-02T06:45:00',
      status: 'present'
    }],
    complaints: [],
    shiftPolicy: { shiftStart: '06:30', shiftEnd: '16:30' }
  });
  assert.equal(late.criteria.lateMinutes.value, 15);
});

test('payroll timing is authoritative when legacy attendance dates conflict with shift policy', () => {
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'tho-legacy',
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries: [{
      id: '2026-08-02_tho-legacy',
      companyId: 'c1',
      date: '2026-08-02',
      checkIn: '2026-08-02T06:30:00',
      payrollLateMinutes: 0,
      status: 'present'
    }],
    complaints: [],
    shiftPolicy: { shiftStart: '23:00', shiftEnd: '11:00' }
  });
  assert.equal(result.criteria.lateMinutes.value, 0);
  assert.equal(result.criteria.lateMinutes.score, 5);
});

test('monthly payroll policy keeps early check-ins out of client and server late totals', () => {
  const employee = {
    id: 'tho-policy',
    name: 'Lưu Văn Thọ',
    shiftStart: '23:00',
    shiftEnd: '11:00',
    payrollPolicies: [{
      effectiveFrom: '2026-08-01',
      values: { shiftStart: '06:30', shiftEnd: '16:30' }
    }]
  };
  const effectiveEmployee = applyEmployeePayrollPolicyForMonth(employee, '2026-08');
  const attendanceEntries = [
    {
      id: '2026-08-01_tho-policy',
      employeeId: 'tho-policy',
      companyId: 'c1',
      checkIn: '2026-07-31T16:00:00.000Z',
      status: 'present'
    },
    {
      id: '2026-08-10_tho-policy',
      employeeId: 'tho-policy',
      companyId: 'c1',
      checkIn: '2026-08-09T23:30:00.000Z',
      status: 'present'
    }
  ];
  const clientResult = calculateEmployeeAutomaticEvaluation({
    employeeId: effectiveEmployee.id,
    companyId: 'c1',
    monthKey: '2026-08',
    attendanceEntries,
    complaints: [],
    shiftPolicy: effectiveEmployee
  });
  assert.equal(clientResult.criteria.lateMinutes.value, 0);

  const serverResult = buildServerEvaluationSummary({
    employee,
    companyId: 'c1',
    monthKey: '2026-08',
    reviews: [],
    attendance: attendanceEntries,
    complaints: [],
    company: {}
  });
  assert.equal(serverResult.automaticCriteria.find(item => item.id === 'lateMinutes')?.value, 0);
});

test('13-criterion summary keeps manual scores and adds automatic scores', () => {
  const manualCriteria = Array.from({ length: 10 }, (_, index) => ({ id: `manual_${index}`, label: `Manual ${index}` }));
  const manualCriteriaScores = Object.fromEntries(manualCriteria.map(criteria => [criteria.id, 5]));
  const automaticEvaluation = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1', companyId: 'c1', monthKey: '2026-08',
    attendanceEntries: [], complaints: []
  });
  const summary = buildEvaluationSummary13({
    employeeId: 'e1', companyId: 'c1', monthKey: '2026-08',
    manualCriteria, manualCriteriaScores, automaticEvaluation
  });
  assert.equal(summary.criterionCount, 13);
  assert.equal(summary.status, 'complete');
  assert.equal(summary.totalScore, 65);
  assert.equal(summary.exactAverage, 5);
  assert.equal(summary.reward, 100000);
  assert.equal(summary.criteria.filter(item => item.source === 'manual').length, 10);
  assert.equal(summary.criteria.filter(item => item.source === 'attendance' || item.source === 'customer_complaints').length, 3);
});

test('reward mapping is explicit and compatible with final stars', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(getEvaluationReward), [0, 0, 40000, 60000, 80000, 100000]);
});

test('period and summary ids are tenant-scoped and stable', () => {
  assert.equal(buildEvaluationPeriodId('c1', '2026-08'), 'c1_2026-08');
  assert.equal(buildEmployeeEvaluationSummaryId('c1', 'e1', '2026-08'), 'c1_2026-08_e1');
  const first = createIdempotentEvaluationWritePlan({ companyId: 'c1', monthKey: '2026-08', employeeIds: ['e1', 'e1', 'e2'], now: '2026-08-31T16:59:59.000Z' });
  const second = createIdempotentEvaluationWritePlan({ companyId: 'c1', monthKey: '2026-08', employeeIds: ['e2', 'e1'], now: '2026-08-31T17:00:00.000Z' });
  assert.deepEqual(first.summaryIds.sort(), second.summaryIds.sort());
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.isIdempotent, true);
});

test('automatic evaluation remains bounded for a 1000-record month', () => {
  const entries = Array.from({ length: 1000 }, (_, index) => ({
    id: `attendance-${index}`,
    employeeId: 'e1',
    companyId: 'c1',
    date: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
    lateMinutes: index % 3
  }));
  const started = performance.now();
  const result = calculateEmployeeAutomaticEvaluation({
    employeeId: 'e1', companyId: 'c1', monthKey: '2026-08', attendanceEntries: entries, complaints: []
  });
  const elapsed = performance.now() - started;
  assert.equal(result.status, 'complete');
  assert.ok(elapsed < 1000, `evaluation took ${elapsed.toFixed(2)}ms`);
});

assert.equal(AUTOMATIC_EVALUATION_CRITERIA.length, 3);
