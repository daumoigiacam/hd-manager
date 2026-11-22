import test from 'node:test';
import assert from 'node:assert/strict';
import { planDeliveryCashflowChange, deliveryCashflowRevision, isDeliveryCashflowRevision, assertDeliveryCashflowWrite } from '../src/utils/deliveryCashflow.js';
import { createDeliverySavePlan } from '../src/utils/deliverySavePlan.js';
import { commitAtomicWrites, mergeAtomicWrites, validateAtomicWrites } from '../src/utils/atomicSave.js';

const receipt={id:'p_delivery_r',companyId:'qa',relatedDeliveryReportId:'r',customerId:'c',amount:500000,method:'Tiền mặt',date:'2026-11-21',requiresApproval:true,approvalStatus:'pending_handover',handoverStatus:'pending',isArchived:false};
const change=(record=receipt,patch={})=>planDeliveryCashflowChange({records:[record],reportId:'r',amount:550000,customerId:'c',method:'Tiền mặt',date:'2026-11-21',...patch});
test('editing a pending report updates its existing receipt; removing and restoring the amount reuses that receipt',()=>{
  const next=change();assert.equal(next.type,'edit');assert.equal(next.previous.id,receipt.id);
  const plan=createDeliverySavePlan('qa-command');plan.editReport('r',{collectedAmount:550000});plan.editPayment(next.previous.id,{amount:550000});
  assert.equal(plan.operations[1].type,'editPayment');assert.equal(plan.operations[1].id,receipt.id);
  assert.equal(change(receipt,{amount:0}).type,'archive');assert.equal(change({...receipt,isArchived:true}).type,'edit');
});
test('approved and rejected cashflow remains unchanged; a monetary change must be reconciled first',()=>{
  for(const approvalStatus of ['approved','rejected']) {
    const record={...receipt,approvalStatus,handoverStatus:approvalStatus==='approved'?'confirmed':'rejected'};
    assert.throws(()=>change(record),/đã được xử lý/);
    assert.equal(change(record,{amount:500000}).type,'none');
    assert.throws(()=>assertDeliveryCashflowWrite(record,{amount:550000}),/đã được xử lý/);
  }
});
test('duplicate links and missing permission cannot silently change the money on a report',()=>{
  assert.throws(()=>change(receipt,{permitted:false}),/quyền/);
  assert.throws(()=>change(receipt,{records:[receipt,{...receipt,id:'another'}]}),/nhiều chứng từ/);
  assert.throws(()=>assertDeliveryCashflowWrite(receipt,{relatedDeliveryReportId:'other'}),/thay đổi/);
});
async function commit(server,expected=deliveryCashflowRevision(receipt)) {
  const saved=[];const writes=[{collectionName:'deliveryReports',documentId:'r',payload:{companyId:'qa',collectedAmount:550000},options:{merge:true}},
    {collectionName:'payments',documentId:receipt.id,payload:{companyId:'qa',amount:550000},options:{merge:true},expectedDeliveryCashflow:expected}];
  const run=()=>commitAtomicWrites({writes,companyId:'qa',reference:write=>write.documentId,transaction:fn=>fn({get:async()=>({exists:()=>Boolean(server),data:()=>server}),set:(...args)=>saved.push(args)})});
  return {run,saved};
}
test('the actual atomic writer commits report and existing receipt together with the pending revision',async()=>{
  const {run,saved}=await commit(receipt);await run();assert.equal(saved.length,2);assert.equal(saved[1][0],receipt.id);assert.equal(saved[1][1].amount,550000);
});
test('concurrent approval, edits, deletion and cross-company collisions abort before any report write',async()=>{
  for(const server of [{...receipt,approvalStatus:'approved',handoverStatus:'confirmed'},{...receipt,amount:600000},{...receipt,companyId:'foreign'},null]) {
    const {run,saved}=await commit(server);await assert.rejects(run(),error=>error.code==='firestore/delivery-cashflow-conflict');assert.equal(saved.length,0);
  }
});
test('pending expense edits use the same revision guard without downgrading an approved expense',()=>{
  const expense={...receipt,id:'exp',amount:50000};delete expense.customerId;delete expense.method;
  assert.equal(planDeliveryCashflowChange({records:[expense],reportId:'r',amount:60000,date:expense.date}).type,'edit');
  assert.throws(()=>planDeliveryCashflowChange({records:[{...expense,approvalStatus:'approved',handoverStatus:'confirmed'}],reportId:'r',amount:60000,date:expense.date}),/đã được xử lý/);
});

const expense = { ...receipt, id: 'exp', amount: 50000, category: 'Nhiên liệu', note: 'Đổ dầu', assetId: 'truck' };
delete expense.customerId;
delete expense.method;
const marker = { id: 'delivery-edit', fingerprint: 'a'.repeat(64) };
const expenseChange = (record = expense, patch = {}) => planDeliveryCashflowChange({
  records: [record], reportId: 'r', amount: expense.amount, date: expense.date,
  details: { category: expense.category, note: expense.note, assetId: expense.assetId }, ...patch,
});
const reportWrite = () => ({
  collectionName: 'deliveryReports', documentId: 'r',
  payload: { companyId: 'qa', collectedAmount: 550000, note: 'Updated report' }, options: { merge: true },
});
const paymentWrite = () => ({
  collectionName: 'payments', documentId: receipt.id,
  payload: { companyId: 'qa', amount: 550000 }, options: { merge: true },
  expectedDeliveryCashflow: deliveryCashflowRevision(receipt),
});
const expenseWrite = () => ({
  collectionName: 'expenses', documentId: expense.id,
  payload: { companyId: 'qa', amount: 60000 }, options: { merge: true },
  expectedDeliveryCashflow: deliveryCashflowRevision(expense),
});
const decorate = (writes, command = marker) => writes.map(write => ({
  ...write, deliveryCommand: { ...command }, payload: { ...write.payload, lastDeliveryCommand: { ...command } },
}));
const key = write => `${write.collectionName}/${write.documentId}`;

// Exercise the real writer with transactional rollback and saved replay state.
function store(initial = {}) {
  const rows = new Map(Object.entries(structuredClone(initial)));
  const reads = [], sets = [];
  let transactions = 0;
  const transaction = async callback => {
    transactions += 1;
    const staged = [];
    const result = await callback({
      get: async id => {
        assert.equal(staged.length, 0, 'All reads must precede writes');
        reads.push(id);
        const saved = structuredClone(rows.get(id));
        return { exists: () => saved !== undefined, data: () => structuredClone(saved) };
      },
      set: (id, payload, options = {}) => {
        const entry = { id, payload: structuredClone(payload), options: { ...options } };
        sets.push(entry);
        staged.push(entry);
      },
    });
    for (const { id, payload, options } of staged) rows.set(id, options.merge ? { ...rows.get(id), ...payload } : payload);
    return result;
  };
  return {
    rows, reads, sets, get transactions() { return transactions; },
    commit: writes => commitAtomicWrites({ writes, companyId: 'qa', transaction, reference: key }),
  };
}
const initial = () => ({
  'deliveryReports/r': { companyId: 'qa', collectedAmount: receipt.amount, note: 'Original' },
  [`payments/${receipt.id}`]: receipt,
  'expenses/exp': expense,
});

test('unchanged cashflow is a no-op for pending and finalized records, even without money permission', () => {
  for (const [approvalStatus, handoverStatus] of [['pending_handover', 'pending'], ['approved', 'confirmed'], ['rejected', 'rejected']]) {
    for (const permitted of [true, false]) {
      assert.equal(change({ ...receipt, approvalStatus, handoverStatus }, { amount: receipt.amount, permitted }).type, 'none');
    }
  }
  assert.equal(expenseChange().type, 'none', 'Absent customer/method must not manufacture an expense change');
});

test('expense details detect metadata changes and reject changes to finalized expenses', () => {
  for (const details of [
    { category: 'Phí đường bộ' }, { note: 'New expense note' }, { assetId: 'other-truck' },
    { assetName: 'New truck name' }, { assetPlate: 'New plate' },
  ]) {
    assert.equal(expenseChange(expense, { details }).type, 'edit');
    assert.throws(() => expenseChange(expense, { details, permitted: false }), /quyền/);
    for (const approvalStatus of ['approved', 'rejected']) {
      const record = { ...expense, approvalStatus, handoverStatus: approvalStatus === 'approved' ? 'confirmed' : 'rejected' };
      assert.throws(() => expenseChange(record, { details }), /đã được xử lý/);
      assert.equal(expenseChange(record).type, 'none');
    }
  }
  for (const details of [null, [], { note: undefined }]) assert.throws(() => expenseChange(expense, { details }), /details/);
});

test('revision schema requires exactly the typed fields, including nullable legacy fields', () => {
  const revision = deliveryCashflowRevision(receipt);
  assert.equal(isDeliveryCashflowRevision(revision), true);
  assert.equal(isDeliveryCashflowRevision(deliveryCashflowRevision(expense)), true);
  for (const invalid of [
    null, [], { relatedDeliveryReportId: 'r' }, { ...revision, extra: true },
    { ...revision, amount: '500000' }, { ...revision, amount: -1 }, { ...revision, amount: Infinity },
    { ...revision, amount: Number.MAX_SAFE_INTEGER + 1 }, { ...revision, requiresApproval: 'true' },
    { ...revision, isArchived: 0 }, { ...revision, customerId: false }, { ...revision, method: '' },
    { ...revision, date: '2026-02-30' }, { ...revision, approvalStatus: '' },
    { ...revision, handoverStatus: 'unknown' }, { ...revision, relatedDeliveryReportId: '' },
    { ...revision, [Symbol('extra')]: true },
  ]) assert.equal(isDeliveryCashflowRevision(invalid), false);
  const missing = { ...revision };
  delete missing.method;
  assert.equal(isDeliveryCashflowRevision(missing), false);
  assert.throws(() => deliveryCashflowRevision({ ...receipt, amount: NaN }), /revision/);
});

test('protected metadata rejects falsy changes while pending archive and restore remain allowed', () => {
  for (const field of ['relatedDeliveryReportId', 'approvalStatus', 'requiresApproval', 'handoverStatus', 'companyId']) {
    for (const value of ['', false, null, undefined, 0]) {
      assert.throws(() => assertDeliveryCashflowWrite(receipt, { [field]: value }), /đã được xử lý/);
    }
  }
  assert.deepEqual(assertDeliveryCashflowWrite(receipt, { isArchived: true }), deliveryCashflowRevision(receipt));
  assert.deepEqual(assertDeliveryCashflowWrite({ ...receipt, isArchived: true }, { isArchived: false }),
    deliveryCashflowRevision({ ...receipt, isArchived: true }));
  for (const patch of [{ amount: -1 }, { amount: '1' }, { method: '' }, { customerId: null }, { date: 'bad' }, { isArchived: null }]) {
    assert.throws(() => assertDeliveryCashflowWrite(receipt, patch), /đã được xử lý/);
  }
});

test('invalid revisions and protected patches fail before opening a transaction', async () => {
  for (const invalid of [undefined, null, [], { relatedDeliveryReportId: 'r' }, { ...deliveryCashflowRevision(receipt), extra: true }]) {
    const db = store(initial());
    await assert.rejects(db.commit([{ ...paymentWrite(), expectedDeliveryCashflow: invalid }]));
    assert.equal(db.transactions, 0);
  }
  const db = store(initial());
  await assert.rejects(db.commit([{ ...paymentWrite(), payload: { companyId: 'qa', requiresApproval: false } }]));
  assert.equal(db.transactions, 0);
});

test('actual atomic flow updates or archives a pending expense with its report', async () => {
  for (const payload of [{ companyId: 'qa', amount: 60000 }, { companyId: 'qa', isArchived: true }]) {
    const db = store(initial());
    await db.commit([reportWrite(), { ...expenseWrite(), payload }]);
    assert.equal(db.sets.length, 2);
    assert.equal(db.rows.get('expenses/exp').approvalStatus, 'pending_handover');
    for (const [field, value] of Object.entries(payload)) assert.equal(db.rows.get('expenses/exp')[field], value);
  }
});

test('expense approval, edits, deletion and invalid server state abort before any set', async () => {
  for (const server of [
    { ...expense, approvalStatus: 'approved', handoverStatus: 'confirmed' },
    { ...expense, approvalStatus: 'rejected', handoverStatus: 'rejected' },
    { ...expense, amount: 70000 }, { ...expense, amount: '50000' }, { ...expense, companyId: 'foreign' }, null,
  ]) {
    const state = initial();
    if (server) state['expenses/exp'] = server;
    else delete state['expenses/exp'];
    const db = store(state);
    await assert.rejects(db.commit([reportWrite(), expenseWrite()]), error => error.code === 'firestore/delivery-cashflow-conflict');
    assert.equal(db.sets.length, 0);
    assert.deepEqual(db.rows.get('deliveryReports/r'), state['deliveryReports/r']);
  }
});

test('report-note-only command leaves unchanged expense alone after finance approval', async () => {
  assert.equal(expenseChange().type, 'none');
  const state = initial();
  state['expenses/exp'] = { ...expense, approvalStatus: 'approved', handoverStatus: 'confirmed' };
  const db = store(state);
  await db.commit(decorate([{ ...reportWrite(), payload: { companyId: 'qa', note: 'Only report note changed' } }]));
  assert.deepEqual(db.rows.get('expenses/exp'), state['expenses/exp']);
  assert.deepEqual(db.reads, ['deliveryReports/r']);
});

test('later cost side-effect merge retains CAS and catches an expense approval race', async () => {
  const guarded = expenseWrite();
  const sideEffect = { collectionName: 'expenses', documentId: expense.id, payload: { companyId: 'qa', note: 'Cost sync' }, options: { merge: true } };
  const [merged] = mergeAtomicWrites([guarded], [sideEffect]);
  assert.deepEqual(merged.expectedDeliveryCashflow, guarded.expectedDeliveryCashflow);
  assert.equal(merged.payload.amount, 60000);
  assert.equal(merged.payload.note, 'Cost sync');
  const state = initial();
  state['expenses/exp'] = { ...expense, approvalStatus: 'approved', handoverStatus: 'confirmed' };
  const db = store(state);
  await assert.rejects(db.commit([reportWrite(), merged]), error => error.code === 'firestore/delivery-cashflow-conflict');
  assert.equal(db.sets.length, 0);
});

test('merge rejects conflicting guards and retains identical guards regardless of key order', () => {
  const guarded = expenseWrite();
  const same = { ...guarded, expectedDeliveryCashflow: Object.fromEntries(Object.entries(guarded.expectedDeliveryCashflow).reverse()) };
  assert.deepEqual(mergeAtomicWrites([], [guarded, same])[0].expectedDeliveryCashflow, guarded.expectedDeliveryCashflow);
  for (const expectedDeliveryCashflow of [{ ...guarded.expectedDeliveryCashflow, amount: 90000 }, undefined, null]) {
    assert.throws(() => mergeAtomicWrites([guarded], [{ ...guarded, expectedDeliveryCashflow }]), /metadata/);
  }
  const [merged] = mergeAtomicWrites(decorate([guarded]), [{ ...guarded, payload: { companyId: 'qa', note: 'Extra' } }]);
  assert.deepEqual(merged.deliveryCommand, marker);
  assert.throws(() => mergeAtomicWrites(decorate([guarded]), decorate([guarded], { ...marker, fingerprint: 'other' })), /Conflicting/);
});

test('command metadata has an exact schema and agrees across the whole batch and payloads', async () => {
  for (const invalid of [
    undefined, null, [], {}, { id: marker.id }, { ...marker, extra: true },
    { ...marker, id: '' }, { ...marker, id: 'bad/id' }, { ...marker, fingerprint: '' },
    { ...marker, fingerprint: 1 }, { ...marker, fingerprint: ' padded ' },
  ]) {
    const db = store(initial());
    await assert.rejects(db.commit([{ ...reportWrite(), deliveryCommand: invalid }]));
    assert.equal(db.transactions, 0);
  }
  for (const writes of [
    [decorate([reportWrite()])[0], paymentWrite()],
    [...decorate([reportWrite()]), ...decorate([paymentWrite()], { ...marker, id: 'another' })],
    decorate([reportWrite()]).map(write => ({ ...write, payload: { ...write.payload, lastDeliveryCommand: { ...marker, fingerprint: 'other' } } })),
    decorate([reportWrite()]).map(write => ({ ...write, payload: { ...write.payload, lastDeliveryCommand: { ...marker, extra: true } } })),
  ]) {
    const db = store(initial());
    await assert.rejects(db.commit(writes));
    assert.equal(db.transactions, 0);
  }
});

test('writer reads every command document and persists root marker if payload marker is omitted', async () => {
  const db = store(initial());
  const writes = [reportWrite(), paymentWrite()].map(write => ({ ...write, deliveryCommand: marker }));
  await db.commit(writes);
  assert.deepEqual(db.reads.sort(), writes.map(key).sort());
  for (const write of writes) assert.deepEqual(db.rows.get(key(write)).lastDeliveryCommand, marker);
});

test('lost-ack replay returns current documents without overwriting later approval or report edits', async () => {
  const db = store(initial());
  const writes = decorate([reportWrite(), paymentWrite(), expenseWrite()]);
  await db.commit(writes);
  await db.commit([
    { collectionName: 'payments', documentId: receipt.id, options: { merge: true },
      payload: { companyId: 'qa', approvalStatus: 'approved', handoverStatus: 'confirmed', approvedAt: 'later', amount: 570000 } },
    { collectionName: 'expenses', documentId: expense.id, options: { merge: true },
      payload: { companyId: 'qa', approvalStatus: 'approved', handoverStatus: 'confirmed', approvedAt: 'later' } },
    { ...reportWrite(), payload: { companyId: 'qa', note: 'Later report edit' } },
  ]);
  const before = structuredClone([...db.rows]);
  const setCount = db.sets.length;
  const result = await db.commit(structuredClone(writes));
  assert.equal(db.sets.length, setCount);
  assert.deepEqual([...db.rows], before);
  assert.equal(result.existingDocuments.length, writes.length);
  for (const write of result.existingDocuments) assert.deepEqual(write.payload, db.rows.get(key(write)));
});

test('partial command marker does not bypass CAS', async () => {
  for (const approved of [false, true]) {
    const state = initial();
    state['deliveryReports/r'].lastDeliveryCommand = marker;
    if (approved) state[`payments/${receipt.id}`] = { ...receipt, approvalStatus: 'approved', handoverStatus: 'confirmed' };
    const db = store(state);
    const writes = decorate([reportWrite(), paymentWrite()]);
    if (approved) {
      await assert.rejects(db.commit(writes), error => error.code === 'firestore/delivery-cashflow-conflict');
      assert.equal(db.sets.length, 0);
    } else {
      await db.commit(writes);
      assert.equal(db.sets.length, 2);
    }
  }
});

test('replay never skips missing documents, foreign tenants or conflicting saved metadata', async () => {
  for (const failure of ['missing', 'foreign', 'fingerprint', 'malformed']) {
    const db = store(initial());
    const writes = decorate([reportWrite(), paymentWrite()]);
    await db.commit(writes);
    const id = `payments/${receipt.id}`;
    if (failure === 'missing') db.rows.delete(id);
    if (failure === 'foreign') db.rows.set(id, { ...db.rows.get(id), companyId: 'foreign' });
    if (failure === 'fingerprint') db.rows.set(id, { ...db.rows.get(id), lastDeliveryCommand: { ...marker, fingerprint: 'other' } });
    if (failure === 'malformed') db.rows.set(id, { ...db.rows.get(id), lastDeliveryCommand: { ...marker, extra: true } });
    const before = structuredClone([...db.rows]);
    const setCount = db.sets.length;
    await assert.rejects(db.commit(writes));
    assert.equal(db.sets.length, setCount);
    assert.deepEqual([...db.rows], before);
  }
});

test('ifAbsent preserves finance state and stamps only participation for whole-command replay', async () => {
  const state = initial();
  state[`payments/${receipt.id}`] = { ...receipt, approvalStatus: 'approved', handoverStatus: 'confirmed', approvedAt: 'earlier' };
  const db = store(state);
  const writes = decorate([reportWrite(), { collectionName: 'payments', documentId: receipt.id, ifAbsent: true, payload: receipt }]);
  const result = await db.commit(writes);
  assert.equal(result.existingDocuments.length, 1);
  assert.deepEqual(db.rows.get(`payments/${receipt.id}`), { ...state[`payments/${receipt.id}`], lastDeliveryCommand: marker });
  assert.deepEqual(db.sets.find(write => write.id === `payments/${receipt.id}`).payload, { lastDeliveryCommand: marker });
  const setCount = db.sets.length;
  assert.equal((await db.commit(writes)).existingDocuments.length, 2);
  assert.equal(db.sets.length, setCount);
});

test('ifAbsent conflict fails before any report write or replay marker is staged', async () => {
  const db = store(initial());
  const writes = decorate([reportWrite(), {
    collectionName: 'payments', documentId: receipt.id, ifAbsent: true, payload: { ...receipt, amount: 600000 },
  }]);
  await assert.rejects(db.commit(writes), error => error.code === 'firestore/payment-command-conflict');
  assert.equal(db.sets.length, 0);
  assert.deepEqual([...db.rows], Object.entries(initial()));
});

test('ordinary ifAbsent and completed resolution skips retain their no-overwrite behavior', async () => {
  const db = store(initial());
  assert.equal((await db.commit([{ collectionName: 'payments', documentId: receipt.id, ifAbsent: true, payload: receipt }])).existingDocuments.length, 1);
  assert.equal(db.sets.length, 0);
  db.rows.set('deliveryReports/r', { companyId: 'qa', resolutionStatus: 'accepted', linkedOrderId: 'order' });
  db.rows.set('orders/order', { companyId: 'qa', note: 'Later order edit' });
  const result = await db.commit([
    { ...reportWrite(), resolveOnce: true, payload: { companyId: 'qa', resolutionStatus: 'accepted', linkedOrderId: 'order' } },
    { collectionName: 'orders', documentId: 'order', payload: { companyId: 'qa', note: 'Stale' }, options: { merge: true } },
  ]);
  assert.equal(result.existingDocuments.length, 2);
  assert.equal(db.sets.length, 0);
  assert.equal(db.rows.get('orders/order').note, 'Later order edit');
  assert.doesNotThrow(() => validateAtomicWrites([reportWrite()], 'qa'));
});
