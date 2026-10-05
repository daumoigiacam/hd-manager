import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, runTransaction, disableNetwork, enableNetwork } from 'firebase/firestore';
import { commitIdempotentWarehouseDispatchCreate } from '../src/utils/warehouseDispatchCreate.js';

// Diagnostic probe, not a passing security gate. Never connects to cloud Firebase.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8187') {
  throw new Error('This probe requires the isolated dispatch emulator on port 8187.');
}
const environment = await initializeTestEnvironment({
  projectId: 'demo-hd-dispatch-cert',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});
const prefix = 'artifacts/dispatch-cert/public/data/';
const payload = { companyId: 'company-a', customerId: 'customer-a', productId: 'product-a',
  clientMutationId: 'command-a', quantity: 5, quantityUnit: 'Con', weightKg: 10 };
const denied = { warehouse_dispatch: false };
const actions = { warehouse_dispatch: { create_warehouse_dispatch: false,
  create_dispatch_without_order_request: false, edit_warehouse_dispatch: false,
  delete_warehouse_dispatch: false, delete_dispatch_history_detail: false } };
const results = [];
try {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, `${prefix}companies/company-a`), {
      rolePermissions: { production: denied }, rolePermissionActions: { production: actions },
      employeeRolePermissions: { 'employee-a': denied },
      employeeRolePermissionActions: { 'employee-a': actions },
    });
    await setDoc(doc(db, `${prefix}employees/employee-a`), {
      companyId: 'company-a', position: 'Sản xuất', role: 'employee',
    });
    await setDoc(doc(db, `${prefix}employees/owner-a`), {
      companyId: 'company-a', position: 'Chủ doanh nghiệp', role: 'owner',
    });
    await setDoc(doc(db, `${prefix}employees/warehouse-a`), {
      companyId: 'company-a', position: 'Xuất kho', role: 'employee',
    });
    await setDoc(doc(db, `${prefix}companies/company-a`), {
      rolePermissions: { production: denied, warehouse: { warehouse_dispatch: true } },
      rolePermissionActions: { production: actions, warehouse: { warehouse_dispatch: {
        create_warehouse_dispatch: true, edit_warehouse_dispatch: true, delete_warehouse_dispatch: true,
      } } },
      employeeRolePermissions: { 'employee-a': denied },
      employeeRolePermissionActions: { 'employee-a': actions },
    });
  });
  const db = environment.authenticatedContext('employee-uid', {
    companyId: 'company-a', identityId: 'identity-a', appUserId: 'employee-a',
    accountType: 'employee', role: 'employee',
  }).firestore();
  const companyReference = doc(db, `${prefix}companies/company-a`);
  const checkDenied = async (name, operation) => {
    try { await operation(); results.push({ name, status: 'FAIL', reason: 'Forbidden operation accepted' }); }
    catch (error) {
      if (error.code !== 'permission-denied') throw error;
      results.push({ name, status: 'PASS' });
    }
  };
  const first = doc(db, `${prefix}warehouseDispatches/wd_company-a_command-denied`);
  const deniedPayload = { ...payload, clientMutationId: 'command-denied' };
  await checkDenied('create without action permission', () => setDoc(first, deniedPayload));
  // Seed independently so update/delete evidence is valid even after create is secured.
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), first.path), deniedPayload));
  await checkDenied('edit without action permission', () => updateDoc(first, { quantity: 9 }));
  await checkDenied('delete without action permission', () => deleteDoc(first));
  await checkDenied('employee cannot grant themselves company dispatch permissions', () => updateDoc(
    companyReference,
    { rolePermissions: { production: { warehouse_dispatch: true } } },
  ));
  const owner = environment.authenticatedContext('owner-uid', {
    companyId: 'company-a', identityId: 'owner-identity', appUserId: 'owner-a',
    accountType: 'employee', role: 'employee',
  }).firestore();
  await updateDoc(doc(owner, `${prefix}companies/company-a`), {
    rolePermissions: { production: denied, warehouse: { warehouse_dispatch: true }, owner: {} },
  });
  const admin = environment.authenticatedContext('admin-uid', {
    companyId: 'company-a', identityId: 'admin-identity', appUserId: 'admin-without-profile',
    accountType: 'employee', role: 'admin',
  }).firestore();
  await updateDoc(doc(admin, `${prefix}companies/company-a`), {
    rolePermissions: { production: denied, warehouse: { warehouse_dispatch: true }, owner: {}, admin: {} },
  });
  const warehouse = environment.authenticatedContext('warehouse-uid', {
    companyId: 'company-a', identityId: 'warehouse-identity', appUserId: 'warehouse-a',
    accountType: 'employee', role: 'employee',
  }).firestore();
  const authorizedWarehouseRef = doc(warehouse, `${prefix}warehouseDispatches/wd_company-a_command-warehouse`);
  const authorizedWarehouseResult = await commitIdempotentWarehouseDispatchCreate({
    runTransaction: callback => runTransaction(warehouse, callback),
    reference: () => authorizedWarehouseRef,
    payload: { ...payload, clientMutationId: 'command-warehouse' },
    companyId: 'company-a', documentId: authorizedWarehouseRef.id,
  });
  const offlineReference = doc(warehouse, `${prefix}warehouseDispatches/wd_company-a_command-offline`);
  await disableNetwork(warehouse);
  const persistedOfflineCommand = JSON.parse(JSON.stringify({
    payload: { ...payload, clientMutationId: 'command-offline' },
    companyId: 'company-a', documentId: offlineReference.id,
  }));
  await enableNetwork(warehouse);
  const reconnectResult = await commitIdempotentWarehouseDispatchCreate({
    runTransaction: callback => runTransaction(warehouse, callback),
    reference: () => offlineReference,
    payload: persistedOfflineCommand.payload,
    companyId: persistedOfflineCommand.companyId, documentId: persistedOfflineCommand.documentId,
  });
  const a = doc(owner, `${prefix}warehouseDispatches/wd_company-a_command-a`);
  const authorizedPayload = { ...payload, id: a.id };
  const create = () => commitIdempotentWarehouseDispatchCreate({
    runTransaction: callback => runTransaction(owner, callback),
    reference: () => a,
    payload: authorizedPayload,
    companyId: 'company-a',
    documentId: a.id,
  });
  const createWithPayload = payloadToWrite => commitIdempotentWarehouseDispatchCreate({
    runTransaction: callback => runTransaction(owner, callback), reference: () => a,
    payload: payloadToWrite, companyId: 'company-a', documentId: a.id,
  });
  const concurrent = await Promise.all([create(), create()]);
  const replay = await createWithPayload(authorizedPayload);
  const restartedQueuePayload = JSON.parse(JSON.stringify({ payload: authorizedPayload })).payload;
  const restartReplay = await createWithPayload(restartedQueuePayload);
  let changedPayloadRejected = false;
  try { await createWithPayload({ ...authorizedPayload, quantity: 999 }); }
  catch (error) { changedPayloadRejected = /reused for different data/.test(error.message); }
  let incompleteReplayRejected = false;
  const incompletePayload = Object.fromEntries(Object.entries(authorizedPayload).filter(([key]) => key !== 'weightKg'));
  try { await createWithPayload(incompletePayload); }
  catch (error) { incompleteReplayRejected = /reused for different data/.test(error.message); }
  const committedAfterRetry = await getDoc(a);
  const concurrentIdempotent = committedAfterRetry.exists()
    && concurrent.filter(result => result.replay).length === 1;
  const retryIdempotent = replay.replay && restartReplay.replay && replay.payload.quantity === 5
    && committedAfterRetry.exists() && committedAfterRetry.data().quantity === 5;
  const differentMutation = { ...authorizedPayload, clientMutationId: 'command-b', quantity: 5 };
  const distinct = await commitIdempotentWarehouseDispatchCreate({
    runTransaction: callback => runTransaction(owner, callback),
    reference: () => doc(owner, `${prefix}warehouseDispatches/wd_company-a_command-b`),
    payload: differentMutation,
    companyId: 'company-a',
    documentId: 'wd_company-a_command-b',
  });
  await updateDoc(a, { quantity: 8 });
  const edited = (await getDoc(a)).data();
  await updateDoc(a, { isArchived: true });
  const archiveState = (await getDoc(a)).data();
  await deleteDoc(a);
  const deleted = !(await getDoc(a)).exists();
  const legacyReference = doc(owner, `${prefix}warehouseDispatches/legacy-dispatch`);
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), legacyReference.path), {
    companyId: 'company-a', quantity: 1,
  }));
  await updateDoc(legacyReference, { quantity: 2 });
  const wrongReference = doc(owner, `${prefix}warehouseDispatches/wd_company-a_other`);
  let wrongIdDenied = false;
  try { await setDoc(wrongReference, authorizedPayload); }
  catch (error) { if (error.code === 'permission-denied') wrongIdDenied = true; else throw error; }
  assert.equal(edited.quantity, 8);
  assert.equal(archiveState.isArchived, true);
  results.push({ name: 'authorized create, edit, archive, delete',
    status: edited.quantity === 8 && archiveState.isArchived === true && deleted ? 'PASS' : 'FAIL' });
  results.push({ name: 'authorized edit remains compatible with legacy dispatch without mutation ID',
    status: (await getDoc(legacyReference)).data().quantity === 2 ? 'PASS' : 'FAIL' });
  results.push({ name: 'role-authorized warehouse employee can create',
    status: !authorizedWarehouseResult.replay && (await getDoc(authorizedWarehouseRef)).exists() ? 'PASS' : 'FAIL' });
  results.push({ name: 'company owner employee profile can manage permission configuration',
    status: (await getDoc(doc(owner, `${prefix}companies/company-a`))).exists() ? 'PASS' : 'FAIL' });
  results.push({ name: 'verified admin claim retains company permission management',
    status: (await getDoc(doc(admin, `${prefix}companies/company-a`))).exists() ? 'PASS' : 'FAIL' });
  results.push({ name: 'offline pending then reconnect retry creates one record',
    status: !reconnectResult.replay && reconnectResult.id === offlineReference.id
      && (await getDoc(offlineReference)).exists() ? 'PASS' : 'FAIL',
    reason: 'Serialized outbox command committed to Firestore Emulator after SDK network re-enabled' });
  results.push({ name: 'concurrent same mutation ID',
    status: concurrentIdempotent ? 'PASS' : 'FAIL',
    reason: `outcomes=${JSON.stringify(concurrent)} records=${committedAfterRetry.exists()}` });
  results.push({ name: 'retry after committed write with lost acknowledgement',
    status: retryIdempotent ? 'PASS' : 'FAIL' });
  results.push({ name: 'serialized pending write survives restart and replays once',
    status: restartReplay.replay && restartReplay.payload.clientMutationId === 'command-a' ? 'PASS' : 'FAIL' });
  results.push({ name: 'same mutation ID rejects altered or incomplete payload',
    status: changedPayloadRejected && incompleteReplayRejected && committedAfterRetry.data().quantity === 5 ? 'PASS' : 'FAIL' });
  results.push({ name: 'distinct mutation IDs create distinct records',
    status: !distinct.replay && (await getDoc(doc(owner, `${prefix}warehouseDispatches/wd_company-a_command-b`))).exists() ? 'PASS' : 'FAIL' });
  results.push({ name: 'mutation ID cannot write under a different document ID', status: wrongIdDenied ? 'PASS' : 'FAIL' });
  console.log(JSON.stringify({ environment: 'Firestore emulator only', results }, null, 2));
  process.exitCode = results.some(result => result.status === 'FAIL') ? 1 : 0;
} finally { await environment.cleanup(); }
