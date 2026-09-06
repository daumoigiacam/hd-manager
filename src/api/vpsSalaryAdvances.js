import { HdApiError } from "./client.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VERSION = 2_147_483_647;
const pendingRequests = new Map();
const owns = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
const fail = (code, message = code) => {
  throw new HdApiError(message, { code });
};
const nativeVersion = (row) =>
  Number.isInteger(row?.version) &&
  row.version >= 1 &&
  row.version <= MAX_VERSION;
const timestamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));

export function vpsSalaryAdvanceId(value) {
  if (typeof value !== "string" || !UUID.test(value))
    fail("HR_SALARY_ADVANCE_ID_INVALID");
  return value.toLowerCase();
}

const requireKeys = (record, allowed) => {
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    Object.keys(record).some((key) => !allowed.includes(key))
  )
    fail("HR_SALARY_ADVANCE_INVALID");
};

const month = (value) => {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    fail("HR_SALARY_ADVANCE_INVALID");
  return value;
};

const money = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    fail("HR_SALARY_ADVANCE_INVALID");
  }
  const [coefficient, exponent = "0"] = String(value).split("e");
  const places = Math.max(
    0,
    (coefficient.split(".")[1]?.length ?? 0) - Number(exponent),
  );
  if (places > 2) fail("HR_SALARY_ADVANCE_INVALID");
  return value;
};

const normalizedReason = (value) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 500 ||
    /[\x00-\x1f\x7f]/.test(value)
  ) {
    fail("HR_SALARY_ADVANCE_INVALID");
  }
  return value.trim();
};

export function vpsSalaryAdvanceMutationPayload(operation, record) {
  if (!["create", "approve", "reject", "cancel"].includes(operation))
    fail("HR_SALARY_ADVANCE_INVALID");
  requireKeys(
    record,
    operation === "create"
      ? ["requestId", "employeeId", "salaryMonth", "amount", "reason"]
      : ["requestId"],
  );
  if (typeof record.requestId !== "string" || !UUID_V4.test(record.requestId))
    fail("HR_SALARY_ADVANCE_INVALID");
  if (operation !== "create")
    return { requestId: record.requestId.toLowerCase() };
  return {
    requestId: record.requestId.toLowerCase(),
    employeeId: vpsSalaryAdvanceId(record.employeeId),
    salaryMonth: month(record.salaryMonth),
    amount: money(record.amount),
    reason: normalizedReason(record.reason),
  };
}

export function vpsSalaryAdvanceQuery(query = {}) {
  requireKeys(query, ["salaryMonth", "includeArchived", "limit", "offset"]);
  const result = { includeArchived: false, limit: 100, offset: 0, ...query };
  for (const key of ["limit", "offset"]) {
    if (typeof result[key] === "string" && /^\d+$/.test(result[key]))
      result[key] = Number(result[key]);
  }
  if (result.includeArchived === "true") result.includeArchived = true;
  if (result.includeArchived === "false") result.includeArchived = false;
  if (
    typeof result.includeArchived !== "boolean" ||
    !Number.isInteger(result.limit) ||
    result.limit < 1 ||
    result.limit > 200 ||
    !Number.isInteger(result.offset) ||
    result.offset < 0 ||
    result.offset > MAX_VERSION
  )
    fail("HR_SALARY_ADVANCE_INVALID");
  if (owns(result, "salaryMonth")) month(result.salaryMonth);
  return result;
}

const status = (value) => {
  if (!["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(value))
    fail("HR_SALARY_ADVANCE_RESPONSE_INVALID");
  return value;
};

export function normalizeVpsSalaryAdvance(record) {
  if (
    !record ||
    typeof record !== "object" ||
    !nativeVersion(record) ||
    !timestamp(record.requestedAt) ||
    !timestamp(record.createdAt) ||
    !timestamp(record.updatedAt) ||
    !UUID.test(record.requestReference) ||
    !UUID.test(record.requestedByUserId) ||
    !["approvedAt", "rejectedAt", "cancelledAt", "archivedAt"].every(
      (key) => record[key] === null || timestamp(record[key]),
    ) ||
    !["approvedByUserId", "rejectedByUserId", "cancelledByUserId"].every(
      (key) => record[key] === null || UUID.test(record[key]),
    ) ||
    typeof record.isArchived !== "boolean"
  )
    fail("HR_SALARY_ADVANCE_RESPONSE_INVALID");
  const normalizedStatus = status(`${record.status}`.toUpperCase());
  const row = {
    ...record,
    id: vpsSalaryAdvanceId(record.id),
    companyId: vpsSalaryAdvanceId(record.companyId),
    employeeId: vpsSalaryAdvanceId(record.employeeId),
    salaryMonth: month(record.salaryMonth),
    amount: money(record.amount),
    reason: normalizedReason(record.reason),
    status: normalizedStatus,
    vpsSalaryAdvance: true,
  };
  if (
    row.status === "APPROVED" &&
    (!timestamp(row.approvedAt) || !UUID.test(row.approvedByUserId))
  ) {
    fail("HR_SALARY_ADVANCE_RESPONSE_INVALID");
  }
  if (
    row.status === "REJECTED" &&
    (!timestamp(row.rejectedAt) || !UUID.test(row.rejectedByUserId))
  ) {
    fail("HR_SALARY_ADVANCE_RESPONSE_INVALID");
  }
  if (
    row.status === "CANCELLED" &&
    (!timestamp(row.cancelledAt) || !UUID.test(row.cancelledByUserId))
  ) {
    fail("HR_SALARY_ADVANCE_RESPONSE_INVALID");
  }
  return {
    ...row,
    empId: row.employeeId,
    date: row.requestedAt.slice(0, 10),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status.toLowerCase(),
    isArchived: row.isArchived || row.status === "CANCELLED",
    linkedFinancialRecordId:
      row.status === "APPROVED" ? `vps-advance:${row.id}` : "",
  };
}

const authorize = (session, permission) => {
  if (!session?.permissions?.includes(permission))
    fail("HR_SALARY_ADVANCE_PERMISSION_REQUIRED");
  return {
    companyId: vpsSalaryAdvanceId(session.companyId),
    id: vpsSalaryAdvanceId(session.id),
  };
};

export async function loadVpsSalaryAdvances(
  api,
  session,
  { cancelled = () => false, query = {} } = {},
) {
  const actor = authorize(session, "hr.payroll.read");
  const filter = vpsSalaryAdvanceQuery({
    ...query,
    includeArchived: true,
    limit: 100,
    offset: 0,
  });
  const items = [];
  const ids = new Set();
  let offset = 0;
  while (items.length < 250_000) {
    if (cancelled()) fail("HR_SALARY_ADVANCE_LOAD_CANCELLED");
    const result = await api.listManagerSalaryAdvances({ ...filter, offset });
    if (cancelled()) fail("HR_SALARY_ADVANCE_LOAD_CANCELLED");
    if (
      !Array.isArray(result?.items) ||
      result.items.length > filter.limit ||
      !owns(result, "nextOffset") ||
      (result.nextOffset !== null &&
        (result.nextOffset !== offset + filter.limit ||
          result.items.length !== filter.limit)) ||
      (offset > 0 && result.items.length === 0)
    )
      fail("HR_SALARY_ADVANCE_PAGINATION_INVALID");
    for (const item of result.items) {
      if (!item?.id || item.companyId !== actor.companyId || ids.has(item.id))
        fail("HR_SALARY_ADVANCE_SCOPE_MISMATCH");
      ids.add(item.id);
      items.push(normalizeVpsSalaryAdvance(item));
    }
    if (result.nextOffset === null) return { items, complete: true };
    offset = result.nextOffset;
  }
  fail("HR_SALARY_ADVANCE_LOAD_LIMIT");
}

export function mergeVpsSalaryAdvances(previous, incoming, companyId) {
  const tenant = vpsSalaryAdvanceId(companyId);
  const rows = new Map(
    previous.map((row) => [`${row.companyId}:${row.id}`, row]),
  );
  const seen = new Set();
  for (const record of incoming) {
    if (!record?.id || record.companyId !== tenant || seen.has(record.id))
      fail("HR_SALARY_ADVANCE_SCOPE_MISMATCH");
    seen.add(record.id);
    const next = normalizeVpsSalaryAdvance(record);
    const key = `${tenant}:${next.id}`;
    const old = rows.get(key);
    if (
      old &&
      old.vpsSalaryAdvance &&
      nativeVersion(old) &&
      old.version > next.version
    )
      continue;
    rows.set(key, next);
  }
  return [...rows.values()];
}

export function vpsSalaryAdvanceFinancial(record) {
  const advance = normalizeVpsSalaryAdvance(record);
  if (advance.status !== "approved") return null;
  return {
    id: `vps-advance:${advance.id}`,
    companyId: advance.companyId,
    empId: advance.employeeId,
    employeeId: advance.employeeId,
    type: "advance",
    amount: advance.amount,
    reason: advance.reason,
    date: advance.date,
    salaryMonth: advance.salaryMonth,
    isArchived: false,
    sourceType: "salary_advance_request",
    linkedAdvanceRequestId: advance.id,
    reviewedByEmpId: advance.approvedByUserId,
    createdAt: advance.createdAt,
    updatedAt: advance.updatedAt,
    vpsSalaryAdvance: true,
  };
}

export function mergeVpsSalaryAdvanceFinancials(previous, incoming, companyId) {
  const tenant = vpsSalaryAdvanceId(companyId);
  const changedIds = new Set(
    incoming.map((record) => normalizeVpsSalaryAdvance(record).id),
  );
  const retained = previous.filter(
    (record) =>
      !(
        record?.companyId === tenant &&
        record?.vpsSalaryAdvance &&
        changedIds.has(record.linkedAdvanceRequestId)
      ),
  );
  return [
    ...retained,
    ...incoming.map(vpsSalaryAdvanceFinancial).filter(Boolean),
  ];
}

const requestFor = (operation, actor, id, payload) => {
  const key = JSON.stringify([
    operation,
    actor.companyId,
    actor.id,
    id,
    payload,
  ]);
  if (!pendingRequests.has(key)) {
    if (!globalThis.crypto?.randomUUID)
      fail("HR_SALARY_ADVANCE_SECURE_UUID_UNAVAILABLE");
    pendingRequests.set(key, globalThis.crypto.randomUUID());
  }
  return { key, requestId: pendingRequests.get(key) };
};

const saved = (record, actor, current, expectedStatus) => {
  if (
    !record ||
    record.companyId !== actor.companyId ||
    (current && record.id !== current.id)
  )
    fail("HR_SALARY_ADVANCE_SCOPE_MISMATCH");
  const row = normalizeVpsSalaryAdvance(record);
  if (
    row.status !== expectedStatus ||
    row.version !== (current ? current.version + 1 : 1)
  ) {
    fail("HR_SALARY_ADVANCE_RESPONSE_INVALID");
  }
  return row;
};

export async function createVpsSalaryAdvance(api, session, data) {
  const actor = authorize(session, "hr.payroll.manage");
  const payload = {
    employeeId: data?.employeeId || data?.empId,
    salaryMonth: data?.salaryMonth,
    amount: data?.amount,
    reason: data?.reason,
  };
  const { key, requestId } = requestFor("create", actor, null, payload);
  const result = saved(
    await api.createManagerSalaryAdvance(
      vpsSalaryAdvanceMutationPayload("create", { requestId, ...payload }),
    ),
    actor,
    null,
    "pending",
  );
  pendingRequests.delete(key);
  return result;
}

const mutable = (actor, current) => {
  if (
    !current ||
    current.companyId !== actor.companyId ||
    !current.vpsSalaryAdvance
  )
    fail("reconciliation_required");
  const row = normalizeVpsSalaryAdvance(current);
  if (row.status !== "pending" || row.isArchived || row.version === MAX_VERSION)
    fail("HR_SALARY_ADVANCE_NOT_PENDING");
  return row;
};

const transition = async (operation, api, session, current) => {
  const actor = authorize(session, "hr.payroll.manage");
  const row = mutable(actor, current);
  const { requestId } = requestFor(operation, actor, row.id, {});
  const call = {
    approve: () =>
      api.approveManagerSalaryAdvance(
        row.id,
        vpsSalaryAdvanceMutationPayload(operation, { requestId }),
      ),
    reject: () =>
      api.rejectManagerSalaryAdvance(
        row.id,
        vpsSalaryAdvanceMutationPayload(operation, { requestId }),
      ),
    cancel: () =>
      api.cancelManagerSalaryAdvance(
        row.id,
        vpsSalaryAdvanceMutationPayload(operation, { requestId }),
      ),
  }[operation];
  return saved(
    await call(),
    actor,
    row,
    operation === "approve"
      ? "approved"
      : operation === "reject"
        ? "rejected"
        : "cancelled",
  );
};

export const approveVpsSalaryAdvance = (api, session, current) =>
  transition("approve", api, session, current);
export const rejectVpsSalaryAdvance = (api, session, current) =>
  transition("reject", api, session, current);
export const cancelVpsSalaryAdvance = (api, session, current) =>
  transition("cancel", api, session, current);

export const vpsSalaryAdvanceErrorMessage = (error) => {
  const code = error?.code || error?.message;
  if (code === "HR_SALARY_ADVANCE_PAYROLL_PERIOD_LOCKED")
    return "Kỳ lương này đã khóa; không thể thay đổi lệnh ứng.";
  if (code === "HR_SALARY_ADVANCE_NOT_PENDING")
    return "Lệnh ứng không còn ở trạng thái chờ xử lý.";
  if (code === "HR_SALARY_ADVANCE_EMPLOYEE_NOT_FOUND")
    return "Nhân sự không còn hoạt động trong công ty hiện tại.";
  if (code === "reconciliation_required")
    return "Dữ liệu ứng lương cũ cần đối soát trước khi chỉnh sửa trên VPS.";
  return "Không thể lưu lệnh ứng lương trên VPS. Dữ liệu chưa được thay đổi.";
};
