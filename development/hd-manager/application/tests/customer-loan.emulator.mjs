import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import {
  commitCustomerLoan, prepareCustomerLoanCreate, prepareCustomerLoanEdit,
  customerLoanFingerprint, validateCustomerLoanState,
} from '../src/utils/customerLoanIntegrity.js';

// Never inherit a project or silently fall back to a hosted Firestore endpoint.
const configuredHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8185';
if (!/^(?:127\.0\.0\.1|localhost):8185$/.test(configuredHost)) throw new Error('Only the loopback Firestore emulator on port 8185 is allowed');
const host = '127.0.0.1', port = 8185;
const projectId = `demo-loan-integrity-${process.pid}`;
if (!/^demo-loan-integrity-\d+$/.test(projectId)) throw new Error('An isolated demo loan project is required');
process.env.FIRESTORE_EMULATOR_HOST = `${host}:${port}`;
const rules = fs.readFileSync(new URL('../../../../firestore.rules', import.meta.url), 'utf8');
console.log(`FENCE emulator=${host}:${port} project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);

const env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules } });
const companyId = 'loan-company-a', foreignCompanyId = 'loan-company-b', appId = 'loan-integrity-only';
const day = '2026-11-21', now = `${day}T00:00:00.000Z`;
const context = (uid, tenant = companyId) => env.authenticatedContext(uid, {
  companyId: tenant, appUserId: uid, identityId: `identity-${uid}`, accountType: 'employee', role: 'owner',
}).firestore();
const clientA = context('loan-owner-a'), clientB = context('loan-owner-b');
const foreign = context('loan-owner-foreign', foreignCompanyId);
const ref = (store, collection, id) => doc(store, 'artifacts', appId, 'public', 'data', collection, id);
const digest = intent => createHash('sha256').update(customerLoanFingerprint(intent)).digest('hex');
const read = async id => (await getDoc(ref(clientA, 'customerLoans', id))).data();
let passed = 0;

function apply(store, intent, { tenant = companyId, employeeId = 'loan-owner-a', transaction, onSet } = {}) {
  return commitCustomerLoan({ intent, fingerprint: digest(intent), companyId: tenant, employeeId, now,
    customerName: 'Isolated loan customer',
    reference: ref(store, 'customerLoans', intent.id), customerReference: ref(store, 'customers', intent.customerId),
    transaction: transaction || (callback => runTransaction(store, tx => callback({
      get: reference => tx.get(reference),
      set: (reference, payload, options) => { onSet?.(); return tx.set(reference, payload, options); },
    }))),
  });
}
async function createLoan(mutationId, fields = {}) {
  const intent = prepareCustomerLoanCreate('customer-a', {
    productName: 'Isolated Rổ QA', quantity: 10, weightKg: 0, unit: 'Cái', loanDate: day,
    dueDate: '', note: '', ...fields, clientMutationId: mutationId,
  });
  const result = await apply(clientA, intent);
  assert.equal(result.duplicate, false);
  return result.loan;
}
const returnIntent = (base, id, quantity, weightKg = 0) => prepareCustomerLoanEdit(base.id, {
  clientMutationId: id,
  returns: [...(base.returns || []), { id: `clr_${id}`, quantity, weightKg, returnDate: day,
    note: 'Emulator return', createdAt: now, createdByEmpId: 'loan-owner-a' }],
}, base);

try {
  // clearFirestore is scoped by the explicitly generated demo project above.
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await Promise.all([
      setDoc(ref(store, 'companies', companyId), { id: companyId, name: 'Isolated loan company A' }),
      setDoc(ref(store, 'companies', foreignCompanyId), { id: foreignCompanyId, name: 'Isolated loan company B' }),
      setDoc(ref(store, 'customers', 'customer-a'), { id: 'customer-a', companyId, name: 'Isolated loan customer', isArchived: false }),
      ...['loan-owner-a', 'loan-owner-b', 'loan-owner-foreign'].map(id => setDoc(ref(store, 'employees', id), {
        id, companyId: id === 'loan-owner-foreign' ? foreignCompanyId : companyId, position: 'Chủ doanh nghiệp',
      })),
    ]);
  });

  await test('concurrent real return clients from one snapshot allow one commit and reject the stale client', { timeout: 30000 }, async () => {
    const base = await createLoan('concurrent');
    const intents = [returnIntent(base, 'concurrent-a', 6), returnIntent(base, 'concurrent-b', 6)];
    const results = await Promise.allSettled([
      apply(clientA, intents[0]), apply(clientB, intents[1], { employeeId: 'loan-owner-b' }),
    ]);
    const accepted = results.filter(result => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'customer-loan/conflict');
    const saved = await read(base.id);
    assert.equal(saved.returns.length, 1);
    assert.equal(saved.returns[0].quantity, 6);
    assert.equal(validateCustomerLoanState(saved).returnedQuantity, 6);
    assert.equal(saved.status, 'open');
    passed++;
  });

  await test('lost-ack replay of the same return preserves a later real return without writing again', { timeout: 30000 }, async () => {
    const base = await createLoan('replay');
    const first = returnIntent(base, 'replay-first', 4);
    await assert.rejects(apply(clientA, first, { transaction: async callback => {
      await runTransaction(clientA, callback);
      throw new Error('Simulated acknowledgement loss after the actual commit');
    } }), /acknowledgement loss/);
    const afterFirst = await read(base.id);
    assert.equal(afterFirst.returns.length, 1);
    assert.equal(afterFirst.returns[0].quantity, 4);
    await apply(clientB, returnIntent(afterFirst, 'replay-later', 2), { employeeId: 'loan-owner-b' });
    const beforeReplay = await read(base.id);
    let replaySets = 0;
    const replay = await apply(clientA, first, { onSet: () => replaySets++ });
    assert.equal(replay.duplicate, true);
    assert.equal(replaySets, 0);
    assert.deepEqual(await read(base.id), beforeReplay);
    assert.deepEqual(replay.loan, beforeReplay);
    assert.equal(beforeReplay.returns.length, 2);
    assert.equal(validateCustomerLoanState(beforeReplay).returnedQuantity, 6);
    passed++;
  });

  await test('over-return in qty or kg and an untracked dimension fail before any transaction write', { timeout: 30000 }, async () => {
    const qtyOnly = await createLoan('over-qty');
    const dual = await createLoan('over-kg', { weightKg: 5 });
    let transactions = 0, sets = 0;
    for (const [base, quantity, weight] of [[qtyOnly, 11, 0], [qtyOnly, 1, 1], [dual, 1, 6]]) {
      const before = await read(base.id);
      const attempt = async () => {
        const intent = returnIntent(base, 'invalid-return', quantity, weight);
        return apply(clientA, intent, { transaction: callback => { transactions++; return runTransaction(clientA, callback); }, onSet: () => sets++ });
      };
      await assert.rejects(attempt(), error => error.code === 'customer-loan/invalid');
      assert.deepEqual(await read(base.id), before);
    }
    assert.equal(transactions, 0);
    assert.equal(sets, 0);
    passed++;
  });

  await test('tenant mismatch is denied by unchanged root Rules and by the actual loan transaction', { timeout: 30000 }, async () => {
    const base = await createLoan('tenant');
    const intent = returnIntent(base, 'foreign-return', 1);
    const before = await read(base.id);
    await assert.rejects(apply(foreign, intent, { tenant: foreignCompanyId, employeeId: 'loan-owner-foreign' }),
      error => error.code === 'permission-denied');
    await assertFails(getDoc(ref(foreign, 'customerLoans', base.id)));
    await assertFails(runTransaction(foreign, async tx => {
      tx.set(ref(foreign, 'customerLoans', base.id), { note: 'Forbidden cross-tenant update' }, { merge: true });
    }));
    // A forged caller scope also fails when the authenticated reader can read A.
    await assert.rejects(apply(clientA, intent, { tenant: foreignCompanyId }), error => error.code === 'permission-denied');
    assert.deepEqual(await read(base.id), before);
    passed++;
  });
} finally {
  await env.cleanup();
  console.log(`RESULT project=${projectId} emulator=${host}:${port} checksPassed=${passed}/4`);
}
