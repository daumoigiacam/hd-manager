import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectIndexAssets, parseReleaseSmokeArgs, PRODUCTION_ORIGIN,
  readControlledDistIndexHash, verifyProductionRelease } from '../scripts/master-production-release-smoke.mjs';

const COMMIT = 'a'.repeat(40);
const INDEX = '<!doctype html><html><head><link rel="stylesheet" href="/assets/site-a.css">'
  + '<link rel="modulepreload" href="/assets/main-a.js"></head><body>'
  + '<script type="module" src="/assets/main-a.js"></script></body></html>';
const hash = text => createHash('sha256').update(text).digest('hex');

function fixture({ index = INDEX, version = { buildId: COMMIT }, overrides = {}, responseHook } = {}) {
  const requests = [];
  const bodies = {
    '/version.json': [JSON.stringify(version), 'application/json; charset=utf-8'],
    '/': [index, 'text/html; charset=utf-8'],
    '/assets/main-a.js': ['console.log("fixture");', 'application/javascript'],
    '/assets/site-a.css': ['body { color: red; }', 'text/css'],
    ...overrides,
  };
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).origin, PRODUCTION_ORIGIN, 'fixture refuses real/external addresses');
    requests.push({ url, options });
    const requestPath = new URL(url).pathname;
    const body = bodies[requestPath];
    assert.ok(body, `unexpected fixture GET ${requestPath}`);
    const response = body instanceof Response ? body : new Response(body[0], { status: body[2] || 200, headers: { 'Content-Type': body[1] } });
    return responseHook ? responseHook(response, requestPath) : response;
  };
  return { requests, fetchImpl, verify: options => verifyProductionRelease({ production: true, expectedCommit: COMMIT, fetchImpl, ...options }) };
}

test('default mode and expected-commit-only mode are prepared and perform no network calls', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error('network forbidden'); };
  for (const options of [{}, { expectedCommit: COMMIT }, { expectedCommit: COMMIT, localIndexHash: hash(INDEX) }]) {
    const result = await verifyProductionRelease({ ...options, fetchImpl });
    assert.equal(result.status, 'prepared');
    assert.equal(result.networkEnabled, false);
    assert.deepEqual(result.checks, []);
  }
  assert.equal(calls, 0);
});

test('production admission requires an explicit boolean flag, full SHA and bounded timeout options', async () => {
  let calls = 0;
  for (const [options, code] of [
    [{ production: true }, 'EXPECTED_COMMIT_REQUIRED'],
    [{ expectedCommit: 'short' }, 'EXPECTED_COMMIT_INVALID'],
    [{ expectedCommit: `${COMMIT}\n` }, 'EXPECTED_COMMIT_INVALID'],
    [{ production: 'true', expectedCommit: COMMIT }, 'PRODUCTION_FLAG_INVALID'],
    [{ production: true, expectedCommit: COMMIT, requestTimeoutMs: 0 }, 'TIMEOUT_INVALID'],
    [{ production: true, expectedCommit: COMMIT, totalTimeoutMs: 60001 }, 'TIMEOUT_INVALID'],
    [{ production: true, expectedCommit: COMMIT, localIndexHash: 'short' }, 'LOCAL_INDEX_HASH_INVALID'],
  ]) {
    const result = await verifyProductionRelease({ ...options, fetchImpl: () => { calls++; throw new Error('forbidden'); } });
    assert.equal(result.status, 'fail');
    assert.equal(result.error.code, code);
  }
  assert.equal(calls, 0);
});

test('CLI accepts only fixed-origin opt-in flags and rejects URL overrides, duplicate flags and missing values', () => {
  assert.deepEqual(parseReleaseSmokeArgs([]), { production: false });
  assert.deepEqual(parseReleaseSmokeArgs(['--production', '--expected-commit', COMMIT, '--local-dist', 'dist']), {
    production: true, expectedCommit: COMMIT, localDist: 'dist',
  });
  for (const args of [['--url', 'https://elsewhere.invalid'], ['--production', '--production'],
    ['--expected-commit'], ['--local-dist', '--production'], ['--token', 'secret']]) {
    assert.throws(() => parseReleaseSmokeArgs(args), /ARGUMENT_INVALID/);
  }
});

test('observed static artifacts pass exact SHA and optional index hash using credential-free GETs only', async () => {
  const f = fixture();
  const result = await f.verify({ localIndexHash: hash(INDEX) });
  assert.equal(result.status, 'pass');
  assert.equal(result.scope, 'static-release-artifacts-only');
  assert.equal(result.observedCommit, COMMIT);
  assert.equal(result.indexHash, hash(INDEX));
  assert.equal(result.assetCount, 2, 'modulepreload and script references are deduplicated');
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every(check => check.bytes > 0));
  assert.ok(result.totalBytes > Buffer.byteLength(INDEX));
  for (const { url, options } of f.requests) {
    assert.equal(new URL(url).origin, PRODUCTION_ORIGIN);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(Object.keys(options.headers), ['Accept']);
    assert.equal('body' in options, false);
  }
  assert.match(result.limitations.join(' '), /No authentication.*business workflow/);
  assert.match(result.limitations.join(' '), /dynamic imports and external assets are not checked/);
});

test('version.buildId must equal the expected full SHA exactly, not a prefix or different case', async () => {
  for (const [buildId, code] of [[COMMIT.slice(0, 12), 'VERSION_BUILD_ID_INVALID'],
    ['b'.repeat(40), 'VERSION_BUILD_ID_MISMATCH'], [COMMIT.toUpperCase(), 'VERSION_BUILD_ID_MISMATCH'],
    ['Bearer secret-value', 'VERSION_BUILD_ID_INVALID']]) {
    const f = fixture({ version: { buildId } });
    const result = await f.verify();
    assert.equal(result.error.code, code);
    assert.equal(f.requests.length, 1);
    assert.ok(!JSON.stringify(result).includes('secret-value'));
  }
});

test('Vite relative-base entry points resolve to fixed-origin assets and deduplicate preloads', async () => {
  const index = INDEX.replaceAll('="/assets/', '="./assets/');
  const f = fixture({ index });
  const result = await f.verify({ localIndexHash: hash(index) });
  assert.equal(result.status, 'pass');
  assert.equal(result.assetCount, 2);
  assert.deepEqual(f.requests.map(request => new URL(request.url).pathname),
    ['/version.json', '/', '/assets/site-a.css', '/assets/main-a.js']);
  assert.equal(result.externalReferencesSkipped, 0);
});

test('malformed metadata and optional local-index mismatch fail before asset requests', async () => {
  const invalid = fixture({ overrides: { '/version.json': ['{"buildId":', 'application/json'] } });
  assert.equal((await invalid.verify()).error.code, 'VERSION_JSON_INVALID');
  const mismatched = fixture();
  const result = await mismatched.verify({ localIndexHash: hash('different release index') });
  assert.equal(result.error.code, 'INDEX_HASH_MISMATCH');
  assert.equal(mismatched.requests.length, 2);
});

test('HTML parsing handles entity decoding, attribute order, comments, templates and duplicate asset references', async () => {
  const html = '<!-- <script src="/api/not-an-asset.js"></script> -->'
    + '<template><script src="/api/inert.js"></script></template>'
    + '<link HREF="assets/site-a.css" REL="STYLESHEET">'
    + '<script defer src="https://app.hdconnect.net/assets/main-a.js"></script>'
    + '<link href="/assets/main-a.js" rel="modulepreload">';
  const result = await collectIndexAssets(html);
  assert.deepEqual(result.assets, [{ path: '/assets/site-a.css', kind: 'css' }, { path: '/assets/main-a.js', kind: 'js' }]);
  assert.equal(result.externalReferencesSkipped, 0);
});

test('external assets are explicitly outside scope and are never fetched or echoed', async () => {
  const f = fixture({ index: INDEX.replace('</head>', '<script src="https://cdn.invalid/vendor.js"></script>'
    + '<link rel="stylesheet" href="https://cdn.invalid/vendor.css"></head>') });
  const result = await f.verify();
  assert.equal(result.status, 'pass');
  assert.equal(result.externalReferencesSkipped, 2);
  assert.equal(f.requests.length, 4);
  assert.equal(JSON.stringify(result).includes('cdn.invalid'), false);
});

test('unsafe observed paths, traversal, credentials, queries and active non-HTTP schemes never become requests', async () => {
  const references = ['/assets/../main-a.js', '/assets/a/../../main-a.js', '/assets/%2e%2e/main-a.js',
    './assets/../main-a.js', './assets/a/../../main-a.js', './../assets/main-a.js', '././assets/main-a.js',
    './assets/%2e%2e/main-a.js', './assets/\\main-a.js', './assets/main-a.js?token=secret',
    '/assets/%252e%252e/main-a.js', '/assets/a&#47;..&#47;main-a.js', '/assets/\\main-a.js',
    '/api/v1/delete.js', '/assets//main-a.js', '/assets/main-a.js?token=secret', '/assets/main-a.js#secret',
    'https://user:secret@app.hdconnect.net/assets/main-a.js', 'javascript:alert(1)', 'data:text/javascript,secret', ''];
  for (const reference of references) {
    const f = fixture({ index: `<script src="${reference}"></script>` });
    const result = await f.verify();
    assert.equal(result.status, 'fail', reference);
    assert.equal(f.requests.length, 2, 'only fixed manifest and index paths may have been requested');
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

test('HTML base overrides, missing scripts and asset type/path mismatches cannot certify an index', async () => {
  for (const [index, code] of [['<base href="https://other.invalid/">' + INDEX, 'INDEX_BASE_REJECTED'],
    ['<h1>Error page</h1>', 'INDEX_ASSETS_MISSING'], ['<link rel="stylesheet" href="/assets/site-a.css">', 'INDEX_SCRIPT_MISSING'],
    ['<script src="/assets/site-a.css"></script>', 'ASSET_KIND_MISMATCH']]) {
    const f = fixture({ index });
    assert.equal((await f.verify()).error.code, code);
    assert.equal(f.requests.length, 2);
  }
});

test('asset count is bounded by rejection, never a silently truncated pass', async () => {
  const html = Array.from({ length: 257 }, (_, index) => `<script src="/assets/chunk-${index}.js"></script>`).join('');
  const f = fixture({ index: html });
  assert.equal((await f.verify()).error.code, 'ASSET_COUNT_LIMIT');
  assert.equal(f.requests.length, 2);
});

test('all redirect responses and a fetch implementation following an external redirect are rejected', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const f = fixture({ overrides: { '/version.json': new Response('', { status, headers: { Location: 'https://external.invalid/secret' } }) } });
    const result = await f.verify();
    assert.equal(result.error.code, 'REDIRECT_REJECTED');
    assert.equal(f.requests.length, 1);
    assert.equal(JSON.stringify(result).includes('external.invalid'), false);
  }
  for (const properties of [{ redirected: { value: true } }, { url: { value: 'https://external.invalid/version.json' } },
    { url: { value: `${PRODUCTION_ORIGIN}/different.json` } }]) {
    const f = fixture({ responseHook: response => Object.defineProperties(response, properties) });
    const result = await f.verify();
    assert.ok(['REDIRECT_REJECTED', 'RESPONSE_URL_MISMATCH'].includes(result.error.code));
    assert.equal(f.requests.length, 1);
  }
});

test('HTTP failures, empty bytes and incorrect MIME types reject each artifact kind', async () => {
  for (const [requestPath, body, code] of [
    ['/version.json', ['denied', 'application/json', 403], 'HTTP_STATUS_REJECTED'],
    ['/', ['', 'text/html'], 'BODY_EMPTY'],
    ['/', ['<html/>', 'text/plain'], 'CONTENT_TYPE_REJECTED'],
    ['/assets/main-a.js', ['', 'application/javascript'], 'BODY_EMPTY'],
    ['/assets/main-a.js', ['<html>SPA fallback</html>', 'text/html'], 'CONTENT_TYPE_REJECTED'],
    ['/assets/site-a.css', ['body{}', 'application/json'], 'CONTENT_TYPE_REJECTED'],
    ['/assets/site-a.css', ['missing', 'text/css', 404], 'HTTP_STATUS_REJECTED'],
  ]) {
    const f = fixture({ overrides: { [requestPath]: body } });
    assert.equal((await f.verify()).error.code, code);
  }
});

test('declared and streamed response size limits fail before oversized artifacts are retained', async () => {
  const declared = new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '999999999' } });
  assert.equal((await fixture({ overrides: { '/version.json': declared } }).verify()).error.code, 'BODY_SIZE_REJECTED');
  const streamed = new Response('x'.repeat(256 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } });
  assert.equal((await fixture({ overrides: { '/version.json': streamed } }).verify()).error.code, 'BODY_SIZE_REJECTED');
});

test('request timeout aborts even an injected fetch ignoring cancellation without real timer waits', async () => {
  const timers = [];
  let signal;
  const completion = verifyProductionRelease({ production: true, expectedCommit: COMMIT,
    fetchImpl: (_url, options) => { signal = options.signal; return new Promise(() => {}); },
    setTimer: callback => { timers.push(callback); return timers.length; }, clearTimer: () => {} });
  assert.equal(timers.length, 1);
  timers[0]();
  const result = await completion;
  assert.equal(result.error.code, 'REQUEST_TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('body reading is covered by the same bounded request deadline', async () => {
  const timers = [];
  let reads = 0;
  const completion = verifyProductionRelease({ production: true, expectedCommit: COMMIT,
    fetchImpl: async () => ({ status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      body: { getReader: () => ({ read: () => { reads++; return new Promise(() => {}); }, cancel: async () => {}, releaseLock() {} }) } }),
    setTimer: callback => { timers.push(callback); return timers.length; }, clearTimer: () => {} });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reads, 1);
  timers[0]();
  assert.equal((await completion).error.code, 'REQUEST_TIMEOUT');
});

test('total budget is rechecked between steps and before parsing rather than renewed per asset', async () => {
  let now = 0;
  const f = fixture({ responseHook: response => { now += 10; return response; } });
  const result = await f.verify({ now: () => now, totalTimeoutMs: 5, setTimer: () => 1, clearTimer: () => {} });
  assert.equal(result.error.code, 'TOTAL_TIMEOUT');
  assert.equal(f.requests.length, 1);
});

test('untrusted errors, response bodies and metadata never expose credentials or raw failure details', async () => {
  const result = await verifyProductionRelease({ production: true, expectedCommit: COMMIT,
    fetchImpl: () => { throw Object.assign(new Error('Bearer private-token password=private'), { smokeCode: 'private-token' }); } });
  assert.deepEqual(result.error, { code: 'READ_FAILED' });
  assert.equal(JSON.stringify(result).includes('private'), false);
  const f = fixture({ version: { buildId: COMMIT, password: 'private-token', accessToken: 'private-token' } });
  assert.equal(JSON.stringify(await f.verify()).includes('private-token'), false);
});

test('optional local dist is restricted to the designated workspace directory without reading arbitrary paths', async () => {
  for (const directory of ['..', '../dist', 'test-results', 'dist/../dist', 'C:\\Windows', '/tmp/other', 'dist/subdirectory']) {
    await assert.rejects(readControlledDistIndexHash(directory), /LOCAL_DIST_PATH_REJECTED/);
  }
});

test('default CLI emits prepared safe JSON and its identical report only under test-results', async () => {
  const workspace = fileURLToPath(new URL('..', import.meta.url));
  const script = fileURLToPath(new URL('../scripts/master-production-release-smoke.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 10000 });
  const result = JSON.parse(output);
  assert.equal(result.status, 'prepared');
  assert.equal(result.networkEnabled, false);
  assert.deepEqual(result.checks, []);
  assert.match(result.reportPath, /^test-results\/master-production-release-smoke\/smoke-\d+-\d+\.json$/);
  const report = path.resolve(workspace, result.reportPath);
  assert.ok(report.startsWith(path.join(workspace, 'test-results') + path.sep));
  try { assert.deepEqual(JSON.parse(await readFile(report, 'utf8')), result); }
  finally { await unlink(report); }
});
