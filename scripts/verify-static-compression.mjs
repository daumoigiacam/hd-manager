import { fileURLToPath } from 'node:url';
import { collectIndexAssets, PRODUCTION_ORIGIN } from './master-production-release-smoke.mjs';

export async function verifyStaticCompression({ fetchImpl = globalThis.fetch } = {}) {
  const get = async (pathname, method = 'HEAD') => fetchImpl(`${PRODUCTION_ORIGIN}${pathname}`, {
    method, headers: { 'Accept-Encoding': 'gzip, br', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000),
  });
  const index = await get('/', 'GET');
  if (!index.ok) throw Error(`Index HTTP ${index.status}`);
  const { assets } = await collectIndexAssets(await index.text());
  const results = [];
  for (const asset of assets) {
    const response = await get(asset.path);
    const length = Number(response.headers.get('content-length'));
    const encoding = response.headers.get('content-encoding') || '';
    const compressed = /^(gzip|br)$/i.test(encoding.trim());
    // A missing length is never evidence that a plain response is small.
    const small = response.headers.has('content-length') && Number.isFinite(length) && length >= 0 && length < 1024;
    results.push({ path: asset.path, http: response.status, contentEncoding: encoding || null,
      contentLength: response.headers.get('content-length'), status: response.ok && (compressed || small) ? 'PASS' : 'FAIL' });
  }
  return { origin: PRODUCTION_ORIGIN, status: results.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL', assets: results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.slice(2).join(' ') !== '--production') throw Error('Explicit --production is required for this read-only public asset check');
  const result = await verifyStaticCompression();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}
