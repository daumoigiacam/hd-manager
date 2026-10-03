import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { seedData } from '../../src/mocks/seed-data.js';
import { readPreviewJournal } from '../../src/mocks/preview-journal.js';

export const key = 'hd-manager-local-db-v2-clean-preview';
export async function loadPreviewStorage(sourcePath, initialRaw, shared = new Map()) {
  if (initialRaw !== undefined) shared.set(key, initialRaw);
  const events = [];
  const handlers = new Map();
  let failWrites = false;
  const json = Object.create(JSON);
  for (const method of ['stringify', 'parse']) json[method] = (...args) => {
    const start = performance.now();
    let result;
    try { result = JSON[method](...args); return result; }
    finally { events.push({ kind: method, ms: performance.now() - start,
      bytes: method === 'stringify' && typeof result === 'string' ? Buffer.byteLength(result) : 0 }); }
  };
  const window = {
    localStorage: {
      get length() { return shared.size; },
      key(index) { return [...shared.keys()][index] ?? null; },
      getItem(name) {
        const start = performance.now();
        const result = shared.get(name) ?? null;
        events.push({ kind: 'getItem', ms: performance.now() - start });
        return result;
      },
      setItem(name, value) {
        if (failWrites) throw new Error('simulated storage failure');
        const start = performance.now();
        shared.set(name, value);
        events.push({ kind: 'setItem', ms: performance.now() - start, bytes: Buffer.byteLength(value) });
      },
    },
    addEventListener(type, callback) { handlers.set(type, callback); },
  };
  const context = vm.createContext({ window, JSON: json, seedData, console: { warn() {} }, queueMicrotask });
  let source = typeof sourcePath === 'object' && sourcePath.gitRef
    ? execFileSync('git', ['show', `${sourcePath.gitRef}:${sourcePath.file}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    : await readFile(sourcePath, 'utf8');
  let helper = '';
  if (source.includes("'./preview-journal.js'")) {
    helper = await readFile(new URL('../../src/mocks/preview-journal.js', import.meta.url), 'utf8');
  }
  if (source.includes("'./preview-store-serializer.js'")) {
    helper = await readFile(new URL('../../src/mocks/preview-store-serializer.js', import.meta.url), 'utf8');
  }
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInContext(`${helper.replace(/export /g, '')}\n${source}\n globalThis.api = {setDoc,deleteDoc,runTransaction,getDoc,getDocs,doc,collection,increment,onSnapshot};`, context);
  return { api: context.api, events, shared,
    failWrites(value) { failWrites = value; },
    reloadEvent() { handlers.get('storage')?.({ key }); },
    raw() {
      const base = shared.get(key);
      if (!source.includes('readPreviewJournal')) return base;
      if (![...shared.keys()].some(name => name.startsWith(`${key}:patch:`))) return base;
      const parsed = JSON.parse(base || '{}');
      delete parsed.__replaceSeed;
      return JSON.stringify(readPreviewJournal(window.localStorage, key, parsed));
    },
  };
}

export async function fullAuditFixture() {
  const source = await readFile(new URL('../../scripts/audit-interactions.mjs', import.meta.url), 'utf8');
  const fixtureCode = source.slice(source.indexOf('const rows ='), source.indexOf('const routes ='));
  const context = vm.createContext({ date: '2026-10-02', actionsOnly: false,
    process: { env: { HD_AUDIT_DISPATCH_STRESS: '1', HD_AUDIT_INCLUDE_ACTIONS: '1' } } });
  vm.runInContext(`${fixtureCode}\n globalThis.fixture = fixture;`, context);
  return JSON.parse(JSON.stringify(context.fixture));
}
