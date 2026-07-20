const functions = require('firebase-functions');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { PayOS } = require('@payos/node');
const crypto = require('crypto');

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
      // Keep this fallback outside SePay's webhook hot path because SePay expects a very fast 200.
      const scanSnap = await ordersRef.limit(2000).get();
      for (const docSnap of scanSnap.docs) {
        const order = { id: docSnap.id, ...docSnap.data() };
        const orderCodes = getOrderCodeCandidates(order);
        if (codeTokens.some((token) => orderCodes.includes(normalizeTransferCode(token)))) {
          return docSnap;
        }
      }
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
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return sendJson(res, 401, { success: false, message: 'Thiếu token đăng nhập Firebase.' });
    await admin.auth().verifyIdToken(idToken);

    const appId = normalizeAppId(req.body?.appId);
    const orderId = `${req.body?.orderId || ''}`.trim();
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thiếu orderId.' });

    const orderRef = db.collection(collectionPath(appId, 'orders')).doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return sendJson(res, 404, { success: false, message: 'Không tìm thấy đơn hàng.' });

    const order = { id: orderSnap.id, ...orderSnap.data() };
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
    console.error('createPayosPaymentLink failed', error);
    return sendJson(res, 500, {
      success: false,
      message: error.message || 'Không tạo được link PayOS.'
    });
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
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return sendJson(res, 401, { success: false, message: 'Thieu token dang nhap Firebase.' });
    await admin.auth().verifyIdToken(idToken);

    const appId = normalizeAppId(req.body?.appId);
    const orderId = `${req.body?.orderId || ''}`.trim();
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thieu orderId.' });

    const orderDoc = await db.collection(collectionPath(appId, 'orders')).doc(orderId).get();
    if (!orderDoc.exists) return sendJson(res, 404, { success: false, message: 'Khong tim thay don hang.' });

    const order = { id: orderDoc.id, ...orderDoc.data() };
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
    console.error('syncPayosPaymentStatus failed', error);
    return sendJson(res, 500, {
      success: false,
      message: error.message || 'Khong dong bo duoc trang thai PayOS.'
    });
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
  receivingBankIsVirtualAccount: Boolean(receivingProfile.isVirtualAccount)
});

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
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return sendJson(res, 401, { success: false, message: 'Thieu token dang nhap Firebase.' });
    await admin.auth().verifyIdToken(idToken);
    markPaymentTrace(trace, 'auth_verified');

    const appId = normalizeAppId(req.body?.appId);
    trace.appId = appId;
    const orderId = `${req.body?.orderId || ''}`.trim();
    trace.orderId = orderId;
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thieu orderId.' });

    const orderRef = db.collection(collectionPath(appId, 'orders')).doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return sendJson(res, 404, { success: false, message: 'Khong tim thay don hang.' });
    markPaymentTrace(trace, 'order_loaded');

    const order = { id: orderSnap.id, ...orderSnap.data() };
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
    const now = new Date().toISOString();
    const canReuseExistingQr = Boolean(existingQr)
      && `${order.paymentProvider || ''}`.toLowerCase() === 'sepay'
      && isExistingQrAligned
      && isExistingQrBankAligned
      && isExistingQrAmountAligned;
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
    console.error('createSepayPaymentRequest failed', error);
    markPaymentTrace(trace, 'request_failed', { errorMessage: error.message || `${error}` });
    return sendJson(res, 500, {
      success: false,
      message: error.message || 'Khong tao duoc QR SePay.'
    });
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

exports.syncSepayPaymentStatus = functions.https.onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Chi ho tro POST.' });

  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return sendJson(res, 401, { success: false, message: 'Thieu token dang nhap Firebase.' });
    await admin.auth().verifyIdToken(idToken);

    const appId = normalizeAppId(req.body?.appId);
    const orderId = `${req.body?.orderId || ''}`.trim();
    if (!orderId) return sendJson(res, 400, { success: false, message: 'Thieu orderId.' });

    const orderDoc = await db.collection(collectionPath(appId, 'orders')).doc(orderId).get();
    if (!orderDoc.exists) return sendJson(res, 404, { success: false, message: 'Khong tim thay don hang.' });
    const order = { id: orderDoc.id, ...orderDoc.data() };
    const recordedAmount = await getRecordedPayosAmountForOrder(appId, order.id, 'sepay');
    const expectedAmount = parseMoney(order.paymentAmount || order.amount || 0);
    const outstandingAmount = Math.max(0, expectedAmount - recordedAmount);
    return sendJson(res, 200, {
      success: true,
      status: outstandingAmount <= 0 && recordedAmount > 0 ? 'paid' : (recordedAmount > 0 ? 'partial' : 'not_paid_yet'),
      provider: 'sepay',
      amountPaid: recordedAmount,
      recordedAmount,
      outstandingAmount
    });
  } catch (error) {
    console.error('syncSepayPaymentStatus failed', error);
    return sendJson(res, 500, {
      success: false,
      message: error.message || 'Khong kiem tra duoc trang thai SePay.'
    });
  }
});
