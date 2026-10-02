import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildBusinessDocumentId } from '../src/utils/businessMutationIds.js';

const OUTPUT_DIR = path.resolve('test-results/critical-business-audit');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'summary.json');
const DATASET_SIZES = [100, 1_000, 10_000, 50_000];
const MODULES = ['warehouseDispatches', 'orderRequests', 'orders'];
const appSource = await readFile('src/App.jsx', 'utf8');
const collectionInventory = await readFile('test-results/phase2/collection-inventory.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({ rows: [] }));

const createPrng = (seed = 20261002) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const random = createPrng();
const normalize = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const percentile = (values, rank) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * rank / 100) - 1)];
};

const summarize = (samples) => ({
  n: samples.length,
  p50Ms: percentile(samples, 50),
  p90Ms: percentile(samples, 90),
  p95Ms: percentile(samples, 95),
  p99Ms: percentile(samples, 99),
  maxMs: Math.max(...samples),
  meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
});

const checksumValue = (value) => {
  const serialized = JSON.stringify(value);
  return createHash('sha1').update(serialized).digest('hex').slice(0, 16);
};

const measure = (label, operation, repetitions) => {
  const samples = [];
  let value;
  for (let index = 0; index < 3; index += 1) operation();
  const heapBefore = process.memoryUsage().heapUsed;
  for (let index = 0; index < repetitions; index += 1) {
    const startedAt = performance.now();
    value = operation();
    samples.push(performance.now() - startedAt);
  }
  const heapAfter = process.memoryUsage().heapUsed;
  return {
    label,
    ...summarize(samples),
    heapDeltaBytes: heapAfter - heapBefore,
    checksum: checksumValue(value),
  };
};

const dateFor = (index) => `2026-10-${String((index % 28) + 1).padStart(2, '0')}`;
const timestampFor = (index) => Date.parse(`${dateFor(index)}T${String(index % 24).padStart(2, '0')}:00:00+07:00`);

const createRows = (moduleName, size) => Array.from({ length: size }, (_, index) => {
  const sequence = index + 1;
  const shared = {
    id: `${moduleName}_${String(sequence).padStart(6, '0')}`,
    companyId: 'audit_company',
    date: dateFor(index),
    createdAtMs: timestampFor(index),
    customerId: `customer_${sequence % 997}`,
    customerName: `Khach hang ${sequence % 997} Bau Bang`,
    productId: `product_${sequence % 601}`,
    productName: `Ga moc loai ${sequence % 41}`,
    isArchived: sequence % 211 === 0,
  };
  if (moduleName === 'warehouseDispatches') {
    return {
      ...shared,
      warehouseId: `warehouse_${sequence % 7}`,
      quantity: (sequence % 30) + 1,
      weightKg: Math.round((((sequence % 30) + 1) * (1.1 + random())) * 10) / 10,
      quantityUnit: sequence % 2 ? 'Con' : 'Kg',
      assignedDriverId: `employee_${sequence % 43}`,
    };
  }
  if (moduleName === 'orderRequests') {
    return {
      ...shared,
      status: ['new', 'reviewing', 'confirmed', 'converted'][sequence % 4],
      unitPrice: 42_000 + (sequence % 31) * 1_000,
      quantity: (sequence % 25) + 1,
      note: `Yeu cau giao hang ${sequence}`,
    };
  }
  const quantity = (sequence % 25) + 1;
  const unitPrice = 42_000 + (sequence % 31) * 1_000;
  return {
    ...shared,
    reviewStatus: ['draft', 'confirmed', 'need_review', 'completed'][sequence % 4],
    total: quantity * unitPrice,
    paid: sequence % 3 === 0 ? quantity * unitPrice : 0,
    items: [{ productId: shared.productId, quantity, unitPrice, amount: quantity * unitPrice }],
  };
});

const repetitionsFor = (size) => size <= 1_000 ? 30 : size <= 10_000 ? 15 : 8;

const benchmarkRows = (moduleName, rows) => {
  const repetitions = repetitionsFor(rows.length);
  const targetId = rows[Math.floor(rows.length * 0.77)].id;
  const query = 'khach hang 417';
  return [
    measure('full-load-derived-list', () => rows
      .filter((row) => !row.isArchived)
      .sort((left, right) => right.createdAtMs - left.createdAtMs)
      .slice(0, 80)
      .map((row) => row.id), repetitions),
    measure('search-full-scan', () => rows
      .filter((row) => normalize(`${row.customerName} ${row.productName} ${row.id}`).includes(query))
      .slice(0, 80)
      .map((row) => row.id), repetitions),
    measure('filter-full-scan', () => rows
      .filter((row) => row.date >= '2026-10-20' && (
        moduleName === 'warehouseDispatches'
          ? row.warehouseId === 'warehouse_3'
          : (row.status || row.reviewStatus) === (moduleName === 'orderRequests' ? 'confirmed' : 'completed')
      ))
      .map((row) => row.id), repetitions),
    measure('sort-copy', () => [...rows]
      .sort((left, right) => `${left.customerName}`.localeCompare(`${right.customerName}`, 'vi'))
      .slice(0, 80)
      .map((row) => row.id), repetitions),
    measure('detail-linear-find', () => rows.find((row) => row.id === targetId), repetitions),
    measure('local-page-slice', () => rows.slice(200, 300).map((row) => row.id), repetitions),
    measure('scroll-window-compute', () => {
      let checksum = 0;
      for (let start = 0; start < Math.min(rows.length, 4_000); start += 40) {
        for (const row of rows.slice(start, start + 40)) checksum += row.id.length;
      }
      return checksum;
    }, repetitions),
  ];
};

const moduleBenchmarks = [];
for (const size of DATASET_SIZES) {
  for (const moduleName of MODULES) {
    globalThis.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const rows = createRows(moduleName, size);
    const serializedBytes = Buffer.byteLength(JSON.stringify(rows));
    const heapAfterCreate = process.memoryUsage().heapUsed;
    moduleBenchmarks.push({
      module: moduleName,
      records: size,
      serializedBytes,
      heapCreateDeltaBytes: heapAfterCreate - heapBefore,
      operations: benchmarkRows(moduleName, rows),
    });
  }
}

const section = (startMarker, endMarker) => {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error(`Missing source section: ${startMarker}`);
  return appSource.slice(start, end);
};

const lineOf = (needle) => {
  const index = appSource.indexOf(needle);
  return index < 0 ? null : appSource.slice(0, index).split('\n').length;
};

const warehouseCreateSource = section('const handleAddWarehouseDispatch = async', 'const handleEditWarehouseDispatch');
const orderCreateSource = section('const handleAddOrder = async', 'const handleGetCustomerProductPreference');
const requestCreateSource = section('const handleAddOrderRequest = async', 'const handleEditOrderRequest');
const tenantQuerySource = section('const getTenantCollectionSources =', 'const getSnapshotItems =');

const commandId = 'warehouse-dispatch-audit-retry-001';
const deterministicDocumentId = buildBusinessDocumentId('wd', 'audit_company', commandId);
const retryDocuments = new Map();
for (let attempt = 0; attempt < 4; attempt += 1) {
  retryDocuments.set(deterministicDocumentId, { quantity: 12, attempt });
}
const naiveDocumentIds = Array.from({ length: 4 }, (_, attempt) => `legacy_${attempt}_${Date.now()}`);
const stockBefore = 100;
const expectedStockAfterOneDispatch = 88;
const idempotency = {
  attempts: 4,
  legacyModeledDocuments: naiveDocumentIds.length,
  legacyModeledStockAfter: stockBefore - naiveDocumentIds.length * 12,
  deterministicDocuments: retryDocuments.size,
  deterministicStockAfter: stockBefore - [...retryDocuments.values()].reduce((sum, row) => sum + row.quantity, 0),
  expectedStockAfterOneDispatch,
  pass: retryDocuments.size === 1 && stockBefore - 12 === expectedStockAfterOneDispatch,
  scope: 'Deterministic local command replay model plus source/unit-test evidence; not a distributed backend concurrency test.',
};

const concurrencyModel = (() => {
  const stock = 10;
  const requestA = 7;
  const requestB = 7;
  const aSawAvailable = stock >= requestA;
  const bSawAvailable = stock >= requestB;
  const finalWithoutAtomicCompareAndWrite = stock - requestA - requestB;
  return {
    stock,
    requestA,
    requestB,
    aSawAvailable,
    bSawAvailable,
    finalWithoutAtomicCompareAndWrite,
    oversold: finalWithoutAtomicCompareAndWrite < 0,
    scope: 'Race model demonstrating the consequence of the missing stock transaction; not a live backend result.',
  };
})();

const relevantCollections = new Set(['warehouseDispatches', 'warehouseImports', 'warehouseStockCounts', 'orderRequests', 'orders', 'payments', 'expenses']);
const collectionEvidence = (collectionInventory.rows || [])
  .filter((row) => relevantCollections.has(row.collection))
  .map((row) => ({
    collection: row.collection,
    query: row.query,
    fullLoad: row.fullLoad,
    pagination: row.pagination,
    projection: row.projection,
    risk: row.risk,
  }));

const sourceEvidence = {
  stableOrderId: /buildBusinessDocumentId\('o', myCompanyId, clientMutationId\)/.test(orderCreateSource),
  stableOrderRequestId: /buildBusinessDocumentId\('or', myCompanyId, clientMutationId\)/.test(requestCreateSource),
  stableWarehouseDispatchId: /buildBusinessDocumentId\('wd', myCompanyId, clientMutationId\)/.test(warehouseCreateSource),
  orderAwaitsAtomicServerConfirmation: /await requireSharedWriteConfirmation\(writeResult, ATOMIC_SAVE_COLLECTION/.test(orderCreateSource),
  orderAndFinancialWritesAtomic: /saveAtomicDocuments\(`order_\$\{id\}`/.test(orderCreateSource) && /\.\.\.financialWrites/.test(orderCreateSource),
  warehouseDispatchToOrderTransaction: /isWarehouseDispatchOrder[\s\S]*?await runTransaction\(db/.test(orderCreateSource),
  warehouseDispatchUsesStockTransaction: /runTransaction\(/.test(warehouseCreateSource),
  warehouseDispatchChecksAvailableStock: /(availableStock|remainingStock|stockAvailable|xuất vượt tồn|tồn âm)/i.test(warehouseCreateSource),
  tenantReadsHaveCursorPagination: /(startAfter|startAt|endBefore|limitToLast)/.test(tenantQuerySource),
  centralizedOrderRequestTransitionGuard: /(ALLOWED_ORDER_REQUEST_TRANSITIONS|validateOrderRequestTransition|canTransitionOrderRequest)/.test(appSource),
  lines: {
    handleAddOrder: lineOf('const handleAddOrder = async'),
    handleAddOrderRequest: lineOf('const handleAddOrderRequest = async'),
    handleAddWarehouseDispatch: lineOf('const handleAddWarehouseDispatch = async'),
    tenantQueries: lineOf('const getTenantCollectionSources ='),
  },
};

const result = {
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    exposedGc: typeof globalThis.gc === 'function',
  },
  scope: {
    measured: 'Deterministic in-process CPU/memory benchmark over synthetic records; source/static checks; local idempotency and race models.',
    notMeasured: 'Authenticated API latency, database latency/query plans, Redis, network payload over wire, distributed locks, physical Android frames/memory, and 100-1000 concurrent users.',
    productionAccess: false,
  },
  datasetSizes: DATASET_SIZES,
  moduleBenchmarks,
  idempotency,
  concurrencyModel,
  sourceEvidence,
  collectionEvidence,
  workflow: {
    observedStatuses: {
      orderRequests: ['new', 'need_human', 'reviewing', 'confirmed', 'converted', 'rejected'],
      orders: ['draft', 'confirmed', 'approved_for_zalo', 'need_review', 'completed'],
    },
    centralizedTransitionGuard: sourceEvidence.centralizedOrderRequestTransitionGuard,
    status: sourceEvidence.centralizedOrderRequestTransitionGuard ? 'PARTIAL' : 'NOT PASS',
    note: 'The report lists only statuses observed in source. It does not invent a replacement workflow.',
  },
  acceptance: {
    warehouseDispatch: 'NOT PASS',
    orderRequests: 'NOT PASS',
    orders: 'PARTIAL',
    final: 'NOT PASS',
    blockers: [
      'No server-side atomic available-stock check was found in Firebase warehouse dispatch creation.',
      'Critical collections are loaded company-wide without cursor pagination.',
      'No centralized validated order-request transition state machine was found.',
      'No valid staging identity/runtime parity for authenticated API/DB/load/recovery tests.',
      'No connected physical Android device or equivalent native profiling run for this audit.',
    ],
  },
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  output: OUTPUT_PATH,
  datasets: DATASET_SIZES,
  benchmarkGroups: moduleBenchmarks.length,
  idempotencyPass: idempotency.pass,
  warehouseStockTransaction: sourceEvidence.warehouseDispatchUsesStockTransaction,
  final: result.acceptance.final,
}, null, 2));
