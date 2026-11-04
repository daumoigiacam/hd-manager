var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  buildEmployeeHomeScreenModel: () => buildEmployeeHomeScreenModel,
  buildEmployeeReviewSummary: () => buildEmployeeReviewSummary,
  buildMonthKeyFromDate: () => buildMonthKeyFromDate,
  buildSalaryDetails: () => buildSalaryDetails,
  calculateAttendanceTiming: () => calculateAttendanceTiming,
  calculateMonthRevenue: () => calculateMonthRevenue,
  employeeHasPosition: () => employeeHasPosition,
  employeeHomeFieldProjection: () => employeeHomeFieldProjection,
  formatAttendanceMomentForWorkDate: () => formatAttendanceMomentForWorkDate,
  formatShiftRangeLabel: () => formatShiftRangeLabel,
  getAssetCostTypeLabel: () => getAssetCostTypeLabel,
  getAssetDisplayLabel: () => getAssetDisplayLabel,
  getAssetStatusLabel: () => getAssetStatusLabel,
  getAttendanceCompactSource: () => getAttendanceCompactSource,
  getDateKeyFromAnyValue: () => getDateKeyFromAnyValue,
  getEmployeePositionLabel: () => getEmployeePositionLabel,
  getEntityTimestamp: () => getEntityTimestamp,
  getOrderSalesEmpId: () => getOrderSalesEmpId,
  getTodayString: () => getTodayString,
  isAssetAssignedToEmployee: () => isAssetAssignedToEmployee,
  isCashflowOfficial: () => isCashflowOfficial,
  isEmployeeDriverPosition: () => isEmployeeDriverPosition,
  isEmployeeSalesPosition: () => isEmployeeSalesPosition,
  normalizeAttendanceRecordForWorkDate: () => normalizeAttendanceRecordForWorkDate,
  normalizeExpenseCategoryLabel: () => normalizeExpenseCategoryLabel,
  parseLooseMoneyValue: () => parseLooseMoneyValue,
  projectEmployeeHomeSnapshot: () => projectEmployeeHomeSnapshot,
  resolveAttendanceAnomalyForDate: () => resolveAttendanceAnomalyForDate,
  resolveEmployeeShiftPolicy: () => resolveEmployeeShiftPolicy,
  validateEmployeeHomeScreenDto: () => validateEmployeeHomeScreenDto,
  withSalesRevenueIndex: () => withSalesRevenueIndex
});
module.exports = __toCommonJS(stdin_exports);

// src/services/employeeHomeFieldProjection.js
var collections = ["customers", "orders", "payments"];
var provenance = /* @__PURE__ */ new WeakMap();
var backings = /* @__PURE__ */ new WeakMap();
var markOwners = /* @__PURE__ */ new Map();
var contexts = /* @__PURE__ */ new Set();
var empty = Object.freeze([]);
var failure = () => Object.assign(new Error("unproven_home_field_projection"), { code: "unproven_home_field_projection" });
var own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
var object = (value) => value !== null && (typeof value === "object" || typeof value === "function");
var metadata = (value) => object(value) ? provenance.get(value) || empty : empty;
function reject(origins) {
  for (const context of contexts) context.violated = true;
  for (const origin of origins) origin.context.violated = true;
  throw failure();
}
function check(origins) {
  for (const origin of origins) if (origin.context.closed || origin.context.violated) reject(origins);
}
var originFor = (origins, key) => {
  for (const origin of origins) if (origin.mark === key) return origin;
};
function wrap(target, origins, mutable) {
  const permitted = (key) => {
    if (own(target, key)) return true;
    for (const origin of origins) if (!origin.fields.has(key)) return false;
    return true;
  };
  const proxy = new Proxy(target, {
    get(record, key, receiver) {
      check(origins);
      if (markOwners.has(key)) return originFor(origins, key);
      if (!permitted(key)) reject(origins);
      return Reflect.get(record, key, receiver);
    },
    has(record, key) {
      check(origins);
      if (!permitted(key)) reject(origins);
      return Reflect.has(record, key);
    },
    ownKeys() {
      return reject(origins);
    },
    getOwnPropertyDescriptor(record, key) {
      check(origins);
      if (!permitted(key)) reject(origins);
      return Reflect.getOwnPropertyDescriptor(record, key);
    },
    set(record, key, value) {
      check(origins);
      if (!mutable) reject(origins);
      return Reflect.set(record, key, value, record);
    },
    defineProperty(record, key, descriptor) {
      check(origins);
      if (!mutable) reject(origins);
      return Reflect.defineProperty(record, key, descriptor);
    },
    deleteProperty(record, key) {
      check(origins);
      if (!mutable || !permitted(key)) reject(origins);
      return Reflect.deleteProperty(record, key);
    },
    setPrototypeOf() {
      return reject(origins);
    },
    preventExtensions() {
      return reject(origins);
    }
  });
  provenance.set(proxy, origins);
  backings.set(proxy, target);
  return proxy;
}
function createEmployeeHomeFieldProjection(fieldsByCollection) {
  if (!fieldsByCollection || typeof fieldsByCollection !== "object" || Array.isArray(fieldsByCollection) || contexts.size >= 4) throw failure();
  const allowed = /* @__PURE__ */ new Map();
  for (const [name, fields] of Object.entries(fieldsByCollection)) {
    if (!collections.includes(name) || !Array.isArray(fields) || fields.length < 3 || fields.length > 1024 || new Set(fields).size !== fields.length || fields.some((key) => typeof key !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) || !["companyId", "isArchived", "id"].every((key) => fields.includes(key))) throw failure();
    allowed.set(name, new Set(fields));
  }
  if (!allowed.size) throw failure();
  const context = { violated: false, closed: false }, origins = /* @__PURE__ */ new Map();
  contexts.add(context);
  for (const [collection, fields] of allowed) {
    const origin = { context, collection, fields, mark: /* @__PURE__ */ Symbol("private-home-projection") };
    origins.set(collection, origin);
    markOwners.set(origin.mark, origin);
  }
  const allOrigins = [...origins.values()];
  return {
    source(name, record) {
      const origin = origins.get(name);
      check(allOrigins);
      if (!origin || !record || ![Object.prototype, null].includes(Object.getPrototypeOf(record)) || !Object.isExtensible(record) || Reflect.ownKeys(record).some((key) => !origin.fields.has(key))) reject(allOrigins);
      return wrap(record, [origin], false);
    },
    assertVerified() {
      check(allOrigins);
    },
    close() {
      context.closed = true;
      contexts.delete(context);
      for (const origin of origins.values()) markOwners.delete(origin.mark);
    }
  };
}
function employeeHomeSpreadSource(value) {
  const origins = metadata(value);
  if (!origins.length) return value;
  check(origins);
  const target = backings.get(value);
  if (!target) reject(origins);
  const proxy = new Proxy(target, {
    ownKeys() {
      check(origins);
      return [...Reflect.ownKeys(target), ...origins.map((origin) => origin.mark)];
    },
    get(_record, key) {
      check(origins);
      return originFor(origins, key) || Reflect.get(value, key);
    },
    getOwnPropertyDescriptor(_record, key) {
      check(origins);
      const origin = originFor(origins, key);
      return origin ? { value: origin, enumerable: true, configurable: true, writable: true } : Reflect.getOwnPropertyDescriptor(value, key);
    },
    has(_record, key) {
      return Reflect.has(value, key);
    },
    set(_record, key, next) {
      return Reflect.set(value, key, next);
    },
    defineProperty(_record, key, descriptor) {
      return Reflect.defineProperty(value, key, descriptor);
    },
    deleteProperty(_record, key) {
      return Reflect.deleteProperty(value, key);
    },
    setPrototypeOf() {
      return reject(origins);
    },
    preventExtensions() {
      return reject(origins);
    }
  });
  provenance.set(proxy, origins);
  backings.set(proxy, target);
  return proxy;
}
function employeeHomeSpreadResult(value) {
  if (!object(value) || metadata(value).length) return value;
  const origins = [];
  for (const mark of Object.getOwnPropertySymbols(value)) {
    const origin = markOwners.get(mark);
    if (!origin) {
      if (typeof mark === "symbol" && mark.description === "private-home-projection") reject([]);
      continue;
    }
    if (Reflect.getOwnPropertyDescriptor(value, mark)?.value !== origin) throw failure();
    origins.push(origin);
    Reflect.deleteProperty(value, mark);
  }
  if (!origins.length) return value;
  check(origins);
  if (new Set(origins.map((origin) => origin.context)).size !== 1) reject(origins);
  return wrap(value, origins, true);
}

// src/utils/salesRevenuePeriod.js
var normalizeId = (value) => `${value || ""}`.trim();
var activeRevenueIndex = null;
var createSalesRevenueIndexScope = () => {
  const index = /* @__PURE__ */ new WeakMap();
  return (calculate) => {
    const previous = activeRevenueIndex;
    activeRevenueIndex = index;
    try {
      return calculate();
    } finally {
      activeRevenueIndex = previous;
    }
  };
};
var withSalesRevenueIndex = (calculate) => createSalesRevenueIndexScope()(calculate);
var toFiniteAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};
var normalizeSalesRevenueMonthKey = (value = "") => {
  const text3 = `${value || ""}`.trim();
  const directMatch = text3.match(/^(\d{4})-(\d{2})/);
  if (directMatch) {
    const month = Number(directMatch[2]);
    return month >= 1 && month <= 12 ? `${directMatch[1]}-${directMatch[2]}` : "";
  }
  const date = value instanceof Date ? value : value && typeof value?.toDate === "function" ? value.toDate() : null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
var getSalesOrderMonthKey = (order = {}) => {
  const candidates = [order.date, order.orderDate, order.createdAt];
  for (const candidate of candidates) {
    const monthKey = normalizeSalesRevenueMonthKey(candidate);
    if (monthKey) return monthKey;
  }
  return "";
};
var getSalesOrderEmployeeId = (order = {}, customerById = /* @__PURE__ */ new Map()) => {
  const customer = customerById.get(normalizeId(order?.customerId));
  return normalizeId(
    order?.salesEmpId || customer?.empId || order?.createdByEmpId || order?.empId
  );
};
var summarizeEmployeeSalesRevenueForMonth = ({
  employeeId = "",
  orders = [],
  customers = [],
  monthKey = ""
} = {}) => {
  const safeEmployeeId = normalizeId(employeeId);
  const safeMonthKey = normalizeSalesRevenueMonthKey(monthKey);
  if (!safeEmployeeId || !safeMonthKey) {
    return { monthKey: safeMonthKey, revenue: 0, orderCount: 0, customerCount: 0, orderIds: [] };
  }
  const buildCustomerLookup = () => new Map(
    (customers || []).filter((customer) => customer?.id).map((customer) => [normalizeId(customer.id), customer])
  );
  if (activeRevenueIndex && Array.isArray(orders) && Array.isArray(customers)) {
    let byCustomers = activeRevenueIndex.get(orders);
    if (!byCustomers) {
      byCustomers = /* @__PURE__ */ new WeakMap();
      activeRevenueIndex.set(orders, byCustomers);
    }
    let index = byCustomers.get(customers);
    if (!index) {
      const customerById2 = buildCustomerLookup();
      index = /* @__PURE__ */ new Map();
      for (const order of orders) {
        if (!order || order.isArchived) continue;
        const month = getSalesOrderMonthKey(order);
        const owner = getSalesOrderEmployeeId(order, customerById2);
        if (!month || !owner) continue;
        if (!index.has(month)) index.set(month, /* @__PURE__ */ new Map());
        const owners = index.get(month);
        if (!owners.has(owner)) owners.set(owner, { revenue: 0, orderCount: 0, customers: /* @__PURE__ */ new Set(), orderIds: [] });
        const row2 = owners.get(owner);
        row2.revenue += toFiniteAmount(order.amount);
        row2.orderCount += 1;
        if (order.customerId) row2.customers.add(normalizeId(order.customerId));
        if (order.id) row2.orderIds.push(normalizeId(order.id));
      }
      byCustomers.set(customers, index);
    }
    const row = index.get(safeMonthKey)?.get(safeEmployeeId);
    return {
      monthKey: safeMonthKey,
      revenue: row?.revenue || 0,
      orderCount: row?.orderCount || 0,
      customerCount: row?.customers.size || 0,
      orderIds: row ? [...row.orderIds] : []
    };
  }
  const customerById = buildCustomerLookup();
  const matchedCustomerIds = /* @__PURE__ */ new Set();
  const orderIds = [];
  let revenue = 0;
  let orderCount = 0;
  (orders || []).forEach((order) => {
    if (!order || order.isArchived) return;
    if (getSalesOrderMonthKey(order) !== safeMonthKey) return;
    if (getSalesOrderEmployeeId(order, customerById) !== safeEmployeeId) return;
    revenue += toFiniteAmount(order.amount);
    orderCount += 1;
    if (order.customerId) matchedCustomerIds.add(normalizeId(order.customerId));
    if (order.id) orderIds.push(normalizeId(order.id));
  });
  return {
    monthKey: safeMonthKey,
    revenue,
    orderCount,
    customerCount: matchedCustomerIds.size,
    orderIds
  };
};
var calculateEmployeeSalesRevenueForMonth = (options = {}) => summarizeEmployeeSalesRevenueForMonth(options).revenue;

// src/utils/payrollPolicyHistory.js
var DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
var PAYROLL_POLICY_SCHEMA_VERSION = 1;
var PAYROLL_FORMULA_VERSION = "HD_PAYROLL_FORMULA_V1";
var PAYROLL_POLICY_FIELDS = Object.freeze([
  "position",
  "primaryPosition",
  "secondaryPositions",
  "additionalPositions",
  "departments",
  "startDate",
  "probationDuration",
  "probationUnit",
  "probationRate",
  "basicSalary",
  "salaryMonthDays",
  "supportSalary",
  "responsibilitySalary",
  "experienceSalary",
  "experienceSalaryPeriod",
  "roleSalaryComponents",
  "departmentSalaryComponents",
  "salaryByDepartment",
  "commissionRate",
  "commissionBaseMode",
  "targetRevenue",
  "salesLeaderId",
  "salesManagerId",
  "parentSalesEmpId",
  "managerEmpId",
  "salesLeaderCommissionPercent",
  "leaderCommissionPercent",
  "managerCommissionPercent",
  "overtimeRate",
  "latePenaltyRate",
  "latePenaltyTiers",
  "autoEarlyOvertimeEnabled",
  "autoLateCheckoutOvertimeEnabled",
  "shiftName",
  "shiftStart",
  "shiftEnd",
  "shiftIsOvernight",
  "graceMinutes"
]);
var cloneValue = (value) => {
  if (value === void 0) return void 0;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  return Object.entries(value).reduce((result, [key, nestedValue]) => {
    const cloned = cloneValue(nestedValue);
    if (cloned !== void 0) result[key] = cloned;
    return result;
  }, {});
};
var normalizeDateKey = (value = "") => {
  const raw = `${value || ""}`.trim().slice(0, 10);
  if (!DATE_KEY_PATTERN.test(raw)) return "";
  const date = /* @__PURE__ */ new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : raw;
};
var getMonthBounds = (monthKey = "") => {
  const match = `${monthKey || ""}`.match(/^(\d{4})-(\d{2})$/);
  if (!match) return { start: "", end: "" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return { start: "", end: "" };
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${`${lastDay}`.padStart(2, "0")}`
  };
};
var normalizeVersionNumber = (value) => {
  const match = `${value || ""}`.match(/(\d+)$/);
  return match ? Math.max(1, Number(match[1]) || 1) : 1;
};
var captureEmployeePayrollPolicy = (employee = {}) => PAYROLL_POLICY_FIELDS.reduce((policy, fieldName) => {
  if (employee?.[fieldName] !== void 0) policy[fieldName] = cloneValue(employee[fieldName]);
  return policy;
}, {});
var normalizePolicyRecord = (policy = {}, index = 0) => {
  const values = policy?.values && typeof policy.values === "object" ? policy.values : policy?.policy && typeof policy.policy === "object" ? policy.policy : captureEmployeePayrollPolicy(policy);
  const versionNumber = normalizeVersionNumber(policy?.version || policy?.policyVersion || index + 1);
  return {
    id: `${policy?.id || `payroll-policy-${versionNumber}`}`,
    version: `${policy?.version || policy?.policyVersion || `v${versionNumber}`}`,
    versionNumber,
    schemaVersion: Number(policy?.schemaVersion) || PAYROLL_POLICY_SCHEMA_VERSION,
    formulaVersion: `${policy?.formulaVersion || PAYROLL_FORMULA_VERSION}`,
    effectiveFrom: normalizeDateKey(policy?.effectiveFrom) || "1970-01-01",
    effectiveTo: normalizeDateKey(policy?.effectiveTo),
    values: cloneValue(values),
    createdAt: `${policy?.createdAt || ""}`,
    createdByEmployeeId: `${policy?.createdByEmployeeId || ""}`,
    createdByName: `${policy?.createdByName || ""}`,
    supersededAt: `${policy?.supersededAt || ""}`
  };
};
var getStoredEmployeePayrollPolicyHistory = (employee = {}) => {
  const storedPolicies = Array.isArray(employee?.payrollPolicies) ? employee.payrollPolicies : Array.isArray(employee?.salaryPolicyHistory) ? employee.salaryPolicyHistory : [];
  return storedPolicies.filter((policy) => policy && typeof policy === "object").map(normalizePolicyRecord).sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom) || left.versionNumber - right.versionNumber);
};
var getEmployeePayrollPolicyHistory = (employee = {}) => {
  const storedPolicies = getStoredEmployeePayrollPolicyHistory(employee);
  if (storedPolicies.length > 0) return storedPolicies;
  return [normalizePolicyRecord({
    id: "unversioned-live-profile-preview",
    version: "UNVERSIONED_LIVE_PREVIEW",
    effectiveFrom: employee?.salaryPolicyEffectiveFrom || employee?.startDate || "1970-01-01",
    values: captureEmployeePayrollPolicy(employee),
    createdAt: employee?.createdAt || "",
    createdByEmployeeId: employee?.createdByEmpId || ""
  })];
};
var resolvePolicyFromHistory = (history = [], monthKey = "") => {
  const { start, end } = getMonthBounds(monthKey);
  if (!start || !end) return history[history.length - 1] || null;
  const matchingPolicies = history.filter((policy) => !policy.supersededAt && policy.effectiveFrom <= end && (!policy.effectiveTo || policy.effectiveTo >= start));
  return matchingPolicies[matchingPolicies.length - 1] || null;
};
var resolveEmployeePayrollPolicy = (employee = {}, monthKey = "") => {
  const history = getEmployeePayrollPolicyHistory(employee);
  return resolvePolicyFromHistory(history, monthKey) || history[0] || null;
};
var applyEmployeePayrollPolicyForMonth = (employee = {}, monthKey = "") => {
  const policy = resolveEmployeePayrollPolicy(employee, monthKey);
  if (!policy) return employee;
  return employeeHomeSpreadResult({
    ...employeeHomeSpreadSource(employee),
    ...employeeHomeSpreadSource(cloneValue(policy.values)),
    resolvedPayrollPolicy: cloneValue(policy),
    payrollPolicyVersion: policy.version,
    payrollPolicyEffectiveFrom: policy.effectiveFrom,
    payrollPolicyEffectiveTo: policy.effectiveTo || ""
  });
};

// src/utils/employeeEvaluationAutomation.js
var AUTOMATIC_EVALUATION_SCHEMA_VERSION = 1;
var AUTOMATIC_EVALUATION_CRITERIA = [
  {
    id: "lateMinutes",
    label: "T\u1ED5ng ph\xFAt \u0111i mu\u1ED9n",
    unit: "ph\xFAt",
    source: "attendance"
  },
  {
    id: "leaveDays",
    label: "Ng\xE0y ngh\u1EC9 trong th\xE1ng",
    unit: "ng\xE0y",
    source: "attendance"
  },
  {
    id: "customerComplaints",
    label: "Ph\u1EA3n \xE1nh kh\xE1ch h\xE0ng \u0111\xE3 x\xE1c nh\u1EADn",
    unit: "l\u1EA7n",
    source: "customer_complaints"
  }
];
var EVALUATION_REWARD_PER_STAR = 2e5;
var normalizeEvaluationStars = (stars) => {
  const value = Number(stars);
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(5, value)) * 2) / 2;
};
var VALID_COMPLAINT_STATUSES = /* @__PURE__ */ new Set([
  "accepted",
  "confirmed",
  "processed",
  "resolved",
  "valid",
  "validated",
  "\u0111\xE3 x\xE1c nh\u1EADn",
  "\u0111\xE3 x\u1EED l\xFD"
]);
var REJECTED_COMPLAINT_STATUSES = /* @__PURE__ */ new Set([
  "cancelled",
  "canceled",
  "dismissed",
  "invalid",
  "rejected",
  "rejected_by_company",
  "t\u1EEB ch\u1ED1i",
  "\u0111\xE3 t\u1EEB ch\u1ED1i"
]);
var text = (value) => `${value ?? ""}`.trim();
var normalizeMonthKey = (value) => {
  const raw = text(value);
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
  return "";
};
var toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object") {
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1e3);
    const millis = Number(value.toMillis?.());
    if (Number.isFinite(millis) && millis > 0) return new Date(millis);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
var employeeEvaluationDateTimeFormatter = null;
var getDateTimeParts = (value) => {
  const raw = text(value);
  const localMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{2})/);
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (localMatch && !hasExplicitZone) {
    return {
      year: Number(localMatch[1]),
      month: Number(localMatch[2]),
      day: Number(localMatch[3]),
      hour: Number(localMatch[4]),
      minute: Number(localMatch[5])
    };
  }
  const parsed = toDate(value);
  if (!parsed) return null;
  if (!employeeEvaluationDateTimeFormatter) employeeEvaluationDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  });
  const parts = employeeEvaluationDateTimeFormatter.formatToParts(parsed);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
};
var dateKey = (value) => {
  const raw = text(value);
  const direct = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (direct) return `${direct[1]}-${String(Number(direct[2])).padStart(2, "0")}-${String(Number(direct[3])).padStart(2, "0")}`;
  const parsed = toDate(value);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
var inMonth = (value, monthKey) => dateKey(value).startsWith(`${monthKey}-`);
var clampNonNegativeNumber = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};
var getAttendanceDocumentIdentity = (item) => {
  const match = text(item?.id ?? item?.recordId ?? "").match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
  return {
    date: match?.[1] || "",
    employeeId: match?.[2] || ""
  };
};
var getEmployeeId = (item) => {
  const attendanceIdentity = getAttendanceDocumentIdentity(item);
  return text(
    item?.employeeId ?? item?.empId ?? item?.targetEmployeeId ?? item?.driverId ?? item?.assignedEmployeeId ?? attendanceIdentity.employeeId
  );
};
var getCompanyId = (item) => text(item?.companyId ?? item?.appId ?? item?.tenantId);
var getEventDate = (item) => {
  const attendanceIdentity = getAttendanceDocumentIdentity(item);
  return attendanceIdentity.date || (item?.date ?? item?.dateKey ?? item?.monthKey ?? item?.createdAt ?? item?.updatedAt ?? item?.timestamp ?? "");
};
var stableFingerprint = (item, index = 0) => text(
  item?.id ?? item?.recordId ?? item?.attendanceId ?? item?.complaintId ?? `${dateKey(getEventDate(item))}|${getEmployeeId(item)}|${item?.type ?? item?.status ?? ""}|${index}`
);
var uniqueByStableId = (items = []) => {
  const seen = /* @__PURE__ */ new Set();
  return (Array.isArray(items) ? items : []).filter((item, index) => {
    const key = stableFingerprint(item, index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
var normalizeTimeMinutes = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 24 * 60) return value;
    const parsedTimestamp = toDate(value);
    return parsedTimestamp ? parsedTimestamp.getHours() * 60 + parsedTimestamp.getMinutes() : null;
  }
  const raw = text(value);
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const match2 = raw.match(/^(\d{1,2}):(\d{2})$/);
    return Number(match2[1]) * 60 + Number(match2[2]);
  }
  const parsed = getDateTimeParts(value);
  if (parsed) return parsed.hour * 60 + parsed.minute;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
var calendarDayNumber = (value) => {
  const raw = dateKey(value);
  if (!raw) return null;
  const [year, month, day] = raw.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1e3));
};
var calendarDayNumberFromParts = (parts) => calendarDayNumber(
  `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
);
var resolveLateMinutes = (entry, shiftPolicy = {}) => {
  const payrollLateMinutes = clampNonNegativeNumber(entry?.payrollLateMinutes);
  if (payrollLateMinutes !== null) return payrollLateMinutes;
  const checkInValue = entry?.checkIn ?? entry?.checkInAt ?? entry?.timeIn;
  const checkIn = normalizeTimeMinutes(checkInValue);
  const start = normalizeTimeMinutes(shiftPolicy?.shiftStart ?? shiftPolicy?.start ?? "07:00");
  const end = normalizeTimeMinutes(shiftPolicy?.shiftEnd ?? shiftPolicy?.end ?? "17:00");
  if (checkIn !== null && start !== null) {
    const isOvernight = end !== null && end <= start;
    const checkInParts = getDateTimeParts(checkInValue);
    const attendanceDay = calendarDayNumber(getEventDate(entry));
    if (checkInParts && attendanceDay !== null) {
      const checkInDay = calendarDayNumberFromParts(checkInParts);
      const shiftStartDay = attendanceDay - (isOvernight ? 1 : 0);
      const elapsedMinutes = (checkInDay - shiftStartDay) * (24 * 60) + checkInParts.hour * 60 + checkInParts.minute - start;
      return Math.max(0, elapsedMinutes);
    }
    return checkIn >= start ? checkIn - start : 0;
  }
  return clampNonNegativeNumber(entry?.lateMinutes ?? entry?.minutesLate ?? entry?.late);
};
var scoreLateMinutes = (value) => {
  const minutes = clampNonNegativeNumber(value);
  if (minutes === null) return { score: null, value: null, status: "missing_data" };
  if (minutes < 100) return { score: 5, value: minutes, status: "complete" };
  if (minutes <= 150) return { score: 4.5, value: minutes, status: "complete" };
  if (minutes <= 200) return { score: 4, value: minutes, status: "complete" };
  if (minutes <= 250) return { score: 3.5, value: minutes, status: "complete" };
  if (minutes <= 300) return { score: 3, value: minutes, status: "complete" };
  if (minutes <= 350) return { score: 2.5, value: minutes, status: "complete" };
  if (minutes <= 400) return { score: 2, value: minutes, status: "complete" };
  if (minutes <= 450) return { score: 1.5, value: minutes, status: "complete" };
  if (minutes <= 500) return { score: 1, value: minutes, status: "complete" };
  return { score: 0, value: minutes, status: "complete" };
};
var scoreLeaveDays = (value) => {
  const days = clampNonNegativeNumber(value);
  if (days === null) return { score: null, value: null, status: "missing_data" };
  if (days < 1) return { score: 5, value: days, status: "complete" };
  if (days < 2) return { score: 4, value: days, status: "complete" };
  if (days < 3) return { score: 3, value: days, status: "complete" };
  if (days < 4) return { score: 2, value: days, status: "complete" };
  if (days < 5) return { score: 1, value: days, status: "complete" };
  return { score: 0, value: days, status: "complete" };
};
var scoreValidatedComplaints = (value) => {
  const count = clampNonNegativeNumber(value);
  if (count === null) return { score: null, value: null, status: "missing_data" };
  if (count < 1) return { score: 5, value: count, status: "complete" };
  if (count < 2) return { score: 4, value: count, status: "complete" };
  if (count < 3) return { score: 3, value: count, status: "complete" };
  if (count < 4) return { score: 2, value: count, status: "complete" };
  if (count < 5) return { score: 1, value: count, status: "complete" };
  return { score: 0, value: count, status: "complete" };
};
var collectLateMinutes = ({ entries, employeeId, companyId, monthKey, shiftPolicy } = {}) => {
  if (entries == null) return { status: "missing_data", value: null, records: [], details: [] };
  const filtered = uniqueByStableId(entries || []).filter((entry) => (!employeeId || getEmployeeId(entry) === text(employeeId)) && (!companyId || getCompanyId(entry) === text(companyId)) && (!monthKey || inMonth(getEventDate(entry), monthKey)) && !Boolean(entry?.leave || entry?.isLeave || ["leave", "approved_leave", "unapproved_leave", "absent"].includes(text(entry?.status).toLowerCase()) || entry?.leaveType));
  const details = filtered.map((entry) => ({
    id: stableFingerprint(entry),
    date: dateKey(getEventDate(entry)),
    minutes: resolveLateMinutes(entry, shiftPolicy)
  }));
  if (details.some((item) => item.minutes === null)) return { status: "missing_data", value: null, records: filtered, details };
  return { status: "complete", value: details.reduce((sum, item) => sum + item.minutes, 0), records: filtered, details };
};
var collectLeaveDays = ({ entries, attendanceEntries, employeeId, companyId, monthKey } = {}) => {
  const source = entries === void 0 ? attendanceEntries : entries;
  if (source == null) return { status: "missing_data", value: null, records: [], details: [] };
  const filtered = uniqueByStableId(source || []).filter((entry) => (!employeeId || getEmployeeId(entry) === text(employeeId)) && (!companyId || getCompanyId(entry) === text(companyId)) && (!monthKey || inMonth(getEventDate(entry), monthKey)) && Boolean(entry?.leave || entry?.isLeave || ["leave", "approved_leave", "unapproved_leave", "absent"].includes(text(entry?.status).toLowerCase()) || entry?.leaveType));
  const days = [...new Set(filtered.map((item) => dateKey(getEventDate(item))).filter(Boolean))];
  return {
    status: "complete",
    value: days.length,
    records: filtered,
    details: days.map((date) => ({ date }))
  };
};
var collectValidatedComplaints = ({ complaints, employeeId, companyId, monthKey } = {}) => {
  if (complaints == null) return { status: "missing_data", value: null, records: [], details: [] };
  const filtered = uniqueByStableId(complaints || []).filter((item) => {
    const status = text(item?.status ?? item?.resolutionStatus ?? item?.validationStatus).toLowerCase();
    const linkedEmployee = getEmployeeId(item);
    const linkedCompany = getCompanyId(item);
    return (!employeeId || linkedEmployee === text(employeeId)) && (!companyId || linkedCompany === text(companyId)) && (!monthKey || inMonth(getEventDate(item), monthKey)) && VALID_COMPLAINT_STATUSES.has(status) && !REJECTED_COMPLAINT_STATUSES.has(status) && item?.isValid !== false && item?.isRejected !== true;
  });
  return {
    status: "complete",
    value: filtered.length,
    records: filtered,
    details: filtered.map((item) => ({
      id: stableFingerprint(item),
      date: dateKey(getEventDate(item)),
      status: text(item?.status ?? item?.resolutionStatus ?? item?.validationStatus)
    }))
  };
};
var buildCriterion = (definition, result, details = []) => ({
  id: definition.id,
  label: definition.label,
  unit: definition.unit,
  source: definition.source,
  status: result.status,
  value: result.value,
  score: result.score,
  details
});
var calculateEmployeeAutomaticEvaluation = ({
  employeeId = "",
  companyId = "",
  monthKey = "",
  attendanceEntries,
  leaveEntries,
  complaints,
  shiftPolicy = {}
} = {}) => {
  const normalizedMonthKey = normalizeMonthKey(monthKey);
  const late = collectLateMinutes({ entries: attendanceEntries, employeeId, companyId, monthKey: normalizedMonthKey, shiftPolicy });
  const leave = collectLeaveDays({ entries: leaveEntries === void 0 ? attendanceEntries : leaveEntries, employeeId, companyId, monthKey: normalizedMonthKey });
  const complaint = collectValidatedComplaints({ complaints, employeeId, companyId, monthKey: normalizedMonthKey });
  const lateScore = scoreLateMinutes(late.value);
  const leaveScore = scoreLeaveDays(leave.value);
  const complaintScore = scoreValidatedComplaints(complaint.value);
  const criteria = {
    lateMinutes: buildCriterion(AUTOMATIC_EVALUATION_CRITERIA[0], lateScore, late.details),
    leaveDays: buildCriterion(AUTOMATIC_EVALUATION_CRITERIA[1], leaveScore, leave.details),
    customerComplaints: buildCriterion(AUTOMATIC_EVALUATION_CRITERIA[2], complaintScore, complaint.details)
  };
  const missingData = Object.values(criteria).filter((item) => item.status !== "complete").map((item) => item.id);
  const scores = Object.fromEntries(Object.entries(criteria).map(([id, item]) => [id, item.score]));
  const totalScore = missingData.length ? null : Object.values(scores).reduce((sum, score) => sum + score, 0);
  const exactAverage = totalScore === null ? null : totalScore / Object.keys(criteria).length;
  return {
    schemaVersion: AUTOMATIC_EVALUATION_SCHEMA_VERSION,
    source: "automatic",
    employeeId: text(employeeId),
    companyId: text(companyId),
    monthKey: normalizedMonthKey,
    status: missingData.length ? "needs_review" : "complete",
    criteria,
    scores,
    criterionCount: Object.keys(criteria).length,
    totalScore,
    exactAverage,
    displayAverage: exactAverage === null ? null : Number(exactAverage.toFixed(2)),
    missingData
  };
};
var getEvaluationStarsFromAverage = (average) => {
  const value = Number(average);
  if (!Number.isFinite(value)) return null;
  return normalizeEvaluationStars(value);
};
var getEvaluationReward = (stars) => Math.round(normalizeEvaluationStars(stars) * EVALUATION_REWARD_PER_STAR);
var buildEvaluationSummary13 = ({
  employeeId = "",
  companyId = "",
  monthKey = "",
  manualCriteria = [],
  manualCriteriaScores = {},
  automaticEvaluation = null,
  status = "complete"
} = {}) => {
  const manualItems = (manualCriteria || []).map((criteria2) => ({
    id: criteria2.id,
    label: criteria2.label,
    source: "manual",
    status: Number.isFinite(Number(manualCriteriaScores?.[criteria2.id])) ? "complete" : "missing_data",
    score: Number.isFinite(Number(manualCriteriaScores?.[criteria2.id])) ? Number(manualCriteriaScores[criteria2.id]) : null,
    value: null,
    details: []
  }));
  const automaticItems = AUTOMATIC_EVALUATION_CRITERIA.map((criteria2) => automaticEvaluation?.criteria?.[criteria2.id] || employeeHomeSpreadResult({
    ...employeeHomeSpreadSource(criteria2),
    source: "automatic",
    status: "missing_data",
    score: null,
    value: null,
    details: []
  }));
  const criteria = [...manualItems, ...automaticItems];
  const missingData = criteria.filter((item) => item.status !== "complete").map((item) => item.id);
  const scores = Object.fromEntries(criteria.map((item) => [item.id, item.score]));
  const totalScore = missingData.length ? null : criteria.reduce((sum, item) => sum + item.score, 0);
  const exactAverage = totalScore === null ? null : totalScore / criteria.length;
  return {
    schemaVersion: AUTOMATIC_EVALUATION_SCHEMA_VERSION,
    employeeId: text(employeeId),
    companyId: text(companyId),
    monthKey: normalizeMonthKey(monthKey),
    status: missingData.length ? "needs_review" : status,
    criteria,
    scores,
    criterionCount: criteria.length,
    totalScore,
    exactAverage,
    displayAverage: exactAverage === null ? null : Number(exactAverage.toFixed(2)),
    stars: getEvaluationStarsFromAverage(exactAverage),
    reward: exactAverage === null ? null : getEvaluationReward(getEvaluationStarsFromAverage(exactAverage)),
    missingData,
    source: "manual_and_automatic"
  };
};

// src/utils/attendanceWorkRoles.js
function getWorkRoleRecord(record, primaryPosition, position = primaryPosition) {
  if (!record) return null;
  if (record.workRoles?.[position]) return record.workRoles[position];
  return position === primaryPosition && (!record.workRole || record.workRole === position) && (record.status || record.checkIn || record.checkOut) ? record : null;
}
function employeeForWorkRole(employee = {}, position = employee?.position) {
  employee ||= {};
  if (position === employee.position) return employee;
  const components = employee.roleSalaryComponents || employee.departmentSalaryComponents || employee.salaryByDepartment;
  const component = (Array.isArray(components) ? components : []).find((row) => (row?.position || row?.department || row?.role) === position) || {};
  return employeeHomeSpreadResult({
    ...employeeHomeSpreadSource(employee),
    position,
    shiftName: component.shiftName || "",
    shiftStart: component.shiftStart || "",
    shiftEnd: component.shiftEnd || "",
    graceMinutes: component.graceMinutes,
    missingAlertMinutes: component.missingAlertMinutes
  });
}
function getWorkRoleMonthEntries(attendance, employee, position, monthKey, calculateTiming) {
  const roleEmployee = employeeForWorkRole(employee, position);
  return Object.entries(attendance || {}).filter(([key, record]) => key.endsWith(`_${employee.id}`) && key.startsWith(`${monthKey}-`) && (!record?.companyId || !employee.companyId || record.companyId === employee.companyId)).flatMap(([key, record]) => {
    const roleRecord = getWorkRoleRecord(record, employee.position, position);
    if (!roleRecord) return [];
    const entry = {
      date: key.slice(0, 10),
      workRole: position,
      isPrimaryRole: position === employee.position,
      status: roleRecord.status || "missing",
      checkIn: roleRecord.checkIn || null,
      checkOut: roleRecord.checkOut || null,
      checkInMethod: roleRecord.checkInMethod || "",
      checkOutMethod: roleRecord.checkOutMethod || ""
    };
    return [employeeHomeSpreadResult({ ...employeeHomeSpreadSource(entry), ...employeeHomeSpreadSource(calculateTiming(roleEmployee, entry)) })];
  }).sort((a, b) => a.date.localeCompare(b.date));
}
function calculateWorkRoleSalary(amount, entries, monthDays, probationEndDate, probationRate = 1) {
  const cutoff = probationEndDate ? new Date(probationEndDate).getTime() : NaN;
  let workDaysProbation = 0;
  let workDaysOfficial = 0;
  for (const entry of entries) {
    if (!["present", "late"].includes(entry.status) || entry.noSalaryDay) continue;
    if ((/* @__PURE__ */ new Date(`${entry.date}T00:00:00`)).getTime() <= cutoff) workDaysProbation++;
    else workDaysOfficial++;
  }
  return {
    workDays: workDaysProbation + workDaysOfficial,
    workDaysProbation,
    workDaysOfficial,
    calculatedAmount: monthDays > 0 ? Math.round(amount / monthDays * (workDaysOfficial + workDaysProbation * probationRate)) : 0
  };
}

// src/utils/salaryAdvancePeriod.js
var normalizeMonthCandidate = (value = "") => {
  const text3 = `${value || ""}`.trim();
  const match = text3.match(/^(\d{4})-(\d{2})/);
  if (!match) return "";
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : "";
};
var getSalaryAdvanceMonth = (record = {}) => {
  const candidates = [
    record.salaryMonth,
    record.deductionMonth,
    record.payrollMonth,
    record.date,
    record.createdAt
  ];
  for (const candidate of candidates) {
    const monthKey = normalizeMonthCandidate(candidate);
    if (monthKey) return monthKey;
  }
  return "";
};
var isSalaryAdvanceInMonth = (record = {}, monthKey = "") => {
  const expectedMonth = normalizeMonthCandidate(monthKey);
  return Boolean(expectedMonth) && getSalaryAdvanceMonth(record) === expectedMonth;
};

// src/services/cooperativeProjection.js
function* sortProjection(records, compare) {
  let from = records;
  let to = new Array(from.length);
  for (let width = 1; width < from.length; width *= 2) {
    for (let offset = 0; offset < from.length; offset += width * 2) {
      let left = offset;
      const middle = Math.min(offset + width, from.length);
      let right = middle;
      const end = Math.min(offset + width * 2, from.length);
      for (let position = offset; position < end; position++) {
        to[position] = left < middle && (right >= end || compare(from[left], from[right]) <= 0) ? from[left++] : from[right++];
        yield;
      }
    }
    [from, to] = [to, from];
  }
  return from;
}

// src/services/productPricingUnits.js
var PRODUCT_PRICING_UNIT_OPTIONS = ["Kg", "Con", "C\xE1i", "B\u1ED9", "Th\xF9ng", "Bao", "Khay", "L\u1ED1c", "G\xF3i", "Chai", "Kh\xE1c"];
var LEGACY_PRODUCT_UNIT_OPTIONS = ["Can", "B\u1ECDc", "H\u1ED9p", "T\xFAi"];
var PRODUCT_UNIT_ALIASES = {
  kilogram: "Kg",
  kilograms: "Kg",
  kilo: "Kg",
  kgs: "Kg"
};
var normalizedUnitTextCache = /* @__PURE__ */ new Map();
var normalizeText = (value = "") => {
  const raw = `${value || ""}`;
  if (normalizedUnitTextCache.has(raw)) return normalizedUnitTextCache.get(raw);
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
  if (raw.length <= 256) {
    if (normalizedUnitTextCache.size >= 512) normalizedUnitTextCache.delete(normalizedUnitTextCache.keys().next().value);
    normalizedUnitTextCache.set(raw, normalized);
  }
  return normalized;
};
var normalizeProductPricingUnit = (value = "") => {
  const raw = `${value || ""}`.trim();
  if (!raw) return "";
  const normalized = normalizeText(raw);
  const knownOptions = [...PRODUCT_PRICING_UNIT_OPTIONS, ...LEGACY_PRODUCT_UNIT_OPTIONS];
  const exact = knownOptions.find((option) => normalizeText(option) === normalized);
  if (exact) return exact;
  return PRODUCT_UNIT_ALIASES[normalized] || raw;
};

// src/utils/productMeasures.js
var measureQuantity = (record = {}, unit = "") => {
  const key = normalizeProductPricingUnit(unit).toLowerCase();
  const number2 = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const weight = record.totalKg ?? record.weightKg ?? record.kg ?? record.actualWeightKg ?? record.weight;
  const quantity = record.quantity ?? record.totalQuantity ?? record.qty ?? record.pieceCount ?? record.quantityCount;
  if (key === "kg" && weight != null) return number2(weight);
  if (quantity != null && normalizeProductPricingUnit(record.quantityUnit || record.unit || "Con").toLowerCase() === key) {
    return number2(quantity);
  }
  const measure = [...record.measures || [], ...record.extraMeasures || []].find((item) => normalizeProductPricingUnit(item.unit).toLowerCase() === key);
  return measure ? number2(measure.quantity) : 0;
};
var purchaseAmount = (record = {}, unit = "Kg") => measureQuantity(record, unit) * (Number(record.unitPrice) || 0);

// src/utils/customerLedgerIndex.js
var EMPTY_ROWS = Object.freeze([]);
function createCustomerRecordSelector() {
  const datasets = /* @__PURE__ */ new WeakMap();
  return (rows, customerId) => {
    if (!Array.isArray(rows)) throw new TypeError("Customer history requires an immutable record array");
    let index = datasets.get(rows);
    if (!index) {
      index = /* @__PURE__ */ new Map();
      for (const row of rows) {
        if (row == null) continue;
        const key = row.customerId;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(row);
      }
      datasets.set(rows, index);
    }
    return index.get(customerId) || EMPTY_ROWS;
  };
}

// src/services/employeeHomeScreenDto.js
var invalid = () => {
  throw new TypeError("Invalid employee Home display model.");
};
var number = (value) => typeof value === "number" && Number.isFinite(value) ? value : invalid();
var text2 = (value) => typeof value === "string" && value.length <= 4096 ? value : invalid();
var flag = (value) => typeof value === "boolean" ? value : invalid();
var shape = (value, keys) => {
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid();
};
var list = (value, max, check2) => {
  if (!Array.isArray(value) || value.length > max) invalid();
  value.forEach(check2);
};
function validateEmployeeHomeScreenDto(value) {
  shape(value, ["version", "monthKey", "positionLabel", "reviewStars", "salary", "sales", "assets", "attendance", "delivery"]);
  if (value.version !== 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.monthKey)) invalid();
  text2(value.positionLabel);
  if (value.reviewStars !== null && (number(value.reviewStars) < 0 || value.reviewStars > 5)) invalid();
  const salary = value.salary;
  shape(salary, ["netSalary", "workDays", "salesRevenue", "rows"]);
  ["netSalary", "workDays", "salesRevenue"].forEach((key) => number(salary[key]));
  list(salary.rows, 12, (row) => {
    shape(row, ["label", "amount", "tone"]);
    text2(row.label);
    number(row.amount);
    text2(row.tone);
  });
  const sales = value.sales;
  shape(sales, ["show", "orderCount", "customerCount"]);
  flag(sales.show);
  number(sales.orderCount);
  number(sales.customerCount);
  const assets = value.assets;
  shape(assets, ["show", "count", "monthCost", "latest", "rows"]);
  flag(assets.show);
  number(assets.count);
  number(assets.monthCost);
  if (assets.latest !== null) {
    shape(assets.latest, ["label", "amount"]);
    text2(assets.latest.label);
    number(assets.latest.amount);
  }
  list(assets.rows, 3, (row) => {
    shape(row, ["id", "label", "statusLabel", "monthCost"]);
    text2(row.id);
    text2(row.label);
    text2(row.statusLabel);
    number(row.monthCost);
  });
  const attendance = value.attendance;
  shape(attendance, ["status", "tone", "shiftLabel", "in", "out", "lateMinutes", "autoOvertimeMinutes"]);
  ["status", "tone", "shiftLabel"].forEach((key) => text2(attendance[key]));
  for (const key of ["in", "out"]) {
    const row = attendance[key];
    shape(row, ["value", "source", "tone"]);
    text2(row.value);
    text2(row.source);
    text2(row.tone);
  }
  number(attendance.lateMinutes);
  number(attendance.autoOvertimeMinutes);
  const delivery = value.delivery;
  shape(delivery, ["income", "expense", "reportCount", "rows"]);
  ["income", "expense", "reportCount"].forEach((key) => number(delivery[key]));
  list(delivery.rows, 8, (row) => {
    shape(row, ["date", "reportCount", "income", "expense"]);
    text2(row.date);
    number(row.reportCount);
    number(row.income);
    number(row.expense);
  });
  return value;
}
function buildEmployeeHomeScreenDto(model, { date, employee }, helpers) {
  const {
    parseLooseMoneyValue: parseLooseMoneyValue2,
    getAssetDisplayLabel: getAssetDisplayLabel2,
    getAssetStatusLabel: getAssetStatusLabel2,
    formatShiftRangeLabel: formatShiftRangeLabel2,
    formatAttendanceMomentForWorkDate: formatAttendanceMomentForWorkDate2,
    getAttendanceCompactSource: getAttendanceCompactSource2
  } = helpers;
  const assetRows = model.employeeAssignedAssets.slice(0, 3).map((asset) => ({
    id: `${asset.id || ""}`,
    label: getAssetDisplayLabel2(asset),
    statusLabel: getAssetStatusLabel2(asset.status),
    monthCost: [
      ...model.employeeAssetCostRows.filter((row) => `${row.assetId || ""}` === `${asset.id || ""}`),
      ...model.employeeAssetExpenseRows.filter((row) => `${row.assetId || row.deliveryExpenseAssetId || ""}` === `${asset.id || ""}`)
    ].reduce((sum, row) => model.isAssetRowInCurrentMonth(row) ? sum + parseLooseMoneyValue2(row.amount) : sum, 0)
  }));
  const record = model.todayRecord;
  const moment = (kind) => ({
    value: record?.[kind] ? formatAttendanceMomentForWorkDate2(record[kind], date, employee, kind) : "-",
    source: getAttendanceCompactSource2(record, kind),
    tone: record?.[kind] ? "good" : kind === "checkIn" ? "bad" : "warn"
  });
  return validateEmployeeHomeScreenDto({
    version: 1,
    monthKey: model.monthKey,
    positionLabel: model.positionLabel,
    reviewStars: model.reviewSummary ? model.reviewSummary.stars : null,
    salary: {
      netSalary: model.details.netSalary,
      workDays: model.details.workDays,
      salesRevenue: model.details.salesRevenue || 0,
      rows: model.payrollSummaryRows.map((row) => ({ label: row.label, amount: row.amount, tone: row.tone || (row.amount === 0 ? "slate" : row.group === "deduction" ? "bad" : "good") }))
    },
    sales: { show: model.shouldShowSalesHomeStats, orderCount: model.salesOrderCount, customerCount: model.salesCustomerCount },
    assets: {
      show: model.shouldShowAssetHomeTile,
      count: model.employeeAssignedAssets.length,
      monthCost: model.employeeAssetMonthCost,
      latest: model.latestEmployeeAssetCost ? { label: model.latestEmployeeAssetCostLabel || "Chi ph\xED t\xE0i s\u1EA3n", amount: parseLooseMoneyValue2(model.latestEmployeeAssetCost.amount) } : null,
      rows: assetRows
    },
    attendance: {
      status: model.attendanceStatus,
      tone: model.attendanceTone,
      shiftLabel: `${model.employeeShiftPolicy.shiftName} \u2022 ${formatShiftRangeLabel2(model.employeeShiftPolicy)}`,
      in: moment("checkIn"),
      out: moment("checkOut"),
      lateMinutes: model.todayAttendanceTiming.lateMinutes,
      autoOvertimeMinutes: model.todayAttendanceTiming.autoOvertimeMinutes
    },
    delivery: {
      income: model.employeeDeliveryMonthSummary.income,
      expense: model.employeeDeliveryMonthSummary.expense,
      reportCount: model.employeeDeliveryMonthSummary.reportCount,
      rows: model.employeeDeliveryMonthSummary.rows.slice(0, 8).map((row) => ({ date: row.date, reportCount: row.reportCount, income: row.income, expense: row.expense }))
    }
  });
}

// src/services/employeeHomeSnapshotInput.js
var names = ["employees", "customers", "orders", "payments", "expenses", "financials", "attendance", "performance", "employeeReviews", "deliveryReports", "holidays", "advances", "assets", "assetCostLogs"];
var invalid2 = () => {
  throw new TypeError("Incomplete private employee Home snapshot.");
};
function buildEmployeeHomeSnapshotInput(snapshot, scope, helpers) {
  if (!snapshot?.sources || !snapshot.counts || !scope?.employeeId || !scope.companyId || !scope.date || snapshot.company?.documentId !== scope.companyId || snapshot.employee?.documentId !== scope.employeeId || snapshot.employee.data?.companyId !== scope.companyId) invalid2();
  const normalized = /* @__PURE__ */ Object.create(null);
  for (const name of names) {
    const source = snapshot.sources[name];
    if (!Array.isArray(source) || snapshot.counts[name] !== source.length) invalid2();
    normalized[name] = source.map((row) => {
      if (!row || typeof row.documentId !== "string" || !row.documentId || !row.data || row.data.companyId !== scope.companyId) invalid2();
      const record = Object.fromEntries(Object.entries(row.data).map(([key, value]) => [key, value && typeof value.toDate === "function" ? value.toDate().toISOString() : value]));
      return employeeHomeSpreadResult({ ...employeeHomeSpreadSource(record), id: row.documentId });
    });
  }
  const projectSourceRecord = helpers.projectSourceRecord || ((_name, row) => row);
  if (typeof projectSourceRecord !== "function") invalid2();
  const active = (name) => normalized[name].filter((row) => !row.isArchived).map((row) => projectSourceRecord(name, row));
  const employees = active("employees"), employee = employees.find((row) => row.id === scope.employeeId);
  if (!employee) invalid2();
  const customers = active("customers"), orders = active("orders");
  const attendance = /* @__PURE__ */ Object.create(null), performanceRecords = /* @__PURE__ */ Object.create(null);
  for (const row of normalized.attendance) attendance[row.id] = employeeHomeSpreadResult({ ...employeeHomeSpreadSource(row), checkIn: row.checkIn ? new Date(row.checkIn) : null, checkOut: row.checkOut ? new Date(row.checkOut) : null });
  for (const row of normalized.performance) performanceRecords[row.id] = row;
  const performance2 = helpers.withSalesRevenueIndex(() => {
    const agg = employeeHomeSpreadResult({ ...employeeHomeSpreadSource(performanceRecords) });
    employees.forEach((emp) => {
      agg[emp.id] = employeeHomeSpreadResult({ ...employeeHomeSpreadSource(agg[emp.id] || { overtime: 0 }), revenue: helpers.calculateMonthRevenue(emp.id, orders, customers) });
    });
    return agg;
  });
  return {
    employee,
    employees,
    date: scope.date,
    attendance,
    performance: performance2,
    customers,
    orders,
    financials: normalized.financials,
    payments: active("payments").filter(helpers.isCashflowOfficial),
    expenses: active("expenses").filter(helpers.isCashflowOfficial),
    holidays: active("holidays"),
    employeeReviews: active("employeeReviews"),
    deliveryReports: active("deliveryReports"),
    advanceRequests: active("advances"),
    assets: active("assets"),
    assetCostLogs: active("assetCostLogs"),
    record: helpers.resolveAttendanceAnomalyForDate(employee, attendance, scope.date)?.record || null
  };
}

// <stdin>
var getLocalDateInputValue = (date = /* @__PURE__ */ new Date()) => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : /* @__PURE__ */ new Date();
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
var getTodayString = () => getLocalDateInputValue(/* @__PURE__ */ new Date());
var DEFAULT_SHIFT_POLICY = {
  shiftName: "Ca h\xE0nh ch\xEDnh",
  shiftStart: "08:00",
  shiftEnd: "17:00",
  graceMinutes: 5,
  missingAlertMinutes: 30
};
var DEFAULT_LATE_PENALTY_TIERS = [
  { id: "late_30", lateMinutes: 30, penaltyAmount: 5e4, action: "fine" },
  { id: "late_60", lateMinutes: 60, penaltyAmount: 15e4, action: "fine" },
  { id: "late_120", lateMinutes: 120, penaltyAmount: 0, action: "no_salary" }
];
var LEGACY_POSITION_MAP = {
  "K\u1EBF to\xE1n nh\xE2n s\u1EF1": "K\u1EBF to\xE1n & nh\xE2n s\u1EF1",
  "K\u1EBF to\xE1n": "K\u1EBF to\xE1n & nh\xE2n s\u1EF1",
  "Admin": "K\u1EBF to\xE1n & nh\xE2n s\u1EF1",
  "B\xE1n h\xE0ng": "Kinh doanh",
  "CTV kinh doanh": "C\u1ED9ng t\xE1c vi\xEAn kinh doanh",
  "C\u1ED9ng t\xE1c vi\xEAn": "C\u1ED9ng t\xE1c vi\xEAn kinh doanh"
};
var WAREHOUSE_EXPORT_POSITION = "Xu\u1EA5t kho";
var SALES_COLLABORATOR_POSITION = "C\u1ED9ng t\xE1c vi\xEAn kinh doanh";
var normalizeEmployeePosition = (position = "") => {
  const rawPosition = `${position || ""}`.trim();
  const normalizedLookup = normalizeLookupText(rawPosition);
  if (["chu doanh nghiep", "chu cua hang", "giam doc", "quan ly doanh nghiep", "owner", "business owner"].includes(normalizedLookup)) return "Ch\u1EE7 doanh nghi\u1EC7p";
  if (["ke toan nhan su", "ke toan va nhan su", "ke toan nhan vien", "ke toan", "nhan su", "hanh chinh nhan su", "hr", "admin"].includes(normalizedLookup)) return "K\u1EBF to\xE1n & nh\xE2n s\u1EF1";
  if (["can hang xuat kho", "xuat kho", "nhan vien kho", "kho"].includes(normalizedLookup)) return WAREHOUSE_EXPORT_POSITION;
  if (["cong tac vien kinh doanh", "ctv kinh doanh", "cong tac vien ban hang", "ctv ban hang"].includes(normalizedLookup)) return SALES_COLLABORATOR_POSITION;
  if (["ban hang", "sales", "nhan vien kinh doanh"].includes(normalizedLookup)) return "Kinh doanh";
  if (["tai xe", "lai xe", "giao hang", "shipper", "driver"].includes(normalizedLookup)) return "T\xE0i x\u1EBF";
  if (["san xuat", "nhan vien san xuat", "production"].includes(normalizedLookup)) return "S\u1EA3n xu\u1EA5t";
  return LEGACY_POSITION_MAP[rawPosition] || rawPosition;
};
var getEmployeePositionLabel = (position = "") => normalizeEmployeePosition(position) || "Nh\xE2n s\u1EF1";
var isSalesCollaboratorPosition = (position = "") => normalizeEmployeePosition(position) === SALES_COLLABORATOR_POSITION;
var isSalesPosition = (position = "") => ["Kinh doanh", SALES_COLLABORATOR_POSITION].includes(normalizeEmployeePosition(position));
var isDriverPosition = (position = "") => normalizeEmployeePosition(position) === "T\xE0i x\u1EBF";
var getDeliveryAssignmentIds = (source = {}) => Array.from(new Set([
  source.assignedDriverId,
  source.driverId,
  source.deliveryDriverId,
  source.driverEmployeeId,
  source.assignedEmployeeId,
  source.employeeId,
  source.managerId,
  source.responsibleEmployeeId,
  ...Array.isArray(source.assignedDriverIds) ? source.assignedDriverIds : [],
  ...Array.isArray(source.driverIds) ? source.driverIds : [],
  ...Array.isArray(source.assignedEmployeeIds) ? source.assignedEmployeeIds : []
].map((value) => `${value || ""}`.trim()).filter(Boolean)));
var parseEmployeeRoleSalaryAmount = (value) => {
  return parseLooseMoneyValue(value);
};
var normalizeEmployeePositionList = (positions = []) => Array.from(new Set(
  (Array.isArray(positions) ? positions : []).map(normalizeEmployeePosition).filter(Boolean)
));
var normalizeEmployeeRoleSalaryComponents = (components = [], { keepEmpty = false } = {}) => (Array.isArray(components) ? components : []).map((row, index) => {
  const position = normalizeEmployeePosition(row?.position || row?.department || row?.role || "");
  const amount = parseEmployeeRoleSalaryAmount(row?.amount ?? row?.salary ?? row?.monthlySalary ?? 0);
  return {
    id: `${row?.id || position || `role_${index}`}`,
    position,
    amount,
    note: `${row?.note || ""}`.trim()
  };
}).filter((row) => row.position && (keepEmpty || row.amount > 0 || row.note));
var getEmployeePositionValues = (employee = {}) => normalizeEmployeePositionList([
  employee?.position,
  employee?.primaryPosition,
  ...Array.isArray(employee?.secondaryPositions) ? employee.secondaryPositions : [],
  ...Array.isArray(employee?.additionalPositions) ? employee.additionalPositions : [],
  ...Array.isArray(employee?.departments) ? employee.departments : [],
  ...normalizeEmployeeRoleSalaryComponents(employee?.roleSalaryComponents, { keepEmpty: true }).map((row) => row.position)
]);
var employeeHasPosition = (employee = {}, predicateOrPosition) => {
  const positions = getEmployeePositionValues(employee);
  if (typeof predicateOrPosition === "function") return positions.some((position) => predicateOrPosition(position));
  const normalized = normalizeEmployeePosition(predicateOrPosition);
  return positions.includes(normalized);
};
var isEmployeeSalesPosition = (employee = {}) => employeeHasPosition(employee, isSalesPosition);
var isEmployeeDriverPosition = (employee = {}) => employeeHasPosition(employee, isDriverPosition);
var getSalesLeaderId = (employee = {}) => `${employee?.salesLeaderId || employee?.salesManagerId || employee?.parentSalesEmpId || employee?.managerEmpId || ""}`.trim();
var getSalesLeaderCommissionPercent = (employee = {}) => {
  const parsed = parseFloat(employee?.salesLeaderCommissionPercent ?? employee?.leaderCommissionPercent ?? employee?.managerCommissionPercent ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
var POSITION_SHIFT_DEFAULTS = {
  "Kinh doanh": { shiftName: "Ca kinh doanh", shiftStart: "08:00", shiftEnd: "17:00", graceMinutes: 10, missingAlertMinutes: 30 },
  [SALES_COLLABORATOR_POSITION]: { shiftName: "Ca c\u1ED9ng t\xE1c vi\xEAn", shiftStart: "08:00", shiftEnd: "17:00", graceMinutes: 10, missingAlertMinutes: 30 },
  "K\u1EBF to\xE1n & nh\xE2n s\u1EF1": { shiftName: "Ca h\xE0nh ch\xEDnh", shiftStart: "08:00", shiftEnd: "17:00", graceMinutes: 5, missingAlertMinutes: 20 },
  "T\xE0i x\u1EBF": { shiftName: "Ca giao h\xE0ng", shiftStart: "06:30", shiftEnd: "16:30", graceMinutes: 10, missingAlertMinutes: 20 },
  "S\u1EA3n xu\u1EA5t": { shiftName: "Ca s\u1EA3n xu\u1EA5t", shiftStart: "07:30", shiftEnd: "16:30", graceMinutes: 10, missingAlertMinutes: 20 },
  [WAREHOUSE_EXPORT_POSITION]: { shiftName: "Ca xu\u1EA5t kho", shiftStart: "06:30", shiftEnd: "16:30", graceMinutes: 10, missingAlertMinutes: 20 },
  "Ch\u1EE7 doanh nghi\u1EC7p": { shiftName: "\u0110i\u1EC1u h\xE0nh linh ho\u1EA1t", shiftStart: "08:00", shiftEnd: "17:00", graceMinutes: 0, missingAlertMinutes: 30 }
};
var toTitleCase = (str) => {
  if (!str) return "";
  return str.toLowerCase().split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};
var capitalizeFirst = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};
var normalizeLeadingLabel = (str = "") => capitalizeFirst(`${str}`.trim());
var normalizeExpenseCategoryLabel = (str = "") => normalizeLeadingLabel(str);
var resolveSalaryMonthDays = (employee = {}, monthKey = getTodayString().substring(0, 7)) => {
  const parsed = parseInt(employee?.salaryMonthDays, 10);
  return parsed > 0 ? parsed : getActualCalendarDaysInMonth(monthKey);
};
var viNumberFormatter = new Intl.NumberFormat("vi-VN");
var parseInputCurrency = (val) => {
  if (val === "" || val === void 0 || val === null) return "";
  const num = parseInt(val.toString().replace(/\D/g, ""), 10);
  return isNaN(num) ? "" : num;
};
var parseMinutesInput = (val, fallback = 0) => {
  if (val === "" || val === void 0 || val === null) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};
var normalizeLatePenaltyTiers = (tiers = DEFAULT_LATE_PENALTY_TIERS) => {
  const source = Array.isArray(tiers) && tiers.length > 0 ? tiers : DEFAULT_LATE_PENALTY_TIERS;
  return source.map((tier, index) => {
    const lateMinutes = Math.max(0, parseMinutesInput(tier?.lateMinutes ?? tier?.minutes, 0));
    const action = tier?.action === "no_salary" ? "no_salary" : "fine";
    const penaltyAmount = action === "no_salary" ? 0 : parseInputCurrency(tier?.penaltyAmount ?? tier?.amount ?? 0) || 0;
    return {
      id: tier?.id || `late_${lateMinutes || index}`,
      lateMinutes,
      penaltyAmount,
      action
    };
  }).filter((tier) => tier.lateMinutes > 0).sort((a, b) => a.lateMinutes - b.lateMinutes);
};
var getEmployeeLatePenaltyTiers = (employee = {}) => normalizeLatePenaltyTiers(
  Object.prototype.hasOwnProperty.call(employee || {}, "latePenaltyTiers") ? employee.latePenaltyTiers : DEFAULT_LATE_PENALTY_TIERS
);
var resolveLatePenaltyForMinutes = (lateMinutes = 0, tiers = DEFAULT_LATE_PENALTY_TIERS) => {
  const normalizedMinutes = Math.max(0, parseMinutesInput(lateMinutes, 0));
  if (normalizedMinutes <= 0) return { lateMinutes: normalizedMinutes, penaltyAmount: 0, noSalaryDay: false, matchedTier: null };
  const normalizedTiers = normalizeLatePenaltyTiers(tiers);
  let matchedTierIndex = -1;
  normalizedTiers.forEach((tier, index) => {
    if (normalizedMinutes >= tier.lateMinutes) matchedTierIndex = index;
  });
  const matchedTier = matchedTierIndex >= 0 ? normalizedTiers[matchedTierIndex] : null;
  if (!matchedTier) return { lateMinutes: normalizedMinutes, penaltyAmount: 0, noSalaryDay: false, matchedTier: null };
  const nextTier = normalizedTiers[matchedTierIndex + 1] || null;
  return {
    lateMinutes: normalizedMinutes,
    penaltyAmount: matchedTier.action === "fine" ? roundMoneyValue(matchedTier.penaltyAmount || 0) : 0,
    noSalaryDay: matchedTier.action === "no_salary",
    matchedTier: employeeHomeSpreadResult({
      ...employeeHomeSpreadSource(matchedTier),
      maxLateMinutes: nextTier ? nextTier.lateMinutes - 1 : null
    })
  };
};
var parseAttendanceTimestamp = (value = null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
var calculateAttendanceTiming = (employee = {}, entry = {}) => {
  const normalizedEntry = normalizeAttendanceRecordForWorkDate(entry, employee, entry?.date);
  const checkInDate = parseAttendanceTimestamp(normalizedEntry?.checkIn);
  const checkOutDate = parseAttendanceTimestamp(normalizedEntry?.checkOut);
  if (!checkInDate || !entry?.date) {
    return { lateMinutes: 0, earlyOvertimeMinutes: 0, afterShiftOvertimeMinutes: 0, autoOvertimeMinutes: 0, latePenaltyAmount: 0, noSalaryDay: false, matchedLateTier: null };
  }
  const shiftPolicy = resolveEmployeeShiftPolicy(employee);
  const { start: shiftStart, end: shiftEnd } = buildShiftRangeDateTimes(entry.date, shiftPolicy.shiftStart, shiftPolicy.shiftEnd);
  if (Number.isNaN(shiftStart.getTime()) || Number.isNaN(shiftEnd.getTime())) {
    return { lateMinutes: 0, earlyOvertimeMinutes: 0, afterShiftOvertimeMinutes: 0, autoOvertimeMinutes: 0, latePenaltyAmount: 0, noSalaryDay: false, matchedLateTier: null };
  }
  const diffMinutes = Math.round((checkInDate.getTime() - shiftStart.getTime()) / 6e4);
  const lateMinutes = Math.max(0, diffMinutes);
  const earlyOvertimeMinutes = employee?.autoEarlyOvertimeEnabled === false ? 0 : Math.max(0, -diffMinutes);
  const afterShiftOvertimeMinutes = employee?.autoLateCheckoutOvertimeEnabled === false || !checkOutDate ? 0 : Math.max(0, Math.round((checkOutDate.getTime() - shiftEnd.getTime()) / 6e4));
  const latePenalty = resolveLatePenaltyForMinutes(lateMinutes, getEmployeeLatePenaltyTiers(employee));
  return {
    lateMinutes,
    earlyOvertimeMinutes,
    afterShiftOvertimeMinutes,
    autoOvertimeMinutes: earlyOvertimeMinutes + afterShiftOvertimeMinutes,
    latePenaltyAmount: latePenalty.penaltyAmount || 0,
    noSalaryDay: latePenalty.noSalaryDay,
    matchedLateTier: latePenalty.matchedTier
  };
};
var formatCurrency = (amount) => {
  if (amount === void 0 || amount === null || isNaN(amount)) return "0";
  return viNumberFormatter.format(Math.round(Number(amount) || 0));
};
var roundMoneyValue = (amount) => {
  if (amount === void 0 || amount === null || Number.isNaN(Number(amount))) return 0;
  return Math.round(Number(amount) || 0);
};
var VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
var VIETNAM_DATE_FORMAT_OPTIONS = { timeZone: VIETNAM_TIME_ZONE };
var VIETNAM_TIME_FORMAT_OPTIONS = { hour: "2-digit", minute: "2-digit", timeZone: VIETNAM_TIME_ZONE };
var vietnamDateFormatter = new Intl.DateTimeFormat("vi-VN", VIETNAM_DATE_FORMAT_OPTIONS);
var vietnamTimeFormatter = new Intl.DateTimeFormat("vi-VN", VIETNAM_TIME_FORMAT_OPTIONS);
var buildMonthKeyFromDate = (value = "") => {
  const text3 = `${value || ""}`.trim();
  const dateOnlyMatch = text3.match(/^(\d{4})-(\d{2})/);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}`;
  const parsed = new Date(text3 || `${getTodayString()}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return getTodayString().slice(0, 7);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
};
var formatAttendanceMoment = (value) => {
  const parsed = parseAttendanceTimestamp(value);
  if (!parsed) return "--";
  return `${vietnamTimeFormatter.format(parsed)} \u2022 ${vietnamDateFormatter.format(parsed)}`;
};
var getAttendanceCompactSource = (record = {}, direction = "checkIn") => {
  if (!record?.[direction]) return "";
  const method = `${record?.[`${direction}Method`] || ""}`;
  const meta = record?.[`${direction}MethodMeta`] || {};
  const isProxy = Boolean(
    meta?.proxyAttendance || meta?.type === "proxy" || /chấm hộ|điều chỉnh/i.test(method)
  );
  if (isProxy) {
    const proxyName = [
      meta?.proxyByName,
      meta?.checkedByName,
      meta?.performedByName,
      meta?.actorName,
      meta?.byName,
      meta?.proxyName
    ].find((value) => `${value || ""}`.trim());
    return `Ch\u1EA5m h\u1ED9 - ${proxyName || "Ch\u01B0a x\xE1c \u0111\u1ECBnh ng\u01B0\u1EDDi ch\u1EA5m"}`;
  }
  return hasAttendanceGpsMeta(meta) ? `\u0110\u1ECBnh v\u1ECB: ${formatAttendanceGpsSummary(meta)}` : "";
};
var LOOKUP_NORMALIZATION_CACHE_LIMIT = 2048;
var LOOKUP_NORMALIZATION_MAX_LENGTH = 256;
var lookupNormalizationCache = /* @__PURE__ */ new Map();
var normalizeLookupText = (value = "") => {
  const cacheable = typeof value === "string" && value.length <= LOOKUP_NORMALIZATION_MAX_LENGTH;
  if (cacheable) {
    const cached = lookupNormalizationCache.get(value);
    if (cached !== void 0) return cached;
  }
  const normalized = `${value}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (cacheable) {
    if (lookupNormalizationCache.size >= LOOKUP_NORMALIZATION_CACHE_LIMIT) {
      lookupNormalizationCache.delete(lookupNormalizationCache.keys().next().value);
    }
    lookupNormalizationCache.set(value, normalized);
  }
  return normalized;
};
var normalizeCustomerPhone = (value = "") => `${value}`.replace(/\D/g, "");
var parseLooseQuantityValue = (value) => {
  if (value === void 0 || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const matched = `${value}`.replace(/\s+/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return matched ? Math.max(0, parseFloat(matched[0]) || 0) : 0;
};
var parseLooseMoneyValue = (value) => {
  if (value === void 0 || value === null || value === "") return 0;
  if (typeof value === "number") return Math.max(0, Math.round(value));
  const digits = `${value}`.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
};
var normalizeCustomerHonorific = (value = "") => {
  const normalized = normalizeLookupText(value || "").replace(/\s+/g, "");
  if (["a", "anh", "ong", "chu", "bacnam"].includes(normalized)) return "anh";
  if (["c", "chi", "co", "bacnu"].includes(normalized)) return "chi";
  return "";
};
var inferCustomerHonorificFromName = (name = "") => {
  const firstToken = normalizeLookupText(`${name || ""}`.trim().split(/\s+/)[0] || "").replace(/[.:,-]/g, "");
  return normalizeCustomerHonorific(firstToken);
};
var stripCustomerHonorificPrefix = (name = "") => {
  const text3 = `${name || ""}`.trim();
  if (!text3) return "";
  const parts = text3.split(/\s+/);
  const firstToken = normalizeLookupText(parts[0] || "").replace(/[.:,-]/g, "");
  return normalizeCustomerHonorific(firstToken) ? parts.slice(1).join(" ") : text3;
};
var getCustomerHonorific = (customer = {}) => normalizeCustomerHonorific(customer?.customerHonorific || customer?.honorific) || inferCustomerHonorificFromName(customer?.name || customer?.customerName || "");
var getCustomerPlainName = (customer = {}) => {
  const rawName = `${customer?.plainName || customer?.customerName || customer?.name || ""}`.trim();
  return toTitleCase(stripCustomerHonorificPrefix(rawName)).trim();
};
var getCustomerDisplayName = (customer = {}) => {
  const plainName = getCustomerPlainName(customer);
  const honorific = getCustomerHonorific(customer);
  if (!plainName) return "";
  if (honorific === "anh") return `Anh ${plainName}`;
  if (honorific === "chi") return `Ch\u1ECB ${plainName}`;
  return plainName;
};
var CASHFLOW_APPROVAL_STATUS = {
  pending: "pending_handover",
  approved: "approved",
  rejected: "rejected"
};
var UNCONFIRMED_PAYMENT_STATUSES = /* @__PURE__ */ new Set([
  "pending",
  "created",
  "initiated",
  "processing",
  "awaiting_payment",
  "awaiting_transfer",
  "unpaid",
  "failed",
  "cancelled",
  "canceled",
  "expired"
]);
var PAYMENT_INTENT_SOURCE_TYPES = /* @__PURE__ */ new Set([
  "customer_debt_payment_intent",
  "customer_payment_intent",
  "sepay_customer_debt_intent",
  "sepay_payment_intent",
  "bank_qr_payment_intent"
]);
var isUnconfirmedPaymentIntent = (item = {}) => {
  const sourceType = `${item.sourceType || item.type || ""}`.trim().toLowerCase();
  const statuses = [
    item.status,
    item.paymentStatus,
    item.settlementStatus,
    item.reconciliationStatus
  ].map((value) => `${value || ""}`.trim().toLowerCase()).filter(Boolean);
  return Boolean(
    item.isPaymentIntent === true || item.paymentIntent === true || item.isCustomerDebtPaymentIntent === true || PAYMENT_INTENT_SOURCE_TYPES.has(sourceType) || statuses.some((status) => UNCONFIRMED_PAYMENT_STATUSES.has(status))
  );
};
var requiresCashflowApproval = (item = {}) => Boolean(
  item.requiresApproval || item.approvalStatus === CASHFLOW_APPROVAL_STATUS.pending || item.approvalStatus === CASHFLOW_APPROVAL_STATUS.rejected || item.handoverStatus === "pending" || item.handoverStatus === "handed_over" || item.sourceType === "driver_delivery_expense" || item.sourceType === "employee_reported_expense" || item.sourceType === "employee_reported_income" || item.sourceType === "driver_cash" && item.createdByRole === "driver"
);
var isCashflowOfficial = (item = {}) => !isUnconfirmedPaymentIntent(item) && (!requiresCashflowApproval(item) || item.approvalStatus === CASHFLOW_APPROVAL_STATUS.approved);
var toDateInputString = (date) => {
  const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 6e4);
  return normalized.toISOString().split("T")[0];
};
var shiftDateString = (dateStr, days = 0) => {
  const date = parseDateInputValue(dateStr);
  date.setDate(date.getDate() + days);
  return toDateInputString(date);
};
var parseDateInputValue = (dateStr) => {
  const parsed = /* @__PURE__ */ new Date(`${dateStr || getTodayString()}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? /* @__PURE__ */ new Date(`${getTodayString()}T12:00:00`) : parsed;
};
var addMonthsClamped = (date, monthsToAdd = 0) => {
  const baseDate = new Date(date);
  const targetDay = baseDate.getDate();
  baseDate.setDate(1);
  baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
  const lastDayOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
  baseDate.setDate(Math.min(targetDay, lastDayOfMonth));
  return baseDate;
};
var resolveProbationEndDate = (startDate, probationDuration = 0, probationUnit = "days") => {
  const durationValue = parseInt(probationDuration, 10);
  if (!startDate || Number.isNaN(durationValue) || durationValue <= 0) return null;
  const probationStart = parseDateInputValue(startDate);
  let probationExclusiveEnd = new Date(probationStart);
  if (probationUnit === "days") {
    probationExclusiveEnd.setDate(probationExclusiveEnd.getDate() + durationValue);
  } else if (probationUnit === "weeks") {
    probationExclusiveEnd.setDate(probationExclusiveEnd.getDate() + durationValue * 7);
  } else if (probationUnit === "months") {
    probationExclusiveEnd = addMonthsClamped(probationStart, durationValue);
  }
  const probationEndDate = new Date(probationExclusiveEnd);
  probationEndDate.setDate(probationEndDate.getDate() - 1);
  probationEndDate.setHours(23, 59, 59, 999);
  return probationEndDate;
};
var normalizeTimeInputValue = (timeStr = "") => {
  const raw = `${timeStr || ""}`.trim();
  const match = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return "";
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
var timeStringToMinutes = (timeStr = "08:00") => {
  const safeTime = normalizeTimeInputValue(timeStr) || "08:00";
  const [hours, minutes] = safeTime.split(":").map(Number);
  return hours * 60 + minutes;
};
var isOvernightShiftRange = (shiftStart = "08:00", shiftEnd = "17:00") => timeStringToMinutes(shiftEnd) <= timeStringToMinutes(shiftStart);
var formatShiftRangeLabel = (shiftPolicy = {}) => {
  const shiftStart = normalizeTimeInputValue(shiftPolicy.shiftStart) || "08:00";
  const shiftEnd = normalizeTimeInputValue(shiftPolicy.shiftEnd) || "17:00";
  return `${shiftStart} - ${shiftEnd}${isOvernightShiftRange(shiftStart, shiftEnd) ? " (+1 ng\xE0y)" : ""}`;
};
var getPositionShiftDefaults = (position = "") => employeeHomeSpreadResult({
  ...employeeHomeSpreadSource(DEFAULT_SHIFT_POLICY),
  ...employeeHomeSpreadSource(POSITION_SHIFT_DEFAULTS[normalizeEmployeePosition(position)] || {})
});
var resolveEmployeeShiftPolicy = (employee = {}) => {
  const defaults = getPositionShiftDefaults(employee?.position);
  return {
    shiftName: employee?.shiftName || defaults.shiftName,
    shiftStart: normalizeTimeInputValue(employee?.shiftStart) || defaults.shiftStart,
    shiftEnd: normalizeTimeInputValue(employee?.shiftEnd) || defaults.shiftEnd,
    graceMinutes: parseMinutesInput(employee?.graceMinutes, defaults.graceMinutes),
    missingAlertMinutes: parseMinutesInput(employee?.missingAlertMinutes, defaults.missingAlertMinutes)
  };
};
var buildShiftDateTime = (dateStr, timeStr) => /* @__PURE__ */ new Date(`${dateStr}T${normalizeTimeInputValue(timeStr) || "00:00"}:00`);
var buildShiftRangeDateTimes = (dateStr, shiftStart = "08:00", shiftEnd = "17:00") => {
  const start = buildShiftDateTime(dateStr, shiftStart);
  const end = buildShiftDateTime(dateStr, shiftEnd);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && isOvernightShiftRange(shiftStart, shiftEnd)) {
    start.setDate(start.getDate() - 1);
  }
  return { start, end };
};
var getAttendanceLocalDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};
var getAttendanceDateKeyOffset = (dateStr, days = 0) => {
  const [year, month, day] = `${dateStr || ""}`.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return `${dateStr || ""}`;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return getAttendanceLocalDateKey(date);
};
var normalizeAttendanceTimestampForWorkDate = (value, workDate, employee = {}, field = "checkIn") => {
  const parsed = parseAttendanceTimestamp(value);
  if (!parsed || !workDate) return parsed;
  const shiftPolicy = resolveEmployeeShiftPolicy(employee);
  if (!isOvernightShiftRange(shiftPolicy.shiftStart, shiftPolicy.shiftEnd)) return parsed;
  const timeMinutes = parsed.getHours() * 60 + parsed.getMinutes();
  const shiftStartMinutes = timeStringToMinutes(shiftPolicy.shiftStart);
  const shiftEndMinutes = timeStringToMinutes(shiftPolicy.shiftEnd);
  const actualDateKey = getAttendanceLocalDateKey(parsed);
  const previousDateKey = getAttendanceDateKeyOffset(workDate, -1);
  const nextDateKey = getAttendanceDateKeyOffset(workDate, 1);
  if (field === "checkIn" && actualDateKey === workDate && timeMinutes >= shiftStartMinutes) {
    const normalized = new Date(parsed.getTime());
    normalized.setDate(normalized.getDate() - 1);
    return normalized;
  }
  if (field === "checkOut" && actualDateKey === nextDateKey && timeMinutes <= shiftEndMinutes) {
    const normalized = new Date(parsed.getTime());
    normalized.setDate(normalized.getDate() - 1);
    return normalized;
  }
  if (field === "checkIn" && actualDateKey === previousDateKey && timeMinutes >= shiftStartMinutes) return parsed;
  return parsed;
};
var normalizeAttendanceRecordForWorkDate = (record, employee = {}, workDate = "") => {
  if (!record || !workDate) return record;
  return employeeHomeSpreadResult({
    ...employeeHomeSpreadSource(record),
    checkIn: record.checkIn ? normalizeAttendanceTimestampForWorkDate(record.checkIn, workDate, employee, "checkIn") : record.checkIn,
    checkOut: record.checkOut ? normalizeAttendanceTimestampForWorkDate(record.checkOut, workDate, employee, "checkOut") : record.checkOut
  });
};
var formatAttendanceMomentForWorkDate = (value, workDate, employee = {}, field = "checkIn") => formatAttendanceMoment(normalizeAttendanceTimestampForWorkDate(value, workDate, employee, field));
var ATTENDANCE_ANOMALY_VISIBLE_AFTER_SHIFT_MS = 12 * 60 * 60 * 1e3;
var getAttendanceAnomaly = (employee, record, dateStr, now = /* @__PURE__ */ new Date()) => {
  if (!employee || !dateStr) return null;
  if (isSalesCollaboratorPosition(employee.position)) return null;
  if (record?.status === "leave") return null;
  const shiftPolicy = resolveEmployeeShiftPolicy(employee);
  const { start: shiftStart, end: shiftEnd } = buildShiftRangeDateTimes(dateStr, shiftPolicy.shiftStart, shiftPolicy.shiftEnd);
  if (Number.isNaN(shiftStart.getTime()) || Number.isNaN(shiftEnd.getTime())) return null;
  const nowTime = now.getTime();
  const visibleUntil = shiftEnd.getTime() + ATTENDANCE_ANOMALY_VISIBLE_AFTER_SHIFT_MS;
  if (nowTime < shiftStart.getTime() || nowTime > visibleUntil) return null;
  const alertDelay = shiftPolicy.missingAlertMinutes || 0;
  if (!record?.checkIn) {
    if (nowTime > shiftEnd.getTime()) return null;
    if (nowTime >= shiftStart.getTime() + (shiftPolicy.graceMinutes + alertDelay) * 6e4) {
      return {
        type: "missing_check_in",
        title: "Ch\u01B0a ch\u1EA5m v\xE0o ca",
        message: `${employee.name} ch\u01B0a ch\u1EA5m v\xE0o ca ${shiftPolicy.shiftName} (${shiftPolicy.shiftStart}) d\xF9 \u0111\xE3 qu\xE1 gi\u1EDD quy \u0111\u1ECBnh.`,
        severity: "warning"
      };
    }
    return null;
  }
  if (!record?.checkOut && nowTime >= shiftEnd.getTime() + alertDelay * 6e4) {
    return {
      type: "missing_check_out",
      title: "Ch\u01B0a ch\u1EA5m ra ca",
      message: `${employee.name} ch\u01B0a ch\u1EA5m ra ca ${shiftPolicy.shiftName} (${shiftPolicy.shiftEnd}). App ch\u1EC9 t\u1EF1 t\xEDnh t\u0103ng ca khi c\xF3 gi\u1EDD ch\u1EA5m ra r\xF5 r\xE0ng sau ca.`,
      severity: "warning"
    };
  }
  return null;
};
var resolveAttendanceAnomalyForDate = (employee = {}, attendance = {}, dateStr = getTodayString(), now = /* @__PURE__ */ new Date()) => {
  if (!employee?.id || !dateStr) return null;
  const currentRecord = attendance?.[`${dateStr}_${employee.id}`];
  const currentAnomaly = getAttendanceAnomaly(employee, currentRecord, dateStr, now);
  if (currentAnomaly) return employeeHomeSpreadResult({ ...employeeHomeSpreadSource(currentAnomaly), record: currentRecord, date: dateStr });
  const shiftPolicy = resolveEmployeeShiftPolicy(employee);
  if (!isOvernightShiftRange(shiftPolicy.shiftStart, shiftPolicy.shiftEnd)) return null;
  const nextDate = shiftDateString(dateStr, 1);
  const nextRecord = attendance?.[`${nextDate}_${employee.id}`];
  const nextAnomaly = getAttendanceAnomaly(employee, nextRecord, nextDate, now);
  return nextAnomaly ? employeeHomeSpreadResult({ ...employeeHomeSpreadSource(nextAnomaly), record: nextRecord, date: nextDate }) : null;
};
var hasAttendanceGpsMeta = (meta = {}) => meta?.type === "gps" && Number.isFinite(Number(meta.latitude)) && Number.isFinite(Number(meta.longitude));
var formatAttendanceGpsSummary = (meta = {}) => {
  if (!hasAttendanceGpsMeta(meta)) return "";
  const accuracy = Math.round(Number(meta.accuracy || 0));
  return `${Number(meta.latitude).toFixed(6)}, ${Number(meta.longitude).toFixed(6)}${accuracy ? ` \u2022 sai s\u1ED1 ${accuracy}m` : ""}`;
};
var calculateCommission = (revenue, target, rate) => {
  const actualRevenue = revenue || 0;
  const targetRevenue = target || 0;
  const commissionRate = rate || 0;
  const exceededRevenue = Math.max(0, actualRevenue - targetRevenue);
  return exceededRevenue * commissionRate;
};
var calculateDirectSalesCommission = (employee = {}, revenue = 0) => {
  const commissionRate = parseFloat(employee?.commissionRate) || 0;
  if (!commissionRate) return 0;
  return roundMoneyValue(calculateCommission(revenue || 0, employee?.targetRevenue || 0, commissionRate));
};
var buildSalesDownlineCommissionRows = (leaderEmpId, employees = [], orders = [], customers = [], monthKey = getTodayString().substring(0, 7)) => {
  const leaderKey = `${leaderEmpId || ""}`.trim();
  if (!leaderKey) return [];
  return (employees || []).filter((employee) => !employee?.isArchived && employee.id !== leaderKey && isEmployeeSalesPosition(employee) && getSalesLeaderId(employee) === leaderKey).map((employee) => {
    const revenue = calculateRevenueForMonth(employee.id, orders, customers, monthKey);
    const commissionPercent = getSalesLeaderCommissionPercent(employee);
    const commission = roundMoneyValue(revenue * (commissionPercent / 100));
    return {
      employeeId: employee.id,
      employeeName: employee.name || "Nh\xE2n s\u1EF1 kinh doanh",
      revenue: roundMoneyValue(revenue),
      commissionPercent,
      commission
    };
  }).filter((row) => row.revenue > 0 || row.commissionPercent > 0);
};
var getExperienceCycleMeta = (period = "months") => {
  if (period === "quarters") return { monthsPerCycle: 3, label: "qu\xFD" };
  if (period === "years") return { monthsPerCycle: 12, label: "n\u0103m" };
  return { monthsPerCycle: 1, label: "th\xE1ng" };
};
var getMonthEndDateInputValue = (monthKey = getTodayString().substring(0, 7)) => {
  const safeMonthKey = /^\d{4}-\d{2}$/.test(`${monthKey}`) ? `${monthKey}` : getTodayString().substring(0, 7);
  const [year, month] = safeMonthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${safeMonthKey}-${String(lastDay).padStart(2, "0")}`;
};
var getActualCalendarDaysInMonth = (monthKey = getTodayString().substring(0, 7)) => {
  const safeMonthKey = /^\d{4}-\d{2}$/.test(`${monthKey}`) ? `${monthKey}` : getTodayString().substring(0, 7);
  const [year, month] = safeMonthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
};
var calculateExperienceSalaryAtDate = (startDate, amount, period = "months", referenceDate = getTodayString()) => {
  const cycleMeta = getExperienceCycleMeta(period);
  if (!startDate) {
    return { total: 0, expMonths: 0, experienceCycles: 0, experienceCycleLabel: cycleMeta.label };
  }
  const start = parseDateInputValue(startDate);
  const now = parseDateInputValue(referenceDate);
  let expMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) expMonths -= 1;
  if (expMonths < 0) expMonths = 0;
  const experienceCycles = amount > 0 ? Math.floor(expMonths / cycleMeta.monthsPerCycle) : 0;
  return {
    total: experienceCycles * (amount || 0),
    expMonths,
    experienceCycles,
    experienceCycleLabel: cycleMeta.label
  };
};
var compareLedgerItems = (a, b, sortKeys = null) => {
  const keyFor = (item) => {
    if (sortKeys?.has(item)) return sortKeys.get(item);
    const dateKey2 = getPaymentDateKey(item) || getDateKeyFromAnyValue(item?.paymentDate || item?.transactionDate || item?.transactionDateTime || item?.paidAt || item?.transactionAt || item?.date || item?.createdAt || getEntityTimestamp(item));
    const key = { day: (/* @__PURE__ */ new Date(`${dateKey2 || "1970-01-01"}T00:00:00`)).getTime(), timestamp: void 0 };
    sortKeys?.set(item, key);
    return key;
  };
  const aKey = keyFor(a), bKey = keyFor(b);
  const dateCompare = aKey.day - bKey.day;
  if (dateCompare !== 0) return dateCompare;
  if (aKey.timestamp === void 0) aKey.timestamp = getPaymentTimestamp(a) || getEntityTimestamp(a) || 0;
  if (bKey.timestamp === void 0) bKey.timestamp = getPaymentTimestamp(b) || getEntityTimestamp(b) || 0;
  const timestampCompare = aKey.timestamp - bKey.timestamp;
  if (timestampCompare !== 0) return timestampCompare;
  return (a.id || "").localeCompare(b.id || "");
};
var parseVietnameseDateTimeString = (value = "") => {
  const raw = `${value || ""}`.trim();
  if (!raw) return null;
  const match = raw.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  const parsed = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed.getTime();
};
var ENTITY_TIMESTAMP_CACHE_LIMIT = 2048;
var ENTITY_TIMESTAMP_CACHE_MAX_LENGTH = 64;
var entityTimestampStringCache = /* @__PURE__ */ new Map();
var parseEntityTimestampValue = (rawValue) => {
  if (!rawValue) return null;
  if (typeof rawValue === "number") {
    if (!Number.isFinite(rawValue) || rawValue <= 0) return null;
    return rawValue < 1e10 ? rawValue * 1e3 : rawValue;
  }
  if (typeof rawValue?.toDate === "function") {
    const parsedDate = rawValue.toDate();
    if (parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())) return parsedDate.getTime();
  }
  if (typeof rawValue === "object") {
    const seconds = rawValue.seconds ?? rawValue._seconds;
    const nanos = rawValue.nanoseconds ?? rawValue._nanoseconds ?? 0;
    if (seconds !== void 0 && seconds !== null) {
      const parsedSeconds = Number(seconds);
      const parsedNanos = Number(nanos);
      if (Number.isFinite(parsedSeconds)) {
        return parsedSeconds * 1e3 + Math.floor((Number.isFinite(parsedNanos) ? parsedNanos : 0) / 1e6);
      }
    }
    const nestedValue = rawValue.timestampValue ?? rawValue.stringValue ?? rawValue.integerValue ?? rawValue.doubleValue ?? rawValue.value;
    if (nestedValue !== void 0 && nestedValue !== rawValue) {
      return parseEntityTimestampValue(nestedValue);
    }
  }
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim();
    if (!normalized) return null;
    const cacheable = rawValue.length <= ENTITY_TIMESTAMP_CACHE_MAX_LENGTH && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
    if (cacheable) {
      const cached = entityTimestampStringCache.get(normalized);
      if (cached !== void 0) return cached;
    }
    if (/^\d{10,13}$/.test(normalized)) {
      const parsedNumeric = Number(normalized);
      if (Number.isFinite(parsedNumeric)) return normalized.length === 10 ? parsedNumeric * 1e3 : parsedNumeric;
    }
    const vietnameseTimestamp = parseVietnameseDateTimeString(normalized);
    if (vietnameseTimestamp) return vietnameseTimestamp;
    const parsed = new Date(normalized).getTime();
    if (!Number.isNaN(parsed)) {
      if (cacheable && Number.isFinite(parsed)) {
        if (entityTimestampStringCache.size >= ENTITY_TIMESTAMP_CACHE_LIMIT) {
          entityTimestampStringCache.delete(entityTimestampStringCache.keys().next().value);
        }
        entityTimestampStringCache.set(normalized, parsed);
      }
      return parsed;
    }
  }
  return null;
};
var getEntityTimestamp = (entity = {}) => {
  if (!entity || typeof entity !== "object") return parseEntityTimestampValue(entity);
  const timestamp = parseEntityTimestampValue(entity.createdAt) || parseEntityTimestampValue(entity.updatedAt) || parseEntityTimestampValue(entity.timestamp) || parseEntityTimestampValue(entity.receivedAt) || parseEntityTimestampValue(entity.sentAt) || parseEntityTimestampValue(entity.approvedAt) || parseEntityTimestampValue(entity.paidAt) || parseEntityTimestampValue(entity.lastMessageAt) || parseEntityTimestampValue(entity.lastActivityAt);
  if (timestamp) return timestamp;
  if (typeof entity.date === "string" && entity.date.includes("T")) {
    const parsed = new Date(entity.date).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  const idMatch = `${entity.id || ""}`.match(/_(\d{10,13})$/);
  if (idMatch) {
    const rawTimestamp = parseInt(idMatch[1], 10);
    if (!Number.isNaN(rawTimestamp)) {
      return idMatch[1].length === 10 ? rawTimestamp * 1e3 : rawTimestamp;
    }
  }
  const embeddedIdTimestampMatch = `${entity.id || ""}`.match(/(?:^|_)(\d{13})(?:_|$)/);
  if (embeddedIdTimestampMatch) {
    const rawTimestamp = parseInt(embeddedIdTimestampMatch[1], 10);
    if (!Number.isNaN(rawTimestamp)) return rawTimestamp;
  }
  return null;
};
var normalizeCustomerOpeningDebtAmount = (value) => Math.max(0, roundMoneyValue(parseLooseMoneyValue(value)));
var normalizeCustomerOpeningPayableAmount = (value) => Math.max(0, roundMoneyValue(parseLooseMoneyValue(value)));
var getCustomerOpeningDebtAmount = (customer = {}) => normalizeCustomerOpeningDebtAmount(
  customer?.openingDebtAmount ?? customer?.oldDebtAmount ?? customer?.legacyDebtAmount ?? 0
);
var getCustomerOpeningDebtDate = (customer = {}) => {
  const rawDate = customer?.openingDebtDate || customer?.oldDebtDate || customer?.legacyDebtDate || customer?.createdAt || "";
  if (typeof rawDate === "string" && rawDate.trim()) return rawDate.trim().slice(0, 10);
  return getTodayString();
};
var getCustomerOpeningPayableAmount = (customer = {}) => normalizeCustomerOpeningPayableAmount(
  customer?.openingPayableAmount ?? customer?.oldPayableAmount ?? customer?.legacyPayableAmount ?? customer?.companyOpeningDebtAmount ?? customer?.companyOldDebtAmount ?? 0
);
var getCustomerOpeningPayableDate = (customer = {}) => {
  const rawDate = customer?.openingPayableDate || customer?.oldPayableDate || customer?.legacyPayableDate || customer?.companyOpeningDebtDate || customer?.createdAt || "";
  if (typeof rawDate === "string" && rawDate.trim()) return rawDate.trim().slice(0, 10);
  return getTodayString();
};
var buildCustomerOpeningDebtOrder = (customer = null) => {
  if (!customer?.id) return null;
  const amount = getCustomerOpeningDebtAmount(customer);
  if (amount <= 0) return null;
  const date = getCustomerOpeningDebtDate(customer);
  return {
    id: `opening_debt_${customer.id}`,
    code: "N\u1EE3 c\u0169",
    orderCode: "N\u1EE3 c\u0169",
    customerId: customer.id,
    customerName: getCustomerDisplayName(customer) || customer.name || "",
    date,
    createdAt: customer.openingDebtCreatedAt || date,
    amount,
    totalAmount: amount,
    paidAmount: 0,
    appliedAmount: 0,
    creditApplied: 0,
    outstandingAmount: amount,
    allocations: [],
    items: [{ description: "N\u1EE3 c\u0169", productName: "N\u1EE3 c\u0169", quantity: 1, unitPrice: amount, total: amount }],
    note: customer.openingDebtNote || "N\u1EE3 c\u0169 tr\u01B0\u1EDBc khi s\u1EED d\u1EE5ng h\u1EC7 th\u1ED1ng",
    isOpeningDebt: true,
    sourceType: "opening_debt"
  };
};
var selectCustomerHistoryRows = createCustomerRecordSelector();
var buildCustomerLedger = (customerOrId, allOrders = [], allPayments = [], { cooperative = false, historyAlreadySelected = false } = {}) => {
  function* calculate() {
    const sortKeys = /* @__PURE__ */ new Map();
    const compareCustomerLedgerItems = (a, b) => compareLedgerItems(a, b, sortKeys);
    const customerRecord = typeof customerOrId === "object" && customerOrId !== null ? customerOrId : null;
    const customerId = customerRecord?.id || customerOrId || "";
    const openingDebtOrder = buildCustomerOpeningDebtOrder(customerRecord);
    let orders = [];
    if (openingDebtOrder) orders.push(openingDebtOrder);
    const customerOrders = historyAlreadySelected ? allOrders : selectCustomerHistoryRows(allOrders, customerId);
    for (const order of customerOrders) {
      yield;
      if (order.customerId !== customerId || order.isArchived) continue;
      orders.push(employeeHomeSpreadResult({
        ...employeeHomeSpreadSource(order),
        appliedAmount: 0,
        creditApplied: 0,
        outstandingAmount: Math.max(0, order.amount || 0),
        allocations: []
      }));
    }
    orders = cooperative ? yield* sortProjection(orders, compareCustomerLedgerItems) : orders.sort(compareCustomerLedgerItems);
    let payments = [];
    const customerPayments = historyAlreadySelected ? allPayments : selectCustomerHistoryRows(allPayments, customerId);
    for (const payment of customerPayments) {
      yield;
      if (payment.customerId !== customerId || payment.isArchived || !isCashflowOfficial(payment)) continue;
      payments.push(employeeHomeSpreadResult({ ...employeeHomeSpreadSource(payment), appliedAmount: 0, overpaidAmount: 0, allocations: [] }));
    }
    payments = cooperative ? yield* sortProjection(payments, compareCustomerLedgerItems) : payments.sort(compareCustomerLedgerItems);
    let timeline = [];
    for (const order of orders) {
      yield;
      timeline.push({ type: "order", date: order.date, id: "order_" + order.id, ref: order });
    }
    for (const payment of payments) {
      yield;
      timeline.push({ type: "payment", date: getPaymentDateKey(payment) || payment.date, id: "payment_" + payment.id, ref: payment });
    }
    const compareTimeline = (a, b) => {
      const baseCompare = compareCustomerLedgerItems(a, b);
      if (baseCompare !== 0) return baseCompare;
      if (a.type === b.type) return 0;
      return a.type === "order" ? -1 : 1;
    };
    timeline = cooperative ? yield* sortProjection(timeline, compareTimeline) : timeline.sort(compareTimeline);
    const openOrders = [];
    let customerCredit = 0;
    for (const item of timeline) {
      yield;
      if (item.type === "order") {
        const order = item.ref;
        if (customerCredit > 0) {
          const covered = Math.min(customerCredit, order.outstandingAmount);
          order.appliedAmount += covered;
          order.creditApplied += covered;
          order.outstandingAmount -= covered;
          customerCredit -= covered;
        }
        if (order.outstandingAmount > 0) {
          openOrders.push(order);
        }
        continue;
      }
      const payment = item.ref;
      let remaining = Math.max(0, payment.amount || 0);
      const shouldPrioritizeMatchedOrder = payment.matchedOrderId && !payment.allocateOldestFirst && payment.allocationMode !== "oldest_first";
      let prioritizedOrder = null;
      if (shouldPrioritizeMatchedOrder) for (const order of orders) {
        yield;
        if (order.id === payment.matchedOrderId) {
          prioritizedOrder = order;
          break;
        }
      }
      if (prioritizedOrder && prioritizedOrder.outstandingAmount > 0 && remaining > 0) {
        const prioritizedAmount = Math.min(prioritizedOrder.outstandingAmount, remaining);
        prioritizedOrder.outstandingAmount -= prioritizedAmount;
        prioritizedOrder.appliedAmount += prioritizedAmount;
        prioritizedOrder.allocations.push({ paymentId: payment.id, amount: prioritizedAmount, date: getPaymentDateKey(payment) || payment.date, matchType: "order_code" });
        payment.appliedAmount += prioritizedAmount;
        payment.allocations.push({ orderId: prioritizedOrder.id, amount: prioritizedAmount, date: prioritizedOrder.date, matchType: "order_code" });
        remaining -= prioritizedAmount;
      }
      for (const order of openOrders) {
        yield;
        if (remaining <= 0) break;
        if (prioritizedOrder && order.id === prioritizedOrder.id) continue;
        if (order.outstandingAmount <= 0) continue;
        const applied = Math.min(order.outstandingAmount, remaining);
        order.outstandingAmount -= applied;
        order.appliedAmount += applied;
        order.allocations.push({ paymentId: payment.id, amount: applied, date: getPaymentDateKey(payment) || payment.date });
        payment.appliedAmount += applied;
        payment.allocations.push({ orderId: order.id, amount: applied, date: order.date });
        remaining -= applied;
      }
      if (remaining > 0) {
        payment.overpaidAmount = remaining;
        customerCredit += remaining;
      }
    }
    const orderDetails = [];
    for (const order of orders) {
      yield;
      orderDetails.push(employeeHomeSpreadResult({
        ...employeeHomeSpreadSource(order),
        outstandingAmount: Math.max(0, order.outstandingAmount),
        status: order.outstandingAmount <= 0 ? "paid" : order.appliedAmount > 0 ? "partial" : "unpaid"
      }));
    }
    let totalRevenue = 0, totalPaid = 0, currentDebt = 0;
    for (const order of orderDetails) {
      yield;
      totalRevenue += order.isOpeningDebt ? 0 : order.amount || 0;
    }
    for (const payment of payments) {
      yield;
      totalPaid += payment.amount || 0;
    }
    for (const order of orderDetails) {
      yield;
      currentDebt += order.outstandingAmount || 0;
    }
    return {
      orders: orderDetails,
      payments,
      totalRevenue,
      totalPaid,
      currentDebt,
      creditBalance: Math.max(0, customerCredit)
    };
  }
  const iterator = calculate();
  if (cooperative) return iterator;
  for (; ; ) {
    const next = iterator.next();
    if (next.done) return next.value;
  }
};
var buildCustomerSupplierPurchaseLedger = (customerOrId, warehouseImports = []) => {
  const customerRecord = typeof customerOrId === "object" && customerOrId !== null ? customerOrId : null;
  const customerId = `${customerRecord?.id || (typeof customerOrId === "string" ? customerOrId : "") || ""}`.trim();
  const customerPhone = normalizeCustomerPhone(customerRecord?.phone || customerRecord?.phoneNumber || "");
  const customerNameKey = normalizeLookupText(getCustomerDisplayName(customerRecord) || customerRecord?.name || "");
  const openingPayableAmount = getCustomerOpeningPayableAmount(customerRecord || {});
  const openingPayableDate = getCustomerOpeningPayableDate(customerRecord || {});
  const openingPayableNote = `${customerRecord?.openingPayableNote || customerRecord?.oldPayableNote || customerRecord?.companyOpeningDebtNote || ""}`.trim();
  const imports = (Array.isArray(warehouseImports) ? warehouseImports : []).filter((item) => item && !item.isArchived).filter((item) => {
    const supplierCustomerId = `${item.supplierCustomerId || item.linkedCustomerId || item.customerId || ""}`.trim();
    if (customerId && supplierCustomerId && supplierCustomerId === customerId) return true;
    const supplierPhone = normalizeCustomerPhone(item.supplierPhone || item.phone || item.customerPhone || "");
    if (customerPhone && supplierPhone && supplierPhone === customerPhone) return true;
    const supplierNameKey = normalizeLookupText(item.supplier || item.supplierName || item.customerName || item.customerNameSnapshot || "");
    return Boolean(customerNameKey && supplierNameKey && supplierNameKey === customerNameKey);
  }).map((item) => {
    const totalKg = parseLooseQuantityValue(item.totalKg ?? item.weightKg ?? item.kg);
    const unitPrice = parseLooseMoneyValue(item.unitPrice ?? item.price);
    const rawAmount = parseLooseMoneyValue(item.amount ?? item.totalAmount ?? item.value ?? item.total);
    const amount = roundMoneyValue(item.amount != null || item.totalAmount != null || item.value != null || item.total != null ? rawAmount : purchaseAmount(employeeHomeSpreadResult({ ...employeeHomeSpreadSource(item), totalKg, quantity: parseLooseQuantityValue(item.quantity), unitPrice }), item.purchaseUnit || "Kg"));
    return employeeHomeSpreadResult({ ...employeeHomeSpreadSource(item), amount });
  }).filter((item) => item.amount > 0).sort(compareLedgerItems);
  const purchaseImportAmount = roundMoneyValue(imports.reduce((sum, item) => sum + parseLooseMoneyValue(item.amount), 0));
  const totalPurchaseDebt = roundMoneyValue(openingPayableAmount + purchaseImportAmount);
  return {
    imports,
    purchaseImportAmount,
    openingPayableAmount,
    openingPayableDate,
    openingPayableNote,
    hasOpeningPayable: openingPayableAmount > 0,
    totalPurchaseDebt
  };
};
var applyCustomerSupplierReconciliation = (ledger = {}, purchaseLedger = {}, repayments = []) => {
  const salesDebtBeforeReconcile = Math.max(0, roundMoneyValue(parseLooseMoneyValue(ledger.currentDebt)));
  const customerCreditBeforeReconcile = Math.max(0, roundMoneyValue(parseLooseMoneyValue(ledger.creditBalance)));
  const purchaseDebt = Math.max(0, roundMoneyValue(parseLooseMoneyValue(purchaseLedger.totalPurchaseDebt)));
  const totalRepaid = roundMoneyValue(repayments.reduce((sum, item) => sum + Math.max(0, parseLooseMoneyValue(item.amount)), 0));
  const companyOwesBeforeReconcile = roundMoneyValue(customerCreditBeforeReconcile + purchaseDebt - totalRepaid);
  const reconciliationOffset = Math.max(0, roundMoneyValue(Math.min(salesDebtBeforeReconcile, companyOwesBeforeReconcile)));
  const currentDebt = Math.max(0, roundMoneyValue(salesDebtBeforeReconcile - companyOwesBeforeReconcile));
  const creditBalance = Math.max(0, roundMoneyValue(companyOwesBeforeReconcile - salesDebtBeforeReconcile));
  return employeeHomeSpreadResult({
    ...employeeHomeSpreadSource(ledger),
    repayments,
    totalRepaid,
    currentDebt,
    creditBalance,
    hasPurchaseReconciliation: (purchaseLedger.imports || []).length > 0 || purchaseDebt > 0,
    salesDebtBeforeReconcile,
    customerCreditBeforeReconcile,
    openingPayableAmount: purchaseLedger.openingPayableAmount || 0,
    openingPayableDate: purchaseLedger.openingPayableDate || "",
    openingPayableNote: purchaseLedger.openingPayableNote || "",
    purchaseImportAmount: purchaseLedger.purchaseImportAmount || 0,
    purchaseDebt,
    purchaseImports: purchaseLedger.imports || [],
    companyOwesBeforeReconcile,
    reconciliationOffset,
    reconciliationNetAmount: currentDebt || creditBalance,
    reconciliationStatus: currentDebt > 0 ? "customer_owes_company" : creditBalance > 0 ? "company_owes_customer" : "balanced"
  });
};
var getCustomerDebtRepayments = (customerOrId, expenses = []) => {
  const customerId = typeof customerOrId === "string" ? customerOrId : customerOrId?.id;
  return expenses.filter((item) => item && !item.isArchived && item.sourceType === "customer_debt_repayment" && item.customerId === customerId && isCashflowOfficial(item) && (!customerOrId?.companyId || item.companyId === customerOrId.companyId));
};
var buildCustomerReconciledLedger = (customerOrId, allOrders = [], allPayments = [], warehouseImports = [], expenses = []) => {
  const ledger = buildCustomerLedger(customerOrId, allOrders, allPayments);
  const purchaseLedger = buildCustomerSupplierPurchaseLedger(customerOrId, warehouseImports);
  return applyCustomerSupplierReconciliation(ledger, purchaseLedger, getCustomerDebtRepayments(customerOrId, expenses));
};
var getCustomerDebt = (customerOrId, allOrders, allPayments, warehouseImports = []) => buildCustomerReconciledLedger(customerOrId, allOrders, allPayments, warehouseImports).currentDebt;
var getDateKeyFromAnyValue = (value = "") => {
  if (!value) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : toDateInputString(value);
  if (typeof value === "number" && Number.isFinite(value)) return toDateInputString(new Date(value));
  if (typeof value?.toDate === "function") {
    const parsedDate = value.toDate();
    return parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? toDateInputString(parsedDate) : "";
  }
  if (typeof value === "object") {
    const timestamp = parseEntityTimestampValue(value);
    return timestamp ? toDateInputString(new Date(timestamp)) : "";
  }
  const raw = `${value || ""}`.trim();
  const directDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  if (directDate) return directDate;
  const vietnameseTimestamp = parseVietnameseDateTimeString(raw);
  if (vietnameseTimestamp) return toDateInputString(new Date(vietnameseTimestamp));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toDateInputString(parsed);
};
var getPaymentRawPayosData = (payment = {}) => {
  const rawWebhook = payment.rawWebhook || payment.rawPayload || {};
  const data = rawWebhook?.data || {};
  const paymentLink = rawWebhook?.paymentLink || data?.paymentLink || {};
  const latestTransaction = rawWebhook?.latestTransaction || data?.latestTransaction || {};
  const transactions = Array.isArray(paymentLink?.transactions) ? paymentLink.transactions : [];
  const latestLinkedTransaction = transactions.slice().sort((a, b) => `${b?.transactionDateTime || b?.transactionDate || b?.createdAt || ""}`.localeCompare(`${a?.transactionDateTime || a?.transactionDate || a?.createdAt || ""}`))[0] || {};
  return {
    rawWebhook,
    data,
    paymentLink,
    latestTransaction,
    latestLinkedTransaction
  };
};
var getPaymentDateCandidates = (payment = {}) => {
  const { rawWebhook, data, paymentLink, latestTransaction, latestLinkedTransaction } = getPaymentRawPayosData(payment);
  return [
    payment.paymentDate,
    payment.transactionDate,
    payment.transactionDateTime,
    payment.bankTransactionDate,
    data.transactionDateTime,
    data.transactionDate,
    data.paymentTime,
    data.completedTime,
    data.paidAt,
    latestTransaction.transactionDateTime,
    latestTransaction.transactionDate,
    latestTransaction.paymentTime,
    latestTransaction.completedTime,
    latestTransaction.paidAt,
    latestTransaction.createdAt,
    latestLinkedTransaction.transactionDateTime,
    latestLinkedTransaction.transactionDate,
    latestLinkedTransaction.paymentTime,
    latestLinkedTransaction.completedTime,
    latestLinkedTransaction.paidAt,
    latestLinkedTransaction.createdAt,
    paymentLink.transactionDateTime,
    paymentLink.transactionDate,
    paymentLink.paymentTime,
    paymentLink.completedTime,
    paymentLink.paidAt,
    paymentLink.createdAt,
    rawWebhook.transactionDateTime,
    rawWebhook.transactionDate,
    rawWebhook.paymentTime,
    rawWebhook.completedTime,
    rawWebhook.paidAt,
    payment.paidAt,
    payment.transactionAt,
    payment.transactedAt,
    payment.paymentTime,
    payment.completedTime,
    payment.completedAt,
    data.createdAt,
    rawWebhook.createdAt,
    payment.date,
    payment.createdAt,
    payment.updatedAt,
    getEntityTimestamp(payment)
  ];
};
var getPaymentDateSource = (payment = {}) => getPaymentDateCandidates(payment).find((candidate) => getDateKeyFromAnyValue(candidate)) || "";
var getPaymentDateKey = (payment = {}) => getDateKeyFromAnyValue(getPaymentDateSource(payment));
var getPaymentTimestamp = (payment = {}) => parseEntityTimestampValue(getPaymentDateSource(payment)) || getEntityTimestamp(payment) || (getPaymentDateKey(payment) ? (/* @__PURE__ */ new Date(`${getPaymentDateKey(payment)}T12:00:00`)).getTime() : 0);
var getOrderSalesEmpId = (order, customers = []) => {
  const customer = customers.find((c) => c.id === order?.customerId);
  return order?.salesEmpId || customer?.empId || order?.createdByEmpId || order?.empId || null;
};
var calculateRevenueForMonth = (empId, orders, customers = [], monthKey = getTodayString().substring(0, 7)) => {
  return calculateEmployeeSalesRevenueForMonth({
    employeeId: empId,
    orders,
    customers,
    monthKey
  });
};
var calculateMonthRevenue = (empId, orders, customers = [], monthKey = getTodayString().substring(0, 7)) => calculateRevenueForMonth(empId, orders, customers, monthKey);
var buildSalaryDetails = (empId, employees, attendance, financials, performance2, allCustomers = [], allOrders = [], allPayments = [], holidays = [], monthKey = getTodayString().substring(0, 7), options = {}) => {
  const emp = employees.find((e) => e.id === empId);
  if (!emp) return null;
  const isSalesCollaborator = isSalesCollaboratorPosition(emp.position);
  const monthlyPerformanceKey = `${monthKey}_${empId}`;
  const legacyPerformance = performance2[empId] || {};
  const monthlyPerformance = performance2[monthlyPerformanceKey] || {};
  const perf = employeeHomeSpreadResult({
    ...employeeHomeSpreadSource(legacyPerformance),
    ...employeeHomeSpreadSource(monthlyPerformance),
    revenue: monthlyPerformance.revenue ?? legacyPerformance.revenue ?? 0,
    overtime: monthlyPerformance.overtime ?? legacyPerformance.overtime ?? 0
  });
  const salaryMonthDays = resolveSalaryMonthDays(emp, monthKey);
  const basicSalary = parseLooseMoneyValue(emp.basicSalary);
  const supportSalary = parseLooseMoneyValue(emp.supportSalary);
  const responsibilitySalary = parseLooseMoneyValue(emp.responsibilitySalary);
  const experienceSalary = parseLooseMoneyValue(emp.experienceSalary);
  const basicSalaryMonthDays = salaryMonthDays;
  const supportSalaryMonthDays = basicSalaryMonthDays;
  const dailyBaseWage = basicSalary / basicSalaryMonthDays;
  const dailySupportWage = supportSalary / supportSalaryMonthDays;
  const probationRate = (emp.probationRate !== void 0 ? emp.probationRate : 100) / 100;
  let workDaysProbation = 0;
  let workDaysOfficial = 0;
  let holidayBonus = 0;
  const holidayRecords = [];
  let latePenaltyTotal = 0;
  let earlyOvertimeMinutesTotal = 0;
  let afterShiftOvertimeMinutesTotal = 0;
  const probationEndDate = resolveProbationEndDate(emp.startDate, emp.probationDuration, emp.probationUnit);
  const attendanceEntries = getWorkRoleMonthEntries(attendance, emp, emp.position, monthKey, calculateAttendanceTiming);
  attendanceEntries.forEach((entry) => {
    if (entry.status === "present" || entry.status === "late") {
      latePenaltyTotal += entry.latePenaltyAmount || 0;
      earlyOvertimeMinutesTotal += entry.earlyOvertimeMinutes || 0;
      afterShiftOvertimeMinutesTotal += entry.afterShiftOvertimeMinutes || 0;
      if (entry.noSalaryDay) return;
      const workDate = parseDateInputValue(entry.date);
      if (probationEndDate && workDate <= probationEndDate) workDaysProbation += 1;
      else workDaysOfficial += 1;
      const matchedHolidays = holidays.filter((h) => h.date === entry.date && !h.isArchived);
      matchedHolidays.forEach((isHoliday) => {
        const amount = isHoliday.type === "fixed" ? parseLooseMoneyValue(isHoliday.value) : dailyBaseWage * (parseLooseMoneyValue(isHoliday.value) / 100);
        holidayBonus += amount;
        holidayRecords.push({
          id: isHoliday.id || `${entry.date}-${isHoliday.name || "holiday"}`,
          date: entry.date,
          name: isHoliday.name || "Ng\xE0y l\u1EC5",
          type: isHoliday.type || "percentage",
          value: parseLooseMoneyValue(isHoliday.value),
          amount: roundMoneyValue(amount)
        });
      });
    }
  });
  const workDays = workDaysProbation + workDaysOfficial;
  const baseSalaryCalc = roundMoneyValue(workDaysProbation * dailyBaseWage * probationRate + workDaysOfficial * dailyBaseWage);
  const supportSalaryCalc = roundMoneyValue(workDaysProbation * dailySupportWage * probationRate + workDaysOfficial * dailySupportWage);
  const responsibilitySalaryCalc = isSalesCollaborator ? 0 : roundMoneyValue(responsibilitySalary / basicSalaryMonthDays * workDays);
  const roleSalaryRows = normalizeEmployeeRoleSalaryComponents(emp.roleSalaryComponents || emp.departmentSalaryComponents || emp.salaryByDepartment).map((row) => {
    const entries = row.position === emp.position ? [] : getWorkRoleMonthEntries(attendance, emp, row.position, monthKey, calculateAttendanceTiming);
    attendanceEntries.push(...entries);
    const days = calculateWorkRoleSalary(parseLooseMoneyValue(row.amount), entries, salaryMonthDays, probationEndDate, probationRate);
    return employeeHomeSpreadResult({ ...employeeHomeSpreadSource(row), ...employeeHomeSpreadSource(days), calculatedAmount: isSalesCollaborator ? 0 : days.calculatedAmount });
  });
  const roleSalaryCalc = isSalesCollaborator ? 0 : roundMoneyValue(roleSalaryRows.reduce((sum, row) => sum + (row.calculatedAmount || 0), 0));
  attendanceEntries.sort((a, b) => a.date.localeCompare(b.date) || a.workRole.localeCompare(b.workRole, "vi"));
  const experienceDetails = calculateExperienceSalaryAtDate(
    emp.startDate,
    experienceSalary,
    emp.experienceSalaryPeriod || "months",
    getMonthEndDateInputValue(monthKey)
  );
  const experienceSalaryCalc = roundMoneyValue(experienceDetails.total / salaryMonthDays * workDays);
  const expMonths = experienceDetails.expMonths;
  const experienceCycles = experienceDetails.experienceCycles;
  const experienceCycleLabel = experienceDetails.experienceCycleLabel;
  const effectiveRevenue = isEmployeeSalesPosition(emp) ? calculateRevenueForMonth(empId, allOrders, allCustomers, monthKey) : perf.revenue || 0;
  const directCommission = calculateDirectSalesCommission(emp, effectiveRevenue || 0);
  const downlineCommissionRows = isEmployeeSalesPosition(emp) ? buildSalesDownlineCommissionRows(empId, employees, allOrders, allCustomers, monthKey) : [];
  const downlineCommission = roundMoneyValue(downlineCommissionRows.reduce((sum, row) => sum + (row.commission || 0), 0));
  const commission = roundMoneyValue(directCommission + downlineCommission);
  const tieredBonus = 0;
  const earlyOvertimeHours = roundMoneyValue(earlyOvertimeMinutesTotal / 60 * 100) / 100;
  const afterShiftOvertimeHours = roundMoneyValue(afterShiftOvertimeMinutesTotal / 60 * 100) / 100;
  const automaticOvertimeHours = afterShiftOvertimeHours;
  const approvedOvertimeHours = parseFloat(perf.overtime || 0) || 0;
  const overtimeRate = parseLooseMoneyValue(emp.overtimeRate);
  const overtimePay = isSalesCollaborator ? 0 : roundMoneyValue((approvedOvertimeHours + automaticOvertimeHours) * overtimeRate);
  const monthlyFinancials = financials.filter((f) => f.empId === empId && !f.isArchived && (f.type === "advance" ? isSalaryAdvanceInMonth(f, monthKey) : !f.date || f.date.startsWith(monthKey))).sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const bonusRecords = monthlyFinancials.filter((record) => record.type === "bonus");
  const penaltyRecords = monthlyFinancials.filter((record) => record.type === "penalty");
  const advanceRecords = monthlyFinancials.filter((record) => record.type === "advance");
  const employeePurchaseRecords = monthlyFinancials.filter((record) => record.type === "employee_purchase");
  let totalBonus = bonusRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);
  const totalManualPenalty = penaltyRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);
  const latePenaltyRecords = attendanceEntries.filter((entry) => entry.isPrimaryRole && ((entry.latePenaltyAmount || 0) > 0 || entry.noSalaryDay)).map((entry) => ({
    id: `late-${entry.date}-${empId}`,
    type: "late_penalty",
    date: entry.date,
    amount: entry.latePenaltyAmount || 0,
    reason: entry.noSalaryDay ? `\u0110i mu\u1ED9n ${entry.lateMinutes} ph\xFAt - kh\xF4ng t\xEDnh l\u01B0\u01A1ng ng\xE0y n\xE0y` : `\u0110i mu\u1ED9n ${entry.lateMinutes} ph\xFAt`,
    lateMinutes: entry.lateMinutes || 0,
    noSalaryDay: Boolean(entry.noSalaryDay)
  }));
  const totalPenalty = totalManualPenalty + latePenaltyTotal;
  const totalAdvance = advanceRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);
  const totalEmployeePurchase = employeePurchaseRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);
  holidayBonus = isSalesCollaborator ? 0 : roundMoneyValue(holidayBonus);
  totalBonus += holidayBonus;
  totalBonus = roundMoneyValue(totalBonus);
  const roundedTotalPenalty = roundMoneyValue(totalPenalty);
  const roundedTotalAdvance = roundMoneyValue(totalAdvance);
  const roundedTotalEmployeePurchase = roundMoneyValue(totalEmployeePurchase);
  let badDebt = 0;
  if (!options.skipDebt && isEmployeeSalesPosition(emp)) {
    const myCustomers = allCustomers.filter((c) => c.empId === empId);
    badDebt = myCustomers.reduce((sum, cus) => sum + (options.customerDebtByRecord?.has(cus) ? options.customerDebtByRecord.get(cus) : getCustomerDebt(cus, allOrders, allPayments)), 0);
    if (badDebt < 0) badDebt = 0;
  }
  badDebt = roundMoneyValue(badDebt);
  const grossSalary = roundMoneyValue(baseSalaryCalc + supportSalaryCalc + responsibilitySalaryCalc + roleSalaryCalc + experienceSalaryCalc + commission + tieredBonus + overtimePay + totalBonus);
  const deductionTotal = roundMoneyValue(roundedTotalPenalty + roundedTotalAdvance + roundedTotalEmployeePurchase + badDebt);
  const netSalary = roundMoneyValue(grossSalary - deductionTotal);
  return {
    monthKey,
    workDays,
    workDaysProbation: isSalesCollaborator ? 0 : workDaysProbation,
    workDaysOfficial: isSalesCollaborator ? 0 : workDaysOfficial,
    expMonths,
    experienceCycles,
    experienceCycleLabel,
    perf: employeeHomeSpreadResult({ ...employeeHomeSpreadSource(perf), revenue: effectiveRevenue, overtime: approvedOvertimeHours, earlyOvertimeHours, afterShiftOvertimeHours, automaticOvertimeHours }),
    salesRevenue: roundMoneyValue(effectiveRevenue || 0),
    baseSalaryCalc,
    supportSalary: supportSalaryCalc,
    responsibilitySalary: responsibilitySalaryCalc,
    roleSalary: roleSalaryCalc,
    roleSalaryRows,
    experienceSalary: experienceSalaryCalc,
    directCommission,
    downlineCommission,
    downlineCommissionRows,
    commission,
    tieredBonus,
    overtimePay,
    approvedOvertimeHours,
    earlyOvertimeHours,
    earlyOvertimeMinutes: earlyOvertimeMinutesTotal,
    afterShiftOvertimeHours,
    afterShiftOvertimeMinutes: afterShiftOvertimeMinutesTotal,
    automaticOvertimeHours,
    totalBonus,
    holidayBonus,
    latePenaltyTotal: roundMoneyValue(latePenaltyTotal),
    totalPenalty: roundedTotalPenalty,
    totalAdvance: roundedTotalAdvance,
    totalEmployeePurchase: roundedTotalEmployeePurchase,
    badDebt,
    grossSalary,
    deductionTotal,
    netSalary,
    attendanceEntries,
    bonusRecords,
    penaltyRecords,
    latePenaltyRecords,
    holidayRecords,
    advanceRecords,
    employeePurchaseRecords
  };
};
var getAssetStatusLabel = (status) => ({
  active: "\u0110ang ho\u1EA1t \u0111\u1ED9ng",
  maintenance: "B\u1EA3o d\u01B0\u1EE1ng",
  inactive: "Ng\u1EEBng s\u1EED d\u1EE5ng"
})[status] || "\u0110ang ho\u1EA1t \u0111\u1ED9ng";
var getAssetCostTypeLabel = (type) => ({
  fuel: "Nhi\xEAn li\u1EC7u",
  maintenance: "B\u1EA3o d\u01B0\u1EE1ng",
  repair: "S\u1EEDa ch\u1EEFa",
  tire: "V\xE1 l\u1ED1p",
  oil: "Thay nh\u1EDBt",
  toll: "Ph\xED c\u1EA7u \u0111\u01B0\u1EDDng",
  other: "Kh\xE1c"
})[type] || type || "Kh\xE1c";
var getAssetDisplayLabel = (asset = {}) => {
  const name = asset.name || asset.vehicleName || asset.vehicleModel || asset.vehicleBrand || asset.type || "T\xE0i s\u1EA3n";
  const plate = asset.plateNumber || asset.licensePlate || asset.plate || asset.vehiclePlate || "";
  const cleanName = `${name || ""}`.trim();
  const cleanPlate = `${plate || ""}`.trim();
  return [cleanName, cleanPlate && !cleanName.includes(cleanPlate) ? cleanPlate : ""].filter(Boolean).join(" - ") || "T\xE0i s\u1EA3n";
};
var getAssetAssigneeIds = (asset = {}) => getDeliveryAssignmentIds(asset);
var isAssetAssignedToEmployee = (asset = {}, employeeId = "") => Boolean(`${employeeId || ""}`.trim()) && getAssetAssigneeIds(asset).includes(`${employeeId || ""}`.trim());
var EMPLOYEE_REVIEW_BONUS_BY_CRITERIA_STAR = {
  0: 0,
  1: 1e4,
  2: 2e4,
  3: 3e4,
  4: 5e4,
  5: 1e5
};
var normalizeEmployeeReviewMonthKey = (value) => {
  const raw = `${value || ""}`.trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const dateKey2 = getDateKeyFromAnyValue(raw) || getTodayString();
  return `${dateKey2}`.slice(0, 7);
};
var getEmployeeReviewStars = (score = 0) => {
  const value = Math.max(0, Math.min(100, Number(score || 0)));
  if (value <= 0) return 0;
  if (value >= 90) return 5;
  if (value >= 80) return 4;
  if (value >= 65) return 3;
  if (value >= 50) return 2;
  return 1;
};
var getEmployeeAttendanceEntriesForMonth = (attendance = {}, empId = "", monthKey = "", companyId = "") => {
  const records = Array.isArray(attendance) ? attendance.map((record) => ({ key: record?.id || "", record })) : Object.entries(attendance || {}).map(([key, record]) => ({ key, record }));
  return records.filter(({ key, record }) => {
    const declaredId = record?.employeeId || record?.empId || record?.targetEmployeeId;
    if (declaredId) return `${declaredId}` === `${empId || ""}`;
    const match = `${key || record?.id || ""}`.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
    return `${match?.[2] || ""}` === `${empId || ""}`;
  }).map(({ key, record }) => {
    const documentId = `${key || record?.id || ""}`;
    const documentIdMatch = documentId.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
    const employeeId = record?.empId || record?.employeeId || record?.targetEmployeeId || documentIdMatch?.[2] || "";
    const date = documentIdMatch?.[1] || record?.date || record?.dateKey || record?.monthKey || documentIdMatch?.[1] || record?.createdAt || record?.updatedAt || getEntityTimestamp(record);
    return employeeHomeSpreadResult({
      ...employeeHomeSpreadSource(record || {}),
      id: documentId || record?.id,
      employeeId: record?.employeeId || employeeId,
      date: documentIdMatch?.[1] || record?.date || date
    });
  }).filter((record) => `${record?.employeeId || record?.empId || ""}` === `${empId || ""}` && normalizeEmployeeReviewMonthKey(record?.date || record?.dateKey || record?.createdAt || getEntityTimestamp(record)) === monthKey && (!companyId || `${record?.companyId || record?.appId || record?.tenantId || ""}` === `${companyId}`));
};
var isEmployeeReviewLeaveRecord = (record = {}) => {
  const status = `${record?.status || record?.type || ""}`.trim().toLowerCase();
  return Boolean(
    record?.leave || record?.isLeave || record?.leaveType || ["leave", "approved_leave", "unapproved_leave", "absent"].includes(status)
  );
};
var getEmployeeReviewOrderAmount = (order = {}) => parseLooseMoneyValue(order.totalAmount ?? order.total ?? order.amount ?? order.finalAmount ?? order.grandTotal ?? order.revenue ?? 0);
var isOrderRelatedToEmployeeReview = (order = {}, empId = "") => {
  const employeeId = `${empId || ""}`;
  if (!employeeId) return false;
  return [
    order.empId,
    order.employeeId,
    order.salesEmployeeId,
    order.createdByEmpId,
    order.createdBy,
    order.ownerEmpId,
    order.salesPersonId
  ].some((id) => `${id || ""}` === employeeId);
};
var isDeliveryReportRelatedToEmployeeReview = (report = {}, empId = "") => {
  const employeeId = `${empId || ""}`;
  if (!employeeId) return false;
  return [
    report.empId,
    report.employeeId,
    report.driverId,
    report.createdByEmpId,
    report.createdBy
  ].some((id) => `${id || ""}` === employeeId);
};
var EMPLOYEE_PEER_REVIEW_CRITERIA = [
  {
    id: "commitment",
    label: "Cam k\u1EBFt",
    hint: "Gi\u1EEF l\u1EDDi h\u1EE9a, theo vi\u1EC7c \u0111\u1EBFn c\xF9ng."
  },
  {
    id: "initiative",
    label: "Ch\u1EE7 \u0111\u1ED9ng",
    hint: "T\u1EF1 ph\xE1t hi\u1EC7n vi\u1EC7c c\u1EA7n l\xE0m, kh\xF4ng ch\u1EDD nh\u1EAFc."
  },
  {
    id: "ownership",
    label: "Ownership",
    hint: "D\xE1m nh\u1EADn tr\xE1ch nhi\u1EC7m, kh\xF4ng \u0111\u1ED5 l\u1ED7i."
  },
  {
    id: "support",
    label: "H\u1ED7 tr\u1EE3",
    hint: "S\u1EB5n s\xE0ng h\u1ED7 tr\u1EE3 \u0111\u1ED3ng \u0111\u1ED9i."
  },
  {
    id: "knowledge_sharing",
    label: "Chia s\u1EBB tri th\u1EE9c",
    hint: "Chia s\u1EBB kinh nghi\u1EC7m, quy tr\xECnh v\xE0 c\xE1ch l\xE0m t\u1ED1t."
  },
  {
    id: "respect",
    label: "T\xF4n tr\u1ECDng",
    hint: "T\xF4n tr\u1ECDng \u0111\u1ED3ng nghi\u1EC7p, kh\xE1ch h\xE0ng v\xE0 quy tr\xECnh chung."
  },
  {
    id: "alignment",
    label: "\u0110\u1ED3ng thu\u1EADn",
    hint: "Ph\u1ED1i h\u1EE3p v\xEC m\u1EE5c ti\xEAu chung, kh\xF4ng k\xE9o nh\xF3m l\u1EC7ch h\u01B0\u1EDBng."
  },
  {
    id: "communication",
    label: "Giao ti\u1EBFp",
    hint: "N\xF3i r\xF5, nghe k\u1EF9, trao \u0111\u1ED5i l\u1ECBch s\u1EF1."
  },
  {
    id: "positive_spirit",
    label: "T\xEDch c\u1EF1c",
    hint: "Gi\u1EEF tinh th\u1EA7n x\xE2y d\u1EF1ng, kh\xF4ng t\u1EA1o ganh gh\xE9t."
  },
  {
    id: "connection",
    label: "K\u1EBFt n\u1ED1i",
    hint: "T\u1EA1o s\u1EF1 g\u1EAFn k\u1EBFt gi\u1EEFa c\xE1c b\u1ED9 ph\u1EADn."
  }
];
var clampEmployeeReviewStar = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(5, Math.max(0, parsed));
};
var getEmployeeReviewCriterionBonus = (score = 0) => {
  const value = clampEmployeeReviewStar(score, 0);
  const lowerStar = Math.floor(value);
  const upperStar = Math.ceil(value);
  const lowerBonus = EMPLOYEE_REVIEW_BONUS_BY_CRITERIA_STAR[lowerStar] || 0;
  if (lowerStar === upperStar) return lowerBonus;
  const upperBonus = EMPLOYEE_REVIEW_BONUS_BY_CRITERIA_STAR[upperStar] || lowerBonus;
  const bonus = lowerBonus + (upperBonus - lowerBonus) * (value - lowerStar);
  return Math.round(bonus / 1e3) * 1e3;
};
var getEmployeeReviewCriteriaBonusTotal = (criteriaScores = {}, criteriaList = EMPLOYEE_PEER_REVIEW_CRITERIA) => (criteriaList || EMPLOYEE_PEER_REVIEW_CRITERIA).reduce((sum, criteria) => sum + getEmployeeReviewCriterionBonus(criteriaScores?.[criteria.id]), 0);
var buildDefaultEmployeeReviewCriteriaScores = (rating = 0) => EMPLOYEE_PEER_REVIEW_CRITERIA.reduce((acc, criteria) => {
  acc[criteria.id] = clampEmployeeReviewStar(rating, 0);
  return acc;
}, {});
var getEmployeeReviewCriteriaAverage = (criteriaScores = {}) => {
  const scores = EMPLOYEE_PEER_REVIEW_CRITERIA.map((criteria) => clampEmployeeReviewStar(criteriaScores?.[criteria.id], 0));
  if (!scores.length) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
};
var getEmployeeReviewRatingValue = (review = {}) => {
  if (review.rating !== void 0 || review.score !== void 0) {
    return clampEmployeeReviewStar(review.rating ?? review.score, 0);
  }
  if (review.criteriaAverage !== void 0) {
    return clampEmployeeReviewStar(review.criteriaAverage, 0);
  }
  return getEmployeeReviewCriteriaAverage(review.criteriaScores || review.criteria || {});
};
var summarizeEmployeeReviews = (reviews = [], empId = "", monthKey = "", source = "peer") => {
  const filtered = (reviews || []).filter((item) => `${item?.targetEmployeeId || ""}` === `${empId || ""}` && normalizeEmployeeReviewMonthKey(item?.monthKey || item?.date || item?.createdAt) === monthKey && (!source || `${item?.source || "peer"}` === source));
  const totalStars = filtered.reduce((sum, item) => sum + getEmployeeReviewRatingValue(item), 0);
  const avgStars = filtered.length ? totalStars / filtered.length : 0;
  const reviewerIds = new Set(
    filtered.map((item) => `${item?.reviewerEmployeeId || ""}`.trim()).filter(Boolean)
  );
  return {
    items: filtered,
    count: filtered.length,
    reviewerCount: reviewerIds.size || filtered.length,
    avgStars,
    score: avgStars ? Math.max(0, Math.min(100, avgStars * 20)) : 0,
    latestReason: filtered.slice().sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0))[0]?.reason || ""
  };
};
var calculateEmployeeSystemReview = (emp = {}, {
  attendance = {},
  orders = [],
  deliveryReports = [],
  monthKey = "",
  companyId = "",
  reviewOrdersByEmployee = null,
  reviewReportsByEmployee = null
} = {}) => {
  const employeeId = emp?.id || "";
  const attendanceEntries = getEmployeeAttendanceEntriesForMonth(attendance, employeeId, monthKey, companyId);
  const workDays = attendanceEntries.filter((record) => record?.checkIn || record?.status === "present" || record?.type === "work").length;
  const leaveDays = new Set(
    attendanceEntries.filter(isEmployeeReviewLeaveRecord).map((record) => getDateKeyFromAnyValue(record?.date || record?.dateKey || record?.createdAt || getEntityTimestamp(record))).filter(Boolean)
  ).size;
  const lateCount = attendanceEntries.filter((record) => {
    if (isEmployeeReviewLeaveRecord(record)) return false;
    const checkInValue = record?.checkIn || record?.checkInAt || record?.timeIn;
    if (checkInValue) return calculateAttendanceTiming(emp, record).lateMinutes > 0;
    return parseMinutesInput(record?.lateMinutes ?? record?.minutesLate ?? record?.late, 0) > 0;
  }).length;
  const missingCheckOut = attendanceEntries.filter((record) => (record?.checkIn || record?.checkInAt) && !(record?.checkOut || record?.checkOutAt)).length;
  const candidateOrders = reviewOrdersByEmployee instanceof Map ? reviewOrdersByEmployee.get(`${employeeId}`) || [] : orders || [];
  const monthOrders = candidateOrders.filter((order) => isOrderRelatedToEmployeeReview(order, employeeId) && normalizeEmployeeReviewMonthKey(order.date || order.createdAt || getEntityTimestamp(order)) === monthKey && (!companyId || `${order?.companyId || order?.appId || order?.tenantId || ""}` === `${companyId}`));
  const revenue = monthOrders.reduce((sum, order) => sum + getEmployeeReviewOrderAmount(order), 0);
  const candidateReports = reviewReportsByEmployee instanceof Map ? reviewReportsByEmployee.get(`${employeeId}`) || [] : deliveryReports || [];
  const monthReports = candidateReports.filter((report) => isDeliveryReportRelatedToEmployeeReview(report, employeeId) && normalizeEmployeeReviewMonthKey(report.date || report.createdAt || getEntityTimestamp(report)) === monthKey && (!companyId || `${report?.companyId || report?.appId || report?.tenantId || ""}` === `${companyId}`));
  const deliveryCount = monthReports.length;
  const attendanceScore = Math.max(0, 40 - lateCount * 2 - missingCheckOut * 3 - leaveDays);
  const disciplineScore = Math.max(0, 20 - lateCount - missingCheckOut * 2);
  const responsibilityScore = Math.max(0, 20 - missingCheckOut * 2);
  const workloadScore = revenue > 0 || deliveryCount > 0 || workDays > 0 ? 20 : 14;
  const score = Math.max(0, Math.min(100, attendanceScore + disciplineScore + responsibilityScore + workloadScore));
  const strengths = [];
  const warnings = [];
  if (workDays > 0) strengths.push(`${workDays} ng\xE0y c\xF3 ch\u1EA5m c\xF4ng`);
  if (revenue > 0) strengths.push(`Doanh thu ${formatCurrency(revenue)} \u0111`);
  if (deliveryCount > 0) strengths.push(`${deliveryCount} b\xE1o c\xE1o giao h\xE0ng`);
  if (lateCount > 0) warnings.push(`${lateCount} l\u1EA7n \u0111i mu\u1ED9n`);
  if (missingCheckOut > 0) warnings.push(`${missingCheckOut} l\u1EA7n thi\u1EBFu ch\u1EA5m ra`);
  return {
    score,
    stars: getEmployeeReviewStars(score),
    workDays,
    leaveDays,
    lateCount,
    missingCheckOut,
    revenue,
    deliveryCount,
    strengths,
    warnings
  };
};
var buildEmployeeReviewSummary = (emp = {}, context = {}) => {
  const monthKey = normalizeEmployeeReviewMonthKey(context.monthKey || getTodayString());
  const companyId = context.companyId || context.currentCompany?.id || context.currentCompany?.companyId || emp?.companyId || "";
  const effectiveEmployee = applyEmployeePayrollPolicyForMonth(emp, monthKey);
  const system = calculateEmployeeSystemReview(effectiveEmployee, employeeHomeSpreadResult({ ...employeeHomeSpreadSource(context), monthKey, companyId }));
  const peer = summarizeEmployeeReviews(context.reviews || [], emp.id, monthKey, "peer");
  const customer = summarizeEmployeeReviews(context.reviews || [], emp.id, monthKey, "customer");
  const systemCriteriaScores = buildEmployeeSystemReviewCriteriaScores(system);
  const peerCriteriaScores = summarizeEmployeeReviewCriteriaScores(peer.items || []);
  const customerCriteriaScores = summarizeEmployeeReviewCriteriaScores(customer.items || []);
  const peerBonus = peer.count ? getEmployeeReviewCriteriaBonusTotal(peerCriteriaScores) : 0;
  const customerBonus = customer.count ? getEmployeeReviewCriteriaBonusTotal(customerCriteriaScores) : 0;
  const finalCriteriaScores = mergeEmployeeReviewCriteriaScores({
    system: systemCriteriaScores,
    peer: peerCriteriaScores,
    customer: customerCriteriaScores,
    hasPeer: peer.count > 0,
    hasCustomer: customer.count > 0
  });
  const finalCriteriaAverage = getEmployeeReviewCriteriaAverage(finalCriteriaScores);
  const finalScore = Math.round(finalCriteriaAverage * 20);
  const stars = getEmployeeReviewStars(finalScore);
  const attendanceLoaded = context.attendanceLoaded !== void 0 ? context.attendanceLoaded : context.attendance !== null && context.attendance !== void 0;
  const complaintsLoaded = context.complaintsLoaded !== void 0 ? context.complaintsLoaded : context.complaints !== null && context.complaints !== void 0;
  const automaticEvaluation = emp?.id ? calculateEmployeeAutomaticEvaluation({
    employeeId: effectiveEmployee.id,
    companyId,
    monthKey,
    attendanceEntries: attendanceLoaded ? getEmployeeAttendanceEntriesForMonth(context.attendance, emp.id, monthKey, companyId) : null,
    complaints: complaintsLoaded ? context.complaints : null,
    shiftPolicy: resolveEmployeeShiftPolicy(effectiveEmployee)
  }) : null;
  const evaluationSummary13 = emp?.id ? buildEvaluationSummary13({
    employeeId: emp.id,
    companyId,
    monthKey,
    manualCriteria: context.criteriaList || getEmployeeReviewCriteriaList(context.currentCompany || {}),
    manualCriteriaScores: finalCriteriaScores,
    automaticEvaluation
  }) : null;
  return {
    employee: emp,
    monthKey,
    system,
    peer,
    customer,
    peerBonus,
    customerBonus,
    finalCriteriaScores,
    finalCriteriaAverage,
    finalScore,
    stars,
    bonus: getEmployeeReviewCriteriaBonusTotal(finalCriteriaScores),
    evaluationSummary13
  };
};
var normalizeEmployeeReviewCriteriaLabels = (labels = {}, fallbackCompany = {}) => {
  const safeLabels = labels && typeof labels === "object" && !Array.isArray(labels) ? labels : {};
  const fallbackLabels = fallbackCompany?.employeeReviewCriteriaLabels && typeof fallbackCompany.employeeReviewCriteriaLabels === "object" ? fallbackCompany.employeeReviewCriteriaLabels : {};
  return EMPLOYEE_PEER_REVIEW_CRITERIA.reduce((acc, criteria) => {
    const rawLabel = safeLabels?.[criteria.id] ?? fallbackLabels?.[criteria.id] ?? criteria.label;
    acc[criteria.id] = `${rawLabel || ""}`.trim() || criteria.label;
    return acc;
  }, {});
};
var getEmployeeReviewCriteriaList = (company = {}) => {
  const customLabels = normalizeEmployeeReviewCriteriaLabels(company?.employeeReviewCriteriaLabels || {}, company);
  return EMPLOYEE_PEER_REVIEW_CRITERIA.map((criteria) => employeeHomeSpreadResult({
    ...employeeHomeSpreadSource(criteria),
    label: customLabels?.[criteria.id] || criteria.label
  }));
};
var summarizeEmployeeReviewCriteriaScores = (reviews = [], criteriaList = EMPLOYEE_PEER_REVIEW_CRITERIA) => {
  if (!reviews.length) return buildDefaultEmployeeReviewCriteriaScores(0);
  const totals = {};
  const counts = {};
  criteriaList.forEach((criteria) => {
    totals[criteria.id] = 0;
    counts[criteria.id] = 0;
  });
  reviews.forEach((review) => {
    const fallbackRating = getEmployeeReviewRatingValue(review);
    criteriaList.forEach((criteria) => {
      const value = clampEmployeeReviewStar(
        (review.criteriaScores || review.criteria || {})?.[criteria.id],
        fallbackRating
      );
      if (Number.isFinite(value)) {
        totals[criteria.id] += value;
        counts[criteria.id] += 1;
      }
    });
  });
  return criteriaList.reduce((acc, criteria) => {
    acc[criteria.id] = counts[criteria.id] ? Number((totals[criteria.id] / counts[criteria.id]).toFixed(2)) : 0;
    return acc;
  }, {});
};
var buildEmployeeSystemReviewCriteriaScores = (system = {}) => {
  const latePenalty = Math.min(2, Number(system.lateCount || 0) * 0.35);
  const missingPenalty = Math.min(2, Number(system.missingCheckOut || 0) * 0.45);
  const workBonus = Math.min(1.2, Number(system.workDays || 0) / 22);
  const deliveryBonus = Math.min(0.8, Number(system.deliveryCount || 0) / 30);
  const revenueBonus = Math.min(0.8, parseLooseMoneyValue(system.revenue) / 1e8);
  const base = Math.max(0, Math.min(5, 3.2 + workBonus + deliveryBonus + revenueBonus - latePenalty - missingPenalty));
  return {
    commitment: Number(base.toFixed(2)),
    initiative: Number(Math.max(0, Math.min(5, base + revenueBonus - 0.2)).toFixed(2)),
    ownership: Number(Math.max(0, Math.min(5, base - missingPenalty + 0.2)).toFixed(2)),
    support: Number(Math.max(0, Math.min(5, 3.5 + deliveryBonus)).toFixed(2)),
    knowledge_sharing: Number(Math.max(0, Math.min(5, 3 + deliveryBonus / 2)).toFixed(2)),
    respect: Number(Math.max(0, Math.min(5, 4 - latePenalty / 2)).toFixed(2)),
    alignment: Number(Math.max(0, Math.min(5, 3.5 + workBonus / 2)).toFixed(2)),
    communication: Number(Math.max(0, Math.min(5, 3.6 + deliveryBonus / 2)).toFixed(2)),
    positive_spirit: Number(Math.max(0, Math.min(5, 3.5 + workBonus / 3)).toFixed(2)),
    connection: Number(Math.max(0, Math.min(5, 3.3 + deliveryBonus / 2)).toFixed(2))
  };
};
var mergeEmployeeReviewCriteriaScores = ({ system = {}, peer = {}, customer = {}, hasPeer = false, hasCustomer = false } = {}) => {
  const weights = {
    system: hasPeer || hasCustomer ? 0.6 : 1,
    peer: hasPeer ? 0.25 : 0,
    customer: hasCustomer ? 0.15 : 0
  };
  const totalWeight = weights.system + weights.peer + weights.customer || 1;
  return EMPLOYEE_PEER_REVIEW_CRITERIA.reduce((acc, criteria) => {
    const value = (system[criteria.id] || 0) * weights.system + (peer[criteria.id] || 0) * weights.peer + (customer[criteria.id] || 0) * weights.customer;
    acc[criteria.id] = Number((value / totalWeight).toFixed(2));
    return acc;
  }, {});
};
function buildEmployeeHomeScreenModel({ employee, employees = [], attendance = {}, date = getTodayString(), financials = [], performance: performance2 = {}, customers = [], orders = [], payments = [], expenses = [], holidays = [], employeeReviews = [], deliveryReports = [], assets = [], assetCostLogs = [], record = null }) {
  const computedHome = null;
  const monthKey = buildMonthKeyFromDate(date || getTodayString());
  const details = (() => (computedHome ? computedHome.details : buildSalaryDetails(employee?.id, employees, attendance, financials, performance2, customers, orders, payments, holidays, monthKey)) || { netSalary: 0, grossSalary: 0, deductionTotal: 0, workDays: 0, baseSalaryCalc: 0, supportSalary: 0, responsibilitySalary: 0, experienceSalary: 0, commission: 0, tieredBonus: 0, overtimePay: 0, totalBonus: 0, holidayBonus: 0, totalPenalty: 0, totalAdvance: 0, totalEmployeePurchase: 0, badDebt: 0, salesRevenue: 0, attendanceEntries: [], bonusRecords: [], penaltyRecords: [], advanceRecords: [], employeePurchaseRecords: [] })();
  const employeeShiftPolicy = (() => resolveEmployeeShiftPolicy(employee || {}))();
  const todayRecord = (() => {
    const rawRecord = (employee?.id ? attendance?.[`${date}_${employee.id}`] : null) || record || null;
    return normalizeAttendanceRecordForWorkDate(rawRecord, employee || {}, date);
  })();
  const todayAttendanceTiming = (() => todayRecord ? calculateAttendanceTiming(employee || {}, employeeHomeSpreadResult({ ...employeeHomeSpreadSource(todayRecord), date })) : { lateMinutes: 0, earlyOvertimeMinutes: 0, afterShiftOvertimeMinutes: 0, autoOvertimeMinutes: 0 })();
  const attendanceStatus = todayRecord?.status === "leave" ? "Ngh\u1EC9 ph\xE9p" : todayRecord?.checkIn && todayRecord?.checkOut ? "\u0110\xE3 ra ca" : todayRecord?.checkIn ? "\u0110ang l\xE0m" : "Ch\u01B0a ch\u1EA5m";
  const attendanceTone = todayRecord?.checkIn ? todayRecord?.checkOut ? "emerald" : "blue" : todayRecord?.status === "leave" ? "amber" : "rose";
  const reviewSummary = (() => computedHome ? computedHome.reviewSummary : employee?.id ? buildEmployeeReviewSummary(employee, { attendance, orders, deliveryReports, reviews: employeeReviews, monthKey }) : null)();
  const isEmployeeDeliveryReportRow = (row = {}) => {
    const employeeId = `${employee?.id || ""}`;
    if (!employeeId) return false;
    return [
      row.empId,
      row.employeeId,
      row.driverId,
      row.createdByEmpId,
      row.createdBy,
      row.createdByEmployeeId
    ].some((id) => `${id || ""}` === employeeId);
  };
  const isRowInHomeMonth = (row = {}) => {
    const key = getDateKeyFromAnyValue(row.date || row.dateKey || row.createdAt || row.updatedAt || getEntityTimestamp(row));
    return Boolean(key) && buildMonthKeyFromDate(key) === monthKey;
  };
  const employeeDeliveryMonthReports = (() => (deliveryReports || []).filter((report) => report && !report.isArchived && isEmployeeDeliveryReportRow(report) && isRowInHomeMonth(report)))();
  const employeeDeliveryMonthStandaloneExpenses = (() => (expenses || []).filter((expense) => expense && !expense.isArchived && expense.sourceType === "driver_delivery_standalone_expense" && isEmployeeDeliveryReportRow(expense) && isRowInHomeMonth(expense)))();
  const employeeDeliveryMonthSummary = (() => {
    const dayMap = /* @__PURE__ */ new Map();
    const ensureDay = (dateKey2 = "") => {
      const key = dateKey2;
      if (!key) return null;
      if (!dayMap.has(key)) {
        dayMap.set(key, { date: key, reportCount: 0, income: 0, expense: 0 });
      }
      return dayMap.get(key);
    };
    employeeDeliveryMonthReports.forEach((report) => {
      const key = getDateKeyFromAnyValue(report.date || report.dateKey || report.createdAt || report.updatedAt || getEntityTimestamp(report));
      const row = ensureDay(key);
      if (!row) return;
      row.reportCount += 1;
      row.income += parseLooseMoneyValue(report.collectedAmount);
      row.expense += parseLooseMoneyValue(report.deliveryExpenseAmount);
    });
    employeeDeliveryMonthStandaloneExpenses.forEach((expense) => {
      const key = getDateKeyFromAnyValue(expense.date || expense.dateKey || expense.createdAt || expense.updatedAt || getEntityTimestamp(expense));
      const row = ensureDay(key);
      if (!row) return;
      row.expense += parseLooseMoneyValue(expense.amount);
    });
    const rows = Array.from(dayMap.values()).sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
    return {
      income: rows.reduce((sum, row) => sum + row.income, 0),
      expense: rows.reduce((sum, row) => sum + row.expense, 0),
      reportCount: employeeDeliveryMonthReports.length,
      rows
    };
  })();
  const totalBonusDisplay = parseLooseMoneyValue(details.totalBonus) + parseLooseMoneyValue(details.tieredBonus);
  const payrollSummaryRows = (() => {
    const rows = [
      { label: "Th\u1EF1c l\u0129nh", amount: parseLooseMoneyValue(details.netSalary), group: "total", tone: parseLooseMoneyValue(details.netSalary) < 0 ? "bad" : "good" },
      { label: "L\u01B0\u01A1ng c\u01A1 b\u1EA3n", amount: parseLooseMoneyValue(details.baseSalaryCalc), group: "income" },
      { label: "H\u1ED7 tr\u1EE3 + tr\xE1ch nhi\u1EC7m", amount: parseLooseMoneyValue(details.supportSalary) + parseLooseMoneyValue(details.responsibilitySalary), group: "income" },
      { label: "L\u01B0\u01A1ng theo b\u1ED9 ph\u1EADn", amount: parseLooseMoneyValue(details.roleSalary), group: "income" },
      { label: "L\u01B0\u01A1ng th\xE2m ni\xEAn", amount: parseLooseMoneyValue(details.experienceSalary), group: "income" },
      { label: "Hoa h\u1ED3ng", amount: parseLooseMoneyValue(details.commission), group: "income" },
      { label: "T\u0103ng ca", amount: parseLooseMoneyValue(details.overtimePay), group: "income" },
      { label: "Th\u01B0\u1EDFng", amount: totalBonusDisplay, group: "income" },
      { label: "T\u1ED5ng b\u1ECB tr\u1EEB", amount: parseLooseMoneyValue(details.deductionTotal), group: "deduction" },
      { label: "\u1EE8ng l\u01B0\u01A1ng", amount: parseLooseMoneyValue(details.totalAdvance), group: "deduction" },
      { label: "Mua h\xE0ng n\u1ED9i b\u1ED9", amount: parseLooseMoneyValue(details.totalEmployeePurchase), group: "deduction" },
      { label: "C\xF4ng n\u1EE3 ph\u1EA3i thu", amount: parseLooseMoneyValue(details.badDebt), group: "deduction" }
    ];
    const groupRank = (row) => row.amount === 0 ? 3 : row.group === "deduction" ? 2 : row.group === "total" ? 0 : 1;
    return rows.map((row, index) => employeeHomeSpreadResult({ ...employeeHomeSpreadSource(row), order: index })).filter((row) => row.amount !== 0).sort((a, b) => groupRank(a) - groupRank(b) || a.order - b.order);
  })();
  const employeeAssignedAssets = (() => {
    if (!employee?.id) return [];
    return (assets || []).filter((asset) => asset && !asset.isArchived && isAssetAssignedToEmployee(asset, employee.id)).sort((a, b) => getAssetDisplayLabel(a).localeCompare(getAssetDisplayLabel(b), "vi"));
  })();
  const assignedAssetIds = (() => new Set(employeeAssignedAssets.map((asset) => `${asset.id || ""}`).filter(Boolean)))();
  const employeeAssetCostRows = (() => {
    if (!assignedAssetIds.size) return [];
    return (assetCostLogs || []).filter((log) => log && !log.isArchived && assignedAssetIds.has(`${log.assetId || ""}`));
  })();
  const employeeAssetExpenseRows = (() => {
    if (!assignedAssetIds.size) return [];
    return (expenses || []).filter((expense) => expense && !expense.isArchived && assignedAssetIds.has(`${expense.assetId || expense.deliveryExpenseAssetId || ""}`) && !expense.assetCostLogId && !expense.relatedAssetCostLogId && !expense.sourceAssetCostLogId);
  })();
  const isAssetRowInCurrentMonth = (row = {}) => {
    const key = getDateKeyFromAnyValue(row.date || row.createdAt || row.updatedAt);
    return Boolean(key) && buildMonthKeyFromDate(key) === monthKey;
  };
  const employeeAssetMonthCost = (() => employeeAssetCostRows.reduce((sum, log) => isAssetRowInCurrentMonth(log) ? sum + parseLooseMoneyValue(log.amount) : sum, 0) + employeeAssetExpenseRows.reduce((sum, expense) => isAssetRowInCurrentMonth(expense) ? sum + parseLooseMoneyValue(expense.amount) : sum, 0))();
  const latestEmployeeAssetCost = (() => [...employeeAssetCostRows, ...employeeAssetExpenseRows].sort((a, b) => (getEntityTimestamp(b) || Date.parse(b.date || b.createdAt || "") || 0) - (getEntityTimestamp(a) || Date.parse(a.date || a.createdAt || "") || 0))[0] || null)();
  const latestEmployeeAssetCostLabel = latestEmployeeAssetCost ? latestEmployeeAssetCost.assetCostLogId || latestEmployeeAssetCost.relatedAssetCostLogId || latestEmployeeAssetCost.sourceAssetCostLogId ? normalizeExpenseCategoryLabel(latestEmployeeAssetCost.category || latestEmployeeAssetCost.note || "Chi ph\xED t\xE0i s\u1EA3n") : getAssetCostTypeLabel(latestEmployeeAssetCost.type || latestEmployeeAssetCost.costType || "other") : "";
  const positionLabel = getEmployeePositionLabel(employee?.position);
  const isSalesEmployeeHome = isEmployeeSalesPosition(employee);
  const isAssetHomeRole = isEmployeeDriverPosition(employee) || employeeHasPosition(employee, "S\u1EA3n xu\u1EA5t");
  const shouldShowAssetHomeTile = isAssetHomeRole || employeeAssignedAssets.length > 0;
  const employeeSalesOrderRows = (() => {
    if (!isSalesEmployeeHome || !employee?.id) return [];
    const employeeId = `${employee.id}`;
    return (orders || []).filter((order) => {
      if (!order || order.isArchived) return false;
      const orderSalesEmpId = getOrderSalesEmpId(order, customers || []);
      if (`${orderSalesEmpId || ""}` !== employeeId) return false;
      const orderDateKey = getDateKeyFromAnyValue(order.date || order.createdAt || order.updatedAt || getEntityTimestamp(order));
      return Boolean(orderDateKey) && buildMonthKeyFromDate(orderDateKey) === monthKey;
    });
  })();
  const salesOrderCount = employeeSalesOrderRows.length;
  const salesCustomerCount = new Set(employeeSalesOrderRows.map((order) => order.customerId).filter(Boolean)).size;
  const shouldShowSalesHomeStats = isSalesEmployeeHome && ((details.salesRevenue || 0) > 0 || salesOrderCount > 0);
  return { positionLabel, monthKey, reviewSummary, shouldShowAssetHomeTile, details, employeeAssignedAssets, shouldShowSalesHomeStats, salesOrderCount, salesCustomerCount, employeeAssetMonthCost, latestEmployeeAssetCost, latestEmployeeAssetCostLabel, employeeAssetCostRows, employeeAssetExpenseRows, isAssetRowInCurrentMonth, attendanceTone, attendanceStatus, employeeShiftPolicy, todayRecord, todayAttendanceTiming, payrollSummaryRows, employeeDeliveryMonthSummary };
}
var employeeHomeFieldProjection = { "version": 1, "schemaId": "94ca97c422b95c90ac592930335d5091e47f25d5c0a98188fc34c9ad30fbae33", "fieldsByCollection": { "customers": ["Admin", "Bao", "Can", "Chai", "Con", "D", "DateTimeFormat", "HD_PAYROLL_FORMULA_V1", "Kg", "Khay", "NFD", "NumberFormat", "Ownership", "T", "UNVERSIONED_LIVE_PREVIEW", "UTC", "__esModule", "_nanoseconds", "_seconds", "a", "absent", "accepted", "accuracy", "action", "active", "actorName", "actualWeightKg", "add", "additionalPositions", "admin", "advance", "advanceRecords", "advanceRequests", "advances", "afterShiftOvertimeHours", "afterShiftOvertimeMinutes", "alignment", "allocateOldestFirst", "allocationMode", "allocations", "amber", "amount", "anh", "appId", "appliedAmount", "approvalStatus", "approved", "approvedAt", "approvedOvertimeHours", "approved_leave", "assetCostLogId", "assetCostLogs", "assetId", "assets", "assignedDriverId", "assignedDriverIds", "assignedEmployeeId", "assignedEmployeeIds", "attendance", "attendanceEntries", "attendanceId", "attendanceLoaded", "attendanceStatus", "attendanceTone", "autoEarlyOvertimeEnabled", "autoLateCheckoutOvertimeEnabled", "autoOvertimeMinutes", "automatic", "automaticEvaluation", "automaticOvertimeHours", "avgStars", "awaiting_payment", "awaiting_transfer", "bacnam", "bacnu", "bad", "badDebt", "balanced", "bankTransactionDate", "bank_qr_payment_intent", "baseSalaryCalc", "basicSalary", "blue", "bonus", "bonusRecords", "boolean", "buildEmployeeHomeScreenModel", "buildEmployeeReviewSummary", "buildMonthKeyFromDate", "buildSalaryDetails", "byName", "c", "calculateAttendanceTiming", "calculateMonthRevenue", "calculatedAmount", "calendar", "call", "canceled", "cancelled", "category", "ceil", "charAt", "checkIn", "checkInAt", "checkInMethod", "checkOut", "checkOutAt", "checkOutMethod", "checkedByName", "chi", "chu", "co", "code", "collectedAmount", "commission", "commissionBaseMode", "commissionPercent", "commissionRate", "commitment", "communication", "company", "companyId", "companyOldDebtAmount", "companyOpeningDebtAmount", "companyOpeningDebtDate", "companyOpeningDebtNote", "companyOwesBeforeReconcile", "company_owes_customer", "complaintId", "complaints", "complaintsLoaded", "complete", "completedAt", "completedTime", "confirmed", "connection", "cooperative", "costType", "count", "counts", "create", "created", "createdAt", "createdBy", "createdByEmpId", "createdByEmployeeId", "createdByName", "createdByRole", "creditApplied", "creditBalance", "criteria", "criteriaAverage", "criteriaList", "criteriaScores", "criterionCount", "currentCompany", "currentDebt", "customerBonus", "customerComplaints", "customerCount", "customerCreditBeforeReconcile", "customerDebtByRecord", "customerHonorific", "customerId", "customerName", "customerNameSnapshot", "customerPhone", "customer_complaints", "customer_debt_payment_intent", "customer_debt_repayment", "customer_owes_company", "customer_payment_intent", "customers", "d", "data", "date", "dateKey", "day", "days", "deduction", "deductionMonth", "deductionTotal", "defineProperty", "delete", "delivery", "deliveryCount", "deliveryDriverId", "deliveryExpenseAmount", "deliveryExpenseAssetId", "deliveryReports", "department", "departmentSalaryComponents", "departments", "description", "details", "directCommission", "dismissed", "displayAverage", "documentId", "done", "doubleValue", "downlineCommission", "downlineCommissionRows", "driver", "driverEmployeeId", "driverId", "driverIds", "driver_cash", "driver_delivery_expense", "driver_delivery_standalone_expense", "earlyOvertimeHours", "earlyOvertimeMinutes", "effectiveFrom", "effectiveTo", "emerald", "empId", "employee", "employeeAssetCostRows", "employeeAssetExpenseRows", "employeeAssetMonthCost", "employeeAssignedAssets", "employeeDeliveryMonthSummary", "employeeHasPosition", "employeeId", "employeeName", "employeePurchaseRecords", "employeeReviewCriteriaLabels", "employeeReviews", "employeeShiftPolicy", "employee_purchase", "employee_reported_expense", "employee_reported_income", "employees", "end", "endsWith", "entries", "enumerable", "evaluationSummary13", "every", "exactAverage", "expMonths", "expense", "expenses", "experienceCycleLabel", "experienceCycles", "experienceSalary", "experienceSalaryPeriod", "expired", "exports", "extraMeasures", "failed", "filter", "finalAmount", "finalCriteriaAverage", "finalCriteriaScores", "finalScore", "financials", "find", "fine", "fixed", "flatMap", "floor", "forEach", "format", "formatAttendanceMomentForWorkDate", "formatShiftRangeLabel", "formatToParts", "formulaVersion", "freeze", "from", "fromEntries", "fuel", "function", "get", "getAssetCostTypeLabel", "getAssetDisplayLabel", "getAssetStatusLabel", "getAttendanceCompactSource", "getDate", "getDateKeyFromAnyValue", "getEmployeePositionLabel", "getEntityTimestamp", "getFullYear", "getHours", "getMinutes", "getMonth", "getOrderSalesEmpId", "getOwnPropertyDescriptor", "getOwnPropertyNames", "getTime", "getTimezoneOffset", "getTodayString", "good", "gps", "graceMinutes", "grandTotal", "gregory", "grossSalary", "group", "h23", "handed_over", "handoverStatus", "has", "hasCustomer", "hasOpeningPayable", "hasOwn", "hasOwnProperty", "hasPeer", "hasPurchaseReconciliation", "hint", "historyAlreadySelected", "holiday", "holidayBonus", "holidayRecords", "holidays", "honorific", "hour", "hour12", "hourCycle", "hr", "id", "imports", "in", "inactive", "includes", "income", "initiated", "initiative", "integerValue", "invalid", "isArchived", "isArray", "isAssetAssignedToEmployee", "isAssetRowInCurrentMonth", "isCashflowOfficial", "isCustomerDebtPaymentIntent", "isEmployeeDriverPosition", "isEmployeeSalesPosition", "isFinite", "isInteger", "isLeave", "isNaN", "isOpeningDebt", "isPaymentIntent", "isPrimaryRole", "isRejected", "isValid", "join", "keepEmpty", "key", "keys", "kg", "kgs", "kho", "kilo", "kilogram", "kilograms", "knowledge_sharing", "label", "lastActivityAt", "lastMessageAt", "late", "lateCount", "lateMinutes", "latePenaltyAmount", "latePenaltyRate", "latePenaltyRecords", "latePenaltyTiers", "latePenaltyTotal", "late_120", "late_30", "late_60", "late_penalty", "latest", "latestEmployeeAssetCost", "latestEmployeeAssetCostLabel", "latestLinkedTransaction", "latestReason", "latestTransaction", "latitude", "leaderCommissionPercent", "leave", "leaveDays", "leaveEntries", "leaveType", "legacyDebtAmount", "legacyDebtDate", "legacyPayableAmount", "legacyPayableDate", "length", "licensePlate", "linkedCustomerId", "literal", "localeCompare", "longitude", "maintenance", "managerCommissionPercent", "managerEmpId", "managerId", "manual", "manualCriteria", "manualCriteriaScores", "manual_and_automatic", "map", "match", "matchType", "matchedLateTier", "matchedOrderId", "matchedTier", "max", "maxLateMinutes", "measures", "message", "min", "minute", "minutes", "minutesLate", "missing", "missingAlertMinutes", "missingCheckOut", "missingData", "missing_check_in", "missing_check_out", "missing_data", "month", "monthCost", "monthKey", "monthlySalary", "months", "monthsPerCycle", "name", "nanoseconds", "needs_review", "netSalary", "next", "noSalaryDay", "no_salary", "normalize", "normalizeAttendanceRecordForWorkDate", "normalizeExpenseCategoryLabel", "note", "number", "numeric", "object", "oil", "oldDebtAmount", "oldDebtDate", "oldPayableAmount", "oldPayableDate", "oldPayableNote", "oldest_first", "ong", "openingDebtAmount", "openingDebtCreatedAt", "openingDebtDate", "openingDebtNote", "openingPayableAmount", "openingPayableDate", "openingPayableNote", "opening_debt", "order", "orderCode", "orderCount", "orderDate", "orderId", "orderIds", "order_", "order_code", "orders", "other", "out", "outstandingAmount", "overpaidAmount", "overtime", "overtimePay", "overtimeRate", "owner", "ownerEmpId", "ownership", "padStart", "paid", "paidAmount", "paidAt", "parentSalesEmpId", "parse", "parseLooseMoneyValue", "partial", "payment", "paymentDate", "paymentId", "paymentIntent", "paymentLink", "paymentStatus", "paymentTime", "payment_", "payments", "payrollLateMinutes", "payrollMonth", "payrollPolicies", "payrollPolicyEffectiveFrom", "payrollPolicyEffectiveTo", "payrollPolicyVersion", "payrollSummaryRows", "peer", "peerBonus", "penalty", "penaltyAmount", "penaltyRecords", "pending", "pending_handover", "percentage", "perf", "performance", "performedByName", "phone", "phoneNumber", "pieceCount", "plainName", "plate", "plateNumber", "policy", "policyVersion", "position", "positionLabel", "positive_spirit", "present", "price", "primaryPosition", "probationDuration", "probationRate", "probationUnit", "processed", "processing", "productName", "production", "projectEmployeeHomeSnapshot", "projectSourceRecord", "prototype", "proxy", "proxyAttendance", "proxyByName", "proxyName", "purchaseDebt", "purchaseImportAmount", "purchaseImports", "purchaseUnit", "push", "qty", "quantity", "quantityCount", "quantityUnit", "quarters", "rating", "rawPayload", "rawWebhook", "reason", "receivedAt", "reconciliationNetAmount", "reconciliationOffset", "reconciliationStatus", "record", "recordId", "records", "reduce", "ref", "rejected", "rejected_by_company", "relatedAssetCostLogId", "repair", "repayments", "replace", "reportCount", "requiresApproval", "resolutionStatus", "resolveAttendanceAnomalyForDate", "resolveEmployeeShiftPolicy", "resolved", "resolvedPayrollPolicy", "respect", "responsibilitySalary", "responsibleEmployeeId", "revenue", "reviewOrdersByEmployee", "reviewReportsByEmployee", "reviewStars", "reviewSummary", "reviewerCount", "reviewerEmployeeId", "reviews", "reward", "role", "roleSalary", "roleSalaryComponents", "roleSalaryRows", "rose", "round", "rows", "salary", "salaryByDepartment", "salaryMonth", "salaryMonthDays", "salaryPolicyEffectiveFrom", "salaryPolicyHistory", "sales", "salesCustomerCount", "salesDebtBeforeReconcile", "salesEmpId", "salesEmployeeId", "salesLeaderCommissionPercent", "salesLeaderId", "salesManagerId", "salesOrderCount", "salesPersonId", "salesRevenue", "schemaVersion", "score", "scores", "secondaryPositions", "seconds", "sentAt", "sepay_customer_debt_intent", "sepay_payment_intent", "set", "setDate", "setHours", "setMonth", "settlementStatus", "severity", "shiftEnd", "shiftIsOvernight", "shiftLabel", "shiftName", "shiftPolicy", "shiftStart", "shipper", "shouldShowAssetHomeTile", "shouldShowSalesHomeStats", "show", "size", "skipDebt", "slate", "slice", "some", "sort", "source", "sourceAssetCostLogId", "sourceType", "sources", "split", "stars", "start", "startDate", "startsWith", "status", "statusLabel", "strengths", "string", "stringValue", "substring", "supersededAt", "supplier", "supplierCustomerId", "supplierName", "supplierPhone", "support", "supportSalary", "system", "targetEmployeeId", "targetRevenue", "tenantId", "test", "tieredBonus", "timeIn", "timeZone", "timestamp", "timestampValue", "tire", "title", "toDate", "toFixed", "toISOString", "toLowerCase", "toMillis", "toString", "toUpperCase", "todayAttendanceTiming", "todayRecord", "toll", "tone", "total", "totalAdvance", "totalAmount", "totalBonus", "totalEmployeePurchase", "totalKg", "totalPaid", "totalPenalty", "totalPurchaseDebt", "totalQuantity", "totalRepaid", "totalRevenue", "totalScore", "transactedAt", "transactionAt", "transactionDate", "transactionDateTime", "transactions", "trim", "type", "unapproved_leave", "unit", "unitPrice", "unpaid", "updatedAt", "valid", "validateEmployeeHomeScreenDto", "validated", "validationStatus", "value", "values", "vehicleBrand", "vehicleModel", "vehicleName", "vehiclePlate", "version", "versionNumber", "vi", "warn", "warning", "warnings", "weeks", "weight", "weightKg", "withSalesRevenueIndex", "work", "workDays", "workDaysOfficial", "workDaysProbation", "workRole", "workRoles", "year", "years"], "orders": ["Admin", "Bao", "Can", "Chai", "Con", "D", "DateTimeFormat", "HD_PAYROLL_FORMULA_V1", "Kg", "Khay", "NFD", "NumberFormat", "Ownership", "T", "UNVERSIONED_LIVE_PREVIEW", "UTC", "__esModule", "_nanoseconds", "_seconds", "a", "absent", "accepted", "accuracy", "action", "active", "actorName", "actualWeightKg", "add", "additionalPositions", "admin", "advance", "advanceRecords", "advanceRequests", "advances", "afterShiftOvertimeHours", "afterShiftOvertimeMinutes", "alignment", "allocateOldestFirst", "allocationMode", "allocations", "amber", "amount", "anh", "appId", "appliedAmount", "approvalStatus", "approved", "approvedAt", "approvedOvertimeHours", "approved_leave", "assetCostLogId", "assetCostLogs", "assetId", "assets", "assignedDriverId", "assignedDriverIds", "assignedEmployeeId", "assignedEmployeeIds", "attendance", "attendanceEntries", "attendanceId", "attendanceLoaded", "attendanceStatus", "attendanceTone", "autoEarlyOvertimeEnabled", "autoLateCheckoutOvertimeEnabled", "autoOvertimeMinutes", "automatic", "automaticEvaluation", "automaticOvertimeHours", "avgStars", "awaiting_payment", "awaiting_transfer", "bacnam", "bacnu", "bad", "badDebt", "balanced", "bankTransactionDate", "bank_qr_payment_intent", "baseSalaryCalc", "basicSalary", "blue", "bonus", "bonusRecords", "boolean", "buildEmployeeHomeScreenModel", "buildEmployeeReviewSummary", "buildMonthKeyFromDate", "buildSalaryDetails", "byName", "c", "calculateAttendanceTiming", "calculateMonthRevenue", "calculatedAmount", "calendar", "call", "canceled", "cancelled", "category", "ceil", "charAt", "checkIn", "checkInAt", "checkInMethod", "checkOut", "checkOutAt", "checkOutMethod", "checkedByName", "chi", "chu", "co", "code", "collectedAmount", "commission", "commissionBaseMode", "commissionPercent", "commissionRate", "commitment", "communication", "company", "companyId", "companyOldDebtAmount", "companyOpeningDebtAmount", "companyOpeningDebtDate", "companyOpeningDebtNote", "companyOwesBeforeReconcile", "company_owes_customer", "complaintId", "complaints", "complaintsLoaded", "complete", "completedAt", "completedTime", "confirmed", "connection", "cooperative", "costType", "count", "counts", "create", "created", "createdAt", "createdBy", "createdByEmpId", "createdByEmployeeId", "createdByName", "createdByRole", "creditApplied", "creditBalance", "criteria", "criteriaAverage", "criteriaList", "criteriaScores", "criterionCount", "currentCompany", "currentDebt", "customerBonus", "customerComplaints", "customerCount", "customerCreditBeforeReconcile", "customerDebtByRecord", "customerHonorific", "customerId", "customerName", "customerNameSnapshot", "customerPhone", "customer_complaints", "customer_debt_payment_intent", "customer_debt_repayment", "customer_owes_company", "customer_payment_intent", "customers", "d", "data", "date", "dateKey", "day", "days", "deduction", "deductionMonth", "deductionTotal", "defineProperty", "delete", "delivery", "deliveryCount", "deliveryDriverId", "deliveryExpenseAmount", "deliveryExpenseAssetId", "deliveryReports", "department", "departmentSalaryComponents", "departments", "description", "details", "directCommission", "dismissed", "displayAverage", "documentId", "done", "doubleValue", "downlineCommission", "downlineCommissionRows", "driver", "driverEmployeeId", "driverId", "driverIds", "driver_cash", "driver_delivery_expense", "driver_delivery_standalone_expense", "earlyOvertimeHours", "earlyOvertimeMinutes", "effectiveFrom", "effectiveTo", "emerald", "empId", "employee", "employeeAssetCostRows", "employeeAssetExpenseRows", "employeeAssetMonthCost", "employeeAssignedAssets", "employeeDeliveryMonthSummary", "employeeHasPosition", "employeeId", "employeeName", "employeePurchaseRecords", "employeeReviewCriteriaLabels", "employeeReviews", "employeeShiftPolicy", "employee_purchase", "employee_reported_expense", "employee_reported_income", "employees", "end", "endsWith", "entries", "enumerable", "evaluationSummary13", "every", "exactAverage", "expMonths", "expense", "expenses", "experienceCycleLabel", "experienceCycles", "experienceSalary", "experienceSalaryPeriod", "expired", "exports", "extraMeasures", "failed", "filter", "finalAmount", "finalCriteriaAverage", "finalCriteriaScores", "finalScore", "financials", "find", "fine", "fixed", "flatMap", "floor", "forEach", "format", "formatAttendanceMomentForWorkDate", "formatShiftRangeLabel", "formatToParts", "formulaVersion", "freeze", "from", "fromEntries", "fuel", "function", "get", "getAssetCostTypeLabel", "getAssetDisplayLabel", "getAssetStatusLabel", "getAttendanceCompactSource", "getDate", "getDateKeyFromAnyValue", "getEmployeePositionLabel", "getEntityTimestamp", "getFullYear", "getHours", "getMinutes", "getMonth", "getOrderSalesEmpId", "getOwnPropertyDescriptor", "getOwnPropertyNames", "getTime", "getTimezoneOffset", "getTodayString", "good", "gps", "graceMinutes", "grandTotal", "gregory", "grossSalary", "group", "h23", "handed_over", "handoverStatus", "has", "hasCustomer", "hasOpeningPayable", "hasOwn", "hasOwnProperty", "hasPeer", "hasPurchaseReconciliation", "hint", "historyAlreadySelected", "holiday", "holidayBonus", "holidayRecords", "holidays", "honorific", "hour", "hour12", "hourCycle", "hr", "id", "imports", "in", "inactive", "includes", "income", "initiated", "initiative", "integerValue", "invalid", "isArchived", "isArray", "isAssetAssignedToEmployee", "isAssetRowInCurrentMonth", "isCashflowOfficial", "isCustomerDebtPaymentIntent", "isEmployeeDriverPosition", "isEmployeeSalesPosition", "isFinite", "isInteger", "isLeave", "isNaN", "isOpeningDebt", "isPaymentIntent", "isPrimaryRole", "isRejected", "isValid", "join", "keepEmpty", "key", "keys", "kg", "kgs", "kho", "kilo", "kilogram", "kilograms", "knowledge_sharing", "label", "lastActivityAt", "lastMessageAt", "late", "lateCount", "lateMinutes", "latePenaltyAmount", "latePenaltyRate", "latePenaltyRecords", "latePenaltyTiers", "latePenaltyTotal", "late_120", "late_30", "late_60", "late_penalty", "latest", "latestEmployeeAssetCost", "latestEmployeeAssetCostLabel", "latestLinkedTransaction", "latestReason", "latestTransaction", "latitude", "leaderCommissionPercent", "leave", "leaveDays", "leaveEntries", "leaveType", "legacyDebtAmount", "legacyDebtDate", "legacyPayableAmount", "legacyPayableDate", "length", "licensePlate", "linkedCustomerId", "literal", "localeCompare", "longitude", "maintenance", "managerCommissionPercent", "managerEmpId", "managerId", "manual", "manualCriteria", "manualCriteriaScores", "manual_and_automatic", "map", "match", "matchType", "matchedLateTier", "matchedOrderId", "matchedTier", "max", "maxLateMinutes", "measures", "message", "min", "minute", "minutes", "minutesLate", "missing", "missingAlertMinutes", "missingCheckOut", "missingData", "missing_check_in", "missing_check_out", "missing_data", "month", "monthCost", "monthKey", "monthlySalary", "months", "monthsPerCycle", "name", "nanoseconds", "needs_review", "netSalary", "next", "noSalaryDay", "no_salary", "normalize", "normalizeAttendanceRecordForWorkDate", "normalizeExpenseCategoryLabel", "note", "number", "numeric", "object", "oil", "oldDebtAmount", "oldDebtDate", "oldPayableAmount", "oldPayableDate", "oldPayableNote", "oldest_first", "ong", "openingDebtAmount", "openingDebtCreatedAt", "openingDebtDate", "openingDebtNote", "openingPayableAmount", "openingPayableDate", "openingPayableNote", "opening_debt", "order", "orderCode", "orderCount", "orderDate", "orderId", "orderIds", "order_", "order_code", "orders", "other", "out", "outstandingAmount", "overpaidAmount", "overtime", "overtimePay", "overtimeRate", "owner", "ownerEmpId", "ownership", "padStart", "paid", "paidAmount", "paidAt", "parentSalesEmpId", "parse", "parseLooseMoneyValue", "partial", "payment", "paymentDate", "paymentId", "paymentIntent", "paymentLink", "paymentStatus", "paymentTime", "payment_", "payments", "payrollLateMinutes", "payrollMonth", "payrollPolicies", "payrollPolicyEffectiveFrom", "payrollPolicyEffectiveTo", "payrollPolicyVersion", "payrollSummaryRows", "peer", "peerBonus", "penalty", "penaltyAmount", "penaltyRecords", "pending", "pending_handover", "percentage", "perf", "performance", "performedByName", "phone", "phoneNumber", "pieceCount", "plainName", "plate", "plateNumber", "policy", "policyVersion", "position", "positionLabel", "positive_spirit", "present", "price", "primaryPosition", "probationDuration", "probationRate", "probationUnit", "processed", "processing", "productName", "production", "projectEmployeeHomeSnapshot", "projectSourceRecord", "prototype", "proxy", "proxyAttendance", "proxyByName", "proxyName", "purchaseDebt", "purchaseImportAmount", "purchaseImports", "purchaseUnit", "push", "qty", "quantity", "quantityCount", "quantityUnit", "quarters", "rating", "rawPayload", "rawWebhook", "reason", "receivedAt", "reconciliationNetAmount", "reconciliationOffset", "reconciliationStatus", "record", "recordId", "records", "reduce", "ref", "rejected", "rejected_by_company", "relatedAssetCostLogId", "repair", "repayments", "replace", "reportCount", "requiresApproval", "resolutionStatus", "resolveAttendanceAnomalyForDate", "resolveEmployeeShiftPolicy", "resolved", "resolvedPayrollPolicy", "respect", "responsibilitySalary", "responsibleEmployeeId", "revenue", "reviewOrdersByEmployee", "reviewReportsByEmployee", "reviewStars", "reviewSummary", "reviewerCount", "reviewerEmployeeId", "reviews", "reward", "role", "roleSalary", "roleSalaryComponents", "roleSalaryRows", "rose", "round", "rows", "salary", "salaryByDepartment", "salaryMonth", "salaryMonthDays", "salaryPolicyEffectiveFrom", "salaryPolicyHistory", "sales", "salesCustomerCount", "salesDebtBeforeReconcile", "salesEmpId", "salesEmployeeId", "salesLeaderCommissionPercent", "salesLeaderId", "salesManagerId", "salesOrderCount", "salesPersonId", "salesRevenue", "schemaVersion", "score", "scores", "secondaryPositions", "seconds", "sentAt", "sepay_customer_debt_intent", "sepay_payment_intent", "set", "setDate", "setHours", "setMonth", "settlementStatus", "severity", "shiftEnd", "shiftIsOvernight", "shiftLabel", "shiftName", "shiftPolicy", "shiftStart", "shipper", "shouldShowAssetHomeTile", "shouldShowSalesHomeStats", "show", "size", "skipDebt", "slate", "slice", "some", "sort", "source", "sourceAssetCostLogId", "sourceType", "sources", "split", "stars", "start", "startDate", "startsWith", "status", "statusLabel", "strengths", "string", "stringValue", "substring", "supersededAt", "supplier", "supplierCustomerId", "supplierName", "supplierPhone", "support", "supportSalary", "system", "targetEmployeeId", "targetRevenue", "tenantId", "test", "tieredBonus", "timeIn", "timeZone", "timestamp", "timestampValue", "tire", "title", "toDate", "toFixed", "toISOString", "toLowerCase", "toMillis", "toString", "toUpperCase", "todayAttendanceTiming", "todayRecord", "toll", "tone", "total", "totalAdvance", "totalAmount", "totalBonus", "totalEmployeePurchase", "totalKg", "totalPaid", "totalPenalty", "totalPurchaseDebt", "totalQuantity", "totalRepaid", "totalRevenue", "totalScore", "transactedAt", "transactionAt", "transactionDate", "transactionDateTime", "transactions", "trim", "type", "unapproved_leave", "unit", "unitPrice", "unpaid", "updatedAt", "valid", "validateEmployeeHomeScreenDto", "validated", "validationStatus", "value", "values", "vehicleBrand", "vehicleModel", "vehicleName", "vehiclePlate", "version", "versionNumber", "vi", "warn", "warning", "warnings", "weeks", "weight", "weightKg", "withSalesRevenueIndex", "work", "workDays", "workDaysOfficial", "workDaysProbation", "workRole", "workRoles", "year", "years"], "payments": ["Admin", "Bao", "Can", "Chai", "Con", "D", "DateTimeFormat", "HD_PAYROLL_FORMULA_V1", "Kg", "Khay", "NFD", "NumberFormat", "Ownership", "T", "UNVERSIONED_LIVE_PREVIEW", "UTC", "__esModule", "_nanoseconds", "_seconds", "a", "absent", "accepted", "accuracy", "action", "active", "actorName", "actualWeightKg", "add", "additionalPositions", "admin", "advance", "advanceRecords", "advanceRequests", "advances", "afterShiftOvertimeHours", "afterShiftOvertimeMinutes", "alignment", "allocateOldestFirst", "allocationMode", "allocations", "amber", "amount", "anh", "appId", "appliedAmount", "approvalStatus", "approved", "approvedAt", "approvedOvertimeHours", "approved_leave", "assetCostLogId", "assetCostLogs", "assetId", "assets", "assignedDriverId", "assignedDriverIds", "assignedEmployeeId", "assignedEmployeeIds", "attendance", "attendanceEntries", "attendanceId", "attendanceLoaded", "attendanceStatus", "attendanceTone", "autoEarlyOvertimeEnabled", "autoLateCheckoutOvertimeEnabled", "autoOvertimeMinutes", "automatic", "automaticEvaluation", "automaticOvertimeHours", "avgStars", "awaiting_payment", "awaiting_transfer", "bacnam", "bacnu", "bad", "badDebt", "balanced", "bankTransactionDate", "bank_qr_payment_intent", "baseSalaryCalc", "basicSalary", "blue", "bonus", "bonusRecords", "boolean", "buildEmployeeHomeScreenModel", "buildEmployeeReviewSummary", "buildMonthKeyFromDate", "buildSalaryDetails", "byName", "c", "calculateAttendanceTiming", "calculateMonthRevenue", "calculatedAmount", "calendar", "call", "canceled", "cancelled", "category", "ceil", "charAt", "checkIn", "checkInAt", "checkInMethod", "checkOut", "checkOutAt", "checkOutMethod", "checkedByName", "chi", "chu", "co", "code", "collectedAmount", "commission", "commissionBaseMode", "commissionPercent", "commissionRate", "commitment", "communication", "company", "companyId", "companyOldDebtAmount", "companyOpeningDebtAmount", "companyOpeningDebtDate", "companyOpeningDebtNote", "companyOwesBeforeReconcile", "company_owes_customer", "complaintId", "complaints", "complaintsLoaded", "complete", "completedAt", "completedTime", "confirmed", "connection", "cooperative", "costType", "count", "counts", "create", "created", "createdAt", "createdBy", "createdByEmpId", "createdByEmployeeId", "createdByName", "createdByRole", "creditApplied", "creditBalance", "criteria", "criteriaAverage", "criteriaList", "criteriaScores", "criterionCount", "currentCompany", "currentDebt", "customerBonus", "customerComplaints", "customerCount", "customerCreditBeforeReconcile", "customerDebtByRecord", "customerHonorific", "customerId", "customerName", "customerNameSnapshot", "customerPhone", "customer_complaints", "customer_debt_payment_intent", "customer_debt_repayment", "customer_owes_company", "customer_payment_intent", "customers", "d", "data", "date", "dateKey", "day", "days", "deduction", "deductionMonth", "deductionTotal", "defineProperty", "delete", "delivery", "deliveryCount", "deliveryDriverId", "deliveryExpenseAmount", "deliveryExpenseAssetId", "deliveryReports", "department", "departmentSalaryComponents", "departments", "description", "details", "directCommission", "dismissed", "displayAverage", "documentId", "done", "doubleValue", "downlineCommission", "downlineCommissionRows", "driver", "driverEmployeeId", "driverId", "driverIds", "driver_cash", "driver_delivery_expense", "driver_delivery_standalone_expense", "earlyOvertimeHours", "earlyOvertimeMinutes", "effectiveFrom", "effectiveTo", "emerald", "empId", "employee", "employeeAssetCostRows", "employeeAssetExpenseRows", "employeeAssetMonthCost", "employeeAssignedAssets", "employeeDeliveryMonthSummary", "employeeHasPosition", "employeeId", "employeeName", "employeePurchaseRecords", "employeeReviewCriteriaLabels", "employeeReviews", "employeeShiftPolicy", "employee_purchase", "employee_reported_expense", "employee_reported_income", "employees", "end", "endsWith", "entries", "enumerable", "evaluationSummary13", "every", "exactAverage", "expMonths", "expense", "expenses", "experienceCycleLabel", "experienceCycles", "experienceSalary", "experienceSalaryPeriod", "expired", "exports", "extraMeasures", "failed", "filter", "finalAmount", "finalCriteriaAverage", "finalCriteriaScores", "finalScore", "financials", "find", "fine", "fixed", "flatMap", "floor", "forEach", "format", "formatAttendanceMomentForWorkDate", "formatShiftRangeLabel", "formatToParts", "formulaVersion", "freeze", "from", "fromEntries", "fuel", "function", "get", "getAssetCostTypeLabel", "getAssetDisplayLabel", "getAssetStatusLabel", "getAttendanceCompactSource", "getDate", "getDateKeyFromAnyValue", "getEmployeePositionLabel", "getEntityTimestamp", "getFullYear", "getHours", "getMinutes", "getMonth", "getOrderSalesEmpId", "getOwnPropertyDescriptor", "getOwnPropertyNames", "getTime", "getTimezoneOffset", "getTodayString", "good", "gps", "graceMinutes", "grandTotal", "gregory", "grossSalary", "group", "h23", "handed_over", "handoverStatus", "has", "hasCustomer", "hasOpeningPayable", "hasOwn", "hasOwnProperty", "hasPeer", "hasPurchaseReconciliation", "hint", "historyAlreadySelected", "holiday", "holidayBonus", "holidayRecords", "holidays", "honorific", "hour", "hour12", "hourCycle", "hr", "id", "imports", "in", "inactive", "includes", "income", "initiated", "initiative", "integerValue", "invalid", "isArchived", "isArray", "isAssetAssignedToEmployee", "isAssetRowInCurrentMonth", "isCashflowOfficial", "isCustomerDebtPaymentIntent", "isEmployeeDriverPosition", "isEmployeeSalesPosition", "isFinite", "isInteger", "isLeave", "isNaN", "isOpeningDebt", "isPaymentIntent", "isPrimaryRole", "isRejected", "isValid", "join", "keepEmpty", "key", "keys", "kg", "kgs", "kho", "kilo", "kilogram", "kilograms", "knowledge_sharing", "label", "lastActivityAt", "lastMessageAt", "late", "lateCount", "lateMinutes", "latePenaltyAmount", "latePenaltyRate", "latePenaltyRecords", "latePenaltyTiers", "latePenaltyTotal", "late_120", "late_30", "late_60", "late_penalty", "latest", "latestEmployeeAssetCost", "latestEmployeeAssetCostLabel", "latestLinkedTransaction", "latestReason", "latestTransaction", "latitude", "leaderCommissionPercent", "leave", "leaveDays", "leaveEntries", "leaveType", "legacyDebtAmount", "legacyDebtDate", "legacyPayableAmount", "legacyPayableDate", "length", "licensePlate", "linkedCustomerId", "literal", "localeCompare", "longitude", "maintenance", "managerCommissionPercent", "managerEmpId", "managerId", "manual", "manualCriteria", "manualCriteriaScores", "manual_and_automatic", "map", "match", "matchType", "matchedLateTier", "matchedOrderId", "matchedTier", "max", "maxLateMinutes", "measures", "message", "min", "minute", "minutes", "minutesLate", "missing", "missingAlertMinutes", "missingCheckOut", "missingData", "missing_check_in", "missing_check_out", "missing_data", "month", "monthCost", "monthKey", "monthlySalary", "months", "monthsPerCycle", "name", "nanoseconds", "needs_review", "netSalary", "next", "noSalaryDay", "no_salary", "normalize", "normalizeAttendanceRecordForWorkDate", "normalizeExpenseCategoryLabel", "note", "number", "numeric", "object", "oil", "oldDebtAmount", "oldDebtDate", "oldPayableAmount", "oldPayableDate", "oldPayableNote", "oldest_first", "ong", "openingDebtAmount", "openingDebtCreatedAt", "openingDebtDate", "openingDebtNote", "openingPayableAmount", "openingPayableDate", "openingPayableNote", "opening_debt", "order", "orderCode", "orderCount", "orderDate", "orderId", "orderIds", "order_", "order_code", "orders", "other", "out", "outstandingAmount", "overpaidAmount", "overtime", "overtimePay", "overtimeRate", "owner", "ownerEmpId", "ownership", "padStart", "paid", "paidAmount", "paidAt", "parentSalesEmpId", "parse", "parseLooseMoneyValue", "partial", "payment", "paymentDate", "paymentId", "paymentIntent", "paymentLink", "paymentStatus", "paymentTime", "payment_", "payments", "payrollLateMinutes", "payrollMonth", "payrollPolicies", "payrollPolicyEffectiveFrom", "payrollPolicyEffectiveTo", "payrollPolicyVersion", "payrollSummaryRows", "peer", "peerBonus", "penalty", "penaltyAmount", "penaltyRecords", "pending", "pending_handover", "percentage", "perf", "performance", "performedByName", "phone", "phoneNumber", "pieceCount", "plainName", "plate", "plateNumber", "policy", "policyVersion", "position", "positionLabel", "positive_spirit", "present", "price", "primaryPosition", "probationDuration", "probationRate", "probationUnit", "processed", "processing", "productName", "production", "projectEmployeeHomeSnapshot", "projectSourceRecord", "prototype", "proxy", "proxyAttendance", "proxyByName", "proxyName", "purchaseDebt", "purchaseImportAmount", "purchaseImports", "purchaseUnit", "push", "qty", "quantity", "quantityCount", "quantityUnit", "quarters", "rating", "rawPayload", "rawWebhook", "reason", "receivedAt", "reconciliationNetAmount", "reconciliationOffset", "reconciliationStatus", "record", "recordId", "records", "reduce", "ref", "rejected", "rejected_by_company", "relatedAssetCostLogId", "repair", "repayments", "replace", "reportCount", "requiresApproval", "resolutionStatus", "resolveAttendanceAnomalyForDate", "resolveEmployeeShiftPolicy", "resolved", "resolvedPayrollPolicy", "respect", "responsibilitySalary", "responsibleEmployeeId", "revenue", "reviewOrdersByEmployee", "reviewReportsByEmployee", "reviewStars", "reviewSummary", "reviewerCount", "reviewerEmployeeId", "reviews", "reward", "role", "roleSalary", "roleSalaryComponents", "roleSalaryRows", "rose", "round", "rows", "salary", "salaryByDepartment", "salaryMonth", "salaryMonthDays", "salaryPolicyEffectiveFrom", "salaryPolicyHistory", "sales", "salesCustomerCount", "salesDebtBeforeReconcile", "salesEmpId", "salesEmployeeId", "salesLeaderCommissionPercent", "salesLeaderId", "salesManagerId", "salesOrderCount", "salesPersonId", "salesRevenue", "schemaVersion", "score", "scores", "secondaryPositions", "seconds", "sentAt", "sepay_customer_debt_intent", "sepay_payment_intent", "set", "setDate", "setHours", "setMonth", "settlementStatus", "severity", "shiftEnd", "shiftIsOvernight", "shiftLabel", "shiftName", "shiftPolicy", "shiftStart", "shipper", "shouldShowAssetHomeTile", "shouldShowSalesHomeStats", "show", "size", "skipDebt", "slate", "slice", "some", "sort", "source", "sourceAssetCostLogId", "sourceType", "sources", "split", "stars", "start", "startDate", "startsWith", "status", "statusLabel", "strengths", "string", "stringValue", "substring", "supersededAt", "supplier", "supplierCustomerId", "supplierName", "supplierPhone", "support", "supportSalary", "system", "targetEmployeeId", "targetRevenue", "tenantId", "test", "tieredBonus", "timeIn", "timeZone", "timestamp", "timestampValue", "tire", "title", "toDate", "toFixed", "toISOString", "toLowerCase", "toMillis", "toString", "toUpperCase", "todayAttendanceTiming", "todayRecord", "toll", "tone", "total", "totalAdvance", "totalAmount", "totalBonus", "totalEmployeePurchase", "totalKg", "totalPaid", "totalPenalty", "totalPurchaseDebt", "totalQuantity", "totalRepaid", "totalRevenue", "totalScore", "transactedAt", "transactionAt", "transactionDate", "transactionDateTime", "transactions", "trim", "type", "unapproved_leave", "unit", "unitPrice", "unpaid", "updatedAt", "valid", "validateEmployeeHomeScreenDto", "validated", "validationStatus", "value", "values", "vehicleBrand", "vehicleModel", "vehicleName", "vehiclePlate", "version", "versionNumber", "vi", "warn", "warning", "warnings", "weeks", "weight", "weightKg", "withSalesRevenueIndex", "work", "workDays", "workDaysOfficial", "workDaysProbation", "workRole", "workRoles", "year", "years"] } };
function projectEmployeeHomeSnapshot(scope, snapshot) {
  if (JSON.stringify(snapshot.fieldProjection) !== JSON.stringify(employeeHomeFieldProjection)) throw new TypeError("Unverified Home field projection.");
  const context = createEmployeeHomeFieldProjection(employeeHomeFieldProjection.fieldsByCollection);
  try {
    const helpers = { withSalesRevenueIndex, calculateMonthRevenue, isCashflowOfficial, resolveAttendanceAnomalyForDate, parseLooseMoneyValue, getAssetDisplayLabel, getAssetStatusLabel, formatShiftRangeLabel, formatAttendanceMomentForWorkDate, getAttendanceCompactSource, projectSourceRecord: (name, row) => Object.hasOwn(employeeHomeFieldProjection.fieldsByCollection, name) ? context.source(name, row) : row };
    const input = buildEmployeeHomeSnapshotInput(snapshot, scope, helpers);
    const model = buildEmployeeHomeScreenDto(buildEmployeeHomeScreenModel(input), input, helpers);
    context.assertVerified();
    return model;
  } finally {
    context.close();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildEmployeeHomeScreenModel,
  buildEmployeeReviewSummary,
  buildMonthKeyFromDate,
  buildSalaryDetails,
  calculateAttendanceTiming,
  calculateMonthRevenue,
  employeeHasPosition,
  employeeHomeFieldProjection,
  formatAttendanceMomentForWorkDate,
  formatShiftRangeLabel,
  getAssetCostTypeLabel,
  getAssetDisplayLabel,
  getAssetStatusLabel,
  getAttendanceCompactSource,
  getDateKeyFromAnyValue,
  getEmployeePositionLabel,
  getEntityTimestamp,
  getOrderSalesEmpId,
  getTodayString,
  isAssetAssignedToEmployee,
  isCashflowOfficial,
  isEmployeeDriverPosition,
  isEmployeeSalesPosition,
  normalizeAttendanceRecordForWorkDate,
  normalizeExpenseCategoryLabel,
  parseLooseMoneyValue,
  projectEmployeeHomeSnapshot,
  resolveAttendanceAnomalyForDate,
  resolveEmployeeShiftPolicy,
  validateEmployeeHomeScreenDto,
  withSalesRevenueIndex
});
