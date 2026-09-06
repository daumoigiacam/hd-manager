import { HdApiError } from './client.js';
import { normalizeVpsDeliveryReport } from './vpsDeliveryReports.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value) => `${value ?? ''}`.trim();
const isUuid = (value) => UUID_PATTERN.test(text(value));
const lifecycleStatus = (delivery = {}) => text(delivery.status).toUpperCase();
const fail = (message, code) => new HdApiError(message, { code });

const requireCompany = (session = {}) => {
  const companyId = text(session.companyId);
  if (!isUuid(companyId)) {
    throw fail('VPS tenant context is required.', 'VPS_DELIVERY_LIFECYCLE_TENANT_REQUIRED');
  }
  return companyId;
};

const requireNativeDeliveryId = (report = {}) => {
  if (!report?.vpsDelivery || !isUuid(report.id)) {
    throw fail(
      'This delivery has not been reconciled to a VPS delivery record.',
      'VPS_DELIVERY_LIFECYCLE_MAPPING_REQUIRED',
    );
  }
  return report.id;
};

const requireSameTenant = (delivery, companyId) => {
  if (!delivery || text(delivery.companyId) !== companyId) {
    throw fail('The delivery response belongs to another tenant.', 'VPS_DELIVERY_LIFECYCLE_TENANT_MISMATCH');
  }
  return delivery;
};

const safeOptionalUuid = (value, code) => {
  const normalized = text(value);
  if (!normalized) return '';
  if (!isUuid(normalized)) throw fail('The delivery assignment master record is invalid.', code);
  return normalized;
};

const activeAssignment = (delivery = {}) => (
  Array.isArray(delivery.assignments)
    ? delivery.assignments.find((item) => item && !item.unassignedAt && !item.deletedAt) || null
    : null
);

const assignmentMatches = (assignment, expected) => (
  assignment
  && text(assignment.driverId) === expected.driverId
  && text(assignment.vehicleId) === expected.vehicleId
  && text(assignment.teamId) === expected.teamId
);

const NEXT_TRANSITION = Object.freeze({
  ASSIGNED: 'LOAD',
  LOADING: 'DEPART',
  DEPARTED: 'DELIVER',
  DELIVERED: 'COMPLETE',
});

export const DELIVERY_LIFECYCLE_LABELS = Object.freeze({
  DRAFT: 'Chờ phân công',
  ASSIGNED: 'Đã phân công',
  LOADING: 'Đang chất hàng',
  DEPARTED: 'Đã xuất phát',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Đã hoàn tất',
  FAILED: 'Giao thất bại',
  CANCELLED: 'Đã hủy',
});

export async function loadVpsDeliveryMasters(api, session) {
  const companyId = requireCompany(session);
  if (
    typeof api?.listLogisticsDrivers !== 'function'
    || typeof api?.listLogisticsTeams !== 'function'
    || typeof api?.listLogisticsVehicles !== 'function'
  ) {
    throw fail('The VPS delivery master-data contract is unavailable.', 'VPS_DELIVERY_MASTERS_UNAVAILABLE');
  }
  const [driversPage, teamsPage, vehiclesPage] = await Promise.all([
    api.listLogisticsDrivers({ page: 1, limit: 200, status: 'ACTIVE', sortBy: 'name', sortOrder: 'asc' }),
    api.listLogisticsTeams({ page: 1, limit: 200, sortBy: 'name', sortOrder: 'asc' }),
    api.listLogisticsVehicles({ page: 1, limit: 200, sortBy: 'licensePlate', sortOrder: 'asc' }),
  ]);
  const tenantItems = (page) => (Array.isArray(page?.items) ? page.items : [])
    .filter((item) => text(item?.companyId) === companyId);
  return {
    drivers: tenantItems(driversPage).filter((item) => lifecycleStatus(item) !== 'INACTIVE'),
    teams: tenantItems(teamsPage),
    vehicles: tenantItems(vehiclesPage).filter((item) => lifecycleStatus(item) !== 'INACTIVE'),
  };
}

export async function assignVpsDelivery(api, session, report, assignment = {}) {
  const companyId = requireCompany(session);
  const deliveryId = requireNativeDeliveryId(report);
  if (typeof api?.getLogisticsDelivery !== 'function' || typeof api?.assignLogisticsDelivery !== 'function' || typeof api?.transitionLogisticsDelivery !== 'function') {
    throw fail('The VPS delivery lifecycle contract is unavailable.', 'VPS_DELIVERY_LIFECYCLE_UNAVAILABLE');
  }
  const driverId = safeOptionalUuid(assignment.driverId, 'VPS_DELIVERY_DRIVER_ID_INVALID');
  if (!driverId) {
    throw fail('Choose a current VPS driver before assigning a delivery.', 'VPS_DELIVERY_DRIVER_REQUIRED');
  }
  const expected = {
    driverId,
    vehicleId: safeOptionalUuid(assignment.vehicleId, 'VPS_DELIVERY_VEHICLE_ID_INVALID'),
    teamId: safeOptionalUuid(assignment.teamId, 'VPS_DELIVERY_TEAM_ID_INVALID'),
  };
  let delivery = requireSameTenant(await api.getLogisticsDelivery(deliveryId), companyId);
  const status = lifecycleStatus(delivery);
  if (status !== 'DRAFT' && status !== 'ASSIGNED') {
    throw fail('Reload the delivery before changing its assignment.', 'VPS_DELIVERY_ASSIGNMENT_STATE_INVALID');
  }
  if (status === 'DRAFT' && !assignmentMatches(activeAssignment(delivery), expected)) {
    delivery = requireSameTenant(await api.assignLogisticsDelivery(deliveryId, {
      ...expected,
      reason: text(assignment.reason),
    }), companyId);
    delivery = requireSameTenant(await api.getLogisticsDelivery(delivery.id), companyId);
  }
  if (lifecycleStatus(delivery) === 'DRAFT') {
    delivery = requireSameTenant(await api.transitionLogisticsDelivery(delivery.id, {
      transitionCode: 'ASSIGN',
      reason: text(assignment.reason) || 'Assigned through HD Manager.',
    }), companyId);
  }
  return normalizeVpsDeliveryReport(delivery);
}

export async function advanceVpsDelivery(api, session, report, { transitionCode, reason = '' } = {}) {
  const companyId = requireCompany(session);
  const deliveryId = requireNativeDeliveryId(report);
  if (typeof api?.getLogisticsDelivery !== 'function' || typeof api?.transitionLogisticsDelivery !== 'function') {
    throw fail('The VPS delivery lifecycle contract is unavailable.', 'VPS_DELIVERY_LIFECYCLE_UNAVAILABLE');
  }
  const requested = text(transitionCode).toUpperCase();
  let delivery = requireSameTenant(await api.getLogisticsDelivery(deliveryId), companyId);
  const expected = NEXT_TRANSITION[lifecycleStatus(delivery)];
  if (!expected || requested !== expected) {
    throw fail('The requested delivery transition is not allowed from its current status.', 'VPS_DELIVERY_TRANSITION_INVALID');
  }
  delivery = requireSameTenant(await api.transitionLogisticsDelivery(deliveryId, {
    transitionCode: requested,
    reason: text(reason),
  }), companyId);
  return normalizeVpsDeliveryReport(delivery);
}
