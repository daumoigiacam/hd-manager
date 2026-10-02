const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildInventoryBalanceId,
  executeAtomicInventoryOperation,
} = require('../functions/inventoryTransactions');

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

class MemoryDocumentReference {
  constructor(store, collectionPath, id) {
    this.store = store;
    this.collectionPath = collectionPath;
    this.id = id;
    this.path = `${collectionPath}/${id}`;
  }
}

class MemorySnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = value !== undefined;
    this.value = clone(value);
  }

  data() {
    return clone(this.value);
  }
}

class MemoryFirestore {
  constructor() {
    this.records = new Map();
    this.queue = Promise.resolve();
  }

  collection(collectionPath) {
    return {
      doc: id => new MemoryDocumentReference(this, collectionPath, id),
    };
  }

  async runTransaction(callback) {
    const execute = async () => {
      const writes = [];
      const transaction = {
        get: async ref => new MemorySnapshot(ref, this.records.get(ref.path)),
        set: (ref, value, options = {}) => writes.push({ ref, value: clone(value), options }),
      };
      const result = await callback(transaction);
      writes.forEach(({ ref, value, options }) => {
        const current = this.records.get(ref.path) || {};
        this.records.set(ref.path, options.merge ? { ...current, ...value } : value);
      });
      return result;
    };
    const pending = this.queue.then(execute, execute);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  get(pathValue) {
    return clone(this.records.get(pathValue));
  }

  countCollection(collectionPath) {
    const prefix = `${collectionPath}/`;
    return [...this.records.keys()].filter(key => key.startsWith(prefix)).length;
  }
}

const FieldValue = { serverTimestamp: () => 'SERVER_TIMESTAMP' };
const collectionPath = (appId, name) => `artifacts/${appId}/public/data/${name}`;
const appId = 'phase4-test';
const claims = {
  uid: 'owner-1',
  accountType: 'employee',
  companyId: 'company-a',
  appUserId: 'owner-1',
  employeeId: 'owner-1',
  role: 'super_admin',
};

const command = ({
  type,
  key,
  quantity,
  companyClaims = claims,
  productId = 'product-a',
  warehouseId = 'warehouse-a',
  unit = 'con',
  document = {},
  relatedWrites = [],
}) => executeAtomicInventoryOperation({
  db: command.db,
  FieldValue,
  collectionPath,
  appId,
  claims: companyClaims,
  payload: {
    operationType: type,
    clientMutationId: key,
    collectionName: type === 'INBOUND' ? 'warehouseImports' : (type === 'COUNT' ? 'warehouseStockCounts' : 'warehouseDispatches'),
    documentId: `${type.toLowerCase()}_${companyClaims.companyId.replace(/[^A-Za-z0-9_-]/g, '_')}_${key}`,
    document: { note: key, ...document },
    movements: [{ warehouseId, productId, unit, quantity }],
    relatedWrites,
  },
});

const getBalance = (db, companyId = claims.companyId, movement = {}) => {
  const balanceId = buildInventoryBalanceId({
    companyId,
    warehouseId: movement.warehouseId || 'warehouse-a',
    productId: movement.productId || 'product-a',
    unit: movement.unit || 'con',
  });
  return db.get(`${collectionPath(appId, 'inventoryBalances')}/${balanceId}`);
};

const seedIdentity = (db, identityClaims = claims) => {
  db.records.set(`${collectionPath(appId, 'companies')}/${identityClaims.companyId}`, {
    id: identityClaims.companyId,
    companyId: identityClaims.companyId,
  });
  db.records.set(`${collectionPath(appId, 'employees')}/${identityClaims.appUserId}`, {
    id: identityClaims.appUserId,
    companyId: identityClaims.companyId,
    position: 'Chủ doanh nghiệp',
  });
};

const initializeStock = async (db, quantity = 100, suffix = 'base') => {
  command.db = db;
  seedIdentity(db);
  await command({ type: 'INBOUND', key: `warehouse-import-${suffix}`, quantity });
};

test('two concurrent outbound requests cannot oversell 100 units', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'two');

  const results = await Promise.allSettled([
    command({ type: 'OUTBOUND', key: 'warehouse-dispatch-user-a', quantity: 70 }),
    command({ type: 'OUTBOUND', key: 'warehouse-dispatch-user-b', quantity: 50 }),
  ]);
  const accepted = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'inventory_insufficient_stock');
  assert.ok(getBalance(db).availableQuantity >= 0);
  assert.ok([30, 50].includes(getBalance(db).availableQuantity));
});

for (const concurrentRequests of [2, 5, 10, 25, 50]) {
  test(`${concurrentRequests} concurrent requests preserve stock and ledger invariants`, async () => {
    const db = new MemoryFirestore();
    await initializeStock(db, 100, `matrix-${concurrentRequests}`);
    const quantity = concurrentRequests === 2 ? 60 : 7;
    const results = await Promise.allSettled(Array.from({ length: concurrentRequests }, (_, index) => (
      command({
        type: 'OUTBOUND',
        key: `warehouse-dispatch-matrix-${concurrentRequests}-${index}`,
        quantity,
      })
    )));
    const acceptedCount = results.filter(result => result.status === 'fulfilled').length;
    const rejectedCount = results.filter(result => result.status === 'rejected').length;
    const balance = getBalance(db);
    assert.equal(balance.availableQuantity, 100 - (acceptedCount * quantity));
    assert.ok(balance.availableQuantity >= 0);
    assert.ok((acceptedCount * quantity) <= 100);
    assert.equal(acceptedCount + rejectedCount, concurrentRequests);
    assert.equal(
      db.countCollection(collectionPath(appId, 'warehouseDispatches')),
      acceptedCount,
      'only accepted operations create outbound documents',
    );
    assert.equal(
      db.countCollection(collectionPath(appId, 'inventoryLedger')),
      acceptedCount + 1,
      'one inbound plus one immutable ledger row per accepted outbound',
    );
  });
}

test('three retries with one operation key deduct stock exactly once', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'retry');
  const run = () => command({ type: 'OUTBOUND', key: 'warehouse-dispatch-network-retry', quantity: 12 });
  const results = await Promise.all([run(), run(), run(), run()]);
  assert.equal(results.filter(result => result.duplicate).length, 3);
  assert.equal(getBalance(db).availableQuantity, 88);
  assert.equal(db.countCollection(collectionPath(appId, 'warehouseDispatches')), 1);
  assert.equal(db.countCollection(collectionPath(appId, 'inventoryOperations')), 2);
  assert.equal(db.countCollection(collectionPath(appId, 'inventoryLedger')), 2);
});

test('same idempotency key with different quantity is rejected', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'conflict');
  await command({ type: 'OUTBOUND', key: 'warehouse-dispatch-conflicting-retry', quantity: 12 });
  await assert.rejects(
    command({ type: 'OUTBOUND', key: 'warehouse-dispatch-conflicting-retry', quantity: 13 }),
    error => error.code === 'inventory_idempotency_conflict',
  );
  assert.equal(getBalance(db).availableQuantity, 88);
});

test('uninitialized outbound is rejected instead of creating negative stock', async () => {
  const db = new MemoryFirestore();
  command.db = db;
  seedIdentity(db);
  await assert.rejects(
    command({ type: 'OUTBOUND', key: 'warehouse-dispatch-no-balance', quantity: 1 }),
    error => error.code === 'inventory_balance_not_initialized',
  );
  assert.equal(db.countCollection(collectionPath(appId, 'warehouseDispatches')), 0);
});

test('tenant balances and operation keys are isolated', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'tenant-a');
  const companyBClaims = {
    ...claims,
    uid: 'owner-b',
    appUserId: 'owner-b',
    employeeId: 'owner-b',
    companyId: 'company-b',
  };
  seedIdentity(db, companyBClaims);
  command.db = db;
  await command({
    type: 'INBOUND',
    key: 'warehouse-import-tenant-b',
    quantity: 40,
    companyClaims: companyBClaims,
  });
  await Promise.all([
    command({ type: 'OUTBOUND', key: 'warehouse-dispatch-shared-key', quantity: 20 }),
    command({ type: 'OUTBOUND', key: 'warehouse-dispatch-shared-key', quantity: 15, companyClaims: companyBClaims }),
  ]);
  assert.equal(getBalance(db, 'company-a').availableQuantity, 80);
  assert.equal(getBalance(db, 'company-b').availableQuantity, 25);
});

test('employee without the configured inventory action is denied server-side', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'permission-denied');
  const salesClaims = {
    ...claims,
    uid: 'sales-1',
    appUserId: 'sales-1',
    employeeId: 'sales-1',
    role: 'sales',
  };
  db.records.set(`${collectionPath(appId, 'employees')}/${salesClaims.appUserId}`, {
    id: salesClaims.appUserId,
    companyId: salesClaims.companyId,
    position: 'Kinh doanh',
  });
  await assert.rejects(
    command({
      type: 'OUTBOUND',
      key: 'warehouse-dispatch-sales-denied',
      quantity: 1,
      companyClaims: salesClaims,
    }),
    error => error.code === 'inventory_permission_denied',
  );
  assert.equal(getBalance(db).availableQuantity, 100);
});

test('company role override can grant the exact inventory action', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'permission-override');
  const salesClaims = {
    ...claims,
    uid: 'sales-allowed',
    appUserId: 'sales-allowed',
    employeeId: 'sales-allowed',
    role: 'sales',
  };
  db.records.set(`${collectionPath(appId, 'companies')}/${claims.companyId}`, {
    id: claims.companyId,
    companyId: claims.companyId,
    rolePermissions: { sales: { warehouse_dispatch: true } },
    rolePermissionActions: {
      sales: {
        warehouse_dispatch: {
          create_warehouse_dispatch: true,
          create_dispatch_without_order_request: false,
        },
      },
    },
  });
  db.records.set(`${collectionPath(appId, 'employees')}/${salesClaims.appUserId}`, {
    id: salesClaims.appUserId,
    companyId: salesClaims.companyId,
    position: 'Kinh doanh',
  });
  await command({
    type: 'OUTBOUND',
    key: 'warehouse-dispatch-sales-allowed',
    quantity: 9,
    companyClaims: salesClaims,
    document: { sourceOrderRequestId: 'request-1' },
  });
  assert.equal(getBalance(db).availableQuantity, 91);
});

test('dispatch without an order request requires the additional server permission', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'outside-order-permission');
  const salesClaims = {
    ...claims,
    uid: 'sales-limited',
    appUserId: 'sales-limited',
    employeeId: 'sales-limited',
    role: 'sales',
  };
  db.records.set(`${collectionPath(appId, 'companies')}/${claims.companyId}`, {
    id: claims.companyId,
    companyId: claims.companyId,
    rolePermissionActions: {
      sales: {
        warehouse_dispatch: {
          create_warehouse_dispatch: true,
          create_dispatch_without_order_request: false,
        },
      },
    },
  });
  db.records.set(`${collectionPath(appId, 'employees')}/${salesClaims.appUserId}`, {
    id: salesClaims.appUserId,
    companyId: salesClaims.companyId,
    position: 'Kinh doanh',
  });

  await assert.rejects(
    command({
      type: 'OUTBOUND',
      key: 'warehouse-dispatch-outside-order-denied',
      quantity: 9,
      companyClaims: salesClaims,
    }),
    error => error.code === 'inventory_permission_denied',
  );
  assert.equal(getBalance(db).availableQuantity, 100);
});

test('Vietnamese warehouse position receives the default server permission', async () => {
  const db = new MemoryFirestore();
  await initializeStock(db, 100, 'vietnamese-warehouse-role');
  const warehouseClaims = {
    ...claims,
    uid: 'warehouse-user',
    appUserId: 'warehouse-user',
    employeeId: 'warehouse-user',
    role: 'employee',
  };
  db.records.set(`${collectionPath(appId, 'employees')}/warehouse-user`, {
    id: 'warehouse-user',
    companyId: claims.companyId,
    role: 'employee',
    position: 'Xuất kho',
  });

  const result = await command({
    type: 'OUTBOUND',
    key: 'warehouse-dispatch-vietnamese-role',
    quantity: 12,
    companyClaims: warehouseClaims,
  });

  assert.equal(result.success, true);
  assert.equal(result.duplicate, false);
  assert.equal(getBalance(db).availableQuantity, 88);
});

test('customer identities cannot submit inventory commands', async () => {
  const db = new MemoryFirestore();
  command.db = db;
  await assert.rejects(
    command({
      type: 'OUTBOUND',
      key: 'warehouse-dispatch-customer-denied',
      quantity: 1,
      companyClaims: {
        uid: 'customer-1',
        appUserId: 'customer-account-1',
        accountType: 'customer',
        companyId: claims.companyId,
      },
    }),
    error => error.code === 'inventory_employee_required',
  );
});

test('related expense must be bound to the current inbound document', async () => {
  const db = new MemoryFirestore();
  command.db = db;
  seedIdentity(db);
  await assert.rejects(
    command({
      type: 'INBOUND',
      key: 'warehouse-import-invalid-expense',
      quantity: 5,
      relatedWrites: [{
        collectionName: 'expenses',
        documentId: 'expense_unrelated',
        document: {
          amount: 100,
          sourceType: 'warehouse_import_purchase',
          sourceWarehouseImportId: 'another-document',
        },
      }],
    }),
    error => error.code === 'inventory_related_document_mismatch',
  );
  assert.equal(db.countCollection(collectionPath(appId, 'expenses')), 0);
});

test('an existing inbound expense cannot be overwritten when its operation record is missing', async () => {
  const db = new MemoryFirestore();
  command.db = db;
  seedIdentity(db);
  const key = 'warehouse-import-existing-expense';
  const documentId = `inbound_${claims.companyId.replace(/[^A-Za-z0-9_-]/g, '_')}_${key}`;
  const expenseId = `exp_warehouse_import_${documentId}`;
  db.records.set(`${collectionPath(appId, 'expenses')}/${expenseId}`, {
    id: expenseId,
    companyId: claims.companyId,
    amount: 999,
  });

  await assert.rejects(
    command({
      type: 'INBOUND',
      key,
      quantity: 5,
      relatedWrites: [{
        collectionName: 'expenses',
        documentId: expenseId,
        document: {
          amount: 100,
          sourceType: 'warehouse_import_purchase',
          sourceWarehouseImportId: documentId,
        },
      }],
    }),
    error => error.code === 'inventory_related_document_conflict',
  );
  assert.equal(db.get(`${collectionPath(appId, 'expenses')}/${expenseId}`).amount, 999);
});

test('client and rules route inventory creates through the server command', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
  const rulesSource = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const functionsSource = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  assert.match(appSource, /commitAtomicInventoryOperation\(\{/);
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf('const handleAddWarehouseDispatch'), appSource.indexOf('const handleEditWarehouseDispatch')),
    /enqueuePendingFirebaseWrite/,
  );
  assert.match(rulesSource, /isServerManagedInventoryCollection/);
  assert.match(functionsSource, /exports\.inventoryAtomicOperation/);
});
