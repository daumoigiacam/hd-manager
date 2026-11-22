import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import * as integrity from '../src/utils/customerLoanIntegrity.js';

const day = '2026-11-21';
const customer = { id: 'c', companyId: 'qa', name: 'Loan customer' };
const loan = { id: 'loan', companyId: 'qa', customerId: 'c', productName: 'Rổ QA', quantity: 10,
  weightKg: 0, unit: 'Cái', loanDate: day, dueDate: '', note: '', returns: [], status: 'open', isArchived: false };
const entry = (id, quantity, weightKg = 0) => ({ id, quantity, weightKg, returnDate: day, note: '', createdAt: `${day}T00:00:00.000Z`, createdByEmpId: 'e' });
const returnPatch = (base, id, quantity, weightKg = 0) => ({ clientMutationId: id, returns: [...(base.returns || []), entry(id, quantity, weightKg)] });
const digest = value => createHash('sha256').update(integrity.customerLoanFingerprint(value)).digest('hex');
const sources = new Map();
function actual(file, name, bindings) {
  if (!sources.has(file)) {
    const text = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    sources.set(file, { text, tree: parse(text, { sourceType: 'module', plugins: ['jsx'] }) });
  }
  const { text, tree } = sources.get(file);
  let found;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) found = node.init;
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'comments', 'extra'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value?.type) walk(value);
    }
  };
  walk(tree);
  assert.ok(found, name);
  // Inject only the dynamic dependency; execute the actual handler body without
  // importing App, mounting UI, initializing Firebase or opening a connection.
  const body = text.slice(found.start, found.end).replace("await import('./utils/customerLoanIntegrity.js')", 'customerLoanIntegrity');
  return Function(...Object.keys(bindings), `return (${body})`)(...Object.values(bindings));
}

function database(initialLoan = loan) {
  const rows = new Map([['customers/c', structuredClone(customer)]]);
  if (initialLoan) rows.set(`customerLoans/${initialLoan.id}`, structuredClone(initialLoan));
  const versions = new Map();
  let transactions = 0, committedWrites = 0;
  const control = { loseAck: false, fail: false, beforeCommit: null, afterCommit: null };
  const transaction = async callback => {
    transactions++;
    for (let attempt = 0; attempt < 3; attempt++) {
      const readVersions = new Map(), staged = [];
      const result = await callback({
        get: async ref => {
          assert.equal(staged.length, 0, 'Transaction reads must precede writes');
          readVersions.set(ref, versions.get(ref) || 0);
          const saved = structuredClone(rows.get(ref));
          return { exists: () => saved !== undefined, data: () => structuredClone(saved) };
        },
        set: (ref, payload, options) => staged.push({ ref, payload: structuredClone(payload), options }),
      });
      if (control.beforeCommit) { const hook = control.beforeCommit; control.beforeCommit = null; hook(); }
      if ([...readVersions].some(([ref, version]) => (versions.get(ref) || 0) !== version)) continue;
      if (control.fail) throw new Error('Storage unavailable');
      for (const { ref, payload, options } of staged) {
        rows.set(ref, options?.merge ? { ...rows.get(ref), ...payload } : payload);
        versions.set(ref, (versions.get(ref) || 0) + 1);
        committedWrites++;
      }
      if (control.afterCommit) await control.afterCommit();
      if (control.loseAck) { control.loseAck = false; throw new Error('Acknowledgement lost'); }
      return result;
    }
    throw new Error('Transaction contention');
  };
  return { rows, control, transaction, get transactions() { return transactions; }, get writes() { return committedWrites; },
    change(ref, value) { rows.set(ref, structuredClone(value)); versions.set(ref, (versions.get(ref) || 0) + 1); } };
}

function app(db = database(), permissions = true) {
  let local = [], publications = 0;
  const env = {
    firebaseUser: { uid: 'u' }, myCompanyId: 'qa', currentCompany: { id: 'qa' }, appCurrentEmployee: { id: 'e' }, currentUser: { id: 'e' },
    rawCustomers: [customer], rawCustomerLoans: [], isOwnerAccountUser: () => false,
    hasCompanyRolePermissionAction: () => permissions, customerLoanIntegrity: integrity,
    getTodayString: () => day, getCustomerDisplayName: value => value.name, payloadFingerprint: async value => digest(value),
    db: {}, appId: 'test', doc: (_db, ...path) => path.slice(-2).join('/'), runTransaction: (_db, work) => db.transaction(work),
    activeTenantScopeRef: { current: 'qa' }, setRawCustomerLoans: update => { publications++; local = update(local); },
    upsertLocalListRecord: (setter, value) => setter(previous => [value, ...previous.filter(item => item.id !== value.id)]),
    rememberRecentLocalWrite() {},
  };
  return { env, db, get local() { return local; }, get publications() { return publications; },
    add: actual('../src/App.jsx', 'handleAddCustomerLoan', env), edit: actual('../src/App.jsx', 'handleEditCustomerLoan', env) };
}

function controller(parent, overrides = {}) {
  const errors = [], calls = [], cleared = [];
  const env = {
    ...integrity, crypto: globalThis.crypto, selectedCustomer: customer, selectedCustomerLoans: [loan], employee: { id: 'e' },
    canCreateCustomerLoanRecord: true, canReturnCustomerLoanRecord: true, canEditCustomerLoanRecord: true,
    customerLoanDraft: { productName: 'Rổ QA', quantity: '10', unit: 'Cái', weightKg: '', loanDate: day, dueDate: '', note: '' },
    customerLoanReturnDrafts: { loan: { quantity: '4', weightKg: '', returnDate: day, note: '' } },
    customerLoanEditDrafts: { loan: { productName: 'Rổ QA', quantity: '10', weightKg: '', unit: 'Cái', loanDate: day, note: '' } },
    customerLoanCommandsRef: { current: { create: new Map(), returns: new Map(), edits: new Map() } },
    customerLoanInFlightRef: { current: new Set() }, customerLoanReturnBasesRef: { current: new Map() }, customerLoanEditBasesRef: { current: new Map() },
    getTodayString: () => day, getFriendlyFirebaseErrorMessage: error => error.message,
    setCustomerLoanStatus: value => errors.push(value), setIsSavingCustomerLoan() {}, setSavingCustomerLoanReturnId() {}, setSavingCustomerLoanEditId() {},
    setCustomerDetailOpenSections() {}, setEditingCustomerLoanId() {},
    setCustomerLoanDraft: value => cleared.push(['create', value]),
    setCustomerLoanReturnDrafts: update => cleared.push(['return', update(env.customerLoanReturnDrafts)]),
    setCustomerLoanEditDrafts: update => cleared.push(['edit', update(env.customerLoanEditDrafts)]),
    onAddCustomerLoan: (...args) => { calls.push(['create', ...args]); return parent.add(...args); },
    onEditCustomerLoan: (...args) => { calls.push(['edit', ...args]); return parent.edit(...args); },
    ...overrides,
  };
  const handler = name => actual('../src/features/legacy/CustomerCRMController.jsx', name, env);
  return { env, errors, calls, cleared, create: handler('handleCreateCustomerLoan'), returns: handler('handleRecordCustomerLoanReturn'),
    edit: handler('handleSaveCustomerLoanEdit'), open: handler('openCustomerLoanEditor'), draft: handler('updateCustomerLoanReturnDraft') };
}

test('quantity parser rejects negative, nonfinite and malformed input instead of clamping it', () => {
  for (const value of [-1, NaN, Infinity, -Infinity, '-1', 'NaN', 'Infinity', '2kg', false, {}, []]) {
    assert.throws(() => integrity.parseCustomerLoanQuantity(value));
  }
  assert.equal(integrity.parseCustomerLoanQuantity('1,5'), 1.5);
  assert.equal(integrity.parseCustomerLoanQuantity(''), 0);
});

test('both dimensions enforce their own remaining balance; untracked dimensions cannot be returned', () => {
  for (const [base, quantity, weight] of [[loan, 11, 0], [loan, 1, 1], [{ ...loan, quantity: 0, weightKg: 10 }, 1, 0],
    [{ ...loan, weightKg: 5 }, 1, 6], [{ ...loan, weightKg: 5, returns: [entry('old', 8, 4)] }, 3, 1]]) {
    assert.throws(() => integrity.prepareCustomerLoanEdit(base.id, returnPatch(base, 'new', quantity, weight), base), /vượt|chưa/);
  }
  assert.equal(integrity.prepareCustomerLoanEdit('loan', returnPatch(loan, 'all', 10), loan).isClosed, true);
  const fractional = { ...loan, quantity: 0.3, returns: [entry('one', 0.1), entry('two', 0.2)] };
  assert.equal(integrity.validateCustomerLoanState(fractional).isClosed, true);
});

test('borrowed amounts cannot fall below returned qty or kg, and history cannot be rewritten', () => {
  const base = { ...loan, weightKg: 10, returns: [entry('old', 4, 3)] };
  for (const patch of [{ quantity: 3 }, { weightKg: 2 }, { quantity: -1 }, { weightKg: Infinity }, { returns: [] },
    { returns: [entry('old', 3, 3), entry('new', 1)] }]) {
    assert.throws(() => integrity.prepareCustomerLoanEdit('loan', { ...patch, clientMutationId: 'edit' }, base));
  }
  assert.equal(integrity.prepareCustomerLoanEdit('loan', { quantity: 4, weightKg: 3, clientMutationId: 'edit' }, base).isClosed, true);
});

test('actual UI blocks Rổ 10 → return 11 and negative/nonfinite create, return and edit quantities', async () => {
  for (const quantity of ['11', '-1', 'Infinity']) {
    const f = controller(app(), { customerLoanReturnDrafts: { loan: { quantity, returnDate: day } } });
    await f.returns(loan);
    assert.equal(f.calls.length, 0);
    assert.equal(f.cleared.length, 0);
  }
  for (const quantity of ['-1', 'NaN']) {
    const f = controller(app());
    f.env.customerLoanDraft.quantity = quantity;
    f.env.customerLoanEditDrafts.loan.quantity = quantity;
    await f.create(); await f.edit(loan);
    assert.equal(f.calls.length, 0);
  }
});

test('actual parent validates direct callers and denies forbidden/foreign writes without publishing', async () => {
  const f = app(database(null));
  await assert.rejects(f.add('c', { productName: 'Rổ', quantity: -1, weightKg: 1, clientMutationId: 'bad' }));
  await assert.rejects(f.edit('loan', returnPatch(loan, 'bad', 11), loan));
  assert.equal(f.db.transactions, 0); assert.equal(f.publications, 0);
  const denied = app(database(), false);
  assert.equal((await denied.edit('loan', returnPatch(loan, 'denied', 1), loan)).success, false);
  assert.equal(denied.db.transactions, 0);
  const foreign = app();
  foreign.db.rows.set('customerLoans/loan', { ...loan, companyId: 'foreign' });
  await assert.rejects(foreign.edit('loan', returnPatch(loan, 'foreign', 1), loan), error => error.code === 'permission-denied');
  assert.equal(foreign.publications, 0); assert.equal(foreign.db.writes, 0);
});

test('actual parent requires UI expectedLoan; latest parent raw data cannot mask a stale UI', async () => {
  const f = app();
  await assert.rejects(f.edit('loan', returnPatch(loan, 'missing', 1)));
  const newer = { ...loan, returns: [entry('other', 2)], updatedAt: 'newer' };
  f.db.change('customerLoans/loan', newer);
  f.env.rawCustomerLoans.push(newer);
  await assert.rejects(f.edit('loan', returnPatch(loan, 'stale', 1), loan), error => error.code === 'customer-loan/conflict');
  assert.deepEqual(f.db.rows.get('customerLoans/loan'), newer);
  assert.equal(f.publications, 0);
});

test('real transaction callback retry rejects stale arrays if another write wins after the read', async () => {
  const f = app();
  const newer = { ...loan, returns: [entry('concurrent', 8)] };
  f.db.control.beforeCommit = () => f.db.change('customerLoans/loan', newer);
  await assert.rejects(f.edit('loan', returnPatch(loan, 'ours', 4), loan), error => error.code === 'customer-loan/conflict');
  assert.deepEqual(f.db.rows.get('customerLoans/loan'), newer);
  assert.equal(f.db.writes, 0); assert.equal(f.publications, 0);
});

test('two concurrent actual returns cannot overwrite each other or over-return', async () => {
  const f = app();
  const result = await Promise.allSettled([f.edit('loan', returnPatch(loan, 'one', 6), loan), f.edit('loan', returnPatch(loan, 'two', 6), loan)]);
  assert.equal(result.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(f.db.rows.get('customerLoans/loan').returns.length, 1);
  assert.equal(f.db.rows.get('customerLoans/loan').returns[0].quantity, 6);
});

test('UI captures return draft base and edit-open base and passes each as the third argument', async () => {
  const f = controller(app());
  f.draft('loan', 'quantity', '4');
  f.open(loan);
  const newer = { ...loan, quantity: 20, note: 'Concurrent edit' };
  await f.returns(newer);
  await f.edit(newer);
  assert.equal(f.calls.length, 2);
  for (const call of f.calls) {
    assert.equal(call[3].quantity, 10);
    assert.equal(call[3].note, '');
  }
});

test('create lost-ack retry reuses the UI ID and existing server document; failures keep the draft', async () => {
  const parent = app(database(null)), f = controller(parent);
  parent.db.control.loseAck = true;
  await f.create();
  assert.equal(f.cleared.length, 0); assert.equal(parent.publications, 0);
  await f.create();
  assert.equal(f.calls[0][2].clientMutationId, f.calls[1][2].clientMutationId);
  assert.equal([...parent.db.rows.keys()].filter(key => key.startsWith('customerLoans/')).length, 1);
  assert.equal(parent.db.writes, 1); assert.equal(parent.local.length, 1);
});

test('return lost-ack retry reuses the entry and command IDs without adding a duplicate', async () => {
  const parent = app(), f = controller(parent);
  parent.db.control.loseAck = true;
  await f.returns(loan);
  assert.equal(f.cleared.length, 0); assert.equal(parent.publications, 0);
  await f.returns(parent.db.rows.get('customerLoans/loan'));
  assert.deepEqual(f.calls[0][2], f.calls[1][2]);
  assert.deepEqual(f.calls[0][3], f.calls[1][3]);
  assert.equal(parent.db.rows.get('customerLoans/loan').returns.length, 1);
  assert.equal(parent.db.writes, 1); assert.equal(parent.local[0].returns[0].quantity, 4);
});

test('old return replay after a later return preserves the later history', async () => {
  const f = app(), first = returnPatch(loan, 'one', 2);
  await f.edit('loan', first, loan);
  const afterFirst = structuredClone(f.db.rows.get('customerLoans/loan'));
  await f.edit('loan', returnPatch(afterFirst, 'two', 3), afterFirst);
  const before = structuredClone(f.db.rows.get('customerLoans/loan'));
  const result = await f.edit('loan', first, loan);
  assert.equal(result.duplicate, true);
  assert.deepEqual(f.db.rows.get('customerLoans/loan'), before);
  assert.equal(f.db.writes, 2);
});

test('publication waits for confirmed transaction; rejected writes and tenant switches never publish', async () => {
  const f = app();
  let release;
  f.db.control.afterCommit = () => new Promise(resolve => { release = resolve; });
  const saving = f.edit('loan', returnPatch(loan, 'wait', 1), loan);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.publications, 0);
  release(); await saving;
  assert.equal(f.publications, 1);
  const failed = app(); failed.db.control.fail = true;
  await assert.rejects(failed.edit('loan', returnPatch(loan, 'fail', 1), loan));
  assert.equal(failed.publications, 0); assert.equal(failed.db.writes, 0);
  const switched = app(); switched.env.activeTenantScopeRef.current = 'other';
  await switched.edit('loan', returnPatch(loan, 'switch', 1), loan);
  assert.equal(switched.publications, 0);
});

test('UI duplicate clicks share one in-flight operation; valid full return closes on confirmed server state', async () => {
  const parent = app(), f = controller(parent, { customerLoanReturnDrafts: { loan: { quantity: '10', returnDate: day } } });
  await Promise.all([f.returns(loan), f.returns(loan)]);
  assert.equal(f.calls.length, 1);
  assert.equal(parent.db.rows.get('customerLoans/loan').status, 'closed');
  assert.match(f.errors.at(-1), /đóng/);
});

test('actual borrowed-amount edit rejects lowering either dimension below returned amounts', async () => {
  const base = { ...loan, weightKg: 10, returns: [entry('old', 4, 3)] };
  const parent = app(database(base));
  for (const fields of [{ quantity: 3 }, { weightKg: 2 }]) {
    await assert.rejects(parent.edit('loan', { ...fields, clientMutationId: 'lower' }, base), /vượt/);
  }
  const ui = controller(parent);
  ui.env.customerLoanEditDrafts.loan.quantity = '3';
  ui.env.customerLoanEditDrafts.loan.weightKg = '10';
  await ui.edit(base);
  assert.equal(ui.calls.length, 0);
  assert.equal(parent.db.writes, 0); assert.equal(parent.publications, 0);
});

test('reusing a create or return ID with another payload fails instead of silently skipping it', async () => {
  const created = app(database(null));
  const fields = { productName: 'Rổ', quantity: 10, weightKg: 0, clientMutationId: 'create-once' };
  await created.add('c', fields);
  await assert.rejects(created.add('c', { ...fields, quantity: 20 }), error => error.code === 'customer-loan/conflict');
  assert.equal(created.db.writes, 1);
  const returned = app();
  await returned.edit('loan', returnPatch(loan, 'return-once', 2), loan);
  await assert.rejects(returned.edit('loan', returnPatch(loan, 'return-once', 3), loan), error => error.code === 'customer-loan/conflict');
  assert.equal(returned.db.writes, 1);
});

test('actual metadata edit retries keep the original UI snapshot and command ID after a lost ack', async () => {
  const parent = app(), ui = controller(parent);
  ui.open(loan);
  const draftUpdates = ui.cleared.length;
  parent.db.control.loseAck = true;
  await ui.edit(loan);
  assert.equal(ui.cleared.length, draftUpdates);
  await ui.edit(parent.db.rows.get('customerLoans/loan'));
  assert.deepEqual(ui.calls[0][2], ui.calls[1][2]);
  assert.deepEqual(ui.calls[0][3], ui.calls[1][3]);
  assert.equal(parent.db.writes, 1);
});
