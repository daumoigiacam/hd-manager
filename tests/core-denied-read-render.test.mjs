import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './helpers/chromium-launch-options.mjs';
import { appFunction } from './helpers/app-source-function.mjs';
import { createReadOwnerAccess } from '../src/services/readOwnerAccess.js';
import { bindScopedReadPublication } from '../src/services/scopedReadPublication.js';

test('real React denial gate hides reports and portals, preserves form ownership, and only a new owner recovers', { timeout: 30000 }, async () => {
  // Evaluate the installed production CommonJS runtimes directly. No esbuild,
  // Vite, artifact generation, HTTP server or external requests are used.
  const require = createRequire(import.meta.url);
  const runtime = Object.fromEntries(await Promise.all([
    ['react', 'react', 'react.production.js'], ['react-dom', 'react-dom', 'react-dom.production.js'],
    ['client', 'react-dom', 'react-dom-client.production.js'], ['scheduler', 'scheduler', 'scheduler.production.js'],
  ].map(async ([name, pkg, file]) => [name, await readFile(join(dirname(require.resolve(pkg)), 'cjs', file), 'utf8')])));
  const gate = (await readFile(new URL('../src/layout/ReadAccessFailureGate.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '').replace('export default function ', 'function ');
  const classifier = appFunction('isFirebasePermissionError', { getErrorText: appFunction('getErrorText') }).toString();
  const callback = appFunction('handleListenerError').toString();
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.evaluate(({ runtime, gate, classifier, callback, accessSource, publicationSource }) => {
      const modules = {};
      const load = name => {
        if (modules[name]) return modules[name].exports;
        if (!runtime[name]) throw Error('Unexpected runtime dependency: ' + name);
        const module = { exports: {} }; modules[name] = module;
        new Function('module', 'exports', 'require', 'process', runtime[name])(module, module.exports, load, { env: { NODE_ENV: 'production' } });
        return module.exports;
      };
      const React = load('react'), dom = load('react-dom'), client = load('client');
      const Gate = new Function('React', 'useRef', 'useLayoutEffect', 'useSyncExternalStore', 'createPortal',
        gate + ';return ReadAccessFailureGate;')(React, React.useRef, React.useLayoutEffect, React.useSyncExternalStore, dom.createPortal);
      const createAccess = new Function('return (' + accessSource + ')')();
      const bindPublication = new Function('return (' + publicationSource + ')')();
      const isPermissionError = new Function('getErrorText', 'return (' + classifier + ')')(
        error => `${error?.code || ''} ${error?.message || error || ''}`);
      const h = React.createElement;
      let owner = 'owner-a', current;
      window.mounts = 0; window.unmounts = 0; window.logouts = 0; window.retries = 0; window.loaded = 0; window.updaterRan = false;
      const queued = [];
      function Workspace({ rows }) {
        const [draft, setDraft] = React.useState('');
        React.useEffect(() => { window.mounts++; return () => { window.unmounts++; }; }, []);
        return h('main', { 'data-private': true },
          h('p', { 'data-report': true }, rows[0].id),
          h('input', { 'aria-label': 'Unsaved draft', value: draft, onChange: event => setDraft(event.target.value) }),
          dom.createPortal(h('dialog', { id: 'existing-form-dialog' }, h('p', null, 'Private portal contents')), document.body));
      }
      function Fixture() {
        const [epoch, setEpoch] = React.useState(owner), [rows, setRows] = React.useState([{ id: 'retained-private-report' }]);
        const access = React.useMemo(() => createAccess({ ownerKey: epoch, isOwnerCurrent: () => owner === epoch, isPermissionError }), [epoch]);
        current = access; window.access = access;
        const failReadAccess = (error, collection) => access.reject(error, collection);
        window.onSourceError = new Function('isReadAccessCurrent', 'listenerActive', 'failReadAccess', 'colName',
          'isRecoverableRealtimeError', 'shouldLogRecoverableRealtimeError', 'markCollectionLoaded', 'stopCollectionListener',
          'isFirestoreInternalAssertionError', 'scheduleCollectionRefresh', 'return (' + callback + ')')(
          () => access.isCurrent(), true, failReadAccess, 'orders', () => true, () => false,
          () => { window.loaded++; }, () => {}, () => false, () => { window.retries++; });
        window.queuePublication = () => bindPublication(update => queued.push(update), () => access.isCurrent())(() => {
          window.updaterRan = true; return [{ id: 'obsolete-publication' }];
        });
        window.flushPublication = () => dom.flushSync(() => { for (const update of queued.splice(0)) setRows(update); });
        window.rerender = () => dom.flushSync(() => setRows([{ id: 'must-not-replace-denied-projection' }]));
        window.newOwner = () => { owner = 'owner-b'; dom.flushSync(() => setEpoch(owner)); };
        return h(Gate, { key: epoch, access, onLogout: () => { window.logouts++; } }, h(Workspace, { rows }));
      }
      const root = client.createRoot(document.getElementById('root'));
      dom.flushSync(() => root.render(h(Fixture)));
      window.deny = code => dom.flushSync(() => window.onSourceError(Object.assign(Error('Synthetic denial'), { code })));
      window.stop = () => dom.flushSync(() => root.unmount());
    }, { runtime, gate, classifier, callback, accessSource: createReadOwnerAccess.toString(), publicationSource: bindScopedReadPublication.toString() });
    await page.getByLabel('Unsaved draft').fill('keep this draft');
    await page.evaluate(() => { window.originalInput = document.querySelector('input'); window.queuePublication(); });
    // Transient errors keep the actual report/form visible and retain the owner.
    await page.evaluate(() => window.deny('unavailable'));
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal(await page.getByLabel('Unsaved draft').inputValue(), 'keep this draft');
    assert.equal(await page.evaluate(() => window.retries), 1);
    await page.evaluate(() => document.querySelector('#existing-form-dialog').showModal());
    await page.evaluate(() => window.deny('firestore/permission-denied'));
    await page.getByRole('alertdialog').waitFor();
    assert.equal(await page.locator('[data-report]').isVisible(), false);
    assert.equal(await page.locator('#existing-form-dialog').isVisible(), false, 'body portals are hidden too');
    assert.equal(await page.evaluate(() => window.originalInput === document.querySelector('input')), true);
    assert.equal(await page.evaluate(() => window.originalInput.value), 'keep this draft');
    assert.equal(await page.evaluate(() => window.unmounts), 0);
    assert.equal(await page.evaluate(() => window.logouts), 0);
    assert.equal(await page.evaluate(() => window.retries), 1, 'denial does not add a retry');
    assert.equal(await page.evaluate(() => window.loaded), 1, 'only the earlier transient path marked loaded');
    await page.evaluate(() => { window.flushPublication(); window.rerender(); });
    assert.equal(await page.evaluate(() => window.updaterRan), false);
    assert.equal(await page.locator('[data-report]').textContent(), 'retained-private-report');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('alertdialog').isVisible(), true, 'access failure cannot be dismissed');
    await page.getByRole('button', { name: 'Đăng xuất để đăng nhập lại' }).click();
    assert.equal(await page.evaluate(() => window.logouts), 1, 'logout happens only on explicit action');
    const oldError = await page.evaluateHandle(() => window.onSourceError);
    await page.evaluate(() => window.newOwner());
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal(await page.locator('[data-report]').isVisible(), true);
    assert.equal(await page.evaluate(() => window.mounts), 2);
    assert.equal(await page.evaluate(() => window.unmounts), 1);
    await page.evaluate(old => old(Object.assign(Error('late old denial'), { code: 'permission-denied' })), oldError);
    assert.equal(await page.evaluate(() => window.access.getSnapshot()), null);
    await oldError.dispose();
    await page.evaluate(() => window.stop());
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
