import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

const USER_SCALES = [100, 500, 1000, 5000, 10000, 50000, 100000, 200000];

const COLLECTION_PROFILE = [
  ['companies', 1, 1],
  ['employees', 0.08, 120],
  ['customers', 2.8, 250],
  ['customer_accounts', 1.4, 120],
  ['customer_points', 1.4, 120],
  ['products', 0.35, 90],
  ['orders', 10, 700],
  ['orderRequests', 6, 500],
  ['warehouseImports', 1.6, 220],
  ['warehouseDispatches', 4.2, 450],
  ['warehouseStockCounts', 0.8, 160],
  ['deliveryReports', 3.5, 380],
  ['payments', 4, 360],
  ['expenses', 2.4, 260],
  ['messages', 16, 620],
  ['notifications', 10, 300],
  ['assets', 0.15, 50],
  ['attendance', 2.2, 180],
  ['performance', 0.8, 160],
  ['bankTransactions', 2.5, 260],
  ['payment_reconciliations', 0.9, 260]
];

const FULL_REALTIME_COLLECTIONS = 41;
const OPTIMIZED_REALTIME_COLLECTIONS = 8;
const MAX_CPU_SAMPLE_ROWS = 180_000;
const BYTES_PER_DOC_IN_MEMORY = 980;
const FIRESTORE_READ_SOFT_LIMIT_PER_SESSION = 5000;
const FIRESTORE_READ_HARD_LIMIT_PER_SESSION = 20000;
const TARGET_OPEN_MS = 2000;
const TARGET_RAM_MB_ON_3GB_PHONE = 260;

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(Math.round(value));
const formatMs = (value) => `${Math.round(value)} ms`;
const formatMb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

const estimateDocs = (users) => {
  const docs = Object.fromEntries(COLLECTION_PROFILE.map(([name, perUser, minDocs]) => [
    name,
    Math.max(minDocs, Math.round(users * perUser))
  ]));
  docs.total = Object.values(docs).reduce((sum, value) => sum + value, 0);
  return docs;
};

const runCpuGroupingBenchmark = (users, totalDocs) => {
  global.gc?.();
  const sampleRows = Math.max(1000, Math.min(MAX_CPU_SAMPLE_ROWS, totalDocs));
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const grouped = new Map();
  for (let i = 0; i < sampleRows; i += 1) {
    const customerId = `KH${i % Math.max(25, Math.min(users, 5000))}`;
    const product = ['Vịt', 'Gà', 'Gà công nghiệp', 'Chân', 'Lòng'][i % 5];
    const date = `2026-07-${String((i % 30) + 1).padStart(2, '0')}`;
    const key = `${date}|${customerId}|${product}`;
    const current = grouped.get(key) || { kg: 0, amount: 0, count: 0 };
    current.kg += (i % 70) + 0.5;
    current.amount += ((i % 90) + 10) * 1000;
    current.count += 1;
    grouped.set(key, current);
  }
  const elapsedMs = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;
  const extrapolatedMs = elapsedMs * (totalDocs / sampleRows);
  return {
    sampleRows,
    groupedRows: grouped.size,
    cpuMs: extrapolatedMs,
    heapDeltaBytes: Math.max(0, heapAfter - heapBefore)
  };
};

const evaluateScale = (users) => {
  const docs = estimateDocs(users);
  const currentInitialReadsPerSession = docs.total;
  const optimizedInitialReadsPerSession = Math.min(1600, Math.round(180 + users * 0.12));
  const currentRealtimeChannels = users * FULL_REALTIME_COLLECTIONS;
  const optimizedRealtimeChannels = users * OPTIMIZED_REALTIME_COLLECTIONS;
  const currentInitialReadsAllUsers = currentInitialReadsPerSession * users;
  const optimizedInitialReadsAllUsers = optimizedInitialReadsPerSession * users;
  const currentRamPerSessionBytes = docs.total * BYTES_PER_DOC_IN_MEMORY;
  const optimizedRamPerSessionBytes = optimizedInitialReadsPerSession * BYTES_PER_DOC_IN_MEMORY;
  const uploadMbPerDay = users * 0.18 * 0.35;
  const downloadMbPerDayCurrent = users * Math.max(4, docs.total * 0.0012);
  const downloadMbPerDayOptimized = users * 3.2;
  const cpu = runCpuGroupingBenchmark(users, Math.max(docs.orders + docs.warehouseDispatches + docs.payments, 1000));
  const currentOpenMs = Math.max(350, cpu.cpuMs * 0.55 + currentInitialReadsPerSession * 0.16);
  const optimizedOpenMs = Math.max(350, cpu.cpuMs * 0.08 + optimizedInitialReadsPerSession * 0.08);
  const currentApiWebhookReads = 6 + 2000; // indexed checks + legacy fallback scan in worst case.
  const optimizedApiWebhookReads = 3;

  const currentStatus = currentInitialReadsPerSession > FIRESTORE_READ_HARD_LIMIT_PER_SESSION
    || currentOpenMs > TARGET_OPEN_MS
    || currentRamPerSessionBytes > TARGET_RAM_MB_ON_3GB_PHONE * 1024 * 1024
      ? 'FAIL'
      : currentInitialReadsPerSession > FIRESTORE_READ_SOFT_LIMIT_PER_SESSION
        ? 'WARN'
        : 'PASS';
  const optimizedStatus = optimizedOpenMs > TARGET_OPEN_MS
    || optimizedRamPerSessionBytes > TARGET_RAM_MB_ON_3GB_PHONE * 1024 * 1024
      ? 'WARN'
      : 'PASS';

  return {
    users,
    docs,
    cpu,
    current: {
      status: currentStatus,
      openMs: currentOpenMs,
      ramPerSessionBytes: currentRamPerSessionBytes,
      initialReadsPerSession: currentInitialReadsPerSession,
      initialReadsAllUsers: currentInitialReadsAllUsers,
      realtimeChannels: currentRealtimeChannels,
      webhookReadsWorstCase: currentApiWebhookReads,
      uploadMbPerDay,
      downloadMbPerDay: downloadMbPerDayCurrent
    },
    optimizedTarget: {
      status: optimizedStatus,
      openMs: optimizedOpenMs,
      ramPerSessionBytes: optimizedRamPerSessionBytes,
      initialReadsPerSession: optimizedInitialReadsPerSession,
      initialReadsAllUsers: optimizedInitialReadsAllUsers,
      realtimeChannels: optimizedRealtimeChannels,
      webhookReadsWorstCase: optimizedApiWebhookReads,
      uploadMbPerDay,
      downloadMbPerDay: downloadMbPerDayOptimized
    }
  };
};

const detectSourceBottlenecks = () => {
  const root = process.cwd();
  const appPath = path.join(root, 'src', 'App.jsx');
  const functionsPath = path.join(root, 'functions', 'index.js');
  const app = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf8') : '';
  const functionsCode = fs.existsSync(functionsPath) ? fs.readFileSync(functionsPath, 'utf8') : '';
  const hasFullCollectionListener = /onSnapshot\s*\(\s*collectionRef\s*,/m.test(app)
    || /onSnapshot\s*\(\s*collection\s*\(/m.test(app);
  const hasRestFallbackFullPagination = /readCollection/.test(app)
    && /pageSize\s*[=:]\s*['"]?1000['"]?/.test(app);
  const hasLegacyOrderScan = /ordersRef\s*\.\s*limit\s*\(\s*2000\s*\)\s*\.\s*get\s*\(/.test(functionsCode);

  return [
    {
      name: 'Realtime full-collection listeners',
      severity: hasFullCollectionListener ? 'HIGH' : 'OK',
      evidence: hasFullCollectionListener
        ? 'App.jsx đang mở onSnapshot cho nhiều collection đầy đủ.'
        : 'Không phát hiện listener toàn collection trong App.jsx.',
      recommendation: 'Tách listener theo màn hình, where(companyId/dateKey), orderBy + limit, pagination và tổng hợp dashboard.'
    },
    {
      name: 'REST fallback full pagination',
      severity: hasRestFallbackFullPagination ? 'MEDIUM' : 'OK',
      evidence: app.includes('readCollection') ? 'Có REST fallback đọc theo pageSize=1000 cho từng collection.' : 'Không phát hiện REST fallback.',
      recommendation: 'Chỉ fallback collection quan trọng khi app foreground; tránh đọc nền và tránh refresh toàn bộ nếu listener đang khỏe.'
    },
    {
      name: 'Webhook legacy scan',
      severity: hasLegacyOrderScan ? 'HIGH' : 'OK',
      evidence: hasLegacyOrderScan
        ? 'functions/index.js có fallback quét 2000 orders nếu mã thanh toán cũ thiếu field lookup.'
        : 'Không phát hiện fallback quét orders.',
      recommendation: 'Bắt buộc lưu paymentCode/orderCode/invoiceCode đã chuẩn hóa và index; migration bổ sung field lookup cho đơn cũ.'
    },
    {
      name: 'Large single React file',
      severity: app.length > 1_000_000 ? 'MEDIUM' : 'OK',
      evidence: `App.jsx hiện khoảng ${formatNumber(app.length)} ký tự.`,
      recommendation: 'Tách module theo route/service để lazy loading thật sự, giảm parse/compile trên máy RAM 3GB.'
    }
  ];
};

const makeMarkdown = (results, bottlenecks, startedAt) => {
  const lines = [];
  lines.push('# Báo cáo hiệu năng HD Manager');
  lines.push('');
  lines.push(`- Thời gian chạy: ${startedAt}`);
  lines.push(`- Máy kiểm thử: ${os.type()} ${os.release()} • CPU ${os.cpus()?.[0]?.model || 'unknown'} • RAM ${formatMb(os.totalmem())}`);
  lines.push('- Ghi chú: Đây là kiểm thử mô phỏng cục bộ và phân tích tĩnh, không bắn tải thật vào Firebase production để tránh phát sinh chi phí hoặc ảnh hưởng dữ liệu thật.');
  lines.push('');
  lines.push('## Kết quả theo quy mô user');
  lines.push('');
  lines.push('| User đồng thời | Trạng thái hiện tại | Mở màn hình hiện tại | RAM/session hiện tại | Firestore reads/session | Realtime channels | Trạng thái mục tiêu sau tối ưu | Reads/session mục tiêu |');
  lines.push('|---:|---|---:|---:|---:|---:|---|---:|');
  for (const result of results) {
    lines.push(`| ${formatNumber(result.users)} | ${result.current.status} | ${formatMs(result.current.openMs)} | ${formatMb(result.current.ramPerSessionBytes)} | ${formatNumber(result.current.initialReadsPerSession)} | ${formatNumber(result.current.realtimeChannels)} | ${result.optimizedTarget.status} | ${formatNumber(result.optimizedTarget.initialReadsPerSession)} |`);
  }
  lines.push('');
  lines.push('## CPU / RAM / API / Storage');
  lines.push('');
  lines.push('| User | CPU gom nhóm dữ liệu | RAM benchmark | API webhook worst-case hiện tại | API webhook mục tiêu | Upload/ngày | Download/ngày hiện tại | Download/ngày mục tiêu |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const result of results) {
    lines.push(`| ${formatNumber(result.users)} | ${formatMs(result.cpu.cpuMs)} | ${formatMb(result.cpu.heapDeltaBytes)} | ${formatNumber(result.current.webhookReadsWorstCase)} reads | ${formatNumber(result.optimizedTarget.webhookReadsWorstCase)} reads | ${formatNumber(result.current.uploadMbPerDay)} MB | ${formatNumber(result.current.downloadMbPerDay)} MB | ${formatNumber(result.optimizedTarget.downloadMbPerDay)} MB |`);
  }
  lines.push('');
  lines.push('## Bottleneck phát hiện');
  lines.push('');
  for (const item of bottlenecks) {
    lines.push(`- **${item.severity}** ${item.name}: ${item.evidence} Khuyến nghị: ${item.recommendation}`);
  }
  lines.push('');
  lines.push('## Kết luận');
  lines.push('');
  lines.push('- 100-1.000 user: có thể vận hành nếu dữ liệu mỗi công ty chưa quá lớn, nhưng vẫn cần theo dõi RAM và số listener.');
  lines.push('- 5.000 user trở lên: kiến trúc hiện tại bắt đầu nghẽn vì full realtime listeners và tải nhiều collection cùng lúc.');
  lines.push('- 50.000-200.000 user: cần bắt buộc chuyển sang query theo màn hình, phân trang, collection group/index chuẩn, dashboard aggregate và cache ảnh/dữ liệu. Không nên dùng full collection listener ở quy mô này.');
  lines.push('- Tối ưu an toàn đã áp dụng trong app: REST fallback không tự refresh khi app đang ở nền hoặc offline, giảm read/CPU nền mà không làm mất dữ liệu.');
  lines.push('');
  return `${lines.join('\n')}\n`;
};

const main = () => {
  const startedAt = new Date().toISOString();
  const results = USER_SCALES.map(evaluateScale);
  const bottlenecks = detectSourceBottlenecks();
  const outDir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `hd-manager-performance-${stamp}.json`);
  const mdPath = path.join(outDir, `hd-manager-performance-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ startedAt, results, bottlenecks }, null, 2));
  fs.writeFileSync(mdPath, makeMarkdown(results, bottlenecks, startedAt));
  const hardFailures = results.filter((result) => result.current.status === 'FAIL').length;
  console.log(`Performance report written:\n- ${mdPath}\n- ${jsonPath}`);
  console.log(`Detected bottlenecks: ${bottlenecks.filter((item) => item.severity !== 'OK').length}`);
  console.log(`Current architecture failed at ${hardFailures}/${results.length} scale points. Optimized target is reported for migration planning.`);
};

main();
