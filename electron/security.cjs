const MAX_EXTERNAL_URL_LENGTH = 4096;
const MAX_DATA_IMAGE_LENGTH = 12 * 1024 * 1024;

const ALLOWED_EXTERNAL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'zalo:',
  'vietqr:',
  'bidvsmartbanking:',
  'vietcombank:',
  'vietinbank:',
  'agribank:',
  'techcombank:',
  'mbbank:',
  'acb:',
  'vpbank:',
  'vib:',
  'sacombank:',
  'tpbank:',
  'hdbank:',
  'shb:',
  'msb:',
  'eximbank:',
  'ocb:',
  'viettelmoney:',
  'vnptmoney:',
]);

const TRUSTED_QR_IMAGE_HOSTS = new Set([
  'img.vietqr.io',
  'api.qrserver.com',
  'vietqr.app',
]);

const isTrustedQrImageHost = (hostname = '') => {
  const normalized = `${hostname || ''}`.trim().toLowerCase();
  return TRUSTED_QR_IMAGE_HOSTS.has(normalized) || normalized.endsWith('.vietqr.app');
};

const parseSafeUrl = (input = '') => {
  const raw = `${input || ''}`.trim();
  if (!raw || raw.length > MAX_EXTERNAL_URL_LENGTH || /[\r\n\0]/.test(raw)) return null;

  try {
    return { raw, parsed: new URL(raw) };
  } catch {
    return null;
  }
};

const normalizeExternalUrl = (input = '', allowedProtocols = ALLOWED_EXTERNAL_PROTOCOLS) => {
  const candidate = parseSafeUrl(input);
  if (!candidate || !allowedProtocols.has(candidate.parsed.protocol.toLowerCase())) return '';
  if ((candidate.parsed.protocol === 'http:' || candidate.parsed.protocol === 'https:')
    && (candidate.parsed.username || candidate.parsed.password)) return '';
  return candidate.raw;
};

const normalizeZaloExternalUrl = (input = '') => {
  const normalized = normalizeExternalUrl(input, new Set(['https:', 'zalo:']));
  if (!normalized) return '';

  const parsed = new URL(normalized);
  if (parsed.protocol === 'zalo:') return normalized;
  const hostname = parsed.hostname.toLowerCase();
  return hostname === 'zalo.me' || hostname.endsWith('.zalo.me') ? normalized : '';
};

const normalizeTrustedQrImageSource = (input = '') => {
  const raw = `${input || ''}`.trim();
  if (!raw) return '';
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(raw)) {
    return raw.length <= MAX_DATA_IMAGE_LENGTH ? raw : '';
  }

  const candidate = parseSafeUrl(raw);
  if (!candidate || candidate.parsed.protocol !== 'https:' || !isTrustedQrImageHost(candidate.parsed.hostname)) return '';
  return candidate.raw;
};

const normalizeQrPayload = (input = '') => {
  const raw = `${input || ''}`.trim();
  if (!raw || /[\r\n\0]/.test(raw)) return '';
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(raw)) {
    return raw.length <= MAX_DATA_IMAGE_LENGTH ? raw : '';
  }
  return raw.length <= MAX_EXTERNAL_URL_LENGTH ? raw : '';
};

module.exports = {
  ALLOWED_EXTERNAL_PROTOCOLS,
  normalizeExternalUrl,
  normalizeZaloExternalUrl,
  normalizeTrustedQrImageSource,
  normalizeQrPayload,
};
