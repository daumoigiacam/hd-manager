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
  HOME_FEED_SOURCES: () => HOME_FEED_SOURCES,
  buildHomeProductDetail: () => buildHomeProductDetail,
  buildOrderDuplicateSignature: () => buildOrderDuplicateSignature,
  hasCompanyRolePermissionAction: () => hasCompanyRolePermissionAction,
  projectCompanyHome: () => projectCompanyHome,
  resolveCashflowDateKey: () => resolveCashflowDateKey
});
module.exports = __toCommonJS(stdin_exports);

// development/hd-manager/application/src/utils/businessDate.js
var NativeDate = globalThis.Date;
var OFFSET = 7 * 60 * 60 * 1e3;
var BusinessDate = class extends NativeDate {
  constructor(...args) {
    if (typeof args[0] === "string") args[0] = args[0].replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T");
    if (args.length >= 2) {
      super(NativeDate.UTC(...args) - OFFSET);
      return;
    }
    if (typeof args[0] === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(args[0])) args[0] += (args[0].includes("T") ? "" : "T00:00:00") + "+07:00";
    super(...args);
  }
  getTimezoneOffset() {
    return -420;
  }
  toLocaleString(locale, options) {
    return super.toLocaleString(locale, { timeZone: "Asia/Ho_Chi_Minh", ...options });
  }
  toLocaleDateString(locale, options) {
    return super.toLocaleDateString(locale, { timeZone: "Asia/Ho_Chi_Minh", ...options });
  }
  toLocaleTimeString(locale, options) {
    return super.toLocaleTimeString(locale, { timeZone: "Asia/Ho_Chi_Minh", ...options });
  }
};
for (const part of ["FullYear", "Month", "Date", "Day", "Hours", "Minutes", "Seconds", "Milliseconds"]) {
  Object.defineProperty(BusinessDate.prototype, "get" + part, { value: function() {
    return new NativeDate(this.getTime() + OFFSET)["getUTC" + part]();
  } });
  if (part !== "Day") Object.defineProperty(BusinessDate.prototype, "set" + part, { value: function(...args) {
    const view = new NativeDate(this.getTime() + OFFSET);
    view["setUTC" + part](...args);
    return this.setTime(view.getTime() - OFFSET);
  } });
}

// development/hd-manager/application/src/services/productPricingUnits.js
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

// development/hd-manager/application/src/utils/productMeasures.js
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

// development/hd-manager/application/src/services/adaptivePerformance.js
var policies = Object.freeze({
  conservative: Object.freeze({ mode: "conservative", workBudgetMs: 2, maxOperations: 512, searchRows: 8, cachePages: 20, readConcurrency: 1, overscan: 2, prefetch: 0, workerConcurrency: 1, backgroundDelayMs: 1500 }),
  balanced: Object.freeze({ mode: "balanced", workBudgetMs: 4, maxOperations: 2048, searchRows: 24, cachePages: 80, readConcurrency: 2, overscan: 4, prefetch: 1, workerConcurrency: 2, backgroundDelayMs: 500 })
});
var legacy = Object.freeze({ ...policies.balanced, mode: "disabled", maxOperations: 128, overscan: 2, prefetch: 0 });

// development/hd-manager/application/src/services/cooperativeProjection.js
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

// development/hd-manager/application/src/utils/customerLedgerIndex.js
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
function createCustomerIndex() {
  const datasets = /* @__PURE__ */ new WeakMap();
  let previous = /* @__PURE__ */ new Map();
  function* prepare(rows) {
    const cached = datasets.get(rows);
    if (cached) return cached;
    const index = /* @__PURE__ */ new Map();
    for (const row of rows) {
      yield;
      const id = `${row?.customerId || ""}`.trim();
      if (!id) continue;
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(row);
    }
    for (const [id, group] of index) {
      const old = previous.get(id);
      if (old?.length === group.length) {
        let equal = true;
        for (let i = 0; i < group.length; i++) {
          yield;
          if (group[i] !== old[i]) {
            equal = false;
            break;
          }
        }
        if (equal) index.set(id, old);
      }
    }
    previous = index;
    datasets.set(rows, index);
    return index;
  }
  return (rows, cooperative) => cooperative ? prepare(rows) : drain(prepare(rows));
}
function drain(iterator) {
  for (; ; ) {
    const next = iterator.next();
    if (next.done) return next.value;
  }
}
function createCustomerLedgerMapBuilder(buildLedger) {
  const indexOrders = createCustomerIndex();
  const indexPayments = createCustomerIndex();
  const ledgers = /* @__PURE__ */ new WeakMap();
  return (customers, orders, payments, dayKey, { cooperative = false } = {}) => {
    function* prepare() {
      const safeOrders = Array.isArray(orders) ? orders : EMPTY_ROWS;
      const safePayments = Array.isArray(payments) ? payments : EMPTY_ROWS;
      const ordersByCustomer = yield* indexOrders(safeOrders, true);
      const paymentsByCustomer = yield* indexPayments(safePayments, true);
      const entries = [];
      for (const customer of Array.isArray(customers) ? customers : []) {
        yield;
        if (!customer) continue;
        const id = `${customer.id || ""}`.trim();
        const customerOrders = ordersByCustomer.get(id) || EMPTY_ROWS;
        const customerPayments = paymentsByCustomer.get(id) || EMPTY_ROWS;
        let entry = ledgers.get(customer);
        if (!entry || entry.dayKey !== dayKey || entry.orders !== customerOrders || entry.payments !== customerPayments) {
          const prepared = buildLedger(
            customer,
            customerOrders,
            customerPayments,
            cooperative ? { cooperative: true, historyAlreadySelected: true } : void 0
          );
          const ledger = prepared && typeof prepared.next === "function" ? yield* prepared : prepared;
          entry = { dayKey, orders: customerOrders, payments: customerPayments, ledger };
          ledgers.set(customer, entry);
        }
        entries.push([customer.id, entry.ledger]);
      }
      return Object.fromEntries(entries);
    }
    return cooperative ? prepare() : drain(prepare());
  };
}

// development/hd-manager/application/src/features/customers/productCRMShared.jsx
var getLocalDateInputValue = (date = new BusinessDate()) => {
  const safeDate = date instanceof BusinessDate && !Number.isNaN(date.getTime()) ? date : new BusinessDate();
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
var getTodayString = () => getLocalDateInputValue(new BusinessDate());
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
var isOwnerPosition = (position = "") => normalizeEmployeePosition(position) === "Ch\u1EE7 doanh nghi\u1EC7p";
var isOwnerRoleValue = (value = "") => {
  const normalized = normalizeLookupText(value || "");
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) return false;
  return normalized === "super admin" || normalizeEmployeePosition(value) === "Ch\u1EE7 doanh nghi\u1EC7p" || ["superadmin", "owner", "companyowner", "businessowner", "owneraccount", "accountowner"].includes(compact) || ["business owner", "company owner", "owner account", "account owner", "chu doanh nghiep", "chu cong ty", "chu cua hang", "giam doc", "quan ly doanh nghiep"].includes(normalized);
};
var isOwnerAccountUser = (employee = null, currentUser = null) => currentUser?.role === "super_admin" || employee?.role === "super_admin" || currentUser?.isOwner === true || currentUser?.isCompanyOwner === true || employee?.isOwner === true || employee?.isCompanyOwner === true || isOwnerRoleValue(currentUser?.role) || isOwnerRoleValue(currentUser?.position) || isOwnerRoleValue(currentUser?.userRole) || isOwnerRoleValue(currentUser?.accountRole) || isOwnerRoleValue(employee?.role) || isOwnerPosition(employee?.position);
var isSalesPosition = (position = "") => ["Kinh doanh", SALES_COLLABORATOR_POSITION].includes(normalizeEmployeePosition(position));
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
var getSalesLeaderId = (employee = {}) => `${employee?.salesLeaderId || employee?.salesManagerId || employee?.parentSalesEmpId || employee?.managerEmpId || ""}`.trim();
var toTitleCase = (str) => {
  if (!str) return "";
  return str.toLowerCase().split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};
var viNumberFormatter = new Intl.NumberFormat("vi-VN");
var parseInputCurrency = (val) => {
  if (val === "" || val === void 0 || val === null) return "";
  const num = parseInt(val.toString().replace(/\D/g, ""), 10);
  return isNaN(num) ? "" : num;
};
var formatCurrency = (amount) => {
  if (amount === void 0 || amount === null || isNaN(amount)) return "0";
  return viNumberFormatter.format(Math.round(Number(amount) || 0));
};
var roundMoneyValue = (amount) => {
  if (amount === void 0 || amount === null || Number.isNaN(Number(amount))) return 0;
  return Math.round(Number(amount) || 0);
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
  const normalized = new BusinessDate(date.getTime() - date.getTimezoneOffset() * 6e4);
  return normalized.toISOString().split("T")[0];
};
var compareLedgerItems = (a, b, sortKeys = null) => {
  const keyFor = (item) => {
    if (sortKeys?.has(item)) return sortKeys.get(item);
    const dateKey3 = getPaymentDateKey(item) || getDateKeyFromAnyValue(item?.paymentDate || item?.transactionDate || item?.transactionDateTime || item?.paidAt || item?.transactionAt || item?.date || item?.createdAt || getEntityTimestamp(item));
    const key = { day: new BusinessDate(`${dateKey3 || "1970-01-01"}T00:00:00`).getTime(), timestamp: void 0 };
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
  const parsed = new BusinessDate(year, month - 1, day, hour, minute, second);
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
    if (parsedDate instanceof BusinessDate && !Number.isNaN(parsedDate.getTime())) return parsedDate.getTime();
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
    const parsed = new BusinessDate(normalized).getTime();
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
    const parsed = new BusinessDate(entity.date).getTime();
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
var resolveEntityDateKey = (entity = {}, fallbackDate = getTodayString()) => {
  const rawDate = `${entity?.date || entity?.requestDate || entity?.requestDateKey || entity?.orderRequestDate || entity?.sourceOrderRequestDate || entity?.dispatchDate || entity?.deliveryDate || ""}`.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  if (rawDate) {
    const parsedRawDate = new BusinessDate(rawDate);
    if (!Number.isNaN(parsedRawDate.getTime())) {
      return `${parsedRawDate.getFullYear()}-${String(parsedRawDate.getMonth() + 1).padStart(2, "0")}-${String(parsedRawDate.getDate()).padStart(2, "0")}`;
    }
  }
  const timestamp = getEntityTimestamp(entity);
  if (!timestamp) return fallbackDate;
  const parsedTimestamp = new BusinessDate(timestamp);
  return `${parsedTimestamp.getFullYear()}-${String(parsedTimestamp.getMonth() + 1).padStart(2, "0")}-${String(parsedTimestamp.getDate()).padStart(2, "0")}`;
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
      orders.push({
        ...order,
        appliedAmount: 0,
        creditApplied: 0,
        outstandingAmount: Math.max(0, order.amount || 0),
        allocations: []
      });
    }
    orders = cooperative ? yield* sortProjection(orders, compareCustomerLedgerItems) : orders.sort(compareCustomerLedgerItems);
    let payments = [];
    const customerPayments = historyAlreadySelected ? allPayments : selectCustomerHistoryRows(allPayments, customerId);
    for (const payment of customerPayments) {
      yield;
      if (payment.customerId !== customerId || payment.isArchived || !isCashflowOfficial(payment)) continue;
      payments.push({ ...payment, appliedAmount: 0, overpaidAmount: 0, allocations: [] });
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
      orderDetails.push({
        ...order,
        outstandingAmount: Math.max(0, order.outstandingAmount),
        status: order.outstandingAmount <= 0 ? "paid" : order.appliedAmount > 0 ? "partial" : "unpaid"
      });
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
var indexedCustomerLedgerMap = createCustomerLedgerMapBuilder(buildCustomerLedger);
var buildCustomerLedgerMap = (customers = [], orders = [], payments = [], options = {}) => indexedCustomerLedgerMap(customers, orders, payments, getTodayString(), options);
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
    const amount = roundMoneyValue(item.amount != null || item.totalAmount != null || item.value != null || item.total != null ? rawAmount : purchaseAmount({ ...item, totalKg, quantity: parseLooseQuantityValue(item.quantity), unitPrice }, item.purchaseUnit || "Kg"));
    return { ...item, amount };
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
  return {
    ...ledger,
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
  };
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
var buildCustomerReconciledLedgerMap = (customers = [], orders = [], payments = [], warehouseImports = [], expenses = [], { cooperative = false } = {}) => {
  function* calculate() {
    const preparedSales = buildCustomerLedgerMap(customers, orders, payments, { cooperative });
    const salesLedgers = cooperative ? yield* preparedSales : preparedSales;
    yield;
    const importsByCustomerId = /* @__PURE__ */ new Map();
    const importsByPhone = /* @__PURE__ */ new Map();
    const importsByName = /* @__PURE__ */ new Map();
    const repaymentsByCustomer = /* @__PURE__ */ new Map();
    for (const item of expenses) {
      yield;
      if (!item || item.isArchived || item.sourceType !== "customer_debt_repayment") continue;
      if (!repaymentsByCustomer.has(item.customerId)) repaymentsByCustomer.set(item.customerId, []);
      repaymentsByCustomer.get(item.customerId).push(item);
    }
    const addImport = (index, key, item) => {
      if (!key) return;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(item);
    };
    for (const item of Array.isArray(warehouseImports) ? warehouseImports : []) {
      yield;
      if (!item || item.isArchived) continue;
      addImport(importsByCustomerId, `${item.supplierCustomerId || item.linkedCustomerId || item.customerId || ""}`.trim(), item);
      addImport(importsByPhone, normalizeCustomerPhone(item.supplierPhone || item.phone || item.customerPhone || ""), item);
      addImport(importsByName, normalizeLookupText(item.supplier || item.supplierName || item.customerName || item.customerNameSnapshot || ""), item);
    }
    const entries = [];
    for (const customer of Array.isArray(customers) ? customers : []) {
      yield;
      if (!customer) continue;
      const customerId = `${customer.id || ""}`.trim();
      const phone = normalizeCustomerPhone(customer.phone || customer.phoneNumber || "");
      const name = normalizeLookupText(getCustomerDisplayName(customer) || customer.name || "");
      const matchedImports = [.../* @__PURE__ */ new Set([
        ...importsByCustomerId.get(customerId) || [],
        ...importsByPhone.get(phone) || [],
        ...importsByName.get(name) || []
      ])];
      const purchaseLedger = buildCustomerSupplierPurchaseLedger(customer, matchedImports);
      entries.push([customer.id, applyCustomerSupplierReconciliation(
        salesLedgers[customer.id],
        purchaseLedger,
        getCustomerDebtRepayments(customer, repaymentsByCustomer.get(customer.id) || [])
      )]);
    }
    return Object.fromEntries(entries);
  }
  const iterator = calculate();
  if (cooperative) return iterator;
  for (; ; ) {
    const next = iterator.next();
    if (next.done) return next.value;
  }
};
var getDateKeyFromAnyValue = (value = "") => {
  if (!value) return "";
  if (value instanceof BusinessDate) return Number.isNaN(value.getTime()) ? "" : toDateInputString(value);
  if (typeof value === "number" && Number.isFinite(value)) return toDateInputString(new BusinessDate(value));
  if (typeof value?.toDate === "function") {
    const parsedDate = value.toDate();
    return parsedDate instanceof BusinessDate && !Number.isNaN(parsedDate.getTime()) ? toDateInputString(parsedDate) : "";
  }
  if (typeof value === "object") {
    const timestamp = parseEntityTimestampValue(value);
    return timestamp ? toDateInputString(new BusinessDate(timestamp)) : "";
  }
  const raw = `${value || ""}`.trim();
  const directDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  if (directDate) return directDate;
  const vietnameseTimestamp = parseVietnameseDateTimeString(raw);
  if (vietnameseTimestamp) return toDateInputString(new BusinessDate(vietnameseTimestamp));
  const parsed = new BusinessDate(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toDateInputString(parsed);
};
var isPayosPaymentRecord = (payment = {}) => {
  const providerText = `${payment.paymentProvider || payment.sourceType || payment.method || payment.paymentMethod || payment.sourceLabel || ""}`.toLowerCase();
  return providerText.includes("sepay") || providerText.includes("payos");
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
var getPaymentTimestamp = (payment = {}) => parseEntityTimestampValue(getPaymentDateSource(payment)) || getEntityTimestamp(payment) || (getPaymentDateKey(payment) ? new BusinessDate(`${getPaymentDateKey(payment)}T12:00:00`).getTime() : 0);

// development/hd-manager/application/src/utils/payrollPolicyHistory.js
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
var getMonthBounds = (monthKey2 = "") => {
  const match = `${monthKey2 || ""}`.match(/^(\d{4})-(\d{2})$/);
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
var resolvePolicyFromHistory = (history = [], monthKey2 = "") => {
  const { start, end } = getMonthBounds(monthKey2);
  if (!start || !end) return history[history.length - 1] || null;
  const matchingPolicies = history.filter((policy) => !policy.supersededAt && policy.effectiveFrom <= end && (!policy.effectiveTo || policy.effectiveTo >= start));
  return matchingPolicies[matchingPolicies.length - 1] || null;
};
var resolveEmployeePayrollPolicy = (employee = {}, monthKey2 = "") => {
  const history = getEmployeePayrollPolicyHistory(employee);
  return resolvePolicyFromHistory(history, monthKey2) || history[0] || null;
};
var applyEmployeePayrollPolicyForMonth = (employee = {}, monthKey2 = "") => {
  const policy = resolveEmployeePayrollPolicy(employee, monthKey2);
  if (!policy) return employee;
  return {
    ...employee,
    ...cloneValue(policy.values),
    resolvedPayrollPolicy: cloneValue(policy),
    payrollPolicyVersion: policy.version,
    payrollPolicyEffectiveFrom: policy.effectiveFrom,
    payrollPolicyEffectiveTo: policy.effectiveTo || ""
  };
};

// development/hd-manager/application/src/utils/payrollSnapshotIntegrity.js
var PAYROLL_SNAPSHOT_INTEGRITY = Object.freeze({
  FULL: "FULL",
  LEGACY_NEEDS_REVIEW: "LEGACY_NEEDS_REVIEW",
  INVALID_NEEDS_REVIEW: "INVALID_NEEDS_REVIEW"
});

// development/hd-manager/application/src/utils/payrollPeriodLock.js
var MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
var PAYROLL_PERIOD_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  LOCKED: "LOCKED",
  ADJUSTED: "ADJUSTED"
});
var PAYROLL_AUTO_LOCK_PLAN_STATUS = Object.freeze({
  OPEN: "OPEN",
  CLOSING: "CLOSING",
  SNAPSHOT_VALIDATED: "SNAPSHOT_VALIDATED",
  READY_FOR_LOCK: "READY_FOR_LOCK",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  LOCKED: "LOCKED"
});
var normalizePayrollPeriodStatus = (status = "") => {
  const normalized = `${status || ""}`.trim().toUpperCase();
  const knownStatuses = (
    /** @type {string[]} */
    Object.values(PAYROLL_PERIOD_STATUS)
  );
  if (knownStatuses.includes(normalized)) return normalized;
  return ["CLOSED", "AUTO_LOCKED"].includes(normalized) ? PAYROLL_PERIOD_STATUS.LOCKED : PAYROLL_PERIOD_STATUS.DRAFT;
};
var isPayrollPeriodLocked = (periodOrStatus = "") => {
  const safePeriodOrStatus = (
    /** @type {any} */
    periodOrStatus
  );
  const status = safePeriodOrStatus && typeof safePeriodOrStatus === "object" ? safePeriodOrStatus.status : safePeriodOrStatus;
  const normalized = normalizePayrollPeriodStatus(status || "");
  return normalized === PAYROLL_PERIOD_STATUS.LOCKED || normalized === PAYROLL_PERIOD_STATUS.ADJUSTED;
};
var normalizePayrollMonthKey = (value = "") => {
  const raw = `${value || ""}`.trim();
  const match = raw.match(MONTH_KEY_PATTERN);
  if (!match) return "";
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : "";
};
var getLockedPayrollPeriod = (periods = [], companyId = "", monthKey2 = "") => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey2);
  return (Array.isArray(periods) ? periods : []).find((period) => period?.companyId === companyId && normalizePayrollMonthKey(period?.monthKey) === normalizedMonthKey && isPayrollPeriodLocked(period) && !period?.isArchived) || null;
};

// development/hd-manager/application/src/utils/employeeReviewSourceIndex.js
var orderFields = ["empId", "employeeId", "salesEmployeeId", "createdByEmpId", "createdBy", "ownerEmpId", "salesPersonId"];
var reportFields = ["empId", "employeeId", "driverId", "createdByEmpId", "createdBy"];
function indexRecords(records, fields) {
  const index = /* @__PURE__ */ new Map();
  for (const record of records || []) {
    const ids = new Set(fields.map((field) => `${record === void 0 ? "" : record[field] || ""}`).filter(Boolean));
    for (const id of ids) {
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(record);
    }
  }
  return index;
}
function buildEmployeeReviewSourceIndexes(orders, deliveryReports) {
  return { reviewOrdersByEmployee: indexRecords(orders, orderFields), reviewReportsByEmployee: indexRecords(deliveryReports, reportFields) };
}

// development/hd-manager/application/src/utils/employeeEvaluationAutomation.js
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
var inMonth = (value, monthKey2) => dateKey(value).startsWith(`${monthKey2}-`);
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
var uniqueByStableId = (items2 = []) => {
  const seen = /* @__PURE__ */ new Set();
  return (Array.isArray(items2) ? items2 : []).filter((item, index) => {
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
var collectLateMinutes = ({ entries, employeeId, companyId, monthKey: monthKey2, shiftPolicy } = {}) => {
  if (entries == null) return { status: "missing_data", value: null, records: [], details: [] };
  const filtered = uniqueByStableId(entries || []).filter((entry) => (!employeeId || getEmployeeId(entry) === text(employeeId)) && (!companyId || getCompanyId(entry) === text(companyId)) && (!monthKey2 || inMonth(getEventDate(entry), monthKey2)) && !Boolean(entry?.leave || entry?.isLeave || ["leave", "approved_leave", "unapproved_leave", "absent"].includes(text(entry?.status).toLowerCase()) || entry?.leaveType));
  const details = filtered.map((entry) => ({
    id: stableFingerprint(entry),
    date: dateKey(getEventDate(entry)),
    minutes: resolveLateMinutes(entry, shiftPolicy)
  }));
  if (details.some((item) => item.minutes === null)) return { status: "missing_data", value: null, records: filtered, details };
  return { status: "complete", value: details.reduce((sum, item) => sum + item.minutes, 0), records: filtered, details };
};
var collectLeaveDays = ({ entries, attendanceEntries, employeeId, companyId, monthKey: monthKey2 } = {}) => {
  const source = entries === void 0 ? attendanceEntries : entries;
  if (source == null) return { status: "missing_data", value: null, records: [], details: [] };
  const filtered = uniqueByStableId(source || []).filter((entry) => (!employeeId || getEmployeeId(entry) === text(employeeId)) && (!companyId || getCompanyId(entry) === text(companyId)) && (!monthKey2 || inMonth(getEventDate(entry), monthKey2)) && Boolean(entry?.leave || entry?.isLeave || ["leave", "approved_leave", "unapproved_leave", "absent"].includes(text(entry?.status).toLowerCase()) || entry?.leaveType));
  const days = [...new Set(filtered.map((item) => dateKey(getEventDate(item))).filter(Boolean))];
  return {
    status: "complete",
    value: days.length,
    records: filtered,
    details: days.map((date) => ({ date }))
  };
};
var collectValidatedComplaints = ({ complaints, employeeId, companyId, monthKey: monthKey2 } = {}) => {
  if (complaints == null) return { status: "missing_data", value: null, records: [], details: [] };
  const filtered = uniqueByStableId(complaints || []).filter((item) => {
    const status = text(item?.status ?? item?.resolutionStatus ?? item?.validationStatus).toLowerCase();
    const linkedEmployee = getEmployeeId(item);
    const linkedCompany = getCompanyId(item);
    return (!employeeId || linkedEmployee === text(employeeId)) && (!companyId || linkedCompany === text(companyId)) && (!monthKey2 || inMonth(getEventDate(item), monthKey2)) && VALID_COMPLAINT_STATUSES.has(status) && !REJECTED_COMPLAINT_STATUSES.has(status) && item?.isValid !== false && item?.isRejected !== true;
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
  monthKey: monthKey2 = "",
  attendanceEntries,
  leaveEntries,
  complaints,
  shiftPolicy = {}
} = {}) => {
  const normalizedMonthKey = normalizeMonthKey(monthKey2);
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
  monthKey: monthKey2 = "",
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
  const automaticItems = AUTOMATIC_EVALUATION_CRITERIA.map((criteria2) => automaticEvaluation?.criteria?.[criteria2.id] || {
    ...criteria2,
    source: "automatic",
    status: "missing_data",
    score: null,
    value: null,
    details: []
  });
  const criteria = [...manualItems, ...automaticItems];
  const missingData = criteria.filter((item) => item.status !== "complete").map((item) => item.id);
  const scores = Object.fromEntries(criteria.map((item) => [item.id, item.score]));
  const totalScore = missingData.length ? null : criteria.reduce((sum, item) => sum + item.score, 0);
  const exactAverage = totalScore === null ? null : totalScore / criteria.length;
  return {
    schemaVersion: AUTOMATIC_EVALUATION_SCHEMA_VERSION,
    employeeId: text(employeeId),
    companyId: text(companyId),
    monthKey: normalizeMonthKey(monthKey2),
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

// development/hd-manager/application/src/utils/payrollEvaluationBonus.js
var normalizeMonthKey2 = (value = "") => {
  const raw = `${value || ""}`.trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
};
var toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var hasEvaluationSourceData = (summary = {}) => {
  const peerCount = toFiniteNumber(summary?.peer?.count);
  const customerCount = toFiniteNumber(summary?.customer?.count);
  const system = summary?.system || {};
  return peerCount > 0 || customerCount > 0 || toFiniteNumber(system.workDays) > 0 || toFiniteNumber(system.revenue) > 0 || toFiniteNumber(system.deliveryCount) > 0;
};
var createEmptyPayrollEvaluationResult = ({ employeeId = "", monthKey: monthKey2 = "" } = {}) => ({
  employeeId: `${employeeId || ""}`,
  monthKey: normalizeMonthKey2(monthKey2),
  hasEvaluation: false,
  stars: 0,
  averageScore: 0,
  finalScore: 0,
  bonus: 0,
  note: "Chua co du lieu danh gia",
  status: "missing_data",
  criterionCount: 0,
  missingData: [],
  criteria: []
});
var projectEvaluationSummaryToPayroll = (summary, { employeeId = "", monthKey: monthKey2 = "" } = {}) => {
  const expectedEmployeeId = `${employeeId || ""}`;
  const expectedMonthKey = normalizeMonthKey2(monthKey2);
  const summaryEmployeeId = `${summary?.employee?.id || summary?.employeeId || ""}`;
  const summaryMonthKey = normalizeMonthKey2(summary?.monthKey);
  const emptyResult = createEmptyPayrollEvaluationResult({ employeeId: expectedEmployeeId, monthKey: expectedMonthKey });
  if (!summary || !expectedEmployeeId || !expectedMonthKey) return emptyResult;
  if (summaryEmployeeId !== expectedEmployeeId || summaryMonthKey !== expectedMonthKey) return emptyResult;
  const evaluationSummary13 = summary?.evaluationSummary13;
  if (evaluationSummary13) {
    const criterionCount = toFiniteNumber(evaluationSummary13.criterionCount);
    const missingData = Array.isArray(evaluationSummary13.missingData) ? evaluationSummary13.missingData : [];
    const isComplete = evaluationSummary13.status === "complete" && Number.isFinite(Number(evaluationSummary13.reward));
    if (!isComplete) {
      return {
        ...emptyResult,
        status: "needs_review",
        note: "Chua du du lieu danh gia",
        criterionCount,
        missingData,
        criteria: Array.isArray(evaluationSummary13.criteria) ? evaluationSummary13.criteria : [],
        schemaVersion: evaluationSummary13.schemaVersion,
        source: evaluationSummary13.source || "manual_and_automatic"
      };
    }
    const exactAverage = toFiniteNumber(
      evaluationSummary13.exactAverage ?? evaluationSummary13.displayAverage
    );
    const stars2 = Number.isFinite(Number(evaluationSummary13.exactAverage ?? evaluationSummary13.displayAverage)) ? getEvaluationStarsFromAverage(exactAverage) : normalizeEvaluationStars(evaluationSummary13.stars);
    return {
      employeeId: expectedEmployeeId,
      monthKey: expectedMonthKey,
      hasEvaluation: true,
      stars: stars2,
      averageScore: Math.max(0, exactAverage),
      // The amount is derived from the approved evaluation star value.
      finalScore: Math.max(0, toFiniteNumber(
        evaluationSummary13.finalScore ?? evaluationSummary13.totalScore
      )),
      bonus: getEvaluationReward(stars2),
      note: "",
      status: evaluationSummary13.status,
      criterionCount,
      missingData,
      criteria: Array.isArray(evaluationSummary13.criteria) ? evaluationSummary13.criteria : [],
      schemaVersion: evaluationSummary13.schemaVersion,
      source: evaluationSummary13.source || "manual_and_automatic"
    };
  }
  if (!hasEvaluationSourceData(summary)) return emptyResult;
  const stars = normalizeEvaluationStars(summary.stars ?? summary.finalCriteriaAverage);
  return {
    employeeId: expectedEmployeeId,
    monthKey: expectedMonthKey,
    hasEvaluation: true,
    stars,
    averageScore: Math.max(0, toFiniteNumber(summary.finalCriteriaAverage)),
    finalScore: Math.max(0, toFiniteNumber(summary.finalScore)),
    bonus: getEvaluationReward(stars),
    note: ""
  };
};
var applyEvaluationBonusToSalaryDetails = (salaryDetails, evaluationResult) => {
  if (!salaryDetails) return null;
  const evaluationBonus = evaluationResult?.hasEvaluation ? Math.max(0, Math.round(toFiniteNumber(evaluationResult.bonus))) : 0;
  return {
    ...salaryDetails,
    evaluationBonus,
    evaluationResult: evaluationResult || createEmptyPayrollEvaluationResult({
      employeeId: "",
      monthKey: salaryDetails.monthKey || ""
    }),
    grossSalary: Math.round(toFiniteNumber(salaryDetails.grossSalary) + evaluationBonus),
    netSalary: Math.round(toFiniteNumber(salaryDetails.netSalary) + evaluationBonus)
  };
};

// development/hd-manager/application/src/utils/attendanceWorkRoles.js
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
  return {
    ...employee,
    position,
    shiftName: component.shiftName || "",
    shiftStart: component.shiftStart || "",
    shiftEnd: component.shiftEnd || "",
    graceMinutes: component.graceMinutes,
    missingAlertMinutes: component.missingAlertMinutes
  };
}
function getWorkRoleMonthEntries(attendance, employee, position, monthKey2, calculateTiming) {
  const roleEmployee = employeeForWorkRole(employee, position);
  return Object.entries(attendance || {}).filter(([key, record]) => key.endsWith(`_${employee.id}`) && key.startsWith(`${monthKey2}-`) && (!record?.companyId || !employee.companyId || record.companyId === employee.companyId)).flatMap(([key, record]) => {
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
    return [{ ...entry, ...calculateTiming(roleEmployee, entry) }];
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

// development/hd-manager/application/src/utils/salaryAdvancePeriod.js
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
    const monthKey2 = normalizeMonthCandidate(candidate);
    if (monthKey2) return monthKey2;
  }
  return "";
};
var isSalaryAdvanceInMonth = (record = {}, monthKey2 = "") => {
  const expectedMonth = normalizeMonthCandidate(monthKey2);
  return Boolean(expectedMonth) && getSalaryAdvanceMonth(record) === expectedMonth;
};

// development/hd-manager/application/src/utils/salesRevenuePeriod.js
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
    const monthKey2 = normalizeSalesRevenueMonthKey(candidate);
    if (monthKey2) return monthKey2;
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
  monthKey: monthKey2 = ""
} = {}) => {
  const safeEmployeeId = normalizeId(employeeId);
  const safeMonthKey = normalizeSalesRevenueMonthKey(monthKey2);
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

// app-domain:domain
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
var isSalesCollaboratorPosition = (position = "") => normalizeEmployeePosition(position) === SALES_COLLABORATOR_POSITION;
var getSalesLeaderCommissionPercent = (employee = {}) => {
  const parsed = parseFloat(employee?.salesLeaderCommissionPercent ?? employee?.leaderCommissionPercent ?? employee?.managerCommissionPercent ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
var ROLE_PERMISSION_DEPARTMENTS = [
  { key: "owner", label: "Ch\u1EE7 doanh nghi\u1EC7p", positions: ["Ch\u1EE7 doanh nghi\u1EC7p"] },
  { key: "accounting", label: "K\u1EBF to\xE1n & nh\xE2n s\u1EF1", positions: ["K\u1EBF to\xE1n & nh\xE2n s\u1EF1"] },
  { key: "sales", label: "Kinh doanh / CTV", positions: ["Kinh doanh", SALES_COLLABORATOR_POSITION] },
  { key: "driver", label: "T\xE0i x\u1EBF", positions: ["T\xE0i x\u1EBF"] },
  { key: "production", label: "S\u1EA3n xu\u1EA5t", positions: ["S\u1EA3n xu\u1EA5t"] },
  { key: "warehouse", label: WAREHOUSE_EXPORT_POSITION, positions: [WAREHOUSE_EXPORT_POSITION] }
];
var ROLE_PERMISSION_MODULES = [
  {
    id: "home",
    group: "overview",
    label: "Qu\u1EA3n l\xFD t\u1ED5ng quan",
    description: "Xem m\xE0n h\xECnh \u0111i\u1EC1u h\xE0nh, s\u1ED1 li\u1EC7u nhanh, chu\xF4ng th\xF4ng b\xE1o v\xE0 n\xFAt qu\xE9t m\xE3.",
    actions: [
      { id: "view_dashboard", label: "Xem m\xE0n h\xECnh qu\u1EA3n l\xFD" },
      { id: "view_quick_report", label: "Xem b\xE1o c\xE1o nhanh" },
      { id: "view_dashboard_revenue_drilldown", label: "Xem chi ti\u1EBFt t\u1ED5ng thu theo s\u1EA3n ph\u1EA9m" },
      { id: "view_dashboard_expense_drilldown", label: "Xem chi ti\u1EBFt t\u1ED5ng chi theo lo\u1EA1i chi ph\xED" },
      { id: "change_dashboard_date", label: "\u0110\u1ED5i ng\xE0y xem qu\u1EA3n l\xFD" },
      { id: "view_notifications", label: "Xem chu\xF4ng th\xF4ng b\xE1o" },
      { id: "open_message_center", label: "M\u1EDF h\u1ED9p th\u01B0 / tin nh\u1EAFn" },
      { id: "scan_codes", label: "Qu\xE9t QR / m\xE3 v\u1EA1ch / m\xE3 s\u1EA3n ph\u1EA9m" },
      { id: "use_quick_actions", label: "D\xF9ng n\xFAt ph\xEDm t\u1EAFt nhanh" },
      { id: "show_floating_quick_action_button", label: "Hi\u1EC7n n\xFAt bong b\xF3ng +" },
      { id: "customize_quick_actions_by_role", label: "D\xF9ng ph\xEDm t\u1EAFt theo vai tr\xF2" },
      { id: "change_company_logo", label: "\u0110\u1ED5i logo t\u1EEB m\xE0n qu\u1EA3n l\xFD" },
      { id: "open_profile_from_header", label: "M\u1EDF h\u1ED3 s\u01A1 t\u1EEB t\xEAn / logo" }
    ],
    details: ["T\u1ED5ng quan doanh thu", "Chu\xF4ng th\xF4ng b\xE1o", "Qu\xE9t QR / m\xE3 v\u1EA1ch"]
  },
  {
    id: "executive_dashboard",
    group: "overview",
    label: "Trung T\xE2m \u0110i\u1EC1u H\xE0nh",
    description: "M\xE0n h\xECnh \u0111i\u1EC1u h\xE0nh d\xE0nh cho ch\u1EE7 doanh nghi\u1EC7p: KPI, t\xE0i ch\xEDnh, kinh doanh, v\u1EADn h\xE0nh v\xE0 c\u1EA3nh b\xE1o quan tr\u1ECDng.",
    actions: [
      { id: "view_executive_dashboard", label: "Xem trung t\xE2m \u0111i\u1EC1u h\xE0nh" },
      { id: "view_executive_kpis", label: "Xem KPI t\u1ED5ng quan" },
      { id: "view_executive_finance", label: "Xem t\xE0i ch\xEDnh \u0111i\u1EC1u h\xE0nh" },
      { id: "view_executive_business", label: "Xem kinh doanh \u0111i\u1EC1u h\xE0nh" },
      { id: "view_executive_operations", label: "Xem v\u1EADn h\xE0nh \u0111i\u1EC1u h\xE0nh" },
      { id: "view_executive_alerts", label: "Xem c\u1EA3nh b\xE1o \u0111i\u1EC1u h\xE0nh" },
      { id: "view_executive_insights", label: "Xem nh\u1EADn \u0111\u1ECBnh h\xF4m nay" }
    ],
    details: ["KPI \u0111i\u1EC1u h\xE0nh", "T\xE0i ch\xEDnh", "Kinh doanh", "V\u1EADn h\xE0nh", "C\u1EA3nh b\xE1o"]
  },
  {
    id: "messages",
    group: "overview",
    label: "Tin nh\u1EAFn / th\xF4ng b\xE1o",
    description: "H\u1ED9p th\u01B0 h\u1ED7 tr\u1EE3, chat n\u1ED9i b\u1ED9, th\xF4ng b\xE1o ri\xEAng t\u1EEBng t\xE0i kho\u1EA3n v\xE0 g\u1EEDi nhanh d\u1EEF li\u1EC7u trong app.",
    actions: [
      { id: "view_message_center", label: "Xem h\u1ED9p th\u01B0" },
      { id: "view_support_messages", label: "Xem tin h\u1ED7 tr\u1EE3 app" },
      { id: "send_support_messages", label: "G\u1EEDi ph\u1EA3n \xE1nh / h\u1ED7 tr\u1EE3 app" },
      { id: "view_internal_messages", label: "Xem tin nh\u1EAFn n\u1ED9i b\u1ED9" },
      { id: "send_internal_messages", label: "G\u1EEDi tin nh\u1EAFn n\u1ED9i b\u1ED9" },
      { id: "view_own_notifications", label: "Xem th\xF4ng b\xE1o c\u1EE7a ch\xEDnh t\xE0i kho\u1EA3n" },
      { id: "view_all_notifications", label: "Xem to\xE0n b\u1ED9 th\xF4ng b\xE1o c\xF4ng ty" },
      { id: "send_image_attachment", label: "G\u1EEDi h\xECnh \u1EA3nh" },
      { id: "send_contact_attachment", label: "G\u1EEDi danh b\u1EA1 / li\xEAn h\u1EC7" },
      { id: "send_location_attachment", label: "G\u1EEDi v\u1ECB tr\xED" },
      { id: "send_bank_qr_attachment", label: "G\u1EEDi s\u1ED1 t\xE0i kho\u1EA3n k\xE8m QR" },
      { id: "send_order_attachment", label: "G\u1EEDi \u0111\u01A1n h\xE0ng" },
      { id: "send_order_request_attachment", label: "G\u1EEDi \u0111\u01A1n \u0111\u1EB7t h\xE0ng" },
      { id: "send_report_attachment", label: "G\u1EEDi b\xE1o c\xE1o nhanh" },
      { id: "call_from_message", label: "G\u1ECDi \u0111i\u1EC7n t\u1EEB h\u1ED9i tho\u1EA1i" }
    ],
    details: ["H\u1ED7 tr\u1EE3", "N\u1ED9i b\u1ED9", "Th\xF4ng b\xE1o", "G\u1EEDi d\u1EEF li\u1EC7u nhanh"]
  },
  {
    id: "order_requests",
    group: "warehouse",
    label: "\u0110\u01A1n \u0111\u1EB7t h\xE0ng",
    description: "T\u1EA1o, xem, l\u1ECDc, s\u1EEDa, x\xF3a v\xE0 chia s\u1EBB danh s\xE1ch \u0111\u01A1n \u0111\u1EB7t h\xE0ng trong ng\xE0y.",
    actions: [
      { id: "view_order_requests", label: "Xem danh s\xE1ch \u0111\u01A1n \u0111\u1EB7t" },
      { id: "view_all_order_requests", label: "Xem \u0111\u01A1n \u0111\u1EB7t c\u1EE7a to\xE0n b\u1ED9 NVKD" },
      { id: "view_own_order_requests", label: "Ch\u1EC9 xem \u0111\u01A1n \u0111\u1EB7t c\u1EE7a m\xECnh / c\u1EA5p d\u01B0\u1EDBi" },
      { id: "change_order_request_date", label: "Ch\u1ECDn ng\xE0y xem \u0111\u01A1n \u0111\u1EB7t" },
      { id: "create_order_request", label: "L\xEAn \u0111\u01A1n \u0111\u1EB7t" },
      { id: "manual_order_request", label: "L\xEAn \u0111\u01A1n \u0111\u1EB7t th\u1EE7 c\xF4ng" },
      { id: "voice_order_request", label: "L\xEAn \u0111\u01A1n \u0111\u1EB7t b\u1EB1ng gi\u1ECDng n\xF3i" },
      { id: "select_order_request_customer", label: "Ch\u1ECDn / t\xECm kh\xE1ch khi l\xEAn \u0111\u01A1n \u0111\u1EB7t" },
      { id: "select_order_request_product", label: "Ch\u1ECDn / t\xECm s\u1EA3n ph\u1EA9m khi l\xEAn \u0111\u01A1n \u0111\u1EB7t" },
      { id: "use_customer_fixed_products", label: "\u01AFu ti\xEAn s\u1EA3n ph\u1EA9m c\u1ED1 \u0111\u1ECBnh c\u1EE7a kh\xE1ch" },
      { id: "use_product_short_name_in_order_request", label: "D\xF9ng t\xEAn vi\u1EBFt t\u1EAFt SP trong \u0111\u01A1n \u0111\u1EB7t" },
      { id: "select_product_attribute_in_order_request", label: "Ch\u1ECDn size / thu\u1ED9c t\xEDnh s\u1EA3n ph\u1EA9m" },
      { id: "show_order_request_note_in_product_cell", label: "Hi\u1EC3n th\u1ECB ghi ch\xFA trong \xF4 lo\u1EA1i h\xE0ng" },
      { id: "set_order_request_deposit", label: "Nh\u1EADp ti\u1EC1n c\u1ECDc \u0111\u01A1n \u0111\u1EB7t" },
      { id: "edit_order_request_quantity_unit", label: "S\u1EEDa s\u1ED1 l\u01B0\u1EE3ng / \u0111\u01A1n v\u1ECB \u0111\u1EB7t" },
      { id: "edit_order_request_size_price", label: "S\u1EEDa size / gi\xE1 \u0111\u01A1n \u0111\u1EB7t" },
      { id: "sync_order_price_to_customer_fixed_product", label: "\u0110\u1ED3ng b\u1ED9 gi\xE1 s\u1EEDa v\u1EC1 s\u1EA3n ph\u1EA9m c\u1ED1 \u0111\u1ECBnh" },
      { id: "edit_order_request_deposit", label: "S\u1EEDa ti\u1EC1n c\u1ECDc \u0111\u01A1n \u0111\u1EB7t" },
      { id: "edit_order_request", label: "S\u1EEDa \u0111\u01A1n \u0111\u1EB7t" },
      { id: "delete_order_request", label: "X\xF3a \u0111\u01A1n \u0111\u1EB7t" },
      { id: "prevent_duplicate_order_requests", label: "Ch\u1ED1ng t\u1EA1o tr\xF9ng \u0111\u01A1n \u0111\u1EB7t" },
      { id: "filter_order_requests", label: "L\u1ECDc \u0111\u01A1n \u0111\u1EB7t theo ng\xE0y / NVKD" },
      { id: "group_order_request_rows", label: "G\u1ED9p t\xEAn kh\xE1ch / s\u1EAFp x\u1EBFp theo lo\u1EA1i h\xE0ng" },
      { id: "show_group_totals_in_share", label: "Hi\u1EC3n th\u1ECB t\u1ED5ng theo nh\xF3m h\xE0ng khi chia s\u1EBB" },
      { id: "share_order_request_sheet", label: "Chia s\u1EBB b\u1EA3ng \u0111\u01A1n \u0111\u1EB7t" },
      { id: "download_order_request_sheet", label: "T\u1EA3i b\u1EA3ng \u0111\u01A1n \u0111\u1EB7t" }
    ],
    details: ["L\xEAn \u0111\u01A1n \u0111\u1EB7t", "S\u1EEDa / x\xF3a \u0111\u01A1n \u0111\u1EB7t", "L\u1ECDc theo ng\xE0y / NVKD", "Chia s\u1EBB Zalo"]
  },
  {
    id: "warehouse_dispatch",
    group: "warehouse",
    label: "Phi\u1EBFu xu\u1EA5t kho",
    description: "C\xE2n h\xE0ng, nh\u1EADp nhanh, s\u1EEDa d\xF2ng xu\u1EA5t v\xE0 \u0111\u1ED1i chi\u1EBFu \u0111\u01A1n \u0111\u1EB7t c\xF2n thi\u1EBFu.",
    actions: [
      { id: "view_warehouse_dispatch", label: "Xem phi\u1EBFu xu\u1EA5t kho" },
      { id: "create_warehouse_dispatch", label: "T\u1EA1o d\xF2ng xu\u1EA5t kho" },
      { id: "create_dispatch_without_order_request", label: "T\u1EA1o phi\u1EBFu xu\u1EA5t ngo\xE0i \u0111\u01A1n \u0111\u1EB7t" },
      { id: "manual_search_dispatch_customer", label: "B\u1EA5m \xF4 t\xEAn KH \u0111\u1EC3 t\xECm tr\u1EF1c ti\u1EBFp" },
      { id: "manual_search_dispatch_product", label: "B\u1EA5m \xF4 lo\u1EA1i h\xE0ng \u0111\u1EC3 t\xECm tr\u1EF1c ti\u1EBFp" },
      { id: "select_dispatch_order_date", label: "Ch\u1ECDn ng\xE0y \u0111\u01A1n \u0111\u1EB7t c\u1EA7n \u0111\xF3ng" },
      { id: "edit_dispatch_piece_count", label: "S\u1EEDa s\u1ED1 l\u01B0\u1EE3ng con / c\xE1i khi xu\u1EA5t kho" },
      { id: "edit_dispatch_weight", label: "S\u1EEDa s\u1ED1 kg / tr\u1ECDng l\u01B0\u1EE3ng xu\u1EA5t kho" },
      { id: "edit_dispatch_weight_entries", label: "Nh\u1EADp nhi\u1EC1u l\u1EA7n c\xE2n v\xE0 t\u1EF1 c\u1ED9ng kg" },
      { id: "assign_dispatch_driver", label: "Ch\u1EC9 \u0111\u1ECBnh t\xE0i x\u1EBF giao h\xE0ng" },
      { id: "match_dispatch_with_order_request", label: "\u0110\u1ED1i chi\u1EBFu phi\u1EBFu xu\u1EA5t v\u1EDBi \u0111\u01A1n \u0111\u1EB7t" },
      { id: "edit_warehouse_dispatch", label: "S\u1EEDa d\xF2ng xu\u1EA5t kho" },
      { id: "delete_warehouse_dispatch", label: "X\xF3a d\xF2ng xu\u1EA5t kho" },
      { id: "view_dispatch_shortage", label: "Xem \u0111\u1ED1i chi\u1EBFu \u0111\u01A1n c\xF2n thi\u1EBFu" },
      { id: "open_shortage_detail", label: "M\u1EDF chi ti\u1EBFt \u0111\u01A1n c\xF2n thi\u1EBFu" },
      { id: "update_shortage_after_dispatch", label: "C\u1EADp nh\u1EADt thi\u1EBFu \u0111\u01A1n sau khi giao b\xF9" },
      { id: "view_dispatch_history_calendar", label: "Xem l\u1ECBch s\u1EED xu\u1EA5t kho d\u1EA1ng l\u1ECBch" },
      { id: "open_dispatch_history_detail", label: "M\u1EDF chi ti\u1EBFt phi\u1EBFu xu\u1EA5t theo ng\xE0y" },
      { id: "edit_dispatch_history_detail", label: "S\u1EEDa phi\u1EBFu xu\u1EA5t trong l\u1ECBch s\u1EED" },
      { id: "delete_dispatch_history_detail", label: "X\xF3a l\u1ECBch s\u1EED xu\u1EA5t kho" },
      { id: "share_warehouse_dispatch", label: "Chia s\u1EBB b\u1EA3ng xu\u1EA5t kho" },
      { id: "change_warehouse_dispatch_date", label: "\u0110\u1ED5i ng\xE0y phi\u1EBFu xu\u1EA5t" }
    ],
    details: ["T\u1EA1o phi\u1EBFu xu\u1EA5t", "\u0110\u1ED1i chi\u1EBFu thi\u1EBFu \u0111\u01A1n", "S\u1EEDa / x\xF3a d\xF2ng c\xE2n", "Chia s\u1EBB phi\u1EBFu"]
  },
  {
    id: "warehouse_import",
    group: "warehouse",
    label: "Nh\u1EADp Xu\u1EA5t T\u1ED3n",
    description: "Ghi nh\u1EADn \u0111\u1EA7u v\xE0o theo nh\xF3m h\xE0ng, s\u1ED1 kg, s\u1ED1 l\u01B0\u1EE3ng, \u0111\u01A1n gi\xE1 v\xE0 th\xE0nh ti\u1EC1n \u0111\u1EC3 \u0111\u1ED1i chi\u1EBFu t\u1ED3n kho.",
    actions: [
      { id: "view_warehouse_import", label: "Xem danh s\xE1ch nh\u1EADp kho" },
      { id: "view_inventory_stock", label: "Xem b\u1EA3ng t\u1ED3n kho" },
      { id: "view_inventory_by_group", label: "Xem t\u1ED3n theo nh\xF3m h\xE0ng" },
      { id: "create_warehouse_import", label: "T\u1EA1o phi\u1EBFu nh\u1EADp kho" },
      { id: "edit_warehouse_import", label: "S\u1EEDa phi\u1EBFu nh\u1EADp kho" },
      { id: "delete_warehouse_import", label: "X\xF3a phi\u1EBFu nh\u1EADp kho" },
      { id: "edit_inventory_balance", label: "\u0110i\u1EC1u ch\u1EC9nh s\u1ED1 l\u01B0\u1EE3ng t\u1ED3n" },
      { id: "view_actual_inventory_stock", label: "Xem t\u1ED3n kho th\u1EF1c t\u1EBF" },
      { id: "create_actual_inventory_stock", label: "T\u1EA1o b\xE1o c\xE1o t\u1ED3n kho th\u1EF1c t\u1EBF" },
      { id: "edit_actual_inventory_stock", label: "S\u1EEDa b\xE1o c\xE1o t\u1ED3n kho th\u1EF1c t\u1EBF" },
      { id: "delete_actual_inventory_stock", label: "X\xF3a b\xE1o c\xE1o t\u1ED3n kho th\u1EF1c t\u1EBF" },
      { id: "record_actual_inventory_reason", label: "Ghi l\xFD do l\u1EC7ch t\u1ED3n th\u1EF1c t\u1EBF" },
      { id: "compare_actual_inventory_stock", label: "\u0110\u1ED1i chi\u1EBFu t\u1ED3n h\u1EC7 th\u1ED1ng v\u1EDBi t\u1ED3n th\u1EF1c t\u1EBF" },
      { id: "compare_import_dispatch_stock", label: "\u0110\u1ED1i chi\u1EBFu nh\u1EADp - xu\u1EA5t - t\u1ED3n" },
      { id: "filter_warehouse_import", label: "L\u1ECDc nh\u1EADp kho theo ng\xE0y / nh\xF3m" }
    ],
    details: ["Nh\u1EADp v\u1ECBt/g\xE0 s\u1ED1ng", "Nh\u1EADp v\u1EADt t\u01B0", "Theo d\xF5i gi\xE1 v\u1ED1n \u0111\u1EA7u v\xE0o", "\u0110\u1ED1i chi\u1EBFu t\u1ED3n"]
  },
  {
    id: "delivery_reports",
    group: "warehouse",
    label: "B\xE1o c\xE1o giao h\xE0ng",
    description: "T\xE0i x\u1EBF b\xE1o tr\u1ECDng l\u01B0\u1EE3ng th\u1EF1c t\u1EBF, \u1EA3nh c\xE2n l\u1EA1i v\xE0 c\u1EA3nh b\xE1o l\u1EC7ch phi\u1EBFu xu\u1EA5t kho.",
    actions: [
      { id: "create_delivery_report", label: "T\u1EA1o b\xE1o c\xE1o giao h\xE0ng" },
      { id: "create_delivery_report_without_dispatch", label: "B\xE1o c\xE1o tr\u01B0\u1EDBc khi c\xF3 phi\u1EBFu xu\u1EA5t" },
      { id: "edit_delivery_report", label: "S\u1EEDa b\xE1o c\xE1o giao h\xE0ng" },
      { id: "delete_delivery_report", label: "X\xF3a b\xE1o c\xE1o giao h\xE0ng" },
      { id: "view_delivery_reports", label: "Hi\u1EC3n th\u1ECB b\xE1o c\xE1o giao h\xE0ng" },
      { id: "view_all_delivery_reports", label: "Xem b\xE1o c\xE1o c\u1EE7a to\xE0n b\u1ED9 t\xE0i x\u1EBF" },
      { id: "view_own_delivery_reports", label: "Ch\u1EC9 xem b\xE1o c\xE1o c\u1EE7a m\xECnh" },
      { id: "view_dispatch_weight_in_report", label: "Xem s\u1ED1 kg phi\u1EBFu xu\u1EA5t trong b\xE1o c\xE1o" },
      { id: "edit_actual_delivery_quantity", label: "Nh\u1EADp s\u1ED1 l\u01B0\u1EE3ng th\u1EF1c t\u1EBF khi giao" },
      { id: "edit_actual_delivery_weight", label: "Nh\u1EADp tr\u1ECDng l\u01B0\u1EE3ng th\u1EF1c t\u1EBF khi giao" },
      { id: "view_delivery_discrepancies", label: "Xem c\u1EA3nh b\xE1o l\u1EC7ch c\xE2n" },
      { id: "resolve_delivery_discrepancies", label: "Ch\u1EA5p nh\u1EADn / t\u1EEB ch\u1ED1i c\u1EA3nh b\xE1o l\u1EC7ch c\xE2n" },
      { id: "charge_lost_goods_salary", label: "Tr\u1EEB l\u01B0\u01A1ng khi nh\xE2n vi\xEAn l\xE0m m\u1EA5t h\xE0ng" },
      { id: "upload_delivery_photo", label: "Ch\u1EE5p / t\u1EA3i \u1EA3nh c\xE2n l\u1EA1i" },
      { id: "delete_delivery_photo_after_5_days", label: "X\xF3a \u1EA3nh b\xE1o c\xE1o sau 5 ng\xE0y" },
      { id: "record_return_goods", label: "B\xE1o h\xE0ng tr\u1EA3 l\u1EA1i" },
      { id: "upload_return_goods_photo", label: "G\u1EEDi \u1EA3nh h\xE0ng tr\u1EA3 l\u1EA1i" },
      { id: "record_delivery_income", label: "Ghi nh\u1EADn ti\u1EC1n thu khi giao" },
      { id: "record_delivery_expense", label: "Ghi nh\u1EADn chi ph\xED khi giao" },
      { id: "handover_delivery_cashflow", label: "B\xE0n giao thu chi giao h\xE0ng" },
      { id: "approve_delivery_cashflow", label: "X\xE1c nh\u1EADn thu chi giao h\xE0ng" }
    ]
  },
  {
    id: "asset_management",
    group: "warehouse",
    label: "Qu\u1EA3n l\xFD t\xE0i s\u1EA3n",
    description: "Qu\u1EA3n l\xFD xe, b\xE0n giao t\xE0i x\u1EBF, nhi\xEAn li\u1EC7u, chi ph\xED v\u1EADn h\xE0nh, b\u1EA3o d\u01B0\u1EE1ng v\xE0 c\u1EA3nh b\xE1o b\u1EA5t th\u01B0\u1EDDng.",
    actions: [
      { id: "view_asset_management", label: "Xem module qu\u1EA3n l\xFD t\xE0i s\u1EA3n" },
      { id: "view_assets", label: "Xem danh s\xE1ch t\xE0i s\u1EA3n / xe" },
      { id: "create_asset", label: "T\u1EA1o t\xE0i s\u1EA3n / xe m\u1EDBi" },
      { id: "edit_asset", label: "S\u1EEDa th\xF4ng tin t\xE0i s\u1EA3n / xe" },
      { id: "delete_asset", label: "X\xF3a / ng\u1EEBng s\u1EED d\u1EE5ng t\xE0i s\u1EA3n" },
      { id: "manage_asset_handover", label: "B\xE0n giao xe cho t\xE0i x\u1EBF" },
      { id: "view_asset_cost_logs", label: "Xem nh\u1EADt k\xFD chi ph\xED xe" },
      { id: "create_asset_cost_log", label: "T\u1EA1o nh\u1EADt k\xFD \u0111\u1ED5 nhi\xEAn li\u1EC7u / chi ph\xED xe" },
      { id: "edit_asset_cost_log", label: "S\u1EEDa nh\u1EADt k\xFD chi ph\xED xe" },
      { id: "delete_asset_cost_log", label: "X\xF3a nh\u1EADt k\xFD chi ph\xED xe" },
      { id: "upload_asset_cost_images", label: "T\u1EA3i \u1EA3nh h\xF3a \u0111\u01A1n / \u0111\u1ED3ng h\u1ED3 km" },
      { id: "view_asset_dashboard", label: "Xem b\xE1o c\xE1o t\u1ED5ng qu\xE1t t\xE0i s\u1EA3n" },
      { id: "view_asset_warnings", label: "Xem c\u1EA3nh b\xE1o nhi\xEAn li\u1EC7u / b\u1EA3o d\u01B0\u1EE1ng" },
      { id: "view_driver_asset_score", label: "Xem \u0111i\u1EC3m qu\u1EA3n l\xFD xe c\u1EE7a t\xE0i x\u1EBF" }
    ],
    details: ["T\xE0i s\u1EA3n", "Nh\u1EADt k\xFD chi ph\xED", "B\xE1o c\xE1o t\u1ED5ng qu\xE1t", "C\u1EA3nh b\xE1o b\u1EA3o d\u01B0\u1EE1ng"]
  },
  {
    id: "orders",
    group: "sales",
    label: "\u0110\u01A1n h\xE0ng / h\xF3a \u0111\u01A1n",
    description: "T\u1EA1o h\xF3a \u0111\u01A1n th\u1EE7 c\xF4ng, l\u1EA5y t\u1EEB phi\u1EBFu xu\u1EA5t kho, ch\u1EC9nh s\u1EEDa v\xE0 chia s\u1EBB h\xF3a \u0111\u01A1n c\xF3 QR.",
    actions: [
      { id: "view_orders", label: "Ch\u1EC9 xem danh s\xE1ch & chi ti\u1EBFt \u0111\u01A1n" },
      { id: "create_manual_order", label: "L\xEAn \u0111\u01A1n th\u1EE7 c\xF4ng" },
      { id: "create_order_from_image", label: "L\xEAn \u0111\u01A1n b\u1EB1ng h\xECnh \u1EA3nh" },
      { id: "create_order_from_warehouse", label: "L\u1EA5y t\u1EEB phi\u1EBFu xu\u1EA5t kho" },
      { id: "create_order_from_previous_warehouse_date", label: "L\u1EA5y phi\u1EBFu xu\u1EA5t kho t\u1EEB ng\xE0y tr\u01B0\u1EDBc" },
      { id: "detect_duplicate_warehouse_orders", label: "C\u1EA3nh b\xE1o tr\xF9ng khi l\u1EA5y t\u1EEB xu\u1EA5t kho" },
      { id: "prevent_duplicate_orders", label: "Ch\u1ED1ng t\u1EA1o tr\xF9ng \u0111\u01A1n" },
      { id: "create_bulk_orders", label: "T\u1EA1o \u0111\u01A1n h\xE0ng lo\u1EA1t" },
      { id: "review_bulk_order_drafts", label: "R\xE0 so\xE1t \u0111\u01A1n nh\xE1p h\xE0ng lo\u1EA1t" },
      { id: "choose_order_creation_source", label: "Ch\u1ECDn ngu\u1ED3n t\u1EA1o \u0111\u01A1n" },
      { id: "choose_warehouse_order_date", label: "Ch\u1ECDn ng\xE0y phi\u1EBFu xu\u1EA5t \u0111\u1EC3 l\xEAn \u0111\u01A1n" },
      { id: "scan_notebook_image", label: "Ch\u1EE5p / ch\u1ECDn \u1EA3nh s\u1ED5 \u0111\u1EC3 \u0111\u1ECDc AI" },
      { id: "edit_order_customer_honorific", label: "D\xF9ng x\u01B0ng h\xF4 Anh/Ch\u1ECB khi t\u1EA1o h\xF3a \u0111\u01A1n" },
      { id: "edit_order_items", label: "S\u1EEDa th\xF4ng tin \u0111\u01A1n h\xE0ng" },
      { id: "edit_order_quantity_price", label: "S\u1EEDa s\u1ED1 l\u01B0\u1EE3ng / \u0111\u01A1n gi\xE1" },
      { id: "edit_order_paid_amount", label: "S\u1EEDa s\u1ED1 ti\u1EC1n \u0111\xE3 thu / ti\u1EC1n c\u1ECDc" },
      { id: "edit_order_fees", label: "S\u1EEDa ph\u1EE5 ph\xED / gi\u1EA3m gi\xE1" },
      { id: "edit_order_fee_detail", label: "Th\xEAm / s\u1EEDa ph\xED v\u1EADn chuy\u1EC3n, th\xF9ng x\u1ED1p" },
      { id: "hide_zero_order_finance_rows", label: "\u1EA8n d\xF2ng gi\u1EA3m gi\xE1 / ph\u1EE5 ph\xED b\u1EB1ng 0" },
      { id: "share_payment_qr", label: "Chia s\u1EBB h\xF3a \u0111\u01A1n QR" },
      { id: "auto_reconcile_qr_payment", label: "T\u1EF1 tr\u1EEB n\u1EE3 khi QR kh\u1EDBp m\xE3 \u0111\u01A1n" },
      { id: "filter_orders", label: "L\u1ECDc \u0111\u01A1n theo ng\xE0y / h\xE0ng / NVKD" },
      { id: "delete_order", label: "X\xF3a \u0111\u01A1n" }
    ]
  },
  {
    id: "customers",
    group: "sales",
    label: "Kh\xE1ch h\xE0ng",
    description: "Th\xEAm, s\u1EEDa, x\xF3a kh\xE1ch; nh\u1EADp Excel, l\u1EA5y danh b\u1EA1, g\u1EAFn s\u1EA3n ph\u1EA9m c\u1ED1 \u0111\u1ECBnh v\xE0 gi\xE1 ri\xEAng.",
    actions: [
      { id: "view_customers", label: "Xem danh s\xE1ch kh\xE1ch" },
      { id: "view_all_customers", label: "Xem to\xE0n b\u1ED9 kh\xE1ch h\xE0ng" },
      { id: "view_assigned_customers", label: "Ch\u1EC9 xem kh\xE1ch \u0111\u01B0\u1EE3c ph\u1EE5 tr\xE1ch" },
      { id: "view_customer_phone", label: "Xem s\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xE1ch" },
      { id: "copy_customer_phone", label: "Sao ch\xE9p s\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xE1ch" },
      { id: "call_customer_phone", label: "B\u1EA5m g\u1ECDi \u0111i\u1EC7n cho kh\xE1ch" },
      { id: "view_customer_location", label: "Xem v\u1ECB tr\xED / \u0111\u1ECBa ch\u1EC9 kh\xE1ch" },
      { id: "open_customer_maps", label: "M\u1EDF Maps theo v\u1ECB tr\xED kh\xE1ch" },
      { id: "copy_customer_location", label: "Copy v\u1ECB tr\xED / \u0111\u1ECBa ch\u1EC9 kh\xE1ch" },
      { id: "add_edit_customer", label: "Th\xEAm / s\u1EEDa kh\xE1ch h\xE0ng" },
      { id: "edit_customer_honorific", label: "S\u1EEDa x\u01B0ng h\xF4 Anh / Ch\u1ECB" },
      { id: "edit_customer_phone_address", label: "S\u1EEDa S\u0110T / \u0111\u1ECBa ch\u1EC9 kh\xE1ch" },
      { id: "edit_customer_location", label: "S\u1EEDa GPS / \u0111\u1ECBnh v\u1ECB kh\xE1ch" },
      { id: "delete_customer", label: "X\xF3a kh\xE1ch h\xE0ng" },
      { id: "import_customer_data", label: "Nh\u1EADp Excel / l\u1EA5y danh b\u1EA1" },
      { id: "detect_duplicate_customer_phone", label: "C\u1EA3nh b\xE1o tr\xF9ng s\u1ED1 \u0111i\u1EC7n tho\u1EA1i" },
      { id: "fixed_products", label: "G\u1EAFn s\u1EA3n ph\u1EA9m c\u1ED1 \u0111\u1ECBnh" },
      { id: "fixed_product_size_attribute", label: "C\u1EA5u h\xECnh size / thu\u1ED9c t\xEDnh SP c\u1ED1 \u0111\u1ECBnh" },
      { id: "customer_price_overrides", label: "Gi\xE1 ri\xEAng theo kh\xE1ch" },
      { id: "bulk_update_customer_prices", label: "C\u1EADp nh\u1EADt gi\xE1 ri\xEAng h\xE0ng lo\u1EA1t" },
      { id: "share_customer_quote", label: "Chia s\u1EBB b\xE1o gi\xE1 cho kh\xE1ch" },
      { id: "customer_debt_limit", label: "C\u1EA5u h\xECnh h\u1EA1n m\u1EE9c c\xF4ng n\u1EE3 kh\xE1ch" },
      { id: "view_customer_debt_limit_alerts", label: "Xem nh\xE3n ph\u1EA3i thu ti\u1EC1n ngay" },
      { id: "send_customer_debt_reminder", label: "Nh\u1EAFc n\u1EE3 kh\xE1ch h\xE0ng" },
      { id: "driver_debt_permission", label: "Ph\xE2n quy\u1EC1n t\xE0i x\u1EBF" },
      { id: "customer_loyalty_points", label: "T\xEDch \u0111i\u1EC3m kh\xE1ch h\xE0ng" },
      { id: "view_customer_loans", label: "Xem vay / tr\u1EA3 c\u1EE7a kh\xE1ch" },
      { id: "create_customer_loan", label: "T\u1EA1o phi\u1EBFu kh\xE1ch vay" },
      { id: "return_customer_loan", label: "Ghi nh\u1EADn kh\xE1ch tr\u1EA3 h\xE0ng" },
      { id: "edit_customer_loan", label: "Ch\u1EC9nh s\u1EEDa vay / tr\u1EA3" },
      { id: "delete_customer_loan", label: "X\xF3a phi\u1EBFu vay / tr\u1EA3" },
      { id: "view_customer_debt", label: "Xem c\xF4ng n\u1EE3 kh\xE1ch h\xE0ng" },
      { id: "view_customer_stats", label: "Xem th\u1ED1ng k\xEA doanh thu t\u1EEBng kh\xE1ch" },
      { id: "view_customer_order_history", label: "Xem l\u1ECBch s\u1EED \u0111\u01A1n h\xE0ng t\u1EEBng kh\xE1ch" },
      { id: "view_customer_payment_history", label: "Xem l\u1ECBch s\u1EED thanh to\xE1n t\u1EEBng kh\xE1ch" }
    ]
  },
  {
    id: "debt",
    group: "finance",
    label: "S\u1ED5 n\u1EE3",
    description: "Xem c\xF4ng n\u1EE3 kh\xE1ch h\xE0ng, l\u1ECBch s\u1EED \u0111\u01A1n, ghi nh\u1EADn thu ti\u1EC1n v\xE0 theo d\xF5i ti\u1EC1n d\u01B0.",
    actions: [
      { id: "view_debt", label: "Xem c\xF4ng n\u1EE3" },
      { id: "view_all_debt", label: "Xem c\xF4ng n\u1EE3 to\xE0n b\u1ED9 kh\xE1ch" },
      { id: "view_assigned_debt", label: "Xem c\xF4ng n\u1EE3 kh\xE1ch h\xE0ng m\xECnh qu\u1EA3n l\xFD" },
      { id: "record_payment", label: "Ghi nh\u1EADn thu ti\u1EC1n" },
      { id: "edit_debt", label: "Ch\u1EC9nh s\u1EEDa c\xF4ng n\u1EE3" },
      { id: "delete_debt", label: "X\xF3a c\xF4ng n\u1EE3" },
      { id: "edit_order_payment_from_debt", label: "S\u1EEDa ti\u1EC1n thu ngay trong s\u1ED5 n\u1EE3" },
      { id: "apply_deposit_to_debt", label: "T\u1EF1 tr\u1EEB ti\u1EC1n c\u1ECDc / ti\u1EC1n d\u01B0 v\xE0o c\xF4ng n\u1EE3" },
      { id: "view_debt_limit_alerts", label: "Xem c\u1EA3nh b\xE1o v\u01B0\u1EE3t h\u1EA1n m\u1EE9c" },
      { id: "manage_debt_limit_followup", label: "Nh\u1EAFc n\u1EE3 / t\u1EA1m ng\u01B0ng b\xE1n khi v\u01B0\u1EE3t h\u1EA1n m\u1EE9c" },
      { id: "payment_history", label: "L\u1ECBch s\u1EED thanh to\xE1n" },
      { id: "edit_payment_history", label: "S\u1EEDa / x\xF3a phi\u1EBFu thu" },
      { id: "surplus_and_deposit", label: "Ti\u1EC1n d\u01B0 / ti\u1EC1n c\u1ECDc" },
      { id: "share_debt", label: "Chia s\u1EBB c\xF4ng n\u1EE3" }
    ]
  },
  {
    id: "finance",
    group: "finance",
    label: "Thu chi",
    description: "T\u1EA1o kho\u1EA3n thu chi, s\u1EEDa/x\xF3a giao d\u1ECBch v\xE0 l\u1ECDc d\u1EEF li\u1EC7u theo ng\xE0y, tu\u1EA7n, th\xE1ng.",
    actions: [
      { id: "view_own_cashflow", label: "Ch\u1EC9 xem thu chi c\u1EE7a ch\xEDnh m\xECnh" },
      { id: "view_all_cashflow", label: "Xem to\xE0n b\u1ED9 thu chi" },
      { id: "view_cashflow_groups", label: "Xem nh\u1EADt k\xFD thu chi theo nh\xF3m lo\u1EA1i" },
      { id: "open_cashflow_group_detail", label: "M\u1EDF danh s\xE1ch phi\u1EBFu trong t\u1EEBng lo\u1EA1i thu chi" },
      { id: "create_income", label: "T\u1EA1o kho\u1EA3n thu" },
      { id: "create_expense", label: "T\u1EA1o kho\u1EA3n chi" },
      { id: "driver_quick_income", label: "T\xE0i x\u1EBF t\u1EA1o kho\u1EA3n thu nhanh" },
      { id: "driver_quick_expense", label: "T\xE0i x\u1EBF t\u1EA1o kho\u1EA3n chi nhanh" },
      { id: "edit_cashflow", label: "S\u1EEDa giao d\u1ECBch thu chi" },
      { id: "edit_income_voucher", label: "S\u1EEDa phi\u1EBFu thu" },
      { id: "edit_expense_voucher", label: "S\u1EEDa phi\u1EBFu chi" },
      { id: "approve_driver_cashflow", label: "X\xE1c nh\u1EADn thu chi nh\xE2n s\u1EF1 b\xE1o" },
      { id: "handover_driver_cashflow", label: "B\xE1o thu chi ch\u1EDD k\u1EBF to\xE1n duy\u1EC7t" },
      { id: "delete_cashflow", label: "X\xF3a giao d\u1ECBch thu chi" },
      { id: "delete_income_voucher", label: "X\xF3a phi\u1EBFu thu" },
      { id: "delete_expense_voucher", label: "X\xF3a phi\u1EBFu chi" },
      { id: "filter_cashflow", label: "L\u1ECDc thu chi" },
      { id: "auto_reconcile_bank", label: "\u0110\u1ED1i so\xE1t chuy\u1EC3n kho\u1EA3n ng\xE2n h\xE0ng" }
    ]
  },
  {
    id: "bank_payments",
    group: "finance",
    label: "Ng\xE2n h\xE0ng & Thanh to\xE1n",
    description: "Theo d\xF5i t\xE0i kho\u1EA3n ng\xE2n h\xE0ng kh\xE1ch, QR thanh to\xE1n, giao d\u1ECBch chuy\u1EC3n kho\u1EA3n v\xE0 \u0111\u1ED1i so\xE1t t\u1EF1 \u0111\u1ED9ng.",
    actions: [
      { id: "view_bank_payments", label: "Xem module Ng\xE2n h\xE0ng & Thanh to\xE1n" },
      { id: "view_customer_bank_accounts", label: "Xem t\xE0i kho\u1EA3n ng\xE2n h\xE0ng kh\xE1ch \u0111\xE3 li\xEAn k\u1EBFt" },
      { id: "manage_customer_bank_accounts", label: "Qu\u1EA3n l\xFD li\xEAn k\u1EBFt ng\xE2n h\xE0ng kh\xE1ch" },
      { id: "view_bank_transactions", label: "Xem giao d\u1ECBch ng\xE2n h\xE0ng" },
      { id: "reconcile_bank_transactions", label: "\u0110\u1ED1i so\xE1t / g\u1EAFn giao d\u1ECBch ng\xE2n h\xE0ng" },
      { id: "view_payment_qr_history", label: "Xem l\u1ECBch s\u1EED thanh to\xE1n QR" }
    ],
    details: ["T\xE0i kho\u1EA3n kh\xE1ch", "Giao d\u1ECBch ng\xE2n h\xE0ng", "\u0110\u1ED1i so\xE1t QR", "L\u1ECBch s\u1EED thanh to\xE1n"]
  },
  {
    id: "products",
    group: "sales",
    label: "S\u1EA3n ph\u1EA9m",
    description: "Qu\u1EA3n l\xFD danh m\u1EE5c s\u1EA3n ph\u1EA9m, \u0111\u01A1n v\u1ECB, gi\xE1 m\u1EB7c \u0111\u1ECBnh v\xE0 t\xECm ki\u1EBFm/l\u1ECDc s\u1EA3n ph\u1EA9m.",
    actions: [
      { id: "view_products", label: "Ch\u1EC9 \u0111\u01B0\u1EE3c xem s\u1EA3n ph\u1EA9m" },
      { id: "create_product", label: "Th\xEAm s\u1EA3n ph\u1EA9m" },
      { id: "edit_product", label: "S\u1EEDa s\u1EA3n ph\u1EA9m" },
      { id: "delete_product", label: "X\xF3a s\u1EA3n ph\u1EA9m" },
      { id: "archive_product", label: "\u1EA8n / kh\xF4i ph\u1EE5c s\u1EA3n ph\u1EA9m" },
      { id: "view_archived_products", label: "Xem s\u1EA3n ph\u1EA9m \u0111\xE3 \u1EA9n" },
      { id: "default_product_price", label: "Gi\xE1 m\u1EB7c \u0111\u1ECBnh" },
      { id: "product_short_name", label: "S\u1EEDa t\xEAn vi\u1EBFt t\u1EAFt SP" },
      { id: "product_attributes", label: "C\u1EA5u h\xECnh thu\u1ED9c t\xEDnh s\u1EA3n ph\u1EA9m" },
      { id: "product_size_options", label: "C\u1EA5u h\xECnh nhi\u1EC1u size cho s\u1EA3n ph\u1EA9m" },
      { id: "product_attribute_options", label: "C\u1EA5u h\xECnh nhi\u1EC1u thu\u1ED9c t\xEDnh cho s\u1EA3n ph\u1EA9m" },
      { id: "use_short_name_in_sharing", label: "D\xF9ng t\xEAn vi\u1EBFt t\u1EAFt khi chia s\u1EBB" },
      { id: "product_barcode_scan", label: "Qu\xE9t m\xE3 s\u1EA3n ph\u1EA9m" },
      { id: "manage_product_inventory", label: "C\u1EA5u h\xECnh t\u1ED3n kho s\u1EA3n ph\u1EA9m" },
      { id: "view_inventory_stock", label: "Xem t\u1ED3n kho s\u1EA3n ph\u1EA9m" },
      { id: "search_filter_products", label: "T\xECm ki\u1EBFm / l\u1ECDc" }
    ]
  },
  {
    id: "pricing",
    group: "finance",
    label: "Gi\xE1 c\u1EA3",
    description: "AI Pricing Engine: gi\xE1 \u0111\u1EA7u v\xE0o, hao h\u1EE5t, gi\xE1 v\u1ED1n, bi\xEAn l\u1EE3i nhu\u1EADn, gi\xE1 \u0111\u1EC1 xu\u1EA5t v\xE0 m\xF4 ph\u1ECFng.",
    actions: [
      { id: "view_pricing", label: "Xem module Gi\xE1 c\u1EA3" },
      { id: "view_today_price_table", label: "Xem b\u1EA3ng gi\xE1 h\xF4m nay" },
      { id: "edit_today_price_table", label: "Ch\u1EC9nh s\u1EEDa b\u1EA3ng gi\xE1 h\xF4m nay" },
      { id: "hide_today_price_group", label: "\u1EA8n / hi\u1EC7n nh\xF3m h\xE0ng trong b\u1EA3ng gi\xE1" },
      { id: "delete_pricing_data", label: "X\xF3a d\u1EEF li\u1EC7u gi\xE1" },
      { id: "manage_input_costs", label: "Khai b\xE1o gi\xE1 \u0111\u1EA7u v\xE0o / l\xF4 h\xE0ng" },
      { id: "manage_loss_standards", label: "C\u1EA5u h\xECnh \u0111\u1ECBnh m\u1EE9c hao h\u1EE5t" },
      { id: "manage_cutting_standards", label: "C\u1EA5u h\xECnh \u0111\u1ECBnh m\u1EE9c pha l\xF3c" },
      { id: "manage_product_formulas", label: "C\u1EA5u h\xECnh c\xF4ng th\u1EE9c s\u1EA3n ph\u1EA9m g\u1ED1c/ph\u1EE5" },
      { id: "manage_cost_allocation", label: "Ph\xE2n b\u1ED5 chi ph\xED s\u1EA3n xu\u1EA5t / qu\u1EA3n l\xFD / t\xE0i ch\xEDnh" },
      { id: "manage_margin_rules", label: "C\u1EA5u h\xECnh bi\xEAn l\u1EE3i nhu\u1EADn \u0111\u1ED9ng" },
      { id: "view_ai_price_suggestions", label: "Xem \u0111\u1EC1 xu\u1EA5t gi\xE1 AI" },
      { id: "run_pricing_sandbox", label: "Ch\u1EA1y m\xF4 ph\u1ECFng Pricing Sandbox" },
      { id: "approve_ai_price", label: "Duy\u1EC7t \xE1p d\u1EE5ng gi\xE1 AI \u0111\u1EC1 xu\u1EA5t" },
      { id: "auto_apply_ai_price", label: "Cho ph\xE9p AI Semi-Auto / Auto Pilot" }
    ],
    details: ["Gi\xE1 \u0111\u1EA7u v\xE0o", "Hao h\u1EE5t", "Pha l\xF3c", "Gi\xE1 v\u1ED1n", "Gi\xE1 \u0111\u1EC1 xu\u1EA5t", "Sandbox"]
  },
  {
    id: "price_quotes",
    group: "sales",
    label: "B\xE1o gi\xE1 h\xE0ng lo\u1EA1t",
    description: "C\u1EADp nh\u1EADt gi\xE1 ri\xEAng cho nhi\u1EC1u kh\xE1ch theo s\u1EA3n ph\u1EA9m c\u1ED1 \u0111\u1ECBnh v\xE0 g\u1EEDi th\xF4ng b\xE1o Zalo.",
    actions: [
      { id: "view_price_quotes", label: "M\u1EDF b\xE1o gi\xE1 h\xE0ng lo\u1EA1t" },
      { id: "quote_all_customers", label: "B\xE1o gi\xE1 cho to\xE0n b\u1ED9 kh\xE1ch h\xE0ng" },
      { id: "quote_assigned_customers", label: "Ch\u1EC9 b\xE1o gi\xE1 kh\xE1ch m\xECnh ph\u1EE5 tr\xE1ch" },
      { id: "select_quote_product", label: "Ch\u1ECDn s\u1EA3n ph\u1EA9m b\xE1o gi\xE1" },
      { id: "select_multiple_quote_customers", label: "Ch\u1ECDn nhi\u1EC1u kh\xE1ch h\xE0ng" },
      { id: "search_quote_customers", label: "T\xECm ki\u1EBFm kh\xE1ch trong b\xE1o gi\xE1" },
      { id: "apply_bulk_price", label: "\xC1p d\u1EE5ng gi\xE1 m\u1EDBi h\xE0ng lo\u1EA1t" },
      { id: "save_customer_price", label: "L\u01B0u gi\xE1 ri\xEAng t\u1EEBng kh\xE1ch" },
      { id: "send_zalo_quote_notice", label: "G\u1EEDi th\xF4ng b\xE1o Zalo" },
      { id: "send_bulk_quote_notice", label: "G\u1EEDi th\xF4ng b\xE1o b\xE1o gi\xE1 h\xE0ng lo\u1EA1t" },
      { id: "include_customer_debt_in_quote", label: "K\xE8m c\xF4ng n\u1EE3 trong tin b\xE1o gi\xE1" }
    ],
    details: ["Ch\u1ECDn s\u1EA3n ph\u1EA9m", "Tick nhi\u1EC1u kh\xE1ch", "\xC1p d\u1EE5ng gi\xE1 m\u1EDBi", "G\u1EEDi b\xE1o gi\xE1 Zalo"]
  },
  {
    id: "company_attendance",
    group: "people",
    label: "Ch\u1EA5m c\xF4ng",
    description: "Ch\u1EA5m c\xF4ng GPS/WiFi, xem l\u1ECBch s\u1EED c\xE1 nh\xE2n v\xE0 c\u1EA3nh b\xE1o thi\u1EBFu ch\u1EA5m c\xF4ng theo quy\u1EC1n.",
    actions: [
      { id: "check_in_out", label: "Ch\u1EA5m v\xE0o / ra" },
      { id: "accurate_gps", label: "GPS ch\xEDnh x\xE1c" },
      { id: "default_wifi", label: "WiFi m\u1EB7c \u0111\u1ECBnh" },
      { id: "scan_wifi_networks", label: "D\xF2 danh s\xE1ch WiFi hi\u1EC7n c\xF3" },
      { id: "view_attendance_location", label: "Xem v\u1ECB tr\xED ch\u1EA5m c\xF4ng GPS" },
      { id: "manage_attendance_settings", label: "C\xE0i \u0111\u1EB7t GPS / WiFi ch\u1EA5m c\xF4ng" },
      { id: "manage_fixed_attendance_location", label: "C\xE0i v\u1ECB tr\xED ch\u1EA5m c\xF4ng c\u1ED1 \u0111\u1ECBnh t\u1EEBng nh\xE2n s\u1EF1" },
      { id: "view_own_attendance", label: "Xem ch\u1EA5m c\xF4ng c\xE1 nh\xE2n" },
      { id: "view_all_attendance", label: "Xem ch\u1EA5m c\xF4ng to\xE0n b\u1ED9 nh\xE2n s\u1EF1" },
      { id: "edit_attendance", label: "S\u1EEDa ch\u1EA5m c\xF4ng" },
      { id: "missing_attendance_alerts", label: "C\u1EA3nh b\xE1o thi\u1EBFu c\xF4ng" },
      { id: "request_leave", label: "B\xE1o ngh\u1EC9" },
      { id: "request_proxy_attendance", label: "Nh\u1EDD ch\u1EA5m h\u1ED9" },
      { id: "approve_proxy_attendance", label: "Duy\u1EC7t / ch\u1EA5m h\u1ED9 nh\xE2n s\u1EF1" }
    ]
  },
  {
    id: "payroll",
    group: "people",
    label: "B\u1EA3ng l\u01B0\u01A1ng",
    description: "Xem l\u01B0\u01A1ng c\xE1 nh\xE2n ho\u1EB7c to\xE0n b\u1ED9 nh\xE2n vi\xEAn theo quy\u1EC1n, g\u1ED3m hoa h\u1ED3ng v\xE0 th\u01B0\u1EDFng ph\u1EA1t.",
    actions: [
      { id: "view_own_payroll", label: "Ch\u1EC9 xem l\u01B0\u01A1ng c\u1EE7a ch\xEDnh m\xECnh" },
      { id: "view_all_payroll", label: "Xem l\u01B0\u01A1ng to\xE0n b\u1ED9 nh\xE2n vi\xEAn" },
      { id: "view_commission", label: "Xem hoa h\u1ED3ng / doanh thu t\xEDnh l\u01B0\u01A1ng" },
      { id: "view_salary_advance", label: "Xem h\u1EA1n m\u1EE9c \u1EE9ng l\u01B0\u01A1ng" },
      { id: "create_salary_advance_request", label: "T\u1EA1o l\u1EC7nh \u1EE9ng l\u01B0\u01A1ng" },
      { id: "create_salary_advance_for_others", label: "T\u1EA1o l\u1EC7nh \u1EE9ng h\u1ED9 cho nh\xE2n s\u1EF1 kh\xE1c" },
      { id: "view_salary_advance_requests", label: "Xem l\u1EC7nh \u1EE9ng l\u01B0\u01A1ng ch\u1EDD duy\u1EC7t" },
      { id: "approve_salary_advance", label: "Duy\u1EC7t l\u1EC7nh \u1EE9ng l\u01B0\u01A1ng" },
      { id: "reject_salary_advance", label: "T\u1EEB ch\u1ED1i l\u1EC7nh \u1EE9ng l\u01B0\u01A1ng" },
      { id: "delete_salary_advance", label: "X\xF3a l\u1EC7nh \u1EE9ng l\u01B0\u01A1ng" },
      { id: "configure_salary_advance_limit", label: "C\u1EA5u h\xECnh % \u1EE9ng theo b\u1ED9 ph\u1EADn" },
      { id: "view_late_penalty_detail", label: "Xem ph\u1EA1t \u0111i mu\u1ED9n t\u1EF1 \u0111\u1ED9ng" },
      { id: "view_early_overtime_detail", label: "Xem t\u0103ng ca do \u0111i s\u1EDBm" },
      { id: "record_employee_purchase", label: "Ghi mua h\xE0ng nh\xE2n vi\xEAn \u0111\u1EC3 c\u1EA5n l\u01B0\u01A1ng" },
      { id: "edit_employee_purchase", label: "S\u1EEDa kho\u1EA3n mua h\xE0ng c\u1EA5n l\u01B0\u01A1ng" },
      { id: "delete_employee_purchase", label: "X\xF3a kho\u1EA3n mua h\xE0ng c\u1EA5n l\u01B0\u01A1ng" },
      { id: "add_bonus_penalty", label: "Th\xEAm th\u01B0\u1EDFng kh\xE1c / ph\u1EA1t vi ph\u1EA1m" },
      { id: "edit_bonus_penalty", label: "S\u1EEDa th\u01B0\u1EDFng / ph\u1EA1t \u0111\xE3 nh\u1EADp" },
      { id: "delete_bonus_penalty", label: "X\xF3a th\u01B0\u1EDFng / ph\u1EA1t \u0111\xE3 nh\u1EADp" },
      { id: "edit_overtime_performance", label: "Duy\u1EC7t t\u0103ng ca / hi\u1EC7u su\u1EA5t" },
      { id: "approve_advance", label: "Duy\u1EC7t t\u1EA1m \u1EE9ng" },
      { id: "view_salary_detail_records", label: "Xem chi ti\u1EBFt ch\u1EA5m c\xF4ng, \u1EE9ng, th\u01B0\u1EDFng, ph\u1EA1t" }
    ],
    details: ["L\u01B0\u01A1ng c\xE1 nh\xE2n", "L\u01B0\u01A1ng to\xE0n b\u1ED9", "Hoa h\u1ED3ng doanh thu", "\u1EE8ng / th\u01B0\u1EDFng / ph\u1EA1t"]
  },
  {
    id: "employees",
    group: "people",
    label: "Nh\xE2n s\u1EF1",
    description: "T\u1EA1o, s\u1EEDa, x\xF3a nh\xE2n s\u1EF1; c\u1EA5u h\xECnh b\u1ED9 ph\u1EADn, ca l\xE0m, l\u01B0\u01A1ng, hoa h\u1ED3ng v\xE0 c\u1EA5p d\u01B0\u1EDBi.",
    actions: [
      { id: "view_employees", label: "Xem danh s\xE1ch nh\xE2n s\u1EF1" },
      { id: "create_employee", label: "T\u1EA1o nh\xE2n s\u1EF1 m\u1EDBi" },
      { id: "edit_employee", label: "S\u1EEDa th\xF4ng tin nh\xE2n s\u1EF1" },
      { id: "manage_employee_documents", label: "Qu\u1EA3n l\xFD gi\u1EA5y t\u1EDD nh\xE2n s\u1EF1" },
      { id: "delete_employee", label: "X\xF3a nh\xE2n s\u1EF1" },
      { id: "edit_employee_salary_policy", label: "S\u1EEDa c\u1EA5u h\xECnh l\u01B0\u01A1ng / hoa h\u1ED3ng" },
      { id: "edit_employee_shift_policy", label: "S\u1EEDa ca l\xE0m / c\u1EA3nh b\xE1o ch\u1EA5m c\xF4ng" },
      { id: "edit_employee_late_penalty_policy", label: "S\u1EEDa m\u1ED1c ph\u1EA1t \u0111i mu\u1ED9n" },
      { id: "edit_employee_early_overtime_policy", label: "S\u1EEDa t\xEDnh \u0111i s\u1EDBm th\xE0nh t\u0103ng ca" },
      { id: "create_sales_collaborator", label: "T\u1EA1o c\u1ED9ng t\xE1c vi\xEAn kinh doanh" },
      { id: "assign_sales_leader", label: "G\xE1n c\u1EA5p tr\xEAn / c\u1EA5p d\u01B0\u1EDBi kinh doanh" }
    ],
    details: ["T\u1EA1o t\xE0i kho\u1EA3n", "S\u1EEDa / x\xF3a nh\xE2n s\u1EF1", "Ca l\xE0m / l\u01B0\u01A1ng", "C\u1EA5p d\u01B0\u1EDBi kinh doanh"],
    sensitive: true
  },
  {
    id: "employee_reviews",
    group: "people",
    label: "\u0110\xE1nh gi\xE1",
    description: "Module \u0111\xE1nh gi\xE1 \u0111a chi\u1EC1u b\u1EB1ng sao: app t\u1EF1 ch\u1EA5m, nh\xE2n vi\xEAn \u0111\xE1nh gi\xE1 \u1EA9n danh v\xE0 ph\u1EA3n h\u1ED3i kh\xE1ch h\xE0ng.",
    actions: [
      { id: "view_employee_reviews", label: "Xem module \u0111\xE1nh gi\xE1" },
      { id: "view_own_employee_reviews", label: "Xem \u0111\xE1nh gi\xE1 c\u1EE7a ch\xEDnh m\xECnh" },
      { id: "view_all_employee_reviews", label: "Xem \u0111\xE1nh gi\xE1 to\xE0n b\u1ED9 nh\xE2n s\u1EF1" },
      { id: "create_employee_review", label: "\u0110\xE1nh gi\xE1 \u1EA9n danh cho \u0111\u1ED3ng nghi\u1EC7p" },
      { id: "manage_employee_review_criteria", label: "S\u1EEDa 10 ti\xEAu ch\xED \u0111\xE1nh gi\xE1" },
      { id: "view_employee_review_radar", label: "Xem bi\u1EC3u \u0111\u1ED3 radar \u0111\xE1nh gi\xE1" }
    ],
    details: ["Radar 10 ti\xEAu ch\xED", "\u0110\xE1nh gi\xE1 \u1EA9n danh", "App t\u1EF1 ch\u1EA5m", "Kh\xE1ch h\xE0ng ph\u1EA3n h\u1ED3i"]
  },
  {
    id: "settings",
    group: "system",
    label: "C\xE0i \u0111\u1EB7t",
    description: "C\u1EA5u h\xECnh th\xF4ng tin c\xF4ng ty, t\xE0i kho\u1EA3n ng\xE2n h\xE0ng, QR, t\xEDch \u0111i\u1EC3m, WiFi v\xE0 reset d\u1EEF li\u1EC7u.",
    actions: [
      { id: "view_settings", label: "Xem c\xE0i \u0111\u1EB7t" },
      { id: "edit_company_profile", label: "S\u1EEDa h\u1ED3 s\u01A1 / logo c\xF4ng ty" },
      { id: "manage_bank_accounts", label: "C\xE0i t\xE0i kho\u1EA3n nh\u1EADn chuy\u1EC3n kho\u1EA3n" },
      { id: "manage_payment_qr", label: "C\xE0i QR thanh to\xE1n" },
      { id: "manage_loyalty_settings", label: "C\xE0i t\xEDch \u0111i\u1EC3m kh\xE1ch h\xE0ng" },
      { id: "manage_customer_care_reminders", label: "C\xE0i nh\u1EAFc ch\u0103m s\xF3c kh\xE1ch l\xE2u ch\u01B0a mua" },
      { id: "manage_attendance_wifi", label: "C\xE0i WiFi ch\u1EA5m c\xF4ng" },
      { id: "manage_warehouse_dispatch_settings", label: "C\xE0i t\u1EF1 h\u1EE7y \u0111\u01A1n \u0111\u1EB7t trong xu\u1EA5t kho" },
      { id: "manage_order_request_auto_cancel", label: "C\xE0i s\u1ED1 ng\xE0y t\u1EF1 h\u1EE7y \u0111\u01A1n \u0111\u1EB7t" },
      { id: "manage_quick_action_defaults", label: "C\u1EA5u h\xECnh ph\xEDm t\u1EAFt n\u1ED5i theo vai tr\xF2" },
      { id: "backup_data", label: "Sao l\u01B0u d\u1EEF li\u1EC7u" },
      { id: "restore_data", label: "Kh\xF4i ph\u1EE5c d\u1EEF li\u1EC7u" },
      { id: "backup_restore_data", label: "Sao l\u01B0u / kh\xF4i ph\u1EE5c d\u1EEF li\u1EC7u" },
      { id: "reset_selected_data_scopes", label: "Reset t\u1EEBng ph\u1EA1m vi d\u1EEF li\u1EC7u" },
      { id: "manage_bank_transactions", label: "Qu\u1EA3n l\xFD giao d\u1ECBch sao k\xEA ng\xE2n h\xE0ng" },
      { id: "manage_gemini_api", label: "C\u1EA5u h\xECnh AI / Gemini" },
      { id: "reset_company_data", label: "Reset d\u1EEF li\u1EC7u c\xF4ng ty" }
    ],
    details: ["T\xE0i kho\u1EA3n ng\xE2n h\xE0ng", "QR thanh to\xE1n", "T\xEDch \u0111i\u1EC3m", "Reset d\u1EEF li\u1EC7u"],
    sensitive: true
  },
  {
    id: "role_permissions",
    group: "system",
    label: "Vai tr\xF2 & ph\xE2n quy\u1EC1n",
    description: "B\u1EADt/t\u1EAFt quy\u1EC1n cho t\u1EEBng b\u1ED9 ph\u1EADn. \u0110\xE2y l\xE0 quy\u1EC1n r\u1EA5t nh\u1EA1y c\u1EA3m, n\xEAn ch\u1EC9 d\xE0nh cho ch\u1EE7 doanh nghi\u1EC7p.",
    actions: [
      { id: "view_role_permissions", label: "Xem m\u1EE5c vai tr\xF2" },
      { id: "manage_role_permissions", label: "L\u01B0u ph\xE2n quy\u1EC1n b\u1ED9 ph\u1EADn" },
      { id: "manage_employee_permission_override", label: "Ph\xE2n quy\u1EC1n ri\xEAng t\u1EEBng nh\xE2n s\u1EF1" },
      { id: "toggle_permission_groups", label: "M\u1EDF / \u0111\xF3ng nh\xF3m quy\u1EC1n nh\u1ECF" },
      { id: "manage_customer_identity_permissions", label: "Ph\xE2n quy\u1EC1n th\xF4ng tin \u0111\u1ECBnh danh kh\xE1ch" },
      { id: "manage_warehouse_voice_permissions", label: "Ph\xE2n quy\u1EC1n nh\u1EADp gi\u1ECDng n\xF3i xu\u1EA5t kho" },
      { id: "manage_message_permissions", label: "Ph\xE2n quy\u1EC1n tin nh\u1EAFn / th\xF4ng b\xE1o" },
      { id: "manage_cashflow_approval_permissions", label: "Ph\xE2n quy\u1EC1n duy\u1EC7t thu chi" },
      { id: "manage_sensitive_finance_permissions", label: "Ph\xE2n quy\u1EC1n d\u1EEF li\u1EC7u t\xE0i ch\xEDnh nh\u1EA1y c\u1EA3m" },
      { id: "reset_role_defaults", label: "Kh\xF4i ph\u1EE5c quy\u1EC1n m\u1EB7c \u0111\u1ECBnh" }
    ],
    details: ["Ph\xE2n quy\u1EC1n b\u1ED9 ph\u1EADn", "B\u1EADt / t\u1EAFt module", "Kh\xF4i ph\u1EE5c m\u1EB7c \u0111\u1ECBnh", "\u0110\u1ED3ng b\u1ED9 cloud"],
    sensitive: true
  },
  {
    id: "billing",
    group: "system",
    label: "G\xF3i c\u01B0\u1EDBc",
    description: "Xem v\xE0 qu\u1EA3n l\xFD g\xF3i s\u1EED d\u1EE5ng, h\u1EA1n d\xF9ng v\xE0 tr\u1EA1ng th\xE1i k\xEDch ho\u1EA1t c\u1EE7a c\xF4ng ty.",
    actions: [
      { id: "view_billing", label: "Xem g\xF3i c\u01B0\u1EDBc" },
      { id: "manage_billing", label: "Qu\u1EA3n l\xFD / gia h\u1EA1n g\xF3i c\u01B0\u1EDBc" }
    ],
    details: ["G\xF3i hi\u1EC7n t\u1EA1i", "H\u1EA1n d\xF9ng", "Tr\u1EA1ng th\xE1i k\xEDch ho\u1EA1t"],
    sensitive: true
  }
];
var buildPermissionSet = (ids = []) => ROLE_PERMISSION_MODULES.reduce((acc, module2) => {
  acc[module2.id] = ids.includes(module2.id);
  return acc;
}, {});
var DEFAULT_ROLE_PERMISSIONS = {
  owner: buildPermissionSet(ROLE_PERMISSION_MODULES.map((module2) => module2.id)),
  accounting: buildPermissionSet(["home", "messages", "order_requests", "warehouse_import", "warehouse_dispatch", "delivery_reports", "asset_management", "orders", "customers", "debt", "finance", "bank_payments", "products", "pricing", "price_quotes", "company_attendance", "payroll", "employees", "employee_reviews", "settings"]),
  sales: buildPermissionSet(["home", "messages", "order_requests", "orders", "customers", "debt", "pricing", "price_quotes", "company_attendance", "payroll", "employee_reviews"]),
  driver: buildPermissionSet(["home", "messages", "delivery_reports", "customers", "debt", "finance", "company_attendance", "payroll", "employee_reviews"]),
  production: buildPermissionSet(["home", "messages", "company_attendance", "payroll", "employee_reviews"]),
  warehouse: buildPermissionSet(["home", "messages", "order_requests", "warehouse_import", "warehouse_dispatch", "company_attendance", "payroll", "employee_reviews"])
};
var getRolePermissionActionItems = (module2 = {}) => module2.actions || (module2.details || []).map((label, index) => ({ id: `detail_${index}`, label }));
var buildPermissionActionSet = (enabledModuleIds = []) => ROLE_PERMISSION_MODULES.reduce((acc, module2) => {
  const moduleEnabled = enabledModuleIds === true || enabledModuleIds.includes(module2.id);
  acc[module2.id] = getRolePermissionActionItems(module2).reduce((actionAcc, action) => {
    actionAcc[action.id] = moduleEnabled;
    return actionAcc;
  }, {});
  return acc;
}, {});
var DEFAULT_ROLE_PERMISSION_ACTIONS = Object.entries(DEFAULT_ROLE_PERMISSIONS).reduce((acc, [departmentKey, permissionSet]) => {
  const enabledModuleIds = ROLE_PERMISSION_MODULES.filter((module2) => permissionSet?.[module2.id]).map((module2) => module2.id);
  acc[departmentKey] = buildPermissionActionSet(enabledModuleIds);
  return acc;
}, {});
var getEmployeeRolePermissionKey = (employee = null, currentUser = null) => {
  const position = normalizeEmployeePosition(employee?.position || "");
  if (isOwnerAccountUser(employee, currentUser)) return "owner";
  if (position === "K\u1EBF to\xE1n & nh\xE2n s\u1EF1") return "accounting";
  if (isSalesPosition(position)) return "sales";
  if (position === "T\xE0i x\u1EBF") return "driver";
  if (position === "S\u1EA3n xu\u1EA5t") return "production";
  if (position === WAREHOUSE_EXPORT_POSITION) return "warehouse";
  return "production";
};
var normalizePermissionSetForDepartment = (source = {}, departmentKey = "production") => {
  const defaults = DEFAULT_ROLE_PERMISSIONS[departmentKey] || {};
  return ROLE_PERMISSION_MODULES.reduce((moduleAcc, module2) => {
    moduleAcc[module2.id] = departmentKey === "owner" ? true : source?.[module2.id] !== void 0 ? Boolean(source[module2.id]) : Boolean(defaults[module2.id]);
    return moduleAcc;
  }, {});
};
var normalizeRolePermissions = (source = {}) => ROLE_PERMISSION_DEPARTMENTS.reduce((acc, department) => {
  acc[department.key] = normalizePermissionSetForDepartment(source?.[department.key] || {}, department.key);
  return acc;
}, {});
var normalizePermissionActionSetForDepartment = (source = {}, permissionSet = {}, departmentKey = "production") => {
  const defaults = DEFAULT_ROLE_PERMISSION_ACTIONS[departmentKey] || {};
  const normalizedPermissionSet = normalizePermissionSetForDepartment(permissionSet || {}, departmentKey);
  return ROLE_PERMISSION_MODULES.reduce((moduleAcc, module2) => {
    const incomingModuleActions = source?.[module2.id] || {};
    const defaultModuleActions = defaults?.[module2.id] || {};
    const moduleEnabled = departmentKey === "owner" || Boolean(normalizedPermissionSet?.[module2.id]);
    moduleAcc[module2.id] = getRolePermissionActionItems(module2).reduce((actionAcc, action) => {
      actionAcc[action.id] = departmentKey === "owner" ? true : incomingModuleActions[action.id] !== void 0 ? Boolean(incomingModuleActions[action.id]) : moduleEnabled ? defaultModuleActions[action.id] !== void 0 ? Boolean(defaultModuleActions[action.id]) : true : false;
      return actionAcc;
    }, {});
    return moduleAcc;
  }, {});
};
var normalizeRolePermissionActions = (source = {}, permissionSource = {}) => {
  const normalizedPermissions = normalizeRolePermissions(permissionSource || {});
  return ROLE_PERMISSION_DEPARTMENTS.reduce((acc, department) => {
    acc[department.key] = normalizePermissionActionSetForDepartment(
      source?.[department.key] || {},
      normalizedPermissions?.[department.key] || {},
      department.key
    );
    return acc;
  }, {});
};
var getCompanyRolePermissions = (company = null) => normalizeRolePermissions(company?.rolePermissions || {});
var getCompanyRolePermissionActions = (company = null) => normalizeRolePermissionActions(company?.rolePermissionActions || {}, company?.rolePermissions || {});
var getCompanyEffectiveRolePermissions = (company = null, employee = null, currentUser = null) => {
  const roleKey = getEmployeeRolePermissionKey(employee, currentUser);
  if (roleKey === "owner") return normalizePermissionSetForDepartment({}, "owner");
  const hasEmployeeOverride = Boolean(employee?.id && Object.prototype.hasOwnProperty.call(company?.employeeRolePermissions || {}, employee.id));
  if (hasEmployeeOverride) {
    return normalizePermissionSetForDepartment(company?.employeeRolePermissions?.[employee.id] || {}, roleKey);
  }
  return getCompanyRolePermissions(company)?.[roleKey] || normalizePermissionSetForDepartment({}, roleKey);
};
var getCompanyEffectiveRolePermissionActions = (company = null, employee = null, currentUser = null) => {
  const roleKey = getEmployeeRolePermissionKey(employee, currentUser);
  const permissions = getCompanyEffectiveRolePermissions(company, employee, currentUser);
  if (roleKey === "owner") return normalizePermissionActionSetForDepartment({}, permissions, "owner");
  const hasEmployeeOverride = Boolean(employee?.id && Object.prototype.hasOwnProperty.call(company?.employeeRolePermissions || {}, employee.id));
  if (hasEmployeeOverride) {
    return normalizePermissionActionSetForDepartment(company?.employeeRolePermissionActions?.[employee.id] || {}, permissions, roleKey);
  }
  return getCompanyRolePermissionActions(company)?.[roleKey] || normalizePermissionActionSetForDepartment({}, permissions, roleKey);
};
var hasCompanyRolePermissionAction = ({ company, employee, currentUser }, permissionId, actionId) => {
  if (!permissionId || !actionId) return false;
  const roleKey = getEmployeeRolePermissionKey(employee, currentUser);
  if (roleKey === "owner") return true;
  const permissionActions = getCompanyEffectiveRolePermissionActions(company, employee, currentUser);
  return Boolean(permissionActions?.[permissionId]?.[actionId]);
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
var resolveSalaryMonthDays = (employee = {}, monthKey2 = getTodayString().substring(0, 7)) => {
  const parsed = parseInt(employee?.salaryMonthDays, 10);
  return parsed > 0 ? parsed : getActualCalendarDaysInMonth(monthKey2);
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
    matchedTier: {
      ...matchedTier,
      maxLateMinutes: nextTier ? nextTier.lateMinutes - 1 : null
    }
  };
};
var parseAttendanceTimestamp = (value = null) => {
  if (!value) return null;
  const parsed = value instanceof BusinessDate ? value : new BusinessDate(value);
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
var parseDateInputValue = (dateStr) => {
  const parsed = new BusinessDate(`${dateStr || getTodayString()}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new BusinessDate(`${getTodayString()}T12:00:00`) : parsed;
};
var addMonthsClamped = (date, monthsToAdd = 0) => {
  const baseDate = new BusinessDate(date);
  const targetDay = baseDate.getDate();
  baseDate.setDate(1);
  baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
  const lastDayOfMonth = new BusinessDate(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
  baseDate.setDate(Math.min(targetDay, lastDayOfMonth));
  return baseDate;
};
var resolveProbationEndDate = (startDate, probationDuration = 0, probationUnit = "days") => {
  const durationValue = parseInt(probationDuration, 10);
  if (!startDate || Number.isNaN(durationValue) || durationValue <= 0) return null;
  const probationStart = parseDateInputValue(startDate);
  let probationExclusiveEnd = new BusinessDate(probationStart);
  if (probationUnit === "days") {
    probationExclusiveEnd.setDate(probationExclusiveEnd.getDate() + durationValue);
  } else if (probationUnit === "weeks") {
    probationExclusiveEnd.setDate(probationExclusiveEnd.getDate() + durationValue * 7);
  } else if (probationUnit === "months") {
    probationExclusiveEnd = addMonthsClamped(probationStart, durationValue);
  }
  const probationEndDate = new BusinessDate(probationExclusiveEnd);
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
var getPositionShiftDefaults = (position = "") => ({
  ...DEFAULT_SHIFT_POLICY,
  ...POSITION_SHIFT_DEFAULTS[normalizeEmployeePosition(position)] || {}
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
var buildShiftDateTime = (dateStr, timeStr) => new BusinessDate(`${dateStr}T${normalizeTimeInputValue(timeStr) || "00:00"}:00`);
var buildShiftRangeDateTimes = (dateStr, shiftStart = "08:00", shiftEnd = "17:00") => {
  const start = buildShiftDateTime(dateStr, shiftStart);
  const end = buildShiftDateTime(dateStr, shiftEnd);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && isOvernightShiftRange(shiftStart, shiftEnd)) {
    start.setDate(start.getDate() - 1);
  }
  return { start, end };
};
var getAttendanceLocalDateKey = (value) => {
  if (!(value instanceof BusinessDate) || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};
var getAttendanceDateKeyOffset = (dateStr, days = 0) => {
  const [year, month, day] = `${dateStr || ""}`.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return `${dateStr || ""}`;
  const date = new BusinessDate(year, month - 1, day, 12, 0, 0, 0);
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
    const normalized = new BusinessDate(parsed.getTime());
    normalized.setDate(normalized.getDate() - 1);
    return normalized;
  }
  if (field === "checkOut" && actualDateKey === nextDateKey && timeMinutes <= shiftEndMinutes) {
    const normalized = new BusinessDate(parsed.getTime());
    normalized.setDate(normalized.getDate() - 1);
    return normalized;
  }
  if (field === "checkIn" && actualDateKey === previousDateKey && timeMinutes >= shiftStartMinutes) return parsed;
  return parsed;
};
var normalizeAttendanceRecordForWorkDate = (record, employee = {}, workDate = "") => {
  if (!record || !workDate) return record;
  return {
    ...record,
    checkIn: record.checkIn ? normalizeAttendanceTimestampForWorkDate(record.checkIn, workDate, employee, "checkIn") : record.checkIn,
    checkOut: record.checkOut ? normalizeAttendanceTimestampForWorkDate(record.checkOut, workDate, employee, "checkOut") : record.checkOut
  };
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
var buildSalesDownlineCommissionRows = (leaderEmpId, employees = [], orders = [], customers = [], monthKey2 = getTodayString().substring(0, 7)) => {
  const leaderKey = `${leaderEmpId || ""}`.trim();
  if (!leaderKey) return [];
  return (employees || []).filter((employee) => !employee?.isArchived && employee.id !== leaderKey && isEmployeeSalesPosition(employee) && getSalesLeaderId(employee) === leaderKey).map((employee) => {
    const revenue = calculateRevenueForMonth(employee.id, orders, customers, monthKey2);
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
var getMonthEndDateInputValue = (monthKey2 = getTodayString().substring(0, 7)) => {
  const safeMonthKey = /^\d{4}-\d{2}$/.test(`${monthKey2}`) ? `${monthKey2}` : getTodayString().substring(0, 7);
  const [year, month] = safeMonthKey.split("-").map(Number);
  const lastDay = new BusinessDate(year, month, 0).getDate();
  return `${safeMonthKey}-${String(lastDay).padStart(2, "0")}`;
};
var getActualCalendarDaysInMonth = (monthKey2 = getTodayString().substring(0, 7)) => {
  const safeMonthKey = /^\d{4}-\d{2}$/.test(`${monthKey2}`) ? `${monthKey2}` : getTodayString().substring(0, 7);
  const [year, month] = safeMonthKey.split("-").map(Number);
  return new BusinessDate(year, month, 0).getDate();
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
var buildDashboardPayrollCostSteps = function* ({
  employees = [],
  attendance = {},
  financials = [],
  performance: performance2 = {},
  customers = [],
  orders = [],
  payments = [],
  holidays = [],
  now = new BusinessDate(),
  company = {},
  payrollPeriods = [],
  lockedPayroll = {},
  employeeReviews = [],
  deliveryReports = [],
  customerComplaints = null,
  attendanceLoaded = false,
  complaintsLoaded = false,
  monthRowsCache = null
} = {}) {
  const firstMonth = new BusinessDate(now.getFullYear(), Math.min(0, now.getMonth() - 11), 1);
  const lastMonth = new BusinessDate(now.getFullYear(), now.getMonth(), 1);
  const todayKey = getDateKeyFromAnyValue(now);
  const rows = [];
  const months = /* @__PURE__ */ new Map();
  for (let cursor = firstMonth; cursor <= lastMonth; cursor = new BusinessDate(cursor.getFullYear(), cursor.getMonth() + 1, 1)) months.set(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`, {});
  function* indexRows(name, source, keyFor, { undated = false, dayLimit = false } = {}) {
    for (const bucket of months.values()) bucket[name] = [];
    let operations = 0;
    for (const row of source) {
      const key = keyFor(row);
      if (undated && !key) {
        for (const bucket of months.values()) bucket[name].push(row);
      } else if (!dayLimit || key <= todayKey) {
        const bucket = months.get(key.slice(0, 7));
        if (bucket) bucket[name].push(row);
      }
      if (++operations % 16 === 0) yield;
    }
  }
  yield* indexRows("attendance", Object.entries(attendance), ([key]) => key.slice(0, 10), { dayLimit: true });
  yield* indexRows("financials", financials, (row) => getDateKeyFromAnyValue(row?.date), { undated: true, dayLimit: true });
  yield* indexRows("orders", orders, (row) => getDateKeyFromAnyValue(row.date || row.orderDate || row.createdAt), { dayLimit: true });
  yield* indexRows("delivery", deliveryReports, (row) => normalizeEmployeeReviewMonthKey(row.date || row.createdAt));
  yield* indexRows("reviews", employeeReviews, (row) => normalizeEmployeeReviewMonthKey(row.monthKey || row.date || row.createdAt));
  if (complaintsLoaded && Array.isArray(customerComplaints)) yield* indexRows("complaints", customerComplaints, (row) => row.companyId === company.id ? normalizeEmployeeReviewMonthKey(row.monthKey || row.date || row.createdAt) : "");
  for (let cursor = firstMonth; cursor <= lastMonth; cursor = new BusinessDate(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const monthKey2 = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    if (monthRowsCache?.has(monthKey2)) {
      rows.push(...monthRowsCache.get(monthKey2));
      yield;
      continue;
    }
    const monthRowStart = rows.length;
    const policyEmployees = employees.map((emp) => applyEmployeePayrollPolicyForMonth(emp, monthKey2));
    const bucket = months.get(monthKey2);
    const monthAttendance = Object.fromEntries(bucket.attendance);
    const monthFinancials = bucket.financials;
    const monthOrders = bucket.orders;
    const locked = getLockedPayrollPeriod(payrollPeriods, company.id, monthKey2);
    const snapshotRows = lockedPayroll[monthKey2]?.snapshots || [];
    const salaryEmployees = locked ? snapshotRows.map((snapshot) => ({ ...snapshot.employee, id: snapshot.employeeId })) : policyEmployees;
    const monthDeliveryReports = bucket.delivery;
    const monthReviews = bucket.reviews;
    const monthComplaints = complaintsLoaded && Array.isArray(customerComplaints) ? bucket.complaints : null;
    const evaluationContext = {
      attendance: monthAttendance,
      orders: monthOrders,
      deliveryReports: monthDeliveryReports,
      ...!locked ? buildEmployeeReviewSourceIndexes(monthOrders, monthDeliveryReports) : {},
      reviews: monthReviews,
      complaints: monthComplaints,
      attendanceLoaded,
      complaintsLoaded,
      companyId: company.id,
      currentCompany: company,
      criteriaList: getEmployeeReviewCriteriaList(company),
      monthKey: monthKey2
    };
    yield;
    for (const emp of salaryEmployees.filter((emp2) => emp2?.id && !emp2.isArchived && emp2.role !== "super_admin" && !isOwnerPosition(emp2.position))) {
      const details = locked ? snapshotRows.find((snapshot) => snapshot.employeeId === emp.id)?.salaryDetails : applyEvaluationBonusToSalaryDetails(
        buildSalaryDetails(emp.id, policyEmployees, monthAttendance, monthFinancials, performance2, customers, monthOrders, payments, holidays, monthKey2, { skipDebt: true }),
        projectEvaluationSummaryToPayroll(buildEmployeeReviewSummary(emp, evaluationContext), { employeeId: emp.id, monthKey: monthKey2 })
      );
      const amount = Math.max(0, roundMoneyValue((details?.grossSalary || 0) - (details?.totalPenalty || 0)));
      if (!amount) {
        yield;
        continue;
      }
      const earningDays = [...new Set((details.attendanceEntries || []).filter((entry) => (entry.status === "present" || entry.status === "late") && !entry.noSalaryDay && entry.date <= todayKey).map((entry) => entry.date))];
      const fallbackDate = monthKey2 === todayKey.slice(0, 7) ? todayKey : getDateKeyFromAnyValue(new BusinessDate(cursor.getFullYear(), cursor.getMonth() + 1, 0));
      const dates = earningDays.length ? earningDays : [fallbackDate];
      const baseAmount = Math.floor(amount / dates.length);
      dates.forEach((date, index) => rows.push({
        date,
        employeeId: emp.id,
        employeeName: emp.name,
        amount: index === dates.length - 1 ? amount - baseAmount * (dates.length - 1) : baseAmount
      }));
      yield;
    }
    if (monthRowsCache) monthRowsCache.set(monthKey2, rows.slice(monthRowStart));
  }
  return rows;
};
var buildDashboardPayrollCostRows = (options) => {
  const iterator = buildDashboardPayrollCostSteps(options);
  for (; ; ) {
    const step = iterator.next();
    if (step.done) return step.value;
  }
};
var buildDuplicateOrderItemKey = (item = {}) => {
  const productKey = `${item.productId || item.product_id || ""}`.trim() || normalizeLookupText(item.description || item.productName || item.productNameSnapshot || item.name || "");
  const attributeKey = normalizeLookupText(item.attributeLabel || item.productAttribute || item.attribute || "");
  const sizeKey = normalizeLookupText(item.sizeLabel || item.weightKg || item.size || "");
  const quantity = parseLooseQuantityValue(item.quantity ?? item.qty ?? item.quantityKg);
  const unitKey = normalizeLookupText(item.quantityUnit || item.unit || item.unitLabel || "");
  const unitPrice = parseLooseMoneyValue(item.unitPrice ?? item.price ?? item.unit_price_vnd ?? item.unit_price);
  if (!productKey && quantity <= 0 && unitPrice <= 0) return "";
  return [productKey, attributeKey, sizeKey, quantity.toFixed(3), unitKey, Math.round(unitPrice)].join(":");
};
var buildDuplicateOrderItemsKey = (items2 = []) => (Array.isArray(items2) ? items2 : []).map(buildDuplicateOrderItemKey).filter(Boolean).sort().join("|");
var buildOrderDuplicateSignature = (order = {}) => {
  const dispatchIds = Array.isArray(order.sourceDispatchIds) ? order.sourceDispatchIds.map((item) => `${item || ""}`.trim()).filter(Boolean).sort() : [];
  if (dispatchIds.length > 0) return `dispatch::${dispatchIds.join("|")}`;
  const customerKey = `${order.customerId || ""}`.trim() || normalizeLookupText(order.customerName || order.customerNameSnapshot || order.customer?.name || "");
  const branchKey = `${order.branchId || order.customerBranchId || ""}`.trim() || normalizeLookupText(order.branchName || order.customerBranchName || "");
  const dateKey3 = resolveEntityDateKey(order, order.date || getTodayString());
  const itemKey = buildDuplicateOrderItemsKey(order.items || []);
  const amountKey = Math.round(parseLooseMoneyValue(order.amount ?? order.totalAmount ?? order.grandTotal));
  return customerKey && itemKey ? `order::${dateKey3}::${customerKey}::${branchKey || "main"}::${itemKey}::${amountKey}` : "";
};
var getCustomerDebt = (customerOrId, allOrders, allPayments, warehouseImports = []) => buildCustomerReconciledLedger(customerOrId, allOrders, allPayments, warehouseImports).currentDebt;
var calculateRevenueForMonth = (empId, orders, customers = [], monthKey2 = getTodayString().substring(0, 7)) => {
  return calculateEmployeeSalesRevenueForMonth({
    employeeId: empId,
    orders,
    customers,
    monthKey: monthKey2
  });
};
var buildSalaryDetails = (empId, employees, attendance, financials, performance2, allCustomers = [], allOrders = [], allPayments = [], holidays = [], monthKey2 = getTodayString().substring(0, 7), options = {}) => {
  const emp = employees.find((e) => e.id === empId);
  if (!emp) return null;
  const isSalesCollaborator = isSalesCollaboratorPosition(emp.position);
  const monthlyPerformanceKey = `${monthKey2}_${empId}`;
  const legacyPerformance = performance2[empId] || {};
  const monthlyPerformance = performance2[monthlyPerformanceKey] || {};
  const perf = {
    ...legacyPerformance,
    ...monthlyPerformance,
    revenue: monthlyPerformance.revenue ?? legacyPerformance.revenue ?? 0,
    overtime: monthlyPerformance.overtime ?? legacyPerformance.overtime ?? 0
  };
  const salaryMonthDays = resolveSalaryMonthDays(emp, monthKey2);
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
  const attendanceEntries = getWorkRoleMonthEntries(attendance, emp, emp.position, monthKey2, calculateAttendanceTiming);
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
    const entries = row.position === emp.position ? [] : getWorkRoleMonthEntries(attendance, emp, row.position, monthKey2, calculateAttendanceTiming);
    attendanceEntries.push(...entries);
    const days = calculateWorkRoleSalary(parseLooseMoneyValue(row.amount), entries, salaryMonthDays, probationEndDate, probationRate);
    return { ...row, ...days, calculatedAmount: isSalesCollaborator ? 0 : days.calculatedAmount };
  });
  const roleSalaryCalc = isSalesCollaborator ? 0 : roundMoneyValue(roleSalaryRows.reduce((sum, row) => sum + (row.calculatedAmount || 0), 0));
  attendanceEntries.sort((a, b) => a.date.localeCompare(b.date) || a.workRole.localeCompare(b.workRole, "vi"));
  const experienceDetails = calculateExperienceSalaryAtDate(
    emp.startDate,
    experienceSalary,
    emp.experienceSalaryPeriod || "months",
    getMonthEndDateInputValue(monthKey2)
  );
  const experienceSalaryCalc = roundMoneyValue(experienceDetails.total / salaryMonthDays * workDays);
  const expMonths = experienceDetails.expMonths;
  const experienceCycles = experienceDetails.experienceCycles;
  const experienceCycleLabel = experienceDetails.experienceCycleLabel;
  const effectiveRevenue = isEmployeeSalesPosition(emp) ? calculateRevenueForMonth(empId, allOrders, allCustomers, monthKey2) : perf.revenue || 0;
  const directCommission = calculateDirectSalesCommission(emp, effectiveRevenue || 0);
  const downlineCommissionRows = isEmployeeSalesPosition(emp) ? buildSalesDownlineCommissionRows(empId, employees, allOrders, allCustomers, monthKey2) : [];
  const downlineCommission = roundMoneyValue(downlineCommissionRows.reduce((sum, row) => sum + (row.commission || 0), 0));
  const commission = roundMoneyValue(directCommission + downlineCommission);
  const tieredBonus = 0;
  const earlyOvertimeHours = roundMoneyValue(earlyOvertimeMinutesTotal / 60 * 100) / 100;
  const afterShiftOvertimeHours = roundMoneyValue(afterShiftOvertimeMinutesTotal / 60 * 100) / 100;
  const automaticOvertimeHours = afterShiftOvertimeHours;
  const approvedOvertimeHours = parseFloat(perf.overtime || 0) || 0;
  const overtimeRate = parseLooseMoneyValue(emp.overtimeRate);
  const overtimePay = isSalesCollaborator ? 0 : roundMoneyValue((approvedOvertimeHours + automaticOvertimeHours) * overtimeRate);
  const monthlyFinancials = financials.filter((f) => f.empId === empId && !f.isArchived && (f.type === "advance" ? isSalaryAdvanceInMonth(f, monthKey2) : !f.date || f.date.startsWith(monthKey2))).sort((a, b) => new BusinessDate(a.date || 0) - new BusinessDate(b.date || 0));
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
    monthKey: monthKey2,
    workDays,
    workDaysProbation: isSalesCollaborator ? 0 : workDaysProbation,
    workDaysOfficial: isSalesCollaborator ? 0 : workDaysOfficial,
    expMonths,
    experienceCycles,
    experienceCycleLabel,
    perf: { ...perf, revenue: effectiveRevenue, overtime: approvedOvertimeHours, earlyOvertimeHours, afterShiftOvertimeHours, automaticOvertimeHours },
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
var resolveCashflowDateKey = (item = {}) => getDateKeyFromAnyValue(
  (isPayosPaymentRecord(item) ? getPaymentDateSource(item) : "") || item.cashflowDate || item.paymentDate || item.paidDate || item.transactionDate || item.transactionDateTime || item.bankTransactionDate || item.paidAt || item.transactionAt || item.transactedAt || item.transactionTime || item.bankTransactionTime || item.paymentTime || item.completedTime || item.completedAt || item.date || item.approvedAt || item.createdAt || item.updatedAt || getEntityTimestamp(item)
);
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
  const dateKey3 = getDateKeyFromAnyValue(raw) || getTodayString();
  return `${dateKey3}`.slice(0, 7);
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
var getEmployeeAttendanceEntriesForMonth = (attendance = {}, empId = "", monthKey2 = "", companyId = "") => {
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
    return {
      ...record || {},
      id: documentId || record?.id,
      employeeId: record?.employeeId || employeeId,
      date: documentIdMatch?.[1] || record?.date || date
    };
  }).filter((record) => `${record?.employeeId || record?.empId || ""}` === `${empId || ""}` && normalizeEmployeeReviewMonthKey(record?.date || record?.dateKey || record?.createdAt || getEntityTimestamp(record)) === monthKey2 && (!companyId || `${record?.companyId || record?.appId || record?.tenantId || ""}` === `${companyId}`));
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
var summarizeEmployeeReviews = (reviews = [], empId = "", monthKey2 = "", source = "peer") => {
  const filtered = (reviews || []).filter((item) => `${item?.targetEmployeeId || ""}` === `${empId || ""}` && normalizeEmployeeReviewMonthKey(item?.monthKey || item?.date || item?.createdAt) === monthKey2 && (!source || `${item?.source || "peer"}` === source));
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
  monthKey: monthKey2 = "",
  companyId = "",
  reviewOrdersByEmployee = null,
  reviewReportsByEmployee = null
} = {}) => {
  const employeeId = emp?.id || "";
  const attendanceEntries = getEmployeeAttendanceEntriesForMonth(attendance, employeeId, monthKey2, companyId);
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
  const monthOrders = candidateOrders.filter((order) => isOrderRelatedToEmployeeReview(order, employeeId) && normalizeEmployeeReviewMonthKey(order.date || order.createdAt || getEntityTimestamp(order)) === monthKey2 && (!companyId || `${order?.companyId || order?.appId || order?.tenantId || ""}` === `${companyId}`));
  const revenue = monthOrders.reduce((sum, order) => sum + getEmployeeReviewOrderAmount(order), 0);
  const candidateReports = reviewReportsByEmployee instanceof Map ? reviewReportsByEmployee.get(`${employeeId}`) || [] : deliveryReports || [];
  const monthReports = candidateReports.filter((report) => isDeliveryReportRelatedToEmployeeReview(report, employeeId) && normalizeEmployeeReviewMonthKey(report.date || report.createdAt || getEntityTimestamp(report)) === monthKey2 && (!companyId || `${report?.companyId || report?.appId || report?.tenantId || ""}` === `${companyId}`));
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
  const monthKey2 = normalizeEmployeeReviewMonthKey(context.monthKey || getTodayString());
  const companyId = context.companyId || context.currentCompany?.id || context.currentCompany?.companyId || emp?.companyId || "";
  const effectiveEmployee = applyEmployeePayrollPolicyForMonth(emp, monthKey2);
  const system = calculateEmployeeSystemReview(effectiveEmployee, { ...context, monthKey: monthKey2, companyId });
  const peer = summarizeEmployeeReviews(context.reviews || [], emp.id, monthKey2, "peer");
  const customer = summarizeEmployeeReviews(context.reviews || [], emp.id, monthKey2, "customer");
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
    monthKey: monthKey2,
    attendanceEntries: attendanceLoaded ? getEmployeeAttendanceEntriesForMonth(context.attendance, emp.id, monthKey2, companyId) : null,
    complaints: complaintsLoaded ? context.complaints : null,
    shiftPolicy: resolveEmployeeShiftPolicy(effectiveEmployee)
  }) : null;
  const evaluationSummary13 = emp?.id ? buildEvaluationSummary13({
    employeeId: emp.id,
    companyId,
    monthKey: monthKey2,
    manualCriteria: context.criteriaList || getEmployeeReviewCriteriaList(context.currentCompany || {}),
    manualCriteriaScores: finalCriteriaScores,
    automaticEvaluation
  }) : null;
  return {
    employee: emp,
    monthKey: monthKey2,
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
  return EMPLOYEE_PEER_REVIEW_CRITERIA.map((criteria) => ({
    ...criteria,
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

// development/hd-manager/application/src/services/smartCustomerOrdering.js
var normalizeText2 = (value = "") => `${value || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
var parsePositiveQuantity = (value = 0) => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = `${value || ""}`.replace(/[^0-9,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
var sameUnit = (left = "", right = "") => normalizeText2(normalizeProductPricingUnit(left)) === normalizeText2(normalizeProductPricingUnit(right));
var parseConfiguredConversion = (value = 0) => parsePositiveQuantity(value);
var normalizeConversionKey = (value = "") => normalizeText2(normalizeProductPricingUnit(value));
var buildConversionResult = (factor = 0, source = "") => ({
  factor: parseConfiguredConversion(factor),
  isConfigured: parseConfiguredConversion(factor) > 0,
  source
});
var findConversionInText = ({ text: text3 = "", fromUnit = "", toUnit = "" } = {}) => {
  const normalizedFrom = normalizeConversionKey(fromUnit);
  const normalizedTo = normalizeConversionKey(toUnit);
  if (!normalizedFrom || !normalizedTo) return null;
  return `${text3 || ""}`.split(/[;\n|]+/).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const explicitTarget = entry.match(/^(.+?)\s*(?:->|to)\s*(.+?)\s*=\s*([0-9][0-9.,]*)\s*$/i);
    if (explicitTarget) {
      return {
        from: explicitTarget[1],
        to: explicitTarget[2],
        factor: explicitTarget[3],
        source: "configured_text_target"
      };
    }
    const implicitTarget = entry.match(/^(.+?)\s*(?:=|:)\s*([0-9][0-9.,]*)\s*$/);
    if (implicitTarget) {
      return {
        from: implicitTarget[1],
        to: "",
        factor: implicitTarget[2],
        source: "configured_text"
      };
    }
    return null;
  }).find((entry) => entry && normalizeConversionKey(entry.from) === normalizedFrom && (!entry.to || normalizeConversionKey(entry.to) === normalizedTo));
};
var findConversionInObject = ({ source = null, fromUnit = "", toUnit = "" } = {}) => {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const normalizedFrom = normalizeConversionKey(fromUnit);
  const normalizedTo = normalizeConversionKey(toUnit);
  if (!normalizedFrom || !normalizedTo) return null;
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const normalizedKey = normalizeText2(rawKey);
    const arrowMatch = `${rawKey}`.match(/^(.+?)\s*(?:->|to)\s*(.+?)$/i);
    if (arrowMatch) {
      if (normalizeConversionKey(arrowMatch[1]) === normalizedFrom && normalizeConversionKey(arrowMatch[2]) === normalizedTo) {
        const factor2 = parseConfiguredConversion(rawValue?.factor ?? rawValue?.value ?? rawValue);
        if (factor2 > 0) return { factor: factor2, source: "configured_object_target" };
      }
      continue;
    }
    if (normalizedKey !== normalizedFrom) continue;
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      const targetValue = rawValue[toUnit] ?? rawValue[normalizedTo] ?? rawValue.factor ?? rawValue.value;
      const factor2 = parseConfiguredConversion(targetValue);
      if (factor2 > 0) return { factor: factor2, source: "configured_object_nested" };
      continue;
    }
    const factor = parseConfiguredConversion(rawValue);
    if (factor > 0) return { factor, source: "configured_object" };
  }
  return null;
};
var findConfiguredConversion = ({ source = null, fromUnit = "", toUnit = "" } = {}) => {
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== "object") continue;
      const entryFrom = entry.fromUnit || entry.from || entry.orderUnit || entry.unit || "";
      const entryTo = entry.toUnit || entry.to || entry.pricingUnit || entry.billingUnit || "";
      if (normalizeConversionKey(entryFrom) === normalizeConversionKey(fromUnit) && (!entryTo || normalizeConversionKey(entryTo) === normalizeConversionKey(toUnit))) {
        const factor = parseConfiguredConversion(entry.factor ?? entry.conversionFactor ?? entry.value);
        if (factor > 0) return { factor, source: "configured_list" };
      }
    }
    return null;
  }
  if (typeof source === "string") return findConversionInText({ text: source, fromUnit, toUnit });
  return findConversionInObject({ source, fromUnit, toUnit });
};
var resolveUnitConversionFactor = ({
  fromUnit = "",
  toUnit = "",
  conversionFactor = 0,
  unitConversions = null,
  conversions = null
} = {}) => {
  const normalizedFrom = normalizeProductPricingUnit(fromUnit);
  const normalizedTo = normalizeProductPricingUnit(toUnit);
  if (!normalizedFrom || !normalizedTo || sameUnit(normalizedFrom, normalizedTo)) {
    return buildConversionResult(0, "");
  }
  const directFactor = parseConfiguredConversion(conversionFactor);
  if (directFactor > 0) return buildConversionResult(directFactor, "explicit_line_factor");
  const configured = findConfiguredConversion({
    source: unitConversions ?? conversions,
    fromUnit: normalizedFrom,
    toUnit: normalizedTo
  });
  const configuredFactor = parseConfiguredConversion(configured?.factor);
  if (configuredFactor > 0) return buildConversionResult(configuredFactor, configured.source);
  if (unitConversions == null && conversions != null) {
    const fallbackConfigured = findConfiguredConversion({
      source: conversions,
      fromUnit: normalizedFrom,
      toUnit: normalizedTo
    });
    const fallbackFactor = parseConfiguredConversion(fallbackConfigured?.factor);
    if (fallbackFactor > 0) return buildConversionResult(fallbackFactor, fallbackConfigured.source);
  }
  return buildConversionResult(0, "");
};

// development/hd-manager/application/src/services/customerProductBilling.js
var normalizedBillingTextCache = /* @__PURE__ */ new Map();
var normalizeText3 = (value = "") => {
  const raw = `${value || ""}`;
  if (normalizedBillingTextCache.has(raw)) return normalizedBillingTextCache.get(raw);
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
  if (raw.length <= 256) {
    if (normalizedBillingTextCache.size >= 512) normalizedBillingTextCache.delete(normalizedBillingTextCache.keys().next().value);
    normalizedBillingTextCache.set(raw, normalized);
  }
  return normalized;
};
var parsePositiveNumber = (value = 0) => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = `${value || ""}`.replace(/[^0-9,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
var parseMoney = (value = 0) => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const parsed = Number(`${value || ""}`.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
var isSameBillingUnit = (left = "", right = "") => {
  const normalizedLeft = normalizeText3(normalizeProductPricingUnit(left));
  const normalizedRight = normalizeText3(normalizeProductPricingUnit(right));
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};
var calculateBillableAmount = ({
  configuration = null,
  actualQuantity = 0,
  actualUnit = "",
  orderUnit = "",
  actualWeightKg = 0,
  billingQuantity = 0,
  billingUnit = "",
  unitPrice = 0,
  conversionFactor = 0,
  unitConversions = null,
  conversions = null
} = {}) => {
  const resolvedBillingUnit = normalizeProductPricingUnit(
    billingUnit || configuration?.billingUnit || configuration?.pricingUnit || ""
  );
  const resolvedOrderUnit = normalizeProductPricingUnit(orderUnit || actualUnit || resolvedBillingUnit);
  const resolvedActualUnit = normalizeProductPricingUnit(actualUnit || resolvedOrderUnit || resolvedBillingUnit);
  const resolvedUnitPrice = parseMoney(unitPrice || configuration?.unitPrice);
  const parsedActualQuantity = parsePositiveNumber(actualQuantity);
  const parsedActualWeightKg = parsePositiveNumber(actualWeightKg);
  const explicitBillingQuantity = parsePositiveNumber(billingQuantity);
  const usesWeightPricing = isSameBillingUnit(resolvedBillingUnit, "Kg");
  const unitMismatch = Boolean(
    resolvedOrderUnit && resolvedBillingUnit && !isSameBillingUnit(resolvedOrderUnit, resolvedBillingUnit)
  );
  const conversion = unitMismatch ? resolveUnitConversionFactor({
    fromUnit: resolvedOrderUnit,
    toUnit: resolvedBillingUnit,
    conversionFactor,
    unitConversions: unitConversions ?? configuration?.unitConversions,
    conversions: conversions ?? configuration?.conversions
  }) : { factor: 0, isConfigured: false, source: "" };
  const hasConfiguredConversion = conversion.isConfigured && conversion.factor > 0;
  const convertedQuantity = hasConfiguredConversion && parsedActualQuantity > 0 ? parsedActualQuantity * conversion.factor : 0;
  const resolvedBillingQuantity = explicitBillingQuantity > 0 ? explicitBillingQuantity : usesWeightPricing ? parsedActualWeightKg > 0 ? parsedActualWeightKg : isSameBillingUnit(resolvedOrderUnit, resolvedBillingUnit) ? parsedActualQuantity : convertedQuantity : isSameBillingUnit(resolvedOrderUnit, resolvedBillingUnit) ? parsedActualQuantity : convertedQuantity;
  const hasUnresolvedNonWeightMismatch = !usesWeightPricing && unitMismatch && !hasConfiguredConversion;
  const errorCode = !resolvedBillingUnit ? "MISSING_BILLING_UNIT" : resolvedUnitPrice <= 0 ? "MISSING_UNIT_PRICE" : hasUnresolvedNonWeightMismatch ? "ACTUAL_UNIT_NOT_ALLOWED" : resolvedBillingQuantity <= 0 ? "MISSING_BILLING_QUANTITY" : "";
  return {
    actualQuantity: parsedActualQuantity,
    actualUnit: resolvedActualUnit,
    orderUnit: resolvedOrderUnit,
    actualWeightKg: parsedActualWeightKg,
    billingQuantity: resolvedBillingQuantity,
    billingUnit: resolvedBillingUnit,
    unitPrice: resolvedUnitPrice,
    amount: errorCode ? 0 : Math.round(resolvedBillingQuantity * resolvedUnitPrice),
    usesWeightPricing,
    conversionFactor: hasConfiguredConversion ? conversion.factor : 0,
    conversionSource: hasConfiguredConversion ? conversion.source : "",
    isPending: errorCode === "MISSING_BILLING_QUANTITY",
    isValid: !errorCode,
    errorCode
  };
};
var buildCustomerProductBillingSnapshot = ({
  configuration = null,
  product = null,
  productId = "",
  productName = "",
  sizeLabel = "",
  attributeLabel = "",
  ...quantityInput
} = {}) => {
  const calculation = calculateBillableAmount({ configuration, ...quantityInput });
  const resolvedProductId = `${productId || configuration?.productId || product?.id || ""}`.trim();
  const resolvedProductName = `${productName || configuration?.productName || product?.name || ""}`.trim();
  const resolvedSize = `${sizeLabel || configuration?.sizeLabel || ""}`.trim();
  const resolvedAttribute = `${attributeLabel || configuration?.attributeLabel || ""}`.trim();
  return {
    productId: resolvedProductId,
    productName: resolvedProductName,
    productNameSnapshot: resolvedProductName,
    configurationId: `${configuration?.configurationId || ""}`.trim(),
    sizeLabel: resolvedSize,
    attributeLabel: resolvedAttribute,
    actualQuantity: calculation.actualQuantity,
    actualUnit: calculation.actualUnit,
    orderUnit: calculation.orderUnit,
    actualWeightKg: calculation.actualWeightKg,
    billingQuantity: calculation.billingQuantity,
    billingUnit: calculation.billingUnit,
    basePriceUnit: calculation.billingUnit,
    unitPrice: calculation.unitPrice,
    conversionFactor: calculation.conversionFactor || 0,
    conversionSource: calculation.conversionSource || "",
    unitConversions: quantityInput.unitConversions ?? quantityInput.conversions ?? configuration?.unitConversions ?? configuration?.conversions ?? "",
    amount: calculation.amount,
    quantity: calculation.actualQuantity,
    quantityCount: calculation.actualQuantity,
    quantityUnit: calculation.actualUnit,
    pricingQuantity: calculation.billingQuantity,
    pricingUnit: calculation.billingUnit,
    pricingAmount: calculation.amount,
    lineTotal: calculation.amount,
    pricingPendingActual: calculation.isPending,
    billingSnapshotVersion: 1,
    billingSnapshotSource: configuration?.source || "transaction",
    billingSnapshotValid: calculation.isValid,
    billingSnapshotError: calculation.errorCode
  };
};
var resolveTransactionBillingSnapshot = ({
  record = null,
  configuration = null,
  product = null
} = {}) => {
  const source = record || {};
  const explicitBillingUnit = normalizeProductPricingUnit(source.billingUnit || source.pricingUnit || "");
  const legacyTransactionUnit = normalizeProductPricingUnit(source.quantityUnit || source.unit || "");
  const legacyWeight = parsePositiveNumber(source.actualWeightKg ?? source.weightKg ?? source.totalKg ?? source.kg);
  const legacyAmount = parseMoney(source.amount ?? source.pricingAmount ?? source.lineTotal ?? source.totalAmount);
  const savedBillingUnit = explicitBillingUnit || (legacyTransactionUnit && (isSameBillingUnit(legacyTransactionUnit, "Kg") || legacyWeight <= 0) && legacyAmount > 0 ? legacyTransactionUnit : "");
  const savedUnitPrice = parseMoney(
    source.unitPrice ?? source.price ?? source.sellingPrice ?? source.unitPriceVnd ?? source.unit_price_vnd
  );
  const savedBillingQuantity = parsePositiveNumber(source.billingQuantity ?? source.pricingQuantity);
  const hasSnapshotMarker = parsePositiveNumber(source.billingSnapshotVersion) > 0 || Boolean(`${source.billingSnapshotSource || ""}`.trim());
  const hasFrozenPricing = Boolean(savedBillingUnit && savedUnitPrice > 0 && (hasSnapshotMarker || Boolean(source.configurationId) || savedBillingQuantity > 0 || legacyAmount > 0));
  const effectiveConfiguration = hasFrozenPricing ? {
    ...configuration || {},
    productId: source.productId || configuration?.productId || product?.id || "",
    productName: source.productName || source.productNameSnapshot || configuration?.productName || product?.name || "",
    configurationId: source.configurationId || configuration?.configurationId || "",
    sizeLabel: source.sizeLabel || source.size || configuration?.sizeLabel || "",
    attributeLabel: source.attributeLabel || configuration?.attributeLabel || "",
    billingUnit: savedBillingUnit,
    pricingUnit: savedBillingUnit,
    unitPrice: savedUnitPrice,
    unitConversions: source.unitConversions ?? source.conversions ?? configuration?.unitConversions ?? "",
    source: "transaction_snapshot"
  } : configuration;
  const snapshot = buildCustomerProductBillingSnapshot({
    configuration: effectiveConfiguration,
    product,
    productId: source.productId,
    productName: source.productName || source.productNameSnapshot,
    sizeLabel: source.sizeLabel || source.size,
    attributeLabel: source.attributeLabel,
    actualQuantity: source.actualQuantity ?? source.quantity ?? source.pieceCount ?? source.quantityCount,
    actualUnit: source.actualUnit || source.actualQuantityUnit || source.quantityUnit || source.unit,
    orderUnit: source.orderUnit || source.inputUnit || source.quantityUnit || source.actualUnit || source.unit,
    actualWeightKg: source.actualWeightKg ?? source.weightKg ?? source.totalKg ?? source.kg,
    billingQuantity: savedBillingQuantity,
    billingUnit: savedBillingUnit,
    unitPrice: savedUnitPrice,
    conversionFactor: source.conversionFactor ?? source.unitConversionFactor,
    unitConversions: source.unitConversions ?? source.conversions
  });
  const savedAmount = legacyAmount;
  return {
    ...snapshot,
    ...hasFrozenPricing && savedAmount > 0 ? {
      amount: savedAmount,
      pricingAmount: savedAmount,
      lineTotal: savedAmount
    } : {},
    hasFrozenPricing
  };
};

// development/hd-manager/application/src/utils/expenseClassification.js
var isCustomerDebtRepayment = (expense) => expense?.sourceType === "customer_debt_repayment";

// development/hd-manager/application/src/services/transactionUnitEvidence.js
var text2 = (value) => `${value ?? ""}`.trim();
var items = (record) => record?.items?.length ? record.items : record?.lines?.length ? record.lines : record?.products?.length ? record.products : record?.primaryItem ? [record.primaryItem] : [];
var distinct = (values) => [...new Set(values.map(text2).filter(Boolean))];
var savedOrdered = (record) => distinct([record?.orderedUnit, record?.orderUnit, record?.inputUnit]);
var savedPricing = (record) => distinct([record?.pricingUnit, record?.billingUnit]);
function createTransactionUnitEvidence({ orderRequests = [], warehouseDispatches = [] } = {}) {
  const requests = new Map(orderRequests.map((row) => [row.id, row]));
  const dispatches = new Map(warehouseDispatches.map((row) => [row.id, row]));
  return ({ order, item, itemIndex = 0 }) => {
    const evidence = [], conflicts = [];
    const ownOrder = savedOrdered(item), ownPricing = savedPricing(item);
    if (ownOrder.length > 1 || ownPricing.length > 1) conflicts.push("CONTRADICTORY_SAVED_UNITS");
    const candidates = [];
    const ids = distinct(item.sourceDispatchIds || []);
    if (!ids.length && items(order).length === 1) ids.push(...distinct(order.sourceDispatchIds || []));
    let unresolved = 0;
    for (const id of ids) {
      const dispatch = dispatches.get(id);
      if (!dispatch) {
        unresolved++;
        continue;
      }
      const sameScope = dispatch.companyId === order.companyId && dispatch.productId === item.productId && Boolean(item.productId) && (!order.customerId || dispatch.customerId === order.customerId) && (!(order.branchId || order.customerBranchId) || text2(dispatch.branchId || dispatch.customerBranchId) === text2(order.branchId || order.customerBranchId));
      if (!sameScope) {
        conflicts.push("DISPATCH_SCOPE_MISMATCH");
        continue;
      }
      const request = requests.get(dispatch.sourceOrderRequestId), key = text2(dispatch.sourceOrderRequestRowKey);
      if (!request || !key) {
        unresolved++;
        continue;
      }
      if (request.companyId !== order.companyId || order.customerId && request.customerId !== order.customerId) {
        conflicts.push("REQUEST_SCOPE_MISMATCH");
        continue;
      }
      const branch = text2(order.branchId || order.customerBranchId);
      if (branch && text2(request.branchId || request.customerBranchId) !== branch) {
        conflicts.push("REQUEST_BRANCH_MISMATCH");
        continue;
      }
      const orderTime = Date.parse(order.createdAt || ""), requestTime = Date.parse(request.updatedAt || request.modifiedAt || "");
      if (Number.isFinite(orderTime) && Number.isFinite(requestTime) && requestTime > orderTime) {
        conflicts.push("REQUEST_CHANGED_AFTER_ORDER");
        continue;
      }
      const rows = items(request), matches = rows.map((row2, index2) => ({ row: row2, index: index2 })).filter(({ row: row2, index: index2 }) => {
        const rowToken = text2(row2.rowKey || row2.id || row2.lineId || row2.itemId || index2);
        return row2.productId === item.productId && (key === `${request.id}_${rowToken}` || key === text2(row2.rowKey || row2.id || row2.lineId || row2.itemId) || key === `${request.id}_${item.productId}` && rows.filter((r) => r.productId === item.productId).length === 1);
      });
      if (matches.length !== 1) {
        unresolved++;
        if (matches.length > 1) conflicts.push("AMBIGUOUS_REQUEST_LINE");
        continue;
      }
      const { row, index } = matches[0];
      const ordered = distinct([...savedOrdered(row), row.quantityUnit]), pricing = savedPricing(row);
      if (ordered.length > 1 || pricing.length > 1) {
        conflicts.push("REQUEST_UNIT_CONFLICT");
        continue;
      }
      if (!ordered.length) {
        unresolved++;
        continue;
      }
      const ref = { source: "orderRequests", documentId: request.id, itemIndex: index, viaDispatchId: id, orderedUnit: ordered[0], pricingUnit: pricing[0] || "", scopeVerified: true };
      candidates.push(ref);
      evidence.push(ref);
    }
    const linkedOrder = distinct(candidates.map((row) => row.orderedUnit)), linkedPricing = distinct(candidates.map((row) => row.pricingUnit));
    if (linkedOrder.length > 1 || linkedPricing.length > 1) conflicts.push("LINKED_UNITS_DISAGREE");
    if (ownOrder.length && linkedOrder.length && !linkedOrder.includes(ownOrder[0])) conflicts.push("SAVED_LINKED_ORDER_UNIT_CONFLICT");
    if (ownPricing.length && linkedPricing.length && !linkedPricing.includes(ownPricing[0])) conflicts.push("SAVED_LINKED_PRICING_UNIT_CONFLICT");
    const complete = ids.length > 0 && candidates.length === ids.length && unresolved === 0 && conflicts.length === 0;
    const orderedUnit = ownOrder.length === 1 ? ownOrder[0] : complete ? linkedOrder[0] || "" : "";
    const pricingUnit = ownPricing.length === 1 ? ownPricing[0] : complete && candidates.every((row) => row.pricingUnit) ? linkedPricing[0] || "" : "";
    return {
      lineId: `${order.id}:${itemIndex}`,
      orderedUnit,
      pricingUnit,
      status: conflicts.length ? "CONFLICT" : ownOrder.length === 1 ? "ORIGINAL_DOCUMENT" : orderedUnit ? "EXACT_LINKED_DOCUMENT" : "INSUFFICIENT_EVIDENCE",
      evidence,
      conflicts: distinct(conflicts),
      unresolvedLinks: unresolved,
      originalValuesPreserved: true
    };
  };
}

// development/hd-manager/application/src/services/executiveDashboardService.js
var DAY_MS = 24 * 60 * 60 * 1e3;
var activeBuildCache = null;
var toNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};
var toArray = (value) => Array.isArray(value) ? value : [];
var toCollectionArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
};
var normalizeText4 = (value = "") => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
var DEPARTMENT_LABELS = {
  super_admin: "Ch\u1EE7 doanh nghi\u1EC7p",
  owner: "Ch\u1EE7 doanh nghi\u1EC7p",
  admin: "Ch\u1EE7 doanh nghi\u1EC7p",
  employee: "Nh\xE2n s\u1EF1",
  accounting: "K\u1EBF to\xE1n & nh\xE2n s\u1EF1",
  accountant: "K\u1EBF to\xE1n & nh\xE2n s\u1EF1",
  hr: "K\u1EBF to\xE1n & nh\xE2n s\u1EF1",
  sales: "Kinh doanh",
  sale: "Kinh doanh",
  business: "Kinh doanh",
  driver: "T\xE0i x\u1EBF",
  delivery: "Giao h\xE0ng",
  production: "S\u1EA3n xu\u1EA5t",
  warehouse: "Xu\u1EA5t kho",
  warehouse_export: "Xu\u1EA5t kho",
  asset: "Qu\u1EA3n l\xFD t\xE0i s\u1EA3n",
  finance: "Thu chi",
  general: "Chi ph\xED chung"
};
var formatDepartmentLabel = (value = "", fallback = "Chi ph\xED chung") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const key = normalizeText4(raw).replace(/[\s-]+/g, "_");
  return DEPARTMENT_LABELS[key] || raw;
};
var parseDate = (value) => {
  if (!value) return null;
  if (value instanceof BusinessDate) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date2 = new BusinessDate(value);
    return Number.isNaN(date2.getTime()) ? null : date2;
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return new BusinessDate(value.toDate());
    if (value.seconds) return new BusinessDate(value.seconds * 1e3);
  }
  const raw = String(value).trim();
  const vietnameseDateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (vietnameseDateMatch) {
    const [, dayText, monthText, yearText, hourText = "0", minuteText = "0", secondText = "0"] = vietnameseDateMatch;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
    const date2 = new BusinessDate(year, month - 1, day, hour, minute, second);
    if (date2.getFullYear() !== year || date2.getMonth() !== month - 1 || date2.getDate() !== day) return null;
    return date2;
  }
  const isoLike = raw.includes("T") ? raw : raw.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");
  const date = new BusinessDate(isoLike);
  return Number.isNaN(date.getTime()) ? null : date;
};
var dateKey2 = (value) => {
  const cache = typeof value === "string" || typeof value === "number" ? activeBuildCache?.dates : null;
  if (cache?.has(value)) return cache.get(value);
  const date = parseDate(value);
  const key = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
  cache?.set(value, key);
  return key;
};
var monthKey = (value) => dateKey2(value).slice(0, 7);
var addDays = (date, days) => {
  const next = new BusinessDate(date);
  next.setDate(next.getDate() + days);
  return next;
};
var addMonths = (date, months) => new BusinessDate(date.getFullYear(), date.getMonth() + months, 1);
var getPreviousMonthKey = (date = new BusinessDate()) => monthKey(addMonths(date, -1));
var getWeekStartDate = (value = new BusinessDate()) => {
  const date = parseDate(value) || new BusinessDate();
  const start = new BusinessDate(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
};
var getDateValue = (entity = {}) => entity.date || entity.orderDate || entity.requestDate || entity.dispatchDate || entity.importDate || entity.paymentDate || entity.expenseDate || entity.createdAt || entity.updatedAt || entity.timestamp || "";
var isArchived = (item = {}) => item.archived || item.isArchived || item.deleted || item.isDeleted;
var isCancelled = (item = {}) => ["cancelled", "canceled", "deleted"].includes(normalizeText4(item.status));
var getItems = (order = {}) => toArray(order.items).length ? toArray(order.items) : toArray(order.lines).length ? toArray(order.lines) : toArray(order.products);
var itemQuantity = (item = {}) => toNumber(
  item.quantity ?? item.qty ?? item.weight ?? item.weightKg ?? item.kg ?? item.count ?? item.pieceCount
);
var itemUnitPrice = (item = {}) => toNumber(
  item.unitPrice ?? item.price ?? item.unit_price ?? item.salePrice ?? item.finalPrice
);
var itemCost = (item = {}) => toNumber(
  item.costPrice ?? item.cost ?? item.unitCost ?? item.purchasePrice
);
var itemBillingSnapshot = (item = {}) => {
  const cache = item && typeof item === "object" ? activeBuildCache?.billing : null;
  if (cache?.has(item)) return cache.get(item);
  const snapshot = resolveTransactionBillingSnapshot({ record: item });
  const result = snapshot.hasFrozenPricing || toNumber(item.billingSnapshotVersion) > 0 ? snapshot : null;
  cache?.set(item, result);
  return result;
};
var itemLineTotal = (item = {}) => {
  const snapshot = itemBillingSnapshot(item);
  if (snapshot) return toNumber(snapshot.amount);
  const direct = toNumber(item.total ?? item.lineTotal ?? item.amount ?? item.subtotal, NaN);
  if (Number.isFinite(direct)) return direct;
  return itemQuantity(item) * itemUnitPrice(item);
};
var itemBillingQuantity = (item = {}) => {
  const snapshot = itemBillingSnapshot(item);
  return snapshot ? toNumber(snapshot.billingQuantity) : itemQuantity(item);
};
var itemBillingUnit = (item = {}, fallback = "\u0111\u01A1n v\u1ECB") => {
  const snapshot = itemBillingSnapshot(item);
  return snapshot?.billingUnit || quantityUnitOf(item, fallback);
};
var orderTotal = (order = {}) => {
  const direct = toNumber(order.totalAmount ?? order.grandTotal ?? order.total ?? order.amount ?? order.finalAmount, NaN);
  if (Number.isFinite(direct)) return direct;
  return getItems(order).reduce((sum, item) => sum + itemLineTotal(item), 0);
};
var orderProfit = (order = {}) => {
  const direct = toNumber(order.profit ?? order.netProfit ?? order.grossProfit, NaN);
  if (Number.isFinite(direct)) return direct;
  const revenue = orderTotal(order);
  const directCost = toNumber(order.costAmount ?? order.totalCost ?? order.costOfGoods, NaN);
  if (Number.isFinite(directCost)) return revenue - directCost;
  const itemCostTotal = getItems(order).reduce((sum, item) => sum + itemQuantity(item) * itemCost(item), 0);
  return itemCostTotal > 0 ? revenue - itemCostTotal : revenue;
};
var paidAmountOfOrder = (order = {}) => toNumber(
  order.paidAmount ?? order.receivedAmount ?? order.upfrontPayment ?? order.prepaidAmount ?? order.deposit
);
var outstandingOfOrder = (order = {}) => {
  const direct = toNumber(order.outstandingAmount ?? order.remainingAmount ?? order.debtAmount, NaN);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Math.max(0, orderTotal(order) - paidAmountOfOrder(order));
};
var moneyOfPayment = (payment = {}) => toNumber(payment.amount ?? payment.total ?? payment.paidAmount ?? payment.receivedAmount);
var moneyOfExpense = (expense = {}) => toNumber(expense.amount ?? expense.total ?? expense.cost ?? expense.value);
var isInventoryPurchaseExpense = (expense = {}) => normalizeText4(expense.sourceType || expense.source || expense.origin) === "warehouse_import_purchase" || Boolean(expense.sourceWarehouseImportId || expense.warehouseImportId || expense.importId) || /mua hang|nhap kho|nguyen lieu|hang song/.test(normalizeText4(expense.category || expense.type || expense.name || expense.title || "")) && Boolean(expense.autoCreated || expense.autoGenerated || expense.linkedToWarehouseImport);
var isPayrollDisbursementExpense = (expense = {}) => /luong|salary|payroll/.test(normalizeText4([
  expense.sourceType,
  expense.category,
  expense.type,
  expense.name,
  expense.title
].filter(Boolean).join(" ")));
var isSalaryAdvanceExpense = (expense = {}) => /ung luong|tam ung luong|salary.advance|advance.salary/.test(normalizeText4([
  expense.sourceType,
  expense.category,
  expense.type,
  expense.name,
  expense.title
].filter(Boolean).join(" ")));
var customerNameOf = (entity = {}, customersById = /* @__PURE__ */ new Map()) => {
  const customer = entity.customerId ? customersById.get(entity.customerId) : null;
  return entity.customerName || entity.customer?.name || entity.name || customer?.name || customer?.displayName || "Kh\xE1ch ch\u01B0a r\xF5";
};
var productNameOf = (item = {}, productsById = /* @__PURE__ */ new Map()) => {
  const product = item.productId ? productsById.get(item.productId) : null;
  return item.productShortName || item.shortName || product?.shortName || item.productName || item.name || product?.name || "S\u1EA3n ph\u1EA9m";
};
var employeeNameOf = (entity = {}, employeesById = /* @__PURE__ */ new Map()) => {
  const employeeId = entity.employeeId || entity.salesId || entity.createdBy || entity.staffId || entity.userId;
  const employee = employeeId ? employeesById.get(employeeId) : null;
  return entity.employeeName || entity.salesName || entity.createdByName || employee?.name || "Ch\u01B0a r\xF5 nh\xE2n vi\xEAn";
};
var employeeDisplayNameOf = (employee = {}) => employee.name || employee.displayName || employee.fullName || employee.phone || employee.id || "Ch\u01B0a r\xF5 nh\xE2n vi\xEAn";
var isSalesEmployeeRecord = (employee = {}) => {
  const text3 = normalizeText4([
    employee.position,
    employee.role,
    employee.roleName,
    employee.department,
    employee.type,
    employee.title
  ].filter(Boolean).join(" "));
  return /kinh doanh|ban hang|cong tac vien|sales|sale|business|nvkd|ctv/.test(text3);
};
var customerSalesEmployeeIdOf = (customer = {}) => String(
  customer.empId || customer.salesEmpId || customer.managerEmpId || customer.salesOwnerId || customer.assignedSalesEmpId || customer.responsibleEmployeeId || customer.employeeId || ""
);
var percentChange = (current, previous) => {
  if (!previous && !current) return 0;
  if (!previous) return current > 0 ? 100 : 0;
  return (current - previous) / Math.abs(previous) * 100;
};
var getPeriodTotals = (entities, amountGetter) => {
  if (!activeBuildCache || !Array.isArray(entities)) return null;
  let getters = activeBuildCache.totals.get(entities);
  if (!getters) {
    getters = /* @__PURE__ */ new Map();
    activeBuildCache.totals.set(entities, getters);
  }
  if (getters.has(amountGetter)) return getters.get(amountGetter);
  const totals = { date: /* @__PURE__ */ new Map(), month: /* @__PURE__ */ new Map(), year: /* @__PURE__ */ new Map() };
  for (const item of entities) {
    const value = getDateValue(item);
    const day = dateKey2(value);
    const month = monthKey(value);
    const amount = amountGetter(item);
    for (const [map, key] of [[totals.date, day], [totals.month, month], [totals.year, day.slice(0, 4)]]) {
      map.set(key, (map.get(key) || 0) + amount);
    }
  }
  getters.set(amountGetter, totals);
  return totals;
};
var sumByDate = (entities, key, amountGetter) => {
  const totals = getPeriodTotals(entities, amountGetter);
  if (totals) return totals.date.get(key) || 0;
  return toArray(entities).filter((item) => dateKey2(getDateValue(item)) === key).reduce((sum, item) => sum + amountGetter(item), 0);
};
var sumByMonth = (entities, key, amountGetter) => {
  const totals = getPeriodTotals(entities, amountGetter);
  if (totals) return totals.month.get(key) || 0;
  return toArray(entities).filter((item) => monthKey(getDateValue(item)) === key).reduce((sum, item) => sum + amountGetter(item), 0);
};
var sumByYear = (entities, year, amountGetter) => {
  const totals = getPeriodTotals(entities, amountGetter);
  if (totals) return totals.year.get(String(year)) || 0;
  return toArray(entities).filter((item) => dateKey2(getDateValue(item)).startsWith(`${year}-`)).reduce((sum, item) => sum + amountGetter(item), 0);
};
var sumByDateRange = (entities, startKey, endKey, amountGetter) => toArray(entities).filter((item) => {
  const key = dateKey2(getDateValue(item));
  return key && key >= startKey && key <= endKey;
}).reduce((sum, item) => sum + amountGetter(item), 0);
var sumMapByDateRange = (costByDate = /* @__PURE__ */ new Map(), startKey = "", endKey = "") => [...costByDate.entries()].filter(([key]) => key && key >= startKey && key <= endKey).reduce((sum, [, value]) => sum + toNumber(value), 0);
var isInQuarter = (entity, now) => {
  const date = parseDate(getDateValue(entity));
  if (!date) return false;
  const quarter = Math.floor(now.getMonth() / 3);
  return date.getFullYear() === now.getFullYear() && Math.floor(date.getMonth() / 3) === quarter;
};
var buildSeriesDays = ({ orders, expenses, payments, today, days }) => {
  const rows = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const key = dateKey2(addDays(today, -index));
    const revenue = sumByDate(orders, key, orderTotal);
    const expense = sumByDate(expenses, key, moneyOfExpense);
    const income = sumByDate(payments, key, moneyOfPayment);
    rows.push({ date: key, revenue, expense, operatingExpense: expense, income, profit: revenue - expense, cashflow: income - expense });
  }
  return rows;
};
var buildSeriesMonths = ({ orders, expenses, payments, today, months }) => {
  const rows = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const key = monthKey(addMonths(today, -index));
    const revenue = sumByMonth(orders, key, orderTotal);
    const expense = sumByMonth(expenses, key, moneyOfExpense);
    const income = sumByMonth(payments, key, moneyOfPayment);
    rows.push({ month: key, revenue, expense, operatingExpense: expense, income, profit: revenue - expense, cashflow: income - expense });
  }
  return rows;
};
var normalizeInput = (input = {}) => ({
  now: input.now ? new BusinessDate(input.now) : new BusinessDate(),
  company: input.company || {},
  employee: input.employee || {},
  orders: toCollectionArray(input.orders).filter((item) => !isArchived(item) && !isCancelled(item)),
  orderRequests: toCollectionArray(input.orderRequests).filter((item) => !isArchived(item) && !isCancelled(item)),
  payments: toCollectionArray(input.payments).filter((item) => !isArchived(item)),
  expenses: toCollectionArray(input.expenses).filter((item) => !isArchived(item)),
  cashExpenseRecords: input.cashExpenseRecords,
  financials: toCollectionArray(input.financials).filter((item) => !isArchived(item)),
  payrollCosts: toCollectionArray(input.payrollCosts).filter((item) => !isArchived(item)),
  debtLedger: toCollectionArray(input.debtLedger),
  hasDebtLedger: input.debtLedger !== void 0,
  advances: toCollectionArray(input.advances || input.advanceRequests).filter((item) => !isArchived(item) && !isCancelled(item)),
  products: toCollectionArray(input.products).filter((item) => !isArchived(item)),
  customers: toCollectionArray(input.customers).filter((item) => !isArchived(item)),
  employees: toCollectionArray(input.employees).filter((item) => !isArchived(item)),
  attendance: toCollectionArray(input.attendance).filter((item) => !isArchived(item)),
  warehouseImports: toCollectionArray(input.warehouseImports).filter((item) => !isArchived(item)),
  warehouseDispatches: toCollectionArray(input.warehouseDispatches).filter((item) => !isArchived(item) && item.__pendingFirebaseSync !== true),
  warehouseStockCounts: toCollectionArray(input.warehouseStockCounts).filter((item) => !isArchived(item)),
  assets: toCollectionArray(input.assets).filter((item) => !isArchived(item)),
  assetCostLogs: toCollectionArray(input.assetCostLogs).filter((item) => !isArchived(item)),
  deliveryReports: toCollectionArray(input.deliveryReports).filter((item) => !isArchived(item))
});
var classifyExpense = (expense = {}) => {
  const text3 = normalizeText4([
    expense.category,
    expense.type,
    expense.name,
    expense.title,
    expense.note,
    expense.description,
    expense.reason
  ].filter(Boolean).join(" "));
  if (/gia von|mua hang|hang hoa|nhap kho|nguyen lieu|hang song/.test(text3)) return "Gi\xE1 v\u1ED1n";
  if (/luong|thuong|phat|nhan su|cong nhan|salary|payroll/.test(text3)) return "L\u01B0\u01A1ng";
  if (/thue|mat bang|nha xuong|kho bai|rent/.test(text3)) return "Thu\xEA t\xE0i s\u1EA3n";
  if (/dien|nuoc|internet|nuoc may/.test(text3)) return "\u0110i\u1EC7n n\u01B0\u1EDBc";
  if (/xang|dau|van chuyen|giao hang|fuel/.test(text3)) return "X\u0103ng d\u1EA7u";
  return "Chi ph\xED kh\xE1c";
};
var topRows = (map, valueKey = "value", limit = 10) => [...map.entries()].map(([name, payload]) => {
  const data = typeof payload === "number" ? { [valueKey]: payload } : payload;
  const displayName = data.name || data.label || name;
  return {
    id: data.id || normalizeText4(displayName) || `${valueKey}-${Math.random()}`,
    name: displayName,
    label: displayName,
    value: toNumber(data[valueKey] ?? data.value),
    [valueKey]: toNumber(data[valueKey] ?? data.value),
    revenue: toNumber(data.revenue),
    profit: toNumber(data.profit),
    debt: toNumber(data.debt),
    quantity: toNumber(data.quantity),
    orders: toNumber(data.orders)
  };
}).sort((a, b) => toNumber(b[valueKey]) - toNumber(a[valueKey])).slice(0, limit);
var buildDispatchSignature = (dispatch = {}) => `${dispatch.customerId || normalizeText4(dispatch.customerName || dispatch.name)}|${dispatch.productId || normalizeText4(dispatch.productName || dispatch.product || dispatch.itemName)}`;
var buildRequestSignature = (request = {}) => `${request.customerId || normalizeText4(request.customerName || request.name)}|${request.productId || normalizeText4(request.productName || request.product || request.itemName)}`;
var createRequestDeliveryLookup = (dispatches = []) => {
  const cached = activeBuildCache?.deliveries?.get(dispatches);
  if (cached) return cached;
  const bySignature = /* @__PURE__ */ new Map();
  dispatches.forEach((dispatch) => {
    const signature = buildDispatchSignature(dispatch);
    const time = parseDate(getDateValue(dispatch))?.getTime() || 0;
    const previous = bySignature.get(signature);
    bySignature.set(signature, {
      unknownTime: !time || Boolean(previous?.unknownTime),
      latestTime: Math.max(previous?.latestTime ?? -Infinity, time)
    });
  });
  const lookup = (request = {}) => {
    const entry = bySignature.get(buildRequestSignature(request));
    if (!entry) return false;
    const requestTime = parseDate(getDateValue(request))?.getTime() || 0;
    return !requestTime || entry.unknownTime || entry.latestTime >= requestTime;
  };
  activeBuildCache?.deliveries?.set(dispatches, lookup);
  return lookup;
};
var inventoryValueOfImports = (imports = []) => imports.reduce((sum, item) => {
  const direct = toNumber(item.totalAmount ?? item.amount ?? item.totalCost ?? item.finalAmount, NaN);
  if (Number.isFinite(direct)) return sum + direct;
  return sum + toNumber(item.totalKg ?? item.weightKg ?? item.kg) * toNumber(item.unitPrice ?? item.price);
}, 0);
var inventoryValueOfCounts = (counts = []) => counts.reduce((sum, item) => sum + toNumber(item.value ?? item.totalValue ?? item.amount), 0);
var FinancialService = {
  build(source) {
    const today = source.now;
    const todayKey = dateKey2(today);
    const yesterdayKey = dateKey2(addDays(today, -1));
    const weekStartKey = dateKey2(getWeekStartDate(today));
    const weekEndKey = todayKey;
    const currentMonthKey = monthKey(today);
    const previousMonthKey = getPreviousMonthKey(today);
    const year = today.getFullYear();
    const revenueToday = sumByDate(source.orders, todayKey, orderTotal);
    const revenueYesterday = sumByDate(source.orders, yesterdayKey, orderTotal);
    const revenueWeek = sumByDateRange(source.orders, weekStartKey, weekEndKey, orderTotal);
    const revenueMonth = sumByMonth(source.orders, currentMonthKey, orderTotal);
    const revenuePreviousMonth = sumByMonth(source.orders, previousMonthKey, orderTotal);
    const expenseToday = sumByDate(source.expenses, todayKey, moneyOfExpense);
    const expenseYesterday = sumByDate(source.expenses, yesterdayKey, moneyOfExpense);
    const expenseWeek = sumByDateRange(source.expenses, weekStartKey, weekEndKey, moneyOfExpense);
    const expenseMonth = sumByMonth(source.expenses, currentMonthKey, moneyOfExpense);
    const expensePreviousMonth = sumByMonth(source.expenses, previousMonthKey, moneyOfExpense);
    const operatingExpenseToday = expenseToday;
    const operatingExpenseYesterday = expenseYesterday;
    const operatingExpenseWeek = expenseWeek;
    const operatingExpenseMonth = expenseMonth;
    const operatingExpensePreviousMonth = expensePreviousMonth;
    const incomeToday = sumByDate(source.payments, todayKey, moneyOfPayment);
    const outcomeToday = expenseToday;
    const incomeWeek = sumByDateRange(source.payments, weekStartKey, weekEndKey, moneyOfPayment);
    const outcomeWeek = expenseWeek;
    const incomeMonth = sumByMonth(source.payments, currentMonthKey, moneyOfPayment);
    const outcomeMonth = expenseMonth;
    const profitToday = revenueToday - expenseToday;
    const profitYesterday = revenueYesterday - expenseYesterday;
    const profitWeek = revenueWeek - expenseWeek;
    const profitMonth = revenueMonth - expenseMonth;
    const profitPreviousMonth = revenuePreviousMonth - expensePreviousMonth;
    const quarterProfit = source.orders.filter((order) => isInQuarter(order, today)).reduce((sum, order) => sum + orderTotal(order), 0) - source.expenses.filter((expense) => isInQuarter(expense, today)).reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
    const yearProfit = sumByYear(source.orders, year, orderTotal) - sumByYear(source.expenses, year, moneyOfExpense);
    const customerProfileReceivable = source.customers.reduce((sum, customer) => sum + Math.max(0, toNumber(customer.currentDebt ?? customer.debt ?? customer.balanceDue)), 0);
    const orderReceivable = source.orders.reduce((sum, order) => sum + outstandingOfOrder(order), 0);
    const receivables = source.hasDebtLedger ? source.debtLedger.reduce((sum, row) => sum + Math.max(0, toNumber(row.debt)), 0) : orderReceivable > 0 ? orderReceivable : customerProfileReceivable;
    const payables = source.expenses.filter((expense) => ["pending", "unpaid", "draft"].includes(normalizeText4(expense.status)) || expense.isPaid === false).reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
    const overdueReceivables = source.orders.reduce((sum, order) => {
      const dueDate = parseDate(order.dueDate || order.paymentDueDate);
      const outstanding = outstandingOfOrder(order);
      return dueDate && dueDate < today && outstanding > 0 ? sum + outstanding : sum;
    }, 0);
    const cashBalance = source.payments.reduce((sum, item) => sum + moneyOfPayment(item), 0) - source.expenses.reduce((sum, item) => sum + moneyOfExpense(item), 0);
    const cashflowMonth = incomeMonth - outcomeMonth;
    const cashflowPreviousMonth = sumByMonth(source.payments, previousMonthKey, moneyOfPayment) - expensePreviousMonth;
    const series7Days = buildSeriesDays({ orders: source.orders, expenses: source.expenses, payments: source.payments, today, days: 7 });
    const series30Days = buildSeriesDays({ orders: source.orders, expenses: source.expenses, payments: source.payments, today, days: 30 });
    const series12Months = buildSeriesMonths({ orders: source.orders, expenses: source.expenses, payments: source.payments, today, months: 12 });
    const costBreakdownMap = /* @__PURE__ */ new Map();
    source.expenses.filter((expense) => monthKey(getDateValue(expense)) === currentMonthKey).forEach((expense) => {
      const category = classifyExpense(expense);
      costBreakdownMap.set(category, (costBreakdownMap.get(category) || 0) + moneyOfExpense(expense));
    });
    const costBreakdown = ["Gi\xE1 v\u1ED1n", "L\u01B0\u01A1ng", "Thu\xEA t\xE0i s\u1EA3n", "\u0110i\u1EC7n n\u01B0\u1EDBc", "X\u0103ng d\u1EA7u", "Chi ph\xED kh\xE1c"].map((name) => ({ name, value: costBreakdownMap.get(name) || 0 }));
    return {
      todayKey,
      yesterdayKey,
      weekStartKey,
      weekEndKey,
      currentMonthKey,
      previousMonthKey,
      revenueToday,
      revenueYesterday,
      revenueWeek,
      revenueMonth,
      revenuePreviousMonth,
      revenueChangePct: percentChange(revenueMonth, revenuePreviousMonth),
      profitToday,
      profitYesterday,
      profitWeek,
      profitMonth,
      profitPreviousMonth,
      quarterProfit,
      yearProfit,
      expenseToday,
      expenseYesterday,
      expenseWeek,
      expenseMonth,
      expensePreviousMonth,
      operatingExpenseToday,
      operatingExpenseYesterday,
      operatingExpenseWeek,
      operatingExpenseMonth,
      operatingExpensePreviousMonth,
      expenseChangePct: percentChange(expenseMonth, expensePreviousMonth),
      incomeToday,
      outcomeToday,
      incomeWeek,
      outcomeWeek,
      incomeMonth,
      outcomeMonth,
      cashBalance,
      cashflowMonth,
      cashflowPreviousMonth,
      receivables,
      payables,
      overdueReceivables,
      series7Days,
      series30Days,
      dailyCashflowRows: series30Days,
      series12Months,
      costBreakdown
    };
  }
};
var CostAnalysisService = {
  build(source, finance) {
    const daysPassed = Math.max(1, source.now.getDate());
    const activeEmployees = payrollEmployeesOf(source.employees, source.now).length || 1;
    const salaryMonth = toArray(finance.costBreakdown).filter((row) => row.name === "L\u01B0\u01A1ng").reduce((sum, row) => sum + toNumber(row.value), 0);
    return {
      totalMonth: finance.expenseMonth,
      previousMonth: finance.expensePreviousMonth,
      averageDaily: finance.expenseMonth / daysPassed,
      salaryMonth,
      salaryAverageDaily: salaryMonth / daysPassed,
      salaryAverageEmployee: salaryMonth / activeEmployees,
      salaryToRevenuePct: finance.revenueMonth > 0 ? salaryMonth / finance.revenueMonth * 100 : 0,
      byDepartment: finance.expenseByDepartment || [],
      trend: {
        currentMonth: finance.expenseMonth,
        previousMonth: finance.expensePreviousMonth,
        changePct: percentChange(finance.expenseMonth, finance.expensePreviousMonth)
      }
    };
  }
};
var productGroupOf = (entity = {}, productsById = /* @__PURE__ */ new Map()) => {
  const product = entity.productId ? productsById.get(entity.productId) : null;
  return entity.mainGroup || entity.groupName || entity.productGroup || entity.category || product?.mainGroup || product?.groupName || product?.productGroup || product?.category || product?.name || entity.productName || entity.name || "Ch\u01B0a ph\xE2n nh\xF3m";
};
var productProfitKeyOf = (entity = {}, productsById = /* @__PURE__ */ new Map()) => {
  const product = entity.productId ? productsById.get(entity.productId) : null;
  return entity.productId || product?.id || normalizeText4(entity.productName || entity.name || entity.groupName || product?.name || product?.shortName || "san-pham");
};
var inventoryCostKeyOf = (entity = {}, productsById = /* @__PURE__ */ new Map()) => {
  const group = productGroupOf(entity, productsById);
  return normalizeText4(group || productProfitKeyOf(entity, productsById) || "san-pham");
};
var quantityUnitOf = (entity = {}, fallback = "\u0111\u01A1n v\u1ECB") => entity.quantityUnit || entity.unit || entity.stockUnit || entity.productUnit || fallback;
var importQuantityOf = (item = {}) => toNumber(
  item.quantity ?? item.totalQuantity ?? item.count ?? item.pieceCount ?? item.packageCount
);
var importKgOf = (item = {}) => toNumber(
  item.totalKg ?? item.weightKg ?? item.kg ?? item.weight
);
var dispatchQuantityOf = (item = {}) => toNumber(
  item.quantity ?? item.pieceCount ?? item.quantityCount ?? item.totalQuantity ?? item.count
);
var dispatchKgOf = (item = {}) => toNumber(
  item.weightKg ?? item.totalKg ?? item.kg ?? item.weight
);
var addQuantityByUnit = (target = {}, unit = "", value = 0) => {
  const normalizedUnit = String(unit || "").trim() || "\u0111v";
  const quantity = toNumber(value);
  if (quantity <= 0) return target;
  target[normalizedUnit] = (target[normalizedUnit] || 0) + quantity;
  return target;
};
var mergeQuantityByUnit = (target = {}, source = {}) => {
  Object.entries(source || {}).forEach(([unit, value]) => addQuantityByUnit(target, unit, value));
  return target;
};
var PROFIT_QUANTITY_UNIT_PRIORITY = ["Con", "Kg", "Bo", "Bao", "Boc", "Thung", "Cai"];
var selectPrimaryProfitQuantity = (quantityByUnit = {}, preferredUnit = "") => {
  const entries = Object.entries(quantityByUnit || {}).map(([unit, value]) => ({ unit, quantity: toNumber(value) })).filter((entry) => entry.quantity > 0);
  if (!entries.length) return null;
  const priorityUnits = [preferredUnit, ...PROFIT_QUANTITY_UNIT_PRIORITY].filter(Boolean);
  for (const priorityUnit of priorityUnits) {
    const match = entries.find((entry) => normalizeText4(entry.unit) === normalizeText4(priorityUnit));
    if (match) return match;
  }
  return entries[0];
};
var profitQuantityBasisOf = (row = {}) => {
  const dispatchBasis = selectPrimaryProfitQuantity(row.dispatchQuantitiesByUnit, row.unit);
  if (dispatchBasis?.quantity > 0) return dispatchBasis;
  const soldQuantity = toNumber(row.soldQuantity ?? row.quantitySold);
  if (soldQuantity > 0) return { unit: row.unit || "dv", quantity: soldQuantity };
  const inputQuantity = toNumber(row.inputQuantity ?? row.todayInputQty);
  if (inputQuantity > 0) return { unit: row.unit || "dv", quantity: inputQuantity };
  return { unit: row.unit || "dv", quantity: 0 };
};
var importValueOf = (item = {}) => {
  const direct = toNumber(item.amount ?? item.totalAmount ?? item.total ?? item.value ?? item.costAmount, NaN);
  if (Number.isFinite(direct)) return direct;
  const kg = importKgOf(item);
  const quantity = importQuantityOf(item);
  const unitPrice = toNumber(item.unitPrice ?? item.price ?? item.costPrice ?? item.purchasePrice);
  if (kg > 0 && unitPrice > 0) return kg * unitPrice;
  if (quantity > 0 && unitPrice > 0) return quantity * unitPrice;
  return 0;
};
var PROFIT_EVENT_ORDER = { import: 0, dispatch: 1, sale: 1, revenue: 2 };
var canonicalDay = /^\d{4}-\d{2}-\d{2}$/;
var sortProfitEvents = (a, b) => {
  const dayCompare = a.dateKey === b.dateKey ? 0 : canonicalDay.test(a.dateKey) && canonicalDay.test(b.dateKey) ? a.dateKey < b.dateKey ? -1 : 1 : a.dateKey.localeCompare(b.dateKey);
  if (dayCompare !== 0) return dayCompare;
  if (a.type === b.type) return 0;
  return (PROFIT_EVENT_ORDER[a.type] ?? 9) - (PROFIT_EVENT_ORDER[b.type] ?? 9);
};
var buildProfitRow = (state = {}) => {
  const soldQuantity = toNumber(state.todaySoldQty);
  const revenue = toNumber(state.todayRevenue);
  const inputCost = toNumber(state.todayCost);
  const profit = revenue - inputCost;
  const dispatchQuantitiesByUnit = { ...state.dispatchQuantitiesByUnit || {} };
  const quantityBasis = profitQuantityBasisOf({
    ...state,
    soldQuantity,
    quantitySold: soldQuantity,
    inputQuantity: toNumber(state.todayInputQty),
    dispatchQuantitiesByUnit
  });
  const costQuantity = toNumber(quantityBasis.quantity);
  const averageInputCost = costQuantity > 0 ? inputCost / costQuantity : state.todayInputQty > 0 ? state.todayInputValue / state.todayInputQty : state.carryQty > 0 ? state.carryValue / state.carryQty : 0;
  const averageSalePrice = costQuantity > 0 ? revenue / costQuantity : 0;
  return {
    id: state.key,
    name: state.name,
    groupName: state.groupName,
    unit: state.unit || "\u0111\u01A1n v\u1ECB",
    inputQuantity: toNumber(state.todayInputQty),
    inputKg: toNumber(state.todayInputKg),
    inputValue: toNumber(state.todayInputValue),
    soldQuantity,
    quantitySold: soldQuantity,
    dispatchQuantitiesByUnit,
    revenue,
    inputCost,
    cost: inputCost,
    costQuantity,
    costQuantityUnit: quantityBasis.unit,
    averageInputCost,
    averageSalePrice,
    profitPerUnit: averageSalePrice - averageInputCost,
    profit,
    carryoverQuantity: Math.max(0, toNumber(state.carryQty)),
    carryoverValue: Math.max(0, toNumber(state.carryValue)),
    value: profit
  };
};
var aggregateProfitRowsByGroup = (rows = []) => {
  const groupMap = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    const key = normalizeText4(row.groupName || row.name) || "chua-phan-nhom";
    const current = groupMap.get(key) || {
      id: key,
      name: row.groupName || row.name || "Ch\u01B0a ph\xE2n nh\xF3m",
      groupName: row.groupName || row.name || "Ch\u01B0a ph\xE2n nh\xF3m",
      unit: row.unit || "\u0111\u01A1n v\u1ECB",
      inputQuantity: 0,
      inputKg: 0,
      inputValue: 0,
      soldQuantity: 0,
      quantitySold: 0,
      dispatchQuantitiesByUnit: {},
      revenue: 0,
      inputCost: 0,
      cost: 0,
      profit: 0,
      carryoverQuantity: 0,
      carryoverValue: 0,
      products: 0
    };
    current.inputQuantity += row.inputQuantity || 0;
    current.inputKg += row.inputKg || 0;
    current.inputValue += row.inputValue || 0;
    current.soldQuantity += row.soldQuantity || 0;
    current.quantitySold = current.soldQuantity;
    mergeQuantityByUnit(current.dispatchQuantitiesByUnit, row.dispatchQuantitiesByUnit);
    current.revenue += row.revenue || 0;
    current.inputCost += row.inputCost || 0;
    current.cost = current.inputCost;
    current.profit += row.profit || 0;
    current.carryoverQuantity += row.carryoverQuantity || 0;
    current.carryoverValue += row.carryoverValue || 0;
    current.products += 1;
    groupMap.set(key, current);
  });
  return [...groupMap.values()].map((row) => {
    const quantityBasis = profitQuantityBasisOf(row);
    const costQuantity = toNumber(quantityBasis.quantity);
    return {
      ...row,
      costQuantity,
      costQuantityUnit: quantityBasis.unit,
      averageInputCost: costQuantity > 0 ? row.inputCost / costQuantity : row.inputQuantity > 0 ? row.inputValue / row.inputQuantity : 0,
      averageSalePrice: costQuantity > 0 ? row.revenue / costQuantity : 0,
      profitPerUnit: costQuantity > 0 ? row.profit / costQuantity : 0,
      value: row.profit
    };
  }).sort((a, b) => b.profit - a.profit);
};
var prepareProfitabilityEvents = (source, todayKey, requestedDays) => {
  const productsById = new Map(source.products.map((product) => [product.id, product]));
  const dispatchSummaries = /* @__PURE__ */ new Map();
  const dispatchUsageKeysByDate = /* @__PURE__ */ new Set();
  const events = [];
  source.warehouseDispatches.forEach((dispatch) => {
    const eventDateKey = dateKey2(getDateValue(dispatch));
    if (!eventDateKey || eventDateKey > todayKey) return;
    const quantity = dispatchQuantityOf(dispatch);
    const kg = dispatchKgOf(dispatch);
    if (quantity <= 0 && kg <= 0) return;
    const key = inventoryCostKeyOf(dispatch, productsById);
    dispatchUsageKeysByDate.add(`${eventDateKey}__${key}`);
    events.push({
      type: "dispatch",
      dateKey: eventDateKey,
      key,
      name: productNameOf(dispatch, productsById),
      groupName: productGroupOf(dispatch, productsById),
      unit: quantity > 0 ? quantityUnitOf(dispatch, "Con") : "Kg",
      quantity: quantity > 0 ? quantity : kg,
      kg,
      fallbackCostPerUnit: itemCost(dispatch)
    });
    if (!requestedDays.has(eventDateKey)) return;
    if (!dispatchSummaries.has(eventDateKey)) dispatchSummaries.set(eventDateKey, /* @__PURE__ */ new Map());
    const dispatchSummaryMap = dispatchSummaries.get(eventDateKey);
    const summary = dispatchSummaryMap.get(key) || {
      key,
      name: productNameOf(dispatch, productsById),
      groupName: productGroupOf(dispatch, productsById),
      unit: quantityUnitOf(dispatch, kg > 0 ? "Kg" : "Con"),
      dispatchQuantitiesByUnit: {}
    };
    if (quantity > 0) addQuantityByUnit(summary.dispatchQuantitiesByUnit, quantityUnitOf(dispatch, "Con"), quantity);
    if (kg > 0) addQuantityByUnit(summary.dispatchQuantitiesByUnit, "Kg", kg);
    dispatchSummaryMap.set(key, summary);
  });
  source.warehouseImports.forEach((item) => {
    const eventDateKey = dateKey2(getDateValue(item));
    if (!eventDateKey || eventDateKey > todayKey) return;
    const quantity = importQuantityOf(item);
    const kg = importKgOf(item);
    const value = importValueOf(item);
    const primaryQuantity = quantity > 0 ? quantity : kg;
    if (primaryQuantity <= 0 && value <= 0) return;
    const key = inventoryCostKeyOf(item, productsById);
    const name = item.productName || item.name || item.groupName || item.productGroup || productNameOf(item, productsById);
    events.push({
      type: "import",
      dateKey: eventDateKey,
      key,
      name,
      groupName: productGroupOf(item, productsById),
      unit: quantity > 0 ? quantityUnitOf(item, "con") : "kg",
      quantity: primaryQuantity,
      kg,
      value
    });
  });
  source.orders.forEach((order) => {
    const eventDateKey = dateKey2(getDateValue(order));
    if (!eventDateKey || eventDateKey > todayKey) return;
    getItems(order).forEach((item) => {
      const quantity = itemQuantity(item);
      const revenue = itemLineTotal(item);
      if (quantity <= 0 && revenue <= 0) return;
      const key = inventoryCostKeyOf(item, productsById);
      events.push({
        type: "revenue",
        dateKey: eventDateKey,
        key,
        name: productNameOf(item, productsById),
        groupName: productGroupOf(item, productsById),
        unit: quantityUnitOf(item, productsById.get(item.productId)?.unit || "\u0111\u01A1n v\u1ECB"),
        quantity,
        revenue,
        fallbackCostPerUnit: itemCost(item)
      });
      if (dispatchUsageKeysByDate.has(`${eventDateKey}__${key}`)) return;
      events.push({
        type: "sale",
        dateKey: eventDateKey,
        key,
        name: productNameOf(item, productsById),
        groupName: productGroupOf(item, productsById),
        unit: quantityUnitOf(item, productsById.get(item.productId)?.unit || "dv"),
        quantity,
        fallbackCostPerUnit: itemCost(item)
      });
    });
  });
  return { events: events.sort(sortProfitEvents), dispatchSummaries };
};
var buildPreparedProfitability = ({ events, dispatchSummaries }, todayKey, progress) => {
  const stateMap = progress?.states || /* @__PURE__ */ new Map();
  if (progress) for (const state of stateMap.values()) {
    state.todayInputQty = 0;
    state.todayInputKg = 0;
    state.todayInputValue = 0;
    state.todaySoldQty = 0;
    state.todayRevenue = 0;
    state.todayCost = 0;
    state.dispatchQuantitiesByUnit = {};
  }
  const ensureState = (event) => {
    if (!stateMap.has(event.key)) {
      stateMap.set(event.key, {
        key: event.key,
        name: event.name,
        groupName: event.groupName,
        unit: event.unit,
        carryQty: 0,
        carryValue: 0,
        todayInputQty: 0,
        todayInputKg: 0,
        todayInputValue: 0,
        todaySoldQty: 0,
        todayRevenue: 0,
        todayCost: 0,
        dispatchQuantitiesByUnit: {}
      });
    }
    const state = stateMap.get(event.key);
    state.name = state.name || event.name;
    state.groupName = state.groupName || event.groupName;
    state.unit = state.unit || event.unit;
    return state;
  };
  let end = progress?.index || 0;
  if (progress) while (end < events.length && events[end].dateKey <= todayKey) end++;
  (progress ? events.slice(progress.index, end) : events).forEach((event) => {
    if (event.dateKey > todayKey) return;
    const state = ensureState(event);
    if (event.type === "import") {
      state.carryQty += event.quantity;
      state.carryValue += event.value;
      if (event.dateKey === todayKey) {
        state.todayInputQty += event.quantity;
        state.todayInputKg += event.kg || 0;
        state.todayInputValue += event.value;
      }
      return;
    }
    if (event.type === "revenue") {
      if (event.dateKey === todayKey) {
        state.todayRevenue += event.revenue || 0;
      }
      return;
    }
    const quantity = event.quantity || 0;
    const averageCost = state.carryQty > 0 ? state.carryValue / state.carryQty : toNumber(event.fallbackCostPerUnit);
    const saleCost = quantity * averageCost;
    state.carryQty = Math.max(0, state.carryQty - quantity);
    state.carryValue = Math.max(0, state.carryValue - saleCost);
    if (event.dateKey === todayKey) {
      state.todaySoldQty += quantity;
      state.todayCost += saleCost;
    }
  });
  if (progress) progress.index = end;
  dispatchSummaries.get(todayKey)?.forEach((summary) => {
    const state = ensureState(summary);
    mergeQuantityByUnit(state.dispatchQuantitiesByUnit, summary.dispatchQuantitiesByUnit);
  });
  const productRows = [...stateMap.values()].map(buildProfitRow).filter((row) => row.inputQuantity > 0 || row.soldQuantity > 0 || row.carryoverQuantity > 0 || row.revenue > 0 || Object.keys(row.dispatchQuantitiesByUnit || {}).length > 0).sort((a, b) => b.profit - a.profit);
  const groupRows = aggregateProfitRowsByGroup(productRows);
  const totals = productRows.reduce((sum, row) => ({
    revenue: sum.revenue + row.revenue,
    inputCost: sum.inputCost + row.inputCost,
    profit: sum.profit + row.profit,
    soldQuantity: sum.soldQuantity + row.soldQuantity,
    carryoverQuantity: sum.carryoverQuantity + row.carryoverQuantity,
    carryoverValue: sum.carryoverValue + row.carryoverValue
  }), { revenue: 0, inputCost: 0, profit: 0, soldQuantity: 0, carryoverQuantity: 0, carryoverValue: 0 });
  return {
    todayKey,
    totals,
    productRows,
    groupRows,
    topProduct: productRows.find((row) => row.profit > 0) || productRows[0] || null,
    topGroup: groupRows.find((row) => row.profit > 0) || groupRows[0] || null
  };
};
var createProfitabilitySnapshotReader = (source, days) => {
  const requestedDays = new Set(days);
  const orderedDays = [...requestedDays].sort();
  const latestDay = orderedDays.at(-1);
  const prepared = prepareProfitabilityEvents(source, latestDay, requestedDays);
  const snapshots = /* @__PURE__ */ new Map();
  const progress = { states: /* @__PURE__ */ new Map(), index: 0 };
  let nextDay = 0;
  return (day) => {
    if (!requestedDays.has(day)) throw new Error("Profitability day was not prepared.");
    while (nextDay < orderedDays.length && orderedDays[nextDay] <= day) {
      const key = orderedDays[nextDay++];
      snapshots.set(key, buildPreparedProfitability(prepared, key, progress));
    }
    return snapshots.get(day);
  };
};
var ProfitabilityService = {
  build(source, finance) {
    const todayKey = finance.todayKey || dateKey2(source.now);
    return createProfitabilitySnapshotReader(source, [todayKey])(todayKey);
  }
};
function buildHomePeriodProduction(input, periods) {
  const source = normalizeInput(input), today = dateKey2(source.now), allDays = /* @__PURE__ */ new Set();
  const daysByPeriod = {};
  for (const [period, range] of Object.entries(periods)) {
    const days = [];
    const end = range.end < today ? range.end : today;
    for (let ms = BusinessDate.parse(range.start + "T00:00:00Z"); ms <= BusinessDate.parse(end + "T00:00:00Z"); ms += DAY_MS) {
      const day = new BusinessDate(ms).toISOString().slice(0, 10);
      days.push(day);
      allDays.add(day);
    }
    daysByPeriod[period] = days;
  }
  const read = createProfitabilitySnapshotReader(source, [...allDays]);
  return Object.fromEntries(Object.entries(daysByPeriod).map(([period, days]) => {
    const groups = /* @__PURE__ */ new Map();
    for (const day of days) for (const row of read(day).groupRows) {
      const name = row.groupName || row.name;
      const units = groups.get(name) || {};
      mergeQuantityByUnit(units, row.dispatchQuantitiesByUnit);
      groups.set(name, units);
    }
    return [period, [...groups].map(([groupName, quantities]) => ({ groupName, quantities }))];
  }));
}
function* buildInventorySoldCostSteps(source = {}, endDateKey = "") {
  let operations = 0;
  const productsById = new Map(source.products.map((product) => [product.id, product]));
  const dispatchUsageKeysByDate = /* @__PURE__ */ new Set();
  const events = [];
  for (const dispatch of source.warehouseDispatches) {
    if (++operations % 16 === 0) yield;
    const eventDateKey = dateKey2(getDateValue(dispatch));
    if (!eventDateKey || endDateKey && eventDateKey > endDateKey) continue;
    const quantity = dispatchQuantityOf(dispatch);
    const kg = dispatchKgOf(dispatch);
    const primaryQuantity = quantity > 0 ? quantity : kg;
    if (primaryQuantity <= 0) continue;
    const key = inventoryCostKeyOf(dispatch, productsById);
    dispatchUsageKeysByDate.add(`${eventDateKey}__${key}`);
    events.push({
      type: "sale",
      dateKey: eventDateKey,
      key,
      quantity: primaryQuantity,
      fallbackCostPerUnit: itemCost(dispatch)
    });
  }
  for (const item of source.warehouseImports) {
    if (++operations % 16 === 0) yield;
    const eventDateKey = dateKey2(getDateValue(item));
    if (!eventDateKey || endDateKey && eventDateKey > endDateKey) continue;
    const quantity = importQuantityOf(item);
    const kg = importKgOf(item);
    const value = importValueOf(item);
    const primaryQuantity = quantity > 0 ? quantity : kg;
    if (primaryQuantity <= 0 && value <= 0) continue;
    events.push({
      type: "import",
      dateKey: eventDateKey,
      key: inventoryCostKeyOf(item, productsById),
      quantity: primaryQuantity,
      value
    });
  }
  for (const order of source.orders) {
    if (++operations % 16 === 0) yield;
    const eventDateKey = dateKey2(getDateValue(order));
    if (!eventDateKey || endDateKey && eventDateKey > endDateKey) continue;
    for (const item of getItems(order)) {
      if (++operations % 16 === 0) yield;
      const quantity = itemQuantity(item);
      const revenue = itemLineTotal(item);
      if (quantity <= 0 && revenue <= 0) continue;
      const key = inventoryCostKeyOf(item, productsById);
      if (dispatchUsageKeysByDate.has(`${eventDateKey}__${key}`)) continue;
      events.push({
        type: "sale",
        dateKey: eventDateKey,
        key,
        quantity,
        fallbackCostPerUnit: itemCost(item)
      });
    }
  }
  const stateMap = /* @__PURE__ */ new Map();
  const costByDate = /* @__PURE__ */ new Map();
  const sortedEvents = yield* sortProjection(events, sortProfitEvents);
  for (const event of sortedEvents) {
    if (++operations % 16 === 0) yield;
    const state = stateMap.get(event.key) || { carryQty: 0, carryValue: 0 };
    if (event.type === "import") {
      state.carryQty += event.quantity || 0;
      state.carryValue += event.value || 0;
      stateMap.set(event.key, state);
      continue;
    }
    const quantity = event.quantity || 0;
    const averageCost = state.carryQty > 0 ? state.carryValue / state.carryQty : toNumber(event.fallbackCostPerUnit);
    const saleCost = quantity * averageCost;
    state.carryQty = Math.max(0, state.carryQty - quantity);
    state.carryValue = Math.max(0, state.carryValue - saleCost);
    stateMap.set(event.key, state);
    costByDate.set(event.dateKey, (costByDate.get(event.dateKey) || 0) + saleCost);
  }
  return costByDate;
}
var sumInventorySoldCostByMonth = (costByDate = /* @__PURE__ */ new Map(), targetMonthKey = "") => [...costByDate.entries()].filter(([key]) => key.startsWith(targetMonthKey)).reduce((sum, [, value]) => sum + toNumber(value), 0);
function* buildBusinessAnalysisSteps(source, finance, profitability = {}) {
  let operations = 0;
  const customersById = /* @__PURE__ */ new Map();
  source.customers.forEach((customer) => {
    if (customer.id) customersById.set(customer.id, customer);
    if (customer.id) customersById.set(String(customer.id), customer);
    if (customer.customerId) customersById.set(String(customer.customerId), customer);
  });
  const customersByName = /* @__PURE__ */ new Map();
  source.customers.forEach((customer) => {
    const nameKey = normalizeText4(customer.name || customer.displayName || customer.customerName);
    if (nameKey && !customersByName.has(nameKey)) customersByName.set(nameKey, customer);
  });
  const productsById = new Map(source.products.map((product) => [product.id, product]));
  const employeesById = /* @__PURE__ */ new Map();
  source.employees.forEach((employee) => {
    if (employee.id) employeesById.set(employee.id, employee);
    if (employee.id) employeesById.set(String(employee.id), employee);
    if (employee.employeeId) employeesById.set(String(employee.employeeId), employee);
  });
  const customerRevenue = /* @__PURE__ */ new Map();
  const customerProfit = /* @__PURE__ */ new Map();
  const customerDebt = /* @__PURE__ */ new Map();
  const customerDebtFromProfile = /* @__PURE__ */ new Map();
  const productRevenue = /* @__PURE__ */ new Map();
  const productRevenueMonth = /* @__PURE__ */ new Map();
  const productProfit = /* @__PURE__ */ new Map();
  const productProfitMonth = /* @__PURE__ */ new Map();
  const productProfitByDay = /* @__PURE__ */ new Map();
  const employeeRevenue = /* @__PURE__ */ new Map();
  const employeeProfit = /* @__PURE__ */ new Map();
  const salesEmployees = source.employees.filter(isSalesEmployeeRecord);
  const salesEmployeeIds = new Set(salesEmployees.map((employee) => String(employee.id || employee.employeeId || "")));
  const salesEmployeeOrders = [];
  const productPerformanceRows = [];
  const customerPerformanceRows = [];
  salesEmployees.forEach((employee) => {
    const employeeId = String(employee.id || employee.employeeId || employeeDisplayNameOf(employee));
    const employeeName = employeeDisplayNameOf(employee);
    employeeRevenue.set(employeeId, { id: employeeId, name: employeeName, revenue: 0, orders: 0 });
    employeeProfit.set(employeeId, { id: employeeId, name: employeeName, profit: 0, orders: 0 });
  });
  const customerOfOrder = (order = {}) => {
    const customerId = order.customerId || order.customer?.id || order.customer?.customerId || "";
    const customerNameKey = normalizeText4(order.customerName || order.customer?.name || order.name);
    return (customerId ? customersById.get(customerId) || customersById.get(String(customerId)) : null) || (customerNameKey ? customersByName.get(customerNameKey) : null) || null;
  };
  const salesOwnerOfOrder = (order = {}) => {
    const customer = customerOfOrder(order);
    const customerSalesEmpId = customerSalesEmployeeIdOf(customer || {});
    const customerSalesEmployee = customerSalesEmpId ? employeesById.get(customerSalesEmpId) : null;
    if (customerSalesEmployee) {
      const employeeId = String(customerSalesEmployee.id || customerSalesEmpId);
      return { id: employeeId, name: employeeDisplayNameOf(customerSalesEmployee) };
    }
    const orderSalesEmpId = String(
      order.salesEmpId || order.assignedSalesEmpId || order.responsibleEmployeeId || order.employeeId || order.empId || ""
    );
    const orderSalesEmployee = orderSalesEmpId ? employeesById.get(orderSalesEmpId) : null;
    if (orderSalesEmployee) {
      const employeeId = String(orderSalesEmployee.id || orderSalesEmpId);
      return { id: employeeId, name: employeeDisplayNameOf(orderSalesEmployee) };
    }
    const fallbackName = customer?.managerName || customer?.salesName || employeeNameOf(order, employeesById);
    return { id: normalizeText4(fallbackName), name: fallbackName };
  };
  const profitabilityProductRows = toArray(profitability.productRows);
  const profitabilityCostByKey = /* @__PURE__ */ new Map();
  const rememberProfitabilityCost = (key, row) => {
    const normalizedKey = normalizeText4(key);
    if (!normalizedKey || profitabilityCostByKey.has(normalizedKey)) return;
    profitabilityCostByKey.set(normalizedKey, row);
  };
  profitabilityProductRows.forEach((row) => {
    rememberProfitabilityCost(row.id, row);
    rememberProfitabilityCost(row.name, row);
    rememberProfitabilityCost(row.groupName, row);
  });
  const costRowForItem = (item = {}) => {
    const product = item.productId ? productsById.get(item.productId) : null;
    return profitabilityCostByKey.get(inventoryCostKeyOf(item, productsById)) || profitabilityCostByKey.get(normalizeText4(item.productName || item.name || product?.name || product?.shortName)) || profitabilityCostByKey.get(normalizeText4(item.groupName || item.productGroup || product?.groupName || product?.productGroup));
  };
  const itemProfitFromProfitability = (item = {}) => {
    const revenue = itemLineTotal(item);
    const quantity = itemQuantity(item);
    const costRow = costRowForItem(item);
    const averageCost = toNumber(costRow?.averageInputCost, NaN);
    if (quantity > 0 && Number.isFinite(averageCost) && averageCost > 0) {
      return { profit: revenue - quantity * averageCost, hasCost: true };
    }
    const fallbackCost = itemCost(item);
    if (quantity > 0 && fallbackCost > 0) {
      return { profit: revenue - quantity * fallbackCost, hasCost: true };
    }
    return { profit: revenue, hasCost: false };
  };
  const orderProfitFromProfitability = (order = {}) => {
    let hasCost = false;
    const profit = getItems(order).reduce((sum, item) => {
      const itemProfit = itemProfitFromProfitability(item);
      hasCost = hasCost || itemProfit.hasCost;
      return sum + itemProfit.profit;
    }, 0);
    return hasCost ? profit : orderProfit(order);
  };
  source.customers.forEach((customer) => {
    const name = customer.name || customer.displayName || "Kh\xE1ch ch\u01B0a r\xF5";
    const debt = Math.max(0, toNumber(customer.currentDebt ?? customer.debt ?? customer.balanceDue));
    const key = normalizeText4(name);
    if (key && debt > 0) {
      customerDebtFromProfile.set(key, {
        id: customer.id || customer.customerId || key,
        name,
        debt,
        value: debt
      });
    }
  });
  for (const order of source.orders) {
    if (++operations % 16 === 0) yield;
    const customerName = customerNameOf(order, customersById);
    const salesOwner = salesOwnerOfOrder(order);
    const employeeKey = salesOwner.id || normalizeText4(salesOwner.name);
    const revenue = orderTotal(order);
    const profit = orderProfitFromProfitability(order);
    const debt = outstandingOfOrder(order);
    const currentCustomerRevenue = customerRevenue.get(customerName) || { revenue: 0, orders: 0 };
    customerRevenue.set(customerName, { revenue: currentCustomerRevenue.revenue + revenue, orders: currentCustomerRevenue.orders + 1 });
    customerProfit.set(customerName, { profit: (customerProfit.get(customerName)?.profit || 0) + profit });
    if (debt > 0) {
      const debtKey = normalizeText4(customerName);
      const currentDebt = customerDebt.get(debtKey);
      const nextDebt = (currentDebt?.debt || 0) + debt;
      customerDebt.set(debtKey, {
        id: order.customerId || currentDebt?.id || debtKey,
        name: currentDebt?.name || customerName,
        debt: nextDebt,
        value: nextDebt
      });
    }
    const currentEmployeeRevenue = employeeRevenue.get(employeeKey) || { id: employeeKey, name: salesOwner.name, revenue: 0, orders: 0 };
    employeeRevenue.set(employeeKey, {
      ...currentEmployeeRevenue,
      revenue: currentEmployeeRevenue.revenue + revenue,
      orders: currentEmployeeRevenue.orders + 1
    });
    const currentEmployeeProfit = employeeProfit.get(employeeKey) || { id: employeeKey, name: salesOwner.name, profit: 0, orders: 0 };
    employeeProfit.set(employeeKey, {
      ...currentEmployeeProfit,
      profit: currentEmployeeProfit.profit + profit,
      orders: currentEmployeeProfit.orders + 1
    });
    const orderDay = dateKey2(getDateValue(order));
    if (salesEmployeeIds.has(employeeKey) && orderDay && orderDay <= finance.todayKey) {
      salesEmployeeOrders.push({
        date: orderDay,
        id: employeeKey,
        name: salesOwner.name,
        revenue,
        orders: 1,
        orderId: order.id || "",
        orderCode: order.code || order.orderCode || order.id || "",
        customerName,
        salesEmployeeName: salesOwner.name
      });
    }
    if (orderDay && orderDay <= finance.todayKey) {
      customerPerformanceRows.push({
        orderId: order.id || "",
        orderCode: order.code || order.orderCode || order.id || "",
        customerName,
        salesEmployeeName: salesOwner.name,
        date: orderDay,
        id: String(order.customerId || order.customer?.id || normalizeText4(customerName)),
        name: customerName,
        revenue,
        profit,
        orders: 1
      });
      const reportItems = getItems(order);
      const rawItemRevenue = reportItems.reduce((sum, item) => sum + Math.max(0, itemLineTotal(item)), 0);
      const orderRevenueScale = rawItemRevenue > 0 ? revenue / rawItemRevenue : 0;
      const itemProfitRows = reportItems.map((item) => ({
        item,
        revenue: rawItemRevenue > 0 ? Math.max(0, itemLineTotal(item)) * orderRevenueScale : revenue / Math.max(1, reportItems.length),
        profit: itemProfitFromProfitability(item).profit,
        weight: rawItemRevenue > 0 ? Math.max(0, itemLineTotal(item)) / rawItemRevenue : 1 / Math.max(1, reportItems.length)
      }));
      const itemProfitTotal = itemProfitRows.reduce((sum, row) => sum + row.profit, 0);
      itemProfitRows.forEach(({ item, revenue: itemRevenue, profit: baseProfit, weight }) => {
        const productName = productNameOf(item, productsById);
        productPerformanceRows.push({
          date: orderDay,
          id: String(item.productId || normalizeText4(productName)),
          name: productName,
          revenue: itemRevenue,
          profit: baseProfit + (profit - itemProfitTotal) * weight,
          quantity: itemQuantity(item)
        });
      });
      if (!reportItems.length && revenue > 0) productPerformanceRows.push({
        date: orderDay,
        id: "unassigned-product",
        name: "Ch\u01B0a c\xF3 chi ti\u1EBFt m\u1EB7t h\xE0ng",
        revenue,
        profit,
        quantity: 0
      });
    }
    for (const item of getItems(order)) {
      if (++operations % 16 === 0) yield;
      const productName = productNameOf(item, productsById);
      const itemRevenue = itemLineTotal(item);
      const itemQty = itemQuantity(item);
      const itemProfit = itemProfitFromProfitability(item).profit;
      const productRevenueRow = productRevenue.get(productName) || { revenue: 0, quantity: 0 };
      productRevenue.set(productName, { revenue: productRevenueRow.revenue + itemRevenue, quantity: productRevenueRow.quantity + itemQty });
      if (monthKey(getDateValue(order)) === finance.currentMonthKey) {
        const monthRevenueRow = productRevenueMonth.get(productName) || {
          id: item.productId || normalizeText4(productName),
          name: productName,
          revenue: 0,
          quantity: 0
        };
        productRevenueMonth.set(productName, {
          ...monthRevenueRow,
          revenue: monthRevenueRow.revenue + itemRevenue,
          quantity: monthRevenueRow.quantity + itemQty
        });
      }
      const productProfitRow = productProfit.get(productName) || { profit: 0, revenue: 0, quantity: 0 };
      productProfit.set(productName, { profit: productProfitRow.profit + itemProfit, revenue: productProfitRow.revenue + itemRevenue, quantity: productProfitRow.quantity + itemQty });
      if (monthKey(getDateValue(order)) === finance.currentMonthKey) {
        const monthProfitRow = productProfitMonth.get(productName) || {
          id: item.productId || normalizeText4(productName),
          name: productName,
          profit: 0,
          revenue: 0,
          quantity: 0
        };
        productProfitMonth.set(productName, {
          ...monthProfitRow,
          profit: monthProfitRow.profit + itemProfit,
          revenue: monthProfitRow.revenue + itemRevenue,
          quantity: monthProfitRow.quantity + itemQty
        });
      }
      if (monthKey(getDateValue(order)) === finance.currentMonthKey) {
        if (!productProfitByDay.has(productName)) productProfitByDay.set(productName, /* @__PURE__ */ new Map());
        const dayMap = productProfitByDay.get(productName);
        const currentDay = dayMap.get(orderDay) || { revenue: 0, profit: 0 };
        dayMap.set(orderDay, {
          revenue: currentDay.revenue + itemRevenue,
          profit: currentDay.profit + itemProfit
        });
      }
    }
  }
  customerDebtFromProfile.forEach((profileDebt, key) => {
    if (!customerDebt.has(key)) customerDebt.set(key, profileDebt);
  });
  const topProductsByAverageDailyProfit = [...productProfitByDay.entries()].map(([name, dayMap]) => {
    const dailyRows = [...dayMap.values()];
    const totalRevenue = dailyRows.reduce((sum, value) => sum + toNumber(value?.revenue), 0);
    const totalProfit = dailyRows.reduce((sum, value) => sum + toNumber(value?.profit), 0);
    const totalCost = totalRevenue - totalProfit;
    const activeDays = Math.max(1, dayMap.size);
    return {
      id: normalizeText4(name),
      name,
      revenue: totalRevenue,
      cost: totalCost,
      profit: totalProfit,
      activeDays,
      averageDailyRevenue: totalRevenue / activeDays,
      averageDailyCost: totalCost / activeDays,
      averageDailyProfit: totalProfit / activeDays,
      value: totalProfit / activeDays
    };
  }).filter((row) => row.averageDailyProfit > 0).sort((a, b) => b.averageDailyProfit - a.averageDailyProfit).slice(0, 10);
  const topProductsByRevenueFromMonth = topRows(productRevenueMonth, "revenue", productRevenueMonth.size || 10);
  const topProductsByProfitFromMonth = topRows(productProfitMonth, "profit", productProfitMonth.size || 10);
  const daysPassed = Math.max(1, source.now.getDate());
  return {
    topCustomersByRevenue: topRows(customerRevenue, "revenue"),
    topCustomersByProfit: topRows(customerProfit, "profit"),
    topProductsByRevenue: topProductsByRevenueFromMonth,
    topProductsByProfit: topProductsByProfitFromMonth,
    topProductsByAverageDailyProfit,
    topEmployeesByRevenue: topRows(employeeRevenue, "revenue", employeeRevenue.size || 10),
    topEmployeesByProfit: topRows(employeeProfit, "profit", employeeProfit.size || 10),
    topCustomersByDebt: source.hasDebtLedger ? source.debtLedger.filter((row) => toNumber(row.debt) > 0).map((row) => ({ ...row, value: toNumber(row.debt), debt: toNumber(row.debt) })).sort((a, b) => b.debt - a.debt).slice(0, 30) : topRows(customerDebt, "debt", 30),
    debtCustomerCount: source.hasDebtLedger ? source.debtLedger.filter((row) => toNumber(row.debt) > 0).length : [...customerDebt.values()].filter((row) => toNumber(row.debt) > 0).length,
    productPerformanceRows,
    customerPerformanceRows,
    salesEmployeeOrders,
    revenuePerDay: finance.revenueMonth / daysPassed,
    profitPerDay: finance.profitMonth / daysPassed,
    profitMarginPct: finance.revenueMonth > 0 ? finance.profitMonth / finance.revenueMonth * 100 : 0
  };
}
var buildOperations = (source, finance) => {
  const todayKey = finance.todayKey;
  const stockCountValue = inventoryValueOfCounts(source.warehouseStockCounts);
  const importValue = inventoryValueOfImports(source.warehouseImports);
  const inventoryValue = stockCountValue > 0 ? stockCountValue : importValue;
  const inventoryQuantity = source.warehouseStockCounts.reduce((sum, item) => sum + toNumber(item.quantity ?? item.count ?? item.pieceCount ?? item.totalQuantity), 0);
  const lowStockProducts = source.products.filter((product) => {
    const minimum = toNumber(product.minStock ?? product.minimumStock, NaN);
    const stock = toNumber(product.stock ?? product.quantity ?? product.remainingStock, NaN);
    return Number.isFinite(minimum) && Number.isFinite(stock) && stock <= minimum;
  });
  const slowMovingRows = source.products.filter((product) => toNumber(product.daysInStock ?? product.stockAgeDays ?? product.daysWithoutSale ?? product.slowDays) >= 7).slice(0, 10);
  const attendanceToday = source.attendance.filter((item) => dateKey2(getDateValue(item)) === todayKey);
  const presentEmployeeIds = new Set(attendanceToday.filter((item) => item.checkIn || item.checkInAt || item.inAt || item.startTime).map((item) => item.employeeId || item.empId || item.userId).filter(Boolean));
  const leaveEmployeeIds = new Set(attendanceToday.filter((item) => /nghi|leave|phep/.test(normalizeText4(item.status || item.type))).map((item) => item.employeeId || item.empId || item.userId).filter(Boolean));
  const assetsInMaintenance = source.assets.filter((asset) => /bao tri|maintenance|sua chua/.test(normalizeText4(asset.status)));
  const assetsInUse = source.assets.filter((asset) => /dang hoat dong|dang su dung|active|in use/.test(normalizeText4(asset.status)));
  const assetsDueMaintenance = source.assets.filter((asset) => {
    const next = parseDate(asset.nextMaintenanceDate || asset.maintenanceDueDate || asset.inspectionExpiryDate || asset.registrationExpiryDate);
    return next && next.getTime() - source.now.getTime() <= 15 * DAY_MS && next >= source.now;
  });
  return {
    inventoryValue,
    inventoryQuantity,
    lowStockProducts: lowStockProducts.length,
    lowStockRows: lowStockProducts.slice(0, 10),
    slowMovingProducts: slowMovingRows.length,
    slowMovingRows,
    employeesPresentToday: presentEmployeeIds.size,
    employeesAbsentToday: Math.max(0, source.employees.length - presentEmployeeIds.size - leaveEmployeeIds.size),
    employeesOnLeaveToday: leaveEmployeeIds.size,
    monthlySalaryCost: payrollEmployeesOf(source.employees, source.now).reduce((sum, row) => sum + row.salary, 0),
    assetsTotal: source.assets.length,
    assetsInUse: assetsInUse.length,
    assetsInMaintenance: assetsInMaintenance.length,
    assetsDueMaintenance: assetsDueMaintenance.length,
    assetsDueMaintenanceRows: assetsDueMaintenance.slice(0, 10)
  };
};
var AlertService = {
  build(source, dashboard) {
    const alerts = [];
    const add = (alert) => alerts.push({
      severity: alert.severity || alert.level || "medium",
      time: alert.time || dashboard.period.todayKey,
      ...alert
    });
    if (dashboard.finance.overdueReceivables > 0) {
      add({ id: "overdueDebt", severity: "high", title: "Kh\xE1ch n\u1EE3 qu\xE1 h\u1EA1n", message: `C\xF2n ${Math.round(dashboard.finance.overdueReceivables / 1e6)} tri\u1EC7u c\u1EA7n thu h\u1ED3i ho\u1EB7c \u0111\u1ED1i chi\u1EBFu.`, targetTab: "debt" });
    }
    if (dashboard.finance.receivables > 0) {
      const overLimit = source.customers.filter((customer) => {
        const debt = toNumber(customer.currentDebt ?? customer.debt ?? customer.balanceDue);
        const limit = toNumber(customer.debtLimit ?? customer.creditLimit, NaN);
        return Number.isFinite(limit) && debt > limit;
      });
      if (overLimit.length > 0) add({ id: "debtLimit", severity: "high", title: "Kh\xE1ch v\u01B0\u1EE3t h\u1EA1n m\u1EE9c n\u1EE3", message: `${overLimit.length} kh\xE1ch \u0111\xE3 v\u01B0\u1EE3t h\u1EA1n m\u1EE9c c\xF4ng n\u1EE3.`, targetTab: "customers" });
    }
    const isRequestDelivered = createRequestDeliveryLookup(source.warehouseDispatches);
    const undeliveredOrders = source.orderRequests.filter((request) => !isRequestDelivered(request)).length;
    if (undeliveredOrders > 0) {
      add({ id: "undelivered", severity: "medium", title: "\u0110\u01A1n h\xE0ng ch\u01B0a giao", message: `${undeliveredOrders} \u0111\u01A1n \u0111\u1EB7t ch\u01B0a c\xF3 phi\u1EBFu xu\u1EA5t t\u01B0\u01A1ng \u1EE9ng.`, targetTab: "warehouse_dispatch" });
    }
    if (dashboard.operations.slowMovingProducts > 0) {
      add({ id: "oldStock", severity: "medium", title: "H\xE0ng t\u1ED3n qu\xE1 l\xE2u", message: `${dashboard.operations.slowMovingProducts} m\u1EB7t h\xE0ng c\xF3 d\u1EA5u hi\u1EC7u b\xE1n ch\u1EADm.`, targetTab: "warehouse_import" });
    }
    if (dashboard.operations.lowStockProducts > 0) {
      add({ id: "lowStock", severity: "high", title: "T\u1ED3n kho d\u01B0\u1EDBi \u0111\u1ECBnh m\u1EE9c", message: `${dashboard.operations.lowStockProducts} m\u1EB7t h\xE0ng c\u1EA7n nh\u1EADp th\xEAm ho\u1EB7c ki\u1EC3m l\u1EA1i t\u1ED3n.`, targetTab: "products" });
    }
    if (dashboard.finance.profitMonth < 0) {
      add({ id: "negativeProfit", severity: "high", title: "L\u1EE3i nhu\u1EADn \xE2m", message: "L\u1EE3i nhu\u1EADn th\xE1ng \u0111ang \xE2m, c\u1EA7n ki\u1EC3m tra gi\xE1 v\u1ED1n, gi\xE1 b\xE1n v\xE0 chi ph\xED.", targetTab: "executive_dashboard" });
    }
    if (dashboard.finance.expensePreviousMonth > 0 && dashboard.finance.expenseMonth > dashboard.finance.expensePreviousMonth * 1.3) {
      add({ id: "expenseSpike", severity: "medium", title: "Chi ph\xED t\u0103ng \u0111\u1ED9t bi\u1EBFn", message: `Chi ph\xED th\xE1ng t\u0103ng ${Math.round(percentChange(dashboard.finance.expenseMonth, dashboard.finance.expensePreviousMonth))}% so v\u1EDBi th\xE1ng tr\u01B0\u1EDBc.`, targetTab: "finance" });
    }
    if (dashboard.operations.employeesAbsentToday >= Math.max(2, Math.ceil(source.employees.length * 0.2))) {
      add({ id: "absence", severity: "medium", title: "Nh\xE2n vi\xEAn ngh\u1EC9 b\u1EA5t th\u01B0\u1EDDng", message: `${dashboard.operations.employeesAbsentToday} nh\xE2n vi\xEAn ch\u01B0a c\xF3 ch\u1EA5m c\xF4ng h\xF4m nay.`, targetTab: "company_attendance" });
    }
    if (dashboard.operations.assetsDueMaintenance > 0) {
      add({ id: "assetMaintenance", severity: "medium", title: "T\xE0i s\u1EA3n \u0111\u1EBFn h\u1EA1n b\u1EA3o tr\xEC", message: `${dashboard.operations.assetsDueMaintenance} t\xE0i s\u1EA3n c\u1EA7n ki\u1EC3m tra trong 15 ng\xE0y t\u1EDBi.`, targetTab: "asset_management" });
    }
    return alerts.slice(0, 20);
  }
};
var formatPercentInsight = (value = 0) => `${Math.abs(Math.round(value)).toLocaleString("vi-VN")}%`;
var formatDateShort = (key = "") => {
  const [, month, day] = String(key || "").split("-");
  if (!day || !month) return "";
  return `${day}/${month}`;
};
var entityDateKey = (entity = {}) => dateKey2(getDateValue(entity));
var entityMonthKey = (entity = {}) => monthKey(getDateValue(entity));
var recordEmployeeIdOf = (entity = {}) => String(
  entity.employeeId || entity.empId || entity.userId || entity.staffId || entity.salesId || entity.assignedTo || entity.createdBy || ""
);
var employeeExperienceSalaryOf = (employee = {}, referenceDate = new BusinessDate()) => {
  const amount = toNumber(employee.experienceSalary);
  if (amount <= 0) return 0;
  const startDate = parseDate(employee.startDate || employee.hireDate || employee.joinDate);
  if (!startDate) return 0;
  const now = parseDate(referenceDate) || new BusinessDate();
  let months = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
  if (now.getDate() < startDate.getDate()) months -= 1;
  if (months < 0) return 0;
  const periodText = normalizeText4(employee.experienceSalaryPeriod || "months");
  const monthsPerCycle = /year|nam/.test(periodText) ? 12 : 1;
  const cycles = Math.floor(months / monthsPerCycle);
  return cycles > 0 ? amount * cycles : 0;
};
var employeeSalaryOf = (employee = {}, referenceDate = new BusinessDate()) => {
  const baseSalary = toNumber(
    employee.basicSalary ?? employee.baseSalary ?? employee.salary ?? employee.monthlySalary ?? employee.actualSalary ?? employee.contractSalary
  );
  const fixedAllowances = toNumber(employee.supportSalary) + toNumber(employee.responsibilitySalary) + employeeExperienceSalaryOf(employee, referenceDate);
  return Math.max(0, baseSalary + fixedAllowances);
};
var isOwnerEmployeeRecord = (employee = {}) => {
  if (employee.role === "super_admin" || employee.isOwner || employee.isCompanyOwner) return true;
  const text3 = normalizeText4([
    employee.position,
    employee.role,
    employee.roleName,
    employee.department,
    employee.type,
    employee.title
  ].filter(Boolean).join(" ")).replace(/[_-]+/g, " ");
  return /chu doanh nghiep|chu cua hang|giam doc|owner|business owner|super admin/.test(text3);
};
var payrollEmployeesOf = (employees = [], referenceDate = new BusinessDate()) => employees.filter((employee) => isActiveEmployee(employee) && !isOwnerEmployeeRecord(employee)).map((employee) => ({ employee, salary: employeeSalaryOf(employee, referenceDate) })).filter((row) => row.salary > 0);
var employeeAdvanceLimitPercentOf = (employee = {}, company = {}) => {
  const raw = employee.salaryAdvancePercent ?? employee.advancePercent ?? employee.advanceLimitPercent ?? company.salaryAdvancePercent ?? company.defaultSalaryAdvancePercent ?? company.advanceLimitPercent ?? 30;
  const percent = toNumber(raw, 30);
  return percent > 1 ? percent : percent * 100;
};
var isActiveEmployee = (employee = {}) => {
  const status = normalizeText4(employee.status || employee.state || employee.workStatus || "");
  return !isArchived(employee) && !["inactive", "blocked", "disabled", "nghi viec", "da nghi", "ngung hoat dong"].includes(status);
};
var isAttendanceLeave = (record = {}) => {
  const text3 = normalizeText4([record.status, record.state, record.type, record.note, record.reason].filter(Boolean).join(" "));
  return /nghi|leave|absent|phep/.test(text3) && !/di lam|present|checked|vao ca|ra ca/.test(text3);
};
var isAttendancePresent = (record = {}) => {
  const text3 = normalizeText4([record.status, record.state, record.type, record.note].filter(Boolean).join(" "));
  if (/di lam|present|checked|vao ca|ra ca|working|completed/.test(text3)) return true;
  return Boolean(record.checkIn || record.checkInAt || record.clockIn || record.startAt || record.timeIn || record.checkedInAt);
};
var buildMissingAttendanceRows = (source = {}, todayKey = "") => {
  const employeesById = new Map(source.employees.map((employee) => [String(employee.id || employee.uid || employee.userId || ""), employee]));
  const presentIds = /* @__PURE__ */ new Set();
  const leaveIds = /* @__PURE__ */ new Set();
  source.attendance.filter((record) => entityDateKey(record) === todayKey).forEach((record) => {
    const employeeId = recordEmployeeIdOf(record);
    if (!employeeId) return;
    if (isAttendanceLeave(record)) {
      leaveIds.add(employeeId);
      return;
    }
    if (isAttendancePresent(record)) presentIds.add(employeeId);
  });
  return source.employees.filter(isActiveEmployee).filter((employee) => {
    const employeeId = String(employee.id || employee.uid || employee.userId || "");
    if (!employeeId) return false;
    return !presentIds.has(employeeId) && !leaveIds.has(employeeId);
  }).map((employee) => ({
    id: String(employee.id || employee.uid || employee.userId || ""),
    name: employee.name || employee.fullName || employee.displayName || "Nh\xE2n vi\xEAn ch\u01B0a r\xF5",
    department: formatDepartmentLabel(employee.department || employee.role || employee.roleKey || employee.position || "")
  })).filter((row) => employeesById.has(row.id));
};
var isAdvanceRecord = (record = {}) => {
  const text3 = normalizeText4([
    record.category,
    record.type,
    record.kind,
    record.name,
    record.title,
    record.note,
    record.description,
    record.reason,
    record.sourceType
  ].filter(Boolean).join(" "));
  return /ung luong|tam ung|advance|salary advance/.test(text3);
};
var advanceAmountOf = (record = {}) => toNumber(
  record.approvedAmount ?? record.amount ?? record.requestedAmount ?? record.total ?? record.value ?? record.money
);
var buildAdvanceRiskRows = (source = {}, currentMonthKey = "") => {
  const employeesById = new Map(source.employees.map((employee) => [String(employee.id || employee.uid || employee.userId || ""), employee]));
  const records = [
    ...source.advances.map((record) => ({ ...record, __advanceCollection: true })),
    ...source.financials,
    ...source.expenses
  ].filter((record) => {
    if (entityMonthKey(record) !== currentMonthKey) return false;
    const status = normalizeText4(record.status || record.state || "");
    if (/reject|tu choi|huy|cancel/.test(status)) return false;
    return record.__advanceCollection || isAdvanceRecord(record);
  });
  const grouped = /* @__PURE__ */ new Map();
  records.forEach((record) => {
    const employeeId = recordEmployeeIdOf(record);
    const employee = employeeId ? employeesById.get(employeeId) : null;
    const name = record.employeeName || record.staffName || record.createdByName || employee?.name || employee?.fullName || "Nh\xE2n vi\xEAn ch\u01B0a r\xF5";
    const key = employeeId || normalizeText4(name);
    if (!key) return;
    const current = grouped.get(key) || {
      id: key,
      employee,
      name,
      amount: 0,
      count: 0,
      pending: 0
    };
    const amount = advanceAmountOf(record);
    current.amount += amount;
    current.count += 1;
    const status = normalizeText4(record.status || record.state || "");
    if (!/approved|da duyet|paid|da chi|done|completed/.test(status)) current.pending += amount;
    grouped.set(key, current);
  });
  return [...grouped.values()].map((row) => {
    const salary = employeeSalaryOf(row.employee || {});
    const percent = employeeAdvanceLimitPercentOf(row.employee || {}, source.company || {});
    const allowed = salary > 0 ? salary * percent / 100 : 0;
    return {
      ...row,
      salary,
      percent,
      allowed,
      overAmount: allowed > 0 ? row.amount - allowed : 0,
      missingPolicy: salary <= 0
    };
  }).filter((row) => row.amount > 0).sort((a, b) => {
    if (b.overAmount > 0 !== a.overAmount > 0) return b.overAmount > 0 ? 1 : -1;
    return b.amount - a.amount;
  });
};
var customerCurrentDebtOf = (customer = {}) => Math.max(0, toNumber(
  customer.currentDebt ?? customer.totalDebt ?? customer.debt ?? customer.openingDebt ?? customer.oldDebt ?? customer.initialDebt
));
var buildDebtRiskRows = (source = {}) => {
  const customersById = new Map(source.customers.map((customer) => [String(customer.id || customer.customerId || ""), customer]));
  const rows = /* @__PURE__ */ new Map();
  const upsert = (key, patch = {}) => {
    const current = rows.get(key) || {
      id: key,
      name: patch.name || "Kh\xE1ch ch\u01B0a r\xF5",
      debt: 0,
      orderDebt: 0,
      profileDebt: 0,
      orderCount: 0,
      oldestDate: "",
      latestDate: "",
      customer: patch.customer || null
    };
    rows.set(key, { ...current, ...patch });
    return rows.get(key);
  };
  source.orders.forEach((order) => {
    const debt = outstandingOfOrder(order);
    if (debt <= 0) return;
    const customer = order.customerId ? customersById.get(String(order.customerId)) : null;
    const name = customerNameOf(order, customersById);
    const key = String(order.customerId || customer?.id || normalizeText4(name));
    const row = upsert(key, { name, customer });
    const orderKey = entityDateKey(order);
    row.orderDebt += debt;
    row.debt = Math.max(row.debt, row.orderDebt);
    row.orderCount += 1;
    if (orderKey && (!row.oldestDate || orderKey < row.oldestDate)) row.oldestDate = orderKey;
    if (orderKey && (!row.latestDate || orderKey > row.latestDate)) row.latestDate = orderKey;
  });
  source.customers.forEach((customer) => {
    const profileDebt = customerCurrentDebtOf(customer);
    if (profileDebt <= 0) return;
    const name = customer.name || customer.displayName || customer.customerName || "Kh\xE1ch ch\u01B0a r\xF5";
    const key = String(customer.id || customer.customerId || normalizeText4(name));
    const row = upsert(key, { name, customer });
    row.profileDebt = profileDebt;
    row.debt = Math.max(row.debt, profileDebt, row.orderDebt);
  });
  return [...rows.values()].filter((row) => row.debt > 0).sort((a, b) => b.debt - a.debt || b.orderCount - a.orderCount).slice(0, 20);
};
var buildLatestDebtOrderRows = (source = {}) => buildDebtRiskRows(source).filter((row) => row.orderCount > 0).sort((a, b) => b.orderCount - a.orderCount || b.debt - a.debt).slice(0, 10);
var formatInsightMoney = (value = 0) => {
  const amount = Math.round(toNumber(value));
  if (Math.abs(amount) >= 1e9) return `${(amount / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} t\u1EF7`;
  if (Math.abs(amount) >= 1e6) return `${Math.round(amount / 1e6).toLocaleString("vi-VN")} tri\u1EC7u`;
  return `${amount.toLocaleString("vi-VN")} \u0111`;
};
var rangeChangePct = (values = []) => {
  const cleanValues = values.map((value) => toNumber(value)).filter((value) => value > 0);
  if (cleanValues.length < 2) return 0;
  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);
  return min > 0 ? (max - min) / min * 100 : 0;
};
var itemPriceOf = (item = {}) => {
  const snapshot = itemBillingSnapshot(item);
  if (snapshot?.unitPrice > 0) return snapshot.unitPrice;
  const directPrice = itemUnitPrice(item);
  if (directPrice > 0) return directPrice;
  const quantity = itemBillingQuantity(item);
  const total = itemLineTotal(item);
  return quantity > 0 && total > 0 ? total / quantity : 0;
};
var buildProfitabilityDiagnostics = (source = {}, finance = {}, readSnapshot = (day) => ProfitabilityService.build(source, { ...finance, todayKey: day })) => {
  const todayKey = finance.todayKey || dateKey2(source.now || new BusinessDate());
  const todayDate = parseDate(todayKey) || source.now || new BusinessDate();
  const dayKeys = [2, 1, 0].map((offset) => dateKey2(addDays(todayDate, -offset))).filter(Boolean);
  const byGroup = /* @__PURE__ */ new Map();
  dayKeys.forEach((day) => {
    const snapshot = readSnapshot(day);
    snapshot.groupRows.forEach((row) => {
      if (!row?.name || toNumber(row.costQuantity) <= 0 || toNumber(row.revenue) <= 0) return;
      const key = normalizeText4(row.name);
      const current = byGroup.get(key) || { key, name: row.name, unit: row.costQuantityUnit || row.unit || "\u0111v", rows: [] };
      current.rows.push({
        dateKey: day,
        inputCost: toNumber(row.averageInputCost),
        salePrice: toNumber(row.averageSalePrice),
        profitPerUnit: toNumber(row.profitPerUnit),
        profit: toNumber(row.profit),
        quantity: toNumber(row.costQuantity),
        unit: row.costQuantityUnit || row.unit || current.unit
      });
      byGroup.set(key, current);
    });
  });
  const anomalyRows = [...byGroup.values()].map((group) => {
    const rows = group.rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    if (rows.length < 2) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const profitDeltaPct = percentChange(last.profitPerUnit, first.profitPerUnit);
    const profitDeltaValue = last.profitPerUnit - first.profitPerUnit;
    const inputCostRangePct = rangeChangePct(rows.map((row) => row.inputCost));
    const salePriceRangePct = rangeChangePct(rows.map((row) => row.salePrice));
    const stableInputs = inputCostRangePct <= 3 && salePriceRangePct <= 3;
    const abnormalProfit = Math.abs(profitDeltaPct) >= 12 && Math.abs(profitDeltaValue) >= 500;
    if (!stableInputs || !abnormalProfit) return null;
    return {
      ...group,
      fromDate: first.dateKey,
      toDate: last.dateKey,
      firstProfitPerUnit: first.profitPerUnit,
      lastProfitPerUnit: last.profitPerUnit,
      profitDeltaPct,
      profitDeltaValue,
      inputCostRangePct,
      salePriceRangePct,
      unit: last.unit || group.unit,
      severity: Math.abs(profitDeltaPct)
    };
  }).filter(Boolean).sort((a, b) => b.severity - a.severity).slice(0, 6);
  const productsById = new Map(source.products.map((product) => [product.id, product]));
  const customersById = new Map(source.customers.map((customer) => [customer.id, customer]));
  const baselineMap = /* @__PURE__ */ new Map();
  source.orders.forEach((order) => {
    const orderDay = dateKey2(getDateValue(order));
    if (!orderDay || orderDay >= todayKey || orderDay < dayKeys[0]) return;
    getItems(order).forEach((item) => {
      const quantity = itemBillingQuantity(item);
      const price = itemPriceOf(item);
      if (quantity <= 0 || price <= 0) return;
      const key = inventoryCostKeyOf(item, productsById);
      const row = baselineMap.get(key) || { quantity: 0, value: 0 };
      row.quantity += quantity;
      row.value += quantity * price;
      baselineMap.set(key, row);
    });
  });
  const impactMap = /* @__PURE__ */ new Map();
  source.orders.forEach((order) => {
    const orderDay = dateKey2(getDateValue(order));
    if (orderDay !== todayKey) return;
    const customerName = customerNameOf(order, customersById);
    const customerKey = String(order.customerId || normalizeText4(customerName));
    getItems(order).forEach((item) => {
      const quantity = itemBillingQuantity(item);
      const price = itemPriceOf(item);
      if (quantity <= 0 || price <= 0) return;
      const productKey = inventoryCostKeyOf(item, productsById);
      const baseline = baselineMap.get(productKey);
      const baselinePrice = baseline?.quantity > 0 ? baseline.value / baseline.quantity : 0;
      if (baselinePrice <= 0) return;
      const priceDelta = price - baselinePrice;
      const impact = priceDelta * quantity;
      const impactPct = percentChange(price, baselinePrice);
      if (Math.abs(priceDelta) < 500 && Math.abs(impact) < 5e4 && Math.abs(impactPct) < 2) return;
      const productName = productNameOf(item, productsById);
      const key = `${customerKey}__${productKey}`;
      const row = impactMap.get(key) || {
        customerName,
        productName,
        unit: itemBillingUnit(item, "\u0111v"),
        quantity: 0,
        value: 0,
        baselineValue: 0,
        impact: 0
      };
      row.quantity += quantity;
      row.value += price * quantity;
      row.baselineValue += baselinePrice * quantity;
      row.impact += impact;
      row.currentPrice = row.quantity > 0 ? row.value / row.quantity : price;
      row.baselinePrice = row.quantity > 0 ? row.baselineValue / row.quantity : baselinePrice;
      row.priceDelta = row.currentPrice - row.baselinePrice;
      row.impactPct = percentChange(row.currentPrice, row.baselinePrice);
      row.impactAbs = Math.abs(row.impact);
      impactMap.set(key, row);
    });
  });
  const priceImpactRows = [...impactMap.values()].sort((a, b) => b.impactAbs - a.impactAbs).slice(0, 8);
  return { anomalyRows, priceImpactRows };
};
var buildExecutiveInsightItems = (source = {}, dashboard = {}, alerts = []) => {
  const insightRows = [];
  const usedIds = /* @__PURE__ */ new Set();
  const finance = dashboard.finance || {};
  const todayKey = finance.todayKey || dateKey2(source.now || new BusinessDate());
  const currentMonthKey = finance.currentMonthKey || monthKey(source.now || new BusinessDate());
  const add = (priority, insight) => {
    if (!insight?.text || usedIds.has(insight.id)) return;
    usedIds.add(insight.id);
    insightRows.push({ priority, ...insight });
  };
  const revenueDelta = percentChange(finance.revenueToday, finance.revenueYesterday);
  const profitDelta = percentChange(finance.profitToday, finance.profitYesterday);
  const monthProfitDelta = percentChange(finance.profitMonth, finance.profitPreviousMonth);
  if (finance.profitToday < 0) {
    add(5, {
      id: "profit-today-negative",
      type: "warn",
      text: `L\u1EE3i nhu\u1EADn h\xF4m nay \u0111ang \xE2m ${formatInsightMoney(Math.abs(finance.profitToday))}. C\u1EA7n ki\u1EC3m tra ngay gi\xE1 v\u1ED1n \u0111\xE3 d\xF9ng, chi ph\xED ph\xE1t sinh v\xE0 c\xE1c \u0111\u01A1n b\xE1n d\u01B0\u1EDBi gi\xE1.`
    });
  } else if (Math.abs(profitDelta) >= 5) {
    add(profitDelta < 0 ? 12 : 42, {
      id: "profit-today-delta",
      type: profitDelta >= 0 ? "good" : "warn",
      text: `L\u1EE3i nhu\u1EADn h\xF4m nay ${profitDelta >= 0 ? "t\u0103ng" : "gi\u1EA3m"} ${formatPercentInsight(profitDelta)} so v\u1EDBi h\xF4m qua${finance.profitToday ? `, hi\u1EC7n kho\u1EA3ng ${formatInsightMoney(finance.profitToday)}` : ""}.`
    });
  }
  if (Math.abs(revenueDelta) >= 5) {
    add(revenueDelta < 0 ? 15 : 45, {
      id: "revenue-today-delta",
      type: revenueDelta >= 0 ? "good" : "warn",
      text: `Doanh thu h\xF4m nay ${revenueDelta >= 0 ? "t\u0103ng" : "gi\u1EA3m"} ${formatPercentInsight(revenueDelta)} so v\u1EDBi h\xF4m qua, \u0111\u1EA1t ${formatInsightMoney(finance.revenueToday)}.`
    });
  }
  if (Math.abs(monthProfitDelta) >= 8) {
    add(monthProfitDelta < 0 ? 18 : 48, {
      id: "profit-month-delta",
      type: monthProfitDelta >= 0 ? "good" : "warn",
      text: `L\u1EE3i nhu\u1EADn th\xE1ng n\xE0y ${monthProfitDelta >= 0 ? "t\u1ED1t h\u01A1n" : "k\xE9m h\u01A1n"} ${formatPercentInsight(monthProfitDelta)} so v\u1EDBi th\xE1ng tr\u01B0\u1EDBc.`
    });
  }
  const debtRows = buildDebtRiskRows(source);
  const topDebt = debtRows[0];
  const receivables = Math.max(toNumber(finance.receivables), debtRows.reduce((sum, row) => sum + toNumber(row.debt), 0));
  if (topDebt?.debt > 0) {
    const share = receivables > 0 ? Math.round(topDebt.debt / receivables * 100) : 0;
    add(20, {
      id: "customer-top-debt-risk",
      type: share >= 30 ? "warn" : "neutral",
      text: `${topDebt.name} \u0111ang l\xE0 kh\xE1ch n\u1EE3 cao nh\u1EA5t v\u1EDBi ${formatInsightMoney(topDebt.debt)}${share > 0 ? `, chi\u1EBFm kho\u1EA3ng ${share}% t\u1ED5ng c\xF4ng n\u1EE3` : ""}. N\xEAn \u01B0u ti\xEAn nh\u1EAFc thu ho\u1EB7c \u0111\u1ED1i so\xE1t tr\u01B0\u1EDBc khi giao th\xEAm.`
    });
  }
  const debtOrderRisk = buildLatestDebtOrderRows(source)[0];
  if (debtOrderRisk?.orderCount >= 2) {
    add(22, {
      id: "customer-many-debt-orders",
      type: "warn",
      text: `${debtOrderRisk.name} c\xF2n ${debtOrderRisk.orderCount} \u0111\u01A1n ch\u01B0a t\u1EA5t to\xE1n${debtOrderRisk.oldestDate ? `, \u0111\u01A1n c\u0169 nh\u1EA5t t\u1EEB ${formatDateShort(debtOrderRisk.oldestDate)}` : ""}. \u0110\xE2y l\xE0 kh\xE1ch c\u1EA7n theo s\xE1t d\xF2ng ti\u1EC1n.`
    });
  }
  const advanceRows = buildAdvanceRiskRows(source, currentMonthKey);
  const overAdvance = advanceRows.find((row) => row.overAmount > 0);
  if (overAdvance) {
    add(24, {
      id: "employee-advance-over-limit",
      type: "warn",
      text: `${overAdvance.name} \u0111\xE3 \u1EE9ng ${formatInsightMoney(overAdvance.amount)}, v\u01B0\u1EE3t h\u1EA1n m\u1EE9c kho\u1EA3ng ${formatInsightMoney(overAdvance.overAmount)} so v\u1EDBi ch\xEDnh s\xE1ch ${Math.round(overAdvance.percent)}% l\u01B0\u01A1ng.`
    });
  } else {
    const missingPolicyAdvance = advanceRows.find((row) => row.missingPolicy);
    if (missingPolicyAdvance) {
      add(34, {
        id: "employee-advance-missing-policy",
        type: "warn",
        text: `${missingPolicyAdvance.name} c\xF3 ph\xE1t sinh \u1EE9ng l\u01B0\u01A1ng ${formatInsightMoney(missingPolicyAdvance.amount)} nh\u01B0ng ch\u01B0a th\u1EA5y c\u1EA5u h\xECnh l\u01B0\u01A1ng/h\u1EA1n m\u1EE9c \u0111\u1EC3 ki\u1EC3m so\xE1t t\u1EF1 \u0111\u1ED9ng.`
      });
    }
  }
  const missingAttendanceRows = buildMissingAttendanceRows(source, todayKey);
  if (missingAttendanceRows.length > 0) {
    const names = missingAttendanceRows.slice(0, 3).map((row) => row.name).join(", ");
    add(28, {
      id: "attendance-missing-today",
      type: "warn",
      text: `${missingAttendanceRows.length} nh\xE2n vi\xEAn ch\u01B0a ghi nh\u1EADn ch\u1EA5m c\xF4ng h\xF4m nay${names ? `: ${names}${missingAttendanceRows.length > 3 ? "..." : ""}` : ""}. N\xEAn ki\u1EC3m tra \u0111\u1EC3 tr\xE1nh sai l\u1EC7ch l\u01B0\u01A1ng v\xE0 ca l\xE0m.`
    });
  }
  const topGroup = dashboard.profitability?.topGroup;
  if (topGroup?.profit > 0) {
    add(40, {
      id: "today-top-profit-group",
      type: "good",
      text: `Nh\xF3m ${topGroup.name} \u0111ang l\xE0 tr\u1EE5 c\u1ED9t l\u1EE3i nhu\u1EADn h\xF4m nay: l\xE3i kho\u1EA3ng ${formatInsightMoney(topGroup.profit)}${topGroup.profitPerUnit ? `, b\xECnh qu\xE2n ${formatInsightMoney(topGroup.profitPerUnit)}/${topGroup.unit || "\u0111\u01A1n v\u1ECB"}` : ""}.`
    });
  }
  const topProduct = dashboard.profitability?.topProduct || dashboard.business?.topProductsByProfit?.[0];
  const topProductProfit = toNumber(topProduct?.profit);
  if (topProduct?.name && topProductProfit > 0) {
    add(44, {
      id: "today-top-profit-product",
      type: "good",
      text: `${topProduct.name} l\xE0 s\u1EA3n ph\u1EA9m l\xE3i t\u1ED1t nh\u1EA5t hi\u1EC7n t\u1EA1i v\u1EDBi ${formatInsightMoney(topProductProfit)}${topProduct.profitPerUnit ? `, kho\u1EA3ng ${formatInsightMoney(topProduct.profitPerUnit)}/${topProduct.unit || "\u0111\u01A1n v\u1ECB"}` : ""}.`
    });
  }
  const profitAnomaly = dashboard.profitability?.anomalyRows?.[0];
  if (profitAnomaly) {
    add(30, {
      id: "profitability-anomaly-3-days",
      type: "warn",
      text: `Nh\xF3m ${profitAnomaly.name} c\xF3 l\xE3i b\xECnh qu\xE2n ${profitAnomaly.profitDeltaValue >= 0 ? "t\u0103ng" : "gi\u1EA3m"} ${formatPercentInsight(profitAnomaly.profitDeltaPct)} trong 3 ng\xE0y d\xF9 gi\xE1 mua v\xE0 gi\xE1 b\xE1n g\u1EA7n nh\u01B0 kh\xF4ng \u0111\u1ED5i. N\xEAn ki\u1EC3m tra hao h\u1EE5t, phi\u1EBFu xu\u1EA5t, ki\u1EC3m t\u1ED3n ho\u1EB7c gi\xE1 v\u1ED1n c\u1EE7a nh\xF3m n\xE0y.`
    });
  }
  const priceImpact = dashboard.profitability?.priceImpactRows?.[0];
  if (priceImpact) {
    add(priceImpact.impact >= 0 ? 46 : 31, {
      id: "customer-price-impact",
      type: priceImpact.impact >= 0 ? "good" : "warn",
      text: `${priceImpact.customerName} mua ${priceImpact.productName} ${priceImpact.priceDelta >= 0 ? "cao h\u01A1n" : "th\u1EA5p h\u01A1n"} b\xECnh qu\xE2n 3 ng\xE0y kho\u1EA3ng ${formatInsightMoney(Math.abs(priceImpact.priceDelta))}/${priceImpact.unit || "\u0111\u01A1n v\u1ECB"}, l\xE0m ${priceImpact.impact >= 0 ? "t\u0103ng" : "gi\u1EA3m"} l\xE3i \u01B0\u1EDBc t\xEDnh ${formatInsightMoney(Math.abs(priceImpact.impact))}.`
    });
  }
  const topRevenueProduct = dashboard.business?.topProductsByRevenue?.[0];
  if (topRevenueProduct?.revenue > 0) {
    const revenueShare = finance.revenueMonth > 0 ? Math.round(topRevenueProduct.revenue / finance.revenueMonth * 100) : 0;
    add(52, {
      id: "pillar-revenue-product",
      type: "neutral",
      text: `${topRevenueProduct.name} \u0111ang k\xE9o doanh thu m\u1EA1nh nh\u1EA5t th\xE1ng n\xE0y v\u1EDBi ${formatInsightMoney(topRevenueProduct.revenue)}${revenueShare > 0 ? `, kho\u1EA3ng ${revenueShare}% doanh thu th\xE1ng` : ""}.`
    });
  }
  const carryoverValue = toNumber(dashboard.profitability?.totals?.carryoverValue);
  if (carryoverValue > 0) {
    add(62, {
      id: "carryover-stock-value",
      type: "neutral",
      text: `T\u1ED3n chuy\u1EC3n sang ng\xE0y sau kho\u1EA3ng ${formatInsightMoney(carryoverValue)} theo gi\xE1 v\u1ED1n b\xECnh qu\xE2n; kho\u1EA3n n\xE0y kh\xF4ng n\xEAn t\xEDnh h\u1EBFt v\xE0o chi ph\xED \u0111\xE3 d\xF9ng h\xF4m nay.`
    });
  }
  if (dashboard.operations?.slowMovingProducts > 0) {
    add(70, {
      id: "slow-moving-products",
      type: "warn",
      text: `${dashboard.operations.slowMovingProducts} m\u1EB7t h\xE0ng \u0111ang b\xE1n ch\u1EADm. N\xEAn xem l\u1EA1i gi\xE1 b\xE1n, l\u1ECBch nh\u1EADp ho\u1EB7c \u0111\u1EA9y \u01B0u ti\xEAn ti\xEAu th\u1EE5 \u0111\u1EC3 tr\xE1nh k\u1EB9t v\u1ED1n.`
    });
  }
  if (alerts.length > 0) {
    add(80, {
      id: "open-alerts",
      type: "warn",
      text: `H\xF4m nay c\xF3 ${alerts.length} c\u1EA3nh b\xE1o \u0111ang m\u1EDF. \u01AFu ti\xEAn x\u1EED l\xFD c\u1EA3nh b\xE1o c\xF4ng n\u1EE3, t\u1ED3n kho v\xE0 ch\u1EA5m c\xF4ng tr\u01B0\u1EDBc.`
    });
  }
  if (insightRows.length === 0) {
    add(100, {
      id: "stable",
      type: "good",
      text: "C\xE1c ch\u1EC9 s\u1ED1 ch\xEDnh \u0111ang \u1ED5n \u0111\u1ECBnh. N\xEAn ti\u1EBFp t\u1EE5c theo d\xF5i c\xF4ng n\u1EE3, t\u1ED3n kho v\xE0 ch\u1EA5m c\xF4ng trong ng\xE0y \u0111\u1EC3 tr\xE1nh ph\xE1t sinh r\u1EE7i ro."
    });
  }
  return insightRows.sort((a, b) => a.priority - b.priority).slice(0, 12).map(({ priority, ...insight }) => insight);
};
var InsightService = {
  build(source, dashboard, alerts = []) {
    return buildExecutiveInsightItems(source, dashboard, alerts);
  }
};
var RecommendationService = {
  build(source, dashboard, alerts = []) {
    const recommendations = [];
    const topDebt = dashboard.business.topCustomersByDebt[0];
    if (topDebt?.debt > 0) {
      recommendations.push({
        id: "collect-debt",
        title: `Thu h\u1ED3i c\xF4ng n\u1EE3 ${topDebt.name}`,
        impact: `D\u1EF1 ki\u1EBFn thu v\u1EC1 ${Math.round(topDebt.debt / 1e6)} tri\u1EC7u`,
        detail: "\u01AFu ti\xEAn nh\u1EAFc kh\xE1ch ho\u1EB7c giao h\xE0ng k\xE8m \u0111i\u1EC1u ki\u1EC7n thu ti\u1EC1n.",
        targetTab: "debt"
      });
    }
    const slowStock = dashboard.operations.slowMovingRows?.[0];
    if (slowStock) {
      recommendations.push({
        id: "reduce-slow-stock",
        title: `Gi\u1EA3m nh\u1EADp ho\u1EB7c \u0111\u1EA9y b\xE1n ${slowStock.name || slowStock.productName || "h\xE0ng b\xE1n ch\u1EADm"}`,
        impact: "Gi\u1EA3m v\u1ED1n b\u1ECB k\u1EB9t trong t\u1ED3n kho",
        detail: "Ki\u1EC3m tra l\u1EA1i t\u1ED1c \u0111\u1ED9 b\xE1n, size, gi\xE1 v\xE0 l\u1ECBch nh\u1EADp.",
        targetTab: "warehouse_import"
      });
    }
    const lowMarginCustomer = dashboard.business.topCustomersByRevenue.find((row) => row.revenue > 0 && (dashboard.business.topCustomersByProfit.find((p) => p.name === row.name)?.profit || 0) / row.revenue < 0.02);
    if (lowMarginCustomer) {
      recommendations.push({
        id: "adjust-low-margin",
        title: `R\xE0 so\xE1t gi\xE1 b\xE1n kh\xE1ch ${lowMarginCustomer.name}`,
        impact: "C\xF3 th\u1EC3 t\u0103ng bi\xEAn l\u1EE3i nhu\u1EADn nh\xF3m kh\xE1ch doanh thu cao",
        detail: "Kh\xE1ch c\xF3 doanh thu cao nh\u01B0ng bi\xEAn l\u1EE3i nhu\u1EADn th\u1EA5p.",
        targetTab: "customers"
      });
    }
    const biggestCost = dashboard.finance.costBreakdown?.slice().sort((a, b) => b.value - a.value)[0];
    if (biggestCost?.value > 0) {
      recommendations.push({
        id: "cost-control",
        title: `Ki\u1EC3m so\xE1t ${biggestCost.name.toLowerCase()}`,
        impact: `Kho\u1EA3n n\xE0y \u0111ang chi\u1EBFm ${Math.round(biggestCost.value / Math.max(1, dashboard.finance.expenseMonth) * 100)}% t\u1ED5ng chi th\xE1ng`,
        detail: "So s\xE1nh v\u1EDBi th\xE1ng tr\u01B0\u1EDBc v\xE0 \u0111\u1EB7t gi\u1EDBi h\u1EA1n chi theo ng\xE0y.",
        targetTab: "finance"
      });
    }
    if (dashboard.operations.employeesAbsentToday > 0) {
      recommendations.push({
        id: "attendance-action",
        title: "R\xE0 so\xE1t nh\xE2n s\u1EF1 ch\u01B0a ch\u1EA5m c\xF4ng",
        impact: "Gi\u1EA3m sai l\u1EC7ch l\u01B0\u01A1ng v\xE0 thi\u1EBFu ng\u01B0\u1EDDi v\u1EADn h\xE0nh",
        detail: "Ki\u1EC3m tra l\xFD do ngh\u1EC9, qu\xEAn ch\u1EA5m ho\u1EB7c ph\xE2n ca ch\u01B0a \u0111\xFAng.",
        targetTab: "company_attendance"
      });
    }
    if (recommendations.length === 0 && alerts[0]) {
      recommendations.push({
        id: "handle-first-alert",
        title: `X\u1EED l\xFD c\u1EA3nh b\xE1o: ${alerts[0].title}`,
        impact: "Gi\u1EA3m r\u1EE7i ro v\u1EADn h\xE0nh trong ng\xE0y",
        detail: alerts[0].message,
        targetTab: alerts[0].targetTab || "executive_dashboard"
      });
    }
    return recommendations.slice(0, 5);
  }
};
var makeKpi = ({ id, title, value, kind = "money", current = value, previousDay = 0, currentMonth = value, previousMonth = 0, positiveWhen = "up" }) => {
  const vsYesterday = percentChange(current, previousDay);
  const vsPreviousMonth = percentChange(currentMonth, previousMonth);
  const positive = positiveWhen === "down" ? vsYesterday <= 0 : vsYesterday >= 0;
  const tone = ["profitToday", "profitMonth", "cashBalance", "cashflowMonth"].includes(id) ? toNumber(value) >= 0 ? "good" : "bad" : ["receivables", "payables", "undeliveredOrders", "openAlerts"].includes(id) ? toNumber(value) > 0 ? "warn" : "good" : positive ? "good" : "bad";
  return { id, title, label: title, value, kind, vsYesterday, vsPreviousMonth, dayDeltaPct: vsYesterday, monthDeltaPct: vsPreviousMonth, tone, isPositive: positive };
};
var buildCashExpenseRows = (records) => Array.isArray(records) ? records.filter((expense) => !expense.isArchived && !isCustomerDebtRepayment(expense)).map((expense) => ({
  date: expense.date,
  value: Number(expense.amount) || 0,
  category: classifyExpense(expense),
  name: expense.name || expense.title || expense.category || "Chi ph\xED kh\xE1c",
  detail: expense.note || expense.description || "",
  sourceType: "expense",
  sourceId: expense.id,
  originalAmount: Number(expense.amount) || 0,
  employeeId: recordEmployeeIdOf(expense),
  recipient: expense.recipient || expense.payee || expense.employeeName || ""
})) : void 0;
var buildPayrollAccrualRows = (source, todayKey, employeesById) => {
  const rows = [];
  source.payrollCosts.forEach((row) => {
    const date = dateKey2(getDateValue(row));
    const value = Math.max(0, moneyOfExpense(row));
    if (!date || date > todayKey || !value) return;
    const employeeId = recordEmployeeIdOf(row);
    const employee = employeeId ? employeesById.get(employeeId) : null;
    rows.push({
      date,
      employeeId,
      name: row.employeeName || row.staffName || employee?.name || employee?.fullName || "Nh\xE2n s\u1EF1 ch\u01B0a r\xF5",
      department: formatDepartmentLabel(employee?.department || employee?.position || employee?.roleName, "Ch\u01B0a ph\xE2n b\u1ED9 ph\u1EADn"),
      value
    });
  });
  return rows;
};
function* buildDashboardSnapshotSteps(input = {}) {
  const source = normalizeInput(input);
  let finance = FinancialService.build(source);
  yield;
  const inventorySoldCostByDate = yield* buildInventorySoldCostSteps(source, finance.todayKey);
  yield;
  const inventoryPurchaseExpenses = source.expenses.filter(isInventoryPurchaseExpense);
  const payrollCostByDate = /* @__PURE__ */ new Map();
  source.payrollCosts.forEach((row) => {
    const key = dateKey2(getDateValue(row));
    if (key && key <= finance.todayKey) payrollCostByDate.set(key, (payrollCostByDate.get(key) || 0) + Math.max(0, moneyOfExpense(row)));
  });
  const payrollByMonth = /* @__PURE__ */ new Map();
  payrollCostByDate.forEach((amount, key) => payrollByMonth.set(key.slice(0, 7), (payrollByMonth.get(key.slice(0, 7)) || 0) + amount));
  const salaryDisbursementByMonth = /* @__PURE__ */ new Map();
  source.expenses.filter((expense) => isPayrollDisbursementExpense(expense) && !isSalaryAdvanceExpense(expense)).forEach((expense) => {
    const day = dateKey2(getDateValue(expense));
    if (!day || day > finance.todayKey) return;
    const key = day.slice(0, 7);
    if (key) salaryDisbursementByMonth.set(key, (salaryDisbursementByMonth.get(key) || 0) + moneyOfExpense(expense));
  });
  const operatingExpenses = source.expenses.filter((expense) => {
    const day = dateKey2(getDateValue(expense));
    return day && day <= finance.todayKey && !isInventoryPurchaseExpense(expense) && !isCustomerDebtRepayment(expense);
  }).map((expense) => {
    const key = monthKey(getDateValue(expense));
    const recordedSalary = salaryDisbursementByMonth.get(key) || 0;
    const accruedSalary = payrollByMonth.get(key) || 0;
    const salaryFactor = recordedSalary > 0 ? Math.max(0, recordedSalary - accruedSalary) / recordedSalary : 0;
    return { ...expense, originalAmount: moneyOfExpense(expense), amount: isSalaryAdvanceExpense(expense) ? 0 : moneyOfExpense(expense) * (isPayrollDisbursementExpense(expense) ? salaryFactor : 1) };
  });
  const costOfGoodsToday = toNumber(inventorySoldCostByDate.get(finance.todayKey));
  const costOfGoodsYesterday = toNumber(inventorySoldCostByDate.get(finance.yesterdayKey));
  const costOfGoodsWeek = sumMapByDateRange(inventorySoldCostByDate, finance.weekStartKey, finance.weekEndKey);
  const costOfGoodsMonth = sumInventorySoldCostByMonth(inventorySoldCostByDate, finance.currentMonthKey);
  const costOfGoodsPreviousMonth = sumInventorySoldCostByMonth(inventorySoldCostByDate, finance.previousMonthKey);
  const inventoryPurchaseExpenseToday = sumByDate(inventoryPurchaseExpenses, finance.todayKey, moneyOfExpense);
  const inventoryPurchaseExpenseYesterday = sumByDate(inventoryPurchaseExpenses, finance.yesterdayKey, moneyOfExpense);
  const inventoryPurchaseExpenseWeek = sumByDateRange(inventoryPurchaseExpenses, finance.weekStartKey, finance.weekEndKey, moneyOfExpense);
  const inventoryPurchaseExpenseMonth = sumByMonth(inventoryPurchaseExpenses, finance.currentMonthKey, moneyOfExpense);
  const inventoryPurchaseExpensePreviousMonth = sumByMonth(inventoryPurchaseExpenses, finance.previousMonthKey, moneyOfExpense);
  const nonInventoryExpenseToday = sumByDate(operatingExpenses, finance.todayKey, moneyOfExpense);
  const nonInventoryExpenseYesterday = sumByDate(operatingExpenses, finance.yesterdayKey, moneyOfExpense);
  const nonInventoryExpenseWeek = sumByDateRange(operatingExpenses, finance.weekStartKey, finance.weekEndKey, moneyOfExpense);
  const nonInventoryExpenseMonth = sumByMonth(operatingExpenses, finance.currentMonthKey, moneyOfExpense);
  const nonInventoryExpensePreviousMonth = sumByMonth(operatingExpenses, finance.previousMonthKey, moneyOfExpense);
  const salaryExpenseToday = toNumber(payrollCostByDate.get(finance.todayKey));
  const salaryExpenseYesterday = toNumber(payrollCostByDate.get(finance.yesterdayKey));
  const salaryExpenseWeek = sumMapByDateRange(payrollCostByDate, finance.weekStartKey, finance.weekEndKey);
  const salaryExpenseMonth = payrollByMonth.get(finance.currentMonthKey) || 0;
  const salaryExpensePreviousMonth = payrollByMonth.get(finance.previousMonthKey) || 0;
  const actualExpenseToday = nonInventoryExpenseToday + costOfGoodsToday + salaryExpenseToday;
  const actualExpenseYesterday = nonInventoryExpenseYesterday + costOfGoodsYesterday + salaryExpenseYesterday;
  const actualExpenseWeek = nonInventoryExpenseWeek + costOfGoodsWeek + salaryExpenseWeek;
  const actualExpenseMonth = nonInventoryExpenseMonth + costOfGoodsMonth + salaryExpenseMonth;
  const actualExpensePreviousMonth = nonInventoryExpensePreviousMonth + costOfGoodsPreviousMonth + salaryExpensePreviousMonth;
  const rebuildDayRow = (row = {}) => {
    const cashExpense = toNumber(row.expense);
    const inventoryPurchaseExpense = sumByDate(inventoryPurchaseExpenses, row.date, moneyOfExpense);
    const nonInventoryExpense = sumByDate(operatingExpenses, row.date, moneyOfExpense);
    const costOfGoods = toNumber(inventorySoldCostByDate.get(row.date));
    const salaryExpense = toNumber(payrollCostByDate.get(row.date));
    const actualExpense = nonInventoryExpense + costOfGoods + salaryExpense;
    return {
      ...row,
      cashExpense,
      inventoryPurchaseExpense,
      nonInventoryExpense,
      costOfGoods,
      salaryExpense,
      actualUsedCost: costOfGoods,
      expense: actualExpense,
      operatingExpense: actualExpense,
      profitExpense: actualExpense,
      profit: toNumber(row.revenue) - actualExpense,
      cashflow: toNumber(row.income) - cashExpense
    };
  };
  const rebuildMonthRow = (row = {}) => {
    const cashExpense = toNumber(row.expense);
    const inventoryPurchaseExpense = sumByMonth(inventoryPurchaseExpenses, row.month, moneyOfExpense);
    const nonInventoryExpense = sumByMonth(operatingExpenses, row.month, moneyOfExpense);
    const costOfGoods = sumInventorySoldCostByMonth(inventorySoldCostByDate, row.month);
    const salaryExpense = payrollByMonth.get(row.month) || 0;
    const actualExpense = nonInventoryExpense + costOfGoods + salaryExpense;
    return {
      ...row,
      cashExpense,
      inventoryPurchaseExpense,
      nonInventoryExpense,
      costOfGoods,
      salaryExpense,
      actualUsedCost: costOfGoods,
      expense: actualExpense,
      operatingExpense: actualExpense,
      profitExpense: actualExpense,
      profit: toNumber(row.revenue) - actualExpense,
      cashflow: toNumber(row.income) - cashExpense
    };
  };
  const series7Days = finance.series7Days.map(rebuildDayRow);
  const series30Days = finance.series30Days.map(rebuildDayRow);
  const series12Months = finance.series12Months.map(rebuildMonthRow);
  const year = source.now.getFullYear();
  const cashExpenseQuarter = source.expenses.filter((expense) => isInQuarter(expense, source.now)).reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
  const inventoryPurchaseExpenseQuarter = inventoryPurchaseExpenses.filter((expense) => isInQuarter(expense, source.now)).reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
  const costOfGoodsQuarter = [...inventorySoldCostByDate.entries()].filter(([key]) => {
    const date = parseDate(key);
    return date && date.getFullYear() === source.now.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(source.now.getMonth() / 3);
  }).reduce((sum, [, value]) => sum + toNumber(value), 0);
  const revenueQuarter = source.orders.filter((order) => isInQuarter(order, source.now)).reduce((sum, order) => sum + orderTotal(order), 0);
  const incomeQuarter = source.payments.filter((payment) => isInQuarter(payment, source.now)).reduce((sum, payment) => sum + moneyOfPayment(payment), 0);
  const quarterStartKey = dateKey2(new BusinessDate(source.now.getFullYear(), Math.floor(source.now.getMonth() / 3) * 3, 1));
  const salaryExpenseQuarter = sumMapByDateRange(payrollCostByDate, quarterStartKey, finance.todayKey);
  const actualExpenseQuarter = operatingExpenses.filter((expense) => isInQuarter(expense, source.now)).reduce((sum, expense) => sum + moneyOfExpense(expense), 0) + costOfGoodsQuarter + salaryExpenseQuarter;
  const cashExpenseYear = sumByYear(source.expenses, year, moneyOfExpense);
  const inventoryPurchaseExpenseYear = sumByYear(inventoryPurchaseExpenses, year, moneyOfExpense);
  const costOfGoodsYear = [...inventorySoldCostByDate.entries()].filter(([key]) => key.startsWith(`${year}-`)).reduce((sum, [, value]) => sum + toNumber(value), 0);
  const revenueYear = sumByYear(source.orders, year, orderTotal);
  const incomeYear = sumByYear(source.payments, year, moneyOfPayment);
  const salaryExpenseYear = sumMapByDateRange(payrollCostByDate, `${year}-01-01`, finance.todayKey);
  const actualExpenseYear = sumByYear(operatingExpenses, year, moneyOfExpense) + costOfGoodsYear + salaryExpenseYear;
  const currentMonthCostBreakdownMap = /* @__PURE__ */ new Map();
  currentMonthCostBreakdownMap.set("Gi\xE1 v\u1ED1n \u0111\xE3 d\xF9ng", costOfGoodsMonth);
  operatingExpenses.filter((expense) => monthKey(getDateValue(expense)) === finance.currentMonthKey).forEach((expense) => {
    const category = classifyExpense(expense);
    currentMonthCostBreakdownMap.set(category, (currentMonthCostBreakdownMap.get(category) || 0) + moneyOfExpense(expense));
  });
  currentMonthCostBreakdownMap.set("L\u01B0\u01A1ng", (currentMonthCostBreakdownMap.get("L\u01B0\u01A1ng") || 0) + salaryExpenseMonth);
  const costBreakdown = [...currentMonthCostBreakdownMap.entries()].filter(([, value]) => toNumber(value) > 0).map(([name, value]) => ({ name, value }));
  const expenseCategoryRows = [];
  const expenseDetailRows = [];
  const salaryEmployeeRows = [];
  const reportEmployeesById = new Map(source.employees.map((employee) => [String(employee.id || employee.employeeId || employee.uid || employee.userId || ""), employee]));
  operatingExpenses.forEach((expense) => {
    const date = dateKey2(getDateValue(expense));
    const value = Math.max(0, toNumber(expense.amount));
    if (!date || !value) return;
    const category = classifyExpense(expense);
    const employeeId = recordEmployeeIdOf(expense);
    const employee = employeeId ? reportEmployeesById.get(employeeId) : null;
    const name = expense.name || expense.title || expense.description || expense.reason || expense.category || category;
    expenseCategoryRows.push({ date, category, name: category, detail: name, value });
    expenseDetailRows.push({
      date,
      category,
      name,
      detail: expense.note || expense.description || expense.reason || name,
      value,
      sourceType: "expense",
      sourceId: expense.id || "",
      originalAmount: expense.originalAmount,
      recipient: expense.recipient || expense.payee || expense.employeeName || expense.staffName || ""
    });
    if (category === "L\u01B0\u01A1ng") salaryEmployeeRows.push({
      date,
      employeeId,
      name: expense.employeeName || expense.staffName || employee?.name || employee?.fullName || "L\u01B0\u01A1ng ch\u01B0a g\u1EAFn nh\xE2n s\u1EF1",
      department: formatDepartmentLabel(employee?.department || employee?.position || employee?.roleName, "Ch\u01B0a ph\xE2n b\u1ED9 ph\u1EADn"),
      value
    });
  });
  inventorySoldCostByDate.forEach((value, date) => {
    if (date <= finance.todayKey && toNumber(value) > 0) {
      expenseCategoryRows.push({ date, category: "Gi\xE1 v\u1ED1n", name: "Gi\xE1 v\u1ED1n \u0111\xE3 d\xF9ng", detail: "H\xE0ng \u0111\xE3 b\xE1n", value: toNumber(value) });
      expenseDetailRows.push({ date, category: "Gi\xE1 v\u1ED1n", name: "Gi\xE1 v\u1ED1n h\xE0ng \u0111\xE3 b\xE1n", detail: "Gi\xE1 v\u1ED1n h\xE0ng \u0111\xE3 b\xE1n trong ng\xE0y, kh\xF4ng ph\u1EA3i phi\u1EBFu chi ti\u1EC1n.", sourceType: "costOfGoods", value: toNumber(value) });
    }
  });
  const payrollEmployeeRows = buildPayrollAccrualRows(source, finance.todayKey, reportEmployeesById);
  payrollEmployeeRows.forEach((item) => {
    const { date, employeeId, value } = item;
    expenseCategoryRows.push({ date, category: "L\u01B0\u01A1ng", name: "L\u01B0\u01A1ng", detail: item.name, value });
    expenseDetailRows.push({ date, category: "L\u01B0\u01A1ng", name: `L\u01B0\u01A1ng \u2022 ${item.name}`, detail: item.department, sourceType: "payroll", employeeId, value });
  });
  salaryEmployeeRows.push(...payrollEmployeeRows);
  const expenseByDepartmentMap = /* @__PURE__ */ new Map([["Gi\xE1 v\u1ED1n", costOfGoodsMonth]]);
  operatingExpenses.filter((expense) => monthKey(getDateValue(expense)) === finance.currentMonthKey).forEach((expense) => {
    const department = formatDepartmentLabel(expense.department || expense.departmentName || expense.team, "Chi ph\xED chung");
    expenseByDepartmentMap.set(department, (expenseByDepartmentMap.get(department) || 0) + moneyOfExpense(expense));
  });
  const employeesById = new Map(source.employees.map((employee) => [String(employee.id || employee.employeeId || ""), employee]));
  source.payrollCosts.filter((row) => monthKey(getDateValue(row)) === finance.currentMonthKey).forEach((row) => {
    const employee = employeesById.get(String(row.employeeId || "")) || {};
    const department = formatDepartmentLabel(employee.position || employee.department || employee.roleName || employee.role, "L\u01B0\u01A1ng nh\xE2n s\u1EF1");
    expenseByDepartmentMap.set(department, (expenseByDepartmentMap.get(department) || 0) + moneyOfExpense(row));
  });
  const expenseByDepartment = [...expenseByDepartmentMap.entries()].filter(([, value]) => value > 0).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  finance = {
    ...finance,
    cashExpenseRows: buildCashExpenseRows(source.cashExpenseRecords),
    cashExpenseToday: finance.expenseToday,
    cashExpenseYesterday: finance.expenseYesterday,
    cashExpenseWeek: finance.expenseWeek,
    cashExpenseMonth: finance.expenseMonth,
    cashExpensePreviousMonth: finance.expensePreviousMonth,
    inventoryPurchaseExpenseToday,
    inventoryPurchaseExpenseYesterday,
    inventoryPurchaseExpenseWeek,
    inventoryPurchaseExpenseMonth,
    inventoryPurchaseExpensePreviousMonth,
    nonInventoryExpenseToday,
    nonInventoryExpenseYesterday,
    nonInventoryExpenseWeek,
    nonInventoryExpenseMonth,
    nonInventoryExpensePreviousMonth,
    costOfGoodsToday,
    costOfGoodsYesterday,
    costOfGoodsWeek,
    costOfGoodsMonth,
    costOfGoodsPreviousMonth,
    salaryExpenseToday,
    salaryExpenseYesterday,
    salaryExpenseWeek,
    salaryExpenseMonth,
    salaryExpensePreviousMonth,
    salaryExpenseQuarter,
    salaryExpenseYear,
    actualUsedCostToday: costOfGoodsToday,
    actualUsedCostYesterday: costOfGoodsYesterday,
    actualUsedCostWeek: costOfGoodsWeek,
    actualUsedCostMonth: costOfGoodsMonth,
    actualUsedCostPreviousMonth: costOfGoodsPreviousMonth,
    expenseToday: actualExpenseToday,
    expenseYesterday: actualExpenseYesterday,
    expenseWeek: actualExpenseWeek,
    expenseMonth: actualExpenseMonth,
    expensePreviousMonth: actualExpensePreviousMonth,
    operatingExpenseToday: actualExpenseToday,
    operatingExpenseYesterday: actualExpenseYesterday,
    operatingExpenseWeek: actualExpenseWeek,
    operatingExpenseMonth: actualExpenseMonth,
    operatingExpensePreviousMonth: actualExpensePreviousMonth,
    profitExpenseToday: actualExpenseToday,
    profitExpenseWeek: actualExpenseWeek,
    profitExpenseMonth: actualExpenseMonth,
    profitExpensePreviousMonth: actualExpensePreviousMonth,
    totalExpenseToday: actualExpenseToday,
    totalExpenseWeek: actualExpenseWeek,
    totalExpenseMonth: actualExpenseMonth,
    profitToday: finance.revenueToday - actualExpenseToday,
    profitYesterday: finance.revenueYesterday - actualExpenseYesterday,
    profitWeek: finance.revenueWeek - actualExpenseWeek,
    profitMonth: finance.revenueMonth - actualExpenseMonth,
    profitPreviousMonth: finance.revenuePreviousMonth - actualExpensePreviousMonth,
    expenseChangePct: percentChange(actualExpenseMonth, actualExpensePreviousMonth),
    revenueQuarter,
    revenueYear,
    expenseQuarter: actualExpenseQuarter,
    expenseYear: actualExpenseYear,
    incomeQuarter,
    incomeYear,
    outcomeQuarter: cashExpenseQuarter,
    outcomeYear: cashExpenseYear,
    cashflowToday: finance.incomeToday - finance.expenseToday,
    cashflowWeek: finance.incomeWeek - finance.expenseWeek,
    cashflowQuarter: incomeQuarter - cashExpenseQuarter,
    cashflowYear: incomeYear - cashExpenseYear,
    quarterProfit: revenueQuarter - actualExpenseQuarter,
    yearProfit: revenueYear - actualExpenseYear,
    series7Days,
    series30Days,
    dailyCashflowRows: series30Days,
    series12Months,
    costBreakdown,
    expenseByDepartment,
    expenseCategoryRows,
    expenseDetailRows,
    payrollAccrualRows: payrollEmployeeRows,
    salaryEmployeeRows
  };
  const profitabilityDate = parseDate(finance.todayKey) || source.now || new BusinessDate();
  yield;
  const readProfitabilitySnapshot = createProfitabilitySnapshotReader(
    source,
    [finance.todayKey, ...[2, 1, 0].map((offset) => dateKey2(addDays(profitabilityDate, -offset))).filter(Boolean)]
  );
  yield;
  const profitabilityBase = readProfitabilitySnapshot(finance.todayKey);
  yield;
  const profitabilityDiagnostics = buildProfitabilityDiagnostics(source, finance, readProfitabilitySnapshot);
  yield;
  const profitability = { ...profitabilityBase, ...profitabilityDiagnostics };
  const costs = CostAnalysisService.build(source, finance);
  yield;
  const business = yield* buildBusinessAnalysisSteps(source, finance, profitability);
  yield;
  const operations = buildOperations(source, finance);
  yield;
  const isRequestDelivered = createRequestDeliveryLookup(source.warehouseDispatches);
  const undeliveredRequests = source.orderRequests.filter((request) => !isRequestDelivered(request));
  const shell = {
    generatedAt: new BusinessDate().toISOString(),
    period: {
      todayKey: finance.todayKey,
      yesterdayKey: finance.yesterdayKey,
      currentMonthKey: finance.currentMonthKey,
      previousMonthKey: finance.previousMonthKey
    },
    finance,
    costs,
    business,
    profitability,
    operations,
    sourceCounts: {
      orders: source.orders.length,
      orderRequests: source.orderRequests.length,
      warehouseDispatches: source.warehouseDispatches.length,
      customers: source.customers.length
    }
  };
  const alerts = AlertService.build(source, shell);
  yield;
  const kpis = [
    makeKpi({ id: "revenueToday", title: "Doanh thu h\xF4m nay", value: finance.revenueToday, current: finance.revenueToday, previousDay: finance.revenueYesterday, currentMonth: finance.revenueMonth, previousMonth: finance.revenuePreviousMonth }),
    makeKpi({ id: "revenueMonth", title: "Doanh thu th\xE1ng", value: finance.revenueMonth, current: finance.revenueToday, previousDay: finance.revenueYesterday, currentMonth: finance.revenueMonth, previousMonth: finance.revenuePreviousMonth }),
    makeKpi({ id: "profitToday", title: "L\u1EE3i nhu\u1EADn h\xF4m nay", value: finance.profitToday, current: finance.profitToday, previousDay: finance.profitYesterday, currentMonth: finance.profitMonth, previousMonth: finance.profitPreviousMonth }),
    makeKpi({ id: "profitMonth", title: "L\u1EE3i nhu\u1EADn th\xE1ng", value: finance.profitMonth, current: finance.profitToday, previousDay: finance.profitYesterday, currentMonth: finance.profitMonth, previousMonth: finance.profitPreviousMonth }),
    makeKpi({ id: "expenseMonth", title: "T\u1ED5ng chi th\xE1ng", value: finance.expenseMonth, current: finance.expenseToday, previousDay: finance.expenseYesterday, currentMonth: finance.expenseMonth, previousMonth: finance.expensePreviousMonth, positiveWhen: "down" }),
    makeKpi({ id: "receivables", title: "C\xF4ng n\u1EE3 ph\u1EA3i thu", value: finance.receivables, current: finance.receivables, previousDay: finance.receivables, currentMonth: finance.receivables, previousMonth: finance.receivables, positiveWhen: "down" }),
    makeKpi({ id: "payables", title: "C\xF4ng n\u1EE3 ph\u1EA3i tr\u1EA3", value: finance.payables, current: finance.payables, previousDay: finance.payables, currentMonth: finance.payables, previousMonth: finance.payables, positiveWhen: "down" }),
    makeKpi({ id: "cashBalance", title: "Ti\u1EC1n m\u1EB7t hi\u1EC7n c\xF3", value: finance.cashBalance, current: finance.cashBalance, previousDay: finance.cashBalance, currentMonth: finance.cashBalance, previousMonth: finance.cashBalance }),
    makeKpi({ id: "inventoryValue", title: "Gi\xE1 tr\u1ECB t\u1ED3n kho", value: operations.inventoryValue, current: operations.inventoryValue, previousDay: operations.inventoryValue, currentMonth: operations.inventoryValue, previousMonth: operations.inventoryValue }),
    makeKpi({ id: "undeliveredOrders", title: "\u0110\u01A1n ch\u01B0a giao", value: undeliveredRequests.length, kind: "number", current: undeliveredRequests.length, previousDay: 0, currentMonth: undeliveredRequests.length, previousMonth: 0, positiveWhen: "down" }),
    makeKpi({ id: "employeesPresent", title: "Nh\xE2n vi\xEAn \u0111i l\xE0m h\xF4m nay", value: operations.employeesPresentToday, kind: "number", current: operations.employeesPresentToday, previousDay: 0, currentMonth: operations.employeesPresentToday, previousMonth: source.employees.length }),
    makeKpi({ id: "openAlerts", title: "C\u1EA3nh b\xE1o \u0111ang m\u1EDF", value: alerts.length, kind: "number", current: alerts.length, previousDay: 0, currentMonth: alerts.length, previousMonth: 0, positiveWhen: "down" })
  ];
  const completed = { ...shell, kpis, alerts };
  const insights = InsightService.build(source, completed, alerts);
  yield;
  const recommendations = RecommendationService.build(source, completed, alerts);
  return { ...completed, insights, recommendations };
}
var DashboardService = {
  build(input = {}) {
    const iterator = buildDashboardSnapshotSteps(input);
    for (; ; ) {
      const step = iterator.next();
      if (step.done) return step.value;
    }
  }
};
var buildExecutiveDashboardSnapshot = (input = {}) => {
  const previous = activeBuildCache;
  activeBuildCache = { dates: /* @__PURE__ */ new Map(), billing: /* @__PURE__ */ new WeakMap(), totals: /* @__PURE__ */ new WeakMap(), deliveries: /* @__PURE__ */ new WeakMap() };
  try {
    return DashboardService.build(input);
  } finally {
    activeBuildCache = previous;
  }
};
function buildHomeProductDetail({ orders = [], products = [], product = {}, orderRequests = [], warehouseDispatches = [] }) {
  const resolveUnits = createTransactionUnitEvidence({ orderRequests, warehouseDispatches });
  const catalog = new Map(products.map((p) => [p.id, p])), lines = [];
  for (const order of orders) {
    if (isArchived(order) || isCancelled(order)) continue;
    getItems(order).forEach((item, index) => {
      const name = productNameOf(item, catalog);
      if (item.productId ? String(item.productId) !== String(product.id) : normalizeText4(name) !== normalizeText4(product.name)) return;
      const billing = resolveTransactionBillingSnapshot({ record: item });
      const quantity = toNumber(item.actualQuantity ?? item.actualQuantityCount ?? item.quantityCount ?? (billing.actualQuantity || itemQuantity(item)));
      const savedUnit = item.actualUnit || item.actualQuantityUnit || item.quantityUnit || item.unit || item.stockUnit || item.productUnit;
      const unitEvidence = resolveUnits({ order, item, itemIndex: index });
      lines.push({ lineId: `${order.id}:${index}`, orderId: order.id, productId: item.productId || product.id, name, date: dateKey2(getDateValue(order)), invoiceQuantity: itemQuantity(item), quantity, unit: savedUnit || "Ch\u01B0a l\u01B0u \u0110VT", unitStatus: savedUnit ? "SAVED" : "NOT_RECORDED", orderedUnit: unitEvidence.orderedUnit || "Ch\u01B0a l\u01B0u \u0110VT", pricingUnit: unitEvidence.pricingUnit || "Ch\u01B0a l\u01B0u \u0110VT", unitPrice: item.unitPrice ?? item.price ?? null, unitEvidence, billingQuantity: billing.billingQuantity || itemQuantity(item), billingUnit: billing.billingUnit || savedUnit || "Ch\u01B0a l\u01B0u \u0110VT", amount: itemLineTotal(item), documentAmount: orderTotal(order), sourceDispatchIds: [...new Set(toArray(item.sourceDispatchIds))] });
    });
  }
  return { productId: product.id, lines, amount: lines.reduce((n, l) => n + l.amount, 0), quantities: lines.reduce((m, l) => (m[l.unit] = (m[l.unit] || 0) + l.quantity, m), {}) };
}

// development/hd-manager/application/src/features/business-report/reportViewModel.js
var number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
var vndFormat = new Intl.NumberFormat("vi-VN");
var compactBillionsFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
var compactMillionsAndPercentFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
var formatShortDate = (key) => {
  const [year, month, day] = String(key || "").split("-");
  return year && month && day ? `${day}/${month}` : String(key || "");
};
var sumRows = (rows, field) => rows.reduce((sum, row) => sum + number(row?.[field]), 0);
function getCashExpenseFinance(finance = {}) {
  if (!Array.isArray(finance.cashExpenseRows)) return finance;
  const payrollRows = finance.payrollAccrualRows || [];
  const rows = finance.cashExpenseRows.filter((row) => row.date && row.category !== "L\u01B0\u01A1ng").map((row) => ({
    ...row,
    category: row.category === "Gi\xE1 v\u1ED1n" ? "Chi mua h\xE0ng" : row.category
  }));
  rows.push(...payrollRows.map((row) => ({ ...row, category: "L\u01B0\u01A1ng", sourceType: "payroll" })));
  const days = /* @__PURE__ */ new Map();
  const months = /* @__PURE__ */ new Map();
  for (const row of rows) {
    days.set(row.date, (days.get(row.date) || 0) + number(row.value));
    const month = row.date.slice(0, 7);
    months.set(month, (months.get(month) || 0) + number(row.value));
  }
  const project = (row) => {
    const expense = (row.date ? days.get(row.date) : months.get(row.month)) || 0;
    return { ...row, expense, profit: number(row.revenue) - expense };
  };
  const daily = new Map((finance.series30Days || []).map((row) => [row.date, row]));
  const monthly = new Map((finance.series12Months || []).map((row) => [row.month, row]));
  for (const date of days.keys()) {
    if (date > finance.todayKey && date.startsWith(finance.currentMonthKey) && !daily.has(date)) daily.set(date, { date });
  }
  for (const month of months.keys()) {
    if (month > finance.currentMonthKey && month.startsWith(String(finance.todayKey).slice(0, 4)) && !monthly.has(month)) monthly.set(month, { month });
  }
  return {
    ...finance,
    expenseBasis: "cash-vouchers",
    reportExpenseRows: rows,
    expenseDetailRows: rows,
    expenseCategoryRows: rows.map((row) => ({ ...row, name: row.category })),
    salaryEmployeeRows: payrollRows,
    series7Days: (finance.series7Days || []).map(project),
    series30Days: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map(project),
    series12Months: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)).map(project)
  };
}
function getReportPeriod(finance = {}, period = "today", customRange = null) {
  const today = String(finance.todayKey || "");
  const month = String(finance.currentMonthKey || today.slice(0, 7));
  const quarter = Math.floor((Number(month.slice(5, 7)) - 1) / 3);
  const year = today.slice(0, 4);
  const quarterStartMonth = String(quarter * 3 + 1).padStart(2, "0");
  const daily = Array.isArray(finance.series30Days) ? finance.series30Days : [];
  const monthly = Array.isArray(finance.series12Months) ? finance.series12Months : [];
  const rangeRows = period === "custom" ? daily.filter((row) => row.date >= customRange?.start && row.date <= customRange?.end) : [];
  const map = {
    today: { label: "H\xF4m nay", startDate: today, endDate: today, revenue: finance.revenueToday, profit: finance.profitToday, expense: finance.expenseToday, rows: daily.filter((row) => row.date === today), previous: { revenue: finance.revenueYesterday, profit: finance.profitYesterday, expense: finance.expenseYesterday } },
    week: { label: "Tu\u1EA7n n\xE0y", startDate: finance.weekStartKey, endDate: finance.weekEndKey, revenue: finance.revenueWeek, profit: finance.profitWeek, expense: finance.expenseWeek, rows: daily.filter((row) => row.date >= finance.weekStartKey && row.date <= finance.weekEndKey) },
    month: { label: "Th\xE1ng n\xE0y", startDate: `${month}-01`, endDate: today, revenue: finance.revenueMonth, profit: finance.profitMonth, expense: finance.expenseMonth, rows: daily.filter((row) => String(row.date).startsWith(month)), previous: { revenue: finance.revenuePreviousMonth, profit: finance.profitPreviousMonth, expense: finance.expensePreviousMonth } },
    quarter: { label: `Qu\xFD ${quarter + 1}`, startDate: `${year}-${quarterStartMonth}-01`, endDate: today, revenue: finance.revenueQuarter, profit: finance.quarterProfit, expense: finance.expenseQuarter, rows: monthly.filter((row) => String(row.month).startsWith(year) && Math.floor((Number(String(row.month).slice(5, 7)) - 1) / 3) === quarter) },
    year: { label: `N\u0103m ${year}`, startDate: `${year}-01-01`, endDate: today, revenue: finance.revenueYear, profit: finance.yearProfit, expense: finance.expenseYear, rows: monthly.filter((row) => String(row.month).startsWith(year)) },
    custom: { label: `${formatShortDate(customRange?.start)}\u2013${formatShortDate(customRange?.end)}`, startDate: customRange?.start, endDate: customRange?.end, revenue: sumRows(rangeRows, "revenue"), profit: sumRows(rangeRows, "profit"), expense: sumRows(rangeRows, "expense"), rows: rangeRows }
  };
  const selected = map[period] || map.today;
  if (finance.expenseBasis === "cash-vouchers") {
    const lastDay = (yearValue, monthValue) => {
      const date = new BusinessDate(Number(yearValue), Number(monthValue), 0);
      return `${yearValue}-${String(monthValue).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    if (period === "month") selected.endDate = lastDay(year, month.slice(5, 7));
    if (period === "quarter") selected.endDate = lastDay(year, (quarter + 1) * 3);
    if (period === "year") selected.endDate = `${year}-12-31`;
    const sumExpense = (start, end) => finance.reportExpenseRows.reduce((sum, row) => row.date && row.date >= start && row.date <= end ? sum + number(row.value) : sum, 0);
    selected.expense = sumExpense(selected.startDate, selected.endDate);
    selected.profit = number(selected.revenue) - selected.expense;
    if (selected.previous) {
      const previousMonth = finance.previousMonthKey || "";
      const start = period === "today" ? finance.yesterdayKey : `${previousMonth}-01`;
      const end = period === "today" ? finance.yesterdayKey : lastDay(previousMonth.slice(0, 4), previousMonth.slice(5, 7));
      const expense = sumExpense(start, end);
      selected.previous = { ...selected.previous, expense, profit: number(selected.previous.revenue) - expense };
    }
  }
  const chartRows = period === "today" ? Array.isArray(finance.series7Days) ? finance.series7Days : [] : selected.rows;
  return {
    ...selected,
    revenue: number(selected.revenue),
    profit: number(selected.profit),
    expense: number(selected.expense),
    receivables: number(finance.receivables),
    overdueReceivables: number(finance.overdueReceivables),
    chartRows,
    chartLabel: period === "today" ? "7 ng\xE0y" : selected.label
  };
}

// development/hd-manager/application/src/data/homeFeedContract.js
var HOME_FEED_SOURCES = Object.freeze(["companies", "employees", "customers", "orders", "payments", "expenses", "financials", "attendance", "performance", "payrollPeriods", "payrollSnapshots", "products", "warehouseImports", "warehouseDispatches", "warehouseStockCounts", "holidays", "deliveryReports", "employeeReviews", "customerComplaints", "assets", "assetCostLogs", "advances", "orderRequests"]);
var NATIVE_HOME_SOURCES = Object.freeze(["companies", "nativeUsers", "nativeCustomers", "nativeProducts", "nativeOrders", "nativeOrderLines", "nativeCashTransactions", "nativeStockLedger", "nativeStockBalances", "nativeOrderRequests", "nativeOrderRequestLines", "nativeAuthorizations"]);
var HOME_REQUEST_CALCULATION_FIELDS = Object.freeze(["id", "companyId", "archived", "isArchived", "deleted", "isDeleted", "status", "customerId", "customerName", "name", "productId", "productName", "product", "itemName", "date", "orderDate", "requestDate", "dispatchDate", "importDate", "paymentDate", "expenseDate", "createdAt", "updatedAt", "timestamp"]);

// development/hd-manager/application/src/data/offlineHomeOverview.js
function buildOfflineHomeOverview(snapshot, preparedFinance) {
  if (!snapshot?.finance) throw Error("Complete Home finance required");
  const finance = preparedFinance || getCashExpenseFinance(snapshot.finance);
  const calendar = Object.fromEntries(Object.entries(finance).filter(([key, value]) => value === null || typeof value !== "object" || ["series7Days", "series30Days", "series12Months"].includes(key)));
  const periodReports = Object.fromEntries(["today", "week", "month", "quarter", "year"].map((period) => [period, getReportPeriod(finance, period)]));
  return { overviewVersion: 1, snapshot: { kind: "home-primary-v1", generatedAt: snapshot.generatedAt, finance: calendar, sourceCounts: snapshot.sourceCounts }, periodReports };
}

// development/hd-manager/application/src/services/companyHomeProjection.js
function projectCompanyHome({ sources, tenantId, asOfDay, payrollMonthCache }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDay) || HOME_FEED_SOURCES.some((name) => !Array.isArray(sources[name]))) throw Error("Incomplete Home source manifest");
  for (const [name, rows] of Object.entries(sources)) for (const row of rows) {
    if (name === "companies" ? row.id !== tenantId : row.companyId !== tenantId) throw Error("Home projection tenant mismatch");
  }
  const company = sources.companies.find((row) => row.id === tenantId);
  if (!company) throw Error("Company source missing");
  const now = new BusinessDate(asOfDay + "T12:00:00+07:00");
  if (now.getDate() !== Number(asOfDay.slice(8))) throw Error("Invalid business report day");
  const attendance = Object.fromEntries(sources.attendance.map((row) => [row.id, row]));
  const performance2 = Object.fromEntries(sources.performance.map((row) => [row.id, row]));
  const lockedPayroll = {};
  for (const period of sources.payrollPeriods) {
    if (!getLockedPayrollPeriod([period], tenantId, period.monthKey)) continue;
    const snapshots = sources.payrollSnapshots.filter((row) => row.periodId === period.id || row.monthKey === period.monthKey);
    if (!snapshots.length) throw Error("Locked payroll snapshots not downloaded: " + period.monthKey);
    lockedPayroll[period.monthKey] = { snapshots };
  }
  const ledgers = buildCustomerReconciledLedgerMap(sources.customers, sources.orders, sources.payments, sources.warehouseImports, sources.expenses);
  const debtLedger = sources.customers.filter((row) => !row.isArchived).map((row) => ({ id: row.id, name: row.name, debt: ledgers[row.id]?.currentDebt || 0 }));
  const cashExpenseRecords = sources.expenses.filter(isCashflowOfficial).map((row) => ({ ...row, date: resolveCashflowDateKey(row) }));
  const inputs = { ...sources, company, now, attendance, performance: performance2, lockedPayroll, debtLedger, cashExpenseRecords, attendanceLoaded: true, complaintsLoaded: true, dashboardDayKey: asOfDay };
  const payrollCosts = withSalesRevenueIndex(() => buildDashboardPayrollCostRows({ ...inputs, monthRowsCache: payrollMonthCache }));
  const snapshot = buildExecutiveDashboardSnapshot({ ...inputs, payrollCosts });
  const finance = getCashExpenseFinance(snapshot.finance);
  const reports = Object.fromEntries(["today", "week", "month", "quarter", "year"].map((period) => {
    const r = getReportPeriod(finance, period);
    const rows = (snapshot.finance.expenseDetailRows || []).filter((x) => x.date >= r.startDate && x.date <= r.endDate);
    return [period, { start: r.startDate, end: r.endDate, revenue: r.revenue, expense: r.expense, profit: r.profit, receivables: r.receivables, payables: finance.payables, salary: (finance.reportExpenseRows || []).filter((x) => x.sourceType === "payroll" && x.date >= r.startDate && x.date <= r.endDate).reduce((s, x) => s + x.value, 0), costOfGoods: rows.filter((x) => x.sourceType === "costOfGoods").reduce((s, x) => s + x.value, 0), income: finance[{ today: "incomeToday", week: "incomeWeek", month: "incomeMonth", quarter: "incomeQuarter", year: "incomeYear" }[period]], inventoryValue: snapshot.operations.inventoryValue, inventoryQuantity: snapshot.operations.inventoryQuantity }];
  }));
  const production = buildHomePeriodProduction(inputs, reports);
  for (const period of Object.keys(reports)) reports[period].production = production[period];
  return { inputs, payrollCosts, snapshot, reports, overview: buildOfflineHomeOverview(snapshot, finance) };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HOME_FEED_SOURCES,
  buildHomeProductDetail,
  buildOrderDuplicateSignature,
  hasCompanyRolePermissionAction,
  projectCompanyHome,
  resolveCashflowDateKey
});
