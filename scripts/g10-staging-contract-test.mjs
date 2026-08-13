import { HdApiClient, HdApiError } from '../src/api/client.js';

const requiredEnvironment = [
  'G10_STAGING_API_BASE_URL',
  'G10_STAGING_EMAIL',
  'G10_STAGING_PASSWORD',
];
const missingEnvironment = requiredEnvironment.filter((name) => !`${process.env[name] || ''}`.trim());

if (missingEnvironment.length > 0) {
  console.log(JSON.stringify({
    status: 'SKIPPED',
    reason: 'STAGING_CREDENTIALS_OR_INGRESS_NOT_CONFIGURED',
    missing: missingEnvironment,
    businessWritesExecuted: 0,
    firestoreWritesExecuted: 0,
    productionWritesExecuted: 0,
  }));
  process.exit(0);
}

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const baseUrl = `${process.env.G10_STAGING_API_BASE_URL}`.trim().replace(/\/+$/, '');
const healthUrl = `${baseUrl}/health/ready`;
const storage = createStorage();
const client = new HdApiClient({
  baseUrl,
  storage,
  deviceName: 'HD Manager G10 staging contract test',
});
const results = [];

const record = async (name, operation, { allowForbidden = false } = {}) => {
  try {
    const data = await operation();
    results.push({ name, status: 'PASS', count: Array.isArray(data?.items) ? data.items.length : undefined });
    return data;
  } catch (error) {
    const status = error instanceof HdApiError ? error.status : 0;
    if (allowForbidden && (status === 401 || status === 403)) {
      results.push({ name, status: 'BLOCKED_BY_ROLE', httpStatus: status, code: error.code });
      return null;
    }
    results.push({ name, status: 'FAIL', httpStatus: status, code: error?.code || 'UNKNOWN' });
    throw error;
  }
};

let exitCode = 0;
try {
  await record('health', async () => {
    const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
      throw new HdApiError('Staging health check failed.', { status: response.status, code: 'HEALTH_CHECK_FAILED' });
    }
    return body.data;
  });

  await record('login', () => client.login({
    email: process.env.G10_STAGING_EMAIL,
    password: process.env.G10_STAGING_PASSWORD,
  }));
  await record('current-user', () => client.getCurrentUser());
  await record('customers-read', () => client.get('/master-data/customers', {
    query: { page: 1, limit: 1 },
  }), { allowForbidden: true });
  await record('products-read', () => client.get('/products', {
    query: { page: 1, limit: 1 },
  }), { allowForbidden: true });
  await record('orders-read', () => client.get('/sales/orders', {
    query: { page: 1, limit: 1 },
  }), { allowForbidden: true });
  await record('payments-read-only', () => client.get('/cx-suite/payments', {
    query: { page: 1, limit: 1 },
  }), { allowForbidden: true });
} catch {
  exitCode = 1;
} finally {
  try {
    await client.logout();
    results.push({ name: 'logout', status: 'PASS' });
  } catch (error) {
    results.push({ name: 'logout', status: 'FAIL', code: error?.code || 'UNKNOWN' });
    exitCode = 1;
  }
}

console.log(JSON.stringify({
  status: exitCode === 0 ? 'PASS' : 'FAIL',
  apiBaseUrl: new URL(baseUrl).origin + new URL(baseUrl).pathname,
  businessWritesExecuted: 0,
  firestoreWritesExecuted: 0,
  productionWritesExecuted: 0,
  stagingAuthenticationLifecycle: 'login/logout may create staging-only session and audit records',
  results,
}));
process.exit(exitCode);
