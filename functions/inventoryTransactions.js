const crypto = require('crypto');

const INVENTORY_OPERATION_TYPES = Object.freeze({
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
  COUNT: 'COUNT',
});

const INVENTORY_DOCUMENT_COLLECTIONS = Object.freeze({
  [INVENTORY_OPERATION_TYPES.INBOUND]: 'warehouseImports',
  [INVENTORY_OPERATION_TYPES.OUTBOUND]: 'warehouseDispatches',
  [INVENTORY_OPERATION_TYPES.COUNT]: 'warehouseStockCounts',
});

const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;
const MAX_MOVEMENTS_PER_OPERATION = 12;
const MAX_RELATED_WRITES = 5;
const ALLOWED_RELATED_COLLECTIONS = new Set(['expenses']);
const QUANTITY_PRECISION = 1_000_000;
const OWNER_ROLES = new Set([
  'owner',
  'super_admin',
  'company_owner',
  'business_owner',
]);

const DEFAULT_INVENTORY_ACTIONS = Object.freeze({
  accounting: Object.freeze({
    create_warehouse_import: true,
    create_actual_inventory_stock: true,
    create_warehouse_dispatch: true,
    create_dispatch_without_order_request: true,
  }),
  warehouse: Object.freeze({
    create_warehouse_import: true,
    create_actual_inventory_stock: true,
    create_warehouse_dispatch: true,
    create_dispatch_without_order_request: true,
  }),
});

const createInventoryError = (code, message, statusCode = 400, details = null) => Object.assign(
  new Error(message),
  { code, statusCode, details },
);

const normalizeText = (value = '') => `${value || ''}`.trim();

const normalizeComparableText = (value = '') => normalizeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const normalizeKeyPart = (value = '') => normalizeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

const hasOwn = (value, key) => Boolean(
  value
  && typeof value === 'object'
  && Object.prototype.hasOwnProperty.call(value, key)
);

const normalizeRoleKey = ({ claims = {}, employee = {} } = {}) => {
  const claimRole = normalizeComparableText(claims.role);
  const employeeRole = normalizeComparableText(employee.role);
  const position = normalizeComparableText(employee.position);
  if (OWNER_ROLES.has(claimRole) || OWNER_ROLES.has(employeeRole) || position === 'chu doanh nghiep') {
    return 'owner';
  }
  if (position === 'ke toan & nhan su' || ['accounting', 'accountant'].includes(claimRole)) return 'accounting';
  if (position === 'xuat kho' || position === 'thu kho' || claimRole === 'warehouse') return 'warehouse';
  if (position.includes('kinh doanh') || claimRole === 'sales') return 'sales';
  if (position === 'tai xe' || claimRole === 'driver') return 'driver';
  return 'production';
};

const getInventoryPermissionTarget = (operationType, document = {}) => {
  if (operationType === INVENTORY_OPERATION_TYPES.INBOUND) {
    return { moduleId: 'warehouse_import', actionIds: ['create_warehouse_import'] };
  }
  if (operationType === INVENTORY_OPERATION_TYPES.COUNT) {
    return { moduleId: 'warehouse_import', actionIds: ['create_actual_inventory_stock'] };
  }
  const sourceOrderRequestId = normalizeText(
    document.sourceOrderRequestId || document.orderRequestId || document.requestId,
  );
  const isWithoutOrderRequest = document.sourceOrderRequestMissing === true || !sourceOrderRequestId;
  return {
    moduleId: 'warehouse_dispatch',
    actionIds: [
      'create_warehouse_dispatch',
      ...(isWithoutOrderRequest ? ['create_dispatch_without_order_request'] : []),
    ],
  };
};

const getInventoryPermissionDecision = ({
  claims = {}, company = {}, employee = {}, operationType = '', document = {},
} = {}) => {
  const employeeId = normalizeText(claims.appUserId);
  const companyId = normalizeText(claims.companyId);
  if (!employeeId || !companyId || normalizeText(employee.id) !== employeeId || normalizeText(employee.companyId) !== companyId) {
    return { allowed: false, reason: 'employee_tenant_mismatch' };
  }

  const roleKey = normalizeRoleKey({ claims, employee });
  if (roleKey === 'owner') return { allowed: true, roleKey, source: 'owner' };

  const { moduleId, actionIds } = getInventoryPermissionTarget(operationType, document);
  const hasEmployeeOverride = hasOwn(company.employeeRolePermissions, employeeId);
  const modulePermissions = hasEmployeeOverride
    ? (company.employeeRolePermissions?.[employeeId] || {})
    : (company.rolePermissions?.[roleKey] || {});
  const actionPermissions = hasEmployeeOverride
    ? (company.employeeRolePermissionActions?.[employeeId]?.[moduleId] || {})
    : (company.rolePermissionActions?.[roleKey]?.[moduleId] || {});
  const defaultActions = DEFAULT_INVENTORY_ACTIONS[roleKey] || {};

  const actionAllowed = actionIds.every((actionId) => {
    if (hasOwn(actionPermissions, actionId)) return Boolean(actionPermissions[actionId]);
    if (hasOwn(modulePermissions, moduleId) && !modulePermissions[moduleId]) return false;
    return Boolean(defaultActions[actionId]);
  });
  return {
    allowed: actionAllowed,
    roleKey,
    source: hasEmployeeOverride ? 'employee_override' : 'role_policy',
    moduleId,
    actionIds,
  };
};

const normalizeQuantity = (value) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return NaN;
  return Math.round(quantity * QUANTITY_PRECISION) / QUANTITY_PRECISION;
};

const hashValue = (value) => crypto.createHash('sha256').update(`${value}`).digest('hex');

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
};

const stripVolatileRequestFields = (value) => {
  if (Array.isArray(value)) return value.map(stripVolatileRequestFields);
  if (!value || typeof value !== 'object') return value;
  const volatileFields = new Set([
    'createdAt',
    'updatedAt',
    'inventoryCommittedAt',
    'inventoryCommittedByEmployeeId',
  ]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !volatileFields.has(key))
    .map(([key, fieldValue]) => [key, stripVolatileRequestFields(fieldValue)]));
};

const buildInventoryBalanceId = ({ companyId, warehouseId, productId, unit }) => (
  `ib_${hashValue([
    normalizeText(companyId),
    normalizeText(warehouseId),
    normalizeText(productId),
    normalizeKeyPart(unit),
  ].map(value => JSON.stringify(value)).join('|')).slice(0, 48)}`
);

const buildInventoryOperationId = (companyId, clientMutationId) => (
  `iop_${hashValue(`${normalizeText(companyId)}|${normalizeText(clientMutationId)}`).slice(0, 48)}`
);

const buildInventoryLedgerId = (operationId, movementIndex) => (
  `ile_${hashValue(`${operationId}|${movementIndex}`).slice(0, 48)}`
);

const normalizeInventoryMovements = (movements = []) => {
  if (!Array.isArray(movements) || movements.length < 1 || movements.length > MAX_MOVEMENTS_PER_OPERATION) {
    throw createInventoryError(
      'inventory_movements_invalid',
      `Nghiệp vụ tồn kho phải có từ 1 đến ${MAX_MOVEMENTS_PER_OPERATION} dòng hợp lệ.`,
    );
  }

  const merged = new Map();
  movements.forEach((movement = {}) => {
    const warehouseId = normalizeText(movement.warehouseId);
    const productId = normalizeText(movement.productId || movement.productKey);
    const unit = normalizeKeyPart(movement.unit || movement.quantityUnit);
    const quantity = normalizeQuantity(movement.quantity);
    if (!warehouseId || !productId || !unit || !Number.isFinite(quantity) || quantity < 0) {
      throw createInventoryError(
        'inventory_movement_invalid',
        'Mỗi dòng tồn kho phải có kho, sản phẩm, đơn vị và số lượng không âm.',
      );
    }
    const key = JSON.stringify([warehouseId, productId, unit]);
    const current = merged.get(key) || { warehouseId, productId, unit, quantity: 0 };
    current.quantity = normalizeQuantity(current.quantity + quantity);
    merged.set(key, current);
  });

  return Array.from(merged.values()).filter(movement => movement.quantity > 0);
};

const normalizeInventoryCommand = ({ claims = {}, payload = {} } = {}) => {
  const companyId = normalizeText(claims.companyId);
  const accountType = normalizeText(claims.accountType).toLowerCase();
  if (!companyId || accountType !== 'employee' || !normalizeText(claims.appUserId)) {
    throw createInventoryError(
      'inventory_employee_required',
      'Chỉ tài khoản nhân sự thuộc công ty mới được ghi nghiệp vụ tồn kho.',
      403,
    );
  }

  const operationType = normalizeText(payload.operationType).toUpperCase();
  if (!Object.values(INVENTORY_OPERATION_TYPES).includes(operationType)) {
    throw createInventoryError('inventory_operation_type_invalid', 'Loại nghiệp vụ tồn kho không hợp lệ.');
  }

  const clientMutationId = normalizeText(payload.clientMutationId);
  if (!OPERATION_ID_PATTERN.test(clientMutationId)) {
    throw createInventoryError('inventory_idempotency_key_invalid', 'Mã chống ghi trùng không hợp lệ.');
  }

  const documentId = normalizeText(payload.documentId);
  if (!/^[A-Za-z0-9_-]{8,180}$/.test(documentId)) {
    throw createInventoryError('inventory_document_id_invalid', 'Mã chứng từ tồn kho không hợp lệ.');
  }

  const expectedCollection = INVENTORY_DOCUMENT_COLLECTIONS[operationType];
  const collectionName = normalizeText(payload.collectionName || expectedCollection);
  if (collectionName !== expectedCollection) {
    throw createInventoryError('inventory_collection_invalid', 'Collection chứng từ không khớp loại nghiệp vụ.');
  }

  const document = payload.document && typeof payload.document === 'object' && !Array.isArray(payload.document)
    ? { ...payload.document }
    : {};
  if (document.companyId && normalizeText(document.companyId) !== companyId) {
    throw createInventoryError('inventory_tenant_mismatch', 'Chứng từ không thuộc công ty đang đăng nhập.', 403);
  }

  const movements = normalizeInventoryMovements(payload.movements);
  if (movements.length < 1) {
    throw createInventoryError('inventory_movements_empty', 'Không có số lượng tồn kho cần ghi nhận.');
  }

  const employeeId = normalizeText(claims.appUserId);
  const relatedWrites = (Array.isArray(payload.relatedWrites) ? payload.relatedWrites : []).map((write = {}) => {
    const relatedCollectionName = normalizeText(write.collectionName);
    const relatedDocumentId = normalizeText(write.documentId);
    const relatedDocument = write.document && typeof write.document === 'object' && !Array.isArray(write.document)
      ? { ...write.document }
      : {};
    if (!ALLOWED_RELATED_COLLECTIONS.has(relatedCollectionName)) {
      throw createInventoryError('inventory_related_collection_invalid', 'Collection liên quan không được phép ghi cùng tồn kho.');
    }
    if (operationType !== INVENTORY_OPERATION_TYPES.INBOUND) {
      throw createInventoryError('inventory_related_operation_invalid', 'Chỉ nghiệp vụ nhập kho được phép tạo chi phí liên quan.');
    }
    if (!/^[A-Za-z0-9_-]{8,180}$/.test(relatedDocumentId)) {
      throw createInventoryError('inventory_related_document_invalid', 'Mã chứng từ liên quan không hợp lệ.');
    }
    if (relatedDocument.companyId && normalizeText(relatedDocument.companyId) !== companyId) {
      throw createInventoryError('inventory_tenant_mismatch', 'Chứng từ liên quan không thuộc công ty hiện tại.', 403);
    }
    const expectedExpenseId = `exp_warehouse_import_${documentId}`;
    const relatedAmount = Number(relatedDocument.amount);
    if (
      relatedDocumentId !== expectedExpenseId
      || normalizeText(relatedDocument.sourceWarehouseImportId) !== documentId
      || normalizeText(relatedDocument.sourceType) !== 'warehouse_import_purchase'
      || !Number.isFinite(relatedAmount)
      || relatedAmount <= 0
    ) {
      throw createInventoryError(
        'inventory_related_document_mismatch',
        'Chi phí liên quan phải khớp chính xác với phiếu nhập kho hiện tại.',
      );
    }
    return {
      collectionName: relatedCollectionName,
      documentId: relatedDocumentId,
      document: { ...relatedDocument, id: relatedDocumentId, companyId },
      merge: false,
    };
  });
  if (relatedWrites.length > MAX_RELATED_WRITES) {
    throw createInventoryError('inventory_related_writes_limit', 'Nghiệp vụ có quá nhiều chứng từ liên quan.');
  }
  const operationId = buildInventoryOperationId(companyId, clientMutationId);
  const requestHash = hashValue(stableJson({
    companyId,
    operationType,
    clientMutationId,
    documentId,
    collectionName,
    movements,
    document: stripVolatileRequestFields(document),
    relatedWrites: stripVolatileRequestFields(relatedWrites),
  }));

  return {
    companyId,
    employeeId,
    operationType,
    clientMutationId,
    operationId,
    requestHash,
    documentId,
    collectionName,
    document: {
      ...document,
      id: documentId,
      companyId,
      clientMutationId,
      inventoryOperationId: operationId,
      inventoryOperationVersion: 1,
    },
    movements,
    relatedWrites,
  };
};

const executeAtomicInventoryOperation = async ({
  db,
  FieldValue,
  collectionPath,
  appId,
  claims,
  payload,
}) => {
  if (!db?.runTransaction || typeof collectionPath !== 'function') {
    throw new Error('Atomic inventory dependencies are not configured.');
  }

  const command = normalizeInventoryCommand({ claims, payload });
  const operationRef = db.collection(collectionPath(appId, 'inventoryOperations')).doc(command.operationId);
  const documentRef = db.collection(collectionPath(appId, command.collectionName)).doc(command.documentId);
  const companyRef = db.collection(collectionPath(appId, 'companies')).doc(command.companyId);
  const employeeRef = db.collection(collectionPath(appId, 'employees')).doc(command.employeeId);
  const balanceRefs = command.movements.map(movement => db
    .collection(collectionPath(appId, 'inventoryBalances'))
    .doc(buildInventoryBalanceId({ companyId: command.companyId, ...movement })));
  const relatedRefs = command.relatedWrites.map(write => db
    .collection(collectionPath(appId, write.collectionName))
    .doc(write.documentId));
  let transactionAttempts = 0;

  return db.runTransaction(async (transaction) => {
    transactionAttempts += 1;
    const operationSnapshot = await transaction.get(operationRef);
    if (operationSnapshot.exists) {
      const existing = operationSnapshot.data() || {};
      if (existing.companyId !== command.companyId || existing.requestHash !== command.requestHash) {
        throw createInventoryError(
          'inventory_idempotency_conflict',
          'Mã thao tác đã được sử dụng cho một nghiệp vụ tồn kho khác.',
          409,
        );
      }
      return {
        success: true,
        duplicate: true,
        operationId: command.operationId,
        documentId: existing.documentId || command.documentId,
        balances: existing.balances || [],
        transactionAttempts,
      };
    }

    const [documentSnapshot, companySnapshot, employeeSnapshot, ...relatedSnapshots] = await Promise.all([
      transaction.get(documentRef),
      transaction.get(companyRef),
      transaction.get(employeeRef),
      ...relatedRefs.map(ref => transaction.get(ref)),
    ]);
    if (!companySnapshot.exists || !employeeSnapshot.exists) {
      throw createInventoryError(
        'inventory_identity_not_found',
        'Không tìm thấy công ty hoặc hồ sơ nhân sự để xác minh quyền tồn kho.',
        403,
      );
    }
    const permissionDecision = getInventoryPermissionDecision({
      claims,
      company: companySnapshot.data() || {},
      employee: { id: employeeSnapshot.id, ...(employeeSnapshot.data() || {}) },
      operationType: command.operationType,
      document: command.document,
    });
    if (!permissionDecision.allowed) {
      throw createInventoryError(
        'inventory_permission_denied',
        'Tài khoản chưa được cấp quyền thực hiện nghiệp vụ tồn kho này.',
        403,
        permissionDecision,
      );
    }
    if (documentSnapshot.exists) {
      const existingDocument = documentSnapshot.data() || {};
      if (
        existingDocument.companyId === command.companyId
        && existingDocument.clientMutationId === command.clientMutationId
      ) {
        throw createInventoryError(
          'inventory_operation_record_missing',
          'Chứng từ đã tồn tại nhưng thiếu bản ghi idempotency. Cần đối soát trước khi thử lại.',
          409,
        );
      }
      throw createInventoryError('inventory_document_conflict', 'Mã chứng từ đã tồn tại.', 409);
    }
    if (relatedSnapshots.some(snapshot => snapshot.exists)) {
      throw createInventoryError(
        'inventory_related_document_conflict',
        'Chi phí của phiếu nhập đã tồn tại nhưng thiếu bản ghi idempotency. Cần đối soát trước khi thử lại.',
        409,
      );
    }

    const balanceSnapshots = await Promise.all(balanceRefs.map(ref => transaction.get(ref)));
    const nowValue = FieldValue?.serverTimestamp ? FieldValue.serverTimestamp() : new Date().toISOString();
    const balanceResults = [];

    command.movements.forEach((movement, index) => {
      const balanceSnapshot = balanceSnapshots[index];
      const existing = balanceSnapshot.exists ? (balanceSnapshot.data() || {}) : null;
      if (!existing && command.operationType === INVENTORY_OPERATION_TYPES.OUTBOUND) {
        throw createInventoryError(
          'inventory_balance_not_initialized',
          `Tồn kho chưa được khởi tạo cho ${movement.productId} (${movement.unit}). Hãy nhập kho hoặc kiểm kho trước.`,
          409,
          movement,
        );
      }
      if (existing?.companyId && existing.companyId !== command.companyId) {
        throw createInventoryError('inventory_tenant_mismatch', 'Balance tồn kho không thuộc công ty hiện tại.', 403);
      }

      const before = existing ? normalizeQuantity(existing.availableQuantity) : 0;
      if ((existing && typeof existing.availableQuantity !== 'number') || !Number.isFinite(before) || before < 0) {
        throw createInventoryError('inventory_balance_invalid', 'Inventory balance requires reconciliation.', 409);
      }
      let after = before;
      if (command.operationType === INVENTORY_OPERATION_TYPES.INBOUND) {
        after = normalizeQuantity(before + movement.quantity);
      } else if (command.operationType === INVENTORY_OPERATION_TYPES.OUTBOUND) {
        after = normalizeQuantity(before - movement.quantity);
        if (after < 0) {
          throw createInventoryError(
            'inventory_insufficient_stock',
            `Tồn kho không đủ cho ${movement.productId} (${movement.unit}).`,
            409,
            { ...movement, availableQuantity: before },
          );
        }
      } else {
        after = movement.quantity;
      }

      const balance = {
        id: balanceRefs[index].id,
        companyId: command.companyId,
        warehouseId: movement.warehouseId,
        productId: movement.productId,
        unit: movement.unit,
        availableQuantity: after,
        revision: Number(existing?.revision || 0) + 1,
        lastOperationId: command.operationId,
        updatedAt: nowValue,
      };
      transaction.set(balanceRefs[index], balance, { merge: true });

      const ledgerId = buildInventoryLedgerId(command.operationId, index);
      const ledgerRef = db.collection(collectionPath(appId, 'inventoryLedger')).doc(ledgerId);
      transaction.set(ledgerRef, {
        id: ledgerId,
        companyId: command.companyId,
        operationId: command.operationId,
        clientMutationId: command.clientMutationId,
        operationType: command.operationType,
        documentId: command.documentId,
        collectionName: command.collectionName,
        warehouseId: movement.warehouseId,
        productId: movement.productId,
        unit: movement.unit,
        quantity: movement.quantity,
        beforeQuantity: before,
        afterQuantity: after,
        sequence: balance.revision,
        createdAt: nowValue,
      }, { merge: false });
      balanceResults.push({
        balanceId: balanceRefs[index].id,
        warehouseId: movement.warehouseId,
        productId: movement.productId,
        unit: movement.unit,
        beforeQuantity: before,
        afterQuantity: after,
      });
    });

    command.relatedWrites.forEach((write) => {
      const relatedRef = db.collection(collectionPath(appId, write.collectionName)).doc(write.documentId);
      transaction.set(relatedRef, write.document, { merge: write.merge });
    });

    transaction.set(documentRef, {
      ...command.document,
      inventoryMovements: command.movements,
      inventoryCommittedAt: nowValue,
      inventoryCommittedByEmployeeId: command.employeeId,
    }, { merge: false });
    transaction.set(operationRef, {
      id: command.operationId,
      companyId: command.companyId,
      clientMutationId: command.clientMutationId,
      requestHash: command.requestHash,
      operationType: command.operationType,
      documentId: command.documentId,
      collectionName: command.collectionName,
      status: 'COMMITTED',
      balances: balanceResults,
      createdAt: nowValue,
      createdByEmployeeId: command.employeeId,
    }, { merge: false });

    transaction.set(db.collection(collectionPath(appId, 'activityLogs')).doc(`audit_${command.operationId}`), {
      id: `audit_${command.operationId}`,
      companyId: command.companyId,
      actor: command.employeeId,
      action: 'INVENTORY_COMMITTED',
      operationId: command.operationId,
      clientMutationId: command.clientMutationId,
      entityType: command.collectionName,
      entityId: command.documentId,
      operationType: command.operationType,
      createdAt: nowValue,
    });

    return {
      success: true,
      duplicate: false,
      operationId: command.operationId,
      documentId: command.documentId,
      balances: balanceResults,
      transactionAttempts,
    };
  });
};

module.exports = {
  INVENTORY_OPERATION_TYPES,
  buildInventoryBalanceId,
  buildInventoryLedgerId,
  buildInventoryOperationId,
  createInventoryError,
  executeAtomicInventoryOperation,
  getInventoryPermissionDecision,
  normalizeInventoryCommand,
  normalizeInventoryMovements,
};
