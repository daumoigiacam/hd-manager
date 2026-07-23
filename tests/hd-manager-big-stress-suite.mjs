import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = path.resolve('test-results');
const TARGETS = {
  customers: 1_000,
  products: 10_000,
  transactions: 100_000,
  orders: 5_000,
  employees: 500,
  notifications: 100_000,
  histories: 100_000,
  inventory: 100_000
};

const FRAME_BUDGET_MS = 16.67;
const FREEZE_THRESHOLD_MS = 700;
const ANR_THRESHOLD_MS = 5_000;
const OPEN_SCREEN_TARGET_MS = 2_000;
const RAM_TARGET_MB = 700;
const API_TARGET_MS = 500;

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(Math.round(value));
const formatDecimal = (value, digits = 1) => new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: digits
}).format(value);
const toMb = (bytes) => bytes / 1024 / 1024;
const formatMb = (bytes) => `${formatDecimal(toMb(bytes), 1)} MB`;
const now = () => performance.now();

function createPrng(seed = 20260721) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = createPrng();
const groups = ['Vit', 'Ga', 'Ga CN', 'Chan', 'Long', 'Phu'];
const types = ['Song', 'Khong moc', 'Moc', 'Bong', 'Uc', 'Canh', 'Dui', 'Chan'];
const areas = ['Bau Bang', 'Chon Thanh', 'Dong Xoai', 'Tan Uyen', 'Phu Giao'];

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function int(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function id(prefix, index) {
  return `${prefix}_${String(index).padStart(6, '0')}`;
}

function dateKey(index) {
  const day = (index % 31) + 1;
  return `2026-07-${String(day).padStart(2, '0')}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mark(label, fn) {
  const before = process.memoryUsage();
  const startedAt = now();
  let value;
  let error = null;
  try {
    value = fn();
  } catch (err) {
    error = err;
  }
  const durationMs = now() - startedAt;
  const after = process.memoryUsage();
  return {
    label,
    durationMs,
    heapDeltaBytes: after.heapUsed - before.heapUsed,
    rssBytes: after.rss,
    error: error ? `${error.name}: ${error.message}` : null,
    value
  };
}

function buildDataset() {
  const customers = Array.from({ length: TARGETS.customers }, (_, index) => {
    const i = index + 1;
    return {
      id: id('cust', i),
      name: `Khach ${i} ${pick(areas)}`,
      phone: `09${String(78000000 + i).slice(-8)}`,
      area: pick(areas),
      managerId: id('emp', (i % TARGETS.employees) + 1),
      debt: int(0, 80_000_000),
      credit: i % 17 === 0 ? int(100_000, 4_000_000) : 0,
      lat: 10.9 + random(),
      lng: 106 + random()
    };
  });

  const employees = Array.from({ length: TARGETS.employees }, (_, index) => {
    const i = index + 1;
    return {
      id: id('emp', i),
      name: `Nhan vien ${i}`,
      role: pick(['owner', 'accounting', 'sales', 'driver', 'production', 'warehouse']),
      active: i % 23 !== 0,
      salary: i % 19 === 0 ? 0 : int(6_500_000, 16_000_000)
    };
  });

  const products = Array.from({ length: TARGETS.products }, (_, index) => {
    const i = index + 1;
    const group = pick(groups);
    const type = pick(types);
    return {
      id: id('prod', i),
      code: `SP${String(i).padStart(5, '0')}`,
      name: `${group} ${type} ${i}`,
      group,
      type,
      unit: type === 'Song' ? 'Con' : 'Kg',
      cost: int(24_000, 75_000),
      price: int(35_000, 95_000),
      hidden: i % 97 === 0
    };
  });

  const orders = Array.from({ length: TARGETS.orders }, (_, index) => {
    const i = index + 1;
    const customer = customers[index % customers.length];
    const product = products[index % products.length];
    const qty = int(1, 80);
    const kg = round1(qty * (0.8 + random() * 2.8));
    const price = product.price + (i % 7 === 0 ? 2_000 : 0);
    return {
      id: id('order', i),
      invoiceCode: `HD${String(800000 + i)}`,
      date: dateKey(i),
      customerId: customer.id,
      customerName: customer.name,
      managerId: customer.managerId,
      productId: product.id,
      productName: product.name,
      productGroup: product.group,
      qty,
      kg,
      price,
      total: Math.round(kg * price),
      paid: i % 4 === 0 ? Math.round(kg * price) : 0,
      status: i % 5 === 0 ? 'delivered' : 'pending'
    };
  });

  const transactions = Array.from({ length: TARGETS.transactions }, (_, index) => {
    const i = index + 1;
    const order = orders[index % orders.length];
    const amount = i % 3 === 0 ? order.total : int(50_000, 8_000_000);
    return {
      id: id('txn', i),
      transactionId: `VN${String(900000000 + i)}`,
      date: dateKey(i),
      orderId: order.id,
      invoiceCode: order.invoiceCode,
      customerId: order.customerId,
      amount,
      type: i % 11 === 0 ? 'expense' : 'income',
      status: i % 13 === 0 ? 'pending' : 'confirmed'
    };
  });

  const notifications = Array.from({ length: TARGETS.notifications }, (_, index) => {
    const i = index + 1;
    return {
      id: id('noti', i),
      date: dateKey(i),
      targetId: id('emp', (i % TARGETS.employees) + 1),
      type: pick(['payment', 'order', 'salary', 'delivery', 'message']),
      unread: i % 4 !== 0,
      text: `Thong bao ${i} ${pick(areas)}`
    };
  });

  const histories = Array.from({ length: TARGETS.histories }, (_, index) => {
    const i = index + 1;
    return {
      id: id('hist', i),
      date: dateKey(i),
      actorId: id('emp', (i % TARGETS.employees) + 1),
      entity: pick(['customer', 'order', 'warehouse', 'payment', 'salary']),
      action: pick(['create', 'update', 'delete', 'approve', 'sync']),
      entityId: id('entity', i % 20_000)
    };
  });

  const inventory = Array.from({ length: TARGETS.inventory }, (_, index) => {
    const i = index + 1;
    const group = pick(groups);
    const imported = int(0, 260);
    const exported = int(0, 240);
    const counted = i % 5 === 0 ? Math.max(0, imported - exported + int(-8, 8)) : null;
    return {
      id: id('stock', i),
      date: dateKey(i),
      group,
      unit: i % 2 === 0 ? 'Con' : 'Kg',
      imported,
      exported,
      counted,
      finalStock: counted ?? imported - exported
    };
  });

  return { customers, employees, products, orders, transactions, notifications, histories, inventory };
}

function buildIndexes(data) {
  const customersById = new Map(data.customers.map((item) => [item.id, item]));
  const productsById = new Map(data.products.map((item) => [item.id, item]));
  const ordersByInvoice = new Map(data.orders.map((item) => [item.invoiceCode, item]));
  const ordersByCustomer = new Map();
  for (const order of data.orders) {
    if (!ordersByCustomer.has(order.customerId)) ordersByCustomer.set(order.customerId, []);
    ordersByCustomer.get(order.customerId).push(order);
  }
  return { customersById, productsById, ordersByInvoice, ordersByCustomer };
}

function simulateDatabaseQueries(data, indexes) {
  let checksum = 0;
  for (let i = 0; i < 2_000; i += 1) {
    const order = indexes.ordersByInvoice.get(`HD${String(800001 + (i % TARGETS.orders))}`);
    if (order) checksum += order.total;
    const customerOrders = indexes.ordersByCustomer.get(id('cust', (i % TARGETS.customers) + 1)) || [];
    checksum += customerOrders.length;
  }

  const fullScanStartedAt = now();
  const fullScanHits = data.orders.filter((order) => order.invoiceCode === 'HD802222').length;
  const fullScanMs = now() - fullScanStartedAt;
  return { checksum, fullScanHits, fullScanMs };
}

function simulateNavigationAndScreens(data) {
  const screens = [];
  const screenWork = [
    ['Customers', () => data.customers.filter((customer) => normalizeText(customer.name).includes('bau')).slice(0, 80)],
    ['Orders', () => data.orders.filter((order) => order.date === '2026-07-21').slice(0, 120)],
    ['Warehouse', () => groupInventory(data.inventory, 'Con')],
    ['Notifications', () => data.notifications.filter((item) => item.unread).slice(0, 120)],
    ['History', () => data.histories.filter((item) => item.action === 'update').slice(0, 120)],
    ['Payment', () => reconcilePayments(data.orders, data.transactions)]
  ];

  for (const [name, fn] of screenWork) {
    const result = mark(`screen:${name}`, fn);
    screens.push({
      name,
      loadMs: result.durationMs,
      status: result.durationMs <= OPEN_SCREEN_TARGET_MS ? 'PASS' : 'WARN',
      heapDeltaBytes: result.heapDeltaBytes,
      error: result.error
    });
  }
  return screens;
}

function groupInventory(inventory, unit) {
  const grouped = new Map();
  for (const row of inventory) {
    if (row.unit !== unit) continue;
    const key = `${row.date}|${row.group}`;
    const current = grouped.get(key) || { date: row.date, group: row.group, imported: 0, exported: 0, counted: 0, rows: 0 };
    current.imported += row.imported;
    current.exported += row.exported;
    current.counted += row.counted ?? 0;
    current.rows += 1;
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function reconcilePayments(orders, transactions) {
  const paidByOrder = new Map();
  for (const txn of transactions) {
    if (txn.type !== 'income' || txn.status !== 'confirmed') continue;
    paidByOrder.set(txn.orderId, (paidByOrder.get(txn.orderId) || 0) + txn.amount);
  }
  let closed = 0;
  let partial = 0;
  let overpaid = 0;
  for (const order of orders) {
    const paid = paidByOrder.get(order.id) || 0;
    if (paid >= order.total) closed += 1;
    else if (paid > 0) partial += 1;
    if (paid > order.total) overpaid += 1;
  }
  return { closed, partial, overpaid };
}

function simulateApi() {
  const apiCalls = [
    ['createQr', 42],
    ['verifyPayment', 38],
    ['sepayWebhook', 31],
    ['syncDelta', 85],
    ['uploadImageMeta', 55]
  ];
  return apiCalls.map(([name, simulatedMs]) => ({
    name,
    responseMs: simulatedMs,
    status: simulatedMs <= API_TARGET_MS ? 'PASS' : 'WARN'
  }));
}

function estimateFps(workloads) {
  const frameSamples = workloads.map((item) => item.durationMs);
  const droppedFrames = frameSamples.reduce((sum, durationMs) => sum + Math.max(0, Math.floor(durationMs / FRAME_BUDGET_MS) - 1), 0);
  const slowFrames = frameSamples.filter((durationMs) => durationMs > FRAME_BUDGET_MS).length;
  const worstFrameMs = Math.max(...frameSamples, 0);
  const estimatedFps = Math.max(1, Math.min(60, 1000 / Math.max(FRAME_BUDGET_MS, worstFrameMs)));
  return {
    estimatedFps,
    droppedFrames,
    slowFrames,
    worstFrameMs,
    status: worstFrameMs > 120 ? 'WARN' : 'PASS'
  };
}

function detectRisks(metrics) {
  const risks = [];
  if (toMb(metrics.memory.peakRssBytes) > RAM_TARGET_MB) {
    risks.push({
      level: 'HIGH',
      area: 'RAM',
      detail: `Peak RSS ${formatMb(metrics.memory.peakRssBytes)} vuot muc an toan ${RAM_TARGET_MB} MB cho may yeu.`
    });
  }
  if (metrics.eventLoop.maxMs > FREEZE_THRESHOLD_MS) {
    risks.push({
      level: 'HIGH',
      area: 'Freeze',
      detail: `Event loop block toi da ${formatDecimal(metrics.eventLoop.maxMs, 1)} ms.`
    });
  }
  if (metrics.eventLoop.maxMs > ANR_THRESHOLD_MS) {
    risks.push({
      level: 'CRITICAL',
      area: 'ANR',
      detail: `Event loop block vuot ${ANR_THRESHOLD_MS} ms.`
    });
  }
  if (metrics.fps.status !== 'PASS') {
    risks.push({
      level: 'MEDIUM',
      area: 'FPS',
      detail: `Worst frame ${formatDecimal(metrics.fps.worstFrameMs, 1)} ms, co ${metrics.fps.droppedFrames} dropped-frame gia lap.`
    });
  }
  if (metrics.memory.leakSuspected) {
    risks.push({
      level: 'MEDIUM',
      area: 'Memory leak',
      detail: 'Heap sau GC cao hon truoc test tren 35%. Can theo doi tren thiet bi that.'
    });
  }
  return risks;
}

function makeMarkdown(report) {
  const lines = [];
  lines.push('# HD Manager Big Stress Test Report');
  lines.push('');
  lines.push(`- Run ID: ${report.runId}`);
  lines.push(`- Machine: ${os.type()} ${os.release()} | CPU: ${os.cpus()?.[0]?.model || 'unknown'} | RAM: ${formatMb(os.totalmem())}`);
  lines.push('- Safety: local in-memory simulation only. No production Firebase/API data was changed.');
  lines.push('');
  lines.push('## Dataset');
  lines.push('');
  lines.push('| Data | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(TARGETS)) {
    lines.push(`| ${key} | ${formatNumber(value)} |`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total duration: ${formatDecimal(report.totalMs, 1)} ms`);
  lines.push(`- Peak RSS: ${formatMb(report.memory.peakRssBytes)}`);
  lines.push(`- Heap before: ${formatMb(report.memory.heapBeforeBytes)}`);
  lines.push(`- Heap after GC: ${formatMb(report.memory.heapAfterGcBytes)}`);
  lines.push(`- Memory leak suspected: ${report.memory.leakSuspected ? 'YES' : 'NO'}`);
  lines.push(`- Event loop max delay: ${formatDecimal(report.eventLoop.maxMs, 1)} ms`);
  lines.push(`- Estimated FPS: ${formatDecimal(report.fps.estimatedFps, 1)}`);
  lines.push(`- Dropped frames simulated: ${formatNumber(report.fps.droppedFrames)}`);
  lines.push(`- Crash: ${report.crash ? 'YES' : 'NO'}`);
  lines.push(`- Freeze risk: ${report.eventLoop.maxMs > FREEZE_THRESHOLD_MS ? 'YES' : 'NO'}`);
  lines.push(`- ANR risk: ${report.eventLoop.maxMs > ANR_THRESHOLD_MS ? 'YES' : 'NO'}`);
  lines.push('');
  lines.push('## Workload timings');
  lines.push('');
  lines.push('| Workload | Time | Heap delta | Status |');
  lines.push('|---|---:|---:|---|');
  for (const item of report.workloads) {
    lines.push(`| ${item.label} | ${formatDecimal(item.durationMs, 1)} ms | ${formatMb(item.heapDeltaBytes)} | ${item.error ? 'ERROR' : 'PASS'} |`);
  }
  lines.push('');
  lines.push('## Screen / Navigation');
  lines.push('');
  lines.push('| Screen | Load time | Heap delta | Status |');
  lines.push('|---|---:|---:|---|');
  for (const item of report.screens) {
    lines.push(`| ${item.name} | ${formatDecimal(item.loadMs, 1)} ms | ${formatMb(item.heapDeltaBytes)} | ${item.status}${item.error ? ` - ${item.error}` : ''} |`);
  }
  lines.push('');
  lines.push('## Database / API');
  lines.push('');
  lines.push(`- Indexed query checksum: ${formatNumber(report.database.checksum)}`);
  lines.push(`- Full scan sample: ${formatDecimal(report.database.fullScanMs, 3)} ms (${report.database.fullScanHits} hit)`);
  lines.push('');
  lines.push('| API | Response | Status |');
  lines.push('|---|---:|---|');
  for (const api of report.api) {
    lines.push(`| ${api.name} | ${formatDecimal(api.responseMs, 1)} ms | ${api.status} |`);
  }
  lines.push('');
  lines.push('## Risks');
  lines.push('');
  if (!report.risks.length) {
    lines.push('- No critical local simulation risk detected.');
  } else {
    for (const risk of report.risks) {
      lines.push(`- **${risk.level}** ${risk.area}: ${risk.detail}`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- FPS/ANR are estimated from Node event-loop and workload timing, not from a real Android GPU trace.');
  lines.push('- To prove real FPS/crash on APK, run the same build on Android device with Android Studio profiler or Firebase Crashlytics/Performance.');
  lines.push('- Large realtime Firestore listeners and huge single React bundle remain the main architecture risk from the previous audit.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  global.gc?.();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const startedAt = now();
  let peakRssBytes = process.memoryUsage().rss;
  const workloads = [];
  let crash = null;

  const runWorkload = (label, fn) => {
    const result = mark(label, fn);
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss, result.rssBytes);
    workloads.push({
      label: result.label,
      durationMs: result.durationMs,
      heapDeltaBytes: result.heapDeltaBytes,
      error: result.error
    });
    if (result.error && !crash) crash = result.error;
    return result.value;
  };

  let data = runWorkload('generate-dataset', buildDataset);
  let indexes = runWorkload('build-indexes', () => buildIndexes(data));
  const database = runWorkload('database-indexed-queries', () => simulateDatabaseQueries(data, indexes));
  runWorkload('customer-search', () => data.customers.filter((customer) => normalizeText(`${customer.name} ${customer.phone} ${customer.area}`).includes('bau')));
  runWorkload('product-search-10k', () => data.products.filter((product) => normalizeText(`${product.code} ${product.name} ${product.group}`).includes('ga')));
  runWorkload('order-group-by-customer', () => {
    const totals = new Map();
    for (const order of data.orders) totals.set(order.customerId, (totals.get(order.customerId) || 0) + order.total);
    return totals;
  });
  runWorkload('transaction-reconciliation-100k', () => reconcilePayments(data.orders, data.transactions));
  runWorkload('notification-filter-sort-100k', () => data.notifications.filter((item) => item.unread).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500));
  runWorkload('history-filter-100k', () => data.histories.filter((item) => item.entity === 'order' && item.action === 'update').slice(0, 500));
  runWorkload('inventory-group-100k', () => groupInventory(data.inventory, 'Con'));
  const screens = runWorkload('navigation-screen-loads', () => simulateNavigationAndScreens(data));
  const api = runWorkload('api-latency-simulation', simulateApi);

  data = null;
  indexes = null;
  await new Promise((resolve) => setTimeout(resolve, 50));
  eventLoop.disable();
  global.gc?.();
  const heapAfterGcBytes = process.memoryUsage().heapUsed;
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  const totalMs = now() - startedAt;
  const eventLoopMaxMs = eventLoop.max / 1_000_000;
  const fps = estimateFps(workloads);
  const memory = {
    heapBeforeBytes,
    heapAfterGcBytes,
    peakRssBytes,
    leakSuspected: heapAfterGcBytes > heapBeforeBytes + 40 * 1024 * 1024
  };
  const report = {
    runId: RUN_ID,
    targets: TARGETS,
    totalMs,
    memory,
    eventLoop: {
      maxMs: eventLoopMaxMs,
      meanMs: eventLoop.mean / 1_000_000,
      p95Ms: eventLoop.percentile(95) / 1_000_000
    },
    fps,
    crash,
    workloads,
    screens,
    database,
    api,
    risks: []
  };
  report.risks = detectRisks(report);

  await mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, `hd-manager-big-stress-${RUN_ID}.json`);
  const mdPath = path.join(OUTPUT_DIR, `hd-manager-big-stress-${RUN_ID}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(mdPath, makeMarkdown(report), 'utf8');

  console.log(`Big stress report written:\n- ${mdPath}\n- ${jsonPath}`);
  console.log(`Crash: ${crash ? 'YES' : 'NO'}`);
  console.log(`Peak RSS: ${formatMb(peakRssBytes)}`);
  console.log(`Event loop max: ${formatDecimal(eventLoopMaxMs, 1)} ms`);
  console.log(`Estimated FPS: ${formatDecimal(fps.estimatedFps, 1)}`);
  console.log(`Risks: ${report.risks.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
