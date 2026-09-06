import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustVpsLockedPayroll,
  loadVpsPayrollPeriod,
  lockVpsPayrollPeriod,
  vpsPayrollEntryPayload,
} from "../src/api/vpsPayroll.js";

const companyId = "company-a";

const snapshot = {
  id: "frozen-a",
  companyId,
  periodId: "payroll_company-a_2026-09",
  monthKey: "2026-09",
  employeeId: "employee-a",
  employee: { id: "employee-a", name: "Payroll employee" },
  salaryDetails: {
    baseSalaryCalc: 100,
    supportSalary: 10,
    responsibilitySalary: 5,
    roleSalary: 2,
    experienceSalary: 3,
    overtimePay: 4,
    commission: 5,
    totalBonus: 6,
    evaluationBonus: 7,
    totalPenalty: 8,
    totalAdvance: 9,
    totalEmployeePurchase: 10,
    badDebt: 11,
    openingDebtApplied: 12,
    socialInsurance: 0,
    personalIncomeTax: 0,
    netSalary: 92,
    endingDebt: 0,
  },
  policySnapshot: {
    version: "V1",
    formulaVersion: "F1",
    values: { base: 100 },
  },
  formulaVersion: "F1",
  policyVersion: "V1",
  lockedAt: "2026-09-30T16:00:00.000Z",
};

test("native payroll payload preserves the source snapshot and rejects arithmetic drift", () => {
  const payload = vpsPayrollEntryPayload(snapshot);
  assert.equal(payload.baseSalary, 100);
  assert.equal(payload.allowances, 20);
  assert.equal(payload.bonus, 18);
  assert.equal(payload.deductions, 42);
  assert.equal(payload.sourceSnapshot, snapshot);

  assert.throws(
    () =>
      vpsPayrollEntryPayload({
        ...snapshot,
        salaryDetails: { ...snapshot.salaryDetails, netSalary: 91 },
      }),
    { code: "PAYROLL_SNAPSHOT_TOTAL_MISMATCH" },
  );
});

test("native payroll lock uses tenant-scoped create/generate/approve/lock and reloads immutable snapshots", async () => {
  const calls = [];
  let locked = false;
  const period = {
    id: "period-a",
    companyId,
    code: "HDM-2026-09",
    status: "LOCKED",
  };
  const payroll = {
    id: "payroll-a",
    companyId,
    payrollPeriodId: period.id,
    status: "LOCKED",
  };
  const api = {
    async listPayrollDebtCarryovers() {
      return { items: [] };
    },
    async listPayrollPeriods() {
      calls.push("list-periods");
      return { items: locked ? [period] : [] };
    },
    async listPayrolls(query) {
      calls.push(["list-payrolls", query]);
      return {
        items: locked && query.payrollPeriodId === period.id ? [payroll] : [],
      };
    },
    async getPayroll(id) {
      calls.push(["get-payroll", id]);
      return {
        ...payroll,
        entries: [
          {
            employeeId: snapshot.employeeId,
            sourceContext: { periodId: period.id },
            legacyDetails: snapshot,
          },
        ],
      };
    },
    async createPayrollPeriod(record) {
      calls.push(["create-period", record]);
      return period;
    },
    async generatePayroll(record) {
      calls.push(["generate", record]);
      return { ...payroll, status: "GENERATED" };
    },
    async approvePayroll(id) {
      calls.push(["approve", id]);
      return { ...payroll, status: "APPROVED" };
    },
    async lockPayroll(id) {
      calls.push(["lock", id]);
      locked = true;
      return payroll;
    },
  };

  const result = await lockVpsPayrollPeriod(api, companyId, {
    period: { companyId, monthKey: "2026-09", status: "LOCKED" },
    snapshots: [snapshot],
  });

  assert.equal(result.period.id, period.id);
  assert.equal(result.payroll.id, payroll.id);
  assert.equal(result.snapshots[0].periodId, period.id);
  assert.equal(result.snapshots[0].sourcePeriodId, snapshot.periodId);
  assert.deepEqual(
    calls.slice(1, 5).map(([operation]) => operation),
    ["create-period", "generate", "approve", "lock"],
  );
  assert.equal(
    calls.find(([operation]) => operation === "generate")[1].entries[0]
      .sourceSnapshot,
    snapshot,
  );

  const replay = await lockVpsPayrollPeriod(api, companyId, {
    period: { companyId, monthKey: "2026-09", status: "LOCKED" },
    snapshots: [snapshot],
  });
  assert.equal(replay.payroll.id, payroll.id);
  assert.equal(calls.filter((call) => call[0] === "create-period").length, 1);
});

test("payroll reload rejects an entry whose immutable snapshot belongs to another tenant", async () => {
  const api = {
    async listPayrollDebtCarryovers() {
      return { items: [] };
    },
    async listPayrollPeriods() {
      return { items: [{ id: "period-a", companyId, code: "HDM-2026-09" }] };
    },
    async listPayrolls() {
      return {
        items: [{ id: "payroll-a", companyId, payrollPeriodId: "period-a" }],
      };
    },
    async getPayroll() {
      return {
        id: "payroll-a",
        companyId,
        entries: [
          {
            employeeId: "employee-a",
            sourceContext: { periodId: "period-a" },
            legacyDetails: { ...snapshot, companyId: "company-b" },
          },
        ],
      };
    },
  };

  await assert.rejects(loadVpsPayrollPeriod(api, companyId, "2026-09"), {
    code: "PAYROLL_SNAPSHOT_PROVENANCE_MISMATCH",
  });
});

test("locked payroll corrections use the native tenant-scoped adjustment contract and reload the immutable source", async () => {
  const period = {
    id: "period-a",
    companyId,
    code: "HDM-2026-09",
    status: "LOCKED",
  };
  const payroll = {
    id: "payroll-a",
    companyId,
    payrollPeriodId: period.id,
    status: "LOCKED",
  };
  let adjusted = false;
  let adjustmentRequest = null;
  const api = {
    async listPayrollDebtCarryovers() {
      return {
        items: adjusted
          ? [
              {
                id: "carryover-a",
                companyId,
                employeeId: snapshot.employeeId,
                targetMonthKey: "2026-09",
                amount: 30,
                status: "ADJUSTED",
              },
            ]
          : [],
      };
    },
    async listPayrollPeriods() {
      return { items: [period] };
    },
    async listPayrolls() {
      return { items: [payroll] };
    },
    async getPayroll() {
      return {
        ...payroll,
        entries: [
          {
            employeeId: snapshot.employeeId,
            sourceContext: { periodId: period.id },
            legacyDetails: snapshot,
            ...(adjusted
              ? {
                  latestAdjustment: { id: "adjustment-a", companyId },
                  effectiveSalaryDetails: {
                    ...snapshot.salaryDetails,
                    netSalary: 80,
                    endingDebt: 30,
                    adjustedAfterLock: true,
                  },
                }
              : {}),
          },
        ],
      };
    },
    async adjustLockedPayroll(id, input) {
      adjustmentRequest = { id, input };
      adjusted = true;
      return payroll;
    },
  };

  const result = await adjustVpsLockedPayroll(api, companyId, {
    monthKey: "2026-09",
    snapshotId: snapshot.id,
    employeeId: snapshot.employeeId,
    nextNetSalary: 80,
    nextEndingDebt: 30,
    reason: "Approved correction",
  });

  assert.equal(adjustmentRequest.id, payroll.id);
  assert.equal(adjustmentRequest.input.sourceSnapshotId, snapshot.id);
  assert.equal(adjustmentRequest.input.employeeId, snapshot.employeeId);
  assert.equal(adjustmentRequest.input.nextNetSalary, 80);
  assert.equal(adjustmentRequest.input.nextEndingDebt, 30);
  assert.equal(adjustmentRequest.input.reason, "Approved correction");
  assert.match(adjustmentRequest.input.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(result.snapshots[0].salaryDetails.netSalary, snapshot.salaryDetails.netSalary);
  assert.equal(result.snapshots[0].effectiveSalaryDetails.netSalary, 80);
  assert.equal(result.carryovers[0].amount, 30);
});
