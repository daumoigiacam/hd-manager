import { HdApiError, createRequestId } from "./client.js";
import { normalizePayrollMonthKey } from "../utils/payrollPeriodLock.js";

const MONEY_EPSILON = 0.01;

const asRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;

const asNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new HdApiError(`Payroll snapshot is missing a numeric ${label}.`, {
      code: "PAYROLL_SNAPSHOT_FIELD_REQUIRED",
    });
  }
  return number;
};

const sourcePeriodCode = (monthKey) => `HDM-${monthKey}`;

const sourcePayrollCode = (monthKey) => `HDM-PAYROLL-${monthKey}`;

const vpsPayrollError = (message, code) => new HdApiError(message, { code });

const monthBounds = (monthKey) => {
  const normalized = normalizePayrollMonthKey(monthKey);
  if (!normalized) {
    throw vpsPayrollError(
      "A valid payroll month is required.",
      "PAYROLL_MONTH_REQUIRED",
    );
  }
  const [year, month] = normalized.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    monthKey: normalized,
    periodStart: `${normalized}-01`,
    periodEnd: `${normalized}-${`${lastDay}`.padStart(2, "0")}`,
  };
};

const valueFrom = (source, field) => asNumber(source?.[field], field);

/**
 * Translate a complete, client-side payroll calculation into native numeric
 * fields. The original snapshot stays attached to the entry; an arithmetic
 * mismatch fails before any request is sent instead of silently changing pay.
 */
export const vpsPayrollEntryPayload = (snapshot = {}) => {
  const salary = asRecord(snapshot.salaryDetails);
  if (!salary || !snapshot.employeeId) {
    throw vpsPayrollError(
      "A complete employee payroll snapshot is required.",
      "PAYROLL_SNAPSHOT_REQUIRED",
    );
  }

  const baseSalary = valueFrom(salary, "baseSalaryCalc");
  const allowances = [
    "supportSalary",
    "responsibilitySalary",
    "roleSalary",
    "experienceSalary",
  ].reduce((total, field) => total + valueFrom(salary, field), 0);
  const overtime = valueFrom(salary, "overtimePay");
  const bonus = ["commission", "totalBonus", "evaluationBonus"].reduce(
    (total, field) => total + valueFrom(salary, field),
    0,
  );
  const penalty = valueFrom(salary, "totalPenalty");
  const deductions = [
    "totalAdvance",
    "totalEmployeePurchase",
    "badDebt",
    "openingDebtApplied",
  ].reduce((total, field) => total + valueFrom(salary, field), 0);
  const socialInsurance = Number(salary.socialInsurance ?? 0);
  const personalIncomeTax = Number(salary.personalIncomeTax ?? 0);
  if (
    !Number.isFinite(socialInsurance) ||
    !Number.isFinite(personalIncomeTax)
  ) {
    throw vpsPayrollError(
      "Payroll tax or social-insurance values are invalid.",
      "PAYROLL_TAX_INVALID",
    );
  }

  const net =
    baseSalary +
    allowances +
    overtime +
    bonus -
    penalty -
    deductions -
    socialInsurance -
    personalIncomeTax;
  const expectedNet = valueFrom(salary, "netSalary");
  if (Math.abs(net - expectedNet) > MONEY_EPSILON) {
    throw vpsPayrollError(
      "The native payroll totals do not match the frozen HD Manager snapshot.",
      "PAYROLL_SNAPSHOT_TOTAL_MISMATCH",
    );
  }

  return {
    employeeId: snapshot.employeeId,
    baseSalary,
    allowances,
    overtime,
    bonus,
    penalty,
    deductions,
    socialInsurance,
    personalIncomeTax,
    sourceSnapshot: snapshot,
  };
};

const assertTenant = (record, companyId, label) => {
  if (!record || record.companyId !== companyId) {
    throw vpsPayrollError(
      `${label} is outside the active tenant.`,
      "PAYROLL_TENANT_MISMATCH",
    );
  }
  return record;
};

const snapshotFromPayrollEntry = (
  entry,
  companyId,
  nativePeriodId,
  monthKey,
) => {
  const snapshot = asRecord(entry?.legacyDetails);
  if (!snapshot) {
    throw vpsPayrollError(
      "The VPS payroll entry is missing its immutable HD Manager snapshot.",
      "PAYROLL_SNAPSHOT_PROVENANCE_MISSING",
    );
  }
  if (
    snapshot.companyId !== companyId ||
    normalizePayrollMonthKey(snapshot.monthKey) !== monthKey ||
    snapshot.employeeId !== entry.employeeId ||
    entry?.sourceContext?.periodId !== nativePeriodId
  ) {
    throw vpsPayrollError(
      "The VPS payroll entry provenance does not match its tenant, period, or employee.",
      "PAYROLL_SNAPSHOT_PROVENANCE_MISMATCH",
    );
  }
  return {
    ...snapshot,
    sourcePeriodId: snapshot.periodId,
    periodId: nativePeriodId,
  };
};

const findOnly = (items, predicate, code, message) => {
  const matches = (Array.isArray(items) ? items : []).filter(predicate);
  if (matches.length > 1) throw vpsPayrollError(message, code);
  return matches[0] || null;
};

export const loadVpsPayrollPeriod = async (api, companyId, monthKey) => {
  const bounds = monthBounds(monthKey);
  const periodPage = await api.listPayrollPeriods({
    search: sourcePeriodCode(bounds.monthKey),
    limit: 100,
  });
  const period = findOnly(
    periodPage?.items,
    (item) => item?.code === sourcePeriodCode(bounds.monthKey),
    "PAYROLL_PERIOD_AMBIGUOUS",
    "More than one native payroll period has the same HD Manager period code.",
  );
  if (!period) return { period: null, payroll: null, snapshots: [] };
  assertTenant(period, companyId, "Payroll period");

  const payrollPage = await api.listPayrolls({
    payrollPeriodId: period.id,
    limit: 100,
  });
  const payroll = findOnly(
    payrollPage?.items,
    (item) => item?.payrollPeriodId === period.id,
    "PAYROLL_AMBIGUOUS",
    "More than one native payroll belongs to the same payroll period.",
  );
  if (!payroll)
    return {
      period: { ...period, monthKey: bounds.monthKey },
      payroll: null,
      snapshots: [],
    };
  assertTenant(payroll, companyId, "Payroll");

  const details = await api.getPayroll(payroll.id);
  assertTenant(details, companyId, "Payroll");
  const snapshots = (Array.isArray(details.entries) ? details.entries : []).map(
    (entry) =>
      snapshotFromPayrollEntry(entry, companyId, period.id, bounds.monthKey),
  );
  return {
    period: { ...period, monthKey: bounds.monthKey },
    payroll: details,
    snapshots,
  };
};

/**
 * Create, generate, approve, and lock a native payroll exactly once. Existing
 * native periods are inspected first; a partly completed period is never
 * overwritten because the operator must reconcile it explicitly.
 */
export const lockVpsPayrollPeriod = async (
  api,
  companyId,
  { period, snapshots } = {},
) => {
  const bounds = monthBounds(period?.monthKey);
  const frozenSnapshots = Array.isArray(snapshots) ? snapshots : [];
  if (frozenSnapshots.length === 0) {
    throw vpsPayrollError(
      "At least one frozen payroll snapshot is required.",
      "PAYROLL_SNAPSHOTS_REQUIRED",
    );
  }
  frozenSnapshots.forEach((snapshot) => {
    if (
      snapshot?.companyId !== companyId ||
      normalizePayrollMonthKey(snapshot?.monthKey) !== bounds.monthKey ||
      !snapshot?.employeeId
    ) {
      throw vpsPayrollError(
        "A payroll snapshot does not belong to the active period and tenant.",
        "PAYROLL_SNAPSHOT_TENANT_MISMATCH",
      );
    }
  });

  const existing = await loadVpsPayrollPeriod(api, companyId, bounds.monthKey);
  if (existing.payroll?.status === "LOCKED") return existing;
  if (existing.payroll || existing.period) {
    throw vpsPayrollError(
      "A native payroll period already exists but is not locked; it must be reconciled before retrying.",
      "PAYROLL_PERIOD_RECONCILIATION_REQUIRED",
    );
  }

  const mutationPrefix = `hdm-payroll:${companyId}:${bounds.monthKey}:${createRequestId()}`;
  const nativePeriod = await api.createPayrollPeriod({
    code: sourcePeriodCode(bounds.monthKey),
    periodType: "MONTH",
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    sourceSnapshot: period,
    clientMutationId: `${mutationPrefix}:period`,
  });
  assertTenant(nativePeriod, companyId, "Payroll period");

  const generated = await api.generatePayroll({
    payrollPeriodId: nativePeriod.id,
    code: sourcePayrollCode(bounds.monthKey),
    entries: frozenSnapshots.map(vpsPayrollEntryPayload),
    clientMutationId: `${mutationPrefix}:generate`,
  });
  assertTenant(generated, companyId, "Payroll");
  const approved = await api.approvePayroll(generated.id, {
    clientMutationId: `${mutationPrefix}:approve`,
  });
  assertTenant(approved, companyId, "Payroll");
  const locked = await api.lockPayroll(generated.id, {
    clientMutationId: `${mutationPrefix}:lock`,
  });
  assertTenant(locked, companyId, "Payroll");

  return loadVpsPayrollPeriod(api, companyId, bounds.monthKey);
};
