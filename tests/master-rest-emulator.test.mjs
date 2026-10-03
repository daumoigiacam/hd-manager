import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdtemp, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { createMockUserToken } from '@firebase/util';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, writeBatch, setDoc } from 'firebase/firestore';
import { collectTenantRestQuery } from '../src/services/firestoreRestPagination.js';
import { appObject } from './helpers/app-source-function.mjs';

const enabled = process.env.MASTER_REST_EMULATOR === '1';
const projectId = 'demo-master-rest-pagination';
const appId = 'isolated-rest-fixtures';
const companyId = 'rest-company-a';
const collectionId = 'orders';
const parent = `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data`;
const queryBody = { structuredQuery: {
  from: [{ collectionId }],
  where: { fieldFilter: {
    field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: companyId },
  } },
} };
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const extractedDecoder = ['fromFirestoreRestValue', 'fromFirestoreRestFields'].map(name => {
  const node = appObject(name);
  return `const ${name} = ${source.slice(node.start, node.end)};`;
}).join('\n');
const decodeFields = new Function(`${extractedDecoder}\nreturn fromFirestoreRestFields;`)();
const data = index => ({ companyId, amount: index + 1, note: `fixture-${index}` });
const documentId = index => `order-${String(index).padStart(4, '0')}`;
const expected = Array.from({ length: 201 }, (_, index) => ({ id: documentId(index), data: data(index) }));
const toMicros = value => value.replace(/\.(\d{6})\d{1,3}Z$/, '.$1Z');
const comparableTime = value => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(9, '0')}Z`);
const withSignificantNanos = value => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0').slice(0, 6)}789Z`);

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('real isolated demo REST runQuery: precision, Rules, cursors and snapshot capability', {
  skip: enabled ? false : 'Opt in with MASTER_REST_EMULATOR=1; only cached local binaries and demo fixtures are used.',
  timeout: 120_000,
}, async t => {
  assert.match(projectId, /^demo-[a-z0-9-]+$/);
  const cache = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  const jars = (await readdir(cache)).filter(name => /^cloud-firestore-emulator-v[\d.]+\.jar$/.test(name));
  assert.ok(jars.length > 0, 'No cached Firestore emulator; this test never downloads one');
  const jar = jars.sort((left, right) => right.localeCompare(left, 'en', { numeric: true }))[0];
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'master-rest-demo-'));
  await copyFile(new URL('../firestore.rules', import.meta.url), path.join(directory, 'firestore.rules'));
  const child = spawn('java', [
    '-Xmx512m', '-Duser.language=en', '-Duser.country=US', '-jar', path.join(cache, jar),
    '--host', '127.0.0.1', '--port', String(port), '--project_id', projectId,
    '--single_project_mode', 'true', '--single_project_mode_error', 'true',
    '--rules', 'firestore.rules',
  ], { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', chunk => { logs = `${logs}${chunk}`.slice(-8000); });
  child.stderr.on('data', chunk => { logs = `${logs}${chunk}`.slice(-8000); });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  const exited = new Promise(resolve => child.once('close', resolve));
  let environment;
  const controller = new AbortController();
  const suiteDeadline = setTimeout(() => controller.abort(), 110_000);
  const token = createMockUserToken({
    sub: 'rest-employee-a', identityId: 'rest-identity-a', appUserId: 'rest-employee-a',
    companyId, accountType: 'employee', role: 'super_admin',
  }, projectId);
  const localFetch = (url, options = {}) => {
    const target = new URL(url);
    assert.equal(target.origin, origin, 'Production and non-loopback requests are forbidden');
    return fetch(target, { ...options, signal: controller.signal });
  };
  const run = async (body, bearer = token) => {
    const result = await localFetch(`${origin}/v1/${parent}:runQuery`, {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!result.ok) throw new Error(`Emulator runQuery ${result.status}: ${await result.text()}`);
    return result.json();
  };
  const sortedQuery = {
    ...queryBody.structuredQuery,
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 200,
  };
  const collect = runQuery => collectTenantRestQuery({
    queryBody, context: { parent, companyId, accountType: 'employee' },
    pageSize: 200, signal: controller.signal, decodeFields, runQuery,
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Emulator exited before readiness: ${logs}`);
      try {
        const result = await localFetch(`${origin}/`);
        await result.text();
        ready = true;
        break;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        await sleep(100);
      }
    }
    assert.equal(ready, true, `Cached emulator did not become ready: ${logs}`);
    environment = await initializeTestEnvironment({
      projectId, firestore: { host: '127.0.0.1', port, rules: readFileSync('firestore.rules', 'utf8') },
    });
    await environment.withSecurityRulesDisabled(async context => {
      const database = context.firestore();
      const batch = writeBatch(database);
      for (let index = 0; index < expected.length; index += 1) {
        batch.set(doc(database, `artifacts/${appId}/public/data/orders/${documentId(index)}`), data(index));
      }
      batch.set(doc(database, `artifacts/${appId}/public/data/orders/foreign-tenant`), {
        companyId: 'rest-company-b', amount: 999,
      });
      await batch.commit();
    });

    const initial = await run({ structuredQuery: sortedQuery });
    const times = initial.filter(row => row.readTime).map(row => row.readTime);
    const initialReadTime = times[0];
    assert.ok(initialReadTime, 'Actual emulator response must supply readTime');
    const pinned = toMicros(initialReadTime);
    assert.equal(initial.filter(row => row.document).length, 200);
    assert.equal(initial.filter(row => row.document).every(row => decodeFields(row.document.fields).companyId === companyId), true);
    const microsecondCompatible = times.every(value => {
      const match = /\.(\d+)Z$/.exec(value);
      return !match || !/[1-9]/.test(match[1].slice(6));
    });
    t.diagnostic(JSON.stringify({ emulator: jar, readTime: initialReadTime, pinned, microsecondCompatible }));

    await t.test('real full-reference startAt before=false excludes the previous document', async () => {
      const cursor = initial.filter(row => row.document).at(-1).document.name;
      const remaining = await run({ structuredQuery: {
        ...sortedQuery, startAt: { values: [{ referenceValue: cursor }], before: false },
      } });
      assert.deepEqual(remaining.filter(row => row.document).map(row => row.document.name.split('/').at(-1)), [documentId(200)]);
    });

    await t.test('repository Rules deny foreign-tenant and unscoped REST queries', async () => {
      const foreign = structuredClone(sortedQuery);
      foreign.where.fieldFilter.value.stringValue = 'rest-company-b';
      await assert.rejects(run({ structuredQuery: foreign }), /403|PERMISSION_DENIED/i);
      const unscoped = { from: sortedQuery.from, orderBy: sortedQuery.orderBy, limit: 200 };
      await assert.rejects(run({ structuredQuery: unscoped }), /403|PERMISSION_DENIED/i);
    });

    let pinnedResponse;
    let pinError;
    try { pinnedResponse = await run({ structuredQuery: sortedQuery, readTime: pinned }); }
    catch (error) { pinError = error; }
    if (pinnedResponse) {
      await environment.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), `artifacts/${appId}/public/data/orders/${documentId(0)}`), {
          ...data(0), amount: 987654,
        });
      });
      try { pinnedResponse = await run({ structuredQuery: sortedQuery, readTime: pinned }); }
      catch (error) { pinError = error; pinnedResponse = null; }
      finally {
        await environment.withSecurityRulesDisabled(async context => {
          await setDoc(doc(context.firestore(), `artifacts/${appId}/public/data/orders/${documentId(0)}`), data(0));
        });
      }
    }
    const historicalRow = pinnedResponse?.find(row => row.document?.name.endsWith(`/${documentId(0)}`));
    const fixedTimeHonored = Boolean(historicalRow
      && decodeFields(historicalRow.document.fields).amount === 1
      && pinnedResponse.filter(row => row.readTime).every(row => comparableTime(row.readTime) === comparableTime(pinned)));
    t.diagnostic(JSON.stringify({ fixedTimeHonored, pinError: pinError?.message || null }));

    await t.test('collector either completes at a honored fixed snapshot or rejects unsupported consistency', async () => {
      if (fixedTimeHonored) {
        const calls = [];
        const result = await collect(async body => {
          calls.push(structuredClone(body));
          const rows = await run(body);
          if (calls.length === 1) {
            await environment.withSecurityRulesDisabled(async context => {
              const database = context.firestore();
              const batch = writeBatch(database);
              batch.set(doc(database, `artifacts/${appId}/public/data/orders/${documentId(0)}`), {
                ...data(0), amount: 987654,
              });
              batch.delete(doc(database, `artifacts/${appId}/public/data/orders/${documentId(200)}`));
              batch.set(doc(database, `artifacts/${appId}/public/data/orders/${documentId(999)}`), data(999));
              await batch.commit();
            });
            // The emulator emits microseconds. Add a valid nano tail to its
            // initial response to require a discard/replay against real REST.
            return rows.map(row => row.readTime ? { ...row, readTime: withSignificantNanos(row.readTime) } : row);
          }
          return rows;
        });
        assert.deepEqual(result.items, expected);
        assert.equal(result.exhausted, true);
        assert.ok(calls.length >= 3);
        assert.equal(calls[1].structuredQuery.startAt, undefined);
        assert.equal(calls.slice(1).every(body => body.readTime === result.readTime), true);
        t.diagnostic('Synthetic nanosecond bootstrap discarded; real pinned REST replay retained all 201 records across live insert/update/delete.');
      } else {
        // This establishes fail-closed behavior, not successful snapshot support.
        await assert.rejects(collect(body => run(body)), /readTime|precision|Emulator runQuery/i);
        t.diagnostic('Historical REST snapshot enumeration remains unverified: this emulator cannot satisfy the collector contract.');
      }
    });
  } catch (error) {
    t.diagnostic(logs);
    throw error;
  } finally {
    clearTimeout(suiteDeadline);
    controller.abort();
    try { await environment?.cleanup(); }
    finally {
      if (child.exitCode === null) child.kill();
      await exited;
    }
  }
});
