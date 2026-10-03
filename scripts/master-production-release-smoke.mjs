import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_ORIGIN = 'https://app.hdconnect.net';
const FULL_SHA = /^[a-f0-9]{40}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const isCommit = value => typeof value === 'string' && value.length === 40 && FULL_SHA.test(value);
const isHash = value => typeof value === 'string' && value.length === 64 && HASH.test(value);
const WORKSPACE = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  version: new Set(['application/json']),
  index: new Set(['text/html', 'application/xhtml+xml']),
  js: new Set(['application/javascript', 'text/javascript', 'application/ecmascript', 'text/ecmascript']),
  css: new Set(['text/css']),
};
const LIMITS = { version: 256 * 1024, index: 2 * 1024 * 1024, js: 32 * 1024 * 1024, css: 32 * 1024 * 1024 };
const ERROR_CODE = Symbol('releaseSmokeErrorCode');
const errorFor = code => Object.assign(new Error(code), { [ERROR_CODE]: code });
const fail = code => { throw errorFor(code); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function parseReleaseSmokeArgs(args) {
  const options = { production: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) fail('ARGUMENT_INVALID');
    seen.add(flag);
    if (flag === '--production') options.production = true;
    else if (flag === '--expected-commit' || flag === '--local-dist') {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail('ARGUMENT_INVALID');
      options[flag === '--expected-commit' ? 'expectedCommit' : 'localDist'] = value;
    } else fail('ARGUMENT_INVALID');
  }
  return options;
}

function assetReference(raw, kind) {
  // Vite's relative base emits ./assets; only that leading dot segment is allowed.
  const reference = raw?.startsWith('./assets/') ? raw.slice(2) : raw;
  if (!raw || raw.trim() !== raw || /[%\\\s\u0000-\u001f\u007f]/.test(raw)
    || /(?:^|\/)\.{1,2}(?:\/|$|[?#])/.test(reference)) fail('ASSET_REFERENCE_INVALID');
  let url;
  try { url = new URL(raw, `${PRODUCTION_ORIGIN}/`); }
  catch { fail('ASSET_REFERENCE_INVALID'); }
  if (url.username || url.password || url.search || url.hash) fail('ASSET_REFERENCE_INVALID');
  if (url.origin !== PRODUCTION_ORIGIN) {
    if (url.protocol === 'https:' || url.protocol === 'http:') return null;
    fail('ASSET_REFERENCE_INVALID');
  }
  if (!/^\/assets\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:js|css)$/.test(url.pathname)) fail('ASSET_PATH_REJECTED');
  if (!url.pathname.endsWith(`.${kind}`)) fail('ASSET_KIND_MISMATCH');
  return { path: url.pathname, kind };
}

export async function collectIndexAssets(html) {
  const { parse } = await import('parse5');
  const document = parse(html);
  const assets = new Map();
  let externalReferencesSkipped = 0;
  function visit(node) {
    const attributes = Object.fromEntries((node.attrs || []).map(attribute => [attribute.name, attribute.value]));
    if (node.tagName === 'base' && 'href' in attributes) fail('INDEX_BASE_REJECTED');
    let reference;
    let kind;
    if (node.tagName === 'script' && 'src' in attributes) {
      reference = attributes.src;
      kind = 'js';
    } else if (node.tagName === 'link') {
      const relations = (attributes.rel || '').toLowerCase().split(/\s+/);
      if (relations.includes('stylesheet') || (relations.includes('preload') && attributes.as === 'style')) kind = 'css';
      else if (relations.includes('modulepreload') || (relations.includes('preload') && attributes.as === 'script')) kind = 'js';
      if (kind) reference = attributes.href;
    }
    if (kind) {
      const asset = assetReference(reference, kind);
      if (!asset) externalReferencesSkipped++;
      else assets.set(asset.path, asset);
      if (assets.size > 256) fail('ASSET_COUNT_LIMIT');
    }
    (node.childNodes || []).forEach(visit);
    // Template contents are inert and not release entry-point references.
  }
  visit(document);
  if (!assets.size) fail('INDEX_ASSETS_MISSING');
  if (![...assets.values()].some(asset => asset.kind === 'js')) fail('INDEX_SCRIPT_MISSING');
  return { assets: [...assets.values()], externalReferencesSkipped };
}

async function responseBytes(response, kind) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > LIMITS[kind])) fail('BODY_SIZE_REJECTED');
  if (!response.body?.getReader) fail('BODY_MISSING');
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS[kind]) fail('BODY_SIZE_REJECTED');
      parts.push(value);
    }
  } finally {
    reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!size) fail('BODY_EMPTY');
  return Buffer.concat(parts, size);
}

export async function verifyProductionRelease({ production = false, expectedCommit, localIndexHash,
  fetchImpl = globalThis.fetch, requestTimeoutMs = 5000, totalTimeoutMs = 30000,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const result = {
    schemaVersion: 1, status: 'prepared', scope: 'static-release-artifacts-only',
    productionOrigin: PRODUCTION_ORIGIN, networkEnabled: production === true, checks: [],
    limitations: ['No authentication, tenant isolation, permissions or business workflow certification.',
      'Only the version manifest, index and direct first-party JS/CSS references are checked; dynamic imports and external assets are not checked.'],
  };
  try {
    if (typeof production !== 'boolean') fail('PRODUCTION_FLAG_INVALID');
    if (expectedCommit !== undefined && !isCommit(expectedCommit)) fail('EXPECTED_COMMIT_INVALID');
    if (localIndexHash !== undefined && !isHash(localIndexHash)) fail('LOCAL_INDEX_HASH_INVALID');
    if (expectedCommit) result.expectedCommit = expectedCommit;
    if (localIndexHash) result.localIndexHash = localIndexHash.toLowerCase();
    if (!production) return result;
    if (!expectedCommit) fail('EXPECTED_COMMIT_REQUIRED');
    if (typeof fetchImpl !== 'function') fail('FETCH_UNAVAILABLE');
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 10000
      || !Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 1 || totalTimeoutMs > 60000) fail('TIMEOUT_INVALID');
    const deadline = now() + totalTimeoutMs;
    let totalBytes = 0;
    const get = async (requestPath, kind) => {
      const remaining = deadline - now();
      if (remaining <= 0) fail('TOTAL_TIMEOUT');
      const controller = new AbortController();
      let timer;
      try {
        const expiration = new Promise((_, reject) => {
          timer = setTimer(() => {
            controller.abort();
            reject(errorFor(remaining <= requestTimeoutMs ? 'TOTAL_TIMEOUT' : 'REQUEST_TIMEOUT'));
          }, Math.min(requestTimeoutMs, remaining));
        });
        const request = async () => {
          const url = `${PRODUCTION_ORIGIN}${requestPath}`;
          const response = await fetchImpl(url, { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store',
            headers: { Accept: kind === 'version' ? 'application/json' : kind === 'index' ? 'text/html' : '*/*' }, signal: controller.signal });
          if (response.status >= 300 && response.status < 400 || response.redirected) fail('REDIRECT_REJECTED');
          if (response.status !== 200) fail('HTTP_STATUS_REJECTED');
          if (response.url && response.url !== url) fail('RESPONSE_URL_MISMATCH');
          const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (!TYPES[kind].has(type)) fail('CONTENT_TYPE_REJECTED');
          const bytes = await responseBytes(response, kind);
          totalBytes += bytes.length;
          if (totalBytes > 128 * 1024 * 1024) fail('TOTAL_SIZE_REJECTED');
          return { bytes, type };
        };
        const response = await Promise.race([request(), expiration]);
        result.checks.push({ path: requestPath, kind, bytes: response.bytes.length, contentType: response.type });
        return response.bytes;
      } finally {
        clearTimer(timer);
        controller.abort();
      }
    };
    const versionBytes = await get('/version.json', 'version');
    let version;
    try { version = JSON.parse(versionBytes.toString('utf8')); }
    catch { fail('VERSION_JSON_INVALID'); }
    if (!version || !isCommit(version.buildId)) fail('VERSION_BUILD_ID_INVALID');
    result.observedCommit = version.buildId;
    if (version.buildId !== expectedCommit) fail('VERSION_BUILD_ID_MISMATCH');
    const indexBytes = await get('/', 'index');
    result.indexHash = sha256(indexBytes);
    if (localIndexHash && result.indexHash !== localIndexHash.toLowerCase()) fail('INDEX_HASH_MISMATCH');
    const parseRemaining = deadline - now();
    if (parseRemaining <= 0) fail('TOTAL_TIMEOUT');
    let parseTimer;
    let references;
    try {
      references = await Promise.race([collectIndexAssets(indexBytes.toString('utf8')), new Promise((_, reject) => {
        parseTimer = setTimer(() => reject(errorFor('TOTAL_TIMEOUT')), parseRemaining);
      })]);
    } finally { clearTimer(parseTimer); }
    const { assets, externalReferencesSkipped } = references;
    result.externalReferencesSkipped = externalReferencesSkipped;
    for (const asset of assets) await get(asset.path, asset.kind);
    if (now() >= deadline) fail('TOTAL_TIMEOUT');
    result.status = 'pass';
    result.assetCount = assets.length;
    result.totalBytes = totalBytes;
  } catch (error) {
    result.status = 'fail';
    result.error = { code: error?.[ERROR_CODE] || 'READ_FAILED' };
  }
  return result;
}

async function requirePlainDirectory(directory, create = false) {
  if (create) {
    try { await mkdir(directory); }
    catch (error) { if (error.code !== 'EEXIST') fail('REPORT_DIRECTORY_UNAVAILABLE'); }
  }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('LOCAL_PATH_REJECTED');
}

export async function readControlledDistIndexHash(localDist) {
  const allowed = path.join(WORKSPACE, 'dist');
  if (typeof localDist !== 'string' || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(localDist)
    || path.resolve(WORKSPACE, localDist) !== allowed) fail('LOCAL_DIST_PATH_REJECTED');
  await requirePlainDirectory(allowed);
  const index = path.join(allowed, 'index.html');
  const info = await lstat(index);
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMITS.index) fail('LOCAL_INDEX_REJECTED');
  if (await realpath(index) !== path.join(await realpath(allowed), 'index.html')) fail('LOCAL_PATH_REJECTED');
  const bytes = await readFile(index);
  if (!bytes.length || bytes.length > LIMITS.index) fail('LOCAL_INDEX_REJECTED');
  return sha256(bytes);
}

async function runCli() {
  let result;
  try {
    const options = parseReleaseSmokeArgs(process.argv.slice(2));
    if (options.localDist) options.localIndexHash = await readControlledDistIndexHash(options.localDist);
    result = await verifyProductionRelease(options);
  } catch (error) {
    result = { schemaVersion: 1, status: 'fail', scope: 'static-release-artifacts-only',
      productionOrigin: PRODUCTION_ORIGIN, networkEnabled: false, error: { code: error?.[ERROR_CODE] || 'LOCAL_READ_FAILED' } };
  }
  try {
    const resultsRoot = path.join(WORKSPACE, 'test-results');
    await requirePlainDirectory(resultsRoot, true);
    const directory = path.join(resultsRoot, 'master-production-release-smoke');
    await requirePlainDirectory(directory, true);
    const filename = `smoke-${Date.now()}-${process.pid}.json`;
    const destination = path.join(directory, filename);
    result.reportPath = `test-results/master-production-release-smoke/${filename}`;
    await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  } catch {
    result.status = 'fail';
    result.error = { code: 'REPORT_WRITE_FAILED' };
    delete result.reportPath;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === 'fail' ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
