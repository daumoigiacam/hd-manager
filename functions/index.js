const functions = require('firebase-functions');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { PayOS } = require('@payos/node');
const crypto = require('crypto');
const { createIdentityCenter } = require('./identityCenter');
const {
  authorizeTenantRequest,
  authorizeTenantOrderAccess,
  getCustomerIdFromOrder
} = require('./requestAuthorization');
const {
  MAX_CUSTOMER_DEBT_PAYMENT_ORDERS,
  allocateCustomerDebtPayment,
  buildCustomerDebtLedger,
  buildCustomerDebtPaymentCode,
  buildCustomerDebtPaymentFingerprint,
  buildCustomerDebtPaymentIntentId,
  normalizeCustomerDebtPaymentOrderIds,
  normalizeCustomerDebtPaymentLookupTokens,
  resolveCustomerDebtPaymentCode
} = require('./customerDebtPayment');
const {
  buildPointRedemptionId,
  calculateCustomerOutstandingDebt,
  calculatePointRedemption,
  cloneJsonSafe,
  hashAuditValue,
  normalizeRequestId,
  sanitizeCompanyForCustomer,
  sanitizeCustomerAccountForClient,
  sanitizeCustomerProfileForClient,
  sanitizeProductForCustomer,
  sanitizePromotionForCustomer,
  sanitizeRewardForCustomer
} = require('./customerPortalSecurity');
const {
  assertAiRequestSize,
  buildAiRateLimitId,
  sanitizeGeminiRequestPayload
} = require('./aiGatewaySecurity');
const {
  PAYROLL_AUTO_LOCK_PLAN_STATUS,
  PAYROLL_RULES_VERSION,
  createDebtRolloverArtifacts,
  createFinalPayrollSnapshot,
  getPayrollMonthEndDateKey,
  getVietnamClock,
  inspectPayrollAutoLockCandidate,
  isCompleteFinalPayrollSnapshot,
  isLockedPayrollStatus,
  isPayrollAutoLockDue,
  normalizePayrollAutoLockStatus,
  runPayrollAutoLockPlanStateMachine
} = require('./payrollAutoLock');
const {
  runEmployeeEvaluationAggregation
} = require('./employeeEvaluation');
const {
  createLegacyOrderLookup,
  fetchSepayTransactions,
  reconcileSepayTransactions
} = require('./sepayReconciliation');

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const DEFAULT_APP_ID = 'hd-manager-production';

const getEnv = (key, fallback = '') => process.env[key] || fallback;

const parseCsvEnv = (key) => `${getEnv(key) || ''}`
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const isLocalAppOrigin = (origin = '') => (
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin) ||
  /^capacitor:\/\/localhost$/i.test(origin) ||
  /^ionic:\/\/localhost$/i.test(origin)
);

const getAllowedOrigins = () => {
  const publicUrl = `${getEnv('HD_MANAGER_PUBLIC_URL', 'https://hd-manager-c5839.web.app')}`.trim();
  return new Set([
    publicUrl,
    'https://app.hdconnect.net',
    'https://hd-manager-c5839.web.app',
    'https://hd-manager-c5839.firebaseapp.com',
    ...parseCsvEnv('HD_MANAGER_ALLOWED_ORIGINS')
  ].filter(Boolean));
};

const isAllowedCorsOrigin = (origin = '') => {
  if (!origin) return true;
  if (isLocalAppOrigin(origin)) return true;
  return getAllowedOrigins().has(origin);
};

const getPayosClient = () => {
  const clientId = getEnv('PAYOS_CLIENT_ID');
  const apiKey = getEnv('PAYOS_API_KEY');
  const checksumKey = getEnv('PAYOS_CHECKSUM_KEY');

  if (!clientId || !apiKey || !checksumKey) {
    throw new Error('Thiếu cấu hình PAYOS_CLIENT_ID, PAYOS_API_KEY hoặc PAYOS_CHECKSUM_KEY.');
  }

  return new PayOS({ clientId, apiKey, checksumKey });
};

const applyCors = (req, res) => {
  const origin = `${req.headers.origin || ''}`.trim();
  if (origin && isAllowedCorsOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.set('Access-Control-Allow-Origin', `${getEnv('HD_MANAGER_PUBLIC_URL', 'https://hd-manager-c5839.web.app')}`.trim());
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, API-Key, X-SePay-API-Key, X-SePay-Signature, X-Hub-Signature-256');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
};

const sendJson = (res, statusCode, payload) => {
  res.status(statusCode).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(payload));
};

const parseMoney = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const normalized = `${value ?? ''}`.replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
};

const resolveOrderPaymentDueAmount = (order = {}, requestedAmount = 0) => {
  const requested = parseMoney(requestedAmount);
  if (requested > 0) return requested;

  const outstandingAmount = parseMoney(order.outstandingAmount);
  if (outstandingAmount > 0) return outstandingAmount;

  const remainingAmount = parseMoney(order.remainingAmount);
  if (remainingAmount > 0) return remainingAmount;

  const paymentAmount = parseMoney(order.paymentAmount);
  if (paymentAmount > 0) return paymentAmount;

  const orderAmount = parseMoney(order.amount || order.totalAmount || order.finalAmount || order.grandTotal);
  const paidAmount = parseMoney(order.paidAmount || order.appliedAmount || order.collectedAmount);
  return Math.max(0, orderAmount - paidAmount);
};

const safeDocIdPart = (value = '') => `${value || ''}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);

const formatOrderCode = (orderId = '') => `HD${String(orderId || '').slice(-6).toUpperCase()}`;

const formatVnd = (value) => `${parseMoney(value).toLocaleString('vi-VN')} d`;

const createPaymentTrace = ({ flow = 'payment', provider = 'sepay', appId = DEFAULT_APP_ID, orderId = '', paymentCode = '', requestId = '' } = {}) => {
  const startedAtMs = Date.now();
  const traceId = requestId || `${provider}_${flow}_${startedAtMs}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    traceId,
    flow,
    provider,
    appId: normalizeAppId(appId),
    orderId,
    paymentCode,
    startedAtMs,
    lastAtMs: startedAtMs,
    marks: []
  };
};

const markPaymentTrace = (trace, stage, extra = {}) => {
  if (!trace) return null;
  const nowMs = Date.now();
  const mark = {
    stage,
    atMs: nowMs,
    elapsedMs: nowMs - trace.startedAtMs,
    deltaMs: nowMs - trace.lastAtMs,
    ...extra
  };
  trace.lastAtMs = nowMs;
  trace.marks.push(mark);
  console.info('[payment_trace]', JSON.stringify({
    traceId: trace.traceId,
    flow: trace.flow,
    provider: trace.provider,
    appId: trace.appId,
    orderId: trace.orderId,
    paymentCode: trace.paymentCode,
    ...mark
  }));
  return mark;
};

const summarizePaymentTrace = (trace) => trace ? ({
  traceId: trace.traceId,
  elapsedMs: Date.now() - trace.startedAtMs,
  marks: trace.marks.map(({ stage, elapsedMs, deltaMs }) => ({ stage, elapsedMs, deltaMs }))
}) : null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryablePaymentError = (error = {}) => {
  const code = `${error.code || error.status || ''}`.toLowerCase();
  const message = `${error.message || error || ''}`.toLowerCase();
  return [
    'deadline-exceeded',
    'unavailable',
    'aborted',
    'internal',
    'resource-exhausted',
    'timeout'
  ].some(token => code.includes(token) || message.includes(token));
};

const retryPaymentOperation = async (label, operation, { trace = null, delays = [1000, 2000, 5000] } = {}) => {
  let lastError = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      if (attempt > 0) markPaymentTrace(trace, `${label}_retry_${attempt}`, { delayMs: delays[attempt - 1] || 0 });
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isRetryablePaymentError(error);
      markPaymentTrace(trace, `${label}_error`, {
        attempt,
        retryable,
        errorMessage: error.message || `${error}`
      });
      if (!retryable || attempt >= delays.length) break;
      await sleep(delays[attempt]);
    }
  }
  throw lastError;
};

const getVietnamDateKey = (value = new Date()) => {
  const parsed = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(safeDate);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

const buildDateFromVietnamParts = (year, month, day, hour = 0, minute = 0, second = 0) => {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  const parsedHour = Number(hour || 0);
  const parsedMinute = Number(minute || 0);
  const parsedSecond = Number(second || 0);
  if (![parsedYear, parsedMonth, parsedDay, parsedHour, parsedMinute, parsedSecond].every(Number.isFinite)) return null;
  if (parsedYear < 1900 || parsedMonth < 1 || parsedMonth > 12 || parsedDay < 1 || parsedDay > 31) return null;
  if (parsedHour < 0 || parsedHour > 23 || parsedMinute < 0 || parsedMinute > 59 || parsedSecond < 0 || parsedSecond > 59) return null;
  // PayOS reports transaction time in Vietnam time. Store the true UTC instant while preserving the Vietnam date.
  const utcMillis = Date.UTC(parsedYear, parsedMonth - 1, parsedDay, parsedHour - 7, parsedMinute, parsedSecond);
  const parsed = new Date(utcMillis);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parsePayosDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value < 10000000000 ? value * 1000 : value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const raw = `${value || ''}`.trim();
  if (!raw) return null;
  const isoWithZone = /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (isoWithZone) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const vietnamDate = raw.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (vietnamDate) {
    return buildDateFromVietnamParts(
      vietnamDate[3],
      vietnamDate[2],
      vietnamDate[1],
      vietnamDate[4] || 0,
      vietnamDate[5] || 0,
      vietnamDate[6] || 0
    );
  }

  const sortableDate = raw.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (sortableDate) {
    return buildDateFromVietnamParts(
      sortableDate[1],
      sortableDate[2],
      sortableDate[3],
      sortableDate[4] || 0,
      sortableDate[5] || 0,
      sortableDate[6] || 0
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getPayosTransactionDateCandidates = (rawPayload = {}) => {
  const data = rawPayload?.data || {};
  const latestTransaction = rawPayload?.latestTransaction || data?.latestTransaction || {};
  const paymentLink = rawPayload?.paymentLink || data?.paymentLink || {};
  const transactions = Array.isArray(paymentLink?.transactions) ? paymentLink.transactions : [];
  const latestLinkedTransaction = transactions
    .slice()
    .sort((a, b) => `${b?.transactionDateTime || b?.transactionDate || b?.createdAt || ''}`.localeCompare(`${a?.transactionDateTime || a?.transactionDate || a?.createdAt || ''}`))[0] || {};

  return [
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
    rawPayload.transactionDateTime,
    rawPayload.transactionDate,
    rawPayload.paymentTime,
    rawPayload.completedTime,
    rawPayload.paidAt,
    data.createdAt,
    rawPayload.createdAt
  ];
};

const resolvePayosTransactionDate = (rawPayload = {}, fallback = new Date()) => {
  for (const candidate of getPayosTransactionDateCandidates(rawPayload)) {
    const parsed = parsePayosDateTime(candidate);
    if (parsed) return parsed;
  }
  return parsePayosDateTime(fallback) || new Date();
};

const resolvePayosTransactionDateText = (rawPayload = {}) => {
  const value = getPayosTransactionDateCandidates(rawPayload).find(candidate => `${candidate || ''}`.trim());
  return value ? `${value}`.trim() : '';
};

const BANK_LABEL_BY_CODE = {
  BIDV: 'BIDV',
  BID: 'BIDV',
  '970418': 'BIDV',
  STB: 'Sacombank',
  SACOMBANK: 'Sacombank',
  '970403': 'Sacombank',
  VCB: 'Vietcombank',
  VIETCOMBANK: 'Vietcombank',
  '970436': 'Vietcombank',
  ACB: 'ACB',
  '970416': 'ACB',
  TCB: 'Techcombank',
  TECHCOMBANK: 'Techcombank',
  '970407': 'Techcombank',
  MB: 'MBBank',
  MBB: 'MBBank',
  MBBANK: 'MBBank',
  '970422': 'MBBank',
  VPB: 'VPBank',
  VPBANK: 'VPBank',
  '970432': 'VPBank',
  MSB: 'MSB',
  '970426': 'MSB'
};

const normalizeBankLabel = (value = '') => {
  const text = `${value || ''}`.trim();
  if (!text) return '';
  const upper = text.toUpperCase();
  return BANK_LABEL_BY_CODE[upper] || (/BIDV/i.test(text) ? 'BIDV' : text);
};

const resolvePayosReceivingBank = async (appId, order = {}, data = {}, rawPayload = {}) => {
  const rawData = rawPayload?.data || {};
  const bankName = normalizeBankLabel(
    data.receivingBankName
      || data.receiverBankName
      || data.bankName
      || rawData.receivingBankName
      || rawData.receiverBankName
      || rawData.bankName
      || order.receivingBankName
      || order.paymentBankName
      || order.companyBankName
      || order.bankName
      || ''
  );
  const bankCode = normalizeBankLabel(
    data.receivingBankCode
      || data.receiverBankCode
      || data.bankCode
      || data.bankBin
      || data.bin
      || rawData.receivingBankCode
      || rawData.receiverBankCode
      || rawData.bankCode
      || rawData.bankBin
      || rawData.bin
      || order.receivingBankCode
      || order.paymentBankCode
      || order.companyBankCode
      || order.bankCode
      || ''
  );

  if (bankName || bankCode) {
    return {
      bankName: bankName || bankCode,
      bankCode: bankCode || bankName
    };
  }

  const companyId = `${order.companyId || ''}`.trim();
  if (companyId) {
    try {
      const companySnap = await db.collection(collectionPath(appId, 'companies')).doc(companyId).get();
      const company = companySnap.exists ? (companySnap.data() || {}) : {};
      const companyBankName = normalizeBankLabel(company.bankName || company.invoiceBankName || company.bankId || '');
      const companyBankCode = normalizeBankLabel(company.bankId || company.invoiceBankId || company.bankCode || '');
      if (companyBankName || companyBankCode) {
        return {
          bankName: companyBankName || companyBankCode,
          bankCode: companyBankCode || companyBankName
        };
      }
    } catch (error) {
      console.warn('resolvePayosReceivingBank failed', error);
    }
  }

  return { bankName: 'BIDV', bankCode: 'BIDV' };
};

const cleanBankAccountNumber = (value = '') => `${value || ''}`.replace(/[^\dA-Za-z]/g, '').trim().toUpperCase();

const extractBankAccountNumberFromQrSource = (value = '') => {
  const raw = `${value || ''}`.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const queryAccount = parsed.searchParams.get('acc')
      || parsed.searchParams.get('account')
      || parsed.searchParams.get('accountNumber')
      || parsed.searchParams.get('bankAccount');
    if (queryAccount) return cleanBankAccountNumber(queryAccount);
    const legacyMatch = parsed.pathname.match(/\/image\/[^/]*?-([A-Za-z0-9]+)-[^/]*$/i);
    if (legacyMatch?.[1]) return cleanBankAccountNumber(legacyMatch[1]);
  } catch (error) {
    const queryMatch = raw.match(/[?&](?:acc|account|accountNumber|bankAccount)=([^&#]+)/i);
    if (queryMatch?.[1]) return cleanBankAccountNumber(decodeURIComponent(queryMatch[1]));
  }
  return '';
};

const extractBankCodeFromQrSource = (value = '') => {
  const raw = `${value || ''}`.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const queryBank = parsed.searchParams.get('bank')
      || parsed.searchParams.get('bankCode')
      || parsed.searchParams.get('bankBin')
      || parsed.searchParams.get('bin');
    if (queryBank) return `${queryBank}`.trim();
    const legacyMatch = parsed.pathname.match(/\/image\/([A-Za-z0-9]+)-[A-Za-z0-9]+-[^/]*$/i);
    if (legacyMatch?.[1]) return `${legacyMatch[1]}`.trim();
  } catch (error) {
    const queryMatch = raw.match(/[?&](?:bank|bankCode|bankBin|bin)=([^&#]+)/i);
    if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]).trim();
  }
  return '';
};

const normalizeBankCodeForQr = (value = '') => {
  const text = normalizeBankLabel(value);
  if (!text) return '';
  const bankBin = resolveVietQrBankBin(text);
  if (bankBin) return bankBin;
  return normalizeVietQrBankCode(text);
};

const resolveSepayReceivingProfile = async (appId, order = {}, data = {}, rawPayload = {}) => {
  const rawData = rawPayload?.data || {};
  const incomingProfile = data.receivingProfile || rawPayload?.receivingProfile || rawData.receivingProfile || {};
  let company = {};
  const companyId = `${order.companyId || data.companyId || rawData.companyId || ''}`.trim();
  if (companyId) {
    try {
      const companySnap = await db.collection(collectionPath(appId, 'companies')).doc(companyId).get();
      company = companySnap.exists ? (companySnap.data() || {}) : {};
    } catch (error) {
      console.warn('resolveSepayReceivingProfile failed to load company', error);
    }
  }

  const bankName = normalizeBankLabel(
    incomingProfile.receivingBankName
      || incomingProfile.bankName
      || incomingProfile.gateway
      || data.receivingBankName
      || data.gateway
      || data.bankName
      || rawData.receivingBankName
      || rawData.gateway
      || rawData.bankName
      || order.receivingBankName
      || order.paymentBankName
      || order.companyBankName
      || company.bankName
      || company.invoiceBankName
      || getEnv('SEPAY_BANK_NAME', 'BIDV')
  );
  const bankCode = normalizeBankLabel(
    incomingProfile.receivingBankCode
      || incomingProfile.bankCode
      || incomingProfile.bankId
      || incomingProfile.gateway
      || data.receivingBankCode
      || data.bankCode
      || data.gateway
      || rawData.receivingBankCode
      || rawData.bankCode
      || rawData.gateway
      || order.receivingBankCode
      || order.paymentBankCode
      || order.companyBankCode
      || company.bankId
      || company.invoiceBankId
      || company.bankCode
      || getEnv('SEPAY_BANK_CODE', bankName || 'BIDV')
  );
  const mainAccountNumber = cleanBankAccountNumber(
    incomingProfile.mainAccountNumber
      || incomingProfile.bankAccountNumber
      || company.bankAccountNumber
      || company.invoiceBankAccountNumber
      || company.accountNumber
      || getEnv('SEPAY_BANK_ACCOUNT', '')
  );
  const virtualAccountNumber = cleanBankAccountNumber(
    incomingProfile.virtualAccountNumber
      || incomingProfile.sepayVirtualAccountNumber
      || incomingProfile.sepayVaAccountNumber
      || incomingProfile.sepayVaNumber
      || incomingProfile.vaAccountNumber
      || incomingProfile.virtualBankAccountNumber
      || company.sepayVirtualAccountNumber
      || company.sepayVaAccountNumber
      || company.sepayVaNumber
      || company.sepayVirtualAccount
      || company.sepayReceivingAccountNumber
      || company.bankVirtualAccountNumber
      || company.virtualBankAccountNumber
      || company.vaAccountNumber
      || company.virtualAccountNumber
      || getEnv('SEPAY_VIRTUAL_ACCOUNT', '')
  );
  const incomingUseVirtualAccount = incomingProfile.useVirtualAccount
    ?? incomingProfile.sepayUseVirtualAccount
    ?? data.useVirtualAccount
    ?? data.sepayUseVirtualAccount
    ?? rawData.useVirtualAccount
    ?? rawData.sepayUseVirtualAccount;
  const shouldUseVirtualAccount = (
    incomingUseVirtualAccount === undefined
      ? company.sepayUseVirtualAccount !== false
      : incomingUseVirtualAccount !== false
  ) && Boolean(virtualAccountNumber);
  const incomingAccountNumber = cleanBankAccountNumber(
    incomingProfile.accountNumber
      || incomingProfile.receivingAccountNumber
      || incomingProfile.sepayReceivingAccountNumber
      || data.accountNumber
      || data.receivingAccountNumber
      || rawData.accountNumber
      || rawData.receivingAccountNumber
  );
  const orderStoredAccountNumber = cleanBankAccountNumber(
    order.receivingBankAccountNumber
      || order.paymentBankAccountNumber
      || order.companyBankAccountNumber
      || order.bankAccountNumber
  );
  const configuredAccountNumber = shouldUseVirtualAccount ? virtualAccountNumber : mainAccountNumber;
  const accountNumber = incomingAccountNumber || configuredAccountNumber || orderStoredAccountNumber || getEnv('SEPAY_BANK_ACCOUNT', '');
  const accountName = `${incomingProfile.accountName
    || incomingProfile.receivingAccountName
    || data.accountName
    || data.receivingAccountName
    || rawData.accountName
    || rawData.receivingAccountName
    || order.receivingBankAccountName
    || order.paymentBankAccountName
    || order.companyBankAccountName
    || order.bankAccountName
    || company.bankAccountName
    || company.invoiceBankAccountName
    || company.accountName
    || getEnv('SEPAY_BANK_ACCOUNT_NAME', '')}`.trim();

  return {
    bankName: bankName || bankCode || 'BIDV',
    bankCode: bankCode || bankName || 'BIDV',
    bankQrCode: normalizeBankCodeForQr(bankCode || bankName || 'BIDV'),
    accountNumber,
    accountName,
    mainAccountNumber,
    virtualAccountNumber,
    isVirtualAccount: Boolean(virtualAccountNumber && accountNumber === virtualAccountNumber)
  };
};

const buildSepayQrImageUrl = ({ receivingProfile = {}, amount = 0, description = '' }) => {
  const accountNumber = cleanBankAccountNumber(receivingProfile.accountNumber);
  const bankCode = normalizeBankCodeForQr(receivingProfile.bankQrCode || receivingProfile.bankCode || receivingProfile.bankName);
  if (!accountNumber || !bankCode) return '';
  const params = new URLSearchParams();
  params.set('acc', accountNumber);
  params.set('bank', bankCode);
  params.set('amount', `${parseMoney(amount)}`);
  params.set('des', `${description || ''}`.trim());
  params.set('template', 'compact');
  params.set('showinfo', 'true');
  params.set('fullacc', 'true');
  if (receivingProfile.accountName) params.set('holder', receivingProfile.accountName);
  return `https://vietqr.app/img?${params.toString()}`;
};

const VIETNAM_BANK_BINS = {
  BIDV: '970418',
  BID: '970418',
  VCB: '970436',
  VIETCOMBANK: '970436',
  ICB: '970415',
  CTG: '970415',
  VIETINBANK: '970415',
  VBA: '970405',
  AGRIBANK: '970405',
  TCB: '970407',
  TECHCOMBANK: '970407',
  MB: '970422',
  MBB: '970422',
  MBBANK: '970422',
  ACB: '970416',
  VPB: '970432',
  VPBANK: '970432',
  VIB: '970441',
  STB: '970403',
  SACOMBANK: '970403',
  TPB: '970423',
  TPBANK: '970423',
  HDB: '970437',
  HDBANK: '970437',
  SHB: '970443',
  MSB: '970426',
  EIB: '970431',
  EXIMBANK: '970431',
  OCB: '970448',
  LPB: '970449',
  LPBANK: '970449',
  LIENVIETPOSTBANK: '970449',
  SEAB: '970440',
  SEABANK: '970440',
  PVCB: '970412',
  PVCOMBANK: '970412',
  NAMABANK: '970428',
  NAB: '970428',
  BAB: '970409',
  BACABANK: '970409',
  ABB: '970425',
  ABBANK: '970425',
  VAB: '970427',
  VIETABANK: '970427',
  BVB: '970438',
  BAOVIETBANK: '970438',
  VIETBANK: '970433',
  VCCB: '970454',
  SGB: '970400',
  SAIGONBANK: '970400',
  KLB: '970452',
  KIENLONGBANK: '970452',
  NCB: '970419',
  PGB: '970430',
  PGBANK: '970430',
  OJB: '970414',
  OCEANBANK: '970414',
  GPB: '970408',
  GPBANK: '970408',
  CBB: '970444',
  CBBANK: '970444',
  COOPBANK: '970446',
  SCB: '970429',
  SHBVN: '970424',
  CIMB: '422589',
  UOB: '970458',
  HSBC: '458761',
  CAKE: '546034',
  TIMO: '963388'
};

const normalizeVietQrBankCode = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]/g, '')
  .trim()
  .toUpperCase();

const resolveVietQrBankBin = (bankValue = '') => {
  const normalized = normalizeVietQrBankCode(bankValue);
  if (/^\d{6}$/.test(normalized)) return normalized;
  if (VIETNAM_BANK_BINS[normalized]) return VIETNAM_BANK_BINS[normalized];
  const compact = normalized;
  const fuzzyMatches = [
    { bin: '970418', pattern: /BIDV|DAUTUVAPHATTRIEN|DAUTUPHATTRIEN|NHDTPT/ },
    { bin: '970403', pattern: /SACOMBANK|SAIGONTHUONGTIN|\bSTB\b/ },
    { bin: '970436', pattern: /VIETCOMBANK|NGOAITTHUONG|\bVCB\b/ },
    { bin: '970415', pattern: /VIETINBANK|CONGTHUONG|\bCTG\b|\bICB\b/ },
    { bin: '970405', pattern: /AGRIBANK|NONGNGHIEP|\bVBA\b/ },
    { bin: '970407', pattern: /TECHCOMBANK|\bTCB\b/ },
    { bin: '970422', pattern: /MBBANK|\bMBB\b|\bMB\b/ },
    { bin: '970416', pattern: /\bACB\b/ },
    { bin: '970432', pattern: /VPBANK|\bVPB\b/ },
    { bin: '970441', pattern: /\bVIB\b/ },
    { bin: '970426', pattern: /\bMSB\b/ }
  ];
  return fuzzyMatches.find(item => item.pattern.test(compact))?.bin || '';
};

const buildEmvField = (id = '', value = '') => {
  const safeValue = `${value || ''}`;
  if (!id || !safeValue) return '';
  return `${id}${String(safeValue.length).padStart(2, '0')}${safeValue}`;
};

const crc16CcittFalse = (value = '') => {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const sanitizeVietQrText = (value = '', maxLength = 80) => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\w\s.-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const buildSepayQrPayload = ({ receivingProfile = {}, amount = 0, description = '' }) => {
  const accountNumber = cleanBankAccountNumber(receivingProfile.accountNumber);
  const bankBin = resolveVietQrBankBin(receivingProfile.bankQrCode || receivingProfile.bankCode || receivingProfile.bankName);
  if (!accountNumber || !bankBin) return '';
  const amountValue = Math.max(0, Math.round(parseMoney(amount)));
  const consumerAccount = buildEmvField('00', bankBin) + buildEmvField('01', accountNumber);
  const merchantAccountInfo = buildEmvField('00', 'A000000727')
    + buildEmvField('01', consumerAccount)
    + buildEmvField('02', 'QRIBFTTA');
  const additionalData = buildEmvField('08', sanitizeVietQrText(description, 50));
  const accountNameField = buildEmvField('59', sanitizeVietQrText(receivingProfile.accountName, 25));
  const payloadWithoutCrc = [
    buildEmvField('00', '01'),
    buildEmvField('01', '12'),
    buildEmvField('38', merchantAccountInfo),
    buildEmvField('53', '704'),
    amountValue > 0 ? buildEmvField('54', `${amountValue}`) : '',
    buildEmvField('58', 'VN'),
    accountNameField,
    additionalData ? buildEmvField('62', additionalData) : '',
    '6304'
  ].filter(Boolean).join('');
  return `${payloadWithoutCrc}${crc16CcittFalse(payloadWithoutCrc)}`;
};

const isAllowedQrProxyUrl = (value = '') => {
  try {
    const parsed = new URL(`${value || ''}`.trim());
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    const isVietQrHost = host === 'vietqr.app' || host.endsWith('.vietqr.app') || host === 'img.vietqr.io' || host.endsWith('.vietqr.io');
    const isQrServerHost = host === 'api.qrserver.com';
    if (!isVietQrHost && !isQrServerHost) return false;
    if (isQrServerHost) return /^\/v1\/create-qr-code\//i.test(parsed.pathname);
    return parsed.pathname === '/img' || /^\/img\//i.test(parsed.pathname) || /\.(png|jpe?g|webp|gif)$/i.test(parsed.pathname);
  } catch (error) {
    return false;
  }
};

exports.sepayQrImageProxy = functions.https.onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { success: false, message: 'Chi ho tro GET hoac POST.' });
  }

  const rawUrl = `${req.query?.url || req.body?.url || ''}`.trim();
  if (!rawUrl || !isAllowedQrProxyUrl(rawUrl)) {
    return sendJson(res, 400, { success: false, message: 'Duong dan QR khong hop le.' });
  }

  try {
    const qrResponse = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'HD-Manager-QR-Proxy/1.0'
      }
    });
    if (!qrResponse.ok) {
      return sendJson(res, 502, { success: false, message: 'Khong tai duoc anh QR tu nha cung cap.' });
    }
    const contentType = `${qrResponse.headers.get('content-type') || 'image/png'}`.split(';')[0].trim();
    if (!/^image\//i.test(contentType)) {
      return sendJson(res, 502, { success: false, message: 'Du lieu QR tra ve khong phai anh.' });
    }
    const arrayBuffer = await qrResponse.arrayBuffer();
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return sendJson(res, 413, { success: false, message: 'Anh QR qua lon.' });
    }
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('sepayQrImageProxy failed', error);
    return sendJson(res, 502, { success: false, message: 'Khong tai duoc anh QR SePay.' });
  }
});

const normalizeAppId = (appId = '') => `${appId || getEnv('HD_MANAGER_APP_ID', DEFAULT_APP_ID)}`.trim() || DEFAULT_APP_ID;

const getBearerToken = (req = {}) => {
  const authHeader = `${req.headers?.authorization || ''}`;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
};

const createRequestError = (decision = {}) => Object.assign(
  new Error(decision.message || 'Yeu cau khong duoc phep.'),
  {
    statusCode: Number(decision.statusCode || 403),
    code: decision.code || 'request_denied'
  }
);

const verifyTenantIdentityRequest = async (req, appId) => {
  const idToken = getBearerToken(req);
  if (!idToken) {
    throw createRequestError({
      statusCode: 401,
      code: 'missing_firebase_token',
      message: 'Thieu token dang nhap Firebase.'
    });
  }
  const claims = await admin.auth().verifyIdToken(idToken, true);
  const decision = authorizeTenantRequest({
    claims,
    appId,
    allowedAppId: normalizeAppId()
  });
  if (!decision.allowed) throw createRequestError(decision);
  return claims;
};

const verifyTenantOrderRequest = ({ claims, appId, order }) => {
  const decision = authorizeTenantOrderAccess({
    claims,
    appId,
    allowedAppId: normalizeAppId(),
    order
  });
  if (!decision.allowed) throw createRequestError(decision);
  return decision;
};

const sendProtectedEndpointError = (res, error, fallbackMessage) => {
  const statusCode = Number(error?.statusCode || 500);
  return sendJson(res, statusCode, {
    success: false,
    code: error?.code || (statusCode >= 500 ? 'internal_error' : 'request_denied'),
    message: statusCode >= 500 ? fallbackMessage : (error?.message || 'Yeu cau khong duoc phep.')
  });
};

// Identity data lives outside the public app collections. Only Cloud Functions
// can read password hashes, device secrets, recovery tokens and audit records.
const identityCenter = createIdentityCenter({
  db,
  admin,
  getAppId: normalizeAppId
});

const runIdentityRequest = (operation) => async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });
  try {
    const result = await operation(req);
    return sendJson(res, result?.statusCode || 200, result);
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    if (statusCode >= 500) console.error('identityApi failed', error);
    return sendJson(res, statusCode, {
      success: false,
      message: statusCode >= 500
        ? 'Khong the xu ly yeu cau xac thuc.'
        : (error?.message || 'Khong the xu ly yeu cau xac thuc.')
    });
  }
};

exports.identityLogin = functions.https.onRequest(runIdentityRequest((req) => identityCenter.login({
  identifier: req.body?.identifier,
  password: req.body?.password,
  device: req.body?.device,
  appId: req.body?.appId
})));

exports.identityRegisterCompany = functions.https.onRequest(runIdentityRequest((req) => identityCenter.registerCompany({
  companyName: req.body?.companyName,
  phone: req.body?.phone,
  password: req.body?.password,
  device: req.body?.device,
  appId: req.body?.appId,
  companySettings: req.body?.companySettings
})));

exports.identityCompleteSetup = functions.https.onRequest(runIdentityRequest((req) => identityCenter.completeSetup({
  authorization: req.headers.authorization,
  device: req.body?.device,
  password: req.body?.password,
  username: req.body?.username,
  pin: req.body?.pin,
  biometricEnabled: req.body?.biometricEnabled,
  trustDevice: req.body?.trustDevice
})));

exports.identityRequestRecovery = functions.https.onRequest(runIdentityRequest((req) => identityCenter.requestRecovery({
  identifier: req.body?.identifier,
  device: req.body?.device,
  deviceSecret: req.body?.deviceSecret,
  pin: req.body?.pin,
  biometricProof: Boolean(req.body?.biometricProof)
})));

exports.identityCompleteRecovery = functions.https.onRequest(runIdentityRequest((req) => identityCenter.completeRecovery({
  resetToken: req.body?.resetToken,
  password: req.body?.password,
  device: req.body?.device,
  identifier: req.body?.identifier
})));

exports.identityOwnerResetPassword = functions.https.onRequest(runIdentityRequest((req) => identityCenter.ownerResetEmployeePassword({
  authorization: req.headers.authorization,
  employeeId: req.body?.employeeId,
  appId: req.body?.appId,
  approvalRequestId: req.body?.approvalRequestId
})));

exports.identityRequestOwnerReset = functions.https.onRequest(runIdentityRequest((req) => identityCenter.requestOwnerPasswordReset({
  identifier: req.body?.identifier,
  appId: req.body?.appId
})));

exports.identityApproveOwnerReset = functions.https.onRequest(runIdentityRequest((req) => identityCenter.approveOwnerPasswordReset({
  authorization: req.headers.authorization,
  requestId: req.body?.requestId,
  appId: req.body?.appId
})));

exports.identityVerifyPin = functions.https.onRequest(runIdentityRequest((req) => identityCenter.verifyPin({
  authorization: req.headers.authorization,
  pin: req.body?.pin
})));

exports.identityDevices = functions.https.onRequest(runIdentityRequest((req) => identityCenter.listDevices({
  authorization: req.headers.authorization
})));

exports.identityRevokeDevices = functions.https.onRequest(runIdentityRequest((req) => identityCenter.revokeDevices({
  authorization: req.headers.authorization,
  deviceId: req.body?.deviceId,
  all: Boolean(req.body?.all)
})));

exports.identityLogout = functions.https.onRequest(runIdentityRequest((req) => identityCenter.logout({
  authorization: req.headers.authorization,
  device: req.body?.device
})));

exports.identityAudit = functions.https.onRequest(runIdentityRequest((req) => identityCenter.listAudit({
  authorization: req.headers.authorization
})));

exports.identityDeleteAccount = functions.https.onRequest(runIdentityRequest((req) => identityCenter.deleteAccount({
  authorization: req.headers.authorization,
  currentPassword: req.body?.currentPassword,
  confirmation: req.body?.confirmation
})));

const normalizeTransferCode = (value = '') => `${value ?? ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');

const getOrderPaymentDisplayCode = (order = {}) => (
  order.paymentCode
  || order.matchedOrderCode
  || order.orderCode
  || order.code
  || order.invoiceCode
  || formatOrderCode(order.id)
);

const stripTransferMemoPrefix = (value = '') => `${value || ''}`.replace(/^TT\s*/i, '').trim();

const getOrderInvoiceCode = (order = {}) => {
  const rawCodes = [
    order.invoiceCode,
    order.orderCode,
    order.code,
    order.matchedOrderCode,
    order.paymentCode
  ].filter(Boolean);

  for (const rawCode of rawCodes) {
    const normalized = normalizeTransferCode(stripTransferMemoPrefix(rawCode));
    if (/^HD[A-Z0-9]{4,20}$/.test(normalized)) return normalized;
  }

  return formatOrderCode(order.id);
};

const buildOrderTransferMemo = (order = {}) => {
  const invoiceCode = getOrderInvoiceCode(order);
  return invoiceCode ? `TT ${invoiceCode}` : '';
};

const getPaymentDescriptionCandidates = (data = {}, rawPayload = {}) => {
  const rawData = rawPayload?.data || {};
  const paymentLink = rawPayload?.paymentLink || rawData?.paymentLink || {};
  const latestTransaction = rawPayload?.latestTransaction || rawData?.latestTransaction || {};
  const transactions = Array.isArray(paymentLink?.transactions) ? paymentLink.transactions : [];
  const latestLinkedTransaction = transactions
    .slice()
    .sort((a, b) => `${b?.transactionDateTime || b?.transactionDate || b?.createdAt || ''}`.localeCompare(`${a?.transactionDateTime || a?.transactionDate || a?.createdAt || ''}`))[0] || {};

  return [
    data.description,
    data.desc,
    data.content,
    data.bankContent,
    data.transferContent,
    data.transferMemo,
    data.orderInfo,
    data.reference,
    data.referenceCode,
    data.code,
    data.subAccount,
    rawData.description,
    rawData.desc,
    rawData.content,
    rawData.bankContent,
    rawData.transferContent,
    rawData.transferMemo,
    rawData.orderInfo,
    rawData.reference,
    rawData.referenceCode,
    rawData.code,
    rawData.subAccount,
    latestTransaction.description,
    latestTransaction.content,
    latestTransaction.bankContent,
    latestTransaction.transferContent,
    latestTransaction.reference,
    latestLinkedTransaction.description,
    latestLinkedTransaction.content,
    latestLinkedTransaction.bankContent,
    latestLinkedTransaction.transferContent,
    latestLinkedTransaction.reference,
    paymentLink.description
  ].map(value => `${value || ''}`.trim()).filter(Boolean);
};

const resolvePaymentDescription = (data = {}, rawPayload = {}) => getPaymentDescriptionCandidates(data, rawPayload)[0] || '';

const extractTransferCodeTokens = (description = '') => {
  const raw = `${description || ''}`.toUpperCase();
  const normalized = normalizeTransferCode(raw);
  const wordTokens = raw.split(/[^A-Z0-9]+/).map(normalizeTransferCode).filter(token => token.length >= 5);
  const boundaryHdTokens = Array.from(raw.matchAll(/(?:^|[^A-Z0-9])(?:TT\s*)?(HD[A-Z0-9]{4,20})(?=$|[^A-Z0-9])/g))
    .map(match => normalizeTransferCode(match[1]))
    .filter(Boolean);
  const separatedTtHdTokens = [];
  for (let index = 0; index < wordTokens.length - 1; index += 1) {
    if (wordTokens[index] === 'TT' && /^HD[A-Z0-9]{4,20}$/.test(wordTokens[index + 1])) {
      separatedTtHdTokens.push(wordTokens[index + 1]);
    }
  }
  const hdTokens = [...boundaryHdTokens, ...separatedTtHdTokens];
  const ttHdTokens = normalized.match(/TTHD[A-Z0-9]{4,20}/g) || [];
  const strippedTokens = wordTokens
    .map(token => token.replace(/^TT/, ''))
    .filter(token => token.length >= 5);
  const transferMemoTokens = [...hdTokens, ...ttHdTokens.map(token => token.replace(/^TT/, ''))]
    .flatMap(token => [token, `TT${token}`]);
  return [...new Set([...wordTokens, ...hdTokens, ...ttHdTokens, ...strippedTokens, ...transferMemoTokens].filter(Boolean))];
};

const extractInvoiceCodeTokens = (...values) => {
  const flattenedValues = values.flat(Infinity);
  const tokens = flattenedValues.flatMap((value) => {
    const raw = `${value || ''}`.toUpperCase();
    const wordTokens = raw.split(/[^A-Z0-9]+/).map(normalizeTransferCode).filter(Boolean);
    const found = [];

    for (let index = 0; index < wordTokens.length; index += 1) {
      const token = wordTokens[index];
      const strippedToken = token.replace(/^TT/, '');
      if (/^HD[A-Z0-9]{4,20}$/.test(strippedToken)) found.push(strippedToken);
      if (token === 'TT' && /^HD[A-Z0-9]{4,20}$/.test(wordTokens[index + 1] || '')) {
        found.push(wordTokens[index + 1]);
      }
    }

    for (const match of raw.matchAll(/(?:^|[^A-Z0-9])(?:TT\s*)?(HD[A-Z0-9]{4,20})(?=$|[^A-Z0-9])/g)) {
      found.push(normalizeTransferCode(match[1]));
    }

    return found;
  });
  return [...new Set(tokens.map(normalizeTransferCode).filter(token => /^HD[A-Z0-9]{4,20}$/.test(token)))];
};

const getOrderCodeCandidates = (order = {}, expectedOrderCode = '') => {
  const rawCodes = [
    expectedOrderCode,
    order.paymentCode,
    order.matchedOrderCode,
    order.orderCode,
    order.code,
    order.invoiceCode,
    order.sepayPaymentCode,
    order.sepayOrderCode,
    order.paymentOrderCode,
    order.payosOrderCode,
    order.paymentCode,
    formatOrderCode(order.id),
    order.id
  ].filter(Boolean);

  return [...new Set(rawCodes.flatMap((code) => {
    const text = `${code}`.trim();
    const withoutTransferPrefix = text.replace(/^TT\s+/i, '').trim();
    return [text, withoutTransferPrefix];
  }).map(normalizeTransferCode).filter(Boolean))];
};

const isPayosPaymentMatchedToOrder = ({ order = {}, data = {}, description = '', expectedOrderCode = '', paymentLinkId = '', payosOrderCode = '' }) => {
  const normalizedDescription = normalizeTransferCode(description);
  const orderCodeCandidates = getOrderCodeCandidates(order, expectedOrderCode);
  const descriptionMatches = Boolean(
    normalizedDescription && orderCodeCandidates.some((code) => normalizedDescription.includes(code))
  );

  const incomingOrderCode = Number(data.orderCode || data.payosOrderCode || payosOrderCode || 0);
  const orderPayosCode = Number(order.payosOrderCode || order.paymentOrderCode || 0);
  const payosOrderCodeMatches = Number.isFinite(incomingOrderCode) && incomingOrderCode > 0
    && Number.isFinite(orderPayosCode) && orderPayosCode > 0
    && incomingOrderCode === orderPayosCode;

  const incomingPaymentLinkId = `${data.paymentLinkId || data.id || paymentLinkId || ''}`.trim();
  const orderPaymentLinkId = `${order.paymentLinkId || ''}`.trim();
  const paymentLinkMatches = Boolean(incomingPaymentLinkId && orderPaymentLinkId && incomingPaymentLinkId === orderPaymentLinkId);

  return descriptionMatches || payosOrderCodeMatches || paymentLinkMatches;
};

const collectionPath = (appId, name) => `artifacts/${normalizeAppId(appId)}/public/data/${name}`;

const requireCustomerIdentity = (claims = {}) => {
  if (claims.accountType !== 'customer' || !claims.customerId || !claims.appUserId) {
    throw createRequestError({
      statusCode: 403,
      code: 'customer_identity_required',
      message: 'Chi tai khoan khach hang moi duoc phep thuc hien thao tac nay.'
    });
  }
  return {
    companyId: `${claims.companyId || ''}`,
    customerId: `${claims.customerId || ''}`,
    appUserId: `${claims.appUserId || ''}`,
    identityId: `${claims.identityId || ''}`
  };
};

const runProtectedCustomerRequest = (operation, fallbackMessage) => async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });
  try {
    const appId = normalizeAppId(req.body?.appId);
    const claims = await verifyTenantIdentityRequest(req, appId);
    const customerIdentity = requireCustomerIdentity(claims);
    const result = await operation({ req, appId, claims, customerIdentity });
    res.set('Cache-Control', 'private, no-store, max-age=0');
    return sendJson(res, result?.statusCode || 200, result);
  } catch (error) {
    if (Number(error?.statusCode || 500) >= 500) {
      console.error('protectedCustomerApi failed', {
        code: error?.code || 'internal_error',
        message: error?.message || String(error)
      });
    }
    return sendProtectedEndpointError(res, error, fallbackMessage);
  }
};

const loadTenantCatalog = async ({ appId, companyId, collectionName, sanitizer }) => {
  const snapshot = await db.collection(collectionPath(appId, collectionName))
    .where('companyId', '==', companyId)
    .get();
  return snapshot.docs.map(snapshotDoc => sanitizer(snapshotDoc.data(), snapshotDoc.id));
};

exports.customerPortalBootstrap = functions.https.onRequest(runProtectedCustomerRequest(async ({
  appId,
  customerIdentity
}) => {
  const { companyId, customerId, appUserId } = customerIdentity;
  const companyRef = db.doc(`${collectionPath(appId, 'companies')}/${companyId}`);
  const customerRef = db.doc(`${collectionPath(appId, 'customers')}/${customerId}`);
  const accountRef = db.doc(`${collectionPath(appId, 'customer_accounts')}/${appUserId}`);
  const [companySnapshot, customerSnapshot, accountSnapshot, products, rewardCatalog, promotions] = await Promise.all([
    companyRef.get(),
    customerRef.get(),
    accountRef.get(),
    loadTenantCatalog({ appId, companyId, collectionName: 'products', sanitizer: sanitizeProductForCustomer }),
    loadTenantCatalog({ appId, companyId, collectionName: 'reward_catalog', sanitizer: sanitizeRewardForCustomer }),
    loadTenantCatalog({ appId, companyId, collectionName: 'promotions', sanitizer: sanitizePromotionForCustomer })
  ]);

  if (!companySnapshot.exists || !customerSnapshot.exists) {
    throw createRequestError({
      statusCode: 404,
      code: 'customer_portal_profile_missing',
      message: 'Khong tim thay ho so cong ty hoac khach hang.'
    });
  }
  const customerData = customerSnapshot.data() || {};
  if (`${customerData.companyId || ''}` !== companyId) {
    throw createRequestError({
      statusCode: 403,
      code: 'customer_company_mismatch',
      message: 'Ho so khach hang khong thuoc cong ty dang dang nhap.'
    });
  }

  return {
    success: true,
    company: sanitizeCompanyForCustomer(companySnapshot.data(), companySnapshot.id),
    customer: sanitizeCustomerProfileForClient(customerData, customerSnapshot.id),
    customerAccount: accountSnapshot.exists
      ? sanitizeCustomerAccountForClient(accountSnapshot.data(), accountSnapshot.id)
      : null,
    products,
    rewardCatalog,
    promotions
  };
}, 'Khong the tai du lieu cong khai cho tai khoan khach hang.'));

const AI_RATE_LIMIT_PER_MINUTE = 24;

const enforceAiRateLimit = async (identityId = '') => {
  const now = new Date();
  const windowKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
  const rateLimitId = buildAiRateLimitId({ identityId });
  const rateLimitRef = db.collection('identity_api_rate_limits').doc(`ai_${rateLimitId}`);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(rateLimitRef);
    const previousWindowKey = `${snapshot.data()?.windowKey || ''}`;
    const count = previousWindowKey === windowKey ? Number(snapshot.data()?.count || 0) : 0;
    if (count >= AI_RATE_LIMIT_PER_MINUTE) {
      throw createRequestError({
        statusCode: 429,
        code: 'ai_rate_limited',
        message: 'AI dang nhan qua nhieu yeu cau. Vui long thu lai sau mot phut.'
      });
    }
    transaction.set(rateLimitRef, {
      identityIdHash: hashAuditValue(identityId),
      count: count + 1,
      windowKey,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + (10 * 60 * 1000))
    }, { merge: true });
  });
};

exports.geminiGenerateContent = functions.https.onRequest({
  timeoutSeconds: 60,
  memory: '1GiB'
}, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });
  try {
    assertAiRequestSize(req);
    const appId = normalizeAppId(req.body?.appId);
    const claims = await verifyTenantIdentityRequest(req, appId);
    if (claims.accountType !== 'employee') {
      throw createRequestError({
        statusCode: 403,
        code: 'employee_identity_required',
        message: 'Tai khoan khong co quyen su dung AI noi bo.'
      });
    }
    await enforceAiRateLimit(`${claims.identityId || claims.uid || ''}`);
    const apiKey = `${getEnv('GEMINI_API_KEY') || ''}`.trim();
    if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY is not configured.'), { code: 'ai_not_configured' });
    const payload = sanitizeGeminiRequestPayload(req.body?.request || {});
    const model = `${getEnv('GEMINI_MODEL', 'gemini-2.5-flash')}`.trim() || 'gemini-2.5-flash';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const responseText = await upstreamResponse.text();
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.status(upstreamResponse.status).set('Content-Type', 'application/json; charset=utf-8').send(responseText || '{}');
  } catch (error) {
    const statusCode = error?.name === 'AbortError' ? 504 : Number(error?.statusCode || 500);
    if (statusCode >= 500) {
      console.error('geminiGenerateContent failed', {
        code: error?.code || 'internal_error',
        message: error?.message || String(error)
      });
    }
    return sendJson(res, statusCode, {
      success: false,
      error: {
        code: error?.code || (statusCode >= 500 ? 'ai_gateway_error' : 'invalid_ai_request'),
        message: statusCode >= 500
          ? 'Khong the xu ly yeu cau AI luc nay.'
          : (error?.message || 'Yeu cau AI khong hop le.')
      }
    });
  }
});

const resolveCustomerPointsRef = async ({ appId, companyId, customerId }) => {
  const pointsCollection = db.collection(collectionPath(appId, 'customer_points'));
  const deterministicRef = pointsCollection.doc(`customer_points_${customerId}`);
  const deterministicSnapshot = await deterministicRef.get();
  if (deterministicSnapshot.exists) return deterministicRef;

  const byCustomerId = await pointsCollection
    .where('companyId', '==', companyId)
    .where('customerId', '==', customerId)
    .limit(1)
    .get();
  if (!byCustomerId.empty) return byCustomerId.docs[0].ref;

  const byLegacyCustomerId = await pointsCollection
    .where('companyId', '==', companyId)
    .where('customer_id', '==', customerId)
    .limit(1)
    .get();
  return byLegacyCustomerId.empty ? deterministicRef : byLegacyCustomerId.docs[0].ref;
};

exports.customerRedeemPoints = functions.https.onRequest(runProtectedCustomerRequest(async ({
  req,
  appId,
  customerIdentity
}) => {
  const { companyId, customerId, identityId } = customerIdentity;
  const requestedCustomerId = `${req.body?.customerId || customerId}`.trim();
  if (requestedCustomerId !== customerId) {
    throw createRequestError({
      statusCode: 403,
      code: 'customer_scope_mismatch',
      message: 'Khong duoc dung diem cho tai khoan khach hang khac.'
    });
  }
  const requestId = normalizeRequestId(req.body?.requestId);
  const paymentId = buildPointRedemptionId({ customerId, requestId });
  if (!requestId || !paymentId) {
    throw createRequestError({
      statusCode: 400,
      code: 'invalid_idempotency_key',
      message: 'Yeu cau dung diem thieu ma chong trung lap hop le.'
    });
  }

  const companyRef = db.doc(`${collectionPath(appId, 'companies')}/${companyId}`);
  const customerRef = db.doc(`${collectionPath(appId, 'customers')}/${customerId}`);
  const paymentRef = db.doc(`${collectionPath(appId, 'payments')}/${paymentId}`);
  const auditRef = db.doc(`${collectionPath(appId, 'activityLogs')}/point_redeem_${paymentId}`);
  const pointsRef = await resolveCustomerPointsRef({ appId, companyId, customerId });
  const ordersQuery = db.collection(collectionPath(appId, 'orders'))
    .where('companyId', '==', companyId)
    .where('customerId', '==', customerId);
  const paymentsQuery = db.collection(collectionPath(appId, 'payments'))
    .where('companyId', '==', companyId)
    .where('customerId', '==', customerId);

  const result = await db.runTransaction(async (transaction) => {
    const [companySnapshot, customerSnapshot, pointsSnapshot, paymentSnapshot, orderSnapshots, paymentSnapshots] = await Promise.all([
      transaction.get(companyRef),
      transaction.get(customerRef),
      transaction.get(pointsRef),
      transaction.get(paymentRef),
      transaction.get(ordersQuery),
      transaction.get(paymentsQuery)
    ]);

    if (paymentSnapshot.exists) {
      return {
        duplicate: true,
        payment: cloneJsonSafe({ id: paymentSnapshot.id, ...paymentSnapshot.data() }),
        pointsRecord: pointsSnapshot.exists
          ? cloneJsonSafe({ id: pointsSnapshot.id, ...pointsSnapshot.data() })
          : null
      };
    }
    if (!companySnapshot.exists || !customerSnapshot.exists) {
      throw createRequestError({
        statusCode: 404,
        code: 'customer_redemption_profile_missing',
        message: 'Khong tim thay ho so de doi diem.'
      });
    }
    const company = companySnapshot.data() || {};
    const customer = customerSnapshot.data() || {};
    if (`${customer.companyId || ''}` !== companyId) {
      throw createRequestError({
        statusCode: 403,
        code: 'customer_company_mismatch',
        message: 'Ho so khach hang khong thuoc cong ty dang dang nhap.'
      });
    }
    const loyaltyOverride = customer.customerLoyaltyEnabledOverride ?? customer.loyaltyEnabledOverride ?? null;
    const loyaltyEnabled = loyaltyOverride === true || loyaltyOverride === 'enabled' || loyaltyOverride === 'true'
      ? true
      : (loyaltyOverride === false || loyaltyOverride === 'disabled' || loyaltyOverride === 'false'
        ? false
        : company.customerLoyaltyEnabled === true);
    if (!loyaltyEnabled) {
      throw createRequestError({
        statusCode: 409,
        code: 'loyalty_redemption_disabled',
        message: 'Cong ty chua bat chuc nang dung diem.'
      });
    }

    const orders = orderSnapshots.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
    const payments = paymentSnapshots.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
    const outstandingDebt = calculateCustomerOutstandingDebt({ customer, orders, payments });
    const currentPoints = pointsSnapshot.exists ? pointsSnapshot.data() : {};
    const redemption = calculatePointRedemption({
      pointsRecord: currentPoints,
      company,
      requestedPoints: req.body?.pointsToUse,
      requestedAmount: req.body?.amount,
      outstandingDebt
    });
    if (!redemption.valid) {
      throw createRequestError({
        statusCode: 409,
        code: 'invalid_point_redemption',
        message: outstandingDebt <= 0
          ? 'Khach hang khong con cong no de tru diem.'
          : 'So diem hoac so tien quy doi khong hop le.'
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const customerName = `${customer.name || ''}`.trim();
    const historySource = Array.isArray(currentPoints.history)
      ? currentPoints.history
      : (Array.isArray(currentPoints.pointHistory) ? currentPoints.pointHistory : []);
    const historyEntry = {
      id: `redeem_${requestId}`,
      operationId: paymentId,
      type: 'redeem_debt',
      label: 'Dung diem tru cong no',
      points: -redemption.pointsToUse,
      amount: redemption.amount,
      pointValue: redemption.pointValue,
      balance: redemption.nextAvailablePoints,
      date: getVietnamDateKey(now),
      createdAt: nowIso
    };
    const nextPointsPayload = {
      id: pointsRef.id,
      companyId,
      customerId,
      customer_id: customerId,
      available_points: redemption.nextAvailablePoints,
      availablePoints: redemption.nextAvailablePoints,
      total_points: redemption.nextAvailablePoints,
      totalPoints: redemption.nextAvailablePoints,
      used_points: redemption.nextUsedPoints,
      usedPoints: redemption.nextUsedPoints,
      pointValue: redemption.pointValue,
      redeem_value: redemption.nextAvailablePoints * redemption.pointValue,
      redeemValue: redemption.nextAvailablePoints * redemption.pointValue,
      lastRedeemedAt: nowIso,
      lastRedeemedPoints: redemption.pointsToUse,
      lastRedeemedAmount: redemption.amount,
      lastRedemptionOperationId: paymentId,
      history: [...historySource, historyEntry].slice(-120),
      updatedAt: nowIso,
      updatedBy: identityId,
      isArchived: false
    };
    const paymentPayload = {
      id: paymentId,
      operationId: paymentId,
      requestId,
      companyId,
      customerId,
      customerName,
      amount: redemption.amount,
      totalAmount: redemption.amount,
      paymentAmount: redemption.amount,
      actualAmount: redemption.amount,
      method: 'Diem thuong',
      paymentMethod: 'Diem thuong',
      type: 'Thu no',
      category: 'Thu no',
      direction: 'income',
      sourceType: 'loyalty_points_redeem',
      sourceLabel: 'Dung diem tru no',
      note: `Dung ${redemption.pointsToUse} diem tru cong no`,
      bankContent: `Diem thuong ${customerId}`,
      date: getVietnamDateKey(now),
      empId: identityId,
      collectorName: customerName || 'Khach hang',
      requiresApproval: false,
      approvalStatus: 'approved',
      handoverStatus: 'confirmed',
      status: 'confirmed',
      confirmedAt: nowIso,
      confirmedBy: identityId,
      pointsRedeemed: redemption.pointsToUse,
      pointValue: redemption.pointValue,
      isArchived: false,
      createdAt: nowIso
    };

    transaction.set(pointsRef, nextPointsPayload, { merge: true });
    transaction.create(paymentRef, paymentPayload);
    transaction.create(auditRef, {
      id: auditRef.id,
      companyId,
      customerId,
      identityId,
      type: 'customer_points_redeemed',
      operationId: paymentId,
      requestFingerprint: hashAuditValue(`${customerId}:${requestId}`),
      pointsRedeemed: redemption.pointsToUse,
      amount: redemption.amount,
      createdAt: nowIso
    });
    return {
      duplicate: false,
      payment: paymentPayload,
      pointsRecord: { ...currentPoints, ...nextPointsPayload },
      redemption
    };
  });

  return {
    success: true,
    duplicate: result.duplicate,
    payment: result.payment,
    pointsRecord: result.pointsRecord,
    pointsRedeemed: result.payment?.pointsRedeemed || result.redemption?.pointsToUse || 0,
    amount: result.payment?.amount || result.redemption?.amount || 0
  };
}, 'Khong the doi diem luc nay. Vui long thu lai.'));

const PAYROLL_AUTO_LOCK_MAX_TRANSACTION_WRITES = 450;

const getPayrollRulesRuntimeVersion = () => `${getEnv('HD_MANAGER_PAYROLL_RULES_VERSION') || ''}`.trim();

const normalizePayrollEmployeeText = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isPayrollEmployeeIncluded = (employee = {}) => {
  if (!employee?.id || employee?.isArchived) return false;
  const role = normalizePayrollEmployeeText(employee?.role);
  const position = normalizePayrollEmployeeText(employee?.position);
  if (role === 'super admin' || role === 'super_admin') return false;
  return ![
    'owner',
    'company owner',
    'business owner',
    'chu doanh nghiep'
  ].includes(position) && ![
    'owner',
    'company owner',
    'business owner'
  ].includes(role);
};

const getPayrollAutoLockAppIds = () => [...new Set([
  DEFAULT_APP_ID,
  getEnv('HD_MANAGER_APP_ID'),
  ...parseCsvEnv('HD_MANAGER_PAYROLL_APP_IDS')
].map(normalizeAppId).filter(Boolean))];

const getSepayReconciliationAppIds = () => [...new Set([
  DEFAULT_APP_ID,
  getEnv('HD_MANAGER_APP_ID'),
  ...parseCsvEnv('HD_MANAGER_SEPAY_APP_IDS')
].map(normalizeAppId).filter(Boolean))];

const waitForPayrollPeriodCloseSecond = async (plan = {}) => {
  const clock = getVietnamClock();
  const monthEndDateKey = getPayrollMonthEndDateKey(plan?.monthKey);
  const [closeHour, closeMinute, closeSecond] = `${plan?.closingSchedule?.time || ''}`.split(':').map(Number);
  if (
    clock.dateKey !== monthEndDateKey
    || clock.hour !== closeHour
    || clock.minute !== closeMinute
    || clock.second >= closeSecond
  ) {
    return;
  }

  await new Promise(resolve => setTimeout(resolve, (closeSecond - clock.second) * 1000));
};

const createPayrollPeriodLockJournalEntry = ({
  companyId = '',
  periodId = '',
  monthKey = '',
  lockedAt = '',
  employeeCount = 0,
  totalEndingDebt = 0
} = {}) => {
  const safeDebt = Math.max(0, Math.round(Number(totalEndingDebt) || 0));
  return {
    id: `payroll_period_lock_${periodId}`,
    companyId,
    type: 'payroll_period_lock',
    action: 'payroll_period_locked',
    periodId,
    monthKey,
    amount: safeDebt,
    employeeCount: Math.max(0, Number(employeeCount) || 0),
    actorType: 'system',
    actorName: 'Hệ thống',
    message: safeDebt > 0
      ? `Đã khóa kỳ lương ${monthKey} và chuyển tổng dư nợ ${safeDebt} sang kỳ sau.`
      : `Đã khóa kỳ lương ${monthKey}; không có dư nợ cần chuyển sang kỳ sau.`,
    date: `${lockedAt || ''}`.slice(0, 10),
    createdAt: lockedAt,
    isArchived: false
  };
};

const evaluatePayrollAutoLockPlanEligibility = async ({ appId, planId }) => {
  const normalizedAppId = normalizeAppId(appId);
  const plansRef = db.collection(collectionPath(normalizedAppId, 'payrollAutoLockPlans'));
  const stagedSnapshotsRef = db.collection(collectionPath(normalizedAppId, 'payrollAutoLockPlanSnapshots'));
  const payrollPeriodsRef = db.collection(collectionPath(normalizedAppId, 'payrollPeriods'));
  const employeesRef = db.collection(collectionPath(normalizedAppId, 'employees'));
  const adjustmentsRef = db.collection(collectionPath(normalizedAppId, 'payrollAdjustments'));
  const planRef = plansRef.doc(planId);

  return db.runTransaction(async (transaction) => {
    const planSnapshot = await transaction.get(planRef);
    if (!planSnapshot.exists) return { state: 'missing_plan' };

    const plan = { id: planId, ...(planSnapshot.data() || {}) };
    const status = normalizePayrollAutoLockStatus(plan.status);
    if (plan.isArchived || [
      PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
      PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED
    ].includes(status)) {
      return { state: 'skipped', status };
    }

    const currentClock = getVietnamClock();
    if (!isPayrollAutoLockDue(plan.monthKey, currentClock, plan.autoLockAt)) {
      return { state: PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN, due: false };
    }

    if (status === PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN) {
      const closingAt = new Date().toISOString();
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING,
        closingStartedAt: closingAt,
        eligibilityState: PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING,
        eligibilityBlockers: [],
        updatedAt: closingAt
      }, { merge: true });
      return { state: PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, due: true };
    }

    if (![PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED].includes(status)) {
      return { state: 'skipped', status };
    }

    const companyId = `${plan.companyId || ''}`.trim();
    const periodId = `${plan.periodId || ''}`.trim();
    const stagedSnapshotIds = [...new Set((Array.isArray(plan.stagedSnapshotIds) ? plan.stagedSnapshotIds : [])
      .map(id => `${id || ''}`.trim())
      .filter(Boolean))];
    const periodRef = payrollPeriodsRef.doc(periodId);
    const periodSnapshot = await transaction.get(periodRef);
    if (periodSnapshot.exists && isLockedPayrollStatus(periodSnapshot.data()?.status)) {
      const reconciledAt = new Date().toISOString();
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED,
        lockedAt: periodSnapshot.data()?.lockedAt || reconciledAt,
        completedAt: reconciledAt,
        completionReason: 'period_already_locked'
      }, { merge: true });
      return { state: 'already_locked' };
    }

    const stagedDocumentSnapshots = stagedSnapshotIds.length > 0
      ? await transaction.getAll(...stagedSnapshotIds.map(id => stagedSnapshotsRef.doc(id)))
      : [];
    const employeeQuerySnapshot = companyId
      ? await transaction.get(employeesRef.where('companyId', '==', companyId))
      : null;
    const adjustmentQuerySnapshot = periodId
      ? await transaction.get(adjustmentsRef.where('periodId', '==', periodId))
      : null;
    const stagedSnapshots = stagedDocumentSnapshots
      .filter(snapshot => snapshot.exists)
      .map(snapshot => ({ id: snapshot.id, ...(snapshot.data() || {}) }));
    const activeEmployeeIds = (employeeQuerySnapshot?.docs || [])
      .map(snapshot => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
      .filter(isPayrollEmployeeIncluded)
      .map(employee => employee.id);
    const adjustments = (adjustmentQuerySnapshot?.docs || [])
      .map(snapshot => ({ id: snapshot.id, ...(snapshot.data() || {}) }));
    const inspection = inspectPayrollAutoLockCandidate({
      plan,
      stagedSnapshots,
      activeEmployeeIds,
      adjustments,
      runtimeRulesVersion: getPayrollRulesRuntimeVersion(),
      clock: currentClock
    });
    const checkedAt = new Date().toISOString();

    if (inspection.gateState === 'RULES_PENDING') {
      transaction.set(planRef, {
        lastEligibilityCheckAt: checkedAt,
        eligibilityState: PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING,
        gateState: 'RULES_PENDING',
        eligibilityBlockers: ['production_rules_not_confirmed']
      }, { merge: true });
      return { state: PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, gateState: 'RULES_PENDING' };
    }
    if (inspection.state === PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW) {
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        reviewReason: 'auto_lock_eligibility_failed',
        eligibilityState: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        eligibilityBlockers: inspection.blockers,
        incompleteSnapshotIds: [...new Set(inspection.snapshotIssues.map(issue => issue.split(':')[0]))],
        updatedAt: checkedAt
      }, { merge: true });
      return {
        state: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        blockers: inspection.blockers
      };
    }

    if (inspection.state === PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED) {
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED,
        eligibilityState: PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED,
        snapshotValidationDigest: inspection.digest,
        validatedEmployeeIds: [...activeEmployeeIds].sort(),
        snapshotValidatedAt: checkedAt,
        lastEligibilityCheckAt: checkedAt,
        gateState: '',
        eligibilityBlockers: [],
        updatedAt: checkedAt
      }, { merge: true });
      return {
        state: PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED,
        employeeCount: activeEmployeeIds.length,
        digest: inspection.digest
      };
    }

    const validationDigest = `${plan.snapshotValidationDigest || ''}`;
    if (inspection.state !== PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK
      || !validationDigest
      || validationDigest !== inspection.digest) {
      const blockers = [...inspection.blockers, validationDigest ? 'snapshot_validation.digest_changed' : 'snapshot_validation.digest_missing'];
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        reviewReason: 'snapshot_validation_changed',
        eligibilityState: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        eligibilityBlockers: [...new Set(blockers)],
        updatedAt: checkedAt
      }, { merge: true });
      return { state: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW, blockers };
    }

    transaction.set(planRef, {
      status: PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK,
      eligibilityState: PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK,
      readyForLockDigest: inspection.digest,
      readyForLockEmployeeIds: [...activeEmployeeIds].sort(),
      readyForLockAt: checkedAt,
      lastEligibilityCheckAt: checkedAt,
      gateState: '',
      eligibilityBlockers: [],
      updatedAt: checkedAt
    }, { merge: true });
    return {
      state: PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK,
      employeeCount: activeEmployeeIds.length,
      digest: inspection.digest
    };
  });
};

const finalizePayrollAutoLockPlan = async ({ appId, planId }) => {
  const normalizedAppId = normalizeAppId(appId);
  const plansRef = db.collection(collectionPath(normalizedAppId, 'payrollAutoLockPlans'));
  const stagedSnapshotsRef = db.collection(collectionPath(normalizedAppId, 'payrollAutoLockPlanSnapshots'));
  const payrollSnapshotsRef = db.collection(collectionPath(normalizedAppId, 'payrollSnapshots'));
  const carryoversRef = db.collection(collectionPath(normalizedAppId, 'payrollDebtCarryovers'));
  const activityLogsRef = db.collection(collectionPath(normalizedAppId, 'activityLogs'));
  const payrollPeriodsRef = db.collection(collectionPath(normalizedAppId, 'payrollPeriods'));
  const employeesRef = db.collection(collectionPath(normalizedAppId, 'employees'));
  const adjustmentsRef = db.collection(collectionPath(normalizedAppId, 'payrollAdjustments'));
  const planRef = plansRef.doc(planId);

  return db.runTransaction(async (transaction) => {
    const planSnapshot = await transaction.get(planRef);
    if (!planSnapshot.exists) return { state: 'missing_plan' };

    const plan = { id: planId, ...(planSnapshot.data() || {}) };
    const planStatus = normalizePayrollAutoLockStatus(plan.status);
    if (plan.isArchived || planStatus !== PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK) {
      return { state: 'skipped', status: planStatus };
    }

    const companyId = `${plan.companyId || ''}`.trim();
    const monthKey = `${plan.monthKey || ''}`.trim();
    const periodId = `${plan.periodId || ''}`.trim();
    const stagedSnapshotIds = [...new Set((Array.isArray(plan.stagedSnapshotIds) ? plan.stagedSnapshotIds : [])
      .map(id => `${id || ''}`.trim())
      .filter(Boolean))];
    if (!companyId || !monthKey || !periodId || stagedSnapshotIds.length === 0) {
      throw new Error(`Kế hoạch khóa lương ${planId} thiếu dữ liệu snapshot.`);
    }
    if (Number(plan.snapshotCount || 0) !== stagedSnapshotIds.length) {
      throw new Error(`Kế hoạch khóa lương ${planId} không khớp số lượng snapshot.`);
    }

    const periodRef = payrollPeriodsRef.doc(periodId);
    const periodSnapshot = await transaction.get(periodRef);
    if (periodSnapshot.exists && isLockedPayrollStatus(periodSnapshot.data()?.status)) {
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED,
        lockedAt: periodSnapshot.data()?.lockedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        completionReason: 'period_already_locked'
      }, { merge: true });
      return { state: 'already_locked' };
    }

    const stagedSnapshotRecords = await Promise.all(stagedSnapshotIds.map(async (stagedSnapshotId) => {
      const stagedSnapshot = await transaction.get(stagedSnapshotsRef.doc(stagedSnapshotId));
      if (!stagedSnapshot.exists) {
        throw new Error(`Thiếu snapshot đã chuẩn bị: ${stagedSnapshotId}.`);
      }
      const data = stagedSnapshot.data() || {};
      if (`${data.planId || ''}` !== planId) {
        throw new Error(`Snapshot ${stagedSnapshotId} không thuộc kế hoạch khóa lương này.`);
      }
      const stagedRecord = { id: stagedSnapshotId, ...data };
      const finalizedSnapshot = createFinalPayrollSnapshot(stagedRecord, 'final-validation');
      if (!finalizedSnapshot || finalizedSnapshot.companyId !== companyId || finalizedSnapshot.periodId !== periodId || finalizedSnapshot.monthKey !== monthKey) {
        throw new Error(`Snapshot ${stagedSnapshotId} không hợp lệ để khóa kỳ lương.`);
      }
      return stagedRecord;
    }));

    const employeeQuerySnapshot = await transaction.get(employeesRef.where('companyId', '==', companyId));
    const adjustmentQuerySnapshot = await transaction.get(adjustmentsRef.where('periodId', '==', periodId));
    const activeEmployeeIds = employeeQuerySnapshot.docs
      .map(snapshot => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
      .filter(isPayrollEmployeeIncluded)
      .map(employee => employee.id);
    const adjustments = adjustmentQuerySnapshot.docs
      .map(snapshot => ({ id: snapshot.id, ...(snapshot.data() || {}) }));
    const inspection = inspectPayrollAutoLockCandidate({
      plan,
      stagedSnapshots: stagedSnapshotRecords,
      activeEmployeeIds,
      adjustments,
      runtimeRulesVersion: getPayrollRulesRuntimeVersion(),
      clock: getVietnamClock()
    });
    const checkedAt = new Date().toISOString();
    if (inspection.gateState === 'RULES_PENDING') {
      return { state: PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, gateState: 'RULES_PENDING' };
    }
    if (inspection.state !== PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK
      || !inspection.digest
      || inspection.digest !== `${plan.readyForLockDigest || ''}`
      || inspection.digest !== `${plan.snapshotValidationDigest || ''}`) {
      const blockers = inspection.digest !== `${plan.readyForLockDigest || ''}`
        || inspection.digest !== `${plan.snapshotValidationDigest || ''}`
        ? [...inspection.blockers, 'ready_for_lock.digest_changed']
        : inspection.blockers;
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        reviewReason: 'auto_lock_final_validation_failed',
        eligibilityState: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        eligibilityBlockers: [...new Set(blockers)],
        updatedAt: checkedAt
      }, { merge: true });
      return { state: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW, blockers };
    }

    const lockedAt = new Date().toISOString();
    const finalSnapshots = stagedSnapshotRecords.map(snapshot => createFinalPayrollSnapshot(snapshot, lockedAt));
    const incompleteSnapshotIds = finalSnapshots
      .filter(snapshot => !isCompleteFinalPayrollSnapshot(snapshot))
      .map(snapshot => snapshot?.id || 'invalid_snapshot');
    if (incompleteSnapshotIds.length > 0) {
      transaction.set(planRef, {
        status: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        reviewReason: 'incomplete_snapshot',
        incompleteSnapshotIds,
        reviewedAt: null,
        updatedAt: lockedAt
      }, { merge: true });
      return {
        state: PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW,
        companyId,
        monthKey,
        incompleteSnapshotCount: incompleteSnapshotIds.length
      };
    }
    const debtArtifacts = finalSnapshots
      .map(snapshot => createDebtRolloverArtifacts({
        companyId,
        monthKey,
        snapshot,
        lockedAt
      }))
      .filter(Boolean);
    const totalEndingDebt = debtArtifacts.reduce((total, artifact) => total + (Number(artifact?.carryover?.amount) || 0), 0);
    const lockJournal = createPayrollPeriodLockJournalEntry({
      companyId,
      periodId,
      monthKey,
      lockedAt,
      employeeCount: finalSnapshots.length,
      totalEndingDebt
    });
    const transactionWriteCount = finalSnapshots.length + (debtArtifacts.length * 2) + 3;
    if (transactionWriteCount > PAYROLL_AUTO_LOCK_MAX_TRANSACTION_WRITES) {
      throw new Error(`Kỳ lương ${monthKey} vượt giới hạn ghi transaction an toàn.`);
    }

    const lockedPeriod = {
      ...(plan.period || {}),
      id: periodId,
      companyId,
      monthKey,
      status: 'LOCKED',
      rulesVersion: PAYROLL_RULES_VERSION,
      eligibilityDigest: inspection.digest,
      snapshotValidationDigest: inspection.digest,
      readyForLockDigest: inspection.digest,
      lockedAt,
      employeeCount: finalSnapshots.length,
      snapshotIds: finalSnapshots.map(snapshot => snapshot.id),
      debtRolloverStatus: 'complete',
      debtRolloverCompletedAt: lockedAt,
      debtCarryoverIds: debtArtifacts.map(artifact => artifact.carryover.id),
      debtTransferCount: debtArtifacts.length,
      totalEndingDebt,
      isArchived: false
    };

    finalSnapshots.forEach(snapshot => {
      transaction.set(payrollSnapshotsRef.doc(snapshot.id), snapshot, { merge: false });
    });
    debtArtifacts.forEach(({ carryover, journalEntry }) => {
      transaction.set(carryoversRef.doc(carryover.id), carryover, { merge: false });
      transaction.set(activityLogsRef.doc(journalEntry.id), journalEntry, { merge: false });
    });
    transaction.set(activityLogsRef.doc(lockJournal.id), lockJournal, { merge: false });
    transaction.set(periodRef, lockedPeriod, { merge: false });
    transaction.set(planRef, {
      status: PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED,
      lockedAt,
      completedAt: lockedAt,
      debtRolloverStatus: 'complete',
      debtTransferCount: debtArtifacts.length,
      totalEndingDebt
    }, { merge: true });

    return {
      state: PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED,
      companyId,
      monthKey,
      employeeCount: finalSnapshots.length,
      totalEndingDebt
    };
  });
};

exports.autoLockPayrollPeriods = onSchedule({
  schedule: 'every 1 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  region: 'asia-southeast1',
  timeoutSeconds: 120
}, async () => {
  const initialClock = getVietnamClock();
  const outcomes = [];

  for (const appId of getPayrollAutoLockAppIds()) {
    const planCollections = await Promise.all([
      PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN,
      PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING,
      PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED,
      PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK,
      'READY',
      'ready',
      'ELIGIBLE',
      'eligible'
    ].map(status => db.collection(collectionPath(appId, 'payrollAutoLockPlans'))
      .where('status', '==', status)
      .limit(100)
      .get()));
    const plansById = new Map(
      planCollections.flatMap(snapshot => snapshot.docs).map(snapshot => [snapshot.id, snapshot])
    );

    for (const planSnapshot of plansById.values()) {
      const plan = planSnapshot.data() || {};
      const monthEndDateKey = getPayrollMonthEndDateKey(plan.monthKey);
      const [closeHour, closeMinute] = `${plan?.closingSchedule?.time || ''}`.split(':').map(Number);
      const isClosingMinute = initialClock.dateKey === monthEndDateKey
        && initialClock.hour === closeHour
        && initialClock.minute === closeMinute;
      if (plan.isArchived || (!isClosingMinute && !isPayrollAutoLockDue(plan.monthKey, initialClock, plan.autoLockAt))) continue;

      try {
        await waitForPayrollPeriodCloseSecond(plan);
        const latestClock = getVietnamClock();
        if (!isPayrollAutoLockDue(plan.monthKey, latestClock, plan.autoLockAt)) continue;
        const outcome = await runPayrollAutoLockPlanStateMachine({
          initialStatus: plan.status,
          evaluateEligibility: () => evaluatePayrollAutoLockPlanEligibility({ appId, planId: planSnapshot.id }),
          finalizeLock: () => finalizePayrollAutoLockPlan({ appId, planId: planSnapshot.id })
        });
        outcomes.push({ appId, planId: planSnapshot.id, ...outcome });
      } catch (error) {
        console.error('autoLockPayrollPeriods failed', {
          appId,
          planId: planSnapshot.id,
          message: error?.message || String(error)
        });
        outcomes.push({ appId, planId: planSnapshot.id, state: 'failed' });
      }
    }
  }

  if (outcomes.length) {
    console.info('autoLockPayrollPeriods completed', { outcomes });
  }
  return null;
});

exports.autoAggregateEmployeeEvaluations = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  region: 'asia-southeast1',
  timeoutSeconds: 120
}, async () => {
  const outcomes = [];
  for (const appId of getPayrollAutoLockAppIds()) {
    try {
      outcomes.push({
        appId,
        ...(await runEmployeeEvaluationAggregation({
          db,
          appId,
          now: new Date(),
          pathBuilder: collectionPath
        }))
      });
    } catch (error) {
      console.error('autoAggregateEmployeeEvaluations failed', {
        appId,
        message: error?.message || String(error)
      });
      outcomes.push({ appId, status: 'failed' });
    }
  }
  if (outcomes.length) console.info('autoAggregateEmployeeEvaluations completed', { outcomes });
  return outcomes;
});

const getPaymentLookupTokens = (...values) => {
  const tokens = values
    .filter(Boolean)
    .flatMap(value => extractTransferCodeTokens(value))
    .flatMap((token) => {
      const normalized = normalizeTransferCode(token);
      const withoutTransferPrefix = normalized.replace(/^TT/, '');
      return [normalized, withoutTransferPrefix, `TT${withoutTransferPrefix}`];
    })
    .map(normalizeTransferCode)
    .filter(token => token.length >= 5);
  return [...new Set(tokens)];
};

const writePaymentLookupDocs = async ({ appId, orderId, invoiceCode = '', paymentCode = '', provider = 'sepay', amount = 0, status = 'pending', aliases = [] }) => {
  const tokens = getPaymentLookupTokens(invoiceCode, paymentCode, orderId, ...aliases);
  if (!tokens.length || !orderId) return;
  const now = new Date().toISOString();
  const batch = db.batch();
  const lookupRef = db.collection(collectionPath(appId, 'payment_lookup'));
  const normalizedAliases = aliases.map(normalizeTransferCode).filter(Boolean);
  tokens.forEach((token) => {
    batch.set(lookupRef.doc(safeDocIdPart(token)), {
      id: safeDocIdPart(token),
      token,
      provider: `${provider || 'sepay'}`.toLowerCase(),
      orderId,
      invoiceCode: normalizeTransferCode(invoiceCode),
      paymentCode,
      amount: parseMoney(amount),
      status,
      aliases: normalizedAliases,
      updatedAt: now,
      createdAt: now
    }, { merge: true });
  });
  await batch.commit();
};

const findOrderFromPaymentLookup = async (appId, codeTokens = []) => {
  const tokens = getPaymentLookupTokens(...codeTokens);
  if (!tokens.length) return null;
  const lookupRef = db.collection(collectionPath(appId, 'payment_lookup'));
  const ordersRef = db.collection(collectionPath(appId, 'orders'));
  for (const token of tokens) {
    const lookupSnap = await lookupRef.doc(safeDocIdPart(token)).get();
    if (!lookupSnap.exists) continue;
    const orderId = `${lookupSnap.data()?.orderId || ''}`.trim();
    if (!orderId) continue;
    const orderSnap = await ordersRef.doc(orderId).get();
    if (orderSnap.exists) return orderSnap;
  }
  return null;
};

const generatePayosOrderCode = () => {
  const timestampPart = String(Date.now()).slice(-12);
  const randomPart = String(Math.floor(100 + Math.random() * 900));
  return Number(`${timestampPart}${randomPart}`);
};

const buildPublicUrl = (req) => {
  const configuredUrl = getEnv('HD_MANAGER_PUBLIC_URL');
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return host ? `${proto}://${host}` : 'https://localhost';
};

const mapPaymentLink = (paymentLink, order, amount, orderCodeText, payosOrderCode) => ({
  orderId: order.id,
  orderCode: payosOrderCode,
  paymentCode: orderCodeText,
  paymentLinkId: paymentLink.paymentLinkId || paymentLink.id || '',
  checkoutUrl: paymentLink.checkoutUrl || '',
  qrCode: paymentLink.qrCode || '',
  amount,
  paymentStatus: 'pending'
});

const createFirestoreLegacyOrderLookup = (ordersRef) => createLegacyOrderLookup({
  fetchPage: async (cursor = null) => {
    let query = ordersRef.orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    return snapshot.docs;
  },
  getOrderCodes: (docSnap) => {
    const order = { id: docSnap.id, ...docSnap.data() };
    return getOrderCodeCandidates(order);
  }
});

const findOrderByPayosData = async (appId, data = {}, rawPayload = {}, options = {}) => {
  const orderCodeNumber = Number(data.orderCode || 0);
  const ordersRef = db.collection(collectionPath(appId, 'orders'));

  if (Number.isFinite(orderCodeNumber) && orderCodeNumber > 0) {
    const byCode = await ordersRef.where('payosOrderCode', '==', orderCodeNumber).limit(1).get();
    if (!byCode.empty) return byCode.docs[0];
  }

  const descriptions = getPaymentDescriptionCandidates(data, rawPayload);
  const invoiceCodeTokens = extractInvoiceCodeTokens(descriptions);
  const transferCodeTokens = descriptions
    .flatMap(extractTransferCodeTokens)
    .map(token => normalizeTransferCode(token).replace(/^TT/, ''))
    .filter(token => /^HD[A-Z0-9]{4,20}$/.test(token));
  const codeTokens = [...new Set([...invoiceCodeTokens, ...transferCodeTokens])];
  if (codeTokens.length > 0) {
    const byLookup = await findOrderFromPaymentLookup(appId, codeTokens);
    if (byLookup) return byLookup;

    const lookupFields = ['paymentCode', 'orderCode', 'code', 'invoiceCode', 'matchedOrderCode'];
    const directLookupPromises = [];
    for (const token of codeTokens) {
      const candidates = [token, `TT ${token}`];
      for (const field of lookupFields) {
        for (const candidate of candidates) {
          directLookupPromises.push(ordersRef.where(field, '==', candidate).limit(1).get());
        }
      }
    }
    const directLookupSnaps = await Promise.all(directLookupPromises);
    for (const byCodeText of directLookupSnaps) {
      if (!byCodeText.empty) return byCodeText.docs[0];
    }

    if (options.allowLegacyScan !== false) {
      // Older orders may only have an id while the visible invoice code is derived from that id.
      const legacyOrderLookup = options.legacyOrderLookup || createFirestoreLegacyOrderLookup(ordersRef);
      const legacyOrder = await legacyOrderLookup(codeTokens);
      if (legacyOrder) return legacyOrder;
    }
  }

  return null;
};

const writeReconciliation = async ({ appId, reason, webhookData, orderDoc = null, extra = {}, provider = 'payos' }) => {
  const data = webhookData?.data || webhookData || {};
  const providerKey = `${provider || 'payos'}`.toLowerCase();
  const statusField = providerKey === 'sepay' ? 'sepayPaymentStatus' : 'payosPaymentStatus';
  const webhookAtField = providerKey === 'sepay' ? 'lastSepayWebhookAt' : 'lastPayosWebhookAt';
  const id = `${providerKey}_${safeDocIdPart(data.orderCode || data.code || data.referenceCode || Date.now())}_${Date.now()}`;
  const now = new Date().toISOString();
  await db.collection(collectionPath(appId, 'payment_reconciliations')).doc(id).set({
    id,
    provider: providerKey,
    reason,
    status: 'need_reconciliation',
    orderId: orderDoc?.id || '',
    payosOrderCode: data.orderCode || '',
    sepayReferenceCode: data.referenceCode || '',
    sepayCode: data.code || '',
    amount: parseMoney(data.amount || data.transferAmount),
    description: resolvePaymentDescription(data, webhookData),
    paymentLinkId: data.paymentLinkId || '',
    webhookData,
    createdAt: now,
    updatedAt: now,
    ...extra
  }, { merge: true });

  if (orderDoc) {
    await orderDoc.ref.set({
      paymentStatus: 'need_reconciliation',
      [statusField]: 'need_reconciliation',
      reconciliationReason: reason,
      [webhookAtField]: now,
      updatedAt: now
    }, { merge: true });
  }
};

const getRecordedPayosAmountForOrder = async (appId, orderId, providerFilter = 'payos') => {
  if (!orderId) return 0;
  const paymentsSnap = await db.collection(collectionPath(appId, 'payments'))
    .where('matchedOrderId', '==', orderId)
    .get();

  return paymentsSnap.docs.reduce((sum, docSnap) => {
    const payment = docSnap.data() || {};
    if (payment.isArchived) return sum;
    const provider = `${payment.paymentProvider || payment.sourceType || ''}`.toLowerCase();
    if (providerFilter && !provider.includes(`${providerFilter}`.toLowerCase())) return sum;
    return sum + parseMoney(payment.amount || payment.appliedAmount || 0);
  }, 0);
};

const writePayosPaymentNotifications = async ({
  appId,
  order,
  paymentId,
  paidAmount,
  appliedAmount,
  overpaidAmount,
  outstandingAmount,
  status,
  receivingBankName = '',
  paymentDateKey = '',
  transactionAt = '',
  now,
  provider = 'payos',
  providerLabel = 'PayOS'
}) => {
  const providerKey = `${provider || 'payos'}`.toLowerCase();
  const companyId = order.companyId || '';
  const customerId = `${order.customerId || ''}`.trim();
  const customerName = order.customerNameSnapshot || order.customerName || 'Khach hang';
  const orderCode = `${getOrderPaymentDisplayCode(order)}`.trim();
  const notificationRef = db.collection(collectionPath(appId, 'notifications'));
  const isPaid = status === 'paid';
  const bankText = receivingBankName ? ` qua ${receivingBankName}` : '';
  const companyTitle = isPaid
    ? `${customerName} da thanh toan${bankText}`
    : `${customerName} da thanh toan mot phan${bankText}`;
  const customerTitle = isPaid ? 'Da ghi nhan thanh toan' : 'Da ghi nhan thanh toan mot phan';
  const companyMessage = `${customerName} da thanh toan ${formatVnd(paidAmount)}${bankText} cho don ${orderCode}. Da tru no ${formatVnd(appliedAmount)}${outstandingAmount > 0 ? `, con no ${formatVnd(outstandingAmount)}` : ', cong no don nay da tat toan'}${overpaidAmount > 0 ? `, tien du ${formatVnd(overpaidAmount)}` : ''}.`;
  const customerMessage = `Cong ty da ghi nhan thanh toan ${formatVnd(paidAmount)}${bankText} cho don ${orderCode}. ${outstandingAmount > 0 ? `So tien con lai: ${formatVnd(outstandingAmount)}.` : 'Don hang da thanh toan du.'}${overpaidAmount > 0 ? ` Tien du: ${formatVnd(overpaidAmount)}.` : ''}`;

  const common = {
    companyId,
    customerId,
    customerName,
    orderId: order.id,
    matchedOrderId: order.id,
    matchedOrderCode: orderCode,
    paymentId,
    amount: paidAmount,
    appliedAmount,
    overpaidAmount,
    remainingDebt: outstandingAmount,
    paymentSettlementType: outstandingAmount > 0 ? 'partial' : overpaidAmount > 0 ? 'overpaid' : 'exact',
    receivingBankName,
    paymentProvider: providerKey,
    sourceLabel: receivingBankName || providerLabel,
    category: 'payment',
    priority: 'high',
    type: `${providerKey}_payment_confirmation`,
    status: 'unread',
    readStatus: 'unread',
    tab: 'debt',
    tone: isPaid ? 'sky' : 'orange',
    date: paymentDateKey || getVietnamDateKey(now),
    paymentDate: paymentDateKey || getVietnamDateKey(now),
    transactionAt: transactionAt || now,
    createdAt: now,
    createdAtMs: Date.parse(now) || Date.now(),
    updatedAt: now,
    isArchived: false
  };

  const writes = [
    notificationRef.doc(`${providerKey}_company_${paymentId}`).set({
      ...common,
      id: `${providerKey}_company_${paymentId}`,
      recipientType: 'company',
      audience: 'company',
      targetAudience: 'company',
      title: companyTitle,
      message: companyMessage
    }, { merge: true })
  ];

  if (customerId) {
    writes.push(notificationRef.doc(`${providerKey}_customer_${paymentId}`).set({
      ...common,
      id: `${providerKey}_customer_${paymentId}`,
      recipientType: 'customer',
      targetCustomerId: customerId,
      title: customerTitle,
      message: customerMessage
    }, { merge: true }));
  }

  await Promise.all(writes);
};

const enqueuePaymentNotificationJob = async ({
  appId,
  order,
  paymentId,
  paidAmount,
  appliedAmount,
  overpaidAmount,
  outstandingAmount,
  status,
  receivingBankName,
  paymentDateKey,
  transactionAt,
  now,
  provider,
  providerLabel
}) => {
  const providerKey = `${provider || 'sepay'}`.toLowerCase();
  const jobId = `notify_${safeDocIdPart(paymentId)}`;
  await db.collection(collectionPath(appId, 'payment_jobs')).doc(jobId).set({
    id: jobId,
    type: 'payment_notification',
    status: 'pending',
    attempts: 0,
    provider: providerKey,
    paymentId,
    order: {
      id: order.id,
      companyId: order.companyId || '',
      customerId: order.customerId || '',
      customerName: order.customerName || order.customer || '',
      customerPhone: order.customerPhone || '',
      invoiceCode: getOrderInvoiceCode(order),
      paymentCode: order.paymentCode || ''
    },
    paidAmount: parseMoney(paidAmount),
    appliedAmount: parseMoney(appliedAmount),
    overpaidAmount: parseMoney(overpaidAmount),
    outstandingAmount: parseMoney(outstandingAmount),
    paymentStatus: status,
    receivingBankName: receivingBankName || providerLabel || providerKey,
    paymentDateKey,
    transactionAt,
    providerLabel,
    createdAt: now,
    updatedAt: now
  }, { merge: true });
};

exports.processPaymentJob = onDocumentCreated('artifacts/{appId}/public/data/payment_jobs/{jobId}', async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const job = snap.data() || {};
    if (job.type !== 'payment_notification') return null;
    const appId = normalizeAppId(event.params.appId);
    const now = new Date().toISOString();
    try {
      await snap.ref.set({ status: 'processing', attempts: (Number(job.attempts) || 0) + 1, updatedAt: now }, { merge: true });
      await writePayosPaymentNotifications({
        appId,
        order: job.order || {},
        paymentId: job.paymentId,
        paidAmount: job.paidAmount,
        appliedAmount: job.appliedAmount,
        overpaidAmount: job.overpaidAmount,
        outstandingAmount: job.outstandingAmount,
        status: job.paymentStatus,
        receivingBankName: job.receivingBankName,
        paymentDateKey: job.paymentDateKey,
        transactionAt: job.transactionAt,
        now,
        provider: job.provider || 'sepay',
        providerLabel: job.providerLabel || job.receivingBankName || 'SePay'
      });
      await snap.ref.set({ status: 'done', processedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      return null;
    } catch (error) {
      console.error('processPaymentJob failed', error);
      await snap.ref.set({
        status: 'error',
        errorMessage: error.message || `${error}`,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return null;
    }
  });

const applyPayosPaymentToOrder = async ({ appId, orderDoc, paidAmount, description, reference = '', paymentLinkId = '', payosOrderCode = '', rawPayload = {}, sourceType = 'payos_sync', provider = 'payos', providerLabel = 'PayOS', trace = null }) => {
  markPaymentTrace(trace, 'payment_apply_start');
  const providerKey = `${provider || 'payos'}`.toLowerCase();
  const providerStatusField = providerKey === 'sepay' ? 'sepayPaymentStatus' : 'payosPaymentStatus';
  const providerWebhookAtField = providerKey === 'sepay' ? 'lastSepayWebhookAt' : 'lastPayosWebhookAt';
  const providerSyncAtField = providerKey === 'sepay' ? 'lastSepaySyncAt' : 'lastPayosSyncAt';
  const order = { id: orderDoc.id, ...orderDoc.data() };
  const expectedAmount = resolveOrderPaymentDueAmount(order);
  const expectedOrderCode = `${getOrderPaymentDisplayCode(order)}`.trim();
  const cleanDescription = `${description || expectedOrderCode || ''}`.trim();
  const matchDataSource = rawPayload?.data || rawPayload?.paymentLink || rawPayload || {};
  const matchData = {
    ...matchDataSource,
    orderCode: matchDataSource.orderCode || payosOrderCode,
    payosOrderCode: matchDataSource.payosOrderCode || payosOrderCode,
    paymentLinkId: matchDataSource.paymentLinkId || matchDataSource.id || paymentLinkId
  };

  if (!isPayosPaymentMatchedToOrder({
    order,
    data: matchData,
    description: cleanDescription,
    expectedOrderCode,
    paymentLinkId,
    payosOrderCode
  })) {
    await writeReconciliation({
      appId,
      reason: 'missing_or_mismatched_order_code',
      webhookData: rawPayload,
      orderDoc,
      provider: providerKey,
      extra: { expectedOrderCode, description: cleanDescription, paidAmount }
    });
    return { success: true, status: 'need_reconciliation', reason: 'missing_or_mismatched_order_code' };
  }

  const safePaidAmount = parseMoney(paidAmount);
  if (safePaidAmount <= 0) {
    await writeReconciliation({
      appId,
      reason: 'invalid_amount',
      webhookData: rawPayload,
      orderDoc,
      provider: providerKey,
      extra: { expectedAmount, paidAmount: safePaidAmount }
    });
    return { success: true, status: 'need_reconciliation', reason: 'invalid_amount' };
  }

  const now = new Date().toISOString();
  const transactionDate = resolvePayosTransactionDate(rawPayload, now);
  const transactionAt = transactionDate.toISOString();
  const paymentDateKey = getVietnamDateKey(transactionDate);
  const payosTransactionDateTime = resolvePayosTransactionDateText(rawPayload);
  const paymentIdentity = safeDocIdPart(reference || paymentLinkId || payosOrderCode || now);
  const paymentId = `${providerKey}_${order.id}_${paymentIdentity}`;
  const paymentRef = db.collection(collectionPath(appId, 'payments')).doc(paymentId);
  markPaymentTrace(trace, 'payment_duplicate_check_start', { paymentId });
  const existingPayment = await paymentRef.get();
  if (existingPayment.exists) {
    markPaymentTrace(trace, 'payment_duplicate_ignored', { paymentId });
    return { success: true, status: 'duplicate_ignored', paymentId };
  }

  if (order.paymentStatus === 'paid' || order[providerStatusField] === 'paid') {
    await writeReconciliation({ appId, reason: 'order_already_paid', webhookData: rawPayload, orderDoc, provider: providerKey });
    return { success: true, status: 'need_reconciliation', reason: 'order_already_paid' };
  }

  const previousPaidAmount = parseMoney(order.paidAmount || order.appliedAmount || 0);
  const currentOutstanding = Math.max(0, parseMoney(order.outstandingAmount ?? (expectedAmount - previousPaidAmount)));
  const dueAmount = currentOutstanding > 0 ? currentOutstanding : expectedAmount;
  const appliedAmount = Math.min(safePaidAmount, dueAmount);
  const overpaidAmount = Math.max(0, safePaidAmount - dueAmount);
  const nextOutstanding = Math.max(0, dueAmount - appliedAmount);
  const nextPaymentStatus = nextOutstanding <= 0 ? 'paid' : 'partial';
  const settlementType = nextOutstanding > 0 ? 'partial' : overpaidAmount > 0 ? 'overpaid' : 'exact';
  const receivingBank = providerKey === 'sepay'
    ? await resolveSepayReceivingProfile(appId, order, matchData, rawPayload)
    : await resolvePayosReceivingBank(appId, order, matchData, rawPayload);

  markPaymentTrace(trace, 'payment_firestore_write_start', {
    paymentId,
    appliedAmount,
    overpaidAmount,
    outstandingAmount: nextOutstanding
  });
  await retryPaymentOperation('payment_firestore_write', async () => {
    await paymentRef.set({
    id: paymentId,
    companyId: order.companyId || '',
    customerId: order.customerId || '',
    customerName: order.customerNameSnapshot || order.customerName || '',
    amount: safePaidAmount,
    appliedAmount,
    overpaidAmount,
    outstandingAmount: nextOutstanding,
    remainingDebt: nextOutstanding,
    paymentStatus: nextPaymentStatus,
    paymentSettlementType: settlementType,
    method: providerLabel,
    bankName: receivingBank.bankName,
    bankCode: receivingBank.bankCode,
    receivingBankName: receivingBank.bankName,
    receivingBankCode: receivingBank.bankCode,
    paymentProvider: providerKey,
    paymentLinkId: paymentLinkId || order.paymentLinkId || '',
    payosOrderCode: payosOrderCode || order.payosOrderCode || '',
    sepayPaymentCode: providerKey === 'sepay' ? (expectedOrderCode || order.sepayPaymentCode || '') : (order.sepayPaymentCode || ''),
    referenceCode: reference || '',
    bankContent: cleanDescription,
    note: `${providerLabel} ${expectedOrderCode}`,
    date: paymentDateKey,
    paymentDate: paymentDateKey,
    transactionDate: paymentDateKey,
    transactionDateTime: payosTransactionDateTime || transactionAt,
    paidAt: transactionAt,
    transactionAt,
    matchedOrderId: order.id,
    matchedOrderCode: expectedOrderCode,
    targetOrderId: order.id,
    autoMatchedByOrderCode: true,
    sourceType,
    sourceLabel: receivingBank.bankName || providerLabel,
    sourceOrderId: order.id,
    createdByEmpId: `system_${providerKey}`,
    empId: `system_${providerKey}`,
    createdByRole: 'system',
    status: 'paid',
    approvalStatus: 'approved',
    handoverStatus: 'confirmed',
    isConfirmed: true,
    confirmedAt: now,
    createdAt: now,
    updatedAt: now,
    webhookReceivedAt: now,
    isArchived: false,
    rawWebhook: rawPayload
    }, { merge: true });

    await orderDoc.ref.set({
    paymentStatus: nextPaymentStatus,
    [providerStatusField]: nextPaymentStatus,
    paymentSettlementType: settlementType,
    paidAt: nextPaymentStatus === 'paid' ? transactionAt : (order.paidAt || ''),
    partialPaidAt: nextPaymentStatus === 'partial' ? transactionAt : (order.partialPaidAt || ''),
    paidAmount: previousPaidAmount + appliedAmount,
    appliedAmount: previousPaidAmount + appliedAmount,
    overpaidAmount,
    outstandingAmount: nextOutstanding,
    lastPaymentId: paymentId,
    [providerWebhookAtField]: sourceType.includes('webhook') ? now : (order[providerWebhookAtField] || ''),
    [providerSyncAtField]: !sourceType.includes('webhook') ? now : (order[providerSyncAtField] || ''),
    updatedAt: now
    }, { merge: true });

    const customerId = `${order.customerId || ''}`.trim();
    if (customerId) {
      await db.collection(collectionPath(appId, 'customers')).doc(customerId).set({
        lastPaymentAt: transactionAt,
        lastPaymentDate: paymentDateKey,
        lastPaymentAmount: safePaidAmount,
        lastPaymentAppliedAmount: appliedAmount,
        lastPaymentOverpaidAmount: overpaidAmount,
        lastPaymentRemainingDebt: nextOutstanding,
        lastPaymentSettlementType: settlementType,
        updatedAt: now
      }, { merge: true });
    }
  }, { trace });

  await enqueuePaymentNotificationJob({
    appId,
    order,
    paymentId,
    paidAmount: safePaidAmount,
    appliedAmount,
    overpaidAmount,
    outstandingAmount: nextOutstanding,
    status: nextPaymentStatus,
    receivingBankName: receivingBank.bankName,
    paymentDateKey,
    transactionAt,
    now,
    provider: providerKey,
    providerLabel
  });
  markPaymentTrace(trace, 'payment_updated', {
    paymentId,
    status: nextPaymentStatus,
    notificationQueued: true,
    outstandingAmount: nextOutstanding
  });

  return {
    success: true,
    status: nextPaymentStatus,
    paymentId,
    appliedAmount,
    overpaidAmount,
    outstandingAmount: nextOutstanding
  };
};

exports.createPayosPaymentLink = functions.https.onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chỉ hỗ trợ POST.' });

  try {
    const appId = normalizeAppId(req.body?.appId);
    const claims = await verifyTenantIdentityRequest(req, appId);
    const orderId = `${req.body?.orderId || ''}`.trim();
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thiếu orderId.' });

    const orderRef = db.collection(collectionPath(appId, 'orders')).doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return sendJson(res, 404, { success: false, message: 'Không tìm thấy đơn hàng.' });

    const order = { id: orderSnap.id, ...orderSnap.data() };
    verifyTenantOrderRequest({ claims, appId, order });
    if (order.isArchived || order.reviewStatus === 'cancelled' || order.status === 'cancelled') {
      return sendJson(res, 409, { success: false, message: 'Đơn đã hủy hoặc đã lưu trữ, không thể tạo PayOS.' });
    }
    if (order.paymentStatus === 'paid' || order.payosPaymentStatus === 'paid') {
      return sendJson(res, 409, { success: false, message: 'Đơn này đã thanh toán.' });
    }

    const existingCheckoutUrl = `${order.checkoutUrl || ''}`.trim();
    if (existingCheckoutUrl && order.paymentProvider === 'payos') {
      return sendJson(res, 200, {
        success: true,
        payment: {
          orderId,
          orderCode: order.payosOrderCode || order.paymentOrderCode || '',
          paymentCode: buildOrderTransferMemo({ id: orderId, ...order }),
          paymentLinkId: order.paymentLinkId || '',
          checkoutUrl: existingCheckoutUrl,
          qrCode: order.qrCode || '',
          amount: parseMoney(order.paymentAmount || order.outstandingAmount || order.amount),
          paymentStatus: order.paymentStatus || 'pending'
        }
      });
    }

    const amount = parseMoney(order.outstandingAmount ?? order.amount);
    if (amount <= 0) return sendJson(res, 400, { success: false, message: 'Số tiền cần thanh toán phải lớn hơn 0.' });

    const invoiceCode = getOrderInvoiceCode({ id: orderId, ...order });
    const orderCodeText = buildOrderTransferMemo({ id: orderId, ...order });
    const payosOrderCode = Number(order.payosOrderCode || order.paymentOrderCode || 0) || generatePayosOrderCode();
    const publicUrl = buildPublicUrl(req);
    const returnUrl = getEnv('PAYOS_RETURN_URL', `${publicUrl}/?payos_return=${encodeURIComponent(orderId)}`);
    const cancelUrl = getEnv('PAYOS_CANCEL_URL', `${publicUrl}/?payos_cancel=${encodeURIComponent(orderId)}`);
    const payos = getPayosClient();
    const items = Array.isArray(order.items)
      ? order.items.slice(0, 20).map((item, index) => ({
        name: `${item.description || item.productName || `Sản phẩm ${index + 1}`}`.slice(0, 100),
        quantity: Math.max(1, Math.round(Number(item.quantity || 1) || 1)),
        price: parseMoney(item.unitPrice || item.price || 0)
      })).filter(item => item.price > 0)
      : [];

    const paymentLink = await payos.paymentRequests.create({
      orderCode: payosOrderCode,
      amount,
      description: orderCodeText,
      returnUrl,
      cancelUrl,
      ...(items.length > 0 ? { items } : {})
    });

    const payment = mapPaymentLink(paymentLink, order, amount, orderCodeText, payosOrderCode);
    const now = new Date().toISOString();
    await orderRef.set({
      paymentProvider: 'payos',
      payosOrderCode,
      paymentOrderCode: payosOrderCode,
      paymentCode: orderCodeText,
      invoiceCode,
      paymentAmount: amount,
      paymentLinkId: payment.paymentLinkId,
      checkoutUrl: payment.checkoutUrl,
      qrCode: payment.qrCode,
      paymentStatus: 'pending',
      payosPaymentStatus: 'pending',
      payosCreatedAt: now,
      updatedAt: now
    }, { merge: true });

    return sendJson(res, 200, { success: true, payment });
  } catch (error) {
    if (Number(error?.statusCode || 500) >= 500) console.error('createPayosPaymentLink failed', error);
    return sendProtectedEndpointError(res, error, 'Không tạo được link PayOS.');
  }
});

exports.payosWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chỉ hỗ trợ POST.' });

  const appId = normalizeAppId(req.query?.appId || req.body?.appId);

  try {
    const payos = getPayosClient();
    const webhookData = await payos.webhooks.verify(req.body);
    const data = webhookData?.data || webhookData || {};
    const orderDoc = await findOrderByPayosData(appId, data, webhookData);

    if (!orderDoc) {
      await writeReconciliation({ appId, reason: 'missing_order_or_order_code', webhookData });
      return sendJson(res, 200, { success: true, status: 'need_reconciliation' });
    }

    const order = { id: orderDoc.id, ...orderDoc.data() };
    const expectedAmount = parseMoney(order.paymentAmount || order.outstandingAmount || order.amount);
    const paidAmount = parseMoney(data.amount);
    const expectedOrderCode = `${getOrderPaymentDisplayCode(order)}`.trim();
    const description = resolvePaymentDescription(data, webhookData);

    if (!isPayosPaymentMatchedToOrder({ order, data, description, expectedOrderCode })) {
      await writeReconciliation({ appId, reason: 'missing_or_mismatched_order_code', webhookData, orderDoc });
      return sendJson(res, 200, { success: true, status: 'need_reconciliation' });
    }

    if (paidAmount <= 0) {
      await writeReconciliation({
        appId,
        reason: 'invalid_amount',
        webhookData,
        orderDoc,
        extra: { expectedAmount, paidAmount }
      });
      return sendJson(res, 200, { success: true, status: 'need_reconciliation' });
    }

    const now = new Date().toISOString();
    const transactionDate = resolvePayosTransactionDate(webhookData, now);
    const transactionAt = transactionDate.toISOString();
    const paymentDateKey = getVietnamDateKey(transactionDate);
    const payosTransactionDateTime = resolvePayosTransactionDateText(webhookData);
    const paymentIdentity = safeDocIdPart(data.reference || data.paymentLinkId || data.orderCode || now);
    const paymentId = `payos_${order.id}_${paymentIdentity}`;
    const paymentRef = db.collection(collectionPath(appId, 'payments')).doc(paymentId);
    const existingPayment = await paymentRef.get();
    if (existingPayment.exists) {
      return sendJson(res, 200, { success: true, status: 'duplicate_ignored', paymentId });
    }

    if (order.paymentStatus === 'paid' || order.payosPaymentStatus === 'paid') {
      await writeReconciliation({ appId, reason: 'order_already_paid', webhookData, orderDoc });
      return sendJson(res, 200, { success: true, status: 'need_reconciliation' });
    }

    const previousPaidAmount = parseMoney(order.paidAmount || order.appliedAmount || 0);
    const currentOutstanding = Math.max(0, parseMoney(order.outstandingAmount ?? (expectedAmount - previousPaidAmount)));
    const dueAmount = currentOutstanding > 0 ? currentOutstanding : expectedAmount;
    const appliedAmount = Math.min(paidAmount, dueAmount);
    const overpaidAmount = Math.max(0, paidAmount - dueAmount);
    const nextOutstanding = Math.max(0, dueAmount - appliedAmount);
    const nextPaymentStatus = nextOutstanding <= 0 ? 'paid' : 'partial';
    const settlementType = nextOutstanding > 0 ? 'partial' : overpaidAmount > 0 ? 'overpaid' : 'exact';
    const receivingBank = await resolvePayosReceivingBank(appId, order, data, webhookData);

    await db.collection(collectionPath(appId, 'payments')).doc(paymentId).set({
      id: paymentId,
      companyId: order.companyId || '',
      customerId: order.customerId || '',
      customerName: order.customerNameSnapshot || order.customerName || '',
      amount: paidAmount,
      appliedAmount,
      overpaidAmount,
      outstandingAmount: nextOutstanding,
      remainingDebt: nextOutstanding,
      paymentStatus: nextPaymentStatus,
      paymentSettlementType: settlementType,
      method: 'PayOS',
      bankName: receivingBank.bankName,
      bankCode: receivingBank.bankCode,
      receivingBankName: receivingBank.bankName,
      receivingBankCode: receivingBank.bankCode,
      paymentProvider: 'payos',
      paymentLinkId: data.paymentLinkId || order.paymentLinkId || '',
      payosOrderCode: data.orderCode || order.payosOrderCode || '',
      referenceCode: data.reference || '',
      bankContent: description,
      note: `PayOS ${expectedOrderCode}`,
      date: paymentDateKey,
      paymentDate: paymentDateKey,
      transactionDate: paymentDateKey,
      transactionDateTime: payosTransactionDateTime || transactionAt,
      paidAt: transactionAt,
      transactionAt,
      matchedOrderId: order.id,
      matchedOrderCode: expectedOrderCode,
      targetOrderId: order.id,
      autoMatchedByOrderCode: true,
      sourceType: 'payos_webhook',
      sourceLabel: receivingBank.bankName || 'PayOS',
      sourceOrderId: order.id,
      createdByEmpId: 'system_payos',
      empId: 'system_payos',
      createdByRole: 'system',
      status: 'paid',
      approvalStatus: 'approved',
      handoverStatus: 'confirmed',
      isConfirmed: true,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
      webhookReceivedAt: now,
      isArchived: false,
      rawWebhook: webhookData
    }, { merge: true });

    await orderDoc.ref.set({
      paymentStatus: nextPaymentStatus,
      payosPaymentStatus: nextPaymentStatus,
      paymentSettlementType: settlementType,
      paidAt: nextPaymentStatus === 'paid' ? transactionAt : (order.paidAt || ''),
      partialPaidAt: nextPaymentStatus === 'partial' ? transactionAt : (order.partialPaidAt || ''),
      paidAmount: previousPaidAmount + appliedAmount,
      appliedAmount: previousPaidAmount + appliedAmount,
      overpaidAmount,
      outstandingAmount: nextOutstanding,
      lastPaymentId: paymentId,
      lastPayosWebhookAt: now,
      updatedAt: now
    }, { merge: true });

    const customerId = `${order.customerId || ''}`.trim();
    if (customerId) {
      await db.collection(collectionPath(appId, 'customers')).doc(customerId).set({
        lastPaymentAt: transactionAt,
        lastPaymentDate: paymentDateKey,
        lastPaymentAmount: paidAmount,
        lastPaymentAppliedAmount: appliedAmount,
        lastPaymentOverpaidAmount: overpaidAmount,
        lastPaymentRemainingDebt: nextOutstanding,
        lastPaymentSettlementType: settlementType,
        updatedAt: now
      }, { merge: true });
    }

    await writePayosPaymentNotifications({
      appId,
      order,
      paymentId,
      paidAmount,
      appliedAmount,
      overpaidAmount,
      outstandingAmount: nextOutstanding,
      status: nextPaymentStatus,
      receivingBankName: receivingBank.bankName,
      paymentDateKey,
      transactionAt,
      now
    });

    return sendJson(res, 200, {
      success: true,
      status: nextPaymentStatus,
      paymentId,
      appliedAmount,
      overpaidAmount,
      outstandingAmount: nextOutstanding
    });
  } catch (error) {
    console.error('payosWebhook failed', error);
    try {
      await writeReconciliation({
        appId,
        reason: 'invalid_signature_or_webhook_error',
        webhookData: req.body,
        extra: { errorMessage: error.message || String(error) }
      });
    } catch (writeError) {
      console.error('write reconciliation failed', writeError);
    }
    return sendJson(res, 400, { success: false, message: error.message || 'Webhook PayOS không hợp lệ.' });
  }
});

exports.syncPayosPaymentStatus = functions.https.onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });

  try {
    const appId = normalizeAppId(req.body?.appId);
    const claims = await verifyTenantIdentityRequest(req, appId);
    const orderId = `${req.body?.orderId || ''}`.trim();
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thieu orderId.' });

    const orderDoc = await db.collection(collectionPath(appId, 'orders')).doc(orderId).get();
    if (!orderDoc.exists) return sendJson(res, 404, { success: false, message: 'Khong tim thay don hang.' });

    const order = { id: orderDoc.id, ...orderDoc.data() };
    verifyTenantOrderRequest({ claims, appId, order });
    const payosOrderCode = Number(order.payosOrderCode || order.paymentOrderCode || 0);
    const paymentLinkId = `${order.paymentLinkId || ''}`.trim();
    const lookupId = payosOrderCode || paymentLinkId;
    if (!lookupId) {
      return sendJson(res, 400, {
        success: false,
        message: 'Don nay chua co ma PayOS de kiem tra.'
      });
    }

    const payos = getPayosClient();
    const paymentLink = await payos.paymentRequests.get(lookupId);
    const payosStatus = `${paymentLink?.status || ''}`.toUpperCase();
    const totalPaidAmount = parseMoney(paymentLink?.amountPaid);

    if (!['PAID', 'UNDERPAID'].includes(payosStatus) || totalPaidAmount <= 0) {
      return sendJson(res, 200, {
        success: true,
        status: 'not_paid_yet',
        payosStatus,
        amountPaid: totalPaidAmount,
        amountRemaining: parseMoney(paymentLink?.amountRemaining)
      });
    }

    const recordedAmount = await getRecordedPayosAmountForOrder(appId, order.id);
    const amountToApply = Math.max(0, totalPaidAmount - recordedAmount);
    if (amountToApply <= 0) {
      return sendJson(res, 200, {
        success: true,
        status: 'already_synced',
        payosStatus,
        amountPaid: totalPaidAmount,
        recordedAmount
      });
    }

    const transactions = Array.isArray(paymentLink?.transactions) ? paymentLink.transactions : [];
    const latestTransaction = transactions
      .slice()
      .sort((a, b) => `${b?.transactionDateTime || ''}`.localeCompare(`${a?.transactionDateTime || ''}`))[0] || {};
    const expectedOrderCode = `${getOrderPaymentDisplayCode(order)}`.trim();
    const description = `${latestTransaction.description || paymentLink.description || expectedOrderCode}`.trim();

    const result = await applyPayosPaymentToOrder({
      appId,
      orderDoc,
      paidAmount: amountToApply,
      description,
      reference: latestTransaction.reference || paymentLink.id || paymentLink.orderCode || '',
      paymentLinkId: paymentLink.id || paymentLink.paymentLinkId || paymentLinkId,
      payosOrderCode: paymentLink.orderCode || payosOrderCode,
      rawPayload: {
        provider: 'payos',
        source: 'manual_sync',
        paymentLink,
        latestTransaction,
        totalPaidAmount,
        recordedAmount,
        amountToApply
      },
      sourceType: 'payos_sync'
    });

    return sendJson(res, 200, {
      ...result,
      payosStatus,
      amountPaid: totalPaidAmount,
      recordedAmount,
      amountSynced: amountToApply
    });
  } catch (error) {
    if (Number(error?.statusCode || 500) >= 500) console.error('syncPayosPaymentStatus failed', error);
    return sendProtectedEndpointError(res, error, 'Khong dong bo duoc trang thai PayOS.');
  }
});

const getSepayWebhookData = (payload = {}) => {
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) return payload.data;
  return payload || {};
};

const getSepayTransactionDateCandidates = (rawPayload = {}) => {
  const data = getSepayWebhookData(rawPayload);
  return [
    data.transactionDate,
    data.transactionDateTime,
    data.paymentTime,
    data.createdAt,
    rawPayload.transactionDate,
    rawPayload.transactionDateTime,
    rawPayload.createdAt
  ];
};

const resolveSepayTransactionDate = (rawPayload = {}, fallback = new Date()) => {
  for (const candidate of getSepayTransactionDateCandidates(rawPayload)) {
    const parsed = parsePayosDateTime(candidate);
    if (parsed) return parsed;
  }
  return parsePayosDateTime(fallback) || new Date();
};

const verifySepayWebhookRequest = (req) => {
  const configuredApiKey = `${getEnv('SEPAY_WEBHOOK_API_KEY') || ''}`.trim();
  const configuredSecret = `${getEnv('SEPAY_WEBHOOK_SECRET') || ''}`.trim();

  if (!configuredApiKey && !configuredSecret) {
    console.warn('SEPAY webhook verification is not configured. Rejecting unsigned webhook outside emulator.');
    return process.env.FUNCTIONS_EMULATOR === 'true';
  }

  if (configuredApiKey) {
    const normalizeApiKeyToken = (value) => `${Array.isArray(value) ? value[0] : value || ''}`
      .replace(/^apikey\s+/i, '')
      .replace(/^bearer\s+/i, '')
      .trim();
    const incomingApiKeys = [
      normalizeApiKeyToken(req.headers.authorization),
      normalizeApiKeyToken(req.headers['x-api-key']),
      normalizeApiKeyToken(req.headers['api-key']),
      normalizeApiKeyToken(req.headers['x-sepay-api-key']),
      normalizeApiKeyToken(req.query?.sepayKey),
      normalizeApiKeyToken(req.query?.apiKey),
      normalizeApiKeyToken(req.query?.webhookKey)
    ].filter(Boolean);
    if (!incomingApiKeys.some((incomingApiKey) => incomingApiKey === configuredApiKey)) return false;
  }

  if (configuredSecret) {
    const signature = `${req.headers['x-sepay-signature'] || req.headers['x-hub-signature-256'] || req.headers['x-signature'] || ''}`.trim();
    if (!signature) return false;
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac('sha256', configuredSecret).update(rawBody).digest('hex');
    const normalizedSignature = signature.replace(/^sha256=/i, '').trim();
    try {
      if (!/^[a-f0-9]{64}$/i.test(normalizedSignature)) return false;
      const expectedBuffer = Buffer.from(expected, 'hex');
      const actualBuffer = Buffer.from(normalizedSignature, 'hex');
      if (expectedBuffer.length !== actualBuffer.length) return false;
      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch (error) {
      return false;
    }
  }

  return true;
};

const getPositiveEnvNumber = (key, fallback, maximum) => {
  const value = Number.parseInt(`${getEnv(key, fallback)}`, 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, maximum);
};

const getSepayReconciliationOptions = () => ({
  apiToken: `${getEnv('SEPAY_API_TOKEN') || ''}`.trim(),
  bankAccountId: `${getEnv('SEPAY_BANK_ACCOUNT_ID') || ''}`.trim(),
  lookbackMinutes: getPositiveEnvNumber('SEPAY_RECONCILIATION_LOOKBACK_MINUTES', 24 * 60, 7 * 24 * 60),
  maxPages: getPositiveEnvNumber('SEPAY_RECONCILIATION_MAX_PAGES', 10, 50),
  perPage: 100,
  apiUrl: `${getEnv('SEPAY_TRANSACTIONS_API_URL', 'https://userapi.sepay.vn/v2/transactions')}`.trim()
});

const getSepayTransactionDescription = (transaction = {}) => [
  transaction.content,
  transaction.code,
  transaction.referenceCode
].map(value => `${value || ''}`.trim()).filter(Boolean).join(' ');

const buildSepayTransactionPayload = (transaction = {}) => ({
  id: transaction.id,
  referenceCode: transaction.referenceCode,
  gateway: transaction.gateway,
  transactionDate: transaction.transactionDate,
  accountNumber: transaction.accountNumber,
  subAccount: transaction.subAccount,
  code: transaction.code,
  content: transaction.content,
  description: getSepayTransactionDescription(transaction),
  transferType: transaction.transferType || 'in',
  transferAmount: transaction.transferAmount,
  amount: transaction.transferAmount
});

const matchesSepayReceivingAccount = (transaction = {}, receivingProfile = {}) => {
  const incomingAccounts = [transaction.accountNumber, transaction.subAccount]
    .map(cleanBankAccountNumber)
    .filter(Boolean);
  const configuredAccounts = [
    receivingProfile.accountNumber,
    receivingProfile.mainAccountNumber,
    receivingProfile.virtualAccountNumber
  ].map(cleanBankAccountNumber).filter(Boolean);

  if (!incomingAccounts.length || !configuredAccounts.length) return true;
  return incomingAccounts.some(account => configuredAccounts.includes(account));
};

const writeSepayBankTransaction = async ({ appId, transaction, order, paymentId, status }) => {
  const transactionIdentity = safeDocIdPart(transaction.id || transaction.referenceCode);
  if (!transactionIdentity || !paymentId) return;

  const transactionDate = resolveSepayTransactionDate({ data: buildSepayTransactionPayload(transaction) });
  const now = new Date().toISOString();
  const orderCode = `${getOrderPaymentDisplayCode(order)}`.trim();
  await db.collection(collectionPath(appId, 'bankTransactions')).doc(`sepay_${transactionIdentity}`).set({
    id: `sepay_${transactionIdentity}`,
    companyId: order.companyId || '',
    customerId: order.customerId || '',
    transactionId: transaction.id || '',
    referenceCode: transaction.referenceCode || transaction.id || '',
    bankContent: getSepayTransactionDescription(transaction),
    content: transaction.content || '',
    amount: parseMoney(transaction.transferAmount),
    direction: 'in',
    transactionType: 'in',
    method: 'SePay',
    bankName: transaction.gateway || '',
    bankAccountNumber: transaction.accountNumber || transaction.subAccount || '',
    transactionDate: getVietnamDateKey(transactionDate),
    transactionDateTime: transactionDate.toISOString(),
    sourceType: 'sepay_api_reconciliation',
    sourceLabel: 'SePay Transaction API',
    matchedOrderId: order.id,
    matchedOrderCode: orderCode,
    reconciledPaymentId: paymentId,
    autoReconcileStatus: status === 'duplicate_ignored' ? 'already_matched' : 'matched',
    autoReconciledAt: now,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  }, { merge: true });
};

const reconcileSepayTransactionsForApp = async ({ appId, targetOrderDoc = null } = {}) => {
  const options = getSepayReconciliationOptions();
  const targetOrder = targetOrderDoc ? { id: targetOrderDoc.id, ...targetOrderDoc.data() } : null;
  const legacyOrderLookup = createFirestoreLegacyOrderLookup(db.collection(collectionPath(appId, 'orders')));
  return reconcileSepayTransactions({
    fetchTransactions: () => fetchSepayTransactions(options),
    findOrder: async (transaction) => {
      const payload = buildSepayTransactionPayload(transaction);
      const description = getSepayTransactionDescription(transaction);
      const invoiceTokens = extractInvoiceCodeTokens(description, transaction.referenceCode, transaction.code);
      if (!invoiceTokens.length) return null;

      if (targetOrderDoc) {
        return isPayosPaymentMatchedToOrder({
          order: targetOrder,
          data: payload,
          description,
          expectedOrderCode: getOrderPaymentDisplayCode(targetOrder),
          paymentLinkId: '',
          payosOrderCode: ''
        }) ? targetOrderDoc : null;
      }

      let orderDoc = await findOrderByPayosData(appId, payload, { data: payload }, { allowLegacyScan: false });
      if (!orderDoc) {
        orderDoc = await findOrderByPayosData(appId, payload, { data: payload }, {
          allowLegacyScan: true,
          legacyOrderLookup
        });
      }
      return orderDoc;
    },
    applyTransaction: async ({ transaction, orderDoc }) => {
      const order = { id: orderDoc.id, ...orderDoc.data() };
      const payload = buildSepayTransactionPayload(transaction);
      const receivingProfile = await resolveSepayReceivingProfile(appId, order, payload, { data: payload });
      if (!matchesSepayReceivingAccount(transaction, receivingProfile)) {
        return { success: true, status: 'need_reconciliation', reason: 'receiving_account_mismatch' };
      }

      const result = await applyPayosPaymentToOrder({
        appId,
        orderDoc,
        paidAmount: transaction.transferAmount,
        description: getSepayTransactionDescription(transaction),
        reference: transaction.referenceCode || transaction.id,
        paymentLinkId: '',
        payosOrderCode: '',
        rawPayload: {
          provider: 'sepay',
          source: 'sepay_api_reconciliation',
          data: payload
        },
        sourceType: 'sepay_api_reconciliation',
        provider: 'sepay',
        providerLabel: 'SePay'
      });

      if (['paid', 'partial', 'duplicate_ignored'].includes(result.status)) {
        await writeSepayBankTransaction({
          appId,
          transaction,
          order,
          paymentId: result.paymentId,
          status: result.status
        });
      }
      return result;
    },
    targetOrderId: targetOrderDoc?.id || ''
  });
};

const buildSepayPaymentQrFingerprint = ({ amount = 0, paymentCode = '', receivingProfile = {} } = {}) => JSON.stringify({
  amount: Math.max(0, Math.round(parseMoney(amount))),
  paymentCode: normalizeTransferCode(paymentCode),
  bankCode: resolveVietQrBankBin(
    receivingProfile.bankQrCode || receivingProfile.bankCode || receivingProfile.bankName
  ) || normalizeTransferCode(
    receivingProfile.bankQrCode || receivingProfile.bankCode || receivingProfile.bankName
  ),
  accountNumber: cleanBankAccountNumber(receivingProfile.accountNumber || ''),
  accountName: `${receivingProfile.accountName || ''}`.trim().toUpperCase(),
  isVirtualAccount: Boolean(receivingProfile.isVirtualAccount)
});

const mapSepayPaymentRequest = ({ order, amount, paymentCode, qrCode, qrPayload = '', receivingProfile }) => ({
  orderId: order.id,
  orderCode: getOrderInvoiceCode(order),
  paymentCode,
  paymentLinkId: `sepay_${safeDocIdPart(getOrderInvoiceCode(order))}`,
  checkoutUrl: qrCode,
  qrCode: qrPayload || qrCode,
  qrImageUrl: qrCode,
  paymentQrImageUrl: qrCode,
  paymentQrUrl: qrCode,
  paymentQrPayload: qrPayload || qrCode,
  amount,
  paymentStatus: 'pending',
  provider: 'sepay',
  receivingBankName: receivingProfile.bankName,
  receivingBankCode: receivingProfile.bankCode,
  receivingBankAccountNumber: receivingProfile.accountNumber,
  receivingBankAccountName: receivingProfile.accountName,
  receivingBankMainAccountNumber: receivingProfile.mainAccountNumber || '',
  receivingBankVirtualAccountNumber: receivingProfile.virtualAccountNumber || '',
  receivingBankIsVirtualAccount: Boolean(receivingProfile.isVirtualAccount),
  paymentQrFingerprint: buildSepayPaymentQrFingerprint({ amount, paymentCode, receivingProfile })
});

const mapCustomerDebtPaymentIntent = (intent = {}) => ({
  intentId: intent.id || intent.intentId || '',
  orderIds: Array.isArray(intent.orderIds) ? intent.orderIds : [],
  orderCount: Array.isArray(intent.orderIds) ? intent.orderIds.length : 0,
  amount: parseMoney(intent.amount || intent.totalAmount),
  paymentCode: intent.paymentCode || '',
  paymentLinkId: intent.paymentLinkId || intent.id || '',
  checkoutUrl: intent.qrImageUrl || intent.paymentQrImageUrl || '',
  qrCode: intent.qrPayload || intent.qrImageUrl || '',
  qrImageUrl: intent.qrImageUrl || intent.paymentQrImageUrl || '',
  paymentQrImageUrl: intent.qrImageUrl || intent.paymentQrImageUrl || '',
  paymentQrUrl: intent.qrImageUrl || intent.paymentQrImageUrl || '',
  paymentQrPayload: intent.qrPayload || intent.qrImageUrl || '',
  paymentStatus: intent.status || 'pending',
  provider: 'sepay',
  receivingBankName: intent.receivingBankName || '',
  receivingBankCode: intent.receivingBankCode || '',
  receivingBankAccountNumber: intent.receivingBankAccountNumber || '',
  receivingBankAccountName: intent.receivingBankAccountName || ''
});

const buildCustomerDebtPaymentSelectionState = ({
  companyId = '',
  customerId = '',
  customerSnapshot = null,
  customerOrdersSnapshot = null,
  customerPaymentsSnapshot = null,
  selectedOrderSnapshots = [],
  allowSettledOrders = false
} = {}) => {
  if (!customerSnapshot?.exists) {
    throw createRequestError({ statusCode: 404, code: 'customer_not_found', message: 'Khong tim thay ho so khach hang.' });
  }
  const customer = { id: customerSnapshot.id, ...customerSnapshot.data() };
  if (`${customer.companyId || ''}` !== `${companyId || ''}` || customerSnapshot.id !== `${customerId || ''}`) {
    throw createRequestError({ statusCode: 403, code: 'customer_company_mismatch', message: 'Ho so khach hang khong thuoc cong ty dang dang nhap.' });
  }

  const selectedOrders = (Array.isArray(selectedOrderSnapshots) ? selectedOrderSnapshots : []).map((snapshot) => {
    if (!snapshot?.exists) {
      throw createRequestError({ statusCode: 404, code: 'order_not_found', message: 'Co hoa don khong con ton tai. Hay tai lai danh sach cong no.' });
    }
    const order = { id: snapshot.id, ...snapshot.data() };
    if (`${order.companyId || ''}` !== `${companyId || ''}` || getCustomerIdFromOrder(order) !== `${customerId || ''}`) {
      throw createRequestError({ statusCode: 403, code: 'customer_order_denied', message: 'Hoa don khong thuoc tai khoan khach hang nay.' });
    }
    if (order.isArchived || ['cancelled', 'canceled'].includes(`${order.status || order.reviewStatus || ''}`.toLowerCase())) {
      throw createRequestError({ statusCode: 409, code: 'order_not_payable', message: 'Co hoa don da huy hoac luu tru, khong the thanh toan.' });
    }
    return order;
  });

  const orderById = new Map();
  (customerOrdersSnapshot?.docs || []).forEach((snapshot) => {
    const order = { id: snapshot.id, ...snapshot.data() };
    if (`${order.companyId || ''}` === `${companyId || ''}` && getCustomerIdFromOrder(order) === `${customerId || ''}`) {
      orderById.set(order.id, order);
    }
  });
  selectedOrders.forEach(order => orderById.set(order.id, order));
  const customerPayments = (customerPaymentsSnapshot?.docs || [])
    .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
    .filter(payment => `${payment.companyId || ''}` === `${companyId || ''}` && `${payment.customerId || ''}` === `${customerId || ''}`);
  const ledger = buildCustomerDebtLedger({
    customer,
    orders: [...orderById.values()],
    payments: customerPayments
  });
  const ledgerOrderById = new Map(ledger.orders.map(order => [order.id, order]));
  const items = selectedOrders.map((order) => {
    const amount = parseMoney(ledger.orderOutstandingById.get(order.id));
    if (amount <= 0 && !allowSettledOrders) {
      throw createRequestError({ statusCode: 409, code: 'order_already_paid', message: 'Co hoa don da het no. Hay tai lai danh sach cong no.' });
    }
    return {
      orderId: order.id,
      orderCode: getOrderInvoiceCode(order),
      amount
    };
  });

  return {
    customer,
    selectedOrders,
    orderById,
    ledger,
    ledgerOrderById,
    items,
    totalAmount: items.reduce((total, item) => total + item.amount, 0)
  };
};

const findCustomerDebtPaymentIntentByTokens = async (appId, tokens = []) => {
  const normalizedTokens = normalizeCustomerDebtPaymentLookupTokens(tokens);
  if (!normalizedTokens.length) return null;
  const lookupRef = db.collection(collectionPath(appId, 'customer_payment_intent_lookup'));
  const intentRef = db.collection(collectionPath(appId, 'customer_payment_intents'));
  for (const token of normalizedTokens) {
    const lookupSnap = await lookupRef.doc(safeDocIdPart(token)).get();
    if (!lookupSnap.exists) continue;
    const intentId = `${lookupSnap.data()?.intentId || ''}`.trim();
    if (!intentId) continue;
    const intentSnap = await intentRef.doc(intentId).get();
    if (intentSnap.exists) return intentSnap;
  }
  return null;
};

const applyCustomerDebtPaymentIntent = async ({
  appId,
  intentDoc,
  paidAmount,
  description,
  reference = '',
  rawPayload = {},
  trace = null
}) => {
  const safePaidAmount = parseMoney(paidAmount);
  if (safePaidAmount <= 0) return { success: true, status: 'need_reconciliation', reason: 'invalid_amount' };

  const intentData = { id: intentDoc.id, ...intentDoc.data() };
  const paymentCode = normalizeTransferCode(intentData.paymentCode);
  if (!paymentCode || !normalizeTransferCode(description).includes(paymentCode)) {
    return { success: true, status: 'need_reconciliation', reason: 'payment_intent_code_mismatch' };
  }

  const rawIdentity = `${reference || rawPayload?.data?.id || rawPayload?.id || rawPayload?.transactionDate || ''}`.trim();
  const identityHash = crypto.createHash('sha256')
    .update(JSON.stringify({ paymentCode, safePaidAmount, rawIdentity, description }))
    .digest('hex')
    .slice(0, 24);
  const paymentIdentity = safeDocIdPart(rawIdentity) || identityHash;
  const settlementId = `customer_debt_${safeDocIdPart(intentDoc.id)}_${paymentIdentity}`;
  const settlementRef = db.collection(collectionPath(appId, 'customer_payment_intent_transactions')).doc(settlementId);
  const ordersRef = db.collection(collectionPath(appId, 'orders'));
  const paymentsRef = db.collection(collectionPath(appId, 'payments'));
  const customerRef = db.collection(collectionPath(appId, 'customers')).doc(`${intentData.customerId || ''}`);
  const lookupRef = db.collection(collectionPath(appId, 'customer_payment_intent_lookup')).doc(safeDocIdPart(paymentCode));
  const customerOrdersQuery = ordersRef
    .where('companyId', '==', `${intentData.companyId || ''}`)
    .where('customerId', '==', `${intentData.customerId || ''}`);
  const customerPaymentsQuery = paymentsRef
    .where('companyId', '==', `${intentData.companyId || ''}`)
    .where('customerId', '==', `${intentData.customerId || ''}`);
  const selectedOrderRefs = normalizeCustomerDebtPaymentOrderIds(intentData.orderIds)
    .map(orderId => ordersRef.doc(orderId));
  const transactionDate = resolveSepayTransactionDate(rawPayload);
  const transactionAt = transactionDate.toISOString();
  const paymentDateKey = getVietnamDateKey(transactionDate);
  const transactionDateText = resolvePayosTransactionDateText(rawPayload) || transactionAt;
  const now = new Date().toISOString();

  markPaymentTrace(trace, 'customer_intent_transaction_start', { intentId: intentDoc.id, settlementId });
  const result = await db.runTransaction(async (transaction) => {
    const [
      settlementSnap,
      latestIntentSnap,
      customerSnapshot,
      customerOrdersSnapshot,
      customerPaymentsSnapshot,
      ...selectedOrderSnapshots
    ] = await Promise.all([
      transaction.get(settlementRef),
      transaction.get(intentDoc.ref),
      transaction.get(customerRef),
      transaction.get(customerOrdersQuery),
      transaction.get(customerPaymentsQuery),
      ...selectedOrderRefs.map(orderRef => transaction.get(orderRef))
    ]);
    if (settlementSnap.exists) {
      return { success: true, status: 'duplicate_ignored', settlementId, allocations: [] };
    }
    if (!latestIntentSnap.exists) {
      return { success: true, status: 'need_reconciliation', reason: 'payment_intent_not_found', allocations: [] };
    }

    const latestIntent = { id: latestIntentSnap.id, ...latestIntentSnap.data() };
    if (['paid', 'completed'].includes(`${latestIntent.status || ''}`.toLowerCase())) {
      return { success: true, status: 'duplicate_ignored', reason: 'payment_intent_completed', settlementId, allocations: [] };
    }

    let selection;
    try {
      selection = buildCustomerDebtPaymentSelectionState({
        companyId: latestIntent.companyId,
        customerId: latestIntent.customerId,
        customerSnapshot,
        customerOrdersSnapshot,
        customerPaymentsSnapshot,
        selectedOrderSnapshots,
        allowSettledOrders: true
      });
    } catch (error) {
      return {
        success: true,
        status: 'need_reconciliation',
        reason: error?.code || 'payment_intent_selection_invalid',
        settlementId,
        allocations: []
      };
    }

    const allocationResult = allocateCustomerDebtPayment({
      items: selection.items,
      orderOutstandingById: selection.ledger.orderOutstandingById,
      paidAmount: safePaidAmount
    });
    if (allocationResult.appliedAmount <= 0) {
      return { success: true, status: 'need_reconciliation', reason: 'no_outstanding_invoice', settlementId, allocations: [] };
    }

    const appliedAllocations = [];
    for (const allocation of allocationResult.allocations) {
      if (allocation.appliedAmount <= 0) continue;
      const order = selection.orderById.get(allocation.orderId);
      const ledgerOrder = selection.ledgerOrderById.get(allocation.orderId);
      if (!order || !ledgerOrder) continue;
      const nextPaidAmount = Math.max(0, parseMoney(ledgerOrder.amount) - allocation.remainingAmount);
      const nextStatus = allocation.remainingAmount <= 0 ? 'paid' : 'partial';
      const paymentId = `sepay_${safeDocIdPart(order.id)}_${paymentIdentity}`;
      const paymentRef = paymentsRef.doc(paymentId);
      const settlementType = allocation.remainingAmount > 0 ? 'partial' : 'exact';

      transaction.set(paymentRef, {
        id: paymentId,
        companyId: order.companyId || '',
        customerId: getCustomerIdFromOrder(order),
        customerName: order.customerNameSnapshot || order.customerName || order.customer || '',
        amount: allocation.appliedAmount,
        appliedAmount: allocation.appliedAmount,
        overpaidAmount: 0,
        outstandingAmount: allocation.remainingAmount,
        remainingDebt: allocation.remainingAmount,
        paymentStatus: nextStatus,
        paymentSettlementType: settlementType,
        method: 'SePay',
        bankName: latestIntent.receivingBankName || 'SePay',
        bankCode: latestIntent.receivingBankCode || '',
        receivingBankName: latestIntent.receivingBankName || '',
        receivingBankCode: latestIntent.receivingBankCode || '',
        paymentProvider: 'sepay',
        paymentLinkId: latestIntent.id,
        sepayPaymentCode: paymentCode,
        referenceCode: reference || '',
        bankContent: paymentCode,
        note: `SePay ${paymentCode}`,
        date: paymentDateKey,
        paymentDate: paymentDateKey,
        transactionDate: paymentDateKey,
        transactionDateTime: transactionDateText,
        paidAt: transactionAt,
        transactionAt,
        matchedOrderId: order.id,
        matchedOrderCode: getOrderInvoiceCode(order),
        targetOrderId: order.id,
        autoMatchedByOrderCode: true,
        customerDebtPaymentIntentId: latestIntent.id,
        sourceType: 'sepay_customer_debt_webhook',
        sourceLabel: latestIntent.receivingBankName || 'SePay',
        sourceOrderId: order.id,
        createdByEmpId: 'system_sepay',
        empId: 'system_sepay',
        createdByRole: 'system',
        status: 'paid',
        approvalStatus: 'approved',
        handoverStatus: 'confirmed',
        isConfirmed: true,
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
        webhookReceivedAt: now,
        isArchived: false,
        rawWebhook: rawPayload
      }, { merge: false });

      transaction.set(ordersRef.doc(order.id), {
        paymentStatus: nextStatus,
        sepayPaymentStatus: nextStatus,
        paymentSettlementType: settlementType,
        paidAt: nextStatus === 'paid' ? transactionAt : (order.paidAt || ''),
        partialPaidAt: nextStatus === 'partial' ? transactionAt : (order.partialPaidAt || ''),
        paidAmount: nextPaidAmount,
        appliedAmount: nextPaidAmount,
        outstandingAmount: allocation.remainingAmount,
        lastPaymentId: paymentId,
        lastSepayWebhookAt: now,
        updatedAt: now
      }, { merge: true });
      appliedAllocations.push({
        ...allocation,
        paymentId,
        status: nextStatus,
        order
      });
    }

    const appliedAmount = appliedAllocations.reduce((total, allocation) => total + allocation.appliedAmount, 0);
    const remainingOutstanding = allocationResult.remainingOutstanding;
    const overpaidAmount = Math.max(0, safePaidAmount - appliedAmount);
    const nextIntentStatus = remainingOutstanding <= 0 ? 'paid' : 'partial';
    const remainingCustomerDebt = Math.max(0, selection.ledger.currentDebt - safePaidAmount);

    if (overpaidAmount > 0) {
      const creditPaymentId = `sepay_credit_${safeDocIdPart(latestIntent.id)}_${paymentIdentity}`;
      transaction.set(paymentsRef.doc(creditPaymentId), {
        id: creditPaymentId,
        companyId: latestIntent.companyId || '',
        customerId: latestIntent.customerId || '',
        customerName: selection.customer.name || selection.customer.customerName || '',
        amount: overpaidAmount,
        appliedAmount: 0,
        overpaidAmount,
        outstandingAmount: 0,
        remainingDebt: remainingCustomerDebt,
        paymentStatus: 'paid',
        paymentSettlementType: 'overpaid',
        method: 'SePay',
        bankName: latestIntent.receivingBankName || 'SePay',
        bankCode: latestIntent.receivingBankCode || '',
        paymentProvider: 'sepay',
        paymentLinkId: latestIntent.id,
        sepayPaymentCode: paymentCode,
        referenceCode: reference || '',
        bankContent: paymentCode,
        note: `SePay ${paymentCode} - tien du`,
        date: paymentDateKey,
        paymentDate: paymentDateKey,
        transactionDate: paymentDateKey,
        transactionDateTime: transactionDateText,
        paidAt: transactionAt,
        transactionAt,
        customerDebtPaymentIntentId: latestIntent.id,
        sourceType: 'sepay_customer_debt_credit',
        sourceLabel: latestIntent.receivingBankName || 'SePay',
        allocateOldestFirst: true,
        createdByEmpId: 'system_sepay',
        empId: 'system_sepay',
        createdByRole: 'system',
        status: 'paid',
        approvalStatus: 'approved',
        handoverStatus: 'confirmed',
        isConfirmed: true,
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
        webhookReceivedAt: now,
        isArchived: false,
        rawWebhook: rawPayload
      }, { merge: false });
    }

    transaction.set(intentDoc.ref, {
      status: nextIntentStatus,
      paidAmount: parseMoney(latestIntent.paidAmount) + safePaidAmount,
      appliedAmount: parseMoney(latestIntent.appliedAmount) + appliedAmount,
      outstandingAmount: remainingOutstanding,
      overpaidAmount: parseMoney(latestIntent.overpaidAmount) + overpaidAmount,
      lastSettlementId: settlementId,
      lastTransactionAt: transactionAt,
      paidAt: nextIntentStatus === 'paid' ? transactionAt : (latestIntent.paidAt || ''),
      updatedAt: now
    }, { merge: true });
    transaction.set(lookupRef, {
      status: nextIntentStatus,
      paidAmount: parseMoney(latestIntent.paidAmount) + safePaidAmount,
      appliedAmount: parseMoney(latestIntent.appliedAmount) + appliedAmount,
      outstandingAmount: remainingOutstanding,
      lastSettlementId: settlementId,
      updatedAt: now
    }, { merge: true });
    transaction.set(settlementRef, {
      id: settlementId,
      intentId: intentDoc.id,
      companyId: latestIntent.companyId || '',
      customerId: latestIntent.customerId || '',
      paymentCode,
      paidAmount: safePaidAmount,
      appliedAmount,
      overpaidAmount,
      outstandingAmount: remainingOutstanding,
      allocations: appliedAllocations.map(({ order, ...allocation }) => allocation),
      transactionAt,
      paymentDateKey,
      referenceCode: reference || '',
      status: nextIntentStatus,
      rawWebhook: rawPayload,
      createdAt: now,
      updatedAt: now
    }, { merge: false });
    if (`${latestIntent.customerId || ''}`) {
      transaction.set(customerRef, {
        lastPaymentAt: transactionAt,
        lastPaymentDate: paymentDateKey,
        lastPaymentAmount: safePaidAmount,
        lastPaymentAppliedAmount: appliedAmount,
        lastPaymentOverpaidAmount: overpaidAmount,
        lastPaymentRemainingDebt: remainingCustomerDebt,
        lastPaymentSettlementType: nextIntentStatus,
        updatedAt: now
      }, { merge: true });
    }

    return {
      success: true,
      status: nextIntentStatus,
      settlementId,
      appliedAmount,
      overpaidAmount,
      outstandingAmount: remainingOutstanding,
      allocations: appliedAllocations
    };
  });

  if (result.allocations?.length) {
    await Promise.allSettled(result.allocations.map(allocation => enqueuePaymentNotificationJob({
      appId,
      order: allocation.order,
      paymentId: allocation.paymentId,
      paidAmount: allocation.appliedAmount,
      appliedAmount: allocation.appliedAmount,
      overpaidAmount: 0,
      outstandingAmount: allocation.remainingAmount,
      status: allocation.status,
      receivingBankName: intentData.receivingBankName || 'SePay',
      paymentDateKey,
      transactionAt,
      now,
      provider: 'sepay',
      providerLabel: 'SePay'
    })));
  }
  markPaymentTrace(trace, 'customer_intent_transaction_complete', {
    intentId: intentDoc.id,
    status: result.status,
    allocationCount: result.allocations?.length || 0
  });
  return {
    ...result,
    allocations: result.allocations?.map(({ order, ...allocation }) => allocation) || []
  };
};

exports.createCustomerDebtPaymentRequest = functions.https.onRequest(runProtectedCustomerRequest(async ({
  req,
  appId,
  customerIdentity
}) => {
  const rawOrderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
  const orderIds = normalizeCustomerDebtPaymentOrderIds(rawOrderIds);
  if (!orderIds.length) {
    throw createRequestError({ statusCode: 400, code: 'order_selection_required', message: 'Hay chon it nhat mot hoa don can thanh toan.' });
  }
  if (new Set(rawOrderIds.map(orderId => `${orderId || ''}`.trim()).filter(Boolean)).size > MAX_CUSTOMER_DEBT_PAYMENT_ORDERS) {
    throw createRequestError({ statusCode: 400, code: 'too_many_orders', message: `Chi ho tro toi da ${MAX_CUSTOMER_DEBT_PAYMENT_ORDERS} hoa don trong mot lan thanh toan.` });
  }

  const ordersRef = db.collection(collectionPath(appId, 'orders'));
  const paymentsRef = db.collection(collectionPath(appId, 'payments'));
  const customerRef = db.collection(collectionPath(appId, 'customers')).doc(customerIdentity.customerId);
  const selectedOrderRefs = orderIds.map(orderId => ordersRef.doc(orderId));
  const initialOrderSnap = await selectedOrderRefs[0].get();
  if (!initialOrderSnap.exists) {
    throw createRequestError({ statusCode: 404, code: 'order_not_found', message: 'Hoa don khong con ton tai. Hay tai lai danh sach cong no.' });
  }
  const initialOrder = { id: initialOrderSnap.id, ...initialOrderSnap.data() };
  if (
    `${initialOrder.companyId || ''}` !== `${customerIdentity.companyId || ''}`
    || getCustomerIdFromOrder(initialOrder) !== `${customerIdentity.customerId || ''}`
  ) {
    throw createRequestError({ statusCode: 403, code: 'customer_order_denied', message: 'Hoa don khong thuoc tai khoan khach hang nay.' });
  }
  if (initialOrder.isArchived || ['cancelled', 'canceled'].includes(`${initialOrder.status || initialOrder.reviewStatus || ''}`.toLowerCase())) {
    throw createRequestError({ statusCode: 409, code: 'order_not_payable', message: 'Hoa don da huy hoac luu tru, khong the thanh toan.' });
  }
  const receivingProfile = await resolveSepayReceivingProfile(appId, initialOrder, {}, {});
  if (!receivingProfile.accountNumber) {
    throw createRequestError({ statusCode: 400, code: 'receiving_account_missing', message: 'Cong ty chua cau hinh tai khoan nhan tien.' });
  }
  const customerOrdersQuery = ordersRef
    .where('companyId', '==', customerIdentity.companyId)
    .where('customerId', '==', customerIdentity.customerId);
  const customerPaymentsQuery = paymentsRef
    .where('companyId', '==', customerIdentity.companyId)
    .where('customerId', '==', customerIdentity.customerId);

  const result = await db.runTransaction(async (transaction) => {
    const [customerSnapshot, customerOrdersSnapshot, customerPaymentsSnapshot, ...selectedOrderSnapshots] = await Promise.all([
      transaction.get(customerRef),
      transaction.get(customerOrdersQuery),
      transaction.get(customerPaymentsQuery),
      ...selectedOrderRefs.map(orderRef => transaction.get(orderRef))
    ]);
    const selection = buildCustomerDebtPaymentSelectionState({
      companyId: customerIdentity.companyId,
      customerId: customerIdentity.customerId,
      customerSnapshot,
      customerOrdersSnapshot,
      customerPaymentsSnapshot,
      selectedOrderSnapshots
    });
    const items = selection.items;
    const totalAmount = selection.totalAmount;
    const fingerprint = buildCustomerDebtPaymentFingerprint({
      companyId: customerIdentity.companyId,
      customerId: customerIdentity.customerId,
      items,
      receivingProfile
    });
    const intentId = buildCustomerDebtPaymentIntentId(fingerprint);
    const paymentCode = resolveCustomerDebtPaymentCode({ fingerprint, items });
    const intentRef = db.collection(collectionPath(appId, 'customer_payment_intents')).doc(intentId);
    const lookupRef = db.collection(collectionPath(appId, 'customer_payment_intent_lookup')).doc(safeDocIdPart(paymentCode));
    const existingIntentSnap = await transaction.get(intentRef);
    if (existingIntentSnap.exists) {
      const existingIntent = { id: existingIntentSnap.id, ...existingIntentSnap.data() };
      if (['pending', 'partial'].includes(`${existingIntent.status || ''}`.toLowerCase())) {
        return { reused: true, intent: existingIntent };
      }
      throw createRequestError({
        statusCode: 409,
        code: 'payment_intent_completed',
        message: 'Phien thanh toan nay da hoan tat. Hay tai lai danh sach cong no.'
      });
    }

    const qrImageUrl = buildSepayQrImageUrl({ receivingProfile, amount: totalAmount, description: paymentCode });
    const qrPayload = buildSepayQrPayload({ receivingProfile, amount: totalAmount, description: paymentCode });
    if (!qrImageUrl && !qrPayload) {
      throw createRequestError({ statusCode: 500, code: 'qr_generation_failed', message: 'Khong tao duoc QR thanh toan cong no.' });
    }
    const now = new Date().toISOString();
    const intent = {
      id: intentId,
      intentId,
      companyId: customerIdentity.companyId,
      customerId: customerIdentity.customerId,
      appUserId: customerIdentity.appUserId,
      identityId: customerIdentity.identityId,
      fingerprint,
      paymentCode,
      paymentLinkId: intentId,
      orderIds,
      items,
      amount: totalAmount,
      totalAmount,
      paidAmount: 0,
      appliedAmount: 0,
      outstandingAmount: totalAmount,
      overpaidAmount: 0,
      status: 'pending',
      provider: 'sepay',
      qrImageUrl,
      paymentQrImageUrl: qrImageUrl,
      qrPayload: qrPayload || qrImageUrl,
      receivingBankName: receivingProfile.bankName,
      receivingBankCode: receivingProfile.bankCode,
      receivingBankAccountNumber: receivingProfile.accountNumber,
      receivingBankAccountName: receivingProfile.accountName,
      receivingBankMainAccountNumber: receivingProfile.mainAccountNumber || '',
      receivingBankVirtualAccountNumber: receivingProfile.virtualAccountNumber || '',
      receivingBankIsVirtualAccount: Boolean(receivingProfile.isVirtualAccount),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(intentRef, intent, { merge: false });
    transaction.set(lookupRef, {
      id: safeDocIdPart(paymentCode),
      paymentCode,
      intentId,
      companyId: customerIdentity.companyId,
      customerId: customerIdentity.customerId,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }, { merge: false });
    return { reused: false, intent };
  });
  return { success: true, reused: result.reused, payment: mapCustomerDebtPaymentIntent(result.intent) };
}, 'Khong tao duoc QR thanh toan cong no.'));

exports.createSepayPaymentRequest = functions.https.onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });

  const trace = createPaymentTrace({
    flow: 'create_qr',
    provider: 'sepay',
    appId: req.body?.appId,
    orderId: req.body?.orderId,
    requestId: `${req.headers['x-request-id'] || ''}`.trim()
  });
  markPaymentTrace(trace, 'request_received');

  try {
    const appId = normalizeAppId(req.body?.appId);
    const claims = await verifyTenantIdentityRequest(req, appId);
    markPaymentTrace(trace, 'auth_verified');
    trace.appId = appId;
    const orderId = `${req.body?.orderId || ''}`.trim();
    trace.orderId = orderId;
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thieu orderId.' });

    const orderRef = db.collection(collectionPath(appId, 'orders')).doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return sendJson(res, 404, { success: false, message: 'Khong tim thay don hang.' });
    markPaymentTrace(trace, 'order_loaded');

    const order = { id: orderSnap.id, ...orderSnap.data() };
    verifyTenantOrderRequest({ claims, appId, order });
    if (order.status === 'cancelled' || order.isArchived) {
      return sendJson(res, 409, { success: false, message: 'Don da huy hoac da luu tru, khong the tao SePay.' });
    }
    if (order.paymentStatus === 'paid' || order.sepayPaymentStatus === 'paid') {
      return sendJson(res, 409, { success: false, message: 'Don nay da thanh toan.' });
    }

    const amount = resolveOrderPaymentDueAmount(order, req.body?.amount);
    if (amount <= 0) return sendJson(res, 400, { success: false, message: 'So tien thanh toan khong hop le.' });

    const paymentCode = buildOrderTransferMemo(order);
    trace.paymentCode = paymentCode;
    if (!paymentCode) return sendJson(res, 400, { success: false, message: 'Don hang chua co ma hoa don de tao noi dung chuyen khoan.' });

    const receivingProfile = await resolveSepayReceivingProfile(appId, order, req.body || {}, req.body || {});
    if (!receivingProfile.accountNumber) {
      return sendJson(res, 400, { success: false, message: 'Chua cau hinh so tai khoan nhan tien cua cong ty.' });
    }

    const existingPayload = `${order.paymentQrPayload || order.sepayQrPayload || ''}`.trim();
    const existingQr = `${order.paymentQrImageUrl || order.paymentQrUrl || order.checkoutUrl || order.sepayQrCode || ''}`.trim();
    const currentReceivingAccountNumber = cleanBankAccountNumber(receivingProfile.accountNumber);
    const existingReceivingAccountNumber = cleanBankAccountNumber(
      order.receivingBankAccountNumber
        || order.companyBankAccountNumber
        || order.bankAccountNumber
        || ''
    );
    const existingQrAccountNumber = extractBankAccountNumberFromQrSource(existingQr);
    const isExistingQrAligned = !currentReceivingAccountNumber
      || (
        (!existingReceivingAccountNumber || existingReceivingAccountNumber === currentReceivingAccountNumber)
        && (!existingQrAccountNumber || existingQrAccountNumber === currentReceivingAccountNumber)
      );
    const currentReceivingBankBin = resolveVietQrBankBin(receivingProfile.bankQrCode || receivingProfile.bankCode || receivingProfile.bankName);
    const existingReceivingBankBin = resolveVietQrBankBin(
      order.receivingBankCode
        || order.paymentBankCode
        || order.companyBankCode
        || order.bankCode
        || order.receivingBankName
        || order.companyBankName
        || ''
    );
    const existingQrBankBin = resolveVietQrBankBin(extractBankCodeFromQrSource(existingQr));
    const isExistingQrBankAligned = !currentReceivingBankBin
      || (
        (!existingReceivingBankBin || existingReceivingBankBin === currentReceivingBankBin)
        && (!existingQrBankBin || existingQrBankBin === currentReceivingBankBin)
      );
    const existingQrAmount = parseMoney(order.paymentAmount);
    const isExistingQrAmountAligned = existingQrAmount > 0 && Math.abs(existingQrAmount - amount) <= 1;
    const expectedPaymentQrFingerprint = buildSepayPaymentQrFingerprint({
      amount,
      paymentCode,
      receivingProfile
    });
    const storedPaymentQrFingerprint = `${order.paymentQrFingerprint || ''}`.trim();
    const storedPaymentCode = order.sepayPaymentCode || order.paymentCode || '';
    const isExistingQrPaymentCodeAligned = Boolean(storedPaymentCode && paymentCode)
      && normalizeTransferCode(storedPaymentCode) === normalizeTransferCode(paymentCode);
    const isExistingQrFingerprintAligned = storedPaymentQrFingerprint
      ? storedPaymentQrFingerprint === expectedPaymentQrFingerprint
      : isExistingQrPaymentCodeAligned;
    const now = new Date().toISOString();
    const canReuseExistingQr = Boolean(existingQr)
      && `${order.paymentProvider || ''}`.toLowerCase() === 'sepay'
      && isExistingQrAligned
      && isExistingQrBankAligned
      && isExistingQrAmountAligned
      && isExistingQrFingerprintAligned;
    if (canReuseExistingQr) {
      await writePaymentLookupDocs({
        appId,
        orderId,
        invoiceCode: getOrderInvoiceCode(order),
        paymentCode: order.sepayPaymentCode || order.paymentCode || paymentCode,
        provider: 'sepay',
        amount,
        status: order.sepayPaymentStatus || order.paymentStatus || 'pending',
        aliases: [
          formatOrderCode(order.id),
          `TT ${formatOrderCode(order.id)}`,
          order.sepayPaymentCode,
          order.paymentCode,
          order.matchedOrderCode
        ]
      });
      await orderRef.set({
        paymentAmount: amount,
        paymentQrFingerprint: expectedPaymentQrFingerprint,
        paymentLookupSyncedAt: now,
        updatedAt: now
      }, { merge: true });
      markPaymentTrace(trace, 'qr_reused', { elapsed: summarizePaymentTrace(trace)?.elapsedMs });
      return sendJson(res, 200, {
        success: true,
        performance: summarizePaymentTrace(trace),
        payment: mapSepayPaymentRequest({
          order,
          amount,
          paymentCode: order.sepayPaymentCode || order.paymentCode || paymentCode,
          qrCode: existingQr,
          qrPayload: existingPayload || existingQr,
          receivingProfile
        })
      });
    }

    const qrCode = buildSepayQrImageUrl({ receivingProfile, amount, description: paymentCode });
    const qrPayload = buildSepayQrPayload({ receivingProfile, amount, description: paymentCode });
    if (!qrPayload && !qrCode) return sendJson(res, 500, { success: false, message: 'Chua tao duoc ma QR SePay.' });
    markPaymentTrace(trace, 'qr_built');

    const invoiceCode = getOrderInvoiceCode(order);
    const payment = mapSepayPaymentRequest({ order, amount, paymentCode, qrCode, qrPayload, receivingProfile });
    markPaymentTrace(trace, 'order_payment_write_start');
    await retryPaymentOperation('create_qr_firestore_write', async () => {
      await orderRef.set({
        paymentProvider: 'sepay',
        invoiceCode,
        paymentCode,
        paymentAmount: amount,
        paymentLinkId: payment.paymentLinkId,
        checkoutUrl: qrCode,
        paymentCheckoutUrl: qrCode,
        paymentQrUrl: qrCode,
        paymentQrImageUrl: qrCode,
        paymentQrPayload: qrPayload || qrCode,
        qrCode: qrPayload || qrCode,
        sepayPaymentStatus: 'pending',
        sepayPaymentCode: paymentCode,
        sepayQrCode: qrPayload || qrCode,
        sepayQrPayload: qrPayload || qrCode,
        receivingBankName: receivingProfile.bankName,
        receivingBankCode: receivingProfile.bankCode,
        receivingBankAccountNumber: receivingProfile.accountNumber,
        receivingBankAccountName: receivingProfile.accountName,
        receivingBankMainAccountNumber: receivingProfile.mainAccountNumber || '',
        receivingBankVirtualAccountNumber: receivingProfile.virtualAccountNumber || '',
        receivingBankIsVirtualAccount: Boolean(receivingProfile.isVirtualAccount),
        paymentQrFingerprint: payment.paymentQrFingerprint,
        paymentLookupSyncedAt: now,
        sepayCreatedAt: now,
        updatedAt: now
      }, { merge: true });
      await writePaymentLookupDocs({
        appId,
        orderId,
        invoiceCode,
        paymentCode,
        provider: 'sepay',
        amount,
        status: 'pending',
        aliases: [
          formatOrderCode(order.id),
          `TT ${formatOrderCode(order.id)}`,
          order.sepayPaymentCode,
          order.paymentCode,
          order.matchedOrderCode
        ]
      });
    }, {
      trace
    });
    markPaymentTrace(trace, 'order_payment_written');

    return sendJson(res, 200, { success: true, performance: summarizePaymentTrace(trace), payment });
  } catch (error) {
    if (Number(error?.statusCode || 500) >= 500) console.error('createSepayPaymentRequest failed', error);
    markPaymentTrace(trace, 'request_failed', { errorMessage: error.message || `${error}` });
    return sendProtectedEndpointError(res, error, 'Khong tao duoc QR SePay.');
  }
});

exports.sepayWebhook = functions.https.onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });

  const appId = normalizeAppId(req.query?.appId || req.body?.appId || req.body?.data?.appId);
  const webhookData = getSepayWebhookData(req.body || {});
  const trace = createPaymentTrace({
    flow: 'webhook',
    provider: 'sepay',
    appId,
    paymentCode: resolvePaymentDescription(webhookData, req.body)
  });
  markPaymentTrace(trace, 'webhook_received', {
    transferType: webhookData.transferType || webhookData.type || '',
    amount: parseMoney(webhookData.transferAmount || webhookData.amount)
  });

  try {
    if (!verifySepayWebhookRequest(req)) {
      markPaymentTrace(trace, 'webhook_rejected');
      return sendJson(res, 401, { success: false, message: 'Webhook SePay khong hop le.' });
    }
    markPaymentTrace(trace, 'webhook_verified');

    const transferType = `${webhookData.transferType || webhookData.type || ''}`.toLowerCase();
    if (transferType && transferType !== 'in') {
      markPaymentTrace(trace, 'webhook_ignored_not_money_in');
      return sendJson(res, 200, { success: true, ignored: true, reason: 'not_money_in' });
    }

    const paidAmount = parseMoney(webhookData.transferAmount || webhookData.amount);
    const description = resolvePaymentDescription(webhookData, req.body) || `${webhookData.content || webhookData.description || webhookData.code || ''}`.trim();
    trace.paymentCode = description;
    const invoiceTokens = extractInvoiceCodeTokens(description, webhookData.content, webhookData.description, webhookData.referenceCode, webhookData.code);
    if (!invoiceTokens.length && /sepay\s+test\s+webhook\s+delivery/i.test(description)) {
      markPaymentTrace(trace, 'webhook_test_accepted');
      return sendJson(res, 200, { success: true, status: 'test_accepted' });
    }
    const customerDebtIntentDoc = await findCustomerDebtPaymentIntentByTokens(appId, invoiceTokens);
    if (customerDebtIntentDoc) {
      markPaymentTrace(trace, 'customer_intent_lookup_found', { intentId: customerDebtIntentDoc.id });
      const result = await applyCustomerDebtPaymentIntent({
        appId,
        intentDoc: customerDebtIntentDoc,
        paidAmount,
        description,
        reference: webhookData.referenceCode || webhookData.id || `${webhookData.transactionDate || Date.now()}`,
        rawPayload: req.body,
        trace
      });
      return sendJson(res, 200, { success: true, performance: summarizePaymentTrace(trace), ...result });
    }
    markPaymentTrace(trace, 'order_lookup_start');
    let orderDoc = await findOrderByPayosData(appId, {
      ...webhookData,
      amount: paidAmount,
      description,
      content: webhookData.content || description,
      reference: webhookData.referenceCode || webhookData.id || ''
    }, req.body, { allowLegacyScan: false });

    if (!orderDoc && invoiceTokens.length) {
      markPaymentTrace(trace, 'order_lookup_legacy_scan_start');
      orderDoc = await findOrderByPayosData(appId, {
        ...webhookData,
        amount: paidAmount,
        description,
        content: webhookData.content || description,
        reference: webhookData.referenceCode || webhookData.id || ''
      }, req.body, { allowLegacyScan: true });
    }

    if (!orderDoc) {
      markPaymentTrace(trace, 'order_not_found');
      sendJson(res, 200, { success: true, status: 'need_reconciliation', reason: 'order_not_found' });
      markPaymentTrace(trace, 'webhook_response_sent_need_reconciliation');
      try {
        await writeReconciliation({
          appId,
          reason: 'order_not_found',
          webhookData: req.body,
          provider: 'sepay',
          extra: { paidAmount, description }
        });
        markPaymentTrace(trace, 'reconciliation_written_after_response');
      } catch (writeError) {
        console.error('write sepay reconciliation after response failed', writeError);
        markPaymentTrace(trace, 'reconciliation_write_failed_after_response', { errorMessage: writeError.message || `${writeError}` });
      }
      return;
    }
    trace.orderId = orderDoc.id;
    markPaymentTrace(trace, 'order_lookup_found', { orderId: orderDoc.id });

    const transactionDate = resolveSepayTransactionDate(req.body);
    const result = await applyPayosPaymentToOrder({
      appId,
      orderDoc,
      paidAmount,
      description,
      reference: webhookData.referenceCode || webhookData.id || `${webhookData.transactionDate || Date.now()}`,
      paymentLinkId: webhookData.id || webhookData.referenceCode || '',
      payosOrderCode: webhookData.orderCode || '',
      rawPayload: {
        provider: 'sepay',
        source: 'sepay_webhook',
        data: webhookData,
        transactionDate: webhookData.transactionDate,
        parsedTransactionDate: transactionDate.toISOString()
      },
      sourceType: 'sepay_webhook',
      provider: 'sepay',
      providerLabel: 'SePay',
      trace
    });
    markPaymentTrace(trace, 'webhook_response_ready', { resultStatus: result.status });

    return sendJson(res, 200, { success: true, performance: summarizePaymentTrace(trace), ...result });
  } catch (error) {
    console.error('sepayWebhook failed', error);
    markPaymentTrace(trace, 'webhook_error', { errorMessage: error.message || `${error}` });
    sendJson(res, 200, { success: true, status: 'need_reconciliation', errorLogged: true });
    markPaymentTrace(trace, 'webhook_error_response_sent');
    try {
      await writeReconciliation({
        appId,
        reason: 'webhook_error',
        webhookData: req.body,
        provider: 'sepay',
        extra: { errorMessage: error.message || `${error}` }
      });
    } catch (writeError) {
      console.error('write sepay reconciliation failed', writeError);
    }
    return;
  }
});

exports.syncSepayPaymentStatus = functions.https.onRequest({ secrets: ['SEPAY_API_TOKEN'] }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });

  try {
    const appId = normalizeAppId(req.body?.appId);
    const claims = await verifyTenantIdentityRequest(req, appId);
    const orderId = `${req.body?.orderId || ''}`.trim();
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thieu orderId.' });

    const orderDoc = await db.collection(collectionPath(appId, 'orders')).doc(orderId).get();
    if (!orderDoc.exists) return sendJson(res, 404, { success: false, message: 'Khong tim thay don hang.' });
    const order = { id: orderDoc.id, ...orderDoc.data() };
    verifyTenantOrderRequest({ claims, appId, order });
    const reconciliation = await reconcileSepayTransactionsForApp({ appId, targetOrderDoc: orderDoc });
    const recordedAmount = await getRecordedPayosAmountForOrder(appId, order.id, 'sepay');
    const expectedAmount = parseMoney(order.paymentAmount || order.amount || 0);
    const outstandingAmount = Math.max(0, expectedAmount - recordedAmount);
    return sendJson(res, 200, {
      success: true,
      status: outstandingAmount <= 0 && recordedAmount > 0 ? 'paid' : (recordedAmount > 0 ? 'partial' : 'not_paid_yet'),
      provider: 'sepay',
      amountPaid: recordedAmount,
      recordedAmount,
      outstandingAmount,
      reconciliation: {
        scannedTransactions: reconciliation.transactions.length,
        pagesFetched: reconciliation.pagesFetched,
        matchedTransactions: reconciliation.matchedCount,
        from: reconciliation.from,
        to: reconciliation.to
      }
    });
  } catch (error) {
    if (Number(error?.statusCode || 500) >= 500) console.error('syncSepayPaymentStatus failed', error);
    return sendProtectedEndpointError(res, error, 'Khong kiem tra duoc trang thai SePay.');
  }
});

exports.autoReconcileSepayTransactions = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  region: 'asia-southeast1',
  timeoutSeconds: 120,
  secrets: ['SEPAY_API_TOKEN']
}, async () => {
  const options = getSepayReconciliationOptions();
  if (!options.apiToken) {
    console.error('autoReconcileSepayTransactions skipped: SEPAY_API_TOKEN is not configured.');
    return null;
  }

  const outcomes = [];
  for (const appId of getSepayReconciliationAppIds()) {
    try {
      const result = await reconcileSepayTransactionsForApp({ appId });
      outcomes.push({
        appId,
        scannedTransactions: result.transactions.length,
        pagesFetched: result.pagesFetched,
        matchedTransactions: result.matchedCount
      });
    } catch (error) {
      console.error('autoReconcileSepayTransactions failed', {
        appId,
        message: error?.message || String(error)
      });
      outcomes.push({ appId, status: 'failed' });
    }
  }
  console.info('autoReconcileSepayTransactions completed', { outcomes });
  return null;
});
