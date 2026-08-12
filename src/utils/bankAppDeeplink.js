const VIETQR_BANK_APP_BASE_URL = 'https://dl.vietqr.io/pay';

export const VIETQR_BANK_APP_IDS = Object.freeze({
  ICB: 'icb',
  BIDV: 'bidv',
  OCB: 'ocb',
  ACB: 'acb',
  MB: 'mb',
  VCB: 'vcb',
  TCB: 'tcb',
  VPB: 'vpb',
  VIB: 'vib-2',
  SHB: 'shb',
  LPB: 'lpb',
  SEAB: 'seab',
  SCB: 'scb',
  VIETBANK: 'vietbank',
  CAKE: 'cake',
  HDB: 'hdb',
  VBA: 'vba',
  TPB: 'tpb',
  TIMO: 'timo',
  SHBVN: 'shbvn',
  NAB: 'nab',
  ABB: 'abb',
  EIB: 'eib',
  COOPBANK: 'coopbank',
  PVCB: 'pvcb',
  WVN: 'wvn',
  KLB: 'klb',
  BVB: 'bvb',
  VAB: 'vab',
  NCB: 'ncb',
  OJB: 'oceanbank',
  SGB: 'sgicb',
  CIMB: 'cimb'
});

const RECEIVING_BANK_CODE_ALIASES = Object.freeze({
  BID: 'bidv',
  BIDV: 'bidv',
  CTG: 'icb',
  ICB: 'icb',
  VIETINBANK: 'icb',
  VCB: 'vcb',
  VIETCOMBANK: 'vcb',
  VBA: 'vba',
  AGRIBANK: 'vba',
  TCB: 'tcb',
  TECHCOMBANK: 'tcb',
  MBB: 'mb',
  MB: 'mb',
  MBBANK: 'mb',
  ACB: 'acb',
  VPB: 'vpb',
  VPBANK: 'vpb',
  VIB: 'vib',
  STB: 'stb',
  SACOMBANK: 'stb',
  TPB: 'tpb',
  TPBANK: 'tpb',
  HDB: 'hdb',
  HDBANK: 'hdb',
  SHB: 'shb',
  MSB: 'msb',
  EIB: 'eib',
  EXIMBANK: 'eib',
  OCB: 'ocb',
  LPB: 'lpb',
  LPBANK: 'lpb',
  SEAB: 'seab',
  SEABANK: 'seab',
  ABB: 'abb',
  ABBANK: 'abb',
  VAB: 'vab',
  VIETABANK: 'vab',
  BVB: 'bvb',
  VIETBANK: 'vietbank',
  SGB: 'sgicb',
  SAIGONBANK: 'sgicb',
  KLB: 'klb',
  KIENLONGBANK: 'klb',
  NCB: 'ncb',
  PVCB: 'pvcb',
  PVCOMBANK: 'pvcb',
  OJB: 'oceanbank',
  OCEANBANK: 'oceanbank',
  COOPBANK: 'coopbank',
  SCB: 'scb',
  SHBVN: 'shbvn',
  WVN: 'wvn',
  CIMB: 'cimb'
});

const normalizeCode = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]/g, '')
  .trim()
  .toUpperCase();

const normalizeAccountNumber = (value = '') => `${value || ''}`
  .replace(/[^A-Za-z0-9]/g, '')
  .trim()
  .toUpperCase();

const normalizeAmount = (value = 0) => {
  const parsed = typeof value === 'number'
    ? value
    : Number(`${value || ''}`.replace(/[^\d-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const normalizeReturnUrl = (value = '') => {
  const candidate = `${value || ''}`.trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

export const resolveVietQrBankAppId = (bankId = '') => (
  VIETQR_BANK_APP_IDS[normalizeCode(bankId)] || ''
);

export const isVietQrBankAppSupported = (bankId = '') => Boolean(resolveVietQrBankAppId(bankId));

export const resolveVietQrReceivingBankCode = (bankCode = '') => {
  const normalized = normalizeCode(bankCode);
  return RECEIVING_BANK_CODE_ALIASES[normalized] || normalized.toLowerCase();
};

export const buildVietQrBankAppDeeplink = ({
  selectedBankId = '',
  receivingBankCode = '',
  receivingAccountNumber = '',
  amount = 0,
  transferContent = '',
  receivingAccountName = '',
  returnUrl = ''
} = {}) => {
  const appId = resolveVietQrBankAppId(selectedBankId);
  const accountNumber = normalizeAccountNumber(receivingAccountNumber);
  if (!appId || !accountNumber) return '';

  const bankCode = resolveVietQrReceivingBankCode(receivingBankCode);
  const paymentAmount = normalizeAmount(amount);
  const params = new URLSearchParams();
  params.set('app', appId);
  params.set('ba', bankCode ? `${accountNumber}@${bankCode}` : accountNumber);
  if (paymentAmount > 0) params.set('am', `${paymentAmount}`);

  const normalizedContent = `${transferContent || ''}`.trim();
  if (normalizedContent) params.set('tn', normalizedContent);

  const normalizedAccountName = `${receivingAccountName || ''}`.trim();
  if (normalizedAccountName) params.set('bn', normalizedAccountName);

  const normalizedReturnUrl = normalizeReturnUrl(returnUrl);
  if (normalizedReturnUrl) params.set('url', normalizedReturnUrl);

  return `${VIETQR_BANK_APP_BASE_URL}?${params.toString()}`;
};

export const isMobileBankAppEnvironment = (userAgent = '') => (
  /Android|iPhone|iPad|iPod|Mobile/i.test(`${userAgent || ''}`)
);

export const launchBankPaymentAndCopyReference = async ({
  openPayment,
  copyReference
} = {}) => {
  if (typeof openPayment !== 'function') return { opened: false, copied: false };

  // Invoke both actions synchronously while the original click is still active.
  const openResult = openPayment();
  const copyResult = typeof copyReference === 'function' ? copyReference() : false;
  const [opened, copied] = await Promise.all([openResult, copyResult]);
  return { opened: Boolean(opened), copied: Boolean(copied) };
};
