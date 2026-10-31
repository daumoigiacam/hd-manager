// XHR streaming retains the cumulative responseText for the lifetime of a
// backchannel. Fetch streams let WebChannel consume and discard decoded chunks.
// Engines without byte-stream decoding use bounded long-poll responses instead.
// Auto-detection remains disabled separately to preserve the ca9/b815 guard.
export function getFirestoreTransportOptions(scope = globalThis) {
  let streams = false;
  try {
    streams = typeof scope.fetch === 'function'
      && typeof scope.ReadableStream === 'function'
      && typeof scope.ReadableStream.prototype.getReader === 'function'
      && typeof scope.TextDecoder === 'function'
      && typeof scope.Response === 'function'
      && 'body' in scope.Response.prototype;
  } catch { /* A restricted host capability accessor falls back safely. */ }
  return { useFetchStreams: streams, experimentalForceLongPolling: !streams };
}
