const BUSINESS_MUTATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;

const normalizePrefix = (value = 'command') => `${value || 'command'}`
  .trim()
  .replace(/[^A-Za-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 32) || 'command';

const stableHash = (value = '', seed = 2166136261) => {
  let hash = seed >>> 0;
  const text = `${value || ''}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const isValidBusinessMutationId = (value = '') => (
  BUSINESS_MUTATION_ID_PATTERN.test(`${value || ''}`.trim())
);

export const createBusinessMutationId = (prefix = 'command', entropy = '') => {
  const normalizedPrefix = normalizePrefix(prefix);
  const randomPart = `${entropy || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`}`
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  const mutationId = `${normalizedPrefix}-${randomPart}`;
  if (!isValidBusinessMutationId(mutationId)) {
    throw new Error('Không thể tạo mã thao tác nghiệp vụ hợp lệ.');
  }
  return mutationId;
};

export const ensureBusinessMutationId = (value = '', prefix = 'command') => {
  const mutationId = `${value || ''}`.trim() || createBusinessMutationId(prefix);
  if (!isValidBusinessMutationId(mutationId)) {
    throw new Error('Mã thao tác nghiệp vụ không hợp lệ. Vui lòng tạo lại biểu mẫu.');
  }
  return mutationId;
};

export const buildBusinessDocumentId = (prefix, companyId, clientMutationId) => {
  const normalizedPrefix = normalizePrefix(prefix);
  const mutationId = ensureBusinessMutationId(clientMutationId, normalizedPrefix);
  const companyKey = `${companyId || 'company'}`.trim();
  const scopeHash = stableHash(companyKey, 2166136261);
  const commandHash = stableHash(`${companyKey}|${mutationId}`, 3335557771);
  return `${normalizedPrefix}_${scopeHash}_${commandHash}_${mutationId}`.slice(0, 240);
};

