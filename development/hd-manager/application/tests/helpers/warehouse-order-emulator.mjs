import fs from 'node:fs';
import {parse} from '@babel/parser';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDocs, collection, runTransaction} from 'firebase/firestore';
import {getWarehouseDispatchIds, findDuplicateWarehouseDispatchIds, isWarehouseDispatchAlreadyLinked, resolveOrderCreationDateKey} from '../../src/utils/warehouseDispatchOrders.js';

const source = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const nodes = new Map();
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name && node.init) nodes.set(node.id.name, node.init);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
}
visit(parse(source, {sourceType: 'module', plugins: ['jsx']}));
const actual = (name, bindings = {}) => {
  const node = nodes.get(name);
  if (!node) throw Error('Missing canonical handler: ' + name);
  return Function(...Object.keys(bindings), 'return (' + source.slice(node.start, node.end) + ')')(...Object.values(bindings));
};

// Actual canonical creation handler + real Firestore transactions and Rules.
// Notifications/share/loyalty side effects are deliberately disabled in this
// isolated fixture. No production identity or connection is accepted.
export async function createWarehouseOrderEmulator({projectId = 'demo-dispatch-order-' + process.pid} = {}) {
  const endpoint = new URL('http://' + (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8285'));
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || !projectId.startsWith('demo-')) throw Error('Loopback demo Emulator required');
  const environment = await initializeTestEnvironment({projectId, firestore: {host: endpoint.hostname, port: Number(endpoint.port), rules: fs.readFileSync(new URL('../../../../../firestore.rules', import.meta.url), 'utf8')}});
  const appId = 'warehouse-reconciliation-qa', companyId = 'qa-a';
  const document = (db, name, id) => doc(db, 'artifacts', appId, 'public', 'data', name, id);
  const db = environment.authenticatedContext('owner-a', {companyId, appUserId: 'owner-a', identityId: 'identity-owner-a', accountType: 'employee', role: 'owner'}).firestore();
  let localOrders = [], localDispatches = [];
  const customer = {id: 'qa-customer', companyId, name: 'Khách kiểm thử cách ly', empId: 'owner-a'};
  const create = () => actual('handleAddOrder', {
    getWarehouseDispatchIds, findDuplicateWarehouseDispatchIds, isWarehouseDispatchAlreadyLinked, resolveOrderCreationDateKey,
    rawOrders: localOrders, customers: [customer], products: [], payments: [], isVpsStagingMode: false,
    myCompanyId: companyId, firebaseUser: {uid: 'owner-a'}, currentCompany: {id: companyId}, currentUser: {id: 'owner-a', name: 'QA Owner'},
    orderCreateInFlightRef: {current: new Set()}, getTodayString: () => '2026-11-21',
    buildOrderDuplicateSignature: actual('buildOrderDuplicateSignature'), buildStableHash: actual('buildStableHash'),
    buildDateTimeFromDateKey: date => date + 'T09:00:00.000Z', getDateKeyFromDateTime: date => date.slice(0,10),
    parseLooseMoneyValue: value => Number(value) || 0, CASHFLOW_APPROVAL_STATUS: {approved: 'approved'}, capitalizeFirst: String,
    db, appId, doc, runTransaction, sanitizeFirestoreWritePayload: value => JSON.parse(JSON.stringify(value)),
    notifyFirestoreDocumentChanged() {}, queueActivityAuditLog() {}, scheduleCollectionRefresh() {},
    setRawOrders: updater => {localOrders = updater(localOrders);}, setRawWarehouseDispatches: updater => {localDispatches = updater(localDispatches);},
    rememberRecentLocalWrite() {}, applyLocalCollectionWrite() {}, scheduleOrderShareWarmup() {}, handleEnsureOrderPayosPayment() {},
    syncCustomerLoyaltyPoints: async () => {}, setRealtimeStatus() {}, getFriendlyFirebaseErrorMessage: error => error.message,
  });
  const seed = async (count = 46) => {
    await environment.clearFirestore(); localOrders = [];
    localDispatches = Array.from({length: count}, (_,n) => ({id: 'dispatch-' + n, companyId, customerId: customer.id, productId: 'qa-product', quantity: 10, weightKg: 16.2, isArchived: false, date: '2026-11-20'}));
    await environment.withSecurityRulesDisabled(async context => {
      const store = context.firestore();
      await setDoc(document(store, 'companies', companyId), {id: companyId, name: 'Công ty kiểm thử cách ly'});
      await setDoc(document(store, 'employees', 'owner-a'), {id: 'owner-a', companyId, position: 'Chủ doanh nghiệp'});
      await Promise.all(localDispatches.map(row => setDoc(document(store, 'warehouseDispatches', row.id), row)));
    });
    return localDispatches.map((row,n) => ({localId: 'draft-' + n, customerId: customer.id, salesEmpId: 'owner-a', sourceType: 'warehouse_dispatch', sourceDispatchDate: '2026-11-20', sourceDispatchIds: [row.id], date: '2026-11-20', amount: 680400, items: [{productId: 'qa-product', productName: 'Vịt kiểm thử', quantity: 10, actualWeightKg: 16.2, weightKg: 16.2, billingUnit: 'Kg', billingQuantity: 16.2, unitPrice: 42000, amount: 680400}]}));
  };
  const snapshot = async () => {
    let result;
    await environment.withSecurityRulesDisabled(async context => {
      const store = context.firestore();
      const rows = async name => (await getDocs(collection(store, 'artifacts', appId, 'public', 'data', name))).docs.map(item => ({...item.data(), id: item.id}));
      result = {orders: await rows('orders'), dispatches: await rows('warehouseDispatches')};
    });
    return result;
  };
  const patchDispatch = (id, patch) => environment.withSecurityRulesDisabled(context => setDoc(document(context.firestore(), 'warehouseDispatches', id), patch, {merge: true}));
  return {seed, create, snapshot, patchDispatch, cleanup: () => environment.cleanup(), projectId};
}
