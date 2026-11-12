import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import initSqlJs from 'sql.js';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {createOfflineBusinessDirectory} from '../../data/offlineBusinessDirectory.js';
import {
  createFinancePresentation, createFinanceFilters, financeSearchInputTime, financeDirectoryOptions, financeReadAccess, FINANCE_APPROVAL_FIELDS,
  readFinancePage, readFinanceDetail,
} from './offlineFinanceModel.js';

// Evaluate the real existing product date/approval declarations for fixtures.
// No bundler/build, browser, native bridge, Firebase, or replacement formula.
const product = readFileSync(new URL('../customers/productCRMShared.jsx', import.meta.url), 'utf8');
const ast = parse(product, {sourceType: 'module', plugins: ['jsx']});
const traverse = traverseModule.default || traverseModule;
let program;
traverse(ast, {Program(p) {program = p;p.stop();}});
const roots = ['getDateKeyFromAnyValue', 'getEntityTimestamp', 'getPaymentDateSource',
  'isPayosPaymentRecord', 'requiresCashflowApproval', 'isCashflowOfficial', 'CASHFLOW_APPROVAL_STATUS'];
const declarations = new Map();
function collect(name) {
  if (declarations.has(name)) return;
  const binding = program.scope.getBinding(name);
  assert(binding && binding.path.isVariableDeclarator(), `Expected an existing pure product declaration: ${name}`);
  declarations.set(name, binding.path.node);
  binding.path.traverse({ReferencedIdentifier(p) {
    const dep = p.scope.getBinding(p.node.name);
    if (dep?.scope === program.scope) collect(p.node.name);
  }});
}
roots.forEach(collect);
const rules = vm.runInNewContext(
  [...declarations.values()].sort((a, b) => a.start - b.start).map(n => `const ${product.slice(n.start, n.end)};`).join('\n')
  + `\n({${roots.join(',')}})`, {Date},
);
const presentation = createFinancePresentation(rules);
const scope = {tenantId: 'tenant-a', principalId: 'principal-a', permissionRevision: 'r1', sessionId: 's1'};
const checkpoint = {generation: 'g1', seq: 13, capturedAt: Date.now() - 5000, dayKey: '2026-11-09', sourceProfile: 'legacy-v1'};
const approvedFields = Object.fromEntries(FINANCE_APPROVAL_FIELDS.map(field => [field, null]));
const document = (patch = {}) => ({...approvedFields, companyId: scope.tenantId, date: '2026-11-09', amount: 125000, ...patch});
const row = (patch = {}) => ({id: 'voucher-a', businessDate: '2026-11-09', document: document(patch), state: 'SERVER_CONFIRMED'});
function fixture() {
  let current = true;
  const calls = [];
  const runtime = {scope, expiresAtMs: Date.now() + 60000, isCurrent: () => current,
    capabilities: ['home.read', 'home.cashflow.read'],
    appSession: {currentUser: {id: 'e1', firebaseUid: scope.principalId, companyId: scope.tenantId}, currentCompany: {id: scope.tenantId}}};
  const response = (items = [row()], cp = checkpoint) => ({items, nextCursor: null, hasMore: false,
    metadata: {source: 'payments', checkpoint: cp, serverConfirmedOnly: true, financialCalculationAllowed: false,
      projection: 'bounded-directory-scalars-v1', timeZone: 'Asia/Ho_Chi_Minh'}});
  const directory = {
    sources: {payments: {statusFilter: 'cashflow-approval-v1'}, expenses: {statusFilter: 'cashflow-approval-v1'}},
    async page(...args) {calls.push(args);return response();},
    async lookup(...args) {calls.push(args);return response();},
  };
  return {runtime, directory, response, calls, revoke: () => {current = false;}};
}
const filters = {dateFrom: '2026-11-01', dateTo: '2026-11-30', search: 'phiếu', employeeId: 'e1', status: 'all'};

test('default day is actual Vietnam today, independent of historical feed checkpoint', () => {
  const current = createFinanceFilters(Date.parse('2026-11-09T18:30:00Z'));
  assert.equal(current.dateFrom, '2026-11-10');
  assert.equal(current.dateTo, '2026-11-10');
  assert.notEqual(current.dateFrom, checkpoint.dayKey);
  assert.equal(createFinanceFilters(Date.parse('2026-11-09T16:59:59Z')).dateFrom, '2026-11-09');
});

test('search start includes dispatch delay and keeps legacy epoch timestamps out of the monotonic clock', () => {
  assert.equal(financeSearchInputTime(100, 135), 100);
  assert.equal(financeSearchInputTime(1794192000000, 135), 135);
  assert.equal(financeSearchInputTime(undefined, 135), 135);
});

test('real bank transaction date wins over webhook arrival and cashflow creation dates', () => {
  const bank = {paymentProvider: 'sepay', createdAt: '2026-11-09', date: '2026-11-09', cashflowDate: '2026-11-09',
    rawWebhook: {data: {transactionDateTime: '2026-11-07 23:59:59'}}};
  assert.equal(presentation.dateKey(bank), '2026-11-07');
  assert.equal(presentation.dateKey({cashflowDate: '2026-11-06', date: '2026-11-09'}), '2026-11-06');
  assert.equal(presentation.dateKey({}), '');
  assert.equal(presentation.present('payments', {...row(), businessDate: '2026-11-08'}).dateKey, '2026-11-08', 'directory business day is authoritative');
});

test('source signs, missing amounts, explicit zero and reversals remain distinct', () => {
  assert.equal(presentation.present('payments', row()).signedAmount, 125000);
  assert.equal(presentation.present('expenses', row()).signedAmount, -125000);
  assert.equal(presentation.present('expenses', row({amount: -20})).signedAmount, 20);
  assert.equal(presentation.present('payments', row({amount: 0})).amount, 0);
  assert(Object.is(presentation.present('expenses', row({amount: 0})).signedAmount, -0));
  for (const amount of [undefined, null, '', '125000', NaN, Infinity]) {
    assert.equal(presentation.present('payments', row({amount})).amount, null);
  }
  assert.equal(presentation.present('expenses', row({sourceType: 'customer_debt_repayment'})).debtRepayment, true);
});

test('approval, payment completion and server confirmation are separate', () => {
  const pending = presentation.present('payments', row({sourceType: 'driver_cash', createdByRole: 'driver'}));
  assert.equal(pending.serverConfirmed, true);
  assert.equal(pending.approval.label, 'Chờ xác nhận');
  assert.equal(pending.official, false);
  assert.equal(presentation.present('payments', row({approvalStatus: 'rejected'})).approval.label, 'Không duyệt');
  const intent = presentation.present('payments', row({approvalStatus: 'approved', isPaymentIntent: true}));
  assert.equal(intent.approval.label, 'Đã xác nhận');
  assert.equal(intent.official, false);
  const local = presentation.present('expenses', row({approvalStatus: 'approved', __pendingLocalSync: true}));
  assert.equal(local.serverConfirmed, false);
  assert.equal(local.official, false);
  assert.equal(presentation.present('payments', row()).official, true);
  const incomplete = {...row(), document: {companyId: scope.tenantId}};
  assert.equal(presentation.present('payments', incomplete).official, null);
  assert.equal(presentation.present('payments', incomplete).approval.value, 'unknown');
});

test('uses actual directory options, inclusive UI end day becomes exclusive SQL bound', async () => {
  const f = fixture();
  await readFinancePage({...f, source: 'payments', filters});
  assert.deepEqual(f.calls[0], ['payments', {from: '2026-11-01', to: '2026-12-01', text: 'phiếu',
    employeeId: 'e1', status: null, cursor: null, limit: 40}]);
  assert.equal(financeDirectoryOptions(f.directory, 'payments', {...filters, dateTo: '2028-02-29'}).to, '2028-03-01');
  assert.throws(() => financeDirectoryOptions(f.directory, 'payments', {...filters, dateTo: '2026-02-31'}), /không hợp lệ/);
  const result = await readFinanceDetail({...f, source: 'payments', id: 'voucher-a', head: checkpoint});
  assert.equal(result.id, 'voucher-a');
  assert.deepEqual(f.calls[1], ['payments', ['voucher-a'], {checkpoint}]);
});

test('never sends product approval choices into the raw source status predicate', async () => {
  const f = fixture();
  f.directory.sources.payments = {};
  await assert.rejects(readFinancePage({...f, source: 'payments', filters: {...filters, status: 'pending'}}), /chưa hỗ trợ lọc/);
  assert.equal(f.calls.length, 0);
  f.directory.sources.payments.statusFilter = 'cashflow-approval-v1';
  await readFinancePage({...f, source: 'payments', filters: {...filters, status: 'pending'}});
  assert.equal(f.calls[0][1].status, 'pending');
});

test('rejects scope/capability changes before reading and revocation during async read', async () => {
  const f = fixture();
  f.runtime.capabilities = ['home.read'];
  await assert.rejects(readFinancePage({...f, source: 'payments', filters}), /home.cashflow.read/);
  await assert.rejects(readFinanceDetail({...f, source: 'expenses', id: 'voucher-a', head: checkpoint}), /home.cashflow.read/);
  assert.equal(f.calls.length, 0);
  f.runtime.capabilities = ['home.cashflow.read'];
  await assert.rejects(readFinancePage({...f, source: 'payments', filters}), /quyền đọc nguồn/);
  assert.equal(f.calls.length, 0);
  f.runtime.capabilities = ['home.read'];
  f.runtime.capabilities.push('home.cashflow.read');
  f.runtime.appSession.currentCompany.id = 'other';
  assert.match(financeReadAccess(f.runtime, f.directory), /không khớp/);
  f.runtime.appSession.currentCompany.id = scope.tenantId;
  f.directory.page = async () => {f.revoke();return f.response();};
  await assert.rejects(readFinancePage({...f, source: 'payments', filters}), /đã thay đổi/);
});

test('pages and detail cannot mix completed checkpoints or other tenant records', async () => {
  const f = fixture();
  f.directory.page = async () => f.response([row()], {...checkpoint, seq: 14});
  await assert.rejects(readFinancePage({...f, source: 'payments', filters, head: checkpoint}), /đã thay đổi/);
  f.directory.page = async () => f.response([row({companyId: 'other'})]);
  await assert.rejects(readFinancePage({...f, source: 'payments', filters}), /không khớp/);
  f.directory.lookup = async () => f.response([{...row(), id: 'wrong'}]);
  await assert.rejects(readFinanceDetail({...f, source: 'payments', id: 'voucher-a', head: checkpoint}), /sai phiếu/);
  f.directory.lookup = async () => f.response([]);
  await assert.rejects(readFinanceDetail({...f, source: 'payments', id: 'voucher-a', head: checkpoint}), /không còn/);
});

test('refuses invalid or repeated cursors and malformed pages instead of duplicate ledger rows', async () => {
  const f = fixture();
  f.directory.page = async () => ({...f.response(), nextCursor: 'same', hasMore: true});
  await assert.rejects(readFinancePage({...f, source: 'payments', filters, after: 'same', head: checkpoint}), /không hợp lệ/);
  f.directory.page = async () => f.response([row(), row()]);
  await assert.rejects(readFinancePage({...f, source: 'payments', filters}), /trùng lặp/);
});

test('actual scoped SQL directory supports cursor continuation, search, employee/date filters and exact lookup', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const query = (sql, params = []) => {
    const statement = db.prepare(sql);
    try {statement.bind(params);const rows = [];while (statement.step()) rows.push(statement.getAsObject());return rows;}
    finally {statement.free();}
  };
  const f = fixture();
  try {
    db.run('CREATE TABLE offline_home_head_v1 (tenant_id,principal_id,revision,generation,captured_at,day_key,snapshot_json)');
    db.run('CREATE TABLE offline_home_feed_checkpoint_v1 (tenant_id,principal_id,revision,generation,applied_seq,reported_seq)');
    db.run('CREATE TABLE offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,seq,body)');
    db.run('INSERT INTO offline_home_head_v1 VALUES (?,?,?,?,?,?,?)', [scope.tenantId, scope.principalId, scope.permissionRevision,
      checkpoint.generation, checkpoint.capturedAt, checkpoint.dayKey, JSON.stringify({feedGeneration: checkpoint.generation,
        feedSeq: checkpoint.seq, sourceProfile: 'legacy-v1', availableSources: ['payments', 'expenses'], sourceCounts: {payments: 43, expenses: 0}})]);
    db.run('INSERT INTO offline_home_feed_checkpoint_v1 VALUES (?,?,?,?,?,?)', [scope.tenantId, scope.principalId,
      scope.permissionRevision, checkpoint.generation, checkpoint.seq, checkpoint.seq]);
    for (let i = 0; i < 43; i++) {
      const id = `p${String(i).padStart(3, '0')}`;
      const record = document({id, date: '2026-11-09', empId: i === 21 ? 'e2' : 'e1',
        note: i === 21 ? 'Tìm đúng khách hàng' : 'Thu tiền', isArchived: i === 0 || i === 42});
      db.run('INSERT INTO offline_home_feed_records_v1 VALUES (?,?,?,?,?,?,?)',
        [scope.tenantId, scope.principalId, checkpoint.generation, 'payments', id, 1, JSON.stringify(record)]);
    }
    const directory = createOfflineBusinessDirectory({database: {transaction: work => work({query})},
      session: {scope, isCurrent: f.runtime.isCurrent}, authorize: async () => ({...scope, expiresAtMs: f.runtime.expiresAtMs, capabilities: f.runtime.capabilities})});
    const noSearch = {...filters, search: '', employeeId: ''};
    const first = await readFinancePage({runtime: f.runtime, directory, source: 'payments', filters: noSearch});
    assert.equal(first.rows.length, 39, 'archived first row is hidden without losing SQL cursor');
    assert(first.nextCursor);
    const next = await readFinancePage({runtime: f.runtime, directory, source: 'payments', filters: noSearch, after: first.nextCursor, head: first.head});
    assert.equal(next.rows.length, 2);
    assert.equal(next.nextCursor, null);
    assert.equal(new Set([...first.rows, ...next.rows].map(item => item.id)).size, 41);
    const match = await readFinancePage({runtime: f.runtime, directory, source: 'payments', filters: {...noSearch, search: 'tim dung', employeeId: 'e2'}});
    assert.deepEqual(match.rows.map(item => item.id), ['p021']);
    const detail = await readFinanceDetail({runtime: f.runtime, directory, source: 'payments', id: 'p021', head: match.head});
    assert.equal(detail.document.note, 'Tìm đúng khách hàng');
    assert.equal(presentation.present('payments', detail).amount, 125000);
    const empty = await readFinancePage({runtime: f.runtime, directory, source: 'payments', filters: {...noSearch, dateFrom: '2026-11-10', dateTo: '2026-11-10'}});
    assert.equal(empty.rows.length, 0);
  } finally {db.close();}
});

test('component parses and contains no alternate owner, write endpoint or financial summary calculation', () => {
  const source = readFileSync(new URL('./OfflineFinanceWorkspace.jsx', import.meta.url), 'utf8');
  const tree = parse(source, {sourceType: 'module', plugins: ['jsx']});
  const forbidden = [];
  assert(!source.includes('useDebouncedValue'));
  assert(!source.includes('useDeferredValue'));
  assert(source.includes('filters={filters}'));
  assert(source.includes("endpoint: 'dom-commit'"));
  assert(source.includes('ticket === operation.current'));
  traverse(tree, {CallExpression(p) {
    if (['fetch', 'createOfflineRuntimeOwner', 'bootstrapOfflineCustomer', 'createOfflineBusinessDirectory'].includes(p.node.callee.name)) forbidden.push(p.node.callee.name);
    if (p.node.callee.type === 'MemberExpression' && ['reduce', 'addEventListener', 'enqueue', 'transaction'].includes(p.node.callee.property.name)) forbidden.push(p.node.callee.property.name);
  }});
  assert.deepEqual(forbidden, []);
  const subscriptions=[];traverse(tree,{CallExpression(p){const c=p.node.callee;if(c.type==='MemberExpression'&&c.property.name==='subscribe')subscriptions.push(p);}});assert.equal(subscriptions.length,1);const effect=subscriptions[0].findParent(p=>p.isCallExpression()&&p.node.callee.name==='useEffect');assert(effect,'Runtime subscription must be owned by the effect');assert.equal(effect.node.arguments[0].body.type,'CallExpression','Effect returns existing Runtime unsubscribe');
});
