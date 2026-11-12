const DEFAULT_TIMEOUT_MS = 30000;

export const fetchWithTimeout = async (
  input,
  init = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
) => {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is not available.');

  const safeTimeoutMs = Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  if (typeof AbortController !== 'function') return fetchImpl(input, init);

  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  let timedOut = false;
  const forwardAbort = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal?.aborted) forwardAbort();
  else upstreamSignal?.addEventListener?.('abort', forwardAbort, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, safeTimeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (!timedOut) throw error;
    const timeoutError = new Error('Yêu cầu quá thời gian phản hồi. Vui lòng kiểm tra mạng và thử lại.');
    timeoutError.name = 'TimeoutError';
    timeoutError.cause = error;
    throw timeoutError;
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener?.('abort', forwardAbort);
  }
};

export default fetchWithTimeout;
