import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertMasterDispatchPayload, assertMasterUiCrudContext, buildMasterUiCrudFixtures, exerciseMasterEmulatorUiCrud }
  from '../scripts/helpers/master-emulator-ui-crud.mjs';

const runId = 'a'.repeat(32);
// Pure guard fixtures only; they are never used as passing Auth/UI regression evidence.
function context() {
  const app = { options: { projectId: 'demo-hd-manager-local' } };
  return { page: { url: () => 'http://127.0.0.1:5214/' }, owner: { app,
    auth: { app, emulatorConfig: { host: '127.0.0.1', port: 9199, protocol: 'http' }, currentUser: {} },
    db: { app, _getSettings: () => ({ host: '127.0.0.1:8185', ssl: false }) },
    claims: { companyId: 'synthetic-company', appUserId: 'synthetic-owner', accountType: 'employee', role: 'super_admin' } } };
}

test('Deterministic fresh local fixture IDs and count/weight billing expectations', () => {
  const fixture = buildMasterUiCrudFixtures(runId, 'synthetic-company', 'synthetic-owner');
  assert.equal(fixture.uiCustomerId, `ui-${runId}-0`);
  assert.equal(fixture.probeProductId, `probe-${runId}-0`);
  assert.equal(fixture.importId, `wi_master_crud_${runId}`);
  assert.equal(fixture.product.stockQuantity, 10);
  assert.equal(fixture.product.sellingPrice, 25000);
  assert.match(fixture.customer.phone, /^08\d{8}$/);
  assert.equal(fixture.dispatch.quantity, 2);
  assert.equal(fixture.dispatch.quantityUnit, 'Con');
  assert.deepEqual(fixture.dispatch.weightEntries, [1.25, 2.5]);
  assert.equal(fixture.dispatch.weightKg, 3.75);
  assert.equal(fixture.dispatch.billingQuantity, 3.75);
  assert.equal(fixture.dispatch.billingUnit, 'Kg');
  assert.equal(fixture.dispatch.amount, 37500);
  assert.deepEqual(buildMasterUiCrudFixtures(runId, 'synthetic-company', 'synthetic-owner'), fixture);
});

test('Fixture scope rejects arbitrary IDs, traversal, invalid tenant and employee', () => {
  for (const id of ['other-run', 'A'.repeat(32), '../private', '', 'a'.repeat(33)]) {
    assert.throws(() => buildMasterUiCrudFixtures(id, 'synthetic-company', 'synthetic-owner'), /crud-invalid-run-id/);
  }
  assert.throws(() => buildMasterUiCrudFixtures(runId, '../company', 'owner'), /crud-invalid-company/);
  assert.throws(() => buildMasterUiCrudFixtures(runId, 'company', 'foreign/owner'), /crud-invalid-employee/);
});

test('Pure guard requires exact demo project, actual Auth/Firestore ports and same SDK app', () => {
  assertMasterUiCrudContext(context());
  for (const mutate of [
    ctx => { ctx.page.url = () => 'https://app.hdconnect.net/'; },
    ctx => { ctx.page.url = () => 'http://127.0.0.1:5213/'; },
    ctx => { ctx.owner.app.options.projectId = 'hd-manager-c5839'; },
    ctx => { ctx.owner.auth.emulatorConfig.port = 9099; },
    ctx => { ctx.owner.auth.emulatorConfig.host = 'localhost'; },
    ctx => { ctx.owner.db._getSettings = () => ({ host: '127.0.0.1:8180', ssl: false }); },
    ctx => { ctx.owner.db._getSettings = () => ({ host: 'firestore.googleapis.com', ssl: true }); },
    ctx => { ctx.owner.db.app = { options: { projectId: 'demo-hd-manager-local' } }; },
    ctx => { ctx.owner.auth.currentUser = null; },
    ctx => { ctx.owner.claims.role = 'employee'; },
    ctx => { ctx.owner.claims.accountType = 'customer'; },
  ]) {
    const ctx = context();
    mutate(ctx);
    assert.throws(() => assertMasterUiCrudContext(ctx), /crud-/);
  }
});

test('Foreign target is rejected before invoking any supplied SDK/UI/check callback', async () => {
  const ctx = context();
  ctx.owner.app.options.projectId = 'production';
  let calls = 0;
  const forbidden = () => { calls++; throw new Error('must-not-run'); };
  await assert.rejects(exerciseMasterEmulatorUiCrud({ ...ctx, runId, nav: {},
    firestore: { setDoc: forbidden }, ref: forbidden, read: forbidden, check: forbidden }), /crud-foreign-project/);
  assert.equal(calls, 0);
});

test('Dispatch payload guard retains exact tenant, quantities, weights, billing, attribution and entries', () => {
  const expected = buildMasterUiCrudFixtures(runId, 'synthetic-company', 'synthetic-owner').dispatch;
  const valid = { ...expected, id: 'wd_123_abcd', clientMutationId: 'wd_synthetic_123',
    createdAt: '2026-10-03T01:00:00.000Z', updatedAt: '2026-10-03T01:00:00.000Z' };
  assertMasterDispatchPayload(valid, expected);
  for (const [key, value] of [['companyId', 'foreign-tenant'], ['customerId', 'foreign-customer'], ['productId', 'foreign-product'],
    ['empId', 'foreign-employee'], ['quantity', 3], ['quantityCount', 3], ['pieceCount', 3], ['weightKg', 4],
    ['actualWeightKg', 4], ['billingQuantity', 2], ['billingUnit', 'Con'], ['unitPrice', 1], ['amount', 1],
    ['billingSnapshotValid', false], ['weightEntries', [3.75]], ['isArchived', true]]) {
    assert.throws(() => assertMasterDispatchPayload({ ...valid, [key]: value }, expected));
  }
  assert.throws(() => assertMasterDispatchPayload({ ...valid, id: 'unrelated' }, expected), /crud-invalid-dispatch-id/);
  assert.throws(() => assertMasterDispatchPayload({ ...valid, createdAt: 'invalid' }, expected), /crud-invalid-createdAt/);
});

test('Prepared source uses genuine UI controls and server reads, without browser launch, identity injection or admin bypass', async () => {
  const source = await readFile(new URL('../scripts/helpers/master-emulator-ui-crud.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|spawn|execSync|launch|addInitScript|evaluate|setCustomUserClaims|authenticatedContext)\s*\(/);
  assert.doesNotMatch(source, /firebase-admin|inventoryAtomicOperation|inventoryBalances|route\.fulfill/);
  assert.match(source, /getDocsFromServer\(query\)/);
  assert.match(source, /read\(owner, collection, id\)/);
  assert.match(source, /getIdTokenResult\(true\)/);
  assert.match(source, /document\.firestore === owner.db/);
  assert.match(source, /const deadline = Date.now\(\) \+ 180000/);
  assert.match(source, /page.reload/);
  assert.match(source, /name: 'Lưu và thêm mới'/);
  assert.match(source, /name: 'Nhập các lần cân kg'/);
  assert.match(source, /name: 'Lần cân 1'/);
  assert.match(source, /name: 'Lần cân 2'/);
  assert.match(source, /name: 'Lưu khách hàng'/);
  assert.match(source, /name: 'Tạo sản phẩm'/);
  assert.match(source, /dialog.getByLabel\(label, \{ exact: true \}\)/);
  assert.match(source, /crud-product-field-type/);
  assert.match(source, /scope: 'LEGACY_DIRECT_FIRESTORE_SDK'/);
  assert.match(source, /previous.size === 0/);
  assert.match(source, /crud-more-than-one-dispatch/);
  assert.match(source, /await waitFor\(async \(\) =>.*customerSearch.inputValue/s);
  assert.match(source, /openModule\('warehouse_dispatch', 'Xuất kho', true\)/);
});
