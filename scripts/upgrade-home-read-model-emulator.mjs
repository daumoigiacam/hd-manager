// Local-only runner. Importing, --help and --self-test perform NO network I/O.
// Main must explicitly run this only after native benchmarking has stopped.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createHomeReadModelPrototype, buildHomeReadModelProjection, HOME_READ_MODEL_PROJECT, HOME_READ_MODEL_REVISION_KEYS } from '../performance/upgrade-20261103/pilots/home-read-model.mjs';
import { decodeHomePrimaryCompactCache } from '../src/services/homePrimaryCompactCache.js';
import { getCashExpenseFinance, getReportPeriod } from '../src/features/business-report/reportViewModel.js';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';

const ORIGIN = 'http://127.0.0.1:8185';
const DATABASE = `projects/${HOME_READ_MODEL_PROJECT}/databases/(default)`;
const BASE = `${ORIGIN}/v1/${DATABASE}/documents`;
const MAX_DOCUMENT_BYTES = 512 * 1024; // Conservative, below Firestore's 1 MiB.
const CHUNK_BYTES = 64 * 1024, MAX_SOURCE_BYTES = 16 * 1024 * 1024, MAX_CHUNKS = 256;
const scopeKeys = ['principalId', 'tenantId', 'permissionKey', 'sessionId', 'dayKey', 'timeZone', 'timezoneOffsetMinutes'];
const derivedKeys = ['payrollCosts', 'debtLedger', 'cashExpenseRecords'];
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = value => Buffer.byteLength(value, 'utf8');
const ensure = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { code }); };
function safeFailure(error) {
  const name = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error?.name || '') ? error.name : 'Error';
  const timeout = name === 'TimeoutError' || error?.code === 23 || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
  const code = timeout ? 'request-timeout' : typeof error?.code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(error.code) ? error.code : 'request-or-run-failed';
  // Drop the first stack line (it contains the untrusted error message). Keep
  // only actual frames, never raw request/response bodies or cause.message.
  const stack = String(error?.stack || '').split('\n').filter(line => /^\s+at\s/.test(line))
    .slice(0, 12).map(line => line.replace(/https?:\/\/[^\s)]+/g, '[url-redacted]').replace(/data:[^\s)]+/g, '[data-url-redacted]').slice(0, 400));
  const causeCode = /^(?:E[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+)$/.test(error?.cause?.code || '') ? error.cause.code : undefined;
  return { name, code, ...(typeof error?.code === 'number' ? { legacyCode: error.code } : {}),
    ...(Number.isInteger(error?.httpStatus) ? { httpStatus: error.httpStatus } : {}), ...(causeCode ? { causeCode } : {}), stack };
}
function verifyInputTenant(input, tenantId) {
  ensure(input.company?.id === tenantId, 'source-company-tenant-mismatch');
  for (const key of HOME_READ_MODEL_REVISION_KEYS) {
    if (derivedKeys.includes(key) || key === 'companies') continue;
    const collection = input[key];
    for (const row of Array.isArray(collection) ? collection : Object.values(collection || {}))
      if (row && typeof row === 'object' && 'companyId' in row) ensure(row.companyId === tenantId, 'source-row-tenant-mismatch');
  }
}
const sameRevision = (a, b) => a && b && a.schemaVersion === b.schemaVersion
  && HOME_READ_MODEL_REVISION_KEYS.every(key => a.revisions[key] === b.revisions[key]);

export function splitSourceChunks(input) {
  // Persist source inputs, never precomputed payroll, debt or cash-voucher DTOs.
  const raw = Object.fromEntries(Object.entries(input).filter(([key]) => !derivedKeys.includes(key)));
  const text = JSON.stringify(raw), buffer = Buffer.from(text, 'utf8');
  ensure(buffer.length > 0 && buffer.length <= MAX_SOURCE_BYTES, 'fictional-source-size-limit');
  const chunks = [];
  for (let start = 0; start < buffer.length;) {
    let end = Math.min(start + CHUNK_BYTES, buffer.length);
    while (end < buffer.length && (buffer[end] & 0xc0) === 0x80) end--;
    const part = buffer.subarray(start, end).toString('utf8');
    chunks.push({ index: chunks.length, text: part, sha256: hash(part) }); start = end;
  }
  ensure(chunks.length <= MAX_CHUNKS, 'fictional-chunk-count-limit');
  return { chunks, sha256: hash(text), bytes: buffer.length };
}

export function createHomeReadModelEmulatorAdapter({ appId, calculateInput, fetchImpl = globalThis.fetch,
  clock = Date.now, requestTimeoutMs = 5000, operationTimeoutMs = 120000, requestLimit = 2500, onRequestTrace } = {}) {
  ensure(/^fictional-[a-z0-9-]{1,100}$/.test(appId || ''), 'fictional-app-required');
  ensure(typeof calculateInput === 'function' && typeof fetchImpl === 'function', 'adapter-callback-required');
  ensure(onRequestTrace === undefined || typeof onRequestTrace === 'function', 'invalid-trace-callback');
  ensure(Number.isInteger(requestTimeoutMs) && requestTimeoutMs >= 1 && requestTimeoutMs <= 10000
    && Number.isInteger(operationTimeoutMs) && operationTimeoutMs >= requestTimeoutMs && operationTimeoutMs <= 180000
    && Number.isInteger(requestLimit) && requestLimit > 0 && requestLimit <= 5000, 'invalid-request-bounds');
  if (process.env.FIRESTORE_EMULATOR_HOST) ensure(process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8185', 'foreign-emulator-env-refused');
  const root = `artifacts/${appId}/public/data`;
  const headPath = `${root}/homePrototypeHeads/current`;
  const stats = { requests: 0, rollbacks: 0, transactions: 0, publications: 0, sourceReads: 0, domainBuilds: 0,
    completedRequests: 0, failedRequests: 0, timedOutRequests: 0, cleanupRequests: 0 };
  let failSource = false, requestSequence = 0, lastRequest = null;
  const deadline = () => performance.now() + operationTimeoutMs;
  function documentName(relative) {
    ensure(typeof relative === 'string' && relative.startsWith(root + '/') && !relative.includes('..')
      && /^artifacts\/[a-z0-9-]+\/public\/data\/[A-Za-z]+\/[a-z0-9-]+$/.test(relative), 'foreign-document-refused');
    return `${DATABASE}/documents/${relative}`;
  }
  async function request(action, body, { method = 'POST', end = deadline(), missing = false, cleanup = false } = {}) {
    const url = new URL(BASE + action);
    ensure(url.origin === ORIGIN && url.pathname.startsWith(`/v1/${DATABASE}/documents`) && !url.username && !url.password, 'foreign-transport-refused');
    if (!cleanup) ensure(++stats.requests <= requestLimit, 'request-count-limit');
    const remaining = cleanup ? 2000 : Math.min(requestTimeoutMs, Math.floor(end - performance.now()));
    ensure(remaining > 0, 'operation-deadline');
    if (cleanup) stats.cleanupRequests++;
    const category = value => ['homePrototypeHeads', 'homePrototypeChunks', 'homePrototypeModels'].find(kind => value.includes('/' + kind + '/')) || 'other';
    const actionLabel = action.startsWith(':') ? action.slice(1) : 'get:' + category(action);
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);
    const meta = { requestId: ++requestSequence, origin: ORIGIN, project: HOME_READ_MODEL_PROJECT, action: actionLabel, method,
      transactional: !!(body?.transaction || url.searchParams.has('transaction')), cleanup, timeoutMs: remaining,
      requestBytes: serializedBody === undefined ? 0 : bytes(serializedBody), writeCount: body?.writes?.length || 0,
      ...(body?.documents ? { readKinds: [...new Set(body.documents.map(category))] } : {}),
      ...(body?.writes ? { writeKinds: [...new Set(body.writes.map(item => category(item.update?.name || item.delete || '')))] } : {}) };
    const started = performance.now(), signal = AbortSignal.timeout(remaining);
    let phase = 'fetch-headers', responseStatus = null, length = 0;
    const trace = async event => {
      lastRequest = event;
      if (onRequestTrace) await onRequestTrace(clone(event));
    };
    try {
    await trace({ ...meta, event: 'start', phase, elapsedMs: 0, stats: clone(stats) });
    const response = await fetchImpl(url.href, { method, redirect: 'error',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      ...(serializedBody === undefined ? {} : { body: serializedBody }), signal });
    responseStatus = response.status; phase = 'read-body';
    // Bound response reading as well as the request. The abort signal remains
    // live while reading the body; source chunks have their own size/hash checks.
    const chunks = [];
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > 2 * MAX_DOCUMENT_BYTES) { await reader.cancel(); throw Error('response-size-limit'); }
          chunks.push(Buffer.from(chunk.value));
        }
      } finally { reader.releaseLock(); }
    }
    const text = Buffer.concat(chunks, length).toString('utf8');
    if (missing && response.status === 404) {
      stats.completedRequests++;
      await trace({ ...meta, event: 'complete', phase, elapsedMs: performance.now() - started, httpStatus: response.status, responseBytes: length, stats: clone(stats) });
      return null;
    }
    if (!response.ok) throw Object.assign(new Error('local-emulator-request-failed'), { code: 'local-emulator-request-failed', httpStatus: response.status });
    phase = 'parse-body';
    const result = text ? JSON.parse(text) : {};
    stats.completedRequests++;
    await trace({ ...meta, event: 'complete', phase, elapsedMs: performance.now() - started, httpStatus: response.status, responseBytes: length, stats: clone(stats) });
    return result;
    } catch (error) {
      stats.failedRequests++;
      const failure = safeFailure(error); if (failure.code === 'request-timeout') stats.timedOutRequests++;
      const diagnostic = { ...meta, event: 'error', phase, elapsedMs: performance.now() - started, httpStatus: responseStatus,
        responseBytes: length, failure, stats: clone(stats) };
      try { await trace(diagnostic); } catch { lastRequest = diagnostic; }
      // Preserve HTTP status for the existing bounded transaction abort policy.
      // DOMException.code can be numeric (23); never use that as CLI reason.
      const wrapped = Object.assign(new Error(failure.code), { code: failure.code, requestDiagnostic: diagnostic,
        ...(Number.isInteger(error?.httpStatus) ? { httpStatus: error.httpStatus } : {}) });
      throw wrapped;
    }
  }
  async function get(relative, transaction, end) {
    const name = documentName(relative);
    let doc;
    if (transaction) {
      // Emulator 1.20.4 HttpAdapter cannot decode BYTE_STRING query parameters.
      // Keep the SAME read-only/read-write transaction, using its JSON body
      // representation. Never substitute a nontransactional read for CAS.
      const results = await request(':batchGet', { documents: [name], transaction }, { end });
      ensure(Array.isArray(results) && results.length >= 1 && results.length <= 2, 'invalid-batch-get-response');
      const matches = results.filter(row => row && (Object.prototype.hasOwnProperty.call(row, 'found') || Object.prototype.hasOwnProperty.call(row, 'missing')));
      ensure(matches.length === 1, 'invalid-batch-get-response');
      const match = matches[0];
      if (Object.prototype.hasOwnProperty.call(match, 'missing')) {
        ensure(match.missing === name && !Object.prototype.hasOwnProperty.call(match, 'found'), 'invalid-batch-get-response');
        return null;
      }
      doc = match.found;
    } else doc = await request('/' + relative, undefined, { method: 'GET', missing: true, end });
    if (!doc) return null;
    ensure(doc.name === documentName(relative) && typeof doc.fields?.payload?.stringValue === 'string', 'invalid-local-document');
    const text = doc.fields.payload.stringValue;
    ensure(bytes(text) <= MAX_DOCUMENT_BYTES, 'document-size-limit');
    return JSON.parse(text);
  }
  function write(relative, value, createOnly = false) {
    const doc = { name: documentName(relative), fields: { payload: { stringValue: JSON.stringify(value) } } };
    ensure(bytes(JSON.stringify(doc)) <= MAX_DOCUMENT_BYTES, 'document-size-limit');
    return { update: doc, ...(createOnly ? { currentDocument: { exists: false } } : {}) };
  }
  async function rollback(transaction) {
    stats.rollbacks++;
    try { await request(':rollback', { transaction }, { cleanup: true }); } catch { /* preserve original error */ }
  }
  async function transaction(readOnly, operation) {
    const end = deadline();
    for (let attempt = 0; attempt < 2; attempt++) {
      let token = null, committed = false;
      try {
        token = (await request(':beginTransaction', { options: readOnly ? { readOnly: {} } : { readWrite: {} } }, { end })).transaction;
        ensure(typeof token === 'string' && token, 'transaction-token-missing'); stats.transactions++;
        const result = await operation({ get: relative => get(relative, token, end), end });
        if (!readOnly && result.writes?.length) {
          ensure(result.writes.length <= 2 && bytes(JSON.stringify(result.writes)) <= 2 * MAX_DOCUMENT_BYTES, 'transaction-write-limit');
          await request(':commit', { transaction: token, writes: result.writes }, { end }); committed = true;
        }
        return result.value;
      } catch (error) {
        // Retry only a known transaction abort. An ambiguous timeout is surfaced,
        // never blindly replayed as a successful write.
        if (error.httpStatus !== 409 || attempt === 1) throw error;
      } finally { if (token && !committed) await rollback(token); }
    }
    throw Error('transaction-retry-exhausted');
  }
  function actorFromHead(head, context) {
    return head?.actors?.find(actor => actor.allowed === true && scopeKeys.every(key => actor.scope[key] === context.scope[key]));
  }
  function modelPath(key, context) {
    const expected = JSON.stringify([HOME_READ_MODEL_PROJECT, appId, 1, ...scopeKeys.map(name => context.scope[name])]);
    ensure(key === expected && context.projectId === HOME_READ_MODEL_PROJECT && context.appId === appId, 'foreign-model-key');
    return `${root}/homePrototypeModels/${hash(key)}`;
  }
  async function headNow() { const head = await get(headPath); ensure(head?.kind === 'fictional-home-head-v1', 'source-head-missing'); return head; }
  const callbacks = {
    async verifyContext(request = {}) {
      const head = await headNow();
      const actor = head.actors.find(item => item.id === (request.actor || 'owner'));
      return actor ? { verified: true, allowed: actor.allowed, projectId: HOME_READ_MODEL_PROJECT, appId, scope: clone(actor.scope) }
        : { verified: false, allowed: false };
    },
    async readVersion(context) {
      if (failSource) throw Error('synthetic-source-failure');
      const head = await headNow(); ensure(actorFromHead(head, context), 'actor-revoked');
      ensure(context.scope.tenantId === head.sourceTenantId, 'source-tenant-mismatch');
      return clone(head.version);
    },
    async readInputs(context) {
      if (failSource) throw Error('synthetic-source-failure');
      const captured = await transaction(true, async tx => {
        const head = await tx.get(headPath);
        ensure(actorFromHead(head, context) && context.scope.tenantId === head.sourceTenantId, 'actor-or-source-mismatch');
        ensure(head.manifest && Array.isArray(head.manifest.chunks) && head.manifest.chunks.length > 0 && head.manifest.chunks.length <= MAX_CHUNKS
          && Number.isSafeInteger(head.manifest.bytes) && head.manifest.bytes > 0 && head.manifest.bytes <= MAX_SOURCE_BYTES, 'invalid-source-manifest');
        const text = [];
        for (const part of head.manifest.chunks) {
          const doc = await tx.get(`${root}/homePrototypeChunks/${part.id}`);
          ensure(doc && doc.index === text.length && typeof doc.text === 'string' && bytes(doc.text) <= CHUNK_BYTES
            && hash(doc.text) === part.sha256, 'source-chunk-mismatch');
          text.push(doc.text);
        }
        const joined = text.join('');
        ensure(bytes(joined) === head.manifest.bytes && hash(joined) === head.manifest.sha256, 'source-manifest-mismatch');
        return { value: { head, raw: JSON.parse(joined) } };
      });
      stats.sourceReads++;
      verifyInputTenant(captured.raw, context.scope.tenantId);
      stats.domainBuilds++;
      const input = await calculateInput(captured.raw);
      verifyInputTenant(input, context.scope.tenantId);
      return { verified: true, complete: true, version: captured.head.version, inputs: input,
        derivedFor: Object.fromEntries(derivedKeys.map(key => [key, clone(captured.head.version.revisions)])) };
    },
    storage: {
      async read(key, context) { return get(modelPath(key, context)); },
      async publishIfCurrent({ key, record, expectedVersion, context }) {
        const target = modelPath(key, context);
        const outcome = await transaction(false, async tx => {
          // Head and model are in the SAME real Emulator transaction read set.
          // A concurrent head mutation aborts commit; no check-then-blind-write.
          const head = await tx.get(headPath), previous = await tx.get(target);
          if (!actorFromHead(head, context) || !sameRevision(head.version, expectedVersion)) return { value: { status: 'conflict' } };
          if (previous && sameRevision(previous.sourceVersion, expectedVersion) && previous.expiresAt > clock())
            return { value: { status: 'replayed', record: previous } };
          ensure(JSON.stringify(record.scope) === JSON.stringify(context.scope) && sameRevision(record.sourceVersion, expectedVersion), 'publication-scope-or-version');
          return { writes: [write(target, record)], value: { status: 'published', record } };
        });
        if (outcome.status === 'published') stats.publications++;
        return outcome;
      },
    }, clock, ttlMs: 900000, maxAttempts: 2,
  };
  return {
    callbacks, stats, root, headPath,
    getLastRequestDiagnostic() { return lastRequest ? clone(lastRequest) : null; },
    async seed(input, scope, provenance) {
      verifyInputTenant(input, scope.tenantId);
      const packed = splitSourceChunks(input), end = deadline();
      const chunkRefs = packed.chunks.map(chunk => ({ id: `${packed.sha256}-${String(chunk.index).padStart(4, '0')}`, sha256: chunk.sha256 }));
      // Seed immutable chunks first. Only an atomic head commit makes the complete
      // generation visible; failed seeding leaves unreferenced fictional chunks.
      for (let index = 0; index < packed.chunks.length; index += 16) {
        const writes = packed.chunks.slice(index, index + 16).map(chunk => write(`${root}/homePrototypeChunks/${chunkRefs[chunk.index].id}`, chunk, true));
        ensure(bytes(JSON.stringify({ writes })) <= 4 * 1024 * 1024, 'seed-batch-limit');
        await request(':commit', { writes }, { end });
      }
      const version = { schemaVersion: 1, readTime: clock(), revisions: Object.fromEntries(HOME_READ_MODEL_REVISION_KEYS.map(key => [key, 1])) };
      const head = { kind: 'fictional-home-head-v1', sourceTenantId: scope.tenantId, version, provenance,
        manifest: { sha256: packed.sha256, bytes: packed.bytes, chunks: chunkRefs },
        actors: [{ id: 'owner', allowed: true, scope }, { id: 'other', allowed: true, scope: { ...scope, principalId: 'fictional-other-actor', sessionId: 'fictional-other-session' } }] };
      await transaction(false, async tx => { ensure(!await tx.get(headPath), 'run-head-already-exists'); return { writes: [write(headPath, head, true)], value: true }; });
      return { version, sourceBytes: packed.bytes, chunks: packed.chunks.length, manifestSha256: packed.sha256 };
    },
    async deleteCurrentModel() {
      // Resolve the explicit fixture owner; a prior cross-actor read must never
      // change which model the cold-miss setup deletes.
      const context = await callbacks.verifyContext({ actor: 'owner' });
      ensure(context.verified && context.allowed, 'owner-not-verified');
      const key = JSON.stringify([HOME_READ_MODEL_PROJECT, appId, 1, ...scopeKeys.map(name => context.scope[name])]);
      await request(':commit', { writes: [{ delete: documentName(modelPath(key, context)) }] });
    },
    async bumpNoopSourceVersion() {
      return transaction(false, async tx => {
        const head = await tx.get(headPath); ensure(head, 'source-head-missing');
        head.version.revisions.orders++; head.version.readTime = clock();
        return { writes: [write(headPath, head)], value: head.version.revisions.orders };
      });
    },
    setSourceFailure(enabled) { failSource = enabled === true; },
  };
}

function financeView(snapshot, period = 'today') {
  const report = getReportPeriod(getCashExpenseFinance(snapshot.finance), period);
  return Object.fromEntries(['revenue', 'expense', 'profit', 'receivables'].map(key => [key, report[key]]));
}
const metricKeys = ['revenue', 'expense', 'profit', 'receivables'];
function equalMoney(a, b) { return a && b && metricKeys.every(key => Number.isFinite(a[key]) && Object.is(a[key], b[key])); }
export async function readParityEvidence(filename) {
  const evidence = JSON.parse(await fs.readFile(filename, 'utf8'));
  ensure(evidence.kind === 'home-read-model-actual-app-parity-v1' && evidence.status === 'PASS'
    && evidence.sourceEquivalent === true && equalMoney(evidence.actualApp, evidence.prototype), 'actual-app-parity-not-resolved');
  for (const key of ['sourceRevision', 'domainSourceSha256', 'appSourceSha256']) ensure(/^[a-f0-9]{64}$/.test(evidence[key] || ''), 'parity-evidence-hash-missing');
  ensure(evidence.timeZone === 'Asia/Ho_Chi_Minh' && /^\d{4}-\d{2}-\d{2}$/.test(evidence.dayKey), 'parity-calendar-missing');
  ensure(evidence.nativeEvidence?.path && /^[a-f0-9]{64}$/.test(evidence.nativeEvidence.sha256 || ''), 'native-evidence-missing');
  const native = await fs.readFile(path.resolve(evidence.nativeEvidence.path));
  ensure(hash(native) === evidence.nativeEvidence.sha256, 'native-evidence-changed');
  ensure(hash(await fs.readFile('src/App.jsx')) === evidence.appSourceSha256, 'app-source-changed-since-parity');
  return evidence;
}

function summary(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return { count: values.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) };
}
async function measure(operation) {
  const cpu = process.cpuUsage(), memoryBefore = process.memoryUsage(), started = performance.now();
  const value = await operation();
  return { value, metrics: { wallMs: performance.now() - started, nodeCpuMicroseconds: process.cpuUsage(cpu),
    nodeMemoryBefore: memoryBefore, nodeMemoryAfter: process.memoryUsage(),
    nodeProcessLifetimeMaxRssKiB: process.resourceUsage().maxRSS } };
}
// Main can export loadSyntheticHomeInput() output without editing that helper.
// CLI consumes only that local file and never invokes its multi-port preflight.
export async function exportSyntheticHomeInput(loaded, domainModulePath, filename) {
  const target = path.resolve(filename), root = path.resolve('test-results');
  ensure(target.startsWith(root + path.sep), 'source-export-must-be-within-test-results');
  const modulePath = path.resolve(domainModulePath), inputText = JSON.stringify(loaded.input);
  ensure(bytes(inputText) <= 32 * 1024 * 1024, 'source-export-size-limit');
  const record = { kind: 'fictional-home-input-export-v1', input: JSON.parse(inputText), inputSha256: hash(inputText),
    sourceRevision: loaded.sourceRevision, domainSourceSha256: loaded.domainSourceSha256, fixture: loaded.fixture,
    sourceMetadata: loaded.sourceMetadata, sourceReadMs: loaded.sourceReadMs, domainComputeMs: loaded.domainComputeMs,
    domainModulePath: modulePath, domainModuleSha256: hash(await fs.readFile(modulePath)) };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(record));
  return target;
}
async function loadLocalSourceExport(filename) {
  ensure(filename && (await fs.stat(filename)).size <= 33 * 1024 * 1024, 'local-source-export-required-or-too-large');
  const record = JSON.parse(await fs.readFile(filename, 'utf8'));
  ensure(record.kind === 'fictional-home-input-export-v1' && record.inputSha256 === hash(JSON.stringify(record.input)), 'invalid-local-source-export');
  return record;
}
export async function runEmulatorPrototype({ parityEvidence, sourceSnapshot, loadInput, outputDirectory, nativeIdleAcknowledged = false, traceRequests = false } = {}) {
  ensure(nativeIdleAcknowledged === true, 'main-must-confirm-native-idle');
  const evidence = await readParityEvidence(parityEvidence); // BEFORE any request.
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  const now = new Date(), dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  ensure(evidence.dayKey === dayKey, 'parity-evidence-is-not-for-today');
  const out = path.resolve(outputDirectory || `test-results/home-read-model-emulator-${Date.now()}-${randomUUID().slice(0, 8)}`);
  const reportRoot = path.resolve('test-results');
  ensure(out.startsWith(reportRoot + path.sep), 'report-path-must-be-within-test-results');
  await fs.mkdir(out, { recursive: true });
  let adapter = null, stage = 'load-source-export', traceHandle = null;
  try {
  if (traceRequests) traceHandle = await fs.open(path.join(out, 'home-read-model-request-trace.jsonl'), 'wx');
  const onRequestTrace = async event => {
    const diagnostic = { ...event, runnerStage: stage };
    if (event.event === 'error') console.error(JSON.stringify({ status: 'LOCAL_REQUEST_FAILED', ...diagnostic }));
    if (traceHandle) await traceHandle.write(JSON.stringify(diagnostic) + '\n');
  };
  // The caller owns extraction and the consistent read-only source loader.
  // No helper preflight, build, or secondary network endpoint is invoked here.
  const loaded = typeof loadInput === 'function' ? await loadInput(out) : await loadLocalSourceExport(sourceSnapshot);
  ensure(loaded.fixture?.project === 'demo-hdm-perf-verification' && loaded.input?.company?.id === 'phase2-fictional'
    && loaded.input.orders?.length === 2000 && loaded.input.customers?.length === 1000 && loaded.input.payments?.length === 2000, 'approved-fictional-input-required');
  ensure(loaded.sourceRevision === evidence.sourceRevision && loaded.domainSourceSha256 === evidence.domainSourceSha256, 'fictional-source-or-domain-changed-since-parity');
  const modulePath = path.resolve(loaded.domainModulePath || path.join(out, 'existing-home-domain.mjs'));
  ensure(loaded.domainModuleSha256 && hash(await fs.readFile(modulePath)) === loaded.domainModuleSha256, 'extracted-domain-module-hash-mismatch');
  const domain = await import(pathToFileURL(modulePath).href);
  stage = 'financial-parity-preview';
  const calculateInput = raw => {
    const input = clone(raw);
    input.now = new Date();
    input.expenses = input.expenses.filter(domain.isCashflowOfficial);
    input.payments = input.payments.filter(domain.isCashflowOfficial);
    for (const row of Object.values(input.attendance || {})) {
      row.checkIn = row.checkIn ? new Date(row.checkIn) : null;
      row.checkOut = row.checkOut ? new Date(row.checkOut) : null;
    }
    ensure(!(input.payrollPeriods || []).some(period => ['locked', 'finalized', 'closed'].includes(period.status)), 'complete-locked-payroll-reader-required');
    const steps = domain.buildDashboardPayrollCostSteps(input);
    for (;;) { const step = steps.next(); if (step.done) { input.payrollCosts = step.value; break; } }
    const ledger = domain.buildCustomerReconciledLedgerMap(input.customers, input.orders, input.payments, input.warehouseImports, input.expenses);
    ensure(input.customers.every(customer => customer.isArchived || ledger[customer.id] && Number.isFinite(ledger[customer.id].currentDebt)), 'reconciled-ledger-incomplete');
    input.debtLedger = input.customers.filter(customer => !customer.isArchived).map(customer => ({ id: customer.id, debt: ledger[customer.id].currentDebt }));
    input.cashExpenseRecords = input.expenses.map(row => ({ ...row, date: domain.resolveCashflowDateKey(row) }));
    return input;
  };
  const scope = { principalId: 'fictional-manager', tenantId: loaded.input.company.id, permissionKey: 'fictional-manager-grants-1',
    sessionId: `fictional-session-${randomUUID()}`, dayKey, timeZone: 'Asia/Ho_Chi_Minh', timezoneOffsetMinutes: new Date().getTimezoneOffset() };
  const previewVersion = { schemaVersion: 1, readTime: Date.now(), revisions: Object.fromEntries(HOME_READ_MODEL_REVISION_KEYS.map(key => [key, 1])) };
  const preview = await buildHomeReadModelProjection(loaded.input, { scope, version: previewVersion, now: Date.now(), ttlMs: 900000 });
  const decoded = decodeHomePrimaryCompactCache(preview.compact, scope, { now: Date.now() });
  ensure(decoded.ok && equalMoney(financeView(decoded.snapshot), evidence.actualApp), 'actual-app-financial-parity-failed');
  const full = buildExecutiveDashboardSnapshot(loaded.input);
  for (const period of ['today', 'week', 'month', 'quarter', 'year']) ensure(equalMoney(financeView(decoded.snapshot, period), financeView(full, period)), 'full-builder-period-parity-failed');
  const appId = `fictional-home-model-${randomUUID()}`;
  adapter = createHomeReadModelEmulatorAdapter({ appId, calculateInput, onRequestTrace });
  stage = 'seed-immutable-chunks-and-head';
  const seeded = await adapter.seed(loaded.input, scope, { sourceRevision: loaded.sourceRevision, domainSourceSha256: loaded.domainSourceSha256,
    appSourceSha256: evidence.appSourceSha256, sourceProject: 'demo-hdm-perf-verification' });
  const api = createHomeReadModelPrototype(adapter.callbacks);
  const checked = result => { ensure(result.current && equalMoney(financeView(result.snapshot), evidence.actualApp), 'measured-result-not-current-or-not-exact'); return result; };
  stage = 'bootstrap-model-miss';
  const bootstrapMissing = await measure(async () => {
    ensure((await api.read({})).state === 'missing', 'bootstrap-model-was-not-missing');
    return checked(await api.refresh({}));
  });
  const prepared = [], missing = [];
  stage = 'prepared-model-reads';
  for (let index = 0; index < 20; index++) {
    const before = adapter.stats.domainBuilds;
    const sample = await measure(async () => checked(await api.read({})));
    ensure(adapter.stats.domainBuilds === before, 'prepared-read-recomputed-sources'); prepared.push(sample.metrics);
  }
  stage = 'genuine-model-miss-builds';
  for (let index = 0; index < 20; index++) {
    await adapter.deleteCurrentModel(); // Exact owned key; outside measured region.
    const before = adapter.stats.domainBuilds;
    const sample = await measure(async () => {
      ensure((await api.read({})).state === 'missing', 'cold-sample-model-not-missing');
      return checked(await api.refresh({}));
    });
    ensure(adapter.stats.domainBuilds === before + 1, 'missing-sample-did-not-rebuild-app-domain'); missing.push(sample.metrics);
  }
  stage = 'stale-replay-and-scope-scenarios';
  const revision = await adapter.bumpNoopSourceVersion();
  const stale = await api.read({}); ensure(stale.state === 'stale' && !stale.current, 'stale-version-accepted');
  checked(await api.refresh({}, { source: 'orders', revision }));
  const publications = adapter.stats.publications;
  const replay = await api.refresh({}, { source: 'orders', revision });
  ensure(replay.current && replay.replayed && adapter.stats.publications === publications, 'event-replay-not-idempotent');
  const cross = await api.read({ actor: 'other' }); ensure(!cross.current && !cross.snapshot, 'cross-actor-leak');
  adapter.setSourceFailure(true);
  const unavailable = await api.read({}), otherUnavailable = await api.read({ actor: 'other' });
  ensure(unavailable.state === 'revalidating' && !unavailable.current && unavailable.snapshot, 'failure-not-labeled-cached');
  ensure(!otherUnavailable.snapshot, 'failure-cross-actor-leak'); adapter.setSourceFailure(false);
  const report = { status: 'LOCAL_NODE_EMULATOR_ONLY_NOT_APP_ACCEPTANCE', project: HOME_READ_MODEL_PROJECT, appId, at: new Date().toISOString(),
    parity: { status: 'PASS', metrics: evidence.actualApp, evidenceFile: path.resolve(parityEvidence), nativeEvidence: evidence.nativeEvidence,
      sourceRevision: loaded.sourceRevision, domainSourceSha256: loaded.domainSourceSha256, appSourceSha256: evidence.appSourceSha256 },
    transport: { origin: ORIGIN, authorization: 'fictional Emulator owner bypass; does NOT validate production/client Rules', rulesChanged: false },
    storage: { ...seeded, layout: 'Immutable UTF-8 JSON chunks without derived payroll/debt/vouchers; atomic head manifest. Head+model read/CAS in one read-write transaction.',
      maxDocumentWireBytes: MAX_DOCUMENT_BYTES, maxChunkBytes: CHUNK_BYTES, cleanup: 'Unique fictional app generation retained for inspection; no project-wide delete.' },
    measurements: { label: 'NODE PROCESS ONLY; not Android CPU/PSS, emulator CPU, cold process or App startup',
      requestTraceEnabled: traceRequests, traceOverhead: traceRequests ? 'DIAGNOSTIC RUN: awaited request trace writes included in timings' : 'Errors only; trace callback metadata overhead included',
      bootstrapGenuineMissing: bootstrapMissing.metrics, prepared20: { wallMs: summary(prepared.map(row => row.wallMs)), samples: prepared },
      missing20: { wallMs: summary(missing.map(row => row.wallMs)), samples: missing },
      excluded: ['Main-owned initial fixture loading/domain extraction and isolated chunk seeding', 'Model deletion before each miss', 'No claim of cold database/OS cache; Emulator and extracted Node domain are warm'],
      missingIncludes: ['Missing model confirmation', 'Consistent immutable source reads', 'Actual App payroll/debt/cash recomputation', 'Home build+compact codec', 'Transactional model publication and version revalidation'] },
    scenarios: { stale: stale.state, replay: replay.replayed, crossActor: cross.state, failedSource: unavailable.state, failedSourceOtherActor: otherUnavailable.state },
    requests: clone(adapter.stats), limitations: ['Trusted local parity evidence is mandatory; not independent native acceptance.', 'No real auth/backend adapter, Rules changes or new production architecture.',
      'Prepared reads include multiple bounded REST authority/version checks; not a claim of a single App request.', 'Locked payroll refused until the main loader supplies a complete locked-snapshot reader.',
      'Old native payroll cohort is preserved. No forced 7.002B oracle: new evidence must reflect authoritative empty complaints and current App publication fix.'] };
  await fs.writeFile(path.join(out, 'home-read-model-emulator-report.json'), JSON.stringify(report, null, 2));
  return { outputDirectory: out, report };
  } catch (error) {
    const diagnostic = { status: 'BLOCKED_OR_FAILED_NOT_PASS', runnerStage: stage, failure: safeFailure(error),
      request: error.requestDiagnostic || adapter?.getLastRequestDiagnostic() || null, stats: adapter ? clone(adapter.stats) : null,
      timeoutPolicy: { requestMs: 5000, operationMs: 120000, increased: false }, traceEnabled: traceRequests };
    const filename = path.join(out, 'home-read-model-emulator-failure.json');
    try { await fs.writeFile(filename, JSON.stringify(diagnostic, null, 2), { flag: 'wx' }); error.failureReportPath = filename; } catch { /* never overwrite prior evidence */ }
    error.runDiagnostic = diagnostic;
    throw error;
  } finally { if (traceHandle) await traceHandle.close(); }
}

async function selfTest() {
  const assert = (await import('node:assert/strict')).default;
  // In-memory REST protocol double only. No server/socket/emulator is started.
  const docs = new Map(), transactions = new Map(); let sequence = 0, commits = 0, rollbackCount = 0, conflictOnce = false, beforeModelCommit = null, malformedBatch = false;
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.ok(url.startsWith(BASE)); assert.equal(options.headers.Authorization, 'Bearer owner'); assert.equal(options.redirect, 'error');
    const body = options.body ? JSON.parse(options.body) : {}, uri = new URL(url);
    assert.equal(uri.searchParams.has('transaction'), false, 'transaction must never be a REST GET query parameter');
    const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
    if (uri.pathname.endsWith(':beginTransaction')) { const id = 'tx-' + ++sequence; transactions.set(id, { snapshot: new Map(docs), reads: new Map() }); return response({ transaction: id }); }
    if (uri.pathname.endsWith(':rollback')) { rollbackCount++; transactions.delete(body.transaction); return response({}); }
    if (uri.pathname.endsWith(':batchGet')) {
      assert.equal(options.method, 'POST'); assert.equal(body.documents.length, 1);
      assert.ok(typeof body.transaction === 'string' && transactions.has(body.transaction));
      const tx = transactions.get(body.transaction), name = body.documents[0];
      if (malformedBatch) return response([{ missing: name }, { missing: name }]);
      const document = tx.snapshot.get(name); tx.reads.set(name, document);
      return response(document ? [{ found: document }] : [{ missing: name }]);
    }
    if (uri.pathname.endsWith(':commit')) {
      const tx = transactions.get(body.transaction);
      if (tx && beforeModelCommit && body.writes.some(item => item.update?.name.includes('/homePrototypeModels/'))) {
        const hook = beforeModelCommit; beforeModelCommit = null; hook();
      }
      if (conflictOnce && tx) { conflictOnce = false; return response({}, 409); }
      if (tx && [...tx.reads].some(([name, old]) => docs.get(name) !== old)) return response({}, 409);
      for (const item of body.writes) if (item.currentDocument?.exists === false && docs.has(item.update.name)) return response({}, 409);
      for (const item of body.writes) { if (item.delete) docs.delete(item.delete); else docs.set(item.update.name, clone(item.update)); }
      commits++; if (body.transaction) transactions.delete(body.transaction); return response({ commitTime: new Date().toISOString() });
    }
    const name = uri.pathname.slice('/v1/'.length);
    assert.equal(options.method, 'GET');
    const doc = docs.get(name);
    return doc ? response(doc) : response({}, 404);
  };
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  const stamp = Date.parse('2026-11-04T05:00:00Z');
  const scope = { principalId: 'fictional-manager', tenantId: 'phase2-fictional', permissionKey: 'grants-1', sessionId: 'session-1', dayKey: '2026-11-04', timeZone: 'Asia/Ho_Chi_Minh', timezoneOffsetMinutes: -420 };
  const raw = { company: { id: scope.tenantId }, employees: [], customers: [], orders: [{ date: scope.dayKey, amount: 120 }], payments: [], expenses: [{ date: scope.dayKey, amount: 20 }],
    rawUnicode: 'Đây là dữ liệu hư cấu 🧪'.repeat(5000), payrollCosts: [{ secretDerived: true }], debtLedger: [], cashExpenseRecords: [] };
  const chunks = splitSourceChunks(raw); assert.ok(chunks.chunks.length > 1);
  assert.ok(!chunks.chunks.map(c => c.text).join('').includes('secretDerived'));
  assert.equal(hash(chunks.chunks.map(c => c.text).join('')), chunks.sha256);
  let calculations = 0;
  const adapter = createHomeReadModelEmulatorAdapter({ appId: 'fictional-self-test', clock: () => stamp, fetchImpl: fakeFetch,
    calculateInput: async input => { calculations++; return { ...input, payrollCosts: [], debtLedger: [], cashExpenseRecords: input.expenses }; } });
  await assert.rejects(adapter.seed({ ...raw, company: { id: 'wrong-fictional-tenant' } }, scope, {}), /source-company-tenant-mismatch/);
  await assert.rejects(adapter.seed({ ...raw, orders: [{ companyId: 'wrong-fictional-tenant' }] }, scope, {}), /source-row-tenant-mismatch/);
  assert.equal(calls.length, 0, 'wrong tenant fails before any transport request');
  await adapter.seed(raw, scope, { fictional: true });
  const api = createHomeReadModelPrototype(adapter.callbacks);
  assert.equal((await api.read({})).state, 'missing');
  conflictOnce = true;
  const first = await api.refresh({}); assert.equal(first.state, 'current', first.reason); assert.equal(calculations, 1);
  assert.equal(financeView(first.snapshot).profit, 100);
  assert.ok(rollbackCount > 0); assert.equal(transactions.size, 0);
  const writes = commits;
  const replay = await api.refresh({}); assert.equal(replay.replayed, true); assert.equal(commits, writes);
  assert.equal((await api.read({ actor: 'other' })).snapshot, null);
  await adapter.deleteCurrentModel(); assert.equal((await api.read({})).state, 'missing');
  assert.equal((await api.refresh({})).current, true); assert.equal(calculations, 2);
  await adapter.bumpNoopSourceVersion(); assert.equal((await api.read({})).state, 'stale');
  assert.equal((await api.refresh({})).current, true);
  adapter.setSourceFailure(true);
  assert.equal((await api.read({})).state, 'revalidating');
  assert.equal((await api.read({ actor: 'other' })).snapshot, null); adapter.setSourceFailure(false);
  await adapter.deleteCurrentModel();
  beforeModelCommit = () => {
    const entry = [...docs.entries()].find(([name]) => name.endsWith('/homePrototypeHeads/current'));
    const document = clone(entry[1]), head = JSON.parse(document.fields.payload.stringValue);
    head.version.revisions.orders++;
    document.fields.payload.stringValue = JSON.stringify(head); docs.set(entry[0], document);
  };
  const buildsBeforeRace = calculations;
  const raced = await api.refresh({});
  assert.equal(raced.current, true); assert.equal(raced.attempts, 2);
  assert.equal(calculations, buildsBeforeRace + 2, 'head mutation rejects old transaction and rebuilds exact current sources');
  assert.equal(transactions.size, 0);
  // Forge internally consistent chunk hashes and head manifest while keeping
  // the verified actor/head tenant unchanged. Semantic company validation must
  // still reject the wrongly stamped source BEFORE any formula invocation.
  const originalDocs = new Map(docs), forged = splitSourceChunks({ ...raw, company: { id: 'wrong-fictional-tenant' } });
  const headEntry = [...docs.entries()].find(([name]) => name.endsWith('/homePrototypeHeads/current'));
  const headDoc = clone(headEntry[1]), head = JSON.parse(headDoc.fields.payload.stringValue);
  assert.equal(forged.chunks.length, head.manifest.chunks.length);
  for (let index = 0; index < forged.chunks.length; index++) {
    const reference = head.manifest.chunks[index];
    reference.sha256 = forged.chunks[index].sha256;
    const name = `${DATABASE}/documents/${adapter.root}/homePrototypeChunks/${reference.id}`;
    const document = clone(docs.get(name)); document.fields.payload.stringValue = JSON.stringify(forged.chunks[index]); docs.set(name, document);
  }
  head.manifest.sha256 = forged.sha256; head.manifest.bytes = forged.bytes;
  headDoc.fields.payload.stringValue = JSON.stringify(head); docs.set(headEntry[0], headDoc);
  const beforeWrongTenant = calculations;
  const context = await adapter.callbacks.verifyContext({});
  await assert.rejects(adapter.callbacks.readInputs(context), /source-company-tenant-mismatch/);
  assert.equal(calculations, beforeWrongTenant); assert.equal(transactions.size, 0);
  docs.clear(); for (const [name, document] of originalDocs) docs.set(name, document);
  malformedBatch = true;
  await assert.rejects(adapter.callbacks.readInputs(context), /invalid-batch-get-response/);
  assert.equal(transactions.size, 0, 'malformed batchGet response rolls back its transaction');
  malformedBatch = false;
  // Immutable corruption is not silently repaired or converted into empty data.
  const chunkEntry = [...docs.entries()].find(([name]) => name.includes('/homePrototypeChunks/'));
  const corrupted = clone(chunkEntry[1]); corrupted.fields.payload.stringValue = JSON.stringify({ index: 0, text: 'bad' }); docs.set(chunkEntry[0], corrupted);
  await adapter.deleteCurrentModel();
  assert.equal((await api.refresh({})).current, false); assert.equal(transactions.size, 0);
  assert.throws(() => createHomeReadModelEmulatorAdapter({ appId: '../production', calculateInput() {}, fetchImpl: fakeFetch }), /fictional-app-required/);
  assert.throws(() => splitSourceChunks({ data: 'x'.repeat(MAX_SOURCE_BYTES + 1) }), /fictional-source-size-limit/);
  assert.ok(calls.some(call => call.url.endsWith(':batchGet') && call.method === 'POST'));
  const trace = [];
  const timedOut = createHomeReadModelEmulatorAdapter({ appId: 'fictional-timeout-test', calculateInput: async input => input,
    fetchImpl: async () => { throw new DOMException('DO_NOT_LOG_PAYLOAD_OR_TOKEN', 'TimeoutError'); }, onRequestTrace: event => trace.push(event) });
  await assert.rejects(timedOut.seed({ company: { id: scope.tenantId }, marker: 'DO_NOT_LOG_PAYLOAD_OR_TOKEN' }, scope, {}), error => {
    assert.equal(error.code, 'request-timeout'); assert.equal(error.requestDiagnostic.failure.legacyCode, 23);
    assert.equal(error.requestDiagnostic.phase, 'fetch-headers'); assert.equal(error.requestDiagnostic.timeoutMs, 5000);
    assert.equal(error.requestDiagnostic.action, 'commit'); assert.ok(error.requestDiagnostic.elapsedMs >= 0);
    assert.ok(error.requestDiagnostic.failure.stack.length > 0); return true;
  });
  assert.equal(timedOut.stats.failedRequests, 1); assert.equal(timedOut.stats.timedOutRequests, 1);
  assert.doesNotMatch(JSON.stringify(trace), /DO_NOT_LOG|Bearer|transaction=|payload|refreshToken/);
  assert.equal(trace[0].event, 'start'); assert.equal(trace.at(-1).event, 'error');
  console.log(JSON.stringify({ status: 'SELF_TEST_PASS_NO_NETWORK', checks: ['UTF-8 immutable chunks, no derived seeding', 'Real adapter REST paths and bounded callbacks',
    'POST batchGet transaction bodies, no GET transaction parameter, malformed response rollback',
    'Transactional read-set CAS and concurrent head mutation/abort retry/rollback', 'Genuine missing build/replay/stale/cross-scope', 'Labeled same-actor outage',
    'Company+row tenant guards, including forged matching hashes/head', 'Corruption failure/transaction cleanup', 'Timeout metadata/stack redaction; unchanged 5000ms default'], fakeRequests: calls.length }));
}

const help = `Local fictional Home read-model prototype (NO App acceptance claim).
No default run. No Emulator contact during --help or --self-test.
  node scripts/upgrade-home-read-model-emulator.mjs --self-test
  node scripts/upgrade-home-read-model-emulator.mjs --run --ack-native-idle --parity-evidence PATH --source-snapshot EXPORT_PATH [--output test-results/UNIQUE-RUN] [--trace]
Main must stop native benchmarking first. Existing Firestore Emulator: 127.0.0.1:8185.
Writes ONLY demo-hdm-home-projection-local / fictional-* app. No Rules are changed.
Main first uses loadSyntheticHomeInput(), then this module's
exportSyntheticHomeInput(loaded, domainModulePath, exportPath). CLI consumes that
local export and never invokes the helper's multi-port preflight. Programmatic
runEmulatorPrototype also accepts Main-owned loadInput(outputDirectory), returning
the loader result plus domainModulePath and domainModuleSha256.
Required parity evidence schema:
{kind:'home-read-model-actual-app-parity-v1',status:'PASS',sourceEquivalent:true,
 sourceRevision:'SHA256',domainSourceSha256:'SHA256',appSourceSha256:'SHA256',
 dayKey:'YYYY-MM-DD',timeZone:'Asia/Ho_Chi_Minh',
 actualApp:{revenue:NUMBER,expense:NUMBER,profit:NUMBER,receivables:NUMBER},
 prototype:{revenue:NUMBER,expense:NUMBER,profit:NUMBER,receivables:NUMBER},
 nativeEvidence:{path:'LOCAL_CAPTURE_PATH',sha256:'SHA256'}}
Unresolved payroll parity is a blocker. Never force the old App oracle; preserve
the old cohort and provide the new authoritative-empty publication-fix evidence.
Head/model CAS uses real Emulator read-write transactions. Source chunks are
immutable normalized fictional inputs, NOT raw business-document migration.
20 prepared reads and 20 genuinely missing model fetch/builds are reported
separately. Missing rebuilds include extracted App payroll/debt calculation.
CPU/RAM are NODE-only; warm source/OS caches and warm extracted domain are disclosed.
--trace writes payload-free request metadata/stack JSONL in the new output folder.
Tracing adds awaited disk I/O: such timings are diagnostic, not performance proof.
Failures write home-read-model-emulator-failure.json without overwriting evidence.
`;
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help')) console.log(help);
    else if (args.length === 1 && args[0] === '--self-test') await selfTest();
    else {
      const flags = new Map();
      for (let index = 0; index < args.length; index++) {
        const flag = args[index]; ensure(['--run', '--ack-native-idle', '--trace', '--parity-evidence', '--source-snapshot', '--output'].includes(flag) && !flags.has(flag), 'invalid-or-duplicate-cli-flag');
        if (flag === '--run' || flag === '--ack-native-idle' || flag === '--trace') flags.set(flag, true);
        else { ensure(args[index + 1] && !args[index + 1].startsWith('--'), 'missing-cli-value'); flags.set(flag, args[++index]); }
      }
      ensure(flags.get('--run') && flags.get('--parity-evidence') && flags.get('--source-snapshot'), 'explicit-run-parity-and-source-export-required');
      const result = await runEmulatorPrototype({ parityEvidence: flags.get('--parity-evidence'), sourceSnapshot: flags.get('--source-snapshot'), outputDirectory: flags.get('--output'), nativeIdleAcknowledged: flags.get('--ack-native-idle'), traceRequests: flags.get('--trace') === true });
      console.log(JSON.stringify({ status: result.report.status, outputDirectory: result.outputDirectory }));
    }
  } catch (error) {
    console.error(JSON.stringify({ status: 'BLOCKED_OR_FAILED_NOT_PASS', reason: safeFailure(error).code,
      failure: safeFailure(error), ...(error.requestDiagnostic ? { request: error.requestDiagnostic } : {}),
      ...(error.failureReportPath ? { failureReport: error.failureReportPath } : {}) }));
    process.exitCode = 1;
  }
}
