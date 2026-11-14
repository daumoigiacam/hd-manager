// A bundled Capacitor server can own the same hostname as the real Identity
// endpoint. Browser fetch would then receive index.html from the asset server.
// Use native HTTP only for that exact origin/path; all other fetches are intact.
export const createIdentityFetch = ({ isNative, appOrigin, nativeRequest, fetchImpl = globalThis.fetch }) => async (input, init = {}) => {
  const url = new URL(input, appOrigin());
  if (!isNative() || url.origin !== appOrigin() || !url.pathname.startsWith('/api/identity/')) {
    return fetchImpl(input, init);
  }
  const signal = init.signal;
  const abortError = () => {
    const error = new Error('Identity request was aborted.');
    error.name = 'AbortError';
    return error;
  };
  if (signal?.aborted) throw abortError();
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const method = `${init.method || 'GET'}`.toUpperCase();
  let data = init.body;
  if (typeof data === 'string' && headers['content-type']?.includes('application/json')) data = JSON.parse(data);
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const pending = nativeRequest({ url: url.toString(), method, headers, data, responseType: 'json', connectTimeout: 10000, readTimeout: 30000 });
    const response = await Promise.race([pending, cancelled]);
    const body = response.status === 204 || response.status === 205 || method === 'HEAD'
      ? null : typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? null);
    return new Response(body, { status: response.status, headers: response.headers });
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
};
