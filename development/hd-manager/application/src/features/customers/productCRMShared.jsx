// Shared original App CRM bindings. Declaration order and singleton identities are preserved.
// Factory/controller imports run only through the existing intent preloader.
import PreloadedWorkspace from "../../layout/PreloadedWorkspace.jsx";
import React from "react";
import { useCallback, useSyncExternalStore } from "react";
import { calculateLoyaltyPoints } from "../../../functions/loyaltyRewards.mjs";
import { createCustomerLedgerMapBuilder, createCustomerRecordSelector } from "../../utils/customerLedgerIndex.js";
import { createPreloadableModule } from "../../utils/preloadableModule.js";
import { Download, Copy, Send } from "lucide-react";
import { DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS, normalizeLoyaltyEligibilityConditions } from "../../utils/customerLoyaltyEligibility.js";
import { buildCustomerDirectionsUrl } from "../../utils/customerLocationDirections.js";
import { normalizePickedCustomerContact, pickWebCustomerContact } from "../../utils/customerContactPicker.js";
import { sortOrdersByNewest } from "../../utils/orderRecency.js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Share as CapacitorShare } from "@capacitor/share";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { createProjectionCache, sortProjection } from "../../services/cooperativeProjection.js";
import { searchProducts as searchProductRecords } from "../../services/searchEngine.js";
import { getProductPrimaryPricingUnit, normalizeProductPricingUnit, normalizeUnitPriceMap } from "../../services/productPricingUnits.js";
import { purchaseAmount } from "../../utils/productMeasures.js";
import { isCustomerProductUnitAllowed, resolveCustomerProductConfiguration, resolveTransactionBillingSnapshot } from "../../services/customerProductBilling.js";

const customerDirectorySummaryCache = createProjectionCache();

const EMPTY_CUSTOMER_SUMMARIES = Object.freeze([]);

const EMPTY_MAIN_LEDGER = Object.freeze({});

const getCapacitorPlugin = (name) => {
  const registryOwner = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!registryOwner) return registerPlugin(name);
  registryOwner.__HD_MANAGER_CAPACITOR_PLUGINS__ ||= {};
  if (!registryOwner.__HD_MANAGER_CAPACITOR_PLUGINS__[name]) {
    registryOwner.__HD_MANAGER_CAPACITOR_PLUGINS__[name] = registerPlugin(name);
  }
  return registryOwner.__HD_MANAGER_CAPACITOR_PLUGINS__[name];
};

const APP_SCREEN_BACK_EVENT = 'hd-manager-screen-back';

const markAppBackHandled = (event) => {
  if (event?.detail) event.detail.handled = true;
  event?.preventDefault?.();
};

const getLocalDateInputValue = (date = new Date()) => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayString = () => getLocalDateInputValue(new Date());

const LEGACY_POSITION_MAP = {
  'Kế toán nhân sự': 'Kế toán & nhân sự',
  'Kế toán': 'Kế toán & nhân sự',
  'Admin': 'Kế toán & nhân sự',
  'Bán hàng': 'Kinh doanh',
  'CTV kinh doanh': 'Cộng tác viên kinh doanh',
  'Cộng tác viên': 'Cộng tác viên kinh doanh'
};

const WAREHOUSE_EXPORT_POSITION = 'Xuất kho';

const SALES_COLLABORATOR_POSITION = 'Cộng tác viên kinh doanh';

const normalizeEmployeePosition = (position = '') => {
  const rawPosition = `${position || ''}`.trim();
  const normalizedLookup = normalizeLookupText(rawPosition);
  if (['chu doanh nghiep', 'chu cua hang', 'giam doc', 'quan ly doanh nghiep', 'owner', 'business owner'].includes(normalizedLookup)) return 'Chủ doanh nghiệp';
  if (['ke toan nhan su', 'ke toan va nhan su', 'ke toan nhan vien', 'ke toan', 'nhan su', 'hanh chinh nhan su', 'hr', 'admin'].includes(normalizedLookup)) return 'Kế toán & nhân sự';
  if (['can hang xuat kho', 'xuat kho', 'nhan vien kho', 'kho'].includes(normalizedLookup)) return WAREHOUSE_EXPORT_POSITION;
  if (['cong tac vien kinh doanh', 'ctv kinh doanh', 'cong tac vien ban hang', 'ctv ban hang'].includes(normalizedLookup)) return SALES_COLLABORATOR_POSITION;
  if (['ban hang', 'sales', 'nhan vien kinh doanh'].includes(normalizedLookup)) return 'Kinh doanh';
  if (['tai xe', 'lai xe', 'giao hang', 'shipper', 'driver'].includes(normalizedLookup)) return 'Tài xế';
  if (['san xuat', 'nhan vien san xuat', 'production'].includes(normalizedLookup)) return 'Sản xuất';
  return LEGACY_POSITION_MAP[rawPosition] || rawPosition;
};

const isOwnerPosition = (position = '') => normalizeEmployeePosition(position) === 'Chủ doanh nghiệp';

const isOwnerRoleValue = (value = '') => {
  const normalized = normalizeLookupText(value || '');
  const compact = normalized.replace(/\s+/g, '');
  if (!normalized) return false;
  return normalized === 'super admin'
    || normalizeEmployeePosition(value) === 'Chủ doanh nghiệp'
    || ['superadmin', 'owner', 'companyowner', 'businessowner', 'owneraccount', 'accountowner'].includes(compact)
    || ['business owner', 'company owner', 'owner account', 'account owner', 'chu doanh nghiep', 'chu cong ty', 'chu cua hang', 'giam doc', 'quan ly doanh nghiep'].includes(normalized);
};

const isOwnerAccountUser = (employee = null, currentUser = null) => (
  currentUser?.role === 'super_admin'
  || employee?.role === 'super_admin'
  || currentUser?.isOwner === true
  || currentUser?.isCompanyOwner === true
  || employee?.isOwner === true
  || employee?.isCompanyOwner === true
  || isOwnerRoleValue(currentUser?.role)
  || isOwnerRoleValue(currentUser?.position)
  || isOwnerRoleValue(currentUser?.userRole)
  || isOwnerRoleValue(currentUser?.accountRole)
  || isOwnerRoleValue(employee?.role)
  || isOwnerPosition(employee?.position)
);

const isSalesPosition = (position = '') => ['Kinh doanh', SALES_COLLABORATOR_POSITION].includes(normalizeEmployeePosition(position));

const isDeliveryParticipantPosition = (position = '') => ['Tài xế', 'Sản xuất'].includes(normalizeEmployeePosition(position));

const getDeliveryAssignmentIds = (source = {}) => Array.from(new Set([
  source.assignedDriverId,
  source.driverId,
  source.deliveryDriverId,
  source.driverEmployeeId,
  source.assignedEmployeeId,
  source.employeeId,
  source.managerId,
  source.responsibleEmployeeId,
  ...(Array.isArray(source.assignedDriverIds) ? source.assignedDriverIds : []),
  ...(Array.isArray(source.driverIds) ? source.driverIds : []),
  ...(Array.isArray(source.assignedEmployeeIds) ? source.assignedEmployeeIds : [])
].map(value => `${value || ''}`.trim()).filter(Boolean)));

const parseEmployeeRoleSalaryAmount = (value) => {
  return parseLooseMoneyValue(value);
};

const normalizeEmployeePositionList = (positions = []) => Array.from(new Set(
  (Array.isArray(positions) ? positions : [])
    .map(normalizeEmployeePosition)
    .filter(Boolean)
));

const normalizeEmployeeRoleSalaryComponents = (components = [], { keepEmpty = false } = {}) => (
  (Array.isArray(components) ? components : [])
    .map((row, index) => {
      const position = normalizeEmployeePosition(row?.position || row?.department || row?.role || '');
      const amount = parseEmployeeRoleSalaryAmount(row?.amount ?? row?.salary ?? row?.monthlySalary ?? 0);
      return {
        id: `${row?.id || position || `role_${index}`}`,
        position,
        amount,
        note: `${row?.note || ''}`.trim()
      };
    })
    .filter(row => row.position && (keepEmpty || row.amount > 0 || row.note))
);

const getEmployeePositionValues = (employee = {}) => normalizeEmployeePositionList([
  employee?.position,
  employee?.primaryPosition,
  ...(Array.isArray(employee?.secondaryPositions) ? employee.secondaryPositions : []),
  ...(Array.isArray(employee?.additionalPositions) ? employee.additionalPositions : []),
  ...(Array.isArray(employee?.departments) ? employee.departments : []),
  ...normalizeEmployeeRoleSalaryComponents(employee?.roleSalaryComponents, { keepEmpty: true }).map(row => row.position)
]);

const employeeHasPosition = (employee = {}, predicateOrPosition) => {
  const positions = getEmployeePositionValues(employee);
  if (typeof predicateOrPosition === 'function') return positions.some(position => predicateOrPosition(position));
  const normalized = normalizeEmployeePosition(predicateOrPosition);
  return positions.includes(normalized);
};

const isEmployeeSalesPosition = (employee = {}) => employeeHasPosition(employee, isSalesPosition);

const isEmployeeDeliveryParticipant = (employee = {}) => employeeHasPosition(employee, isDeliveryParticipantPosition);

const getSalesLeaderId = (employee = {}) => `${employee?.salesLeaderId || employee?.salesManagerId || employee?.parentSalesEmpId || employee?.managerEmpId || ''}`.trim();

const getSalesDownlineEmployeeIds = (leaderId = '', employees = []) => {
  const leaderKey = `${leaderId || ''}`.trim();
  if (!leaderKey) return [];
  const collected = new Set();
  const collect = (currentLeaderId) => {
    (employees || []).forEach((employee) => {
      if (!employee?.id || employee.id === leaderKey || employee.isArchived || collected.has(employee.id) || !isEmployeeSalesPosition(employee)) return;
      if (getSalesLeaderId(employee) !== currentLeaderId) return;
      collected.add(employee.id);
      collect(employee.id);
    });
  };
  collect(leaderKey);
  return Array.from(collected);
};

const ContactPicker = getCapacitorPlugin('ContactPicker');

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const capitalizeFirstPreservingSpacing = (str = '') => {
  const rawValue = `${str}`;
  const firstVisibleCharIndex = rawValue.search(/\S/);
  if (firstVisibleCharIndex < 0) return rawValue;
  return `${rawValue.slice(0, firstVisibleCharIndex)}${rawValue.charAt(firstVisibleCharIndex).toUpperCase()}${rawValue.slice(firstVisibleCharIndex + 1)}`;
};

const toTitleCasePreservingSpacing = (str = '') => `${str || ''}`.replace(/[^\s]+/g, word => (
  `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
));

const viNumberFormatter = new Intl.NumberFormat('vi-VN');

const formatInputCurrency = (val) => {
  if (val === '' || val === undefined || val === null) return '';
  const num = parseInt(val.toString().replace(/\D/g, ''), 10);
  return isNaN(num) ? '' : viNumberFormatter.format(num);
};

const parseInputCurrency = (val) => {
  if (val === '' || val === undefined || val === null) return '';
  const num = parseInt(val.toString().replace(/\D/g, ''), 10);
  return isNaN(num) ? '' : num;
};

const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '0';
  return viNumberFormatter.format(Math.round(Number(amount) || 0));
};

const roundMoneyValue = (amount) => {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return 0;
  return Math.round(Number(amount) || 0);
};

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '0';
  return viNumberFormatter.format(value);
};

const isDateOnlyString = (value = '') => /^\d{4}-\d{2}-\d{2}$/.test(`${value || ''}`.trim());

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const VIETNAM_DATE_FORMAT_OPTIONS = { timeZone: VIETNAM_TIME_ZONE };

const VIETNAM_TIME_FORMAT_OPTIONS = { hour: '2-digit', minute: '2-digit', timeZone: VIETNAM_TIME_ZONE };

const vietnamDateFormatter = new Intl.DateTimeFormat('vi-VN', VIETNAM_DATE_FORMAT_OPTIONS);

const vietnamTimeFormatter = new Intl.DateTimeFormat('vi-VN', VIETNAM_TIME_FORMAT_OPTIONS);

const formatDateLabel = (value) => {
  if (!value) return '--';
  if (typeof value === 'string' && isDateOnlyString(value)) return formatCompactDateLabel(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? `${value}` : vietnamDateFormatter.format(parsed);
};

const formatCompactDateLabel = (value) => {
  if (!value) return '--';
  const text = `${value}`.trim();
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
  }
  return formatDateLabel(value);
};

const formatDateTimeLabel = (value) => {
  if (!value) return '--';
  if (typeof value === 'string' && isDateOnlyString(value)) return formatCompactDateLabel(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? `${value}`
    : `${vietnamDateFormatter.format(parsed)} ${vietnamTimeFormatter.format(parsed)}`;
};

const formatOrderCode = (orderId = '') => `HD${String(orderId || '').slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

const getLedgerOrderDisplayCode = (order = {}) => (
  order?.isOpeningDebt
    ? 'Nợ cũ'
    : (order?.orderCode || order?.code || formatOrderCode(order?.id))
);

const escapeHtml = (value = '') => `${value}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const DEFAULT_INVOICE_TRANSFER_PROFILE = {
  bankId: 'BIDV',
  bankName: 'BIDV',
  accountName: 'HOANG VAN DUC',
  accountNumber: 'SBH092599933',
  template: 'qr_only'
};

const copyTextToClipboard = async (text = '') => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    // Fall through to the legacy clipboard path below.
  }

  if (typeof document === 'undefined') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch (error) {
    return false;
  }
};

const downloadContentFile = (filename, content, mimeType = 'text/plain;charset=utf-8') => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
  return true;
};

const saveContentFile = async (filename, content, mimeType = 'text/plain;charset=utf-8') => {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      const path = `HDManager/${filename}`;
      await Filesystem.writeFile({
        path,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true
      });
      const fileUri = await Filesystem.getUri({
        path,
        directory: Directory.Documents
      });
      return { status: 'saved', path, uri: fileUri?.uri || '' };
    } catch (error) {
      // Fall back to browser download below when native write is unavailable.
    }
  }

  const downloaded = downloadContentFile(filename, content, mimeType);
  return { status: downloaded ? 'downloaded' : 'unsupported', path: filename };
};

const isShareCancelled = (error) => error?.name === 'AbortError'
  || /cancel|abort|đã hủy/i.test(`${error?.message || ''}`);

const shareTextContent = async ({ title = '', text = '', dialogTitle = '' }) => {
  try {
    const capability = await CapacitorShare.canShare().catch(() => ({ value: false }));
    if (capability?.value) {
      await CapacitorShare.share({ title, text, dialogTitle: dialogTitle || title });
      return { status: 'shared' };
    }
  } catch (error) {
    if (isShareCancelled(error)) {
      return { status: 'cancelled' };
    }
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return { status: 'shared' };
    }
  } catch (error) {
    if (isShareCancelled(error)) {
      return { status: 'cancelled' };
    }
  }

  const copied = await copyTextToClipboard(text);
  return { status: copied ? 'copied' : 'unsupported' };
};

const getErrorText = (error) => `${error?.code || ''} ${error?.message || error || ''}`;

const isFirestoreInternalAssertionError = (error) => {
  const normalized = getErrorText(error).toLowerCase();
  return normalized.includes('internal assertion failed')
    || normalized.includes('unexpected state')
    || normalized.includes('firebase_firestore.js');
};

const isTimeoutLikeError = (error) => {
  if (error?.code === 'HD_TIMEOUT') return true;
  if (isFirestoreInternalAssertionError(error)) return true;
  const normalized = getErrorText(error)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
  return normalized.includes('qua thoi gian')
    || normalized.includes('timeout')
    || normalized.includes('timed out')
    || normalized.includes('deadline')
    || normalized.includes('network')
    || (normalized.includes('luu') && normalized.includes('don') && normalized.includes('khoa thao tac'));
};

const isFirebaseQuotaError = (error) => {
  const normalized = getErrorText(error)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
  return normalized.includes('429')
    || normalized.includes('quota exceeded')
    || normalized.includes('resource_exhausted')
    || normalized.includes('too many requests');
};

const isFirebasePermissionError = (error) => {
  const normalized = getErrorText(error).toLowerCase();
  return normalized.includes('permission-denied')
    || normalized.includes('permission_denied')
    || normalized.includes('missing or insufficient permissions')
    || normalized.includes('403')
    || normalized.includes('unauthenticated')
    || normalized.includes('401');
};

const getFriendlyFirebaseErrorMessage = (error, fallback = 'Thao tác chưa hoàn tất, vui lòng thử lại.') => {
  const rawMessage = `${error?.message || error || ''}`.trim();
  if (isFirestoreInternalAssertionError(error)) {
    return 'App đã ghi nhận thao tác và đang đồng bộ nền. Bạn không cần bấm gửi nhiều lần.';
  }
  if (isFirebaseQuotaError(error)) {
    return 'Firebase đang quá tải/hết hạn mức tạm thời. App đã giữ lệnh lại và sẽ tự đồng bộ khi hệ thống ổn định.';
  }
  if (isFirebasePermissionError(error)) {
    return 'Phiên kết nối dữ liệu chưa được Firebase xác nhận. Vui lòng tải lại app rồi thử thu lại; nếu vẫn còn lỗi, hãy đăng xuất và đăng nhập lại một lần.';
  }
  if (isTimeoutLikeError(error)) {
    return 'Kết nối Firebase phản hồi chậm. App đã ghi nhận thao tác và sẽ tự đồng bộ lại.';
  }
  if (
    rawMessage.includes('__PRIVATE_')
    || rawMessage.includes('firebase_firestore')
    || rawMessage.length > 320
  ) {
    return fallback;
  }
  return rawMessage || fallback;
};

const getShareChannelLabel = (channel = 'native') => {
  if (channel === 'zalo') return 'Zalo';
  if (channel === 'facebook') return 'Facebook';
  if (channel === 'messenger') return 'Messenger';
    return 'web';
};

const LOOKUP_NORMALIZATION_CACHE_LIMIT = 2048;

const LOOKUP_NORMALIZATION_MAX_LENGTH = 256;

const lookupNormalizationCache = new Map();

const normalizeLookupText = (value = '') => {
  const cacheable = typeof value === 'string' && value.length <= LOOKUP_NORMALIZATION_MAX_LENGTH;
  if (cacheable) {
    const cached = lookupNormalizationCache.get(value);
    if (cached !== undefined) return cached;
  }
  const normalized = `${value}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (cacheable) {
    // FIFO hits keep insertion order; only primitive short strings are retained.
    if (lookupNormalizationCache.size >= LOOKUP_NORMALIZATION_CACHE_LIMIT) {
      lookupNormalizationCache.delete(lookupNormalizationCache.keys().next().value);
    }
    lookupNormalizationCache.set(value, normalized);
  }
  return normalized;
};

const collapseLookupText = (value = '') => normalizeLookupText(value).replace(/\s+/g, '');

const tokenizeLookupText = (value = '') => normalizeLookupText(value).split(' ').filter(Boolean);

const buildLookupInitials = (value = '') => tokenizeLookupText(value).map(token => token.charAt(0)).join('');

const normalizeCustomerPhone = (value = '') => `${value}`.replace(/\D/g, '');

const buildCustomerPhoneDuplicateKey = (value = '') => normalizeCustomerPhone(value);

const getProductShortName = (product = {}) => {
  const rawShortName = `${product?.shortName
    || product?.productShortName
    || product?.abbreviation
    || product?.alias
    || product?.code
    || ''}`.trim();
  return rawShortName ? rawShortName.toUpperCase() : '';
};

const getProductAttributes = (product = {}) => {
  const rawAttributes = product?.attributes
    ?? product?.productAttributes
    ?? product?.variants
    ?? product?.attributeOptions
    ?? product?.attributeText
    ?? '';

  const normalizeAttributeItem = (item) => {
    if (typeof item === 'string' || typeof item === 'number') return `${item}`.trim();
    if (item && typeof item === 'object') {
      return `${item.label || item.name || item.value || item.title || ''}`.trim();
    }
    return '';
  };

  const values = Array.isArray(rawAttributes)
    ? rawAttributes.map(normalizeAttributeItem)
    : `${rawAttributes || ''}`.split(/[\n;,|]+/g).map((item) => `${item}`.trim());

  return [...new Set(values.filter(Boolean))];
};

const getProductSearchValues = (product = {}) => {
  const productName = `${product?.name || product?.productName || ''}`.trim();
  const categoryName = `${product?.category || product?.mainGroup || ''}`.trim();
  const values = [
    productName,
    product?.productName,
    getProductShortName(product),
    buildLookupInitials(productName),
    categoryName,
    buildLookupInitials(categoryName),
    product?.unit,
    product?.barcode,
    getProductAttributes(product).join(' ')
  ];

  return [...new Set(values.flatMap(value => {
    const normalized = normalizeLookupText(value || '');
    const collapsed = collapseLookupText(value || '');
    return [normalized, collapsed];
  }).filter(Boolean))];
};

const productMatchesLookup = (product = {}, keyword = '') => {
  return searchProductRecords([product], keyword).length > 0;
};

const findProductForLineItem = (item = {}, products = []) => {
  const activeProducts = (products || []).filter(product => !product?.isArchived);
  if (item?.productId) {
    const byId = activeProducts.find(product => product.id === item.productId);
    if (byId) return byId;
  }

  const labels = [
    item?.description,
    item?.productName,
    item?.productNameSnapshot,
    item?.name,
    item?.productShortName,
    item?.shortName,
    item?.productCode,
    item?.code,
    item?.sku,
    item?.barcode
  ].filter(Boolean);

  const exactLabels = labels.flatMap(label => [normalizeLookupText(label), collapseLookupText(label)]).filter(Boolean);
  const exactMatch = activeProducts.find(product => {
    const productValues = getProductSearchValues(product);
    return exactLabels.some(label => productValues.includes(label));
  });
  if (exactMatch) return exactMatch;

  return activeProducts.find(product => labels.some(label => productMatchesLookup(product, label))) || null;
};

const buildLineItemProductSearchText = (item = {}, products = [], resolvedProduct = undefined) => {
  const product = resolvedProduct === undefined ? findProductForLineItem(item, products) : resolvedProduct;
  const productName = `${product?.name || product?.productName || item?.description || item?.productName || item?.productNameSnapshot || ''}`.trim();
  const rawValues = [
    item?.description,
    item?.productName,
    item?.productNameSnapshot,
    item?.name,
    item?.productShortName,
    item?.shortName,
    item?.productCode,
    item?.code,
    item?.sku,
    item?.barcode,
    productName,
    getProductShortName(product || {}),
    buildLookupInitials(productName),
    product?.category,
    product?.mainGroup,
    product?.unit,
    product?.barcode,
    getProductAttributes(product || {}).join(' ')
  ];
  return [...new Set([
    ...rawValues.filter(Boolean),
    ...(product ? getProductSearchValues(product) : [])
  ])].join(' ');
};

const CUSTOMER_IMPORT_HEADER_ALIASES = {
  name: ['ten khach hang', 'khach hang', 'ten kh', 'ten cong ty', 'ten khach'],
  phone: ['so dien thoai', 'dien thoai', 'sdt', 'so dt', 'phone'],
  address: ['dia chi', 'dia chi giao hang', 'dia chi khach'],
  fixedProducts: ['san pham co dinh', 'sp co dinh', 'san pham khach lay', 'san pham thuong lay', 'mat hang co dinh', 'hang co dinh']
};

const buildCustomerImportDuplicateKey = ({ name = '', phone = '', address = '' } = {}) => [
  buildCustomerPhoneDuplicateKey(phone) || collapseLookupText(name) || collapseLookupText(address)
].join('__');

const parseCustomerImportCsvRows = (text = '') => {
  const rows = [];
  let currentCell = '';
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === ',' || char === ';' || char === '\t')) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') index += 1;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => `${cell || ''}`.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
};

const parseCustomerImportWorkbook = async (file) => {
  if (!file) {
    throw new Error('Vui lòng chọn file khách hàng.');
  }

  const fileName = `${file.name || ''}`.toLowerCase();
  const isCsvFile = fileName.endsWith('.csv');
  const isExcelFile = fileName.endsWith('.xlsx');

  if (!isCsvFile && !isExcelFile) {
    throw new Error('File chưa được hỗ trợ an toàn. Vui lòng dùng .xlsx hoặc .csv.');
  }

  let rawRows = [];
  if (isCsvFile) {
    rawRows = parseCustomerImportCsvRows(await file.text());
  } else {
    try {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      rawRows = await readXlsxFile(file);
    } catch (error) {
      throw new Error(`Không đọc được file .xlsx: ${error?.message || 'vui lòng kiểm tra lại file.'}`);
    }
  }

  const firstNonEmptyRowIndex = rawRows.findIndex((row) => Array.isArray(row) && row.some((cell) => `${cell || ''}`.trim() !== ''));
  if (firstNonEmptyRowIndex < 0) {
    throw new Error('File đang trống, chưa có dữ liệu khách hàng.');
  }

  const headerRow = rawRows[firstNonEmptyRowIndex].map((cell) => normalizeLookupText(cell));
  const headerIndexMap = Object.fromEntries(
    Object.entries(CUSTOMER_IMPORT_HEADER_ALIASES).map(([field, aliases]) => [
      field,
      headerRow.findIndex((header) => aliases.includes(header))
    ])
  );
  const requiredImportFields = ['name', 'phone', 'address'];
  const missingHeaders = requiredImportFields
    .map(field => [field, headerIndexMap[field]])
    .filter(([, index]) => index < 0)
    .map(([field]) => field);

  if (missingHeaders.length > 0) {
    const headerLabels = {
      name: 'Tên Khách hàng',
      phone: 'Số điện thoại',
      address: 'Địa chỉ',
      fixedProducts: 'Sản phẩm cố định'
    };
    throw new Error(`Thiếu cột bắt buộc: ${missingHeaders.map((field) => headerLabels[field]).join(', ')}.`);
  }

  const records = [];
  const skippedRows = [];
  rawRows.slice(firstNonEmptyRowIndex + 1).forEach((row, offset) => {
    const lineNumber = firstNonEmptyRowIndex + offset + 2;
    const name = toTitleCase(`${row[headerIndexMap.name] || ''}`.trim());
    const phone = `${row[headerIndexMap.phone] || ''}`.trim();
    const address = capitalizeFirst(`${row[headerIndexMap.address] || ''}`.trim());
    const fixedProductText = headerIndexMap.fixedProducts >= 0 ? `${row[headerIndexMap.fixedProducts] || ''}`.trim() : '';
    const isBlankRow = !name && !phone && !address && !fixedProductText;

    if (isBlankRow) return;

    const missingFields = [];
    if (!name) missingFields.push('Tên Khách hàng');
    if (!phone) missingFields.push('Số điện thoại');
    if (!address) missingFields.push('Địa chỉ');

    if (missingFields.length > 0) {
      skippedRows.push({
        lineNumber,
        reason: `Thiếu ${missingFields.join(', ')}`
      });
      return;
    }

    records.push({ lineNumber, name, phone, address, fixedProductText });
  });

  return {
    records,
    skippedRows,
    totalDataRows: Math.max(0, rawRows.length - firstNonEmptyRowIndex - 1)
  };
};

const splitCustomerImportFixedProductNames = (value = '') => `${value || ''}`
  .split(/[\n;,|]+/g)
  .map(item => item.trim())
  .filter(Boolean);

const findCustomerImportProductMatch = (productName = '', products = []) => {
  const normalizedName = normalizeLookupText(productName);
  const collapsedName = collapseLookupText(productName);
  if (!normalizedName) return null;

  const activeProducts = (products || []).filter(product => !product?.isArchived);
  const exactMatch = activeProducts.find(product => {
    const productLabels = getProductSearchValues(product);
    return productLabels.some(label => label === normalizedName || label === collapsedName);
  });
  if (exactMatch) return exactMatch;

  const containsMatches = activeProducts.filter(product => {
    const productLabels = getProductSearchValues(product);
    return productLabels.some(normalizedProductName => {
      const collapsedProductName = collapseLookupText(normalizedProductName || '');
      return (
        normalizedProductName && (normalizedProductName.includes(normalizedName) || normalizedName.includes(normalizedProductName))
      ) || (
        collapsedProductName && (collapsedProductName.includes(collapsedName) || collapsedName.includes(collapsedProductName))
      );
    });
  });

  return containsMatches.length === 1 ? containsMatches[0] : null;
};

const resolveCustomerImportFixedProducts = (value = '', products = []) => {
  const productNames = splitCustomerImportFixedProductNames(value);
  const matchedIds = [];
  const unmatchedNames = [];

  productNames.forEach((productName) => {
    const matchedProduct = findCustomerImportProductMatch(productName, products);
    if (matchedProduct?.id) {
      if (!matchedIds.includes(matchedProduct.id)) matchedIds.push(matchedProduct.id);
      return;
    }
    unmatchedNames.push(productName);
  });

  return { productNames, productIds: matchedIds, unmatchedNames };
};

const pickCustomerContactFromDevice = async () => {
  if (Capacitor.getPlatform() !== 'android') {
    return pickWebCustomerContact();
  }

  try {
    const result = await ContactPicker.pickContact();
    if (!result) return { ok: false, supported: true, cancelled: true, message: 'Bạn chưa chọn liên hệ nào.' };
    return { ...result, ...normalizePickedCustomerContact(result) };
  } catch (error) {
    return {
      ok: false,
      supported: true,
      message: getFriendlyFirebaseErrorMessage(error, 'Không thể lấy dữ liệu từ danh bạ điện thoại.')
    };
  }
};

const parseLooseQuantityValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const matched = `${value}`.replace(/\s+/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return matched ? Math.max(0, parseFloat(matched[0]) || 0) : 0;
};

const parseLooseMoneyValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const digits = `${value}`.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
};

const getOrderLineUnitPriceValue = (item = {}) => parseLooseMoneyValue(
  item?.unitPrice
  ?? item?.price
  ?? item?.sellingPrice
  ?? item?.salePrice
  ?? item?.finalPrice
  ?? item?.unitPriceVnd
  ?? item?.unit_price_vnd
  ?? item?.unit_price
);

const getOrderLineQuantityValue = (item = {}) => parseLooseQuantityValue(
  item?.quantity
  ?? item?.quantityValue
  ?? item?.quantityCount
  ?? item?.qty
  ?? item?.count
  ?? item?.pieceCount
);

const getOrderLineWeightKgValue = (item = {}) => parseLooseQuantityValue(
  item?.weightKg
  ?? item?.totalKg
  ?? item?.kg
  ?? item?.weight
  ?? (['kg', 'ky', 'ki', 'kilo'].includes(normalizeLookupText(item?.quantityUnit || item?.unit || '')) ? item?.quantity : 0)
);

const getTransactionBillingPresentation = (item = {}) => {
  const snapshot = resolveTransactionBillingSnapshot({ record: item });
  const legacyWeightKg = getOrderLineWeightKgValue(item);
  const actualQuantity = snapshot.actualQuantity || getOrderLineQuantityValue(item) || legacyWeightKg;
  const actualUnit = snapshot.actualUnit
    || `${item.quantityUnit || item.unit || (legacyWeightKg > 0 ? 'Kg' : '')}`.trim();
  const billingQuantity = snapshot.billingQuantity || actualQuantity;
  const billingUnit = snapshot.billingUnit || actualUnit;
  const unitPrice = snapshot.unitPrice || getOrderLineUnitPriceValue(item);
  const storedAmount = parseLooseMoneyValue(
    item.amount ?? item.pricingAmount ?? item.lineTotal ?? item.totalAmount ?? item.total ?? item.subtotal
  );
  const hasFrozenPricing = Boolean(snapshot.hasFrozenPricing || item.billingSnapshotVersion || item.billingSnapshotSource);
  const amount = hasFrozenPricing
    ? snapshot.amount
    : (storedAmount || Math.round(billingQuantity * unitPrice));

  return {
    actualQuantity,
    actualUnit,
    actualWeightKg: snapshot.actualWeightKg || legacyWeightKg,
    billingQuantity,
    billingUnit,
    unitPrice,
    amount,
    hasFrozenPricing,
  };
};

const normalizeReturnGoodsStatus = (record = {}) => {
  if (record.status) return record.status;
  if (record.discountedSale) return 'discounted_sale';
  if (record.isRetrievedToWarehouse || record.retrievedToWarehouse) return 'retrieved';
  return 'pending_pickup';
};

const getOrderReturnGoodsRecords = (order = {}) => {
  const records = Array.isArray(order?.returnGoods)
    ? order.returnGoods
    : (Array.isArray(order?.returnedGoods) ? order.returnedGoods : []);
  return records.filter(record => record && record.isArchived !== true);
};

const summarizeOrderReturnGoods = (order = {}) => getOrderReturnGoodsRecords(order).reduce((acc, record) => {
  const pieces = parseLooseQuantityValue(record.pieces ?? record.quantity ?? record.returnPieces ?? 0);
  const weightKg = parseLooseQuantityValue(record.weightKg ?? record.returnWeightKg ?? 0);
  const discountAmount = parseLooseMoneyValue(record.discountAmount ?? record.discount ?? 0);
  const status = normalizeReturnGoodsStatus(record);

  acc.count += 1;
  acc.pieces += pieces;
  acc.weightKg += weightKg;
  acc.discountAmount += discountAmount;
  if (status === 'pending_pickup') {
    acc.pendingCount += 1;
    acc.pendingPieces += pieces;
    acc.pendingWeightKg += weightKg;
  }
  if (status === 'retrieved') {
    acc.retrievedCount += 1;
    acc.retrievedPieces += pieces;
    acc.retrievedWeightKg += weightKg;
  }
  if (status === 'discounted_sale') acc.discountedCount += 1;
  return acc;
}, {
  count: 0,
  pieces: 0,
  weightKg: 0,
  discountAmount: 0,
  pendingCount: 0,
  pendingPieces: 0,
  pendingWeightKg: 0,
  retrievedCount: 0,
  retrievedPieces: 0,
  retrievedWeightKg: 0,
  discountedCount: 0
});

const formatReturnGoodsQty = (summary = {}) => {
  const pieces = parseLooseQuantityValue(summary.pieces ?? summary.quantity ?? summary.returnPieces ?? 0);
  const weightKg = parseLooseQuantityValue(summary.weightKg ?? summary.returnWeightKg ?? 0);
  const parts = [];
  if (pieces > 0) parts.push(`${formatNumber(pieces)} con`);
  if (weightKg > 0) parts.push(`${formatNumber(weightKg)} kg`);
  return parts.join(' • ') || 'Chưa rõ số lượng';
};

const getOrderReturnProductSummary = (order = {}) => (Array.isArray(order.items) ? order.items : [])
  .map(item => item.description || item.productName || item.name)
  .filter(Boolean)
  .join(', ');

const normalizeCustomerHonorific = (value = '') => {
  const normalized = normalizeLookupText(value || '').replace(/\s+/g, '');
  if (['a', 'anh', 'ong', 'chu', 'bacnam'].includes(normalized)) return 'anh';
  if (['c', 'chi', 'co', 'bacnu'].includes(normalized)) return 'chi';
  return '';
};

const CUSTOMER_HONORIFIC_OPTIONS = [
  { value: '', label: '--' },
  { value: 'anh', label: 'Anh' },
  { value: 'chi', label: 'Chị' }
];

const inferCustomerHonorificFromName = (name = '') => {
  const firstToken = normalizeLookupText(`${name || ''}`.trim().split(/\s+/)[0] || '').replace(/[.:,-]/g, '');
  return normalizeCustomerHonorific(firstToken);
};

const stripCustomerHonorificPrefix = (name = '') => {
  const text = `${name || ''}`.trim();
  if (!text) return '';
  const parts = text.split(/\s+/);
  const firstToken = normalizeLookupText(parts[0] || '').replace(/[.:,-]/g, '');
  return normalizeCustomerHonorific(firstToken) ? parts.slice(1).join(' ') : text;
};

const formatCustomerNameDraft = (name = '') => toTitleCasePreservingSpacing(`${name || ''}`);

const getCustomerHonorific = (customer = {}) => (
  normalizeCustomerHonorific(customer?.customerHonorific || customer?.honorific)
  || inferCustomerHonorificFromName(customer?.name || customer?.customerName || '')
);

const getCustomerPlainName = (customer = {}) => {
  const rawName = `${customer?.plainName || customer?.customerName || customer?.name || ''}`.trim();
  return toTitleCase(stripCustomerHonorificPrefix(rawName)).trim();
};

const getCustomerDisplayName = (customer = {}) => {
  const plainName = getCustomerPlainName(customer);
  const honorific = getCustomerHonorific(customer);
  if (!plainName) return '';
  if (honorific === 'anh') return `Anh ${plainName}`;
  if (honorific === 'chi') return `Chị ${plainName}`;
  return plainName;
};

const buildCustomerNameAliases = (customer = {}) => {
  const rawName = `${customer?.name || customer?.customerName || customer?.fullName || ''}`.trim();
  const plainName = getCustomerPlainName(customer);
  const displayName = getCustomerDisplayName(customer);
  return [...new Set([rawName, plainName, displayName].filter(Boolean))];
};

const formatCustomerLocationForDisplay = (location = null) => {
  if (!location) return '';
  if (typeof location === 'string') return location;
  const lat = location.lat ?? location.latitude;
  const lng = location.lng ?? location.longitude;
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
  return location.url || location.address || '';
};

const buildCustomerMapsUrlFromLocation = (location = null, fallbackAddress = '') => {
  if (!location && !fallbackAddress) return '';
  if (typeof location === 'string') {
    const text = location.trim();
    if (/^https?:\/\//i.test(text)) return text;
    if (text) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
  }
  const lat = location?.lat ?? location?.latitude;
  const lng = location?.lng ?? location?.longitude;
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`;
  }
  if (location?.url) return location.url;
  const address = location?.address || fallbackAddress;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
};

const parseCustomerLocationInput = (input = '') => {
  const raw = `${input || ''}`.trim();
  if (!raw) return null;
  const decoded = (() => {
    try { return decodeURIComponent(raw); } catch (error) { return raw; }
  })();
  const candidates = [
    decoded.match(/@(-?\d+(?:[\.,]\d+)?)\s*,\s*(-?\d+(?:[\.,]\d+)?)/),
    decoded.match(/[?&](?:q|query)=(-?\d+(?:[\.,]\d+)?)\s*,\s*(-?\d+(?:[\.,]\d+)?)/),
    decoded.match(/(-?\d{1,3}(?:[\.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[\.,]\d+)?)/)
  ].filter(Boolean);

  for (const match of candidates) {
    const lat = Number(`${match[1]}`.replace(',', '.'));
    const lng = Number(`${match[2]}`.replace(',', '.'));
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return {
        type: 'gps',
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      };
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    return { type: 'maps_url', url: raw };
  }

  return { type: 'address', address: raw, url: buildCustomerMapsUrlFromLocation(raw) };
};

const buildCustomerLocationFromPosition = (position = null) => {
  const lat = position?.coords?.latitude;
  const lng = position?.coords?.longitude;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return {
    type: 'gps',
    lat: Number(Number(lat).toFixed(6)),
    lng: Number(Number(lng).toFixed(6)),
    accuracy: Number.isFinite(Number(position?.coords?.accuracy)) ? Math.round(Number(position.coords.accuracy)) : null,
    url: `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`
  };
};

const normalizeCustomerLocationFields = (rawLocation = null, fallbackAddress = '', source = 'manual') => {
  const address = `${fallbackAddress || ''}`.trim();
  const parsedLocation = rawLocation && typeof rawLocation === 'object'
    ? rawLocation
    : parseCustomerLocationInput(rawLocation || '');

  if (!parsedLocation) {
    return {
      location: null,
      locationUrl: address ? buildCustomerMapsUrlFromLocation(null, address) : '',
      locationInput: address,
      locationLat: null,
      locationLng: null,
      mapLocation: null,
      locationUpdatedAt: new Date().toISOString(),
      locationSource: source
    };
  }

  const rawLat = parsedLocation.lat ?? parsedLocation.latitude;
  const rawLng = parsedLocation.lng ?? parsedLocation.longitude;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const normalizedLocation = hasGps
    ? {
        ...parsedLocation,
        type: parsedLocation.type || 'gps',
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        address: parsedLocation.address || address,
        url: parsedLocation.url || buildCustomerMapsUrlFromLocation({ lat, lng }, address)
      }
    : {
        ...parsedLocation,
        address: parsedLocation.address || address,
        url: parsedLocation.url || buildCustomerMapsUrlFromLocation(parsedLocation, address)
      };
  const locationUrl = buildCustomerMapsUrlFromLocation(normalizedLocation, address);
  const locationInput = locationUrl || normalizedLocation.address || address;
  const mapLocation = hasGps
    ? {
        lat: normalizedLocation.lat,
        lng: normalizedLocation.lng,
        latitude: normalizedLocation.latitude,
        longitude: normalizedLocation.longitude
      }
    : null;

  return {
    location: normalizedLocation,
    locationUrl,
    locationInput,
    locationLat: hasGps ? normalizedLocation.lat : null,
    locationLng: hasGps ? normalizedLocation.lng : null,
    mapLocation,
    locationUpdatedAt: new Date().toISOString(),
    locationSource: source
  };
};

const getCustomerLocationDisplayText = (customer = {}) => (
  formatCustomerLocationForDisplay(customer?.location)
  || customer?.locationUrl
  || customer?.address
  || ''
);

const getCustomerLocationShareText = (customer = {}) => (
  buildCustomerMapsUrlFromLocation(customer?.location, customer?.address)
  || customer?.locationUrl
  || customer?.address
  || ''
);

const hasCustomerOrderConfigurationValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(`${value || ''}`.trim());
};

const normalizeCustomerPriceOverrides = (source = {}) => {
  const rawOverrides = source?.priceOverrides || source?.customPrices || {};
  const entries = Array.isArray(rawOverrides)
    ? rawOverrides.map(item => [item.productId || item.id, item])
    : Object.entries(rawOverrides);

  const normalizeVariantConfig = (variant = {}, index = 0) => {
    if (!variant || typeof variant !== 'object') return null;
    const price = parseLooseMoneyValue(variant.price ?? variant.unitPrice ?? variant.sellingPrice);
    const size = `${variant.size ?? variant.sizeLabel ?? variant.weightKg ?? ''}`.trim();
    const attributeLabel = `${variant.attributeLabel ?? variant.productAttribute ?? variant.attribute ?? variant.variant ?? ''}`.trim();
    const pricingUnit = normalizeProductPricingUnit(variant.pricingUnit ?? variant.defaultUnit ?? variant.quantityUnit ?? variant.unit ?? '');
    const unitPrices = normalizeUnitPriceMap(variant.unitPrices ?? variant.pricesByUnit ?? variant.priceByUnit ?? {});
    const orderUnits = variant.orderUnits ?? variant.allowedOrderUnits ?? variant.inputUnits ?? '';
    const defaultOrderUnit = normalizeProductPricingUnit(
      variant.defaultOrderUnit ?? variant.orderUnit ?? variant.preferredOrderUnit ?? ''
    );
    const unitConversions = variant.unitConversions ?? variant.conversions ?? variant.conversion ?? '';
    if (
      price <= 0
      && !size
      && !attributeLabel
      && !pricingUnit
      && Object.keys(unitPrices).length === 0
      && !hasCustomerOrderConfigurationValue(orderUnits)
      && !defaultOrderUnit
      && !hasCustomerOrderConfigurationValue(unitConversions)
    ) return null;
    return {
      id: `${variant.id || variant.localId || `variant_${index + 1}`}`,
      price,
      size,
      attributeLabel,
      unit: pricingUnit,
      pricingUnit,
      unitPrices,
      orderUnits,
      defaultOrderUnit,
      unitConversions
    };
  };

  return entries.reduce((acc, [productId, config]) => {
    const cleanProductId = `${productId || ''}`.trim();
    const rawPrice = typeof config === 'object' && config !== null
      ? config.price ?? config.unitPrice ?? config.sellingPrice
      : config;
    const cleanPrice = parseLooseMoneyValue(rawPrice);
    const cleanSize = typeof config === 'object' && config !== null
      ? `${config.size ?? config.sizeLabel ?? config.weightKg ?? ''}`.trim()
      : '';
    const cleanAttributeLabel = typeof config === 'object' && config !== null
      ? `${config.attributeLabel ?? config.productAttribute ?? config.attribute ?? config.variant ?? ''}`.trim()
      : '';
    const pricingUnit = typeof config === 'object' && config !== null
      ? normalizeProductPricingUnit(config.pricingUnit ?? config.defaultUnit ?? config.quantityUnit ?? config.unit ?? '')
      : '';
    const unitPrices = typeof config === 'object' && config !== null
      ? normalizeUnitPriceMap(config.unitPrices ?? config.pricesByUnit ?? config.priceByUnit ?? {})
      : {};
    const orderUnits = typeof config === 'object' && config !== null
      ? config.orderUnits ?? config.allowedOrderUnits ?? config.inputUnits ?? ''
      : '';
    const defaultOrderUnit = typeof config === 'object' && config !== null
      ? normalizeProductPricingUnit(config.defaultOrderUnit ?? config.orderUnit ?? config.preferredOrderUnit ?? '')
      : '';
    const unitConversions = typeof config === 'object' && config !== null
      ? config.unitConversions ?? config.conversions ?? config.conversion ?? ''
      : '';
    const variants = typeof config === 'object' && config !== null && Array.isArray(config.variants)
      ? config.variants.map(normalizeVariantConfig).filter(Boolean)
      : [];
    if (cleanProductId && (
      cleanPrice > 0
      || cleanSize
      || cleanAttributeLabel
      || pricingUnit
      || Object.keys(unitPrices).length > 0
      || hasCustomerOrderConfigurationValue(orderUnits)
      || defaultOrderUnit
      || hasCustomerOrderConfigurationValue(unitConversions)
      || variants.length > 0
    )) {
      acc[cleanProductId] = {
        price: cleanPrice,
        size: cleanSize,
        attributeLabel: cleanAttributeLabel,
        pricingUnit,
        defaultUnit: pricingUnit,
        unitPrices,
        orderUnits,
        defaultOrderUnit,
        unitConversions,
        variants
      };
    }
    return acc;
  }, {});
};

const normalizeCustomerProductIds = (customer = {}, products = [], validProductIds = new Set((products || []).map(product => product.id).filter(Boolean))) => {
  const savedIds = Array.isArray(customer?.customerProductIds)
    ? customer.customerProductIds
    : (Array.isArray(customer?.quotedProductIds) ? customer.quotedProductIds : []);
  const priceOverrideIds = Object.keys(normalizeCustomerPriceOverrides(customer || {}));
  const candidateIds = savedIds.length > 0 ? savedIds : priceOverrideIds;
  return [...new Set(candidateIds.map(productId => `${productId || ''}`.trim()).filter(Boolean))]
    .filter(productId => validProductIds.size === 0 || validProductIds.has(productId));
};

const createCustomerBranchId = () => `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const normalizeCustomerBranches = (customer = {}, products = []) => {
  const rawBranches = Array.isArray(customer?.branches)
    ? customer.branches
    : (Array.isArray(customer?.customerBranches) ? customer.customerBranches : []);

  return rawBranches
    .map((branch = {}, index) => {
      const id = `${branch.id || branch.branchId || branch.code || `branch_${index + 1}`}`.trim();
      const name = `${branch.name || branch.branchName || branch.label || ''}`.trim();
      const address = `${branch.address || branch.deliveryAddress || branch.locationText || ''}`.trim();
      const phone = `${branch.phone || branch.contactPhone || ''}`.trim();
      const note = `${branch.note || branch.description || ''}`.trim();
      const customerProductIds = normalizeCustomerProductIds(branch, products);
      return {
        ...branch,
        id: id || `branch_${index + 1}`,
        name,
        address,
        phone,
        note,
        customerProductIds
      };
    })
    .filter(branch => branch.name || branch.address || branch.phone || branch.note || branch.customerProductIds.length > 0);
};

const getCustomerBranchDisplayName = (branch = {}, index = 0) => {
  const name = `${branch.name || branch.branchName || branch.label || ''}`.trim();
  if (name) return name;
  return `Chi nhánh ${index + 1}`;
};

const getCustomerProductConfig = (customer = null, product = null) => {
  const productId = product?.id || '';
  const customerPrices = normalizeCustomerPriceOverrides(customer || {});
  return productId ? customerPrices[productId] || null : null;
};

const resolveCustomerProductBillingConfiguration = (customer = null, product = null, options = {}) => (
  resolveCustomerProductConfiguration({
    customerConfig: getCustomerProductConfig(customer, product),
    product,
    productId: product?.id || '',
    ...options,
  })
);

const getCustomerProductPricingUnit = (customer = null, product = null, fallback = 'Con') => {
  return resolveCustomerProductBillingConfiguration(customer, product, { fallbackUnit: fallback }).pricingUnit
    || getProductPrimaryPricingUnit(product || {}, fallback);
};

const getCustomerProductPrice = (customer = null, product = null, unit = '') => {
  const configuration = resolveCustomerProductBillingConfiguration(customer, product, {
    fallbackUnit: unit || 'Con',
  });
  if (unit && !isCustomerProductUnitAllowed(configuration, unit)) return 0;
  return configuration.unitPrice;
};

const getCustomerProductVariants = (customer = null, product = null) => {
  const config = getCustomerProductConfig(customer, product);
  const productAttributes = getProductAttributes(product);
  const normalizeAttribute = (attribute = '') => {
    const raw = `${attribute || ''}`.trim();
    if (!raw) return '';
    if (productAttributes.length === 0) return raw;
    return productAttributes.find(option => normalizeLookupText(option) === normalizeLookupText(raw)) || raw;
  };
  const normalizeVariant = (variant = {}, index = 0) => {
    const price = parseLooseMoneyValue(variant.price ?? variant.unitPrice ?? variant.sellingPrice);
    const size = `${variant.size ?? variant.sizeLabel ?? variant.weightKg ?? ''}`.trim();
    const attributeLabel = normalizeAttribute(variant.attributeLabel ?? variant.productAttribute ?? variant.attribute ?? variant.variant ?? '');
    const unit = normalizeProductPricingUnit(variant.pricingUnit ?? variant.defaultUnit ?? variant.quantityUnit ?? variant.unit ?? config?.pricingUnit ?? config?.defaultUnit ?? getCustomerProductPricingUnit(customer, product));
    const unitPrices = normalizeUnitPriceMap(variant.unitPrices ?? variant.pricesByUnit ?? variant.priceByUnit ?? {});
    if (price <= 0 && !size && !attributeLabel && !unit && Object.keys(unitPrices).length === 0) return null;
    return {
      id: `${variant.id || variant.localId || `${product?.id || 'product'}_variant_${index}`}`,
      price,
      size,
      attributeLabel,
      unit,
      unitPrices,
      orderUnit: normalizeProductPricingUnit(
        variant.orderUnit ?? variant.defaultOrderUnit ?? variant.quantityUnit ?? '',
      ),
      defaultOrderUnit: normalizeProductPricingUnit(
        variant.defaultOrderUnit ?? variant.orderUnit ?? variant.quantityUnit ?? '',
      ),
      lastUsedAt: variant.lastUsedAt || '',
      lastOrderId: variant.lastOrderId || '',
      lastOrderDate: variant.lastOrderDate || '',
    };
  };
  const variants = [];
  const hasConfiguredVariants = Array.isArray(config?.variants) && config.variants.length > 0;
  const baseVariant = normalizeVariant(config || {}, 0);
  const hasIndependentBaseConfiguration = Boolean(
    baseVariant
    && (
      baseVariant.price > 0
      || baseVariant.size
      || baseVariant.attributeLabel
      || Object.keys(baseVariant.unitPrices || {}).length > 0
    )
  );
  if (productAttributes.length > 0 && !hasConfiguredVariants) {
    // A catalog product can define selectable attributes without storing a
    // customer-specific variant for each one. Keep the configured price/unit
    // and expose every catalog attribute as its own order-request option.
    productAttributes.forEach((attribute, index) => {
      variants.push({
        ...baseVariant,
        id: `${product?.id || 'product'}_attribute_${index}`,
        attributeLabel: attribute
      });
    });
  } else if (baseVariant && (!hasConfiguredVariants || hasIndependentBaseConfiguration)) {
    variants.push({ ...baseVariant, id: `${product?.id || 'product'}_default` });
  }
  (Array.isArray(config?.variants) ? config.variants : []).forEach((variant, index) => {
    const normalized = normalizeVariant(variant, index + 1);
    if (normalized) variants.push(normalized);
  });
  const unique = new Map();
  variants.forEach((variant) => {
    const key = `${normalizeLookupText(variant.size)}__${normalizeLookupText(variant.attributeLabel)}__${normalizeLookupText(variant.unit)}__${roundMoneyValue(variant.price)}`;
    if (!unique.has(key)) unique.set(key, variant);
  });
  if (unique.size > 0) return Array.from(unique.values());
  return [{
    id: `${product?.id || 'product'}_default`,
    price: getCustomerProductPrice(customer, product),
    size: '',
    attributeLabel: '',
    unit: getCustomerProductPricingUnit(customer, product),
    unitPrices: {}
  }];
};

const getQuoteCustomerHonorificLabel = (customer = null) => {
  const honorific = getCustomerHonorific(customer || {});
  if (honorific === 'anh') return 'Anh';
  if (honorific === 'chi') return 'Chị';
  return 'Quý khách';
};

const buildCustomerQuoteShareText = ({
  customer = null,
  quoteProducts = [],
  currentCompany = null,
  employees = [],
  employee = null,
  orders = [],
  payments = [],
  priceOverrides = null
} = {}) => {
  const companyName = (currentCompany?.displayName || currentCompany?.name || 'HD Manager').trim();
  const plainCustomerName = customer ? (getCustomerPlainName(customer) || customer.name || customer.customerName || '') : '';
  const honorificLabel = getQuoteCustomerHonorificLabel(customer);
  const contactPerson = employees.find(item => item.id === customer?.empId) || employee || {};
  const contactLine = [contactPerson?.name, contactPerson?.phone].filter(Boolean).join(' - ') || companyName;
  const normalizedOverrides = priceOverrides ? normalizeCustomerPriceOverrides({ priceOverrides }) : null;
  const ledger = customer?.id ? buildCustomerLedger(customer, orders, payments) : null;
  const debtAmount = Math.max(0, ledger?.currentDebt || customer?.currentDebt || 0);
  const productLines = (quoteProducts || []).flatMap((product) => {
    const overrideConfig = normalizedOverrides?.[product.id] || null;
    const quoteVariants = overrideConfig
      ? getCustomerProductVariants({ ...customer, priceOverrides: { ...(customer?.priceOverrides || {}), [product.id]: overrideConfig } }, product)
      : getCustomerProductVariants(customer, product);
    const unit = product.unit || 'đv';
    return quoteVariants.map((variant) => {
      const finalPrice = parseLooseMoneyValue(variant.price) > 0 ? parseLooseMoneyValue(variant.price) : getCustomerProductPrice(customer, product);
      const sizeText = variant.size ? ` | Size: ${variant.size}` : '';
      const attributeText = variant.attributeLabel ? ` | Thuộc tính: ${variant.attributeLabel}` : '';
      return `${product.name}: ${formatCurrency(finalPrice)} đ/${unit}${sizeText}${attributeText}`;
    });
  }).map((line, index) => `${index + 1}. ${line}`);

  return [
    `Kính gửi: ${honorificLabel}${plainCustomerName ? ` - ${plainCustomerName}` : ''}.`,
    '',
    companyName.toUpperCase(),
    '',
    'Danh sách sản phẩm cần báo:',
    ...(productLines.length > 0 ? productLines : ['Chưa có sản phẩm cần báo.']),
    ...(debtAmount > 0 ? [
      '',
      `Công nợ hiện tại của khách: ${formatCurrency(debtAmount)} đ.`,
      'Công ty xin nhắc nhẹ để Quý khách tiện đối chiếu và thanh toán khi thuận tiện.'
    ] : []),
    '',
    'Nếu cần đặt hàng, Quý khách vui lòng phản hồi lại tin nhắn này.',
    `Liên hệ: ${contactLine}`
  ].join('\n');
};

const CASHFLOW_APPROVAL_STATUS = {
  pending: 'pending_handover',
  approved: 'approved',
  rejected: 'rejected'
};

const UNCONFIRMED_PAYMENT_STATUSES = new Set([
  'pending',
  'created',
  'initiated',
  'processing',
  'awaiting_payment',
  'awaiting_transfer',
  'unpaid',
  'failed',
  'cancelled',
  'canceled',
  'expired'
]);

const PAYMENT_INTENT_SOURCE_TYPES = new Set([
  'customer_debt_payment_intent',
  'customer_payment_intent',
  'sepay_customer_debt_intent',
  'sepay_payment_intent',
  'bank_qr_payment_intent'
]);

const isUnconfirmedPaymentIntent = (item = {}) => {
  const sourceType = `${item.sourceType || item.type || ''}`.trim().toLowerCase();
  const statuses = [
    item.status,
    item.paymentStatus,
    item.settlementStatus,
    item.reconciliationStatus
  ]
    .map(value => `${value || ''}`.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(
    item.isPaymentIntent === true
    || item.paymentIntent === true
    || item.isCustomerDebtPaymentIntent === true
    || PAYMENT_INTENT_SOURCE_TYPES.has(sourceType)
    || statuses.some(status => UNCONFIRMED_PAYMENT_STATUSES.has(status))
  );
};

const requiresCashflowApproval = (item = {}) => Boolean(
  item.requiresApproval ||
  item.approvalStatus === CASHFLOW_APPROVAL_STATUS.pending ||
  item.approvalStatus === CASHFLOW_APPROVAL_STATUS.rejected ||
  item.handoverStatus === 'pending' ||
  item.handoverStatus === 'handed_over' ||
  item.sourceType === 'driver_delivery_expense' ||
  item.sourceType === 'employee_reported_expense' ||
  item.sourceType === 'employee_reported_income' ||
  (item.sourceType === 'driver_cash' && item.createdByRole === 'driver')
);

const isCashflowOfficial = (item = {}) => (
  !isUnconfirmedPaymentIntent(item)
  && (!requiresCashflowApproval(item) || item.approvalStatus === CASHFLOW_APPROVAL_STATUS.approved)
);

const toDateInputString = (date) => {
  const normalized = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return normalized.toISOString().split('T')[0];
};

const getRuntimePlatform = () => {
  try {
    return Capacitor.getPlatform();
  } catch (error) {
    return 'web';
  }
};

const isNativeRuntime = () => getRuntimePlatform() !== 'web';

const mapLocationErrorMessage = (error, source = 'web') => {
  const rawMessage = `${error?.message || ''}`.toLowerCase();
  const code = error?.code;
  const isNative = source === 'native';

  if (code === 1 || rawMessage.includes('permission') || rawMessage.includes('denied')) {
    return isNative
      ? 'App chưa được cấp quyền vị trí. Hãy cho phép quyền vị trí trong cài đặt ứng dụng.'
      : 'Trình duyệt chưa được cấp quyền vị trí. Hãy cho phép quyền vị trí rồi thử lại.';
  }

  if (
    code === 2 ||
    rawMessage.includes('os-plug-gloc-0002') ||
    rawMessage.includes('os-plug-gloc-0007') ||
    rawMessage.includes('services are not enabled') ||
    rawMessage.includes('location services are disabled') ||
    (rawMessage.includes('gps') && rawMessage.includes('disabled')) ||
    rawMessage.includes('location unavailable') ||
    rawMessage.includes('unavailable')
  ) {
    return 'Dịch vụ vị trí chưa sẵn sàng. Hãy bật GPS và di chuyển ra nơi thoáng, app sẽ tự thử lại.';
  }

  if (code === 3 || rawMessage.includes('os-plug-gloc-0010') || rawMessage.includes('timeout')) {
    return 'Chưa nhận được tín hiệu GPS kịp thời. App vẫn đang chờ vị trí chính xác.';
  }

  if (rawMessage.includes('not supported') || rawMessage.includes('not available')) {
    return isNative
      ? 'Thiết bị này chưa hỗ trợ lấy vị trí GPS.'
      : 'Trình duyệt này chưa hỗ trợ lấy vị trí GPS.';
  }

  return isNative
    ? 'Chưa lấy được vị trí từ thiết bị. App vẫn đang chờ GPS.'
    : 'Chưa lấy được vị trí từ trình duyệt. App vẫn đang chờ GPS.';
};

const getBrowserGeolocationPermissionState = async () => {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status?.state || 'prompt';
  } catch (error) {
    return 'prompt';
  }
};

const ensureNativeLocationPermission = async () => {
  try {
    const status = await Geolocation.checkPermissions();
    if (status?.location === 'granted') return status;

    const requested = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (requested?.location !== 'granted') {
      throw new Error('permission_denied');
    }
    return requested;
  } catch (error) {
    throw new Error(mapLocationErrorMessage(error, 'native'));
  }
};

const requestBrowserLocation = async () => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('permission_denied');
  }

  const permissionState = await getBrowserGeolocationPermissionState();
  if (permissionState === 'denied') {
      throw new Error('permission_denied');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(new Error(mapLocationErrorMessage(error, 'web'))),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
};

const requestCurrentLocation = async () => {
  if (isNativeRuntime()) {
    await ensureNativeLocationPermission();
    try {
      return await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
        enableLocationFallback: true
      });
    } catch (error) {
      throw new Error(mapLocationErrorMessage(error, 'native'));
    }
  }

  return requestBrowserLocation();
};

const compareLedgerItems = (a, b, sortKeys = null) => {
  const keyFor = item => {
    if (sortKeys?.has(item)) return sortKeys.get(item);
    const dateKey = getPaymentDateKey(item) || getDateKeyFromAnyValue(item?.paymentDate || item?.transactionDate || item?.transactionDateTime || item?.paidAt || item?.transactionAt || item?.date || item?.createdAt || getEntityTimestamp(item));
    const key = { day: new Date(`${dateKey || '1970-01-01'}T00:00:00`).getTime(), timestamp: undefined };
    sortKeys?.set(item, key);
    return key;
  };
  const aKey = keyFor(a), bKey = keyFor(b);
  const dateCompare = aKey.day - bKey.day;
  if (dateCompare !== 0) return dateCompare;
  if (aKey.timestamp === undefined) aKey.timestamp = getPaymentTimestamp(a) || getEntityTimestamp(a) || 0;
  if (bKey.timestamp === undefined) bKey.timestamp = getPaymentTimestamp(b) || getEntityTimestamp(b) || 0;
  const timestampCompare = aKey.timestamp - bKey.timestamp;
  if (timestampCompare !== 0) return timestampCompare;
  return (a.id || '').localeCompare(b.id || '');
};

const sortLedgerOrdersNewestFirst = (orders = []) => (
  [...(orders || [])].sort((a, b) => compareLedgerItems(b, a))
);

const parseVietnameseDateTimeString = (value = '') => {
  const raw = `${value || ''}`.trim();
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

const ENTITY_TIMESTAMP_CACHE_LIMIT = 2048;

const ENTITY_TIMESTAMP_CACHE_MAX_LENGTH = 64;

const entityTimestampStringCache = new Map();

const parseEntityTimestampValue = (rawValue) => {
  if (!rawValue) return null;

  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue) || rawValue <= 0) return null;
    return rawValue < 10000000000 ? rawValue * 1000 : rawValue;
  }

  if (typeof rawValue?.toDate === 'function') {
    const parsedDate = rawValue.toDate();
    if (parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())) return parsedDate.getTime();
  }

  if (typeof rawValue === 'object') {
    const seconds = rawValue.seconds ?? rawValue._seconds;
    const nanos = rawValue.nanoseconds ?? rawValue._nanoseconds ?? 0;
    if (seconds !== undefined && seconds !== null) {
      const parsedSeconds = Number(seconds);
      const parsedNanos = Number(nanos);
      if (Number.isFinite(parsedSeconds)) {
        return (parsedSeconds * 1000) + Math.floor((Number.isFinite(parsedNanos) ? parsedNanos : 0) / 1000000);
      }
    }

    const nestedValue = rawValue.timestampValue
      ?? rawValue.stringValue
      ?? rawValue.integerValue
      ?? rawValue.doubleValue
      ?? rawValue.value;
    if (nestedValue !== undefined && nestedValue !== rawValue) {
      return parseEntityTimestampValue(nestedValue);
    }
  }

  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim();
    if (!normalized) return null;
    // Bound the raw string too; a trimmed key can retain its backing string.
    const cacheable = rawValue.length <= ENTITY_TIMESTAMP_CACHE_MAX_LENGTH
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
    if (cacheable) {
      const cached = entityTimestampStringCache.get(normalized);
      if (cached !== undefined) return cached;
    }
    if (/^\d{10,13}$/.test(normalized)) {
      const parsedNumeric = Number(normalized);
      if (Number.isFinite(parsedNumeric)) return normalized.length === 10 ? parsedNumeric * 1000 : parsedNumeric;
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

const getEntityTimestamp = (entity = {}) => {
  if (!entity || typeof entity !== 'object') return parseEntityTimestampValue(entity);

  // Plain business records usually have createdAt. Preserve the existing
  // priority and truthy/epoch-zero rules without allocating a nine-value array
  // or reading later fields when an earlier timestamp already resolves.
  const timestamp = parseEntityTimestampValue(entity.createdAt)
    || parseEntityTimestampValue(entity.updatedAt)
    || parseEntityTimestampValue(entity.timestamp)
    || parseEntityTimestampValue(entity.receivedAt)
    || parseEntityTimestampValue(entity.sentAt)
    || parseEntityTimestampValue(entity.approvedAt)
    || parseEntityTimestampValue(entity.paidAt)
    || parseEntityTimestampValue(entity.lastMessageAt)
    || parseEntityTimestampValue(entity.lastActivityAt);
  if (timestamp) return timestamp;

  if (typeof entity.date === 'string' && entity.date.includes('T')) {
    const parsed = new Date(entity.date).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  const idMatch = `${entity.id || ''}`.match(/_(\d{10,13})$/);
  if (idMatch) {
    const rawTimestamp = parseInt(idMatch[1], 10);
    if (!Number.isNaN(rawTimestamp)) {
      return idMatch[1].length === 10 ? rawTimestamp * 1000 : rawTimestamp;
    }
  }

  const embeddedIdTimestampMatch = `${entity.id || ''}`.match(/(?:^|_)(\d{13})(?:_|$)/);
  if (embeddedIdTimestampMatch) {
    const rawTimestamp = parseInt(embeddedIdTimestampMatch[1], 10);
    if (!Number.isNaN(rawTimestamp)) return rawTimestamp;
  }

  return null;
};

const resolveEntityDateKey = (entity = {}, fallbackDate = getTodayString()) => {
  const rawDate = `${entity?.date
    || entity?.requestDate
    || entity?.requestDateKey
    || entity?.orderRequestDate
    || entity?.sourceOrderRequestDate
    || entity?.dispatchDate
    || entity?.deliveryDate
    || ''}`.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  if (rawDate) {
    const parsedRawDate = new Date(rawDate);
    if (!Number.isNaN(parsedRawDate.getTime())) {
      return `${parsedRawDate.getFullYear()}-${String(parsedRawDate.getMonth() + 1).padStart(2, '0')}-${String(parsedRawDate.getDate()).padStart(2, '0')}`;
    }
  }

  const timestamp = getEntityTimestamp(entity);
  if (!timestamp) return fallbackDate;
  const parsedTimestamp = new Date(timestamp);
  return `${parsedTimestamp.getFullYear()}-${String(parsedTimestamp.getMonth() + 1).padStart(2, '0')}-${String(parsedTimestamp.getDate()).padStart(2, '0')}`;
};

const normalizeCustomerOpeningDebtAmount = (value) => Math.max(0, roundMoneyValue(parseLooseMoneyValue(value)));

const normalizeCustomerOpeningPayableAmount = (value) => Math.max(0, roundMoneyValue(parseLooseMoneyValue(value)));

const getCustomerOpeningDebtAmount = (customer = {}) => normalizeCustomerOpeningDebtAmount(
  customer?.openingDebtAmount
    ?? customer?.oldDebtAmount
    ?? customer?.legacyDebtAmount
    ?? 0
);

const getCustomerOpeningDebtDate = (customer = {}) => {
  const rawDate = customer?.openingDebtDate || customer?.oldDebtDate || customer?.legacyDebtDate || customer?.createdAt || '';
  if (typeof rawDate === 'string' && rawDate.trim()) return rawDate.trim().slice(0, 10);
  return getTodayString();
};

const getCustomerOpeningPayableAmount = (customer = {}) => normalizeCustomerOpeningPayableAmount(
  customer?.openingPayableAmount
    ?? customer?.oldPayableAmount
    ?? customer?.legacyPayableAmount
    ?? customer?.companyOpeningDebtAmount
    ?? customer?.companyOldDebtAmount
    ?? 0
);

const getCustomerOpeningPayableDate = (customer = {}) => {
  const rawDate = customer?.openingPayableDate
    || customer?.oldPayableDate
    || customer?.legacyPayableDate
    || customer?.companyOpeningDebtDate
    || customer?.createdAt
    || '';
  if (typeof rawDate === 'string' && rawDate.trim()) return rawDate.trim().slice(0, 10);
  return getTodayString();
};

const buildCustomerOpeningDebtOrder = (customer = null) => {
  if (!customer?.id) return null;
  const amount = getCustomerOpeningDebtAmount(customer);
  if (amount <= 0) return null;
  const date = getCustomerOpeningDebtDate(customer);

  return {
    id: `opening_debt_${customer.id}`,
    code: 'Nợ cũ',
    orderCode: 'Nợ cũ',
    customerId: customer.id,
    customerName: getCustomerDisplayName(customer) || customer.name || '',
    date,
    createdAt: customer.openingDebtCreatedAt || date,
    amount,
    totalAmount: amount,
    paidAmount: 0,
    appliedAmount: 0,
    creditApplied: 0,
    outstandingAmount: amount,
    allocations: [],
    items: [{ description: 'Nợ cũ', productName: 'Nợ cũ', quantity: 1, unitPrice: amount, total: amount }],
    note: customer.openingDebtNote || 'Nợ cũ trước khi sử dụng hệ thống',
    isOpeningDebt: true,
    sourceType: 'opening_debt'
  };
};

const selectCustomerHistoryRows = createCustomerRecordSelector();

const buildCustomerLedger = (customerOrId, allOrders = [], allPayments = [], { cooperative = false, historyAlreadySelected = false } = {}) => {
  function* calculate() {
  // Per build only: the ledger mutates allocations/amounts, never these date
  // fields. Reusing parsed sort keys avoids reparsing every comparator pair;
  // no cache survives a save, a new ledger build or a different tenant.
  const sortKeys = new Map();
  const compareCustomerLedgerItems = (a, b) => compareLedgerItems(a, b, sortKeys);
  const customerRecord = typeof customerOrId === 'object' && customerOrId !== null ? customerOrId : null;
  const customerId = customerRecord?.id || customerOrId || '';
  const openingDebtOrder = buildCustomerOpeningDebtOrder(customerRecord);
  let orders = [];
  if (openingDebtOrder) orders.push(openingDebtOrder);
  const customerOrders = historyAlreadySelected ? allOrders : selectCustomerHistoryRows(allOrders, customerId);
  for (const order of customerOrders) {
    yield;
    if (order.customerId !== customerId || order.isArchived) continue;
    orders.push({...order, appliedAmount: 0, creditApplied: 0,
      outstandingAmount: Math.max(0, order.amount || 0), allocations: []});
  }
  orders = cooperative ? yield* sortProjection(orders, compareCustomerLedgerItems) : orders.sort(compareCustomerLedgerItems);
  let payments = [];
  const customerPayments = historyAlreadySelected ? allPayments : selectCustomerHistoryRows(allPayments, customerId);
  for (const payment of customerPayments) {
    yield;
    if (payment.customerId !== customerId || payment.isArchived || !isCashflowOfficial(payment)) continue;
    payments.push({...payment, appliedAmount: 0, overpaidAmount: 0, allocations: []});
  }
  payments = cooperative ? yield* sortProjection(payments, compareCustomerLedgerItems) : payments.sort(compareCustomerLedgerItems);
  let timeline = [];
  for (const order of orders) { yield; timeline.push({type: 'order', date: order.date, id: 'order_'+order.id, ref: order}); }
  for (const payment of payments) { yield; timeline.push({type: 'payment', date: getPaymentDateKey(payment) || payment.date, id: 'payment_'+payment.id, ref: payment}); }
  const compareTimeline = (a, b) => {
    const baseCompare = compareCustomerLedgerItems(a, b);
    if (baseCompare !== 0) return baseCompare;
    if (a.type === b.type) return 0;
    return a.type === 'order' ? -1 : 1;
  };
  timeline = cooperative ? yield* sortProjection(timeline, compareTimeline) : timeline.sort(compareTimeline);

  const openOrders = [];
  let customerCredit = 0;

  for (const item of timeline) {
    yield;
    if (item.type === 'order') {
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
    const shouldPrioritizeMatchedOrder = payment.matchedOrderId
      && !payment.allocateOldestFirst
      && payment.allocationMode !== 'oldest_first';
    let prioritizedOrder = null;
    if (shouldPrioritizeMatchedOrder) for (const order of orders) {
      yield;
      if (order.id === payment.matchedOrderId) { prioritizedOrder = order; break; }
    }

    if (prioritizedOrder && prioritizedOrder.outstandingAmount > 0 && remaining > 0) {
      const prioritizedAmount = Math.min(prioritizedOrder.outstandingAmount, remaining);
      prioritizedOrder.outstandingAmount -= prioritizedAmount;
      prioritizedOrder.appliedAmount += prioritizedAmount;
      prioritizedOrder.allocations.push({ paymentId: payment.id, amount: prioritizedAmount, date: getPaymentDateKey(payment) || payment.date, matchType: 'order_code' });
      payment.appliedAmount += prioritizedAmount;
      payment.allocations.push({ orderId: prioritizedOrder.id, amount: prioritizedAmount, date: prioritizedOrder.date, matchType: 'order_code' });
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
    status: order.outstandingAmount <= 0 ? 'paid' : order.appliedAmount > 0 ? 'partial' : 'unpaid'
    });
  }
  let totalRevenue = 0, totalPaid = 0, currentDebt = 0;
  for (const order of orderDetails) { yield; totalRevenue += order.isOpeningDebt ? 0 : (order.amount || 0); }
  for (const payment of payments) { yield; totalPaid += payment.amount || 0; }
  for (const order of orderDetails) { yield; currentDebt += order.outstandingAmount || 0; }

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
  for (;;) { const next = iterator.next(); if (next.done) return next.value; }
};

const indexedCustomerLedgerMap = createCustomerLedgerMapBuilder(buildCustomerLedger);

const buildCustomerLedgerMap = (customers = [], orders = [], payments = [], options = {}) => (
  indexedCustomerLedgerMap(customers, orders, payments, getTodayString(), options)
);

const buildCustomerSupplierPurchaseLedger = (customerOrId, warehouseImports = []) => {
  const customerRecord = typeof customerOrId === 'object' && customerOrId !== null ? customerOrId : null;
  const customerId = `${customerRecord?.id || (typeof customerOrId === 'string' ? customerOrId : '') || ''}`.trim();
  const customerPhone = normalizeCustomerPhone(customerRecord?.phone || customerRecord?.phoneNumber || '');
  const customerNameKey = normalizeLookupText(getCustomerDisplayName(customerRecord) || customerRecord?.name || '');
  const openingPayableAmount = getCustomerOpeningPayableAmount(customerRecord || {});
  const openingPayableDate = getCustomerOpeningPayableDate(customerRecord || {});
  const openingPayableNote = `${customerRecord?.openingPayableNote || customerRecord?.oldPayableNote || customerRecord?.companyOpeningDebtNote || ''}`.trim();
  const imports = (Array.isArray(warehouseImports) ? warehouseImports : [])
    .filter(item => item && !item.isArchived)
    .filter(item => {
      const supplierCustomerId = `${item.supplierCustomerId || item.linkedCustomerId || item.customerId || ''}`.trim();
      if (customerId && supplierCustomerId && supplierCustomerId === customerId) return true;

      const supplierPhone = normalizeCustomerPhone(item.supplierPhone || item.phone || item.customerPhone || '');
      if (customerPhone && supplierPhone && supplierPhone === customerPhone) return true;

      const supplierNameKey = normalizeLookupText(item.supplier || item.supplierName || item.customerName || item.customerNameSnapshot || '');
      return Boolean(customerNameKey && supplierNameKey && supplierNameKey === customerNameKey);
    })
    .map(item => {
      const totalKg = parseLooseQuantityValue(item.totalKg ?? item.weightKg ?? item.kg);
      const unitPrice = parseLooseMoneyValue(item.unitPrice ?? item.price);
      const rawAmount = parseLooseMoneyValue(item.amount ?? item.totalAmount ?? item.value ?? item.total);
      const amount = roundMoneyValue(item.amount != null || item.totalAmount != null || item.value != null || item.total != null
        ? rawAmount
        : purchaseAmount({ ...item, totalKg, quantity: parseLooseQuantityValue(item.quantity), unitPrice }, item.purchaseUnit || 'Kg'));
      return { ...item, amount };
    })
    .filter(item => item.amount > 0)
    .sort(compareLedgerItems);
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

const applyCustomerSupplierReconciliation = (ledger = {}, purchaseLedger = {}, repayments = []) => {
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
    openingPayableDate: purchaseLedger.openingPayableDate || '',
    openingPayableNote: purchaseLedger.openingPayableNote || '',
    purchaseImportAmount: purchaseLedger.purchaseImportAmount || 0,
    purchaseDebt,
    purchaseImports: purchaseLedger.imports || [],
    companyOwesBeforeReconcile,
    reconciliationOffset,
    reconciliationNetAmount: currentDebt || creditBalance,
    reconciliationStatus: currentDebt > 0
      ? 'customer_owes_company'
      : creditBalance > 0
        ? 'company_owes_customer'
        : 'balanced'
  };
};

const getCustomerDebtRepayments = (customerOrId, expenses = []) => {
  const customerId = typeof customerOrId === 'string' ? customerOrId : customerOrId?.id;
  return expenses.filter(item => item && !item.isArchived && item.sourceType === 'customer_debt_repayment'
    && item.customerId === customerId && isCashflowOfficial(item)
    && (!customerOrId?.companyId || item.companyId === customerOrId.companyId));
};

const buildCustomerReconciledLedger = (customerOrId, allOrders = [], allPayments = [], warehouseImports = [], expenses = []) => {
  const ledger = buildCustomerLedger(customerOrId, allOrders, allPayments);
  const purchaseLedger = buildCustomerSupplierPurchaseLedger(customerOrId, warehouseImports);
  return applyCustomerSupplierReconciliation(ledger, purchaseLedger, getCustomerDebtRepayments(customerOrId, expenses));
};

const buildCustomerReconciledLedgerMap = (customers = [], orders = [], payments = [], warehouseImports = [], expenses = [], {cooperative = false} = {}) => {
  function* calculate() {
  const preparedSales = buildCustomerLedgerMap(customers, orders, payments, {cooperative});
  const salesLedgers = cooperative ? yield* preparedSales : preparedSales;
  yield;
  const importsByCustomerId = new Map();
  const importsByPhone = new Map();
  const importsByName = new Map();
  const repaymentsByCustomer = new Map();
  for (const item of expenses) {
    yield;
    if (!item || item.isArchived || item.sourceType !== 'customer_debt_repayment') continue;
    if (!repaymentsByCustomer.has(item.customerId)) repaymentsByCustomer.set(item.customerId, []);
    repaymentsByCustomer.get(item.customerId).push(item);
  }
  const addImport = (index, key, item) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  };

  for (const item of (Array.isArray(warehouseImports) ? warehouseImports : [])) {
    yield;
    if (!item || item.isArchived) continue;
    addImport(importsByCustomerId, `${item.supplierCustomerId || item.linkedCustomerId || item.customerId || ''}`.trim(), item);
    addImport(importsByPhone, normalizeCustomerPhone(item.supplierPhone || item.phone || item.customerPhone || ''), item);
    addImport(importsByName, normalizeLookupText(item.supplier || item.supplierName || item.customerName || item.customerNameSnapshot || ''), item);
  }

  const entries = [];
  for (const customer of (Array.isArray(customers) ? customers : [])) {
    yield;
    if (!customer) continue;
    const customerId = `${customer.id || ''}`.trim();
    const phone = normalizeCustomerPhone(customer.phone || customer.phoneNumber || '');
    const name = normalizeLookupText(getCustomerDisplayName(customer) || customer.name || '');
    const matchedImports = [...new Set([
      ...(importsByCustomerId.get(customerId) || []),
      ...(importsByPhone.get(phone) || []),
      ...(importsByName.get(name) || [])
    ])];
    const purchaseLedger = buildCustomerSupplierPurchaseLedger(customer, matchedImports);
    entries.push([customer.id, applyCustomerSupplierReconciliation(salesLedgers[customer.id], purchaseLedger,
      getCustomerDebtRepayments(customer, repaymentsByCustomer.get(customer.id) || []))]);
  }
  return Object.fromEntries(entries);
  }
  const iterator = calculate();
  if (cooperative) return iterator;
  for (;;) { const next = iterator.next(); if (next.done) return next.value; }
};

const ReconciledLedgerContext = React.createContext(null);

const normalizeCustomerDebtLimitAmount = (value) => Math.max(0, roundMoneyValue(parseLooseMoneyValue(value)));

const getCustomerDebtLimitConfig = (customer = {}) => {
  const rawMode = `${customer?.debtLimitMode || customer?.creditLimitMode || ''}`.trim();
  const legacyLimit = customer?.debtLimitAmount ?? customer?.creditLimit ?? customer?.maxDebtAmount;
  const limitAmount = normalizeCustomerDebtLimitAmount(legacyLimit);

  if (rawMode === 'no_debt' || customer?.allowDebt === false) {
    return { mode: 'no_debt', limitAmount: 0 };
  }

  if (rawMode === 'limited' || (limitAmount > 0 && rawMode !== 'unlimited')) {
    return { mode: 'limited', limitAmount };
  }

  if (rawMode === 'unlimited') {
    return { mode: 'unlimited', limitAmount: 0 };
  }

  return { mode: 'no_debt', limitAmount: 0 };
};

const buildCustomerDebtLimitStatus = (customer = {}, ledgerOrDebt = null) => {
  const config = getCustomerDebtLimitConfig(customer);
  const currentDebt = typeof ledgerOrDebt === 'number'
    ? Math.max(0, roundMoneyValue(ledgerOrDebt))
    : Math.max(0, roundMoneyValue(ledgerOrDebt?.currentDebt ?? customer?.currentDebt ?? 0));

  if (config.mode === 'unlimited') {
    return {
      mode: config.mode,
      enabled: false,
      limitAmount: 0,
      currentDebt,
      exceeded: false,
      overAmount: 0,
      remainingAmount: null,
      isNoDebt: false,
      label: 'Không giới hạn',
      shortLabel: 'Không giới hạn',
      message: 'Khách hàng chưa cài hạn mức công nợ.',
      actionLabel: '',
      tone: 'slate'
    };
  }

  const limitAmount = config.mode === 'no_debt' ? 0 : config.limitAmount;
  const exceeded = currentDebt > limitAmount;
  const overAmount = Math.max(0, currentDebt - limitAmount);
  const remainingAmount = Math.max(0, limitAmount - currentDebt);
  const isNoDebt = config.mode === 'no_debt';

  return {
    mode: config.mode,
    enabled: true,
    limitAmount,
    currentDebt,
    exceeded,
    overAmount,
    remainingAmount,
    isNoDebt,
    label: isNoDebt ? 'Không cho nợ' : `Cho nợ tối đa ${formatCurrency(limitAmount)} đ`,
    shortLabel: isNoDebt ? 'Không nợ' : `HM ${formatCurrency(limitAmount)} đ`,
    message: exceeded
      ? (isNoDebt
        ? `Khách này không được nợ nhưng hiện còn ${formatCurrency(currentDebt)} đ. Cần nhắc thu nợ hoặc tạm ngưng bán hàng.`
        : `Công nợ đã vượt ${formatCurrency(overAmount)} đ so với hạn mức ${formatCurrency(limitAmount)} đ. Cần nhắc nợ, thu nợ hoặc tạm ngưng bán thêm.`)
      : (isNoDebt
        ? 'Khách này đang đúng chính sách không cho nợ.'
        : `Còn có thể cho nợ thêm ${formatCurrency(remainingAmount)} đ trong hạn mức.`),
    actionLabel: exceeded ? 'Nhắc nợ / tạm ngưng bán' : 'Trong hạn mức',
    tone: exceeded ? 'rose' : 'emerald'
  };
};

const shouldCollectCustomerDebtImmediately = (debtLimitStatus = {}) => (
  Boolean(debtLimitStatus?.enabled && (debtLimitStatus.isNoDebt || debtLimitStatus.exceeded))
);

const DEFAULT_CUSTOMER_LOYALTY_SETTINGS = {
  enabled: false,
  earnAmountPerPoint: 100000,
  redeemValuePerPoint: 1000,
  eligibilityConditions: DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS
};

const getCustomerLoyaltySettings = (company = null) => {
  const earnAmountPerPoint = parseInt(company?.loyaltyEarnAmountPerPoint, 10);
  const redeemValuePerPoint = parseInt(company?.loyaltyRedeemValuePerPoint, 10);

  return {
    enabled: company?.customerLoyaltyEnabled === true,
    earnMode: company?.loyaltyEarnMode === 'revenue_percent' ? 'revenue_percent' : 'fixed',
    revenuePercent: Math.min(100, Math.max(0, Number(company?.loyaltyRevenuePercent) || 0)),
    earnAmountPerPoint: earnAmountPerPoint > 0 ? earnAmountPerPoint : DEFAULT_CUSTOMER_LOYALTY_SETTINGS.earnAmountPerPoint,
    redeemValuePerPoint: redeemValuePerPoint > 0 ? redeemValuePerPoint : DEFAULT_CUSTOMER_LOYALTY_SETTINGS.redeemValuePerPoint,
    eligibilityConditions: normalizeLoyaltyEligibilityConditions(company?.loyaltyEligibilityConditions)
  };
};

const getEffectiveCustomerLoyaltySettings = (customer = {}, company = null) => {
  const companySettings = getCustomerLoyaltySettings(company);
  const rawOverride = customer?.customerLoyaltyEnabledOverride ?? customer?.loyaltyEnabledOverride ?? null;
  const customerOverrideEnabled = rawOverride === true || rawOverride === 'enabled' || rawOverride === 'true';
  const customerOverrideDisabled = rawOverride === false || rawOverride === 'disabled' || rawOverride === 'false';
  return {
    ...companySettings,
    enabled: customerOverrideEnabled ? true : customerOverrideDisabled ? false : companySettings.enabled,
    companyEnabled: companySettings.enabled,
    customerOverrideEnabled,
    customerOverrideDisabled
  };
};

const getDateKeyFromAnyValue = (value = '') => {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : toDateInputString(value);
  if (typeof value === 'number' && Number.isFinite(value)) return toDateInputString(new Date(value));
  if (typeof value?.toDate === 'function') {
    const parsedDate = value.toDate();
    return parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? toDateInputString(parsedDate) : '';
  }
  if (typeof value === 'object') {
    const timestamp = parseEntityTimestampValue(value);
    return timestamp ? toDateInputString(new Date(timestamp)) : '';
  }
  const raw = `${value || ''}`.trim();
  const directDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  if (directDate) return directDate;
  const vietnameseTimestamp = parseVietnameseDateTimeString(raw);
  if (vietnameseTimestamp) return toDateInputString(new Date(vietnameseTimestamp));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : toDateInputString(parsed);
};

const calculateCustomerLoyaltySummary = ({ customer = {}, ledger = null, company = null, pointsRecord = null } = {}) => {
  const loyaltySettings = getEffectiveCustomerLoyaltySettings(customer, company);
  const eligibleAmount = Math.max(0, roundMoneyValue(
    pointsRecord?.eligible_amount
    ?? pointsRecord?.eligibleAmount
    ?? ledger?.totalPaid
    ?? customer?.totalPaid
    ?? 0
  ));
  const manualBonusPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    pointsRecord?.bonus_points
    ?? pointsRecord?.bonusPoints
    ?? customer?.bonusLoyaltyPoints
    ?? 0
  )));
  const usedPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    pointsRecord?.used_points
    ?? pointsRecord?.usedPoints
    ?? customer?.usedLoyaltyPoints
    ?? 0
  )));
  const computedEarnedPoints = loyaltySettings.enabled ? calculateLoyaltyPoints(eligibleAmount, loyaltySettings) : 0;
  const earnedPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    pointsRecord?.earned_points
    ?? pointsRecord?.earnedPoints
    ?? computedEarnedPoints
  )));
  const computedCurrentPoints = Math.max(0, earnedPoints + manualBonusPoints - usedPoints);
  const currentPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    pointsRecord?.available_points
    ?? pointsRecord?.availablePoints
    ?? pointsRecord?.available
    ?? pointsRecord?.total_points
    ?? pointsRecord?.totalPoints
    ?? computedCurrentPoints
  )));

  return {
    ...loyaltySettings,
    eligibleAmount,
    earnedPoints,
    manualBonusPoints,
    usedPoints,
    currentPoints,
    cloudSynced: Boolean(pointsRecord),
    updatedAt: pointsRecord?.updatedAt || pointsRecord?.lastSyncedAt || '',
    redeemValue: roundMoneyValue(currentPoints * loyaltySettings.redeemValuePerPoint)
  };
};

const isPayosPaymentRecord = (payment = {}) => {
  const providerText = `${payment.paymentProvider || payment.sourceType || payment.method || payment.paymentMethod || payment.sourceLabel || ''}`.toLowerCase();
  return providerText.includes('sepay') || providerText.includes('payos');
};

const getPaymentReceivingBankLabel = (payment = {}) => {
  const payosTechnicalLabels = new Set(['sepay', 'sepay webhook', 'sepay sync', 'sepay_webhook', 'sepay_sync', 'sepay tu dong', 'sepay tự động', 'payos', 'payos webhook', 'payos sync', 'payos_webhook', 'payos_sync', 'payos tu dong', 'payos tự động']);
  const candidates = [
    payment.receivingBankName,
    payment.bankName,
    payment.receivingBankCode,
    payment.bankCode,
    payment.bankId,
    payment.sourceLabel,
    payment.method,
    payment.paymentMethod
  ];

  for (const candidate of candidates) {
    const text = `${candidate || ''}`.trim();
    if (!text) continue;
    const lookup = text.toLowerCase();
    if (payosTechnicalLabels.has(lookup)) continue;
    if (lookup.includes('webhook') || lookup.includes('sync')) continue;
    if (lookup.includes('bidv') || lookup === '970418') return 'BIDV';
    return text;
  }

  return isPayosPaymentRecord(payment) ? (DEFAULT_INVOICE_TRANSFER_PROFILE.bankName || DEFAULT_INVOICE_TRANSFER_PROFILE.bankId || 'Ngân hàng') : '';
};

const getPaymentMethodLabel = (payment = {}) => (
  isPayosPaymentRecord(payment)
    ? 'SePay tự động'
    : (payment.method || payment.paymentMethod || 'Tiền mặt')
);

const getPaymentSourceLabel = (payment = {}) => (
  isPayosPaymentRecord(payment)
    ? (getPaymentReceivingBankLabel(payment) || 'Ngân hàng')
    : (payment.sourceLabel || payment.sourceType || 'Thu công nợ')
);

const getPaymentRawPayosData = (payment = {}) => {
  const rawWebhook = payment.rawWebhook || payment.rawPayload || {};
  const data = rawWebhook?.data || {};
  const paymentLink = rawWebhook?.paymentLink || data?.paymentLink || {};
  const latestTransaction = rawWebhook?.latestTransaction || data?.latestTransaction || {};
  const transactions = Array.isArray(paymentLink?.transactions) ? paymentLink.transactions : [];
  const latestLinkedTransaction = transactions
    .slice()
    .sort((a, b) => `${b?.transactionDateTime || b?.transactionDate || b?.createdAt || ''}`.localeCompare(`${a?.transactionDateTime || a?.transactionDate || a?.createdAt || ''}`))[0] || {};

  return {
    rawWebhook,
    data,
    paymentLink,
    latestTransaction,
    latestLinkedTransaction
  };
};

const getPaymentDateCandidates = (payment = {}) => {
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

const getPaymentDateSource = (payment = {}) => (
  getPaymentDateCandidates(payment).find(candidate => getDateKeyFromAnyValue(candidate)) || ''
);

const getPaymentDateKey = (payment = {}) => getDateKeyFromAnyValue(getPaymentDateSource(payment));

const getPaymentTimestamp = (payment = {}) => (
  parseEntityTimestampValue(getPaymentDateSource(payment))
    || getEntityTimestamp(payment)
    || (getPaymentDateKey(payment) ? new Date(`${getPaymentDateKey(payment)}T12:00:00`).getTime() : 0)
);

function ShareActionGrid({ title, description, statusMessage, onQuickShare, onShareToChannel, onCopy, onDownload }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-800">{title}</h3>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{description}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Send size={18} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button type="button" onClick={onQuickShare} className="rounded-xl bg-emerald-500 text-white px-3 py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-emerald-600 transition-colors">
          <Send size={16} /> Chia sẻ nhanh
        </button>
        <button type="button" onClick={() => onShareToChannel('zalo')} className="rounded-xl bg-blue-50 text-blue-700 px-3 py-3 text-sm font-bold border border-blue-100 hover:bg-blue-100 transition-colors">
          Zalo
        </button>
        <button type="button" onClick={() => onShareToChannel('facebook')} className="rounded-xl bg-indigo-50 text-indigo-700 px-3 py-3 text-sm font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors">
          Facebook
        </button>
        <button type="button" onClick={() => onShareToChannel('messenger')} className="rounded-xl bg-sky-50 text-sky-700 px-3 py-3 text-sm font-bold border border-sky-100 hover:bg-sky-100 transition-colors">
          Messenger
        </button>
        <button type="button" onClick={onCopy} className="rounded-xl bg-white text-gray-700 px-3 py-3 text-sm font-bold border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors">
          <Copy size={16} /> Sao chép
        </button>
        <button type="button" onClick={onDownload} className="rounded-xl bg-white text-gray-700 px-3 py-3 text-sm font-bold border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors">
          <Download size={16} /> Lưu file
        </button>
      </div>

      {statusMessage && (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 leading-relaxed">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

const deferredCustomerCRMViewModule = createPreloadableModule(() => import("../legacy/CustomerCRMView.jsx")
  .then(({createCustomerCRMView}) => ({default:createCustomerCRMView(Object.freeze({buildCustomerDirectionsUrl,sortOrdersByNewest,APP_SCREEN_BACK_EVENT,CUSTOMER_HONORIFIC_OPTIONS,EMPTY_CUSTOMER_SUMMARIES,EMPTY_MAIN_LEDGER,ReconciledLedgerContext,ShareActionGrid,buildCustomerDebtLimitStatus,buildCustomerImportDuplicateKey,buildCustomerLocationFromPosition,buildCustomerNameAliases,buildCustomerPhoneDuplicateKey,buildCustomerQuoteShareText,buildCustomerReconciledLedger,buildCustomerReconciledLedgerMap,buildLineItemProductSearchText,calculateCustomerLoyaltySummary,capitalizeFirst,capitalizeFirstPreservingSpacing,copyTextToClipboard,createCustomerBranchId,customerDirectorySummaryCache,escapeHtml,formatCurrency,formatCustomerLocationForDisplay,formatCustomerNameDraft,formatDateLabel,formatDateTimeLabel,formatInputCurrency,formatNumber,formatOrderCode,formatReturnGoodsQty,getCustomerBranchDisplayName,getCustomerDebtLimitConfig,getCustomerDisplayName,getCustomerHonorific,getCustomerLocationDisplayText,getCustomerLocationShareText,getCustomerOpeningDebtAmount,getCustomerOpeningPayableAmount,getCustomerPlainName,getDateKeyFromAnyValue,getDeliveryAssignmentIds,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getLedgerOrderDisplayCode,getOrderLineQuantityValue,getOrderLineUnitPriceValue,getOrderLineWeightKgValue,getOrderReturnGoodsRecords,getOrderReturnProductSummary,getPaymentDateKey,getPaymentMethodLabel,getPaymentSourceLabel,getPaymentTimestamp,getProductAttributes,getProductShortName,getSalesDownlineEmployeeIds,getShareChannelLabel,getTodayString,getTransactionBillingPresentation,hasCustomerOrderConfigurationValue,inferCustomerHonorificFromName,isEmployeeDeliveryParticipant,isEmployeeSalesPosition,isOwnerAccountUser,markAppBackHandled,normalizeCustomerBranches,normalizeCustomerDebtLimitAmount,normalizeCustomerLocationFields,normalizeCustomerOpeningDebtAmount,normalizeCustomerOpeningPayableAmount,normalizeCustomerPhone,normalizeCustomerPriceOverrides,normalizeCustomerProductIds,normalizeLookupText,normalizeReturnGoodsStatus,parseCustomerImportWorkbook,parseCustomerLocationInput,parseEntityTimestampValue,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,pickCustomerContactFromDevice,productMatchesLookup,requestCurrentLocation,resolveCustomerImportFixedProducts,resolveEntityDateKey,roundMoneyValue,saveContentFile,shareTextContent,shouldCollectCustomerDebtImmediately,sortLedgerOrdersNewestFirst,stripCustomerHonorificPrefix,summarizeOrderReturnGoods,toTitleCase}))})));

const noCustomerSearchSubscription = () => () => {};

const deferredSQLiteCRMModule=createPreloadableModule(()=>Promise.all([deferredCustomerCRMViewModule.preload(),import("./SQLiteProductCRM.jsx")]).then(([view,adapter])=>({default:props=><adapter.default {...props} View={view.default}/>})));

function CustomerCRMView(props) {
  const readSearch = useCallback(() => props.searchStore ? props.searchStore.getSnapshot() : props.searchKeyword,
    [props.searchStore, props.searchKeyword]);
  const keyword = useSyncExternalStore(props.searchStore?.subscribe || noCustomerSearchSubscription, readSearch, readSearch);
  if(props.localFirstRequired&&!props.supplementsRequested){
    if(!props.localRuntime?.isCurrent())return <section role="status" aria-busy="true" data-hd-module-loading>Đang mở dữ liệu local đã được cấp quyền…</section>;
    return <PreloadedWorkspace module={deferredSQLiteCRMModule} viewProps={{...props,searchKeyword:keyword}} label="Khách hàng"/>;
  }
  return <PreloadedWorkspace module={deferredCustomerCRMViewModule} viewProps={{...props, searchKeyword:keyword}} label={"Khách hàng"} />;
}

export {
  customerDirectorySummaryCache,
  EMPTY_CUSTOMER_SUMMARIES,
  EMPTY_MAIN_LEDGER,
  getCapacitorPlugin,
  APP_SCREEN_BACK_EVENT,
  markAppBackHandled,
  getLocalDateInputValue,
  getTodayString,
  LEGACY_POSITION_MAP,
  WAREHOUSE_EXPORT_POSITION,
  SALES_COLLABORATOR_POSITION,
  normalizeEmployeePosition,
  isOwnerPosition,
  isOwnerRoleValue,
  isOwnerAccountUser,
  isSalesPosition,
  isDeliveryParticipantPosition,
  getDeliveryAssignmentIds,
  parseEmployeeRoleSalaryAmount,
  normalizeEmployeePositionList,
  normalizeEmployeeRoleSalaryComponents,
  getEmployeePositionValues,
  employeeHasPosition,
  isEmployeeSalesPosition,
  isEmployeeDeliveryParticipant,
  getSalesLeaderId,
  getSalesDownlineEmployeeIds,
  ContactPicker,
  toTitleCase,
  capitalizeFirst,
  capitalizeFirstPreservingSpacing,
  toTitleCasePreservingSpacing,
  viNumberFormatter,
  formatInputCurrency,
  parseInputCurrency,
  formatCurrency,
  roundMoneyValue,
  formatNumber,
  isDateOnlyString,
  VIETNAM_TIME_ZONE,
  VIETNAM_DATE_FORMAT_OPTIONS,
  VIETNAM_TIME_FORMAT_OPTIONS,
  vietnamDateFormatter,
  vietnamTimeFormatter,
  formatDateLabel,
  formatCompactDateLabel,
  formatDateTimeLabel,
  formatOrderCode,
  getLedgerOrderDisplayCode,
  escapeHtml,
  DEFAULT_INVOICE_TRANSFER_PROFILE,
  copyTextToClipboard,
  downloadContentFile,
  saveContentFile,
  isShareCancelled,
  shareTextContent,
  getErrorText,
  isFirestoreInternalAssertionError,
  isTimeoutLikeError,
  isFirebaseQuotaError,
  isFirebasePermissionError,
  getFriendlyFirebaseErrorMessage,
  getShareChannelLabel,
  LOOKUP_NORMALIZATION_CACHE_LIMIT,
  LOOKUP_NORMALIZATION_MAX_LENGTH,
  lookupNormalizationCache,
  normalizeLookupText,
  collapseLookupText,
  tokenizeLookupText,
  buildLookupInitials,
  normalizeCustomerPhone,
  buildCustomerPhoneDuplicateKey,
  getProductShortName,
  getProductAttributes,
  getProductSearchValues,
  productMatchesLookup,
  findProductForLineItem,
  buildLineItemProductSearchText,
  CUSTOMER_IMPORT_HEADER_ALIASES,
  buildCustomerImportDuplicateKey,
  parseCustomerImportCsvRows,
  parseCustomerImportWorkbook,
  splitCustomerImportFixedProductNames,
  findCustomerImportProductMatch,
  resolveCustomerImportFixedProducts,
  pickCustomerContactFromDevice,
  parseLooseQuantityValue,
  parseLooseMoneyValue,
  getOrderLineUnitPriceValue,
  getOrderLineQuantityValue,
  getOrderLineWeightKgValue,
  getTransactionBillingPresentation,
  normalizeReturnGoodsStatus,
  getOrderReturnGoodsRecords,
  summarizeOrderReturnGoods,
  formatReturnGoodsQty,
  getOrderReturnProductSummary,
  normalizeCustomerHonorific,
  CUSTOMER_HONORIFIC_OPTIONS,
  inferCustomerHonorificFromName,
  stripCustomerHonorificPrefix,
  formatCustomerNameDraft,
  getCustomerHonorific,
  getCustomerPlainName,
  getCustomerDisplayName,
  buildCustomerNameAliases,
  formatCustomerLocationForDisplay,
  buildCustomerMapsUrlFromLocation,
  parseCustomerLocationInput,
  buildCustomerLocationFromPosition,
  normalizeCustomerLocationFields,
  getCustomerLocationDisplayText,
  getCustomerLocationShareText,
  hasCustomerOrderConfigurationValue,
  normalizeCustomerPriceOverrides,
  normalizeCustomerProductIds,
  createCustomerBranchId,
  normalizeCustomerBranches,
  getCustomerBranchDisplayName,
  getCustomerProductConfig,
  resolveCustomerProductBillingConfiguration,
  getCustomerProductPricingUnit,
  getCustomerProductPrice,
  getCustomerProductVariants,
  getQuoteCustomerHonorificLabel,
  buildCustomerQuoteShareText,
  CASHFLOW_APPROVAL_STATUS,
  UNCONFIRMED_PAYMENT_STATUSES,
  PAYMENT_INTENT_SOURCE_TYPES,
  isUnconfirmedPaymentIntent,
  requiresCashflowApproval,
  isCashflowOfficial,
  toDateInputString,
  getRuntimePlatform,
  isNativeRuntime,
  mapLocationErrorMessage,
  getBrowserGeolocationPermissionState,
  ensureNativeLocationPermission,
  requestBrowserLocation,
  requestCurrentLocation,
  compareLedgerItems,
  sortLedgerOrdersNewestFirst,
  parseVietnameseDateTimeString,
  ENTITY_TIMESTAMP_CACHE_LIMIT,
  ENTITY_TIMESTAMP_CACHE_MAX_LENGTH,
  entityTimestampStringCache,
  parseEntityTimestampValue,
  getEntityTimestamp,
  resolveEntityDateKey,
  normalizeCustomerOpeningDebtAmount,
  normalizeCustomerOpeningPayableAmount,
  getCustomerOpeningDebtAmount,
  getCustomerOpeningDebtDate,
  getCustomerOpeningPayableAmount,
  getCustomerOpeningPayableDate,
  buildCustomerOpeningDebtOrder,
  selectCustomerHistoryRows,
  buildCustomerLedger,
  indexedCustomerLedgerMap,
  buildCustomerLedgerMap,
  buildCustomerSupplierPurchaseLedger,
  applyCustomerSupplierReconciliation,
  getCustomerDebtRepayments,
  buildCustomerReconciledLedger,
  buildCustomerReconciledLedgerMap,
  ReconciledLedgerContext,
  normalizeCustomerDebtLimitAmount,
  getCustomerDebtLimitConfig,
  buildCustomerDebtLimitStatus,
  shouldCollectCustomerDebtImmediately,
  DEFAULT_CUSTOMER_LOYALTY_SETTINGS,
  getCustomerLoyaltySettings,
  getEffectiveCustomerLoyaltySettings,
  getDateKeyFromAnyValue,
  calculateCustomerLoyaltySummary,
  isPayosPaymentRecord,
  getPaymentReceivingBankLabel,
  getPaymentMethodLabel,
  getPaymentSourceLabel,
  getPaymentRawPayosData,
  getPaymentDateCandidates,
  getPaymentDateSource,
  getPaymentDateKey,
  getPaymentTimestamp,
  ShareActionGrid,
  deferredCustomerCRMViewModule,
  noCustomerSearchSubscription,
  deferredSQLiteCRMModule,
  CustomerCRMView
};
