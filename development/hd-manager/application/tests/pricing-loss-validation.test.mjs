import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {assertPricingLossStandards} from '../src/utils/pricingLossValidation.js';

const code = 'pricing_invalid_loss_standard';
test('loss standards accept boundary weights, decimal commas and inferred legacy loss without mutation', () => {
  for (const stage of [
    {inputWeight: 0, outputWeight: 0, lossWeight: 0},
    {inputWeight: 1, outputWeight: 1, lossWeight: 0},
    {inputWeight: 1, outputWeight: 0, lossWeight: 1},
    {inputWeight: '1,5', outputWeight: '0,54', lossWeight: '0,96'},
    {inputWeight: 3, outputWeight: 2.65},
  ]) {
    const rules = {lossStages: [stage]}, before = structuredClone(rules);
    assert.equal(assertPricingLossStandards(rules), rules);
    assert.deepEqual(rules, before);
  }
});

test('loss standards reject negative, nonfinite and out-of-range dimensions in every group', () => {
  for (const patch of [
    {inputWeight: -1}, {outputWeight: -0.01}, {lossWeight: -0.01},
    {outputWeight: 1.001}, {lossWeight: 1.001},
    ...['inputWeight', 'outputWeight', 'lossWeight'].flatMap(field => [NaN, Infinity, -Infinity, 'bad'].map(value => ({[field]: value}))),
  ]) {
    const rules = {lossStageGroups: {duck: [{inputWeight: 1, outputWeight: 1, lossWeight: 0}],
      chicken: [{name: 'Invalid row', inputWeight: 1, outputWeight: 0.8, lossWeight: 0.2, ...patch}]}};
    assert.throws(() => assertPricingLossStandards(rules), error => error.code === code && /Invalid row.*chicken/.test(error.message));
  }
});

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const tree = parse(source, {sourceType: 'module', plugins: ['jsx']});
let parentSubmit;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'handleSavePricingRules'
    && node.init?.params[0]?.left?.name === 'rulesData') parentSubmit = node.init;
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit);
    else if (value?.type) visit(value);
  }
}
visit(tree);
assert.ok(parentSubmit, 'Extract the actual parent persistence handler');
test('actual parent rejects invalid direct payloads before writing and preserves tenant metadata on valid save', async () => {
  const writes = [];
  const env = {firebaseUser: {uid: 'user'}, myCompanyId: 'tenant', employeeInfo: {id: 'employee'}, currentUser: null,
    assertPricingLossStandards, saveDataDocument: async (...args) => {writes.push(args); return {queued: false};}};
  const save = Function(...Object.keys(env), `return (${source.slice(parentSubmit.start, parentSubmit.end)})`)(...Object.values(env));
  await assert.rejects(save({lossStages: [{inputWeight: 1, outputWeight: 0, lossWeight: 2}]}), {code});
  assert.equal(writes.length, 0);
  const receipt = await save({lossStages: [{inputWeight: 1, outputWeight: 0.04, lossWeight: 0.96}]});
  assert.deepEqual(receipt, {id: 'pricing_engine_rules', queued: false});
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'pricingRules');
  assert.equal(writes[0][2].companyId, 'tenant');
  assert.equal(writes[0][2].updatedByEmpId, 'employee');
  assert.deepEqual(writes[0][3], {merge: true});
});

test('actual friendly-error helper exposes only the exact pricing guard code ahead of generic redaction', () => {
  const shared = fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx', import.meta.url), 'utf8');
  const sharedTree = parse(shared, {sourceType: 'module', plugins: ['jsx']});
  const declaration = sharedTree.program.body.find(node => node.type === 'VariableDeclaration'
    && node.declarations.some(item => item.id.name === 'getFriendlyFirebaseErrorMessage'));
  const init = declaration.declarations[0].init;
  const env = {isFirestoreInternalAssertionError: () => false, isFirebaseQuotaError: () => false,
    isFirebasePermissionError: () => false, isTimeoutLikeError: () => false};
  const friendly = Function(...Object.keys(env), `return (${shared.slice(init.start, init.end)})`)(...Object.values(env));
  const message = 'Định mức cần chỉnh lại. '.repeat(25);
  assert.equal(friendly({code, message}, 'fallback'), message);
  assert.equal(friendly({code: `${code}_other`, message}, 'fallback'), 'fallback');
});
