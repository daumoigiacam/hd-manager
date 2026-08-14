const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRY_COUNT = 1;

const DEFAULT_TOKEN_STORAGE_NAMESPACE = 'vps-staging';

export const createTokenStorageKeys = (namespace = DEFAULT_TOKEN_STORAGE_NAMESPACE) => {
  const normalizedNamespace = `${namespace || ''}`.trim();
  if (!/^[a-z0-9-]+$/i.test(normalizedNamespace)) {
    throw new HdApiError('The VPS token storage namespace is invalid.', {
      code: 'TOKEN_STORAGE_NAMESPACE_INVALID',
    });
  }

  return Object.freeze({
    accessToken: `hdconnect.${normalizedNamespace}.access-token`,
    refreshToken: `hdconnect.${normalizedNamespace}.refresh-token`,
  });
};

const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

const sleep = (durationMs) => new Promise((resolve) => {
  globalThis.setTimeout(resolve, durationMs);
});

const readResponseBody = async (response) => {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return { message: 'The API returned an invalid JSON response.' };
  }
};

const getBrowserSessionStorage = () => {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getDefaultStorage = () => {
  const storage = getBrowserSessionStorage();

  return {
    getItem: (key) => storage?.getItem(key) ?? null,
    setItem: (key, value) => storage?.setItem(key, value),
    removeItem: (key) => storage?.removeItem(key),
  };
};

const normalizeMethod = (method = 'GET') => `${method}`.toUpperCase();

export const createRequestId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return `hd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeApiBaseUrl = (baseUrl) => {
  const normalized = `${baseUrl || ''}`.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new HdApiError('VITE_API_BASE_URL is required for VPS mode.', {
      code: 'API_BASE_URL_MISSING',
    });
  }

  try {
    return new URL(normalized).toString().replace(/\/+$/, '');
  } catch {
    throw new HdApiError('VITE_API_BASE_URL must be a valid absolute URL for VPS mode.', {
      code: 'API_BASE_URL_INVALID',
    });
  }
};

export class HdApiError extends Error {
  constructor(message, {
    status = 0,
    code = 'API_REQUEST_FAILED',
    details = null,
    requestId = '',
    retryable = false,
  } = {}) {
    super(message);
    this.name = 'HdApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.retryable = retryable;
  }
}

export const unwrapApiEnvelope = (payload, { status = 200, requestId = '' } = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HdApiError('The API response envelope is invalid.', {
      status,
      code: 'API_ENVELOPE_INVALID',
      requestId,
    });
  }

  if (payload.success !== true || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    const error = payload.error && typeof payload.error === 'object' ? payload.error : {};
    throw new HdApiError(
      error.message || payload.message || 'The API request was rejected.',
      {
        status,
        code: error.code || payload.code || 'API_REQUEST_REJECTED',
        details: error.details ?? payload.details ?? null,
        requestId: payload.meta?.traceId || requestId,
        retryable: status >= 500,
      },
    );
  }

  return {
    data: payload.data,
    meta: payload.meta ?? {},
  };
};

const appendQuery = (baseUrl, query = {}) => {
  const url = new URL(baseUrl);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.filter((item) => item !== undefined && item !== null && item !== '')
        .forEach((item) => url.searchParams.append(key, `${item}`));
      return;
    }
    url.searchParams.set(key, `${value}`);
  });

  return url.toString();
};

const isAbortError = (error) => error?.name === 'AbortError';

/**
 * Browser transport for the VPS API. It intentionally stores tokens only in
 * sessionStorage and never logs passwords, JWTs, or refresh tokens.
 */
export class HdApiClient {
  constructor({
    baseUrl,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    storage = getDefaultStorage(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryCount = DEFAULT_RETRY_COUNT,
    deviceName = '',
    platform = 'hd-manager-web',
    tokenStorageNamespace = DEFAULT_TOKEN_STORAGE_NAMESPACE,
  } = {}) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.storage = storage;
    this.timeoutMs = timeoutMs;
    this.retryCount = retryCount;
    this.deviceName = deviceName;
    this.platform = platform;
    this.tokenStorageKeys = createTokenStorageKeys(tokenStorageNamespace);
    this.refreshPromise = null;

    if (typeof this.fetchImpl !== 'function') {
      throw new HdApiError('Fetch is not available in this runtime.', {
        code: 'FETCH_UNAVAILABLE',
      });
    }
  }

  getAccessToken() {
    return this.storage.getItem(this.tokenStorageKeys.accessToken) || '';
  }

  getRefreshToken() {
    return this.storage.getItem(this.tokenStorageKeys.refreshToken) || '';
  }

  hasSession() {
    return Boolean(this.getAccessToken() || this.getRefreshToken());
  }

  clearSession() {
    this.storage.removeItem(this.tokenStorageKeys.accessToken);
    this.storage.removeItem(this.tokenStorageKeys.refreshToken);
  }

  setSession({ accessToken, refreshToken } = {}) {
    if (!accessToken || !refreshToken) {
      throw new HdApiError('The API did not return a complete token pair.', {
        code: 'TOKEN_PAIR_INVALID',
      });
    }

    this.storage.setItem(this.tokenStorageKeys.accessToken, accessToken);
    this.storage.setItem(this.tokenStorageKeys.refreshToken, refreshToken);
  }

  async login({ email, password, deviceName = this.deviceName } = {}) {
    const normalizedEmail = `${email || ''}`.trim();
    if (!normalizedEmail || !password) {
      throw new HdApiError('Email and password are required.', {
        code: 'LOGIN_INPUT_INVALID',
      });
    }

    const session = await this.request('/auth/login', {
      method: 'POST',
      body: {
        email: normalizedEmail,
        password,
        ...(deviceName ? { deviceName } : {}),
      },
      authenticate: false,
      retry: false,
      allowRefresh: false,
    });
    this.setSession(session);
    return session;
  }

  async refresh() {
    if (this.refreshPromise) return this.refreshPromise;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new HdApiError('The session cannot be refreshed.', {
        code: 'REFRESH_TOKEN_MISSING',
      });
    }

    this.refreshPromise = this.request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      authenticate: false,
      retry: false,
      allowRefresh: false,
    })
      .then((session) => {
        this.setSession(session);
        return session;
      })
      .catch((error) => {
        this.clearSession();
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  async restoreSession() {
    if (!this.hasSession()) return null;

    try {
      const session = await this.refresh();
      return { session, currentUser: await this.getCurrentUser() };
    } catch {
      this.clearSession();
      return null;
    }
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  async logout() {
    const refreshToken = this.getRefreshToken();

    try {
      if (refreshToken && this.getAccessToken()) {
        await this.request('/auth/logout', {
          method: 'POST',
          body: { refreshToken },
          retry: false,
          allowRefresh: false,
        });
      }
    } finally {
      this.clearSession();
    }
  }

  async logoutAll() {
    try {
      if (this.getAccessToken()) {
        await this.request('/auth/logout-all', {
          method: 'POST',
          retry: false,
          allowRefresh: false,
        });
      }
    } finally {
      this.clearSession();
    }
  }

  get(path, options = {}) {
    return this.request(path, { ...options, method: 'GET' });
  }

  post(path, body, options = {}) {
    return this.request(path, { ...options, method: 'POST', body });
  }

  patch(path, body, options = {}) {
    return this.request(path, { ...options, method: 'PATCH', body });
  }

  delete(path, options = {}) {
    return this.request(path, { ...options, method: 'DELETE' });
  }

  async request(path, {
    method = 'GET',
    body,
    query,
    headers = {},
    authenticate = true,
    retry = RETRYABLE_METHODS.has(normalizeMethod(method)),
    allowRefresh = true,
    idempotencyKey = '',
    signal,
  } = {}) {
    const normalizedMethod = normalizeMethod(method);
    const requestId = createRequestId();
    const url = appendQuery(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, query);
    const maximumAttempts = retry ? this.retryCount + 1 : 1;
    let refreshed = false;
    let lastError;

    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
      const abort = () => controller.abort();
      signal?.addEventListener?.('abort', abort, { once: true });

      try {
        const accessToken = authenticate ? this.getAccessToken() : '';
        const response = await this.fetchImpl(url, {
          method: normalizedMethod,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'X-Request-ID': requestId,
            ...(this.platform ? { 'X-Platform': this.platform } : {}),
            ...(this.deviceName ? { 'X-Device-Name': this.deviceName } : {}),
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const payload = await readResponseBody(response);

        if (
          response.status === 401
          && authenticate
          && allowRefresh
          && !refreshed
          && this.getRefreshToken()
        ) {
          refreshed = true;
          await this.refresh();
          continue;
        }

        const envelope = unwrapApiEnvelope(payload, {
          status: response.status,
          requestId: response.headers?.get?.('x-request-id') || requestId,
        });

        if (!response.ok) {
          throw new HdApiError('The API request failed.', {
            status: response.status,
            requestId,
            retryable: response.status >= 500,
          });
        }

        return envelope.data;
      } catch (error) {
        const normalizedError = error instanceof HdApiError
          ? error
          : new HdApiError(
            isAbortError(error) ? 'The API request timed out.' : 'The API request could not be completed.',
            {
              code: isAbortError(error) ? 'API_TIMEOUT' : 'API_NETWORK_ERROR',
              requestId,
              retryable: true,
            },
          );
        lastError = normalizedError;

        if (!normalizedError.retryable || attempt >= maximumAttempts - 1) {
          throw normalizedError;
        }

        await sleep(250 * (attempt + 1));
      } finally {
        globalThis.clearTimeout(timeoutId);
        signal?.removeEventListener?.('abort', abort);
      }
    }

    throw lastError || new HdApiError('The API request could not be completed.', { requestId });
  }
}
