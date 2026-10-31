import test from 'node:test';
import assert from 'node:assert/strict';
import { Bytes, GeoPoint, Timestamp } from 'firebase/firestore';
import { appFunction } from './helpers/app-source-function.mjs';
import { writeAutomaticBackupStream } from '../src/services/automaticBackupStream.js';
import { consumeTenantRestQuery, collectTenantRestQuery } from '../src/services/firestoreRestPagination.js';
import { decodeFirebaseBackupFields } from '../src/services/firebaseBackupValues.js';
import { createScopedBackupSink } from '../src/services/scopedBackupSink.js';

let normalize;
normalize = appFunction('normalizeBackupSerializableValue', { normalizeBackupSerializableValue: value => normalize(value) });
const parent = 'projects/backup-fixture/databases/(default)/documents/artifacts/test/public/data';
const companyId = 'tenant-a';
const readTime = '2026-10-03T01:02:03.123456Z';
const query = name => ({ structuredQuery: { from: [{ collectionId: name }],
  where: { fieldFilter: { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: companyId } } } } });
const context = { parent, companyId, accountType: 'employee' };

test('root backup admission matches existing manual-settings action permissions', () => {
  const deps = { normalizeLookupText: appFunction('normalizeLookupText') };
  for (const name of ['WAREHOUSE_EXPORT_POSITION', 'SALES_COLLABORATOR_POSITION', 'LEGACY_POSITION_MAP',
    'normalizeEmployeePosition', 'isOwnerPosition', 'isOwnerRoleValue', 'isOwnerAccountUser']) {
    deps[name] = appFunction(name, deps);
  }
  for (const role of ['super_admin', 'employee', 'customer']) {
    for (const position of ['Chủ doanh nghiệp', 'Kinh doanh', 'Tài xế', 'Kế toán']) {
      for (const actions of [{}, { settings: { backup_data: true } }, { settings: { backup_restore_data: true } },
        { settings: { backup_data: false, backup_restore_data: false } }]) {
        const currentUser = { role }, employeeInfo = { position };
        const owner = deps.isOwnerAccountUser(employeeInfo, currentUser);
        const canRoleAction = appFunction('canRoleAction', { isOwnerAccount: owner, rolePermissionActions: actions }, { scope: 'MainAppView' });
        const allowed = appFunction('canAutomaticallyBackUpCompany', { currentUser, employeeInfo,
          isCustomerSession: role === 'customer', backupRoleActions: actions, isOwnerAccountUser: deps.isOwnerAccountUser });
        assert.equal(allowed, role !== 'customer' && (canRoleAction('settings', 'backup_data') || canRoleAction('settings', 'backup_restore_data')));
      }
    }
  }
});

test('REST backup normalization equals actual manual-export SDK value normalization', () => {
  const wire = {
    text: { stringValue: 'Vịt 🦆 "\\\n' }, no: { nullValue: null }, yes: { booleanValue: true },
    integer: { integerValue: '1234567' }, fraction: { doubleValue: 1.25 }, nan: { doubleValue: 'NaN' },
    when: { timestampValue: '2026-10-01T01:15:00.123456789Z' },
    beforeEpoch: { timestampValue: '1969-12-31T23:59:59.123456789Z' },
    bytes: { bytesValue: 'AAH/' }, location: { geoPointValue: { latitude: 10, longitude: 20 } },
    nested: { mapValue: { fields: { list: { arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '2' }] } } } } },
    empty: { arrayValue: {} }, emptyMap: { mapValue: {} },
  };
  const expected = normalize({ text: 'Vịt 🦆 "\\\n', no: null, yes: true, integer: 1234567, fraction: 1.25, nan: NaN,
    when: new Timestamp(1790817300, 123456789), beforeEpoch: new Timestamp(-1, 123456789),
    bytes: Bytes.fromBase64String('AAH/'), location: new GeoPoint(10, 20), nested: { list: ['a', 2] }, empty: [], emptyMap: {} });
  assert.deepEqual(normalize(decodeFirebaseBackupFields(wire)), expected);
  assert.throws(() => decodeFirebaseBackupFields({ x: { unknownType: 'bad' } }), /Unsupported/);
  assert.throws(() => decodeFirebaseBackupFields({ x: { referenceValue: `${parent}/orders/o1` } }), /Unsupported/);
});

function fixture({ fail = '', foreign = false, switchAt = '', sinkFailure = '' } = {}) {
  const collections = { orders: 205, empty: 0, payments: 110 };
  const metadata = { schemaVersion: 1, appName: 'HD Manager', appId: 'test', sourceCompanyId: companyId, exportedAt: '2026-10-03T00:00:00.000Z' };
  const companyRecords = [{ id: companyId, companyId, name: 'Công ty 🦆' }];
  let current = true, temporary = '', published = 'previous complete backup', aborts = 0, activeReads = 0, maxActive = 0;
  const chunks = [], pageSizes = [], readCollections = [], expected = { ...metadata, collections: { companies: companyRecords } };
  const data = Object.fromEntries(Object.entries(collections).map(([name, count]) => [name, Array.from({ length: count }, (_, i) => {
    const id = `${name}-${String(i).padStart(4, '0')}`;
    const fields = { companyId: { stringValue: companyId }, amount: { integerValue: String(i * 17) }, text: { stringValue: `Vịt 🦆 ${i}` } };
    return { name: `${parent}/${name}/${id}`, fields };
  })]));
  for (const name of Object.keys(collections)) expected.collections[name] = data[name].map(d => ({ id: d.name.split('/').at(-1), ...normalize(decodeFirebaseBackupFields(d.fields)) }));
  const options = {
    metadata, companyRecords, collectionNames: Object.keys(collections), chunkCharacters: 256,
    isCurrent: () => current,
    includeRecord: (_name, row) => row.companyId === companyId,
    readPages: (name, consume) => {
      readCollections.push(name);
      return consumeTenantRestQuery({ queryBody: query(name), context, isCurrent: () => current, pageSize: 50,
        decodeFields: fields => normalize(decodeFirebaseBackupFields(fields)),
        runQuery: async body => {
          activeReads++; maxActive = Math.max(maxActive, activeReads);
          try {
            const cursor = body.structuredQuery.startAt?.values[0].referenceValue;
            const start = cursor ? data[name].findIndex(d => d.name === cursor) + 1 : 0;
            if (fail === name && start >= 50) throw Error('page read failed');
            if (switchAt === 'read' && start >= 50) current = false;
            const page = data[name].slice(start, start + body.structuredQuery.limit);
            if (foreign && name === 'payments') page[0] = { ...page[0], fields: { ...page[0].fields, companyId: { stringValue: 'tenant-b' } } };
            return page.length ? page.map(document => ({ document, readTime })) : [{ readTime }];
          } finally { activeReads--; }
        }
      }, async page => { pageSizes.push(page.length); await consume(page); });
    },
    sink: {
      write: async text => { temporary = text; if (sinkFailure === 'write') throw Error('disk full'); },
      append: async text => {
        chunks.push(text); temporary += text;
        if (sinkFailure === 'append') throw Error('append failed');
        if (switchAt === 'append') current = false;
      },
      commit: async () => { if (sinkFailure === 'commit') throw Error('rename failed'); published = temporary; temporary = ''; return { path: 'fixture.json' }; },
      abort: async () => { aborts++; temporary = ''; }
    }
  };
  return { options, expected, chunks, pageSizes, readCollections,
    state: () => ({ current, published, temporary, aborts, maxActive }) };
}

test('bounded page-to-file backup keeps complete schema/order/count without accumulating returned records', async () => {
  const f = fixture();
  const result = await writeAutomaticBackupStream(f.options);
  assert.equal(result.recordCount, 315);
  assert.deepEqual(JSON.parse(f.state().published), f.expected);
  assert.deepEqual(f.readCollections, ['orders', 'empty', 'payments']);
  assert.ok(f.pageSizes.every(n => n <= 50));
  assert.ok(f.chunks.every(s => s.length < 400), 'buffer target plus at most one fixture record');
  assert.equal(f.state().maxActive, 1);
  assert.equal(f.state().aborts, 0);
  const consumed = await consumeTenantRestQuery({ queryBody: query('orders'), context, pageSize: 50,
    runQuery: async () => [{ readTime }], decodeFields: () => ({ companyId }) }, () => {});
  assert.deepEqual(consumed.items, []);
  assert.equal(consumed.exhausted, true);
});

test('late page, tenant, disk and rename failures discard partial output and preserve prior complete file', async () => {
  for (const config of [{ fail: 'orders' }, { foreign: true }, { switchAt: 'read' }, { switchAt: 'append' },
    { sinkFailure: 'write' }, { sinkFailure: 'append' }, { sinkFailure: 'commit' }]) {
    const f = fixture(config);
    await assert.rejects(writeAutomaticBackupStream(f.options));
    assert.equal(f.state().published, 'previous complete backup', JSON.stringify(config));
    assert.equal(f.state().temporary, '');
    assert.equal(f.state().aborts, 1);
  }
});

test('full collection API cannot accidentally switch to the partial-consumer contract', async () => {
  let consumed = false;
  const result = await collectTenantRestQuery({ queryBody: query('orders'), context,
    runQuery: async () => [{ document: { name: `${parent}/orders/o1`, fields: { companyId: { stringValue: companyId } } }, readTime }],
    decodeFields: () => ({ companyId }), consumePage: () => { consumed = true; } });
  assert.equal(consumed, false);
  assert.equal(result.items.length, 1);
});

function nativeAppHarness({ fail = false, changeTenant = false, platform = 'android', allowed = true,
  revokeAccess = false, paused = false } = {}) {
  const files = new Map(), writes = [], states = [];
  const delays = [];
  const currentCompany = { id: companyId, companyId, name: 'Fixture 🦆' };
  const scope = { current: companyId };
  const user = { uid: 'fixture-user', getIdToken: async () => 'fixture-only-token' };
  const access = { current: { allowed, companyId, uid: user.uid } };
  const activity = { current: { tab: paused ? 'warehouse_dispatch' : 'home', lastInputAt: 0 } };
  const bindings = {
    canAutomaticallyBackUpCompany: allowed, automaticBackupAccessRef: access,
    firebaseUser: user, myCompanyId: companyId, currentCompany, activeTenantScopeRef: scope,
    activeFirebaseConfig: { projectId: 'backup-fixture' }, appId: 'test', auth: { currentUser: user },
    buildFirebaseRestCollectionQueryUrl: () => 'https://fixture.invalid:443/runQuery',
    window: { setTimeout: (fn, delay) => {
      delays.push(delay);
      return setTimeout(() => { if (delay === 500) activity.current.tab = 'home'; fn(); }, delay === 500 ? 0 : delay);
    }, clearTimeout },
    document: { visibilityState: 'visible', activeElement: null }, navigator: { onLine: true },
    loyaltyActivityRef: activity,
    buildBackupFilename: () => 'fixture.json', AUTO_BACKUP_NATIVE_DIR: 'HDManager/AutoBackups',
    normalizeBackupSerializableValue: normalize, BACKUP_DATA_COLLECTIONS: ['orders', 'empty'],
    writeAutomaticBackupStream, consumeTenantRestQuery, decodeFirebaseBackupFields, createScopedBackupSink,
    Directory: { Documents: 'DOCUMENTS' }, Encoding: { UTF8: 'utf8' },
    Filesystem: {
      writeFile: async opts => { assert.equal(opts.encoding, 'utf8'); writes.push('write'); files.set(opts.path, opts.data); },
      appendFile: async opts => { assert.equal(opts.encoding, 'utf8'); writes.push('append'); files.set(opts.path, files.get(opts.path) + opts.data); },
      rename: async opts => {
        assert.match(opts.from, /^HDManager\/AutoBackups\/auto-fixture\.json\.partial-[\da-f-]+$/);
        assert.equal(opts.to, 'HDManager/AutoBackups/auto-fixture.json');
        writes.push('rename'); files.set(opts.to, files.get(opts.from)); files.delete(opts.from);
      },
      deleteFile: async opts => { assert.match(opts.path, /\.partial-/); writes.push('delete'); files.delete(opts.path); }
    },
    fetch: async (url, opts) => {
      assert.equal(url, 'https://fixture.invalid:443/runQuery');
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers.Authorization, 'Bearer fixture-only-token');
      const body = JSON.parse(opts.body), q = body.structuredQuery;
      assert.equal(q.limit, 100);
      assert.deepEqual(q.where, query('orders').structuredQuery.where);
      assert.deepEqual(q.orderBy, [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
      if (changeTenant) scope.current = 'tenant-b';
      if (revokeAccess) access.current.allowed = false;
      const name = q.from[0].collectionId;
      return { ok: !fail, status: fail ? 403 : 200, json: async () => name === 'orders' ? [{
        document: { name: `${parent}/orders/o1`, fields: { companyId: { stringValue: companyId }, amount: { integerValue: '1000' }, archived: { booleanValue: true } } }, readTime
      }] : [{ readTime }] };
    },
    Capacitor: { getPlatform: () => platform }, isPreviewDataMode: false, isVpsMode: false,
    getTodayString: () => '2026-10-31', getAutoBackupStateForCompany: () => states.at(-1)?.info,
    setAutoBackupStateForCompany: (company, date, info) => states.push({ company, date, info }),
    handleCreateCompanyBackup: () => { throw Error('full-company SDK read must not run in the native automatic path'); }
  };
  const pending = 'HDManager/AutoBackups/auto-fixture.json.partial-11111111-1111-1111-1111-111111111111';
  bindings.ScopedBackupWriter = {
    start: async () => { await bindings.Filesystem.writeFile({ path: pending, data: '', encoding: 'utf8' }); return { handle: 'fixture-handle' }; },
    append: async ({ handle, data }) => { assert.equal(handle, 'fixture-handle'); await bindings.Filesystem.appendFile({ path: pending, data, encoding: 'utf8' }); },
    commit: async ({ handle }) => { assert.equal(handle, 'fixture-handle'); await bindings.Filesystem.rename({ from: pending, to: 'HDManager/AutoBackups/auto-fixture.json' }); return { path: 'content://fixture/backup/1', filename: 'auto-fixture.json' }; },
    abort: async ({ handle }) => { assert.equal(handle, 'fixture-handle'); await bindings.Filesystem.deleteFile({ path: pending }); }
  };
  bindings.handleWriteNativeAutomaticBackup = appFunction('handleWriteNativeAutomaticBackup', bindings);
  return { run: appFunction('handleRunDailyAutoBackup', bindings), files, writes, states, delays };
}

test('backup admission skips unauthorized work; revoked permission aborts unpublished output', async () => {
  const denied = nativeAppHarness({ allowed: false });
  assert.equal((await denied.run()).status, 'not_authorized');
  assert.deepEqual(denied.writes, []);
  assert.deepEqual(denied.delays, []);
  assert.deepEqual(denied.states, []);
  const revoked = nativeAppHarness({ revokeAccess: true });
  await assert.rejects(revoked.run());
  assert.equal(revoked.files.size, 0);
  assert.equal(revoked.writes.at(-1), 'delete');
  assert.equal(revoked.states.length, 0);
});

test('idle backup yields without fixed half-second sleeps and pauses during dispatch interaction', async () => {
  const idle = nativeAppHarness();
  assert.equal((await idle.run()).success, true);
  assert.ok(idle.delays.includes(0));
  assert.equal(idle.delays.includes(500), false);
  const paused = nativeAppHarness({ paused: true });
  assert.equal((await paused.run()).success, true);
  assert.equal(paused.delays[0], 500);
  assert.ok(paused.delays.includes(0));
});

test('actual App native automatic branch uses authenticated bounded REST and publishes only a completed schema', async () => {
  for (const platform of ['android', 'ios']) {
  const h = nativeAppHarness({ platform });
  const result = await h.run();
  assert.equal(result.success, true);
  assert.equal(result.recordCount, 1);
  assert.equal(h.files.size, 1);
  assert.equal(h.writes.at(-1), 'rename');
  const file = JSON.parse([...h.files.values()][0]);
  assert.equal(file.schemaVersion, 1);
  assert.equal(file.sourceCompanyId, companyId);
  assert.deepEqual(file.collections, { companies: [{ id: companyId, companyId, name: 'Fixture 🦆' }],
    orders: [{ id: 'o1', companyId, amount: 1000, archived: true }], empty: [] });
  assert.equal(h.states.length, 1);
  const before = h.writes.length;
  assert.equal((await h.run()).status, 'saved');
  assert.equal(h.writes.length, before, 'completed daily backup does not restart reads/writes');
  }
});

test('scoped sink awaits write and publication acknowledgements and retains abort handle on failure', async () => {
  for (const failure of ['append', 'commit', 'ack']) {
    const events = [];
    const plugin = {
      start: async () => { events.push('start'); return { handle: 'h1' }; },
      append: async ({ handle, data }) => { assert.equal(handle, 'h1'); events.push(data); if (failure === 'append') throw Error('disk failure'); },
      commit: async () => { events.push('commit'); if (failure === 'commit') throw Error('publication failed'); return {}; },
      abort: async ({ handle }) => { assert.equal(handle, 'h1'); events.push('abort'); }
    };
    const sink = createScopedBackupSink(plugin, 'auto-fixture.json');
    if (failure === 'append') await assert.rejects(sink.write('header'));
    else { await sink.write('header'); await sink.append('tail'); await assert.rejects(sink.commit()); }
    await sink.abort();
    await sink.abort();
    assert.equal(events.filter(x => x === 'abort').length, 1);
    assert.equal(events.at(-1), 'abort');
  }
});

test('actual App REST permission denial or stale tenant never publishes or marks a completed backup', async () => {
  for (const config of [{ fail: true }, { changeTenant: true }]) {
    const h = nativeAppHarness(config);
    await assert.rejects(h.run());
    assert.equal(h.files.size, 0);
    assert.equal(h.states.length, 0);
    assert.equal(h.writes.includes('rename'), false);
    assert.equal(h.writes.at(-1), 'delete');
  }
});
